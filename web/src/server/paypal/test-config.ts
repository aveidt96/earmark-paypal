import "server-only";
import { createHash } from "node:crypto";
import { paypalCheckoutSettings, type PayPalCheckoutSettings } from "./config";
import { identitySchema, parse, PaymentError } from "./domain";

export type TestCheckoutConfig = {
  campaign: "legacy" | "us-v1";
  preparationOnly: boolean;
  usOrderOnce: boolean;
  usCaptureOnce: boolean;
  origin: string;
  ownerId: string;
  agentId: string;
  loginSecret: string;
  sessionSecret: string;
  sessionEpoch: string;
  merchantId: string;
  settings: PayPalCheckoutSettings;
};
export function merchantBinding(clientId: string, merchantId: string) {
  return createHash("sha256")
    .update(JSON.stringify([clientId, merchantId]))
    .digest("hex");
}
export function testCheckoutConfig(
  env: Record<string, string | undefined> = process.env,
): TestCheckoutConfig {
  if (
    env.PAYPAL_TEST_CHECKOUT_ENABLED !== "true" ||
    env.VERCEL ||
    env.AWS_EXECUTION_ENV ||
    env.AWS_LAMBDA_FUNCTION_NAME
  )
    throw new PaymentError("PAYPAL_TEST_CHECKOUT_DISABLED");
  let origin: URL;
  try {
    origin = new URL(env.PAYPAL_TEST_ORIGIN ?? "");
  } catch {
    throw new PaymentError("INVALID_TEST_ORIGIN");
  }
  if (
    !["http:", "https:"].includes(origin.protocol) ||
    !["127.0.0.1", "localhost", "[::1]"].includes(origin.hostname) ||
    origin.username ||
    origin.password ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash
  )
    throw new PaymentError("LOOPBACK_TEST_ORIGIN_REQUIRED");
  const settings = paypalCheckoutSettings(env);
  const campaign = env.PAYPAL_TEST_CAMPAIGN ?? "legacy";
  if (!["legacy", "us-v1"].includes(campaign))
    throw new PaymentError("INVALID_TEST_CAMPAIGN");
  const preparationOnly = campaign === "us-v1";
  const usOrderOnce =
    env.PAYPAL_TEST_US_ORDER_ONCE === "task03e-existing-us-attempt";
  const usCaptureOnce =
    env.PAYPAL_TEST_US_CAPTURE_ONCE === "task03g-existing-approved-order";
  if (env.PAYPAL_TEST_US_CAPTURE_ONCE && !usCaptureOnce)
    throw new PaymentError("INVALID_US_CAPTURE_PERMISSION");
  if (
    usCaptureOnce &&
    (usOrderOnce ||
      !preparationOnly ||
      env.PAYPAL_TEST_US_BUYER_SEPARATE !== "true")
  )
    throw new PaymentError("US_CAPTURE_CONFIRMATION_REQUIRED");
  if (env.PAYPAL_TEST_US_ORDER_ONCE && !usOrderOnce)
    throw new PaymentError("INVALID_US_ONE_SHOT_PERMISSION");
  if (
    usOrderOnce &&
    (!preparationOnly || env.PAYPAL_TEST_US_BUYER_SEPARATE !== "true")
  )
    throw new PaymentError("US_ONE_SHOT_CONFIRMATION_REQUIRED");
  if (
    preparationOnly &&
    (origin.origin !== "http://127.0.0.1:3031" ||
      env.PAYPAL_TEST_US_SELLER_CONFIRMED !== "true" ||
      settings.paymentsEnabled)
  )
    throw new PaymentError("US_PREPARATION_PROFILE_REQUIRED");
  if (env.NODE_TLS_REJECT_UNAUTHORIZED === "0")
    throw new PaymentError("VERIFIED_HTTPS_REQUIRED");
  if (
    env.PAYPAL_TEST_MERCHANT_BINDING !==
    merchantBinding(settings.clientId, settings.merchantId)
  )
    throw new PaymentError("SANDBOX_SELLER_CONFIRMATION_REQUIRED");
  const ownerId = parse(identitySchema, env.PAYPAL_TEST_OWNER_ID);
  if (!ownerId.startsWith("paypal-test-owner-"))
    throw new PaymentError("ALLOWLISTED_TEST_OWNER_REQUIRED");
  const loginSecret = env.PAYPAL_TEST_LOGIN_SECRET,
    sessionSecret = env.PAYPAL_TEST_SESSION_SECRET;
  const sessionEpoch = env.PAYPAL_TEST_SESSION_EPOCH;
  if (
    !loginSecret ||
    loginSecret.length < 32 ||
    !sessionSecret ||
    sessionSecret.length < 43 ||
    loginSecret === sessionSecret
  )
    throw new PaymentError("TEST_AUTH_CONFIGURATION_REQUIRED");
  if (!sessionEpoch || !/^[a-f0-9]{64}$/.test(sessionEpoch))
    throw new PaymentError("TEST_AUTH_CONFIGURATION_REQUIRED");
  return {
    campaign: campaign as "legacy" | "us-v1",
    preparationOnly,
    usOrderOnce,
    usCaptureOnce,
    origin: origin.origin,
    ownerId,
    agentId: `paypal-test-agent-${createHash("sha256").update(ownerId).digest("hex").slice(0, 32)}`,
    loginSecret,
    sessionSecret,
    sessionEpoch,
    merchantId: settings.merchantId,
    settings: {
      ...settings,
      credentialSellerOnly: true,
      returnUrl: `${origin.origin}/paypal-test?paypal_return=approved`,
      cancelUrl: `${origin.origin}/paypal-test?paypal_return=cancelled`,
    },
  };
}
