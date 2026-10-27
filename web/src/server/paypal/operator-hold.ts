import "server-only";
import type { Attempt, Mandate, Principal } from "./domain";
import { PaymentError } from "./domain";
import { requireOwner } from "./policy";

export const ORIGINAL_MANDATE_ID = "8fb8ada6-ad12-5bc8-ac4c-90e6a07ed064";
export const ORIGINAL_ORDER_ID = "9N317079B4816951W";
/** Audit-only intervention. This is not cancellation or proof of non-capture. */
export function originalReservationHold(
  actor: Principal,
  mandate: Mandate,
  attempt: Attempt,
) {
  requireOwner(actor, mandate.ownerId);
  if (
    mandate.id !== ORIGINAL_MANDATE_ID ||
    attempt.mandateId !== mandate.id ||
    attempt.ownerId !== mandate.ownerId ||
    attempt.orderId !== ORIGINAL_ORDER_ID ||
    attempt.budgetState !== "RESERVED" ||
    !mandate.merchants.includes(attempt.merchantId)
  )
    throw new PaymentError("ORIGINAL_UNRESOLVED_RESERVATION_REQUIRED");
  return {
    action: "OPERATOR_RESERVATION_HELD",
    attemptId: attempt.id,
    detail: JSON.stringify({
      version: 1,
      decision: "RETAIN_UNRESOLVED_OBLIGATION",
      source: "TASK_03D_AUTHENTICATED_OWNER",
      reference: "task-03d-original-order-unresolved",
      merchantId: attempt.merchantId,
      orderId: attempt.orderId,
      amountMinor: attempt.amountMinor,
      currency: attempt.currency,
      reason: "GET_404_IS_NOT_NON_CAPTURE_EVIDENCE",
      releaseAuthorized: false,
    }),
  };
}
