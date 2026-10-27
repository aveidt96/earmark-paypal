import "server-only";
import type { Attempt } from "./domain";
import { PaymentError } from "./domain";
import type { CaptureOnlyPermission } from "./config";
import type { TestCheckoutConfig } from "./test-config";
import { US_MANDATE_ID, US_ATTEMPT_ID, US_PURCHASE_KEY } from "./us-order";

export const US_ORDER_ID = "72936380818559054";
export function assertCaptureScope(a: Attempt, scope: CaptureOnlyPermission) {
  if (
    a.id !== scope.attemptId ||
    a.mandateId !== scope.mandateId ||
    a.ownerId !== scope.ownerId ||
    a.merchantId !== scope.merchantId ||
    a.orderId !== scope.orderId ||
    a.captureRequestId !== scope.captureRequestId ||
    a.amountMinor !== "600" ||
    a.currency !== "USD" ||
    a.purchaseKey !== US_PURCHASE_KEY
  )
    throw new PaymentError("ONE_SHOT_CAPTURE_SCOPE_MISMATCH");
}
export function usCapturePermission(
  config: TestCheckoutConfig,
  a: Attempt,
): CaptureOnlyPermission {
  if (
    config.campaign !== "us-v1" ||
    !config.usCaptureOnce ||
    config.usOrderOnce ||
    config.origin !== "http://127.0.0.1:3031"
  )
    throw new PaymentError("US_ONE_SHOT_CAPTURE_NOT_AUTHORIZED");
  const scope: CaptureOnlyPermission = {
    mandateId: US_MANDATE_ID,
    attemptId: US_ATTEMPT_ID,
    orderId: US_ORDER_ID,
    ownerId: config.ownerId,
    merchantId: config.merchantId,
    captureRequestId: a.captureRequestId,
  };
  assertCaptureScope(a, scope);
  return scope;
}
