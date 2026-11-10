import "server-only";
import { createHash } from "node:crypto";
import {
  identitySchema,
  parse,
  paypalMerchantSchema,
  PaymentError,
} from "./domain";
import type { LocalOwnerAuthConfig } from "./test-auth";
import { merchantBinding } from "./test-config";
import { sandboxFlags } from "./config";

export type AgentCheckoutConfig = LocalOwnerAuthConfig & {
  campaign: "agent-05a" | "agent-05c-v1" | "agent-05d-v1" | "agent-09-v1";
  merchantId: string;
  agentId: string;
};
export function agentCheckoutConfig(
  env: Record<string, string | undefined> = process.env,
): AgentCheckoutConfig {
  sandboxFlags(env);
  if (
    env.PAYPAL_AGENT_CHECKOUT_ENABLED !== "true" ||
    env.VERCEL ||
    env.AWS_EXECUTION_ENV ||
    env.AWS_LAMBDA_FUNCTION_NAME
  )
    throw new PaymentError("AGENT_CHECKOUT_LOCAL_PROFILE_DISABLED");
  if (
    env.PAYPAL_AGENT_ORIGIN !== "http://127.0.0.1:3032" ||
    env.PAYPAL_DATABASE_ENVIRONMENT !== "sandbox" ||
    env.PAYPAL_PAYMENTS_ENABLED === "true" ||
    env.PAYPAL_BACKEND_ENABLED === "true" ||
    env.NODE_TLS_REJECT_UNAUTHORIZED === "0"
  )
    throw new PaymentError("AGENT_CHECKOUT_PREPARATION_ONLY_REQUIRED");
  const ownerId = parse(identitySchema, env.PAYPAL_TEST_OWNER_ID),
    merchantId = parse(paypalMerchantSchema, env.PAYPAL_MERCHANT_ID);
  const loginSecret = env.PAYPAL_TEST_LOGIN_SECRET,
    sessionSecret = env.PAYPAL_TEST_SESSION_SECRET,
    sessionEpoch = env.PAYPAL_TEST_SESSION_EPOCH;
  if (
    !ownerId.startsWith("paypal-test-owner-") ||
    !loginSecret ||
    loginSecret.length < 32 ||
    !sessionSecret ||
    sessionSecret.length < 43 ||
    loginSecret === sessionSecret ||
    !sessionEpoch ||
    !/^[a-f0-9]{64}$/.test(sessionEpoch)
  )
    throw new PaymentError("AGENT_OWNER_AUTH_CONFIGURATION_REQUIRED");
  if (
    !env.PAYPAL_CLIENT_ID ||
    env.PAYPAL_AGENT_MERCHANT_BINDING !==
      merchantBinding(env.PAYPAL_CLIENT_ID, merchantId)
  )
    throw new PaymentError("AGENT_SELLER_BINDING_REQUIRED");
  const campaign = env.PAYPAL_AGENT_CAMPAIGN ?? "agent-05a";
  if (
    !["agent-05a", "agent-05c-v1", "agent-05d-v1", "agent-09-v1"].includes(
      campaign,
    )
  )
    throw new PaymentError("UNKNOWN_AGENT_CAMPAIGN");
  return {
    campaign: campaign as AgentCheckoutConfig["campaign"],
    origin: env.PAYPAL_AGENT_ORIGIN,
    ownerId,
    merchantId,
    loginSecret,
    sessionSecret,
    sessionEpoch,
    agentId: `${campaign.replace("agent-", "agent")}-${createHash("sha256").update(ownerId).digest("hex").slice(0, 32)}`,
  };
}
