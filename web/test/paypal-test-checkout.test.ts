import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { handleTestCheckout } from "../src/server/paypal/test-http";
import {
  testMandateId,
  testCheckoutGateway,
} from "../src/server/paypal/test-checkout";
import { PayPalClient, PayPalError } from "../src/server/paypal/client";
import { checkoutFixture } from "./fixtures/paypal-checkout";
import { orderFor } from "./fixtures/paypal";

describe("authenticated fixed-budget Sandbox checkout boundary", () => {
  it("does not initialize a database/client for unauthenticated create or capture", async () => {
    const t = await checkoutFixture();
    expect(
      (await handleTestCheckout(t.request(), undefined, t.runtime)).status,
    ).toBe(401);
    for (const action of ["mandate", "order", "capture"])
      expect(
        (await handleTestCheckout(t.request(action), action, t.runtime)).status,
      ).toBe(401);
    expect(t.checkout).not.toHaveBeenCalled();
    expect(t.gateway.createOrder).not.toHaveBeenCalled();
  });
  it.each([
    { ownerId: "other" },
    { agentId: "other" },
    { merchantId: "other" },
    { amountMinor: "1001" },
    { currency: "EUR" },
    { purchaseKey: "fresh-retry" },
    { mandateId: "other" },
  ])(
    "rejects client policy/identity/idempotency overrides (case %#)",
    async (payload) => {
      const t = await checkoutFixture();
      const response = await handleTestCheckout(
        t.request("order", payload, t.cookie, t.csrf),
        "order",
        t.runtime,
      );
      expect(response.status).toBe(400);
      expect(t.checkout).not.toHaveBeenCalled();
    },
  );
  it("supports one stable $10 mandate, one $6 reservation/order and authoritative $4 accounting", async () => {
    const t = await checkoutFixture();
    const call = (action: string) =>
      handleTestCheckout(
        t.request(action, {}, t.cookie, t.csrf),
        action,
        t.runtime,
      );
    const first = await (await call("mandate")).json();
    const again = await (await call("mandate")).json();
    expect(first.mandate.id).toBe(again.mandate.id);
    expect(first.mandate.id).toBe(testMandateId(t.config.ownerId));
    expect(t.memory.mandates.size).toBe(1);
    const reserved = await (await call("reserve")).json();
    expect(reserved).toMatchObject({
      authorizedMinor: "1000",
      reservedMinor: "600",
      capturedMinor: "0",
      availableMinor: "400",
    });
    const ordered = await (await call("order")).json();
    expect(ordered.attempt.state).toBe("AWAITING_APPROVAL");
    await call("order");
    expect(t.gateway.createOrder).toHaveBeenCalledTimes(1);
    expect((await call("capture")).status).toBe(409);
    expect(t.gateway.captureOrder).not.toHaveBeenCalled();
    const a = [...t.memory.attempts.values()][0];
    if (!a) throw new Error("MISSING_ATTEMPT");
    t.approve(a);
    expect((await (await call("approval")).json()).attempt.state).toBe(
      "APPROVED",
    );
    const paid = await (await call("capture")).json();
    expect(paid).toMatchObject({
      paymentConfirmed: true,
      capturedMinor: "600",
      reservedMinor: "0",
      availableMinor: "400",
    });
    await call("capture");
    expect(t.gateway.captureOrder).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(paid)).not.toContain(t.config.loginSecret);
    expect(JSON.stringify(paid)).not.toContain(t.config.sessionSecret);
  });
  it("a frontend approval/cancel return parameter never sets remote approval or success", async () => {
    const t = await checkoutFixture();
    await t.service.mandate(t.actor);
    await t.service.action(t.actor, "order");
    const returned = new Request(
      `${t.config.origin}/api/paypal/test?paypal_return=approved&ownerId=other`,
      { headers: { Cookie: t.cookie } },
    );
    const result = await (
      await handleTestCheckout(returned, undefined, t.runtime)
    ).json();
    expect(result.attempt.state).toBe("AWAITING_APPROVAL");
    expect(result.paymentConfirmed).toBe(false);
    expect(t.gateway.getOrder).not.toHaveBeenCalled();
    expect(t.gateway.captureOrder).not.toHaveBeenCalled();
  });
  it("rechecks active/expiry and owner even after PayPal reports approval", async () => {
    const t = await checkoutFixture();
    await t.service.mandate(t.actor);
    await t.service.action(t.actor, "order");
    const a = [...t.memory.attempts.values()][0];
    if (!a) throw new Error("MISSING_ATTEMPT");
    t.approve(a);
    await t.service.payments.revokeMandate(t.actor, a.mandateId);
    await expect(t.service.action(t.actor, "capture")).rejects.toThrow(
      "MANDATE_INACTIVE",
    );
    await expect(
      t.service.mandate({ ...t.actor, subjectId: "other" }),
    ).rejects.toThrow("MANDATE_OWNER_REQUIRED");
    expect(t.gateway.captureOrder).not.toHaveBeenCalled();
  });
  it("local cancellation before dispatch releases; after order dispatch revokes but retains safe accounting", async () => {
    const first = await checkoutFixture();
    await first.service.mandate(first.actor);
    await first.service.action(first.actor, "reserve");
    expect(await first.service.action(first.actor, "cancel")).toMatchObject({
      reservedMinor: "0",
      capturedMinor: "0",
      availableMinor: "1000",
    });
    const t = await checkoutFixture();
    await t.service.mandate(t.actor);
    await t.service.action(t.actor, "order");
    const result = await t.service.action(t.actor, "cancel");
    expect(result).toMatchObject({
      mandate: { status: "REVOKED" },
      reservedMinor: "600",
      capturedMinor: "0",
      availableMinor: "400",
    });
    expect(result.attempt?.approvalUrl).toBeNull();
    expect(t.gateway.captureOrder).not.toHaveBeenCalled();
  });
  it("ambiguous and pending captures never create another capture or claim success", async () => {
    const t = await checkoutFixture();
    await t.service.mandate(t.actor);
    await t.service.action(t.actor, "order");
    const a = [...t.memory.attempts.values()][0];
    if (!a) throw new Error("MISSING_ATTEMPT");
    t.approve(a);
    t.gateway.captureOrder.mockRejectedValueOnce(
      new PayPalError("PAYPAL_RESPONSE_UNCERTAIN", true),
    );
    expect(await t.service.action(t.actor, "capture")).toMatchObject({
      attempt: { state: "CAPTURE_UNCERTAIN" },
      reservedMinor: "600",
      capturedMinor: "0",
      paymentConfirmed: false,
    });
    await t.service.action(t.actor, "capture");
    expect(t.gateway.captureOrder).toHaveBeenCalledTimes(1);
    t.setOrder(orderFor(a, "COMPLETED", "PENDING"));
    expect(await t.service.action(t.actor, "recover")).toMatchObject({
      attempt: { state: "PENDING" },
      reservedMinor: "600",
      paymentConfirmed: false,
    });
  });
  it("merchant substitution is rejected before exposing approval or allowing capture", async () => {
    const t = await checkoutFixture();
    await t.service.mandate(t.actor);
    await t.service.action(t.actor, "reserve");
    const a = [...t.memory.attempts.values()][0];
    if (!a) throw new Error("MISSING_ATTEMPT");
    const bad = orderFor(a);
    if (bad.purchase_units[0])
      bad.purchase_units[0].payee.merchant_id = "ZZZZZZZZZZZZZ";
    t.gateway.createOrder.mockResolvedValueOnce(bad);
    await expect(t.service.action(t.actor, "order")).rejects.toThrow(
      "PAYPAL_ORDER_BINDING_MISMATCH",
    );
    expect(await t.service.snapshot(t.actor)).toMatchObject({
      attempt: { state: "REVIEW_REQUIRED", approvalUrl: null },
      capturedMinor: "0",
      reservedMinor: "600",
    });
  });
  it("fixed intent rejects concurrent duplicate order creation without a second reservation", async () => {
    const t = await checkoutFixture();
    await t.service.mandate(t.actor);
    await Promise.all(
      Array.from({ length: 8 }, () => t.service.action(t.actor, "order")),
    );
    expect(t.gateway.createOrder).toHaveBeenCalledTimes(1);
    expect(t.memory.attempts.size).toBe(1);
    expect(await t.service.snapshot(t.actor)).toMatchObject({
      reservedMinor: "600",
      availableMinor: "400",
    });
  });
  it("read-only recovery remains available with financial execution disabled", async () => {
    const t = await checkoutFixture();
    await t.service.mandate(t.actor);
    await t.service.action(t.actor, "order");
    t.config.settings.paymentsEnabled = false;
    await expect(t.service.action(t.actor, "capture")).rejects.toThrow(
      "PAYPAL_PAYMENTS_DISABLED",
    );
    expect((await t.service.action(t.actor, "recover")).capturedMinor).toBe(
      "0",
    );
    expect(t.gateway.captureOrder).not.toHaveBeenCalled();
  });
  it("uses credential-owned default seller and server-fixed approval/cancel URLs", async () => {
    const t = await checkoutFixture();
    await t.service.mandate(t.actor);
    await t.service.action(t.actor, "reserve");
    const a = [...t.memory.attempts.values()][0];
    if (!a) throw new Error("MISSING_ATTEMPT");
    a.state = "CREATING";
    const json = (value: unknown) =>
      new Response(JSON.stringify(value), {
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
      .mockResolvedValueOnce(json(orderFor(a)));
    await new PayPalClient(t.config.settings, { fetch: transport }).createOrder(
      a,
    );
    const payload = JSON.parse(String(transport.mock.calls[1]?.[1]?.body));
    expect(payload.purchase_units[0].payee).toBeUndefined();
    expect(payload.payment_source.paypal.experience_context).toMatchObject({
      return_url: `${t.config.origin}/paypal-test?paypal_return=approved`,
      cancel_url: `${t.config.origin}/paypal-test?paypal_return=cancelled`,
    });
    expect(JSON.stringify(payload)).not.toContain(
      "ORDER_COMPLETE_ON_PAYMENT_APPROVAL",
    );
  });
  it("canonical capture GET failure after a successful POST is ambiguous and cannot consume budget", async () => {
    const t = await checkoutFixture();
    await t.service.mandate(t.actor);
    await t.service.action(t.actor, "reserve");
    const a = [...t.memory.attempts.values()][0];
    if (!a) throw new Error("MISSING_ATTEMPT");
    a.state = "CAPTURING";
    a.orderId = "ORDER123";
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
      .mockResolvedValueOnce(json(orderFor(a, "COMPLETED", "COMPLETED")))
      .mockResolvedValueOnce(json({}, 404));
    const gateway = testCheckoutGateway(
      new PayPalClient(t.config.settings, { fetch: transport }),
    );
    await expect(gateway.captureOrder(a)).rejects.toMatchObject({
      code: "PAYPAL_CAPTURE_RECONCILIATION_REQUIRED",
      ambiguous: true,
    });
    expect(t.memory.mandates.get(a.mandateId)?.consumedMinor).toBe("0");
  });
});
