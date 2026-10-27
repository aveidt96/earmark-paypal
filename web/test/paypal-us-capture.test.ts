import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { fixture, owner, orderFor } from "./fixtures/paypal";
import { checkoutFixture, testEnv, usEnv } from "./fixtures/paypal-checkout";
import { PayPalPaymentService } from "../src/server/paypal/service";
import { PayPalClient, PayPalError } from "../src/server/paypal/client";
import { testCheckoutConfig } from "../src/server/paypal/test-config";
import { handleTestCheckout } from "../src/server/paypal/test-http";
import {
  usCapturePermission,
  US_ORDER_ID,
} from "../src/server/paypal/us-capture";
import {
  US_ATTEMPT_ID,
  US_MANDATE_ID,
  US_PURCHASE_KEY,
} from "../src/server/paypal/us-order";

const captureEnv = {
  ...usEnv,
  PAYPAL_TEST_US_CAPTURE_ONCE: "task03g-existing-approved-order",
  PAYPAL_TEST_US_BUYER_SEPARATE: "true",
};
async function approved() {
  const t = await fixture();
  const a = await t.service.createOrder(owner, {
    ...t.input,
    purchaseKey: US_PURCHASE_KEY,
  });
  t.approve(a);
  const scope = {
    attemptId: a.id,
    mandateId: a.mandateId,
    ownerId: a.ownerId,
    merchantId: a.merchantId,
    orderId: a.orderId ?? "ORDER123",
    captureRequestId: a.captureRequestId,
  };
  return { ...t, a, scope };
}
describe("Task03G exact approved-order capture", () => {
  it("submits once under concurrency, validates capture GET and consumes exactly once across restart", async () => {
    const t = await approved();
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, () =>
        t.service.capturePreparedOnce(owner, t.scope),
      ),
    );
    expect(results.some((r) => r.status === "fulfilled")).toBe(true);
    expect(t.gateway.captureOrder).toHaveBeenCalledTimes(1);
    expect(t.gateway.getCapture).toHaveBeenCalledWith("CAPTURE123");
    expect(t.repository.mandates.get(t.a.mandateId)).toMatchObject({
      reservedMinor: "0",
      consumedMinor: "600",
    });
    expect(t.repository.attempts.get(t.a.id)).toMatchObject({
      state: "SUCCEEDED",
      budgetState: "CONSUMED",
      captureId: "CAPTURE123",
    });
    expect(
      t.repository.audit.filter((e) => e.action === "CAPTURE_PREPARED"),
    ).toHaveLength(1);
    expect(
      t.repository.audit.filter(
        (e) =>
          e.action === "PAYPAL_STATE_RECONCILED" && e.detail === "COMPLETED",
      ),
    ).toHaveLength(1);
    const after = JSON.stringify([
      ...t.repository.attempts.values(),
      ...t.repository.mandates.values(),
      ...t.repository.audit,
    ]);
    const restart = new PayPalPaymentService(
      t.repository,
      t.gateway,
      () => t.repository.now,
    );
    expect((await restart.capturePreparedOnce(owner, t.scope)).state).toBe(
      "SUCCEEDED",
    );
    expect(
      JSON.stringify([
        ...t.repository.attempts.values(),
        ...t.repository.mandates.values(),
        ...t.repository.audit,
      ]),
    ).toBe(after);
    expect(t.gateway.captureOrder).toHaveBeenCalledTimes(1);
  });
  it.each([true, false])(
    "POST failure ambiguous=%s retains budget and never resubmits",
    async (ambiguous) => {
      const t = await approved();
      t.gateway.captureOrder.mockRejectedValueOnce(
        new PayPalError(
          "PAYPAL_REQUEST_REJECTED",
          ambiguous,
          ambiguous ? 503 : 422,
        ),
      );
      await expect(
        t.service.capturePreparedOnce(owner, t.scope),
      ).rejects.toThrow("CAPTURE_STOP_RECONCILIATION_REQUIRED");
      expect(t.repository.attempts.get(t.a.id)).toMatchObject({
        state: "CAPTURE_UNCERTAIN",
        budgetState: "RESERVED",
      });
      expect(t.repository.mandates.get(t.a.mandateId)).toMatchObject({
        reservedMinor: "600",
        consumedMinor: "0",
      });
      await expect(
        t.service.capturePreparedOnce(owner, t.scope),
      ).rejects.toThrow("CAPTURE_ALREADY_CLAIMED_OR_UNCERTAIN_STOP");
      expect(t.gateway.captureOrder).toHaveBeenCalledTimes(1);
    },
  );
  it("PENDING capture retains its reservation and cannot dispatch another capture", async () => {
    const t = await approved();
    t.gateway.captureOrder.mockImplementationOnce(async () => {
      const pending = orderFor(t.a, "COMPLETED", "PENDING");
      t.setOrder(pending);
      return pending;
    });
    t.gateway.getCapture.mockResolvedValueOnce({
      id: "CAPTURE123",
      status: "PENDING",
      amount: { currency_code: "USD", value: "6.00" },
      final_capture: true,
    });
    expect(await t.service.capturePreparedOnce(owner, t.scope)).toMatchObject({
      state: "PENDING",
      budgetState: "RESERVED",
      captureId: "CAPTURE123",
    });
    expect(t.repository.mandates.get(t.a.mandateId)).toMatchObject({
      reservedMinor: "600",
      consumedMinor: "0",
    });
    await expect(t.service.capturePreparedOnce(owner, t.scope)).rejects.toThrow(
      "CAPTURE_ALREADY_CLAIMED_OR_UNCERTAIN_STOP",
    );
    expect(t.gateway.captureOrder).toHaveBeenCalledTimes(1);
  });
  it("canonical capture GET failure after POST cannot consume spending or replay capture", async () => {
    const t = await approved();
    t.gateway.getCapture.mockRejectedValueOnce(
      new PayPalError("PAYPAL_REQUEST_REJECTED", false, 404),
    );
    await expect(t.service.capturePreparedOnce(owner, t.scope)).rejects.toThrow(
      "CAPTURE_STOP_RECONCILIATION_REQUIRED",
    );
    expect(t.repository.mandates.get(t.a.mandateId)).toMatchObject({
      reservedMinor: "600",
      consumedMinor: "0",
    });
    await expect(t.service.capturePreparedOnce(owner, t.scope)).rejects.toThrow(
      "CAPTURE_ALREADY_CLAIMED_OR_UNCERTAIN_STOP",
    );
    expect(t.gateway.captureOrder).toHaveBeenCalledTimes(1);
  });
  it("a declined capture is held for review rather than releasing the user's reservation", async () => {
    const t = await approved();
    t.gateway.getOrder
      .mockResolvedValueOnce(orderFor(t.a, "APPROVED"))
      .mockResolvedValueOnce(orderFor(t.a, "COMPLETED", "DECLINED"));
    t.gateway.getCapture.mockResolvedValueOnce({
      id: "CAPTURE123",
      status: "DECLINED",
      amount: { currency_code: "USD", value: "6.00" },
    });
    await expect(t.service.capturePreparedOnce(owner, t.scope)).rejects.toThrow(
      "CAPTURE_STOP_RECONCILIATION_REQUIRED",
    );
    expect(t.repository.attempts.get(t.a.id)).toMatchObject({
      state: "REVIEW_REQUIRED",
      budgetState: "RESERVED",
      captureId: "CAPTURE123",
    });
    expect(t.repository.mandates.get(t.a.mandateId)).toMatchObject({
      reservedMinor: "600",
      consumedMinor: "0",
    });
  });
  it.each(["PAYER_ACTION_REQUIRED", "COMPLETED", "VOIDED"] as const)(
    "fresh status %s blocks dispatch without a new claim",
    async (status) => {
      const t = await approved();
      t.setOrder(orderFor(t.a, status));
      const audit = structuredClone(t.repository.audit);
      await expect(
        t.service.capturePreparedOnce(owner, t.scope),
      ).rejects.toThrow("FRESH_APPROVAL_WITHOUT_CAPTURE_REQUIRED");
      expect(t.gateway.captureOrder).not.toHaveBeenCalled();
      expect(t.repository.audit).toEqual(audit);
    },
  );
  it("checks owner, active policy and expiry before dispatch", async () => {
    const t = await approved();
    await expect(
      t.service.capturePreparedOnce({ ...owner, subjectId: "forged" }, t.scope),
    ).rejects.toThrow("MANDATE_OWNER_REQUIRED");
    t.repository.now = Date.parse(t.mandate.expiresAt);
    await expect(t.service.capturePreparedOnce(owner, t.scope)).rejects.toThrow(
      "MANDATE_EXPIRED",
    );
    expect(t.gateway.captureOrder).not.toHaveBeenCalled();
  });
  it("rejects changed merchant before a claim and wrong capture amount before consumption", async () => {
    const t = await approved();
    const bad = orderFor(t.a, "APPROVED"),
      unit = bad.purchase_units[0];
    if (!unit) throw new Error("FIXTURE_REQUIRED");
    unit.payee.merchant_id = "ZZZZZZZZZZZZZ";
    t.gateway.getOrder.mockResolvedValueOnce(bad);
    await expect(t.service.capturePreparedOnce(owner, t.scope)).rejects.toThrow(
      "PAYPAL_ORDER_BINDING_MISMATCH",
    );
    expect(t.gateway.captureOrder).not.toHaveBeenCalled();
    t.gateway.getCapture.mockResolvedValueOnce({
      id: "CAPTURE123",
      status: "COMPLETED",
      amount: { currency_code: "USD", value: "7.00" },
      final_capture: true,
    });
    await expect(t.service.capturePreparedOnce(owner, t.scope)).rejects.toThrow(
      "CAPTURE_STOP_RECONCILIATION_REQUIRED",
    );
    expect(t.repository.mandates.get(t.a.mandateId)).toMatchObject({
      reservedMinor: "600",
      consumedMinor: "0",
    });
  });
  it("a historical capture claim blocks replay even if a stale local state looks approved", async () => {
    const t = await approved();
    t.repository.audit.push({ action: "CAPTURE_PREPARED", attemptId: t.a.id });
    await expect(t.service.capturePreparedOnce(owner, t.scope)).rejects.toThrow(
      "CAPTURE_ALREADY_CLAIMED_STOP",
    );
    expect(t.gateway.captureOrder).not.toHaveBeenCalled();
  });
  it.each(["attemptId", "orderId", "merchantId", "captureRequestId"] as const)(
    "scope substitution %s cannot dispatch",
    async (field) => {
      const t = await approved();
      await expect(
        t.service.capturePreparedOnce(owner, { ...t.scope, [field]: "other" }),
      ).rejects.toThrow();
      expect(t.gateway.captureOrder).not.toHaveBeenCalled();
    },
  );
  it("production permission pins Task03G IDs and disallows simultaneous order permission", async () => {
    const t = await approved(),
      config = testCheckoutConfig({ ...testEnv, ...captureEnv });
    expect(() => usCapturePermission(config, t.a)).toThrow(
      "ONE_SHOT_CAPTURE_SCOPE_MISMATCH",
    );
    expect(
      usCapturePermission(config, {
        ...t.a,
        id: US_ATTEMPT_ID,
        mandateId: US_MANDATE_ID,
        orderId: US_ORDER_ID,
        ownerId: config.ownerId,
        merchantId: config.merchantId,
      }),
    ).toMatchObject({
      orderId: US_ORDER_ID,
      captureRequestId: t.a.captureRequestId,
    });
    expect(() =>
      testCheckoutConfig({
        ...testEnv,
        ...captureEnv,
        PAYPAL_TEST_US_ORDER_ONCE: "task03e-existing-us-attempt",
      }),
    ).toThrow("US_CAPTURE_CONFIRMATION_REQUIRED");
    expect(() =>
      testCheckoutConfig({ ...testEnv, ...captureEnv, VERCEL: "1" }),
    ).toThrow("PAYPAL_TEST_CHECKOUT_DISABLED");
  });
  it.each([
    "capture",
    "order",
    "order-once",
    "reserve",
    "mandate",
    "approval",
    "recover",
    "cancel",
    "hold-original",
  ])("capture-only HTTP blocks %s before DB initialization", async (action) => {
    const t = await checkoutFixture(captureEnv);
    expect(
      (
        await handleTestCheckout(
          t.request(action, {}, t.cookie, t.csrf),
          action,
          t.runtime,
        )
      ).status,
    ).toBe(409);
    expect(t.checkout).not.toHaveBeenCalled();
  });
  it("capture-once retains owner/session/Origin/CSRF and no client scope overrides", async () => {
    const t = await checkoutFixture(captureEnv);
    expect(
      (
        await handleTestCheckout(
          t.request("capture-once"),
          "capture-once",
          t.runtime,
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await handleTestCheckout(
          t.request("capture-once", {}, t.cookie),
          "capture-once",
          t.runtime,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await handleTestCheckout(
          t.request(
            "capture-once",
            {},
            t.cookie,
            t.csrf,
            "https://attacker.invalid",
          ),
          "capture-once",
          t.runtime,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await handleTestCheckout(
          t.request("capture-once", { orderId: "other" }, t.cookie, t.csrf),
          "capture-once",
          t.runtime,
        )
      ).status,
    ).toBe(400);
    expect(t.checkout).not.toHaveBeenCalled();
  });
  it("capture-only transport cannot create an order or submit another capture scope", async () => {
    const t = await approved(),
      config = testCheckoutConfig({ ...testEnv, ...usEnv }),
      transport = vi.fn<typeof fetch>();
    const client = new PayPalClient(
      {
        ...config.settings,
        merchantId: t.a.merchantId,
        paymentsEnabled: true,
        captureOnlyPermission: t.scope,
      },
      { fetch: transport },
    );
    await expect(
      client.createOrder({ ...t.a, state: "CREATING" }),
    ).rejects.toThrow("PAYPAL_NEW_ORDERS_NOT_AUTHORIZED");
    await expect(
      client.captureOrder({ ...t.a, state: "CAPTURING", orderId: "OTHER" }),
    ).rejects.toThrow("ONE_SHOT_CAPTURE_SCOPE_MISMATCH");
    expect(transport).not.toHaveBeenCalled();
  });
  it("financial POST uses its existing capture request ID and never retries a 503", async () => {
    const t = await approved(),
      config = testCheckoutConfig({ ...testEnv, ...usEnv });
    const json = (value: unknown, status = 200) =>
      new Response(JSON.stringify(value), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        json({
          access_token: "unit-token",
          token_type: "Bearer",
          expires_in: 120,
        }),
      )
      .mockResolvedValueOnce(json({}, 503));
    const client = new PayPalClient(
      {
        ...config.settings,
        merchantId: t.a.merchantId,
        paymentsEnabled: true,
        captureOnlyPermission: t.scope,
      },
      { fetch: transport },
    );
    await expect(
      client.captureOrder({ ...t.a, state: "CAPTURING" }),
    ).rejects.toMatchObject({
      code: "PAYPAL_REQUEST_REJECTED",
      ambiguous: true,
    });
    expect(transport).toHaveBeenCalledTimes(2);
    expect(transport.mock.calls[1]?.[0]).toBe(
      `https://api-m.sandbox.paypal.com/v2/checkout/orders/${t.a.orderId}/capture`,
    );
    expect(transport.mock.calls[1]?.[1]?.headers).toMatchObject({
      "PayPal-Request-Id": t.a.captureRequestId,
    });
  });
});
