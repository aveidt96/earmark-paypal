import "server-only";
import { paypalMerchantSchema, parse, PaymentError } from "./domain";

export const SANDBOX_BASE_URL = "https://api-m.sandbox.paypal.com";
export type PayPalOAuthSettings = {
  baseUrl: typeof SANDBOX_BASE_URL;
  clientId: string;
  clientSecret: string;
  timeoutMs: number;
  maxRetries: number;
};
export type OrderOnlyPermission = {
  mandateId: string;
  attemptId: string;
  ownerId: string;
  merchantId: string;
  createRequestId: string;
  /** Explicit server-owned scope; omission preserves the original US campaign key. */
  purchaseKey?: string;
};
export type PayPalCheckoutSettings = PayPalOAuthSettings & {
  merchantId: string;
  paymentsEnabled: boolean;
  returnUrl?: string;
  cancelUrl?: string;
  credentialSellerOnly?: boolean;
  orderOnlyPermission?: OrderOnlyPermission;
  captureOnlyPermission?: CaptureOnlyPermission;
};
export type CaptureOnlyPermission = {
  mandateId: string;
  attemptId: string;
  ownerId: string;
  merchantId: string;
  orderId: string;
  captureRequestId: string;
};
export type PayPalSettings = PayPalCheckoutSettings & { webhookId: string };
export function sandboxFlags(env: Record<string, string | undefined>) {
  if (env.PAYPAL_ENVIRONMENT && env.PAYPAL_ENVIRONMENT !== "sandbox")
    throw new PaymentError("PAYPAL_SANDBOX_ONLY");
  if (
    env.PAYPAL_BASE_URL &&
    ![SANDBOX_BASE_URL, `${SANDBOX_BASE_URL}/`].includes(env.PAYPAL_BASE_URL)
  )
    throw new PaymentError("PAYPAL_SANDBOX_ONLY");
  for (const name of ["PAYPAL_BACKEND_ENABLED", "PAYPAL_PAYMENTS_ENABLED"])
    if (env[name] && !["true", "false"].includes(env[name]))
      throw new PaymentError("INVALID_PAYPAL_CONFIGURATION");
  return {
    backendEnabled: env.PAYPAL_BACKEND_ENABLED === "true",
    paymentsEnabled: env.PAYPAL_PAYMENTS_ENABLED === "true",
  };
}
export function paypalSettings(
  env: Record<string, string | undefined> = process.env,
): PayPalSettings {
  if (!sandboxFlags(env).backendEnabled)
    throw new PaymentError("PAYPAL_BACKEND_DISABLED");
  if (!env.PAYPAL_WEBHOOK_ID || !/^[A-Z0-9]{1,50}$/.test(env.PAYPAL_WEBHOOK_ID))
    throw new PaymentError("PAYPAL_CREDENTIALS_REQUIRED");
  return {
    ...paypalCheckoutSettings(env),
    webhookId: env.PAYPAL_WEBHOOK_ID,
  };
}

/** Manual approved checkout does not fabricate a webhook subscription. */
export function paypalCheckoutSettings(
  env: Record<string, string | undefined> = process.env,
): PayPalCheckoutSettings {
  const flags = sandboxFlags(env);
  if (!flags.backendEnabled) throw new PaymentError("PAYPAL_BACKEND_DISABLED");
  return {
    ...paypalOAuthSettings(env),
    merchantId: parse(paypalMerchantSchema, env.PAYPAL_MERCHANT_ID),
    paymentsEnabled: flags.paymentsEnabled,
  };
}

/** OAuth proves app authentication only; it needs no seller/webhook ID or payment opt-in. */
export function paypalOAuthSettings(
  env: Record<string, string | undefined> = process.env,
): PayPalOAuthSettings {
  sandboxFlags(env);
  if (!env.PAYPAL_CLIENT_ID?.trim() || !env.PAYPAL_CLIENT_SECRET?.trim())
    throw new PaymentError("PAYPAL_CREDENTIALS_REQUIRED");
  return {
    baseUrl: SANDBOX_BASE_URL,
    clientId: env.PAYPAL_CLIENT_ID,
    clientSecret: env.PAYPAL_CLIENT_SECRET,
    timeoutMs: 10000,
    maxRetries: 2,
  };
}
