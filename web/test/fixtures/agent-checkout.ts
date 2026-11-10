import { randomUUID } from "node:crypto";
import { vi } from "vitest";
import { agentCheckoutConfig } from "../../src/server/paypal/agent-checkout-config";
import { merchantBinding } from "../../src/server/paypal/test-config";
import { createMandate } from "../../src/server/paypal/policy";
import {
  agentCheckoutMandateId,
  AGENT_OFFER_ID,
  inferPendingAgentIntent,
} from "../../src/server/paypal/agent-checkout";
import type { Mandate } from "../../src/server/paypal/domain";

export const agentModelEnv = {
  EARMARK_GEMINI_ENABLED: "true",
  AI_ENABLE_NETWORK: "true",
  GEMINI_API_KEY: "fixture-gemini-not-a-real-key",
  GEMINI_MODEL: "gemini-3.8-flash",
  AI_TIMEOUT_MS: "5000",
};
export function agentPreparationFixture(now = Date.now()) {
  const env = {
    PAYPAL_AGENT_CHECKOUT_ENABLED: "true",
    PAYPAL_AGENT_ORIGIN: "http://127.0.0.1:3032",
    PAYPAL_DATABASE_ENVIRONMENT: "sandbox",
    PAYPAL_BACKEND_ENABLED: "false",
    PAYPAL_PAYMENTS_ENABLED: "false",
    PAYPAL_CLIENT_ID: "fixture-agent-client",
    PAYPAL_MERCHANT_ID: "ABCDEFGHJKLMN",
    PAYPAL_AGENT_MERCHANT_BINDING: merchantBinding(
      "fixture-agent-client",
      "ABCDEFGHJKLMN",
    ),
    PAYPAL_TEST_OWNER_ID: `paypal-test-owner-${randomUUID().replaceAll("-", "")}`,
    PAYPAL_TEST_LOGIN_SECRET: "fixture-agent-login-secret-not-real-123456789",
    PAYPAL_TEST_SESSION_SECRET:
      "fixture-agent-session-secret-not-real-12345678901234567890",
    PAYPAL_TEST_SESSION_EPOCH: "f".repeat(64),
  };
  const config = agentCheckoutConfig(env),
    actor = {
      ownerId: config.ownerId,
      subjectId: config.ownerId,
      role: "owner" as const,
    };
  const m = createMandate(
    actor,
    {
      agentId: config.agentId,
      currency: "USD",
      capMinor: "1000",
      perTransactionMinor: "600",
      merchants: [config.merchantId],
      expiresAt: new Date(now + 86400000).toISOString(),
    },
    now,
  );
  m.id = agentCheckoutMandateId(config);
  const responses: Array<unknown> = [
    { functionCall: { name: "readSpendingMandate", args: {} } },
    { functionCall: { name: "listApprovedMerchants", args: {} } },
    { functionCall: { name: "compareEligibleOffers", args: {} } },
    {
      functionCall: {
        name: "proposePurchase",
        args: {
          offerId: AGENT_OFFER_ID,
          reason:
            "Select the canonical eligible synthetic $6 USD offer; human authorization remains required.",
        },
      },
    },
    { functionCall: { name: "readAuthorizedPaymentStatus", args: {} } },
    {
      text: JSON.stringify({
        kind: "finish",
        summary:
          "Synthetic $6 offer selected and policy validated. No reservation or PayPal order; awaiting human authorization.",
      }),
    },
  ];
  let index = 0;
  const fetcher = vi.fn<typeof fetch>(async () => {
    const part = responses[index++];
    if (!part) throw new Error("UNEXPECTED_MODEL_REQUEST");
    return new Response(
      JSON.stringify({
        responseId: `mocked-response-${index}`,
        modelVersion: "mocked-model-fixture",
        candidates: [{ content: { role: "model", parts: [part] } }],
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  });
  const infer = (mandate: Mandate = m) =>
    inferPendingAgentIntent(
      config,
      mandate,
      agentModelEnv,
      fetcher,
      "MOCKED_TRANSPORT_TEST",
      () => now,
    );
  return { config, env, actor, mandate: m, now, fetcher, responses, infer };
}
