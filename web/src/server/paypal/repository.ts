import "server-only";
import {
  type Attempt,
  type Mandate,
  PaymentError,
  attemptSchema,
  mandateSchema,
  parse,
} from "./domain";

export type AuditEntry = {
  action: string;
  attemptId?: string;
  detail?: string;
};
export type Mutation = {
  mandate: Mandate;
  attempt?: Attempt;
  now: number;
  audit: AuditEntry[];
};
export type Selector =
  | {
      id: string;
      requireUnsentCreate?: boolean;
      requireUnsentCapture?: boolean;
    }
  | { purchaseKey: string };
export type VerifiedEvent = {
  id: string;
  type: string;
  resourceId: string;
  orderId?: string;
  attemptId?: string;
  digest: string;
  state: "PENDING" | "PROCESSED" | "IGNORED" | "RETRY";
  attempts: number;
  nextRetryAt: string;
  errorCode?: string;
};
export interface PaymentRepository {
  insertMandate(mandate: Mandate): Promise<void>;
  mutate<T>(
    mandateId: string,
    selector: Selector | undefined,
    work: (tx: Mutation) => T,
  ): Promise<T>;
  findAttempt(id: string): Promise<Attempt | undefined>;
  findOrder(orderId: string): Promise<Attempt | undefined>;
  findCapture(captureId: string): Promise<Attempt | undefined>;
  recoverable(limit: number): Promise<Attempt[]>;
  saveVerifiedEvent(event: VerifiedEvent): Promise<VerifiedEvent>;
  finishEvent(
    id: string,
    state: "PROCESSED" | "IGNORED" | "RETRY",
    code?: string,
  ): Promise<void>;
  pendingEvents(limit: number): Promise<VerifiedEvent[]>;
}
/** Enforce invariants in mock and PostgreSQL adapters; SQL also constrains durable rows. */
export function validateMutation(before: Mutation, after: Mutation) {
  parse(mandateSchema, after.mandate);
  for (const key of [
    "id",
    "ownerId",
    "agentId",
    "currency",
    "capMinor",
    "perTransactionMinor",
    "expiresAt",
    "merchants",
    "createdAt",
  ] as const)
    if (
      JSON.stringify(before.mandate[key]) !== JSON.stringify(after.mandate[key])
    )
      throw new PaymentError("MANDATE_POLICY_IMMUTABLE");
  if (
    before.mandate.status !== "ACTIVE" &&
    after.mandate.status !== before.mandate.status
  )
    throw new PaymentError("MANDATE_REVOCATION_PERMANENT");
  const old = before.attempt,
    next = after.attempt;
  if (old && !next) throw new PaymentError("ATTEMPT_HISTORY_IMMUTABLE");
  if (next) {
    parse(attemptSchema, next);
    if (
      next.mandateId !== after.mandate.id ||
      next.ownerId !== after.mandate.ownerId ||
      next.agentId !== after.mandate.agentId
    )
      throw new PaymentError("ATTEMPT_BINDING_MISMATCH");
    if (
      (next.state === "SUCCEEDED") !== (next.budgetState === "CONSUMED") ||
      ["FAILED", "VOIDED", "CANCELLED"].includes(next.state) !==
        (next.budgetState === "RELEASED")
    )
      throw new PaymentError("INVALID_PAYMENT_LIFECYCLE");
  }
  if (old && next) {
    for (const key of [
      "id",
      "mandateId",
      "ownerId",
      "agentId",
      "merchantId",
      "amountMinor",
      "currency",
      "purchaseKey",
      "fingerprint",
      "createRequestId",
      "captureRequestId",
      "createdAt",
    ] as const)
      if (old[key] !== next[key])
        throw new PaymentError("PAYMENT_TERMS_IMMUTABLE");
    if (
      (old.orderId && old.orderId !== next.orderId) ||
      (old.captureId && old.captureId !== next.captureId)
    )
      throw new PaymentError("PAYPAL_REFERENCE_IMMUTABLE");
    if (old.budgetState !== "RESERVED" && next.budgetState !== old.budgetState)
      throw new PaymentError("BUDGET_RESOLUTION_PERMANENT");
    if (
      ["SUCCEEDED", "FAILED", "VOIDED", "CANCELLED"].includes(old.state) &&
      next.state !== old.state
    )
      throw new PaymentError("PAYMENT_TERMINAL_STATE_IMMUTABLE");
    if (
      ["CAPTURING", "CAPTURE_UNCERTAIN", "PENDING"].includes(old.state) &&
      [
        "RESERVED",
        "CREATING",
        "CREATE_UNCERTAIN",
        "AWAITING_APPROVAL",
        "APPROVED",
      ].includes(next.state)
    )
      throw new PaymentError("CAPTURE_REPLAY_FORBIDDEN");
  }
  const reserved = (a?: Attempt) =>
    a?.budgetState === "RESERVED" ? BigInt(a.amountMinor) : 0n;
  const consumed = (a?: Attempt) =>
    a?.budgetState === "CONSUMED" ? BigInt(a.amountMinor) : 0n;
  if (
    BigInt(after.mandate.reservedMinor) !==
      BigInt(before.mandate.reservedMinor) + reserved(next) - reserved(old) ||
    BigInt(after.mandate.consumedMinor) !==
      BigInt(before.mandate.consumedMinor) + consumed(next) - consumed(old) ||
    BigInt(after.mandate.reservedMinor) + BigInt(after.mandate.consumedMinor) >
      BigInt(after.mandate.capMinor)
  )
    throw new PaymentError("BUDGET_LEDGER_MISMATCH");
}
export function resolveBudget(
  tx: Mutation,
  budgetState: "CONSUMED" | "RELEASED",
) {
  const a = tx.attempt;
  if (a?.budgetState !== "RESERVED") return;
  tx.mandate.reservedMinor = (
    BigInt(tx.mandate.reservedMinor) - BigInt(a.amountMinor)
  ).toString();
  if (budgetState === "CONSUMED")
    tx.mandate.consumedMinor = (
      BigInt(tx.mandate.consumedMinor) + BigInt(a.amountMinor)
    ).toString();
  a.budgetState = budgetState;
}
