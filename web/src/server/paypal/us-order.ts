import "server-only";
import type { Attempt } from "./domain";
import { PaymentError } from "./domain";
import type { TestCheckoutConfig } from "./test-config";
import type { OrderOnlyPermission } from "./config";

export const US_MANDATE_ID = "889b9c4a-b875-5de9-a354-18a037d41f52";
export const US_ATTEMPT_ID = "422ae62d-cd25-425f-9fdb-ce50ad6f0ffa";
export const US_PURCHASE_KEY = "paypal-test-us-6usd-v1";
export function assertOrderScope(a: Attempt, scope: OrderOnlyPermission) {
  if (
    a.id !== scope.attemptId ||
    a.mandateId !== scope.mandateId ||
    a.ownerId !== scope.ownerId ||
    a.merchantId !== scope.merchantId ||
    a.createRequestId !== scope.createRequestId ||
    a.amountMinor !== "600" ||
    a.currency !== "USD" ||
    a.purchaseKey !== (scope.purchaseKey ?? US_PURCHASE_KEY)
  )
    throw new PaymentError("ONE_SHOT_ORDER_SCOPE_MISMATCH");
}
export function usOrderPermission(
  config: TestCheckoutConfig,
  a: Attempt,
): OrderOnlyPermission {
  if (
    config.campaign !== "us-v1" ||
    !config.usOrderOnce ||
    config.origin !== "http://127.0.0.1:3031"
  )
    throw new PaymentError("US_ONE_SHOT_ORDER_NOT_AUTHORIZED");
  const scope: OrderOnlyPermission = {
    mandateId: US_MANDATE_ID,
    attemptId: US_ATTEMPT_ID,
    ownerId: config.ownerId,
    merchantId: config.merchantId,
    createRequestId: a.createRequestId,
  };
  assertOrderScope(a, scope);
  return scope;
}
