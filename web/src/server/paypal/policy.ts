import "server-only";
import { randomUUID } from "node:crypto";
import {
  type Attempt,
  type Mandate,
  type PaymentInput,
  type Principal,
  mandateInputSchema,
  parse,
  PaymentError,
  principalSchema,
} from "./domain";

export function requireOwner(actor: Principal, ownerId: string) {
  parse(principalSchema, actor);
  if (
    actor.role !== "owner" ||
    actor.ownerId !== ownerId ||
    actor.subjectId !== ownerId
  )
    throw new PaymentError("MANDATE_OWNER_REQUIRED");
}
export function requireIdentity(actor: Principal, m: Mandate) {
  parse(principalSchema, actor);
  if (actor.ownerId !== m.ownerId)
    throw new PaymentError("MANDATE_OWNERSHIP_MISMATCH");
  if (actor.role === "owner") requireOwner(actor, m.ownerId);
  else if (actor.subjectId !== m.agentId)
    throw new PaymentError("UNAUTHORIZED_AGENT");
}
export function createMandate(
  actor: Principal,
  raw: unknown,
  now: number,
): Mandate {
  requireOwner(actor, actor.ownerId);
  const p = parse(mandateInputSchema, raw);
  if (
    new Set(p.merchants).size !== p.merchants.length ||
    BigInt(p.perTransactionMinor) > BigInt(p.capMinor)
  )
    throw new PaymentError("INVALID_MANDATE_POLICY");
  if (Date.parse(p.expiresAt) <= now) throw new PaymentError("MANDATE_EXPIRED");
  return {
    ...p,
    id: randomUUID(),
    ownerId: actor.ownerId,
    status: "ACTIVE",
    reservedMinor: "0",
    consumedMinor: "0",
    createdAt: new Date(now).toISOString(),
  };
}
/** Run inside the same DB transaction/mandate row lock as the reservation. */
export function authorize(
  actor: Principal,
  m: Mandate,
  input: PaymentInput,
  now: number,
  existing?: Attempt,
) {
  requireIdentity(actor, m);
  if (m.status !== "ACTIVE") throw new PaymentError("MANDATE_INACTIVE");
  if (Date.parse(m.expiresAt) <= now) throw new PaymentError("MANDATE_EXPIRED");
  if (input.mandateId !== m.id)
    throw new PaymentError("MANDATE_BINDING_MISMATCH");
  if (!m.merchants.includes(input.merchantId))
    throw new PaymentError("UNAPPROVED_MERCHANT");
  if (input.currency !== m.currency)
    throw new PaymentError("CURRENCY_MISMATCH");
  const amount = BigInt(input.amountMinor);
  if (amount > BigInt(m.perTransactionMinor))
    throw new PaymentError("TRANSACTION_LIMIT_EXCEEDED");
  if (existing) {
    if (
      existing.budgetState !== "RESERVED" ||
      !["RESERVED", "APPROVED"].includes(existing.state)
    )
      throw new PaymentError("INVALID_PAYMENT_LIFECYCLE");
    if (
      BigInt(m.reservedMinor) < amount ||
      BigInt(m.reservedMinor) + BigInt(m.consumedMinor) > BigInt(m.capMinor)
    )
      throw new PaymentError("BUDGET_LEDGER_MISMATCH");
  } else if (
    BigInt(m.reservedMinor) + BigInt(m.consumedMinor) + amount >
    BigInt(m.capMinor)
  )
    throw new PaymentError("BUDGET_EXHAUSTED");
}
