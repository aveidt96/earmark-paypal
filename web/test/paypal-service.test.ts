import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { PayPalError } from "../src/server/paypal/client";
import { agent, fixture, orderFor, owner } from "./fixtures/paypal";

describe("approval-gated PayPal payment orchestration", () => {
  it("creates one durable order for concurrent/repeated requests", async () => {
    const t = await fixture();
    const results = await Promise.all([
      t.service.createOrder(owner, t.input),
      t.service.createOrder(owner, t.input),
    ]);
    const again = await t.service.createOrder(owner, t.input);
    expect(results[0]?.id).toBe(again.id);
    expect(t.gateway.createOrder).toHaveBeenCalledTimes(1);
    expect(again).toMatchObject({
      state: "AWAITING_APPROVAL",
      orderId: "ORDER123",
      budgetState: "RESERVED",
    });
    expect(again.approvalUrl).toContain("https://www.sandbox.paypal.com/");
    expect(t.repository.audit.some((e) => e.action === "CREATE_PREPARED")).toBe(
      true,
    );
  });
  it("rejects changed terms under a reused purchase key", async () => {
    const t = await fixture();
    await t.service.createOrder(owner, t.input);
    await expect(
      t.service.createOrder(owner, { ...t.input, amountMinor: "500" }),
    ).rejects.toThrow("IDEMPOTENCY_CONFLICT");
    expect(t.gateway.createOrder).toHaveBeenCalledTimes(1);
  });
  it("requires owner-only invocation and buyer approval before capture", async () => {
    const t = await fixture();
    await expect(t.service.createOrder(agent, t.input)).rejects.toThrow(
      "MANDATE_OWNER_REQUIRED",
    );
    const a = await t.service.createOrder(owner, t.input);
    await expect(t.service.capture(agent, a.id)).rejects.toThrow(
      "MANDATE_OWNER_REQUIRED",
    );
    await expect(t.service.capture(owner, a.id)).rejects.toThrow(
      "BUYER_APPROVAL_REQUIRED",
    );
    expect(t.gateway.captureOrder).not.toHaveBeenCalled();
  });
  it("captures only after a fresh trusted APPROVED read, consuming the reservation once", async () => {
    const t = await fixture();
    const a = await t.service.createOrder(owner, t.input);
    t.approve(a);
    const paid = await t.service.capture(owner, a.id);
    expect(paid).toMatchObject({
      state: "SUCCEEDED",
      captureId: "CAPTURE123",
      budgetState: "CONSUMED",
    });
    expect(t.repository.mandates.get(t.mandate.id)).toMatchObject({
      reservedMinor: "0",
      consumedMinor: "600",
    });
    expect(t.gateway.getOrder).toHaveBeenCalled();
    await t.service.capture(owner, a.id);
    expect(t.gateway.captureOrder).toHaveBeenCalledTimes(1);
  });
  it("serializes duplicate capture attempts with durable pre-dispatch state", async () => {
    const t = await fixture();
    const a = await t.service.createOrder(owner, t.input);
    t.approve(a);
    let release: (() => void) | undefined;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    let started: (() => void) | undefined;
    const entered = new Promise<void>((r) => {
      started = r;
    });
    t.gateway.captureOrder.mockImplementation(async (bound) => {
      expect(t.repository.attempts.get(a.id)?.state).toBe("CAPTURING");
      started?.();
      await gate;
      return orderFor(bound, "COMPLETED", "COMPLETED");
    });
    const first = t.service.capture(owner, a.id);
    await entered;
    await t.service.capture(owner, a.id);
    release?.();
    await first;
    expect(t.gateway.captureOrder).toHaveBeenCalledTimes(1);
  });
  it.each(["revoked", "expired"])(
    "rechecks %s policy immediately before capture",
    async (reason) => {
      const t = await fixture();
      const a = await t.service.createOrder(owner, t.input);
      t.approve(a);
      if (reason === "revoked")
        await t.service.revokeMandate(owner, t.mandate.id);
      else t.repository.now = Date.parse(t.mandate.expiresAt);
      await expect(t.service.capture(owner, a.id)).rejects.toThrow(
        reason === "revoked" ? "MANDATE_INACTIVE" : "MANDATE_EXPIRED",
      );
      expect(t.gateway.captureOrder).not.toHaveBeenCalled();
      expect(t.repository.mandates.get(t.mandate.id)?.reservedMinor).toBe(
        "600",
      );
    },
  );
  it("releases a definitely rejected creation and allows another distinct purchase", async () => {
    const t = await fixture();
    t.gateway.createOrder.mockRejectedValueOnce(
      new PayPalError("PAYPAL_REQUEST_REJECTED", false, 422),
    );
    const a = await t.service.createOrder(owner, t.input);
    expect(a).toMatchObject({ state: "FAILED", budgetState: "RELEASED" });
    expect(t.repository.mandates.get(t.mandate.id)?.reservedMinor).toBe("0");
    await t.service.createOrder(owner, { ...t.input, purchaseKey: "second" });
    expect(t.gateway.createOrder).toHaveBeenCalledTimes(2);
  });
  it("holds an ambiguous order creation and never repeats POST for the same intent", async () => {
    const t = await fixture();
    t.gateway.createOrder.mockRejectedValueOnce(
      new PayPalError("PAYPAL_RESPONSE_UNCERTAIN", true),
    );
    const a = await t.service.createOrder(owner, t.input);
    expect(a).toMatchObject({
      state: "CREATE_UNCERTAIN",
      budgetState: "RESERVED",
    });
    await t.service.createOrder(owner, t.input);
    await t.service.recover();
    expect(t.gateway.createOrder).toHaveBeenCalledTimes(1);
    expect(t.gateway.captureOrder).not.toHaveBeenCalled();
    await expect(t.service.cancelReservation(owner, a.id)).rejects.toThrow(
      "RECONCILIATION_REQUIRED",
    );
    t.setOrder(orderFor(a, "APPROVED"));
    expect(
      (await t.service.reconcileWithOrderId(owner, a.id, "ORDER123")).state,
    ).toBe("APPROVED");
  });
  it("holds a capture timeout, then reconciles completion without a second capture", async () => {
    const t = await fixture();
    const a = await t.service.createOrder(owner, t.input);
    t.approve(a);
    t.gateway.captureOrder.mockRejectedValueOnce(
      new PayPalError("PAYPAL_RESPONSE_UNCERTAIN", true),
    );
    const uncertain = await t.service.capture(owner, a.id);
    expect(uncertain).toMatchObject({
      state: "CAPTURE_UNCERTAIN",
      budgetState: "RESERVED",
    });
    await t.service.capture(owner, a.id);
    expect(t.gateway.captureOrder).toHaveBeenCalledTimes(1);
    t.setOrder(orderFor(a, "COMPLETED", "COMPLETED"));
    expect((await t.service.reconcile(a.id)).state).toBe("SUCCEEDED");
    expect(t.repository.mandates.get(t.mandate.id)?.consumedMinor).toBe("600");
  });
  it("does not reopen a pending capture after an out-of-order APPROVED read", async () => {
    const t = await fixture();
    const a = await t.service.createOrder(owner, t.input);
    t.approve(a);
    t.gateway.captureOrder.mockResolvedValueOnce(
      orderFor(a, "COMPLETED", "PENDING"),
    );
    expect((await t.service.capture(owner, a.id)).state).toBe("PENDING");
    t.approve(a);
    expect((await t.service.capture(owner, a.id)).state).toBe("PENDING");
    expect(t.gateway.captureOrder).toHaveBeenCalledTimes(1);
  });
  it("does not release a reservation merely because capture GET fails", async () => {
    const t = await fixture();
    const a = await t.service.createOrder(owner, t.input);
    t.gateway.getOrder.mockRejectedValueOnce(
      new PayPalError("PAYPAL_RESPONSE_UNCERTAIN"),
    );
    await expect(t.service.reconcile(a.id)).rejects.toThrow(
      "PAYPAL_RESPONSE_UNCERTAIN",
    );
    expect(t.repository.mandates.get(t.mandate.id)?.reservedMinor).toBe("600");
  });
  it("reconciles an actual denied capture and releases exactly once", async () => {
    const t = await fixture();
    const a = await t.service.createOrder(owner, t.input);
    t.setOrder(orderFor(a, "COMPLETED", "DECLINED"));
    const denied = await t.service.reconcile(a.id);
    expect(denied.state).toBe("FAILED");
    await t.service.reconcile(a.id);
    expect(t.repository.mandates.get(t.mandate.id)).toMatchObject({
      reservedMinor: "0",
      consumedMinor: "0",
    });
  });
  it("revocation preserves in-flight reservations and still records real completion", async () => {
    const t = await fixture();
    const a = await t.service.createOrder(owner, t.input);
    await t.service.revokeMandate(owner, t.mandate.id);
    expect(t.repository.mandates.get(t.mandate.id)?.reservedMinor).toBe("600");
    t.setOrder(orderFor(a, "COMPLETED", "COMPLETED"));
    await t.service.reconcile(a.id);
    expect(t.repository.mandates.get(t.mandate.id)).toMatchObject({
      status: "REVOKED",
      consumedMinor: "600",
    });
  });
  it("allows rollback only for a reservation that was never dispatched", async () => {
    const t = await fixture();
    const a = await t.service.reserve(agent, t.input);
    expect((await t.service.cancelReservation(owner, a.id)).state).toBe(
      "CANCELLED",
    );
    expect(t.repository.mandates.get(t.mandate.id)?.reservedMinor).toBe("0");
    expect(t.gateway.createOrder).not.toHaveBeenCalled();
  });
  it("a read-only recovery run cannot capture an APPROVED order", async () => {
    const t = await fixture();
    const a = await t.service.createOrder(owner, t.input);
    t.approve(a);
    expect(await t.service.recover()).toEqual([
      { id: a.id, state: "APPROVED" },
    ]);
    expect(t.gateway.captureOrder).not.toHaveBeenCalled();
    expect(t.repository.mandates.get(t.mandate.id)?.reservedMinor).toBe("600");
  });
  it("stores a failed reconciliation diagnostic without releasing funds", async () => {
    const t = await fixture();
    const a = await t.service.createOrder(owner, t.input);
    t.gateway.getOrder.mockRejectedValueOnce(
      new PayPalError("PAYPAL_REQUEST_REJECTED"),
    );
    expect(await t.service.recover()).toEqual([
      { id: a.id, state: "RECONCILIATION_REQUIRED" },
    ]);
    expect(t.repository.attempts.get(a.id)?.errorCode).toBe(
      "PAYPAL_REQUEST_REJECTED",
    );
    expect(t.repository.mandates.get(t.mandate.id)?.reservedMinor).toBe("600");
  });
  it.each([
    "merchant",
    "amount",
    "currency",
    "custom_id",
    "reference_id",
    "order_id",
    "capture_amount",
    "partial_capture",
  ])("rejects provider substitution: %s", async (change) => {
    const t = await fixture();
    const a = await t.service.createOrder(owner, t.input);
    const order = orderFor(a, "COMPLETED", "COMPLETED"),
      u = order.purchase_units[0];
    if (!u) throw new Error("FIXTURE");
    if (change === "merchant") u.payee.merchant_id = "ZZZZZZZZZZZZZ";
    if (change === "amount") u.amount.value = "7.00";
    if (change === "currency") u.amount.currency_code = "EUR";
    if (change === "custom_id") u.custom_id = "wrong";
    if (change === "reference_id") u.reference_id = "wrong";
    if (change === "order_id") order.id = "OTHERORDER";
    const c = u.payments?.captures?.[0];
    if (change === "capture_amount" && c) c.amount.value = "5.99";
    if (change === "partial_capture" && c) c.final_capture = false;
    t.setOrder(order);
    await expect(t.service.reconcile(a.id)).rejects.toThrow(
      "PAYPAL_ORDER_BINDING_MISMATCH",
    );
    expect(t.repository.mandates.get(t.mandate.id)).toMatchObject({
      reservedMinor: "600",
      consumedMinor: "0",
    });
    expect(t.repository.attempts.get(a.id)?.state).toBe("REVIEW_REQUIRED");
  });
  it("cannot replace immutable terms or ledger entries during repository mutations", async () => {
    const t = await fixture();
    const a = await t.service.reserve(agent, t.input);
    await expect(
      t.repository.mutate(a.mandateId, { id: a.id }, (tx) => {
        if (tx.attempt) tx.attempt.createRequestId = crypto.randomUUID();
      }),
    ).rejects.toThrow("PAYMENT_TERMS_IMMUTABLE");
    await expect(
      t.repository.mutate(a.mandateId, { id: a.id }, (tx) => {
        tx.mandate.reservedMinor = "0";
      }),
    ).rejects.toThrow("BUDGET_LEDGER_MISMATCH");
    expect(t.repository.mandates.get(t.mandate.id)?.reservedMinor).toBe("600");
  });
});
