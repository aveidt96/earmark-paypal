import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { agentCheckoutConfig } from "../src/server/paypal/agent-checkout-config";
import {
  agentCampaignId,
  agentCheckoutMandateId,
  checkAgentMandate,
  inferPendingAgentIntent,
  validatePendingAgentIntent,
} from "../src/server/paypal/agent-checkout";
import {
  agentModelEnv,
  agentPreparationFixture,
} from "./fixtures/agent-checkout";
import { TestOwnerAuth } from "../src/server/paypal/test-auth";
import {
  TASK_03G_US_MANDATE_ID,
  TASK_03G_US_ATTEMPT_ID,
  TASK_03G_US_ORDER_ID,
  TASK_03G_US_CAPTURE_ID,
  TASK_03C_ORIGINAL_MANDATE_ID,
  TASK_03C_ORIGINAL_ORDER_ID,
} from "../src/server/paypal/agent";

describe("Task05C campaign isolation and synthetic model boundary", () => {
  it("separates identifiers, sessions and immutable policy from the historical campaign", () => {
    const t = agentPreparationFixture();
    const config = agentCheckoutConfig({
      ...t.env,
      PAYPAL_AGENT_CAMPAIGN: "agent-05c-v1",
    });
    expect(agentCampaignId(config)).not.toBe(agentCampaignId(t.config));
    expect(agentCheckoutMandateId(config)).not.toBe(t.mandate.id);
    expect(config.agentId).not.toBe(t.config.agentId);
    const request = new Request(config.origin, {
      method: "POST",
      headers: { Origin: config.origin },
    });
    const old = new TestOwnerAuth(t.config, () => t.now).login(request, {
      password: config.loginSecret,
    });
    expect(() =>
      new TestOwnerAuth(config, () => t.now).authenticate(
        new Request(config.origin, { headers: { Cookie: old.cookie } }),
      ),
    ).toThrow("TEST_OWNER_AUTH_REQUIRED");
    const m = {
      ...t.mandate,
      id: agentCheckoutMandateId(config),
      agentId: config.agentId,
    };
    expect(() => checkAgentMandate(config, m, Date.parse(m.expiresAt))).toThrow(
      "MANDATE_EXPIRED",
    );
    expect(() => checkAgentMandate(t.config, m, t.now)).toThrow(
      "AGENT_MANDATE_IMMUTABLE_POLICY_MISMATCH",
    );
  });
  it("sends only synthetic identities and independently binds the proposal to the real campaign", async () => {
    const t = agentPreparationFixture();
    const config = agentCheckoutConfig({
      ...t.env,
      PAYPAL_AGENT_CAMPAIGN: "agent-05c-v1",
    });
    const m = {
      ...t.mandate,
      id: agentCheckoutMandateId(config),
      agentId: config.agentId,
    };
    const intent = await inferPendingAgentIntent(
      config,
      m,
      agentModelEnv,
      t.fetcher,
      "MOCKED_TRANSPORT_TEST",
      () => t.now,
    );
    for (const [, init] of t.fetcher.mock.calls)
      for (const value of [
        m.id,
        config.ownerId,
        config.agentId,
        config.merchantId,
        config.loginSecret,
        config.sessionSecret,
        agentModelEnv.GEMINI_API_KEY,
        TASK_03G_US_MANDATE_ID,
        TASK_03G_US_ATTEMPT_ID,
        TASK_03G_US_ORDER_ID,
        TASK_03G_US_CAPTURE_ID,
        TASK_03C_ORIGINAL_MANDATE_ID,
        TASK_03C_ORIGINAL_ORDER_ID,
      ])
        expect(String(init?.body)).not.toContain(value);
    expect(intent).toMatchObject({
      mandateId: m.id,
      merchantId: config.merchantId,
      amountMinor: "600",
      fundsReserved: false,
      paypalOrderId: null,
      paypalCaptureId: null,
    });
    expect(intent.idempotencyKey).toMatch(/^agent05c-v1:/);
    expect(() =>
      validatePendingAgentIntent(
        config,
        m,
        { ...intent, amountMinor: "1" },
        t.now,
      ),
    ).toThrow();
    expect(intent.policyChecks.every((c) => c.passed)).toBe(true);
  });
  it("rejects invalid native tool arguments rather than generating an intent", async () => {
    const t = agentPreparationFixture();
    const config = agentCheckoutConfig({
      ...t.env,
      PAYPAL_AGENT_CAMPAIGN: "agent-05c-v1",
    });
    const m = {
      ...t.mandate,
      id: agentCheckoutMandateId(config),
      agentId: config.agentId,
    };
    t.responses[3] = {
      functionCall: {
        name: "proposePurchase",
        args: {
          offerId: "synthetic-us-weather-600",
          reason: "test",
          amountMinor: "1",
        },
      },
    };
    await expect(
      inferPendingAgentIntent(
        config,
        m,
        agentModelEnv,
        t.fetcher,
        "MOCKED_TRANSPORT_TEST",
        () => t.now,
      ),
    ).rejects.toThrow("INVALID_MODEL_RESPONSE");
  });
});
