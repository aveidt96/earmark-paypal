import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  agentPreparationFixture,
  agentModelEnv,
} from "./fixtures/agent-checkout";
import { checkoutFixture } from "./fixtures/paypal-checkout";
import { agentCheckoutConfig } from "../src/server/paypal/agent-checkout-config";
import {
  AgentCheckoutPreparationService,
  agentCheckoutMandateId,
  inferPendingAgentIntent,
  type AgentCheckoutRepository,
} from "../src/server/paypal/agent-checkout";
import {
  AgentCheckoutPaymentService,
  agentPaymentEnabled,
} from "../src/server/paypal/agent-checkout-payment";
import type { AgentCheckoutIntent } from "../src/lib/agent-checkout";
import { TestOwnerAuth } from "../src/server/paypal/test-auth";
import { handleAgentCheckout } from "../src/server/paypal/agent-checkout-http";
import { PayPalError } from "../src/server/paypal/client";

function required<T>(value: T | null | undefined): T {
  if (value == null) throw new Error("FIXTURE_REQUIRED");
  return value;
}

/** All Gemini and PayPal transport is mocked; LIVE_GOOGLE_API is simulated stored provenance. No DB. */
async function integrated() {
  const model = agentPreparationFixture();
  const config = agentCheckoutConfig({
    ...model.env,
    PAYPAL_AGENT_CAMPAIGN: "agent-05d-v1",
  });
  const base = await checkoutFixture();
  base.memory.now = model.now;
  const mandate = {
    ...model.mandate,
    id: agentCheckoutMandateId(config),
    agentId: config.agentId,
  };
  await base.repository.insertMandate(mandate);
  let intent: AgentCheckoutIntent | null = null;
  const prepared: AgentCheckoutRepository = {
    read: async () => ({
      mandate: (await base.repository.readMandate(mandate.id)) ?? null,
      intent,
      evaluationState: intent ? "PREPARED" : "NOT_STARTED",
    }),
    initialize: vi.fn(),
    evaluateOnce: async (_actor, produce) =>
      (intent ??= await produce(mandate)),
  };
  const env = {
    ...agentModelEnv,
    PAYPAL_AGENT_CHECKOUT_EXECUTION: "task05d-one-synthetic-checkout",
    PAYPAL_AGENT_CHECKOUT_MANDATE_ID: mandate.id,
    PAYPAL_AGENT_BUYER_SEPARATE: "true",
  };
  const gateway = vi.fn(() => base.gateway);
  const payments = new AgentCheckoutPaymentService(
    config,
    prepared,
    base.repository,
    env,
    () => base.memory.now,
    gateway,
  );
  const service = new AgentCheckoutPreparationService(
    config,
    prepared,
    env,
    (m) =>
      inferPendingAgentIntent(
        config,
        m,
        env,
        model.fetcher,
        "LIVE_GOOGLE_API",
        () => base.memory.now,
      ),
    () => base.memory.now,
    payments,
  );
  const auth = new TestOwnerAuth(config, () => base.memory.now);
  const login = auth.login(
    new Request(`${config.origin}/login`, {
      method: "POST",
      headers: { Origin: config.origin },
    }),
    { password: config.loginSecret },
  );
  const cookie = login.cookie.split(";")[0] ?? "";
  const checkout = vi.fn(async () => service);
  const runtime = () => ({ auth, checkout });
  const request = (
    action: string,
    body: unknown = {},
    headers: Record<string, string> = {},
  ) =>
    new Request(`${config.origin}/api/paypal/agent-checkout/${action}`, {
      method: "POST",
      headers: {
        Origin: config.origin,
        Cookie: cookie,
        "X-Earmark-CSRF": login.session.csrf,
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify(body),
    });
  const call = (action: string) =>
    handleAgentCheckout(request(action), action, runtime);
  return {
    ...base,
    model,
    config,
    mandate,
    prepared,
    env,
    gateway,
    payments,
    service,
    auth,
    cookie,
    checkout,
    runtime,
    request,
    call,
    getIntent: () => intent,
    setIntent: (value: AgentCheckoutIntent) => {
      intent = value;
    },
  };
}

describe("Task05D owner-authorized agent checkout (offline mocks only)", () => {
  beforeEach(() =>
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("LIVE_NETWORK_FORBIDDEN_IN_TEST");
      }),
    ),
  );
  afterEach(() => vi.unstubAllGlobals());
  it("connects six mocked native turns to one owner order, human approval, capture and accounting", async () => {
    const t = await integrated();
    const historical = { ...t.model.mandate, reservedMinor: "600" };
    await t.repository.insertMandate(historical);
    expect((await t.call("evaluate")).status).toBe(200);
    expect(t.model.fetcher).toHaveBeenCalledTimes(6);
    expect(t.memory.attempts.size).toBe(0);
    expect(t.gateway).not.toHaveBeenCalled();
    const savedIntent = structuredClone(t.getIntent());
    const created = await t.call("authorize-order");
    expect(created.status).toBe(200);
    expect(await created.json()).toMatchObject({
      mandate: {
        reservedMinor: "600",
        consumedMinor: "0",
        availableMinor: "400",
      },
      payment: { attempt: { state: "AWAITING_APPROVAL" } },
    });
    expect((await t.call("capture")).status).toBe(409);
    expect(t.gateway().captureOrder).not.toHaveBeenCalled();
    const a = required([...t.memory.attempts.values()][0]);
    t.approve(a); // Simulate a human approving at PayPal, never a frontend approval claim.
    expect((await t.call("reconcile")).status).toBe(200);
    const paid = await t.call("capture");
    expect(paid.status).toBe(200);
    expect(await paid.json()).toMatchObject({
      mandate: {
        reservedMinor: "0",
        consumedMinor: "600",
        availableMinor: "400",
      },
      payment: {
        attempt: {
          state: "SUCCEEDED",
          budgetState: "CONSUMED",
          captureId: "CAPTURE123",
        },
      },
    });
    await t.call("capture");
    expect(t.gateway().captureOrder).toHaveBeenCalledTimes(1);
    expect(t.gateway().createOrder).toHaveBeenCalledTimes(1);
    expect(t.getIntent()).toEqual(savedIntent); // Proposal remains an immutable, non-financial journal.
    expect(t.memory.mandates.get(historical.id)).toEqual(historical);
    expect(t.memory.mandates.size).toBe(2);
    for (const [, init] of t.model.fetcher.mock.calls) {
      const payload = String(init?.body);
      for (const value of [
        t.mandate.id,
        t.config.ownerId,
        t.config.agentId,
        t.config.merchantId,
      ])
        expect(payload).not.toContain(value);
    }
  });
  it("is off by default and rejects old campaigns, wrong mandate scopes and incomplete opt-ins before side effects", async () => {
    const t = await integrated();
    for (const env of [
      {},
      { ...t.env, PAYPAL_AGENT_CHECKOUT_MANDATE_ID: t.model.mandate.id },
      { ...t.env, PAYPAL_AGENT_BUYER_SEPARATE: "false" },
    ]) {
      const disabled = new AgentCheckoutPaymentService(
        t.config,
        t.prepared,
        t.repository,
        env,
        () => t.memory.now,
        t.gateway,
      );
      await expect(
        disabled.action(t.model.actor, "authorize-order"),
      ).rejects.toThrow("AGENT_PAYMENT_EXECUTION_DISABLED");
    }
    expect(agentPaymentEnabled(t.model.config, t.env)).toBe(false);
    expect(
      agentCheckoutMandateId({ ...t.config, campaign: "agent-05c-v1" }),
    ).not.toBe(t.mandate.id);
    expect(
      agentPaymentEnabled({ ...t.config, campaign: "agent-05c-v1" }, t.env),
    ).toBe(false);
    expect(t.gateway).not.toHaveBeenCalled();
    expect(t.memory.attempts.size).toBe(0);
  });
  it("rejects self-authorization, client terms, CSRF, Host, Origin and cross-campaign sessions", async () => {
    const t = await integrated();
    await expect(
      t.payments.action(
        {
          ownerId: t.config.ownerId,
          subjectId: t.config.agentId,
          role: "agent",
        },
        "authorize-order",
      ),
    ).rejects.toThrow("MANDATE_OWNER_REQUIRED");
    const oldAuth = new TestOwnerAuth(t.model.config, () => t.memory.now);
    const oldLogin = oldAuth.login(
      new Request(t.config.origin, {
        method: "POST",
        headers: { Origin: t.config.origin },
      }),
      { password: t.config.loginSecret },
    );
    for (const [body, headers, status] of [
      [{ amountMinor: "1", ownerAuthorized: true, orderId: "FORGED" }, {}, 400],
      [{}, { "X-Earmark-CSRF": "" }, 403],
      [{}, { Host: "attacker.invalid" }, 403],
      [{}, { Origin: "https://attacker.invalid" }, 403],
      [{}, { Cookie: "" }, 401],
      [{}, { Cookie: oldLogin.cookie.split(";")[0] ?? "" }, 401],
    ] as const)
      expect(
        (
          await handleAgentCheckout(
            t.request("authorize-order", body, headers),
            "authorize-order",
            t.runtime,
          )
        ).status,
      ).toBe(status);
    expect(t.checkout).not.toHaveBeenCalled();
    expect(t.gateway).not.toHaveBeenCalled();
    expect(t.memory.attempts.size).toBe(0);
  });
  it("requires a valid live proposal and independently revalidates immutable terms and current budget", async () => {
    const t = await integrated();
    await expect(
      t.payments.action(t.model.actor, "authorize-order"),
    ).rejects.toThrow("AGENT_VALIDATED_PROPOSAL_REQUIRED");
    await t.service.evaluate(t.model.actor);
    const original = required(t.getIntent());
    for (const change of [
      { amountMinor: "1" },
      { merchantId: "ZZZZZZZZZZZZZ" },
      { deliveryCommitment: `0x${"f".repeat(64)}` },
      { mandateId: t.model.mandate.id },
    ]) {
      t.setIntent({ ...original, ...change } as AgentCheckoutIntent);
      await expect(
        t.payments.action(t.model.actor, "authorize-order"),
      ).rejects.toThrow();
    }
    t.setIntent({
      ...original,
      evidence: { ...original.evidence, kind: "MOCKED_TRANSPORT_TEST" },
    });
    await expect(
      t.payments.action(t.model.actor, "authorize-order"),
    ).rejects.toThrow("AGENT_LIVE_PROPOSAL_REQUIRED");
    t.setIntent(original);
    required(t.memory.mandates.get(t.mandate.id)).consumedMinor = "600";
    await expect(
      t.payments.action(t.model.actor, "authorize-order"),
    ).rejects.toThrow("AGENT_PREPARATION_MUST_NOT_RESERVE_FUNDS");
    expect(t.memory.attempts.size).toBe(0);
    expect(t.gateway).not.toHaveBeenCalled();
  });
  it("serializes concurrent owner actions and recovers the same attempt after a service restart", async () => {
    const t = await integrated();
    await t.service.evaluate(t.model.actor);
    await Promise.all([
      t.payments.action(t.model.actor, "authorize-order"),
      t.payments.action(t.model.actor, "authorize-order"),
    ]);
    const restarted = new AgentCheckoutPaymentService(
      t.config,
      t.prepared,
      t.repository,
      t.env,
      () => t.memory.now,
      t.gateway,
    );
    await restarted.action(t.model.actor, "authorize-order");
    expect(t.memory.attempts.size).toBe(1);
    expect(t.gateway().createOrder).toHaveBeenCalledTimes(1);
    const a = required([...t.memory.attempts.values()][0]);
    t.approve(a);
    await Promise.all([
      restarted.action(t.model.actor, "capture"),
      restarted.action(t.model.actor, "capture"),
    ]);
    expect(t.gateway().captureOrder).toHaveBeenCalledTimes(1);
    expect(t.memory.mandates.get(t.mandate.id)).toMatchObject({
      reservedMinor: "0",
      consumedMinor: "600",
    });
  });
  it("blocks expiry before order and before capture; reconciliation cannot create or capture", async () => {
    const t = await integrated();
    await t.service.evaluate(t.model.actor);
    t.memory.now = Date.parse(t.mandate.expiresAt);
    await expect(
      t.payments.action(t.model.actor, "authorize-order"),
    ).rejects.toThrow("MANDATE_EXPIRED");
    t.memory.now = t.model.now;
    await t.payments.action(t.model.actor, "authorize-order");
    t.approve(required([...t.memory.attempts.values()][0]));
    t.memory.now = Date.parse(t.mandate.expiresAt);
    await expect(t.payments.action(t.model.actor, "capture")).rejects.toThrow(
      "MANDATE_EXPIRED",
    );
    await t.payments.action(t.model.actor, "reconcile");
    expect(t.gateway().createOrder).toHaveBeenCalledTimes(1);
    expect(t.gateway().captureOrder).not.toHaveBeenCalled();
    expect(t.memory.mandates.get(t.mandate.id)).toMatchObject({
      reservedMinor: "600",
      consumedMinor: "0",
    });
  });
  it("holds an uncertain capture without replaying it or releasing the reservation", async () => {
    const t = await integrated();
    await t.service.evaluate(t.model.actor);
    await t.payments.action(t.model.actor, "authorize-order");
    t.approve(required([...t.memory.attempts.values()][0]));
    t.gateway().captureOrder.mockRejectedValue(
      new PayPalError("PAYPAL_RESPONSE_UNCERTAIN", true),
    );
    await t.payments.action(t.model.actor, "capture");
    await t.payments.action(t.model.actor, "capture");
    expect(t.gateway().captureOrder).toHaveBeenCalledTimes(1);
    expect([...t.memory.attempts.values()][0]).toMatchObject({
      state: "CAPTURE_UNCERTAIN",
      budgetState: "RESERVED",
    });
    expect(t.memory.mandates.get(t.mandate.id)).toMatchObject({
      reservedMinor: "600",
      consumedMinor: "0",
    });
  });
});
