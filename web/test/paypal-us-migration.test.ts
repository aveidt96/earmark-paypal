import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { checkoutFixture, testEnv, usEnv } from "./fixtures/paypal-checkout";
import {
  TestCheckoutService,
  testMandateId,
} from "../src/server/paypal/test-checkout";
import { testCheckoutConfig } from "../src/server/paypal/test-config";
import { handleTestCheckout } from "../src/server/paypal/test-http";
import {
  originalReservationHold,
  ORIGINAL_MANDATE_ID,
  ORIGINAL_ORDER_ID,
} from "../src/server/paypal/operator-hold";
describe("US migration preserves unresolved merchant obligations", () => {
  it("creates separate merchant-scoped mandate and request identities under the same owner without any remote call", async () => {
    const t = await checkoutFixture();
    await t.service.mandate(t.actor);
    await t.service.action(t.actor, "order");
    const oldMandate = structuredClone([...t.memory.mandates.values()][0]);
    const oldAttempt = structuredClone([...t.memory.attempts.values()][0]);
    if (!oldAttempt || !oldMandate) throw new Error("FIXTURE_REQUIRED");
    const config = testCheckoutConfig({ ...testEnv, ...usEnv });
    const service = new TestCheckoutService(
      config,
      t.repository,
      t.gateway,
      () => t.memory.now,
    );
    await service.mandate(t.actor);
    const prepared = await service.action(t.actor, "reserve");
    const again = await service.action(t.actor, "reserve");
    const a = [...t.memory.attempts.values()].find(
      (a) => a.merchantId === config.merchantId,
    );
    expect(a).toBeDefined();
    expect(a?.ownerId).toBe(oldAttempt.ownerId);
    expect(a?.mandateId).not.toBe(oldAttempt.mandateId);
    expect(a?.purchaseKey).not.toBe(oldAttempt.purchaseKey);
    expect(a?.createRequestId).not.toBe(oldAttempt.createRequestId);
    expect(a?.captureRequestId).not.toBe(oldAttempt.captureRequestId);
    expect(prepared).toMatchObject({
      preparationOnly: true,
      executionEnabled: false,
      reservedMinor: "600",
      capturedMinor: "0",
      availableMinor: "400",
      attempt: { state: "RESERVED", orderId: null },
    });
    expect(again.attempt?.id).toBe(prepared.attempt?.id);
    expect(t.memory.mandates.get(oldMandate.id)).toEqual(oldMandate);
    expect(t.memory.attempts.get(oldAttempt.id)).toEqual(oldAttempt);
    expect(t.gateway.createOrder).toHaveBeenCalledTimes(1); // legacy mock only
    expect(t.gateway.captureOrder).not.toHaveBeenCalled();
  });
  it.each(["order", "capture", "approval", "recover", "cancel"])(
    "rejects %s before initializing DB/gateway in US preparation",
    async (action) => {
      const t = await checkoutFixture(usEnv);
      const result = await handleTestCheckout(
        t.request(action, {}, t.cookie, t.csrf),
        action,
        t.runtime,
      );
      expect(result.status).toBe(409);
      expect(await result.json()).toMatchObject({
        error: "PREPARATION_ONLY_NO_PAYMENT_ACTIONS",
      });
      expect(t.checkout).not.toHaveBeenCalled();
      await expect(t.service.action(t.actor, action)).rejects.toThrow(
        "PREPARATION_ONLY_NO_PAYMENT_ACTIONS",
      );
      expect(t.gateway.createOrder).not.toHaveBeenCalled();
      expect(t.gateway.getOrder).not.toHaveBeenCalled();
    },
  );
  it("rejects legacy cookies in US sessions even with the same owner/signing secret", async () => {
    const old = await checkoutFixture();
    const us = await checkoutFixture(usEnv);
    expect(() =>
      us.auth.authenticate(us.request(undefined, {}, old.cookie)),
    ).toThrow("TEST_OWNER_AUTH_REQUIRED");
    expect(() =>
      old.auth.authenticate(old.request(undefined, {}, us.cookie)),
    ).toThrow("TEST_OWNER_AUTH_REQUIRED");
  });
  it("blocks old-merchant capture/recovery/revocation and skips it in sweep without a remote read or audit write", async () => {
    const t = await checkoutFixture();
    await t.service.mandate(t.actor);
    await t.service.action(t.actor, "order");
    const old = [...t.memory.attempts.values()][0];
    if (!old) throw new Error("FIXTURE_REQUIRED");
    const us = new TestCheckoutService(
      testCheckoutConfig({ ...testEnv, ...usEnv }),
      t.repository,
      t.gateway,
      () => t.memory.now,
    );
    const audit = structuredClone(t.memory.audit);
    for (const call of [
      () => us.payments.capture(t.actor, old.id),
      () => us.payments.reconcile(old.id),
      () =>
        us.payments.reconcileWithOrderId(
          t.actor,
          old.id,
          old.orderId ?? "ORDER123",
        ),
      () => us.payments.reconcileProviderReference(old.id, "ORDER123"),
      () => us.payments.revokeMandate(t.actor, old.mandateId),
    ])
      await expect(call()).rejects.toThrow(
        "PAYPAL_CREDENTIAL_MERCHANT_MISMATCH",
      );
    expect(await us.payments.recover()).toEqual([
      { id: old.id, state: "SKIPPED_DIFFERENT_MERCHANT" },
    ]);
    expect(t.gateway.getOrder).not.toHaveBeenCalled();
    expect(t.gateway.captureOrder).not.toHaveBeenCalled();
    expect(t.memory.attempts.get(old.id)).toEqual(old);
    expect(t.memory.audit).toEqual(audit);
  });
  it("rejects a campaign replay under changed merchant or an execution-enabled US profile", () => {
    expect(testMandateId(testEnv.PAYPAL_TEST_OWNER_ID)).not.toBe(
      testMandateId(testEnv.PAYPAL_TEST_OWNER_ID, usEnv.PAYPAL_MERCHANT_ID),
    );
    expect(
      testMandateId(testEnv.PAYPAL_TEST_OWNER_ID, testEnv.PAYPAL_MERCHANT_ID),
    ).not.toBe(
      testMandateId(testEnv.PAYPAL_TEST_OWNER_ID, usEnv.PAYPAL_MERCHANT_ID),
    );
    for (const overrides of [
      { PAYPAL_PAYMENTS_ENABLED: "true" },
      { PAYPAL_TEST_US_SELLER_CONFIRMED: "false" },
      { PAYPAL_TEST_ORIGIN: "http://127.0.0.1:3030" },
    ])
      expect(() =>
        testCheckoutConfig({ ...testEnv, ...usEnv, ...overrides }),
      ).toThrow("US_PREPARATION_PROFILE_REQUIRED");
  });
  it("only the verified owner can append the original hold; it never changes counters or claims failure", async () => {
    const t = await checkoutFixture();
    await t.service.mandate(t.actor);
    await t.service.action(t.actor, "order");
    const a = structuredClone([...t.memory.attempts.values()][0]),
      m = structuredClone([...t.memory.mandates.values()][0]);
    if (!a || !m) throw new Error("FIXTURE_REQUIRED");
    m.id = ORIGINAL_MANDATE_ID;
    a.mandateId = m.id;
    a.orderId = ORIGINAL_ORDER_ID;
    const before = JSON.stringify({ m, a });
    expect(originalReservationHold(t.actor, m, a)).toMatchObject({
      action: "OPERATOR_RESERVATION_HELD",
      attemptId: a.id,
    });
    expect(JSON.stringify({ m, a })).toBe(before);
    expect(() =>
      originalReservationHold({ ...t.actor, subjectId: "forged" }, m, a),
    ).toThrow("MANDATE_OWNER_REQUIRED");
    expect(() =>
      originalReservationHold(t.actor, m, { ...a, budgetState: "RELEASED" }),
    ).toThrow("ORIGINAL_UNRESOLVED_RESERVATION_REQUIRED");
    expect(() =>
      originalReservationHold(t.actor, m, { ...a, orderId: "OTHER" }),
    ).toThrow("ORIGINAL_UNRESOLVED_RESERVATION_REQUIRED");
  });
  it("authenticates and CSRF-protects audit-only intervention without accepting client evidence overrides", async () => {
    const t = await checkoutFixture(usEnv);
    const hold = vi.fn(async () => {});
    t.repository.recordOriginalHold = hold;
    expect(
      (
        await handleTestCheckout(
          t.request("hold-original"),
          "hold-original",
          t.runtime,
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await handleTestCheckout(
          t.request("hold-original", {}, t.cookie),
          "hold-original",
          t.runtime,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await handleTestCheckout(
          t.request("hold-original", { release: true }, t.cookie, t.csrf),
          "hold-original",
          t.runtime,
        )
      ).status,
    ).toBe(400);
    expect(hold).not.toHaveBeenCalled();
    expect(
      (
        await handleTestCheckout(
          t.request("hold-original", {}, t.cookie, t.csrf),
          "hold-original",
          t.runtime,
        )
      ).status,
    ).toBe(200);
    expect(hold).toHaveBeenCalledWith(t.actor);
    expect(t.gateway.getOrder).not.toHaveBeenCalled();
  });
});
