import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { fixture, owner, orderFor } from "./fixtures/paypal";
import { checkoutFixture, testEnv, usEnv } from "./fixtures/paypal-checkout";
import { PayPalPaymentService } from "../src/server/paypal/service";
import { PayPalClient, PayPalError } from "../src/server/paypal/client";
import { handleTestCheckout } from "../src/server/paypal/test-http";
import {
  usOrderPermission,
  US_MANDATE_ID,
  US_ATTEMPT_ID,
  US_PURCHASE_KEY,
} from "../src/server/paypal/us-order";
import { testCheckoutConfig } from "../src/server/paypal/test-config";

const onceEnv = {
  ...usEnv,
  PAYPAL_TEST_US_ORDER_ONCE: "task03e-existing-us-attempt",
  PAYPAL_TEST_US_BUYER_SEPARATE: "true",
};
async function prepared() {
  const t = await fixture();
  const a = await t.service.reserve(owner, {
    ...t.input,
    purchaseKey: US_PURCHASE_KEY,
  });
  const scope = {
    attemptId: a.id,
    mandateId: a.mandateId,
    ownerId: a.ownerId,
    merchantId: a.merchantId,
    createRequestId: a.createRequestId,
  };
  return { ...t, a, scope };
}
describe("Task03E exactly one existing-reservation order", () => {
  it("claims exactly once under concurrency, verifies by GET and preserves held budget across restart", async () => {
    const t = await prepared();
    const outcomes = await Promise.allSettled(
      Array.from({ length: 8 }, () =>
        t.service.createPreparedOrderOnce(owner, t.scope),
      ),
    );
    expect(outcomes.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(t.gateway.createOrder).toHaveBeenCalledTimes(1);
    expect(t.gateway.getOrder).toHaveBeenCalledTimes(1);
    expect(t.gateway.captureOrder).not.toHaveBeenCalled();
    expect(t.repository.attempts.size).toBe(1);
    expect(t.repository.mandates.get(t.a.mandateId)).toMatchObject({
      reservedMinor: "600",
      consumedMinor: "0",
    });
    expect(t.repository.attempts.get(t.a.id)).toMatchObject({
      state: "AWAITING_APPROVAL",
      orderId: "ORDER123",
      budgetState: "RESERVED",
    });
    expect(
      t.repository.audit.filter((e) => e.action === "BUDGET_RESERVED"),
    ).toHaveLength(1);
    expect(
      t.repository.audit.filter((e) => e.action === "CREATE_PREPARED"),
    ).toHaveLength(1);
    const restart = new PayPalPaymentService(
      t.repository,
      t.gateway,
      () => t.repository.now,
    );
    await expect(
      restart.createPreparedOrderOnce(owner, t.scope),
    ).rejects.toThrow("ONE_SHOT_ALREADY_ATTEMPTED_STOP");
    expect(t.gateway.createOrder).toHaveBeenCalledTimes(1);
  });
  it.each([true, false])(
    "never retries or releases even when POST rejection ambiguous=%s",
    async (ambiguous) => {
      const t = await prepared();
      t.gateway.createOrder.mockRejectedValueOnce(
        new PayPalError(
          "PAYPAL_REQUEST_REJECTED",
          ambiguous,
          ambiguous ? 503 : 422,
        ),
      );
      await expect(
        t.service.createPreparedOrderOnce(owner, t.scope),
      ).rejects.toThrow("ONE_SHOT_STOP_RECONCILIATION_REQUIRED");
      await expect(
        t.service.createPreparedOrderOnce(owner, t.scope),
      ).rejects.toThrow("ONE_SHOT_ALREADY_ATTEMPTED_STOP");
      expect(t.gateway.createOrder).toHaveBeenCalledTimes(1);
      expect(t.repository.attempts.get(t.a.id)).toMatchObject({
        state: "CREATE_UNCERTAIN",
        budgetState: "RESERVED",
      });
      expect(t.repository.mandates.get(t.a.mandateId)).toMatchObject({
        reservedMinor: "600",
        consumedMinor: "0",
      });
    },
  );
  it("retains returned order reference without an approval link if canonical GET fails", async () => {
    const t = await prepared();
    t.gateway.getOrder.mockRejectedValueOnce(
      new PayPalError("PAYPAL_REQUEST_REJECTED", false, 404),
    );
    await expect(
      t.service.createPreparedOrderOnce(owner, t.scope),
    ).rejects.toThrow("ONE_SHOT_STOP_RECONCILIATION_REQUIRED");
    expect(t.repository.attempts.get(t.a.id)).toMatchObject({
      orderId: "ORDER123",
      state: "CREATE_UNCERTAIN",
      budgetState: "RESERVED",
    });
    expect(t.repository.attempts.get(t.a.id)?.approvalUrl).toBeUndefined();
    await expect(
      t.service.createPreparedOrderOnce(owner, t.scope),
    ).rejects.toThrow("ONE_SHOT_ALREADY_ATTEMPTED_STOP");
    expect(t.gateway.createOrder).toHaveBeenCalledTimes(1);
  });
  it("does not consume or release if an unexpected completed/captured order is returned", async () => {
    const t = await prepared();
    t.gateway.getOrder.mockResolvedValueOnce(
      orderFor(t.a, "COMPLETED", "COMPLETED"),
    );
    await expect(
      t.service.createPreparedOrderOnce(owner, t.scope),
    ).rejects.toThrow("ONE_SHOT_STOP_RECONCILIATION_REQUIRED");
    expect(t.repository.mandates.get(t.a.mandateId)).toMatchObject({
      reservedMinor: "600",
      consumedMinor: "0",
    });
    expect(t.gateway.captureOrder).not.toHaveBeenCalled();
  });
  it("requires a matching canonical merchant and official token link before exposing approval", async () => {
    const t = await prepared();
    const bad = orderFor(t.a);
    const unit = bad.purchase_units[0];
    if (!unit) throw new Error("FIXTURE_REQUIRED");
    unit.payee.merchant_id = "ZZZZZZZZZZZZZ";
    t.gateway.getOrder.mockResolvedValueOnce(bad);
    await expect(
      t.service.createPreparedOrderOnce(owner, t.scope),
    ).rejects.toThrow("ONE_SHOT_STOP_RECONCILIATION_REQUIRED");
    expect(t.repository.attempts.get(t.a.id)).toMatchObject({
      state: "REVIEW_REQUIRED",
      budgetState: "RESERVED",
    });
    expect(t.repository.attempts.get(t.a.id)?.approvalUrl).toBeUndefined();
  });
  it("cannot dispatch with another owner or expired mandate", async () => {
    const t = await prepared();
    await expect(
      t.service.createPreparedOrderOnce(
        { ...owner, subjectId: "forged" },
        t.scope,
      ),
    ).rejects.toThrow("MANDATE_OWNER_REQUIRED");
    t.repository.now = Date.parse(t.mandate.expiresAt);
    await expect(
      t.service.createPreparedOrderOnce(owner, t.scope),
    ).rejects.toThrow("MANDATE_EXPIRED");
    expect(t.gateway.createOrder).not.toHaveBeenCalled();
  });
  it.each(["attemptId", "mandateId", "merchantId", "createRequestId"] as const)(
    "rejects substituted %s before dispatch",
    async (field) => {
      const t = await prepared();
      await expect(
        t.service.createPreparedOrderOnce(owner, {
          ...t.scope,
          [field]: "substitution",
        }),
      ).rejects.toThrow();
      expect(t.gateway.createOrder).not.toHaveBeenCalled();
    },
  );
  it("production permission pins the exact Task03D IDs and requires explicit separate-buyer confirmation", async () => {
    const t = await prepared();
    const config = testCheckoutConfig({ ...testEnv, ...onceEnv });
    expect(() => usOrderPermission(config, t.a)).toThrow(
      "ONE_SHOT_ORDER_SCOPE_MISMATCH",
    );
    const bound = {
      ...t.a,
      id: US_ATTEMPT_ID,
      mandateId: US_MANDATE_ID,
      ownerId: config.ownerId,
      merchantId: config.merchantId,
    };
    expect(usOrderPermission(config, bound)).toMatchObject({
      attemptId: US_ATTEMPT_ID,
      mandateId: US_MANDATE_ID,
      createRequestId: t.a.createRequestId,
    });
    expect(() =>
      testCheckoutConfig({
        ...testEnv,
        ...onceEnv,
        PAYPAL_TEST_US_BUYER_SEPARATE: "false",
      }),
    ).toThrow("US_ONE_SHOT_CONFIRMATION_REQUIRED");
  });
  it.each([
    "order",
    "capture",
    "cancel",
    "recover",
    "approval",
    "reserve",
    "mandate",
    "hold-original",
  ])(
    "one-shot HTTP profile blocks %s before DB initialization",
    async (action) => {
      const t = await checkoutFixture(onceEnv);
      const response = await handleTestCheckout(
        t.request(action, {}, t.cookie, t.csrf),
        action,
        t.runtime,
      );
      expect(response.status).toBe(409);
      expect(t.checkout).not.toHaveBeenCalled();
    },
  );
  it("keeps order-once owner, Origin and CSRF protected and rejects frontend scope overrides", async () => {
    const t = await checkoutFixture(onceEnv);
    expect(
      (
        await handleTestCheckout(
          t.request("order-once"),
          "order-once",
          t.runtime,
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await handleTestCheckout(
          t.request("order-once", {}, t.cookie),
          "order-once",
          t.runtime,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await handleTestCheckout(
          t.request(
            "order-once",
            {},
            t.cookie,
            t.csrf,
            "https://attacker.invalid",
          ),
          "order-once",
          t.runtime,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await handleTestCheckout(
          t.request("order-once", { attemptId: "other" }, t.cookie, t.csrf),
          "order-once",
          t.runtime,
        )
      ).status,
    ).toBe(400);
    expect(t.checkout).not.toHaveBeenCalled();
  });
  it("order-only client cannot capture or substitute an attempt even when its private creation switch is enabled", async () => {
    const t = await prepared();
    const config = testCheckoutConfig({ ...testEnv, ...usEnv });
    const transport = vi.fn<typeof fetch>();
    const client = new PayPalClient(
      {
        ...config.settings,
        merchantId: t.a.merchantId,
        paymentsEnabled: true,
        orderOnlyPermission: t.scope,
      },
      { fetch: transport },
    );
    await expect(
      client.captureOrder({ ...t.a, state: "CAPTURING", orderId: "ORDER123" }),
    ).rejects.toThrow("PAYPAL_CAPTURE_NOT_AUTHORIZED");
    await expect(
      client.createOrder({ ...t.a, id: "other", state: "CREATING" }),
    ).rejects.toThrow("ONE_SHOT_ORDER_SCOPE_MISMATCH");
    expect(transport).not.toHaveBeenCalled();
  });
});
