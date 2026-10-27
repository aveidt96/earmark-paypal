import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";

export class PaymentError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
export const currencies = ["USD", "EUR", "GBP", "CAD", "AUD", "JPY"] as const;
export const currencySchema = z.enum(currencies);
export const minorSchema = z.string().regex(/^[1-9][0-9]{0,17}$/);
const counterSchema = z.string().regex(/^(0|[1-9][0-9]{0,17})$/);
export const identitySchema = z.string().regex(/^[a-zA-Z0-9:_-]{1,120}$/);
// Policy uses opaque merchant identities; the PayPal adapter validates its account-ID format.
export const merchantSchema = identitySchema;
export const paypalMerchantSchema = z.string().regex(/^[2-9A-HJ-NP-Z]{13}$/);
export const externalIdSchema = z.string().regex(/^[A-Z0-9]{1,36}$/);
export const principalSchema = z.strictObject({
  ownerId: identitySchema,
  subjectId: identitySchema,
  role: z.enum(["owner", "agent"]),
});
/** Trusted caller context comes from a server authentication adapter, never model JSON. */
export type Principal = z.infer<typeof principalSchema>;
export const mandateInputSchema = z.strictObject({
  agentId: identitySchema,
  currency: currencySchema,
  capMinor: minorSchema,
  perTransactionMinor: minorSchema,
  expiresAt: z.iso.datetime(),
  merchants: z.array(merchantSchema).min(1).max(100),
});
export const mandateSchema = mandateInputSchema.extend({
  id: z.uuid(),
  ownerId: identitySchema,
  status: z.enum(["ACTIVE", "REVOKED", "CLOSED"]),
  reservedMinor: counterSchema,
  consumedMinor: counterSchema,
  createdAt: z.iso.datetime(),
});
export type Mandate = z.infer<typeof mandateSchema>;
export const paymentInputSchema = z.strictObject({
  mandateId: z.uuid(),
  purchaseKey: identitySchema,
  merchantId: merchantSchema,
  amountMinor: minorSchema,
  currency: currencySchema,
});
export type PaymentInput = z.infer<typeof paymentInputSchema>;
export const attemptSchema = paymentInputSchema.extend({
  id: z.uuid(),
  ownerId: identitySchema,
  agentId: identitySchema,
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  state: z.enum([
    "RESERVED",
    "CREATING",
    "CREATE_UNCERTAIN",
    "AWAITING_APPROVAL",
    "APPROVED",
    "CAPTURING",
    "CAPTURE_UNCERTAIN",
    "PENDING",
    "SUCCEEDED",
    "FAILED",
    "VOIDED",
    "CANCELLED",
    "REVIEW_REQUIRED",
  ]),
  budgetState: z.enum(["RESERVED", "CONSUMED", "RELEASED"]),
  createRequestId: z.uuid(),
  captureRequestId: z.uuid(),
  orderId: externalIdSchema.optional(),
  captureId: externalIdSchema.optional(),
  approvalUrl: z.string().url().max(2048).optional(),
  lastRemoteState: z
    .string()
    .regex(/^[A-Z_]+$/)
    .optional(),
  errorCode: z
    .string()
    .regex(/^[A-Z0-9_]+$/)
    .optional(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Attempt = z.infer<typeof attemptSchema>;
export type Currency = z.infer<typeof currencySchema>;
export function parse<T>(schema: z.ZodType<T>, raw: unknown): T {
  const result = schema.safeParse(raw);
  if (!result.success) throw new PaymentError("INVALID_PAYMENT_INPUT");
  return result.data;
}
export function fingerprint(input: PaymentInput): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        input.mandateId,
        input.purchaseKey,
        input.merchantId,
        input.amountMinor,
        input.currency,
      ]),
    )
    .digest("hex");
}
export function toDecimal(minor: string, currency: Currency): string {
  parse(minorSchema, minor);
  if (currency === "JPY") return minor;
  const padded = minor.padStart(3, "0");
  return `${padded.slice(0, -2)}.${padded.slice(-2)}`;
}
export function fromDecimal(value: string, currency: Currency): string {
  const pattern =
    currency === "JPY"
      ? /^(0|[1-9][0-9]{0,17})$/
      : /^(0|[1-9][0-9]{0,17})(\.[0-9]{1,2})?$/;
  if (!pattern.test(value)) throw new PaymentError("INVALID_PROVIDER_AMOUNT");
  const [whole = "", fraction = ""] = value.split(".");
  const minor =
    currency === "JPY"
      ? BigInt(whole)
      : BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  return parse(minorSchema, minor.toString());
}
export function newAttempt(
  input: PaymentInput,
  m: Mandate,
  now: number,
): Attempt {
  const timestamp = new Date(now).toISOString();
  return {
    ...input,
    id: randomUUID(),
    ownerId: m.ownerId,
    agentId: m.agentId,
    fingerprint: fingerprint(input),
    state: "RESERVED",
    budgetState: "RESERVED",
    createRequestId: randomUUID(),
    captureRequestId: randomUUID(),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}
