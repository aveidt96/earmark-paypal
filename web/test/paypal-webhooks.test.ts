import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { PaymentError } from "../src/server/paypal/domain";
import { PayPalError } from "../src/server/paypal/client";
import { PayPalWebhookService } from "../src/server/paypal/webhooks";
import { handlePayPalWebhook } from "../src/server/paypal/http";
import { fixture, orderFor, owner } from "./fixtures/paypal";

function headers() {
  return new Headers({
    "content-type": "application/json",
    "paypal-auth-algo": "SHA256withRSA",
    "paypal-cert-url":
      "https://api.sandbox.paypal.com/v1/notifications/certs/TEST",
    "paypal-transmission-id": "test-123",
    "paypal-transmission-time": "2026-10-25T12:00:00Z",
    "paypal-transmission-sig": "test-signature",
  });
}
function event(
  id = "WH-1",
  type = "PAYMENT.CAPTURE.COMPLETED",
  resourceId = "CAPTURE123",
) {
  return {
    id,
    event_type: type,
    resource: { id: resourceId },
    create_time: "2026-10-25T12:00:00Z",
    extra: "preserve signed fields",
  };
}
async function setup() {
  const t = await fixture();
  const a = await t.service.createOrder(owner, t.input);
  t.setOrder(orderFor(a, "COMPLETED", "COMPLETED"));
  const webhook = new PayPalWebhookService(t.service);
  const request = (body: unknown, h = headers()) =>
    new Request("https://app.example/api/paypal/webhooks", {
      method: "POST",
      headers: h,
      body: JSON.stringify(body),
    });
  const call = (body: unknown, h = headers()) =>
    handlePayPalWebhook(request(body, h), async () => webhook);
  return { ...t, a, webhook, call };
}
describe("verified webhook inbox and reconciliation", () => {
  it("uses verified event order hints only after canonical order/capture membership validation", async () => {
    const t = await setup();
    t.gateway.getCapture.mockResolvedValue({
      id: "CAPTURE123",
      status: "COMPLETED",
      final_capture: true,
      amount: { currency_code: "USD", value: "6.00" },
    });
    const raw = {
      ...event(),
      resource: {
        id: "CAPTURE123",
        supplementary_data: { related_ids: { order_id: "ORDER123" } },
      },
    };
    expect((await t.call(raw)).status).toBe(200);
    expect(t.repository.attempts.get(t.a.id)?.state).toBe("SUCCEEDED");
  });
  it("rejects invalid signatures before any event storage or payment mutation", async () => {
    const t = await setup();
    t.gateway.verifyWebhook.mockRejectedValueOnce(
      new PaymentError("INVALID_WEBHOOK_SIGNATURE"),
    );
    const response = await t.call(event());
    expect(response.status).toBe(401);
    expect(t.repository.events.size).toBe(0);
    expect(t.gateway.getOrder).not.toHaveBeenCalled();
    expect(t.repository.mandates.get(t.mandate.id)?.reservedMinor).toBe("600");
  });
  it("uses verified complete event, authenticated capture/order GETs and exactly-once ledger consumption", async () => {
    const t = await setup();
    const raw = event();
    expect((await t.call(raw)).status).toBe(200);
    expect(t.gateway.verifyWebhook).toHaveBeenCalledWith(
      expect.any(Headers),
      raw,
    );
    expect(t.gateway.getCapture).toHaveBeenCalledWith("CAPTURE123");
    expect(t.repository.mandates.get(t.mandate.id)).toMatchObject({
      reservedMinor: "0",
      consumedMinor: "600",
    });
    const duplicate = await t.call(raw);
    expect(await duplicate.json()).toMatchObject({ duplicate: true });
    expect(t.gateway.verifyWebhook).toHaveBeenCalledTimes(2);
    expect(t.repository.mandates.get(t.mandate.id)?.consumedMinor).toBe("600");
    expect(t.gateway.captureOrder).not.toHaveBeenCalled();
  });
  it("deduplicates concurrent deliveries without duplicate budget changes", async () => {
    const t = await setup();
    const results = await Promise.all([
      t.call(event()),
      t.call(event()),
      t.call(event()),
    ]);
    expect(results.every((r) => r.status === 200)).toBe(true);
    expect(t.repository.events.size).toBe(1);
    expect(t.repository.mandates.get(t.mandate.id)?.consumedMinor).toBe("600");
  });
  it("handles out-of-order events using current provider state, never frontend/event status", async () => {
    const t = await setup();
    await t.call(event("WH-NEW", "PAYMENT.CAPTURE.PENDING"));
    expect(t.repository.attempts.get(t.a.id)?.state).toBe("SUCCEEDED");
    t.setOrder(orderFor(t.a, "APPROVED"));
    await t.call(event("WH-OLD", "CHECKOUT.ORDER.APPROVED", "ORDER123"));
    expect(t.repository.attempts.get(t.a.id)?.state).toBe("SUCCEEDED");
    expect(t.repository.mandates.get(t.mandate.id)?.consumedMinor).toBe("600");
  });
  it("persists webhook failures with backoff and recovers without creating or capturing", async () => {
    const t = await setup();
    t.gateway.getOrder.mockRejectedValueOnce(
      new PayPalError("PAYPAL_RESPONSE_UNCERTAIN"),
    );
    expect((await t.call(event())).status).toBe(503);
    expect(t.repository.events.get("WH-1")).toMatchObject({
      state: "RETRY",
      attempts: 1,
    });
    expect(await t.webhook.recover()).toEqual([]);
    t.repository.now += 3000;
    expect(await t.webhook.recover()).toEqual([
      { id: "WH-1", processed: true },
    ]);
    expect(t.repository.events.get("WH-1")?.state).toBe("PROCESSED");
    expect(t.gateway.createOrder).toHaveBeenCalledTimes(1);
    expect(t.gateway.captureOrder).not.toHaveBeenCalled();
  });
  it("does not trust a completed event when capture API says PENDING", async () => {
    const t = await setup();
    t.gateway.getCapture.mockResolvedValue({
      id: "CAPTURE123",
      status: "PENDING",
      final_capture: true,
      amount: { currency_code: "USD", value: "6.00" },
      supplementary_data: { related_ids: { order_id: "ORDER123" } },
    });
    expect((await t.call(event())).status).toBe(200);
    expect(t.repository.attempts.get(t.a.id)?.state).toBe("PENDING");
    expect(t.repository.mandates.get(t.mandate.id)?.reservedMinor).toBe("600");
  });
  it("rejects a verified event-ID collision rather than adopting changed content", async () => {
    const t = await setup();
    await t.call(event());
    const response = await t.call({ ...event(), extra: "changed" });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "WEBHOOK_ID_COLLISION" });
  });
  it("records unsupported verified event types without payment changes", async () => {
    const t = await setup();
    expect(
      (await t.call(event("WH-OTHER", "CUSTOMER.DISPUTE.CREATED"))).status,
    ).toBe(200);
    expect(t.repository.events.get("WH-OTHER")?.state).toBe("IGNORED");
    expect(t.gateway.getCapture).not.toHaveBeenCalled();
  });
  it("keeps unknown-attempt events recoverable for eventual correlation", async () => {
    const t = await setup();
    t.gateway.getCapture.mockResolvedValueOnce({
      id: "CAPTURE123",
      status: "COMPLETED",
      amount: { currency_code: "USD", value: "6.00" },
      final_capture: true,
      supplementary_data: { related_ids: { order_id: "UNKNOWNORDER" } },
    });
    expect((await t.call(event())).status).toBe(503);
    expect(t.repository.events.get("WH-1")?.state).toBe("RETRY");
  });
  it("correlates a verified webhook arriving after an ambiguous create via immutable custom_id", async () => {
    const t = await fixture();
    t.gateway.createOrder.mockRejectedValueOnce(
      new PayPalError("PAYPAL_RESPONSE_UNCERTAIN", true),
    );
    const a = await t.service.createOrder(owner, t.input);
    t.setOrder(orderFor(a, "COMPLETED", "COMPLETED"));
    const webhook = new PayPalWebhookService(t.service);
    const raw = { ...event(), resource: { id: "CAPTURE123", custom_id: a.id } };
    await webhook.receive(headers(), JSON.stringify(raw));
    expect(t.repository.attempts.get(a.id)).toMatchObject({
      orderId: "ORDER123",
      state: "SUCCEEDED",
    });
    expect(t.gateway.createOrder).toHaveBeenCalledTimes(1);
  });
  it("rejects trusted data with a substituted merchant and keeps reservation for review", async () => {
    const t = await setup();
    const wrong = orderFor(t.a, "COMPLETED", "COMPLETED");
    const unit = wrong.purchase_units[0];
    if (unit) unit.payee.merchant_id = "ZZZZZZZZZZZZZ";
    t.setOrder(wrong);
    expect((await t.call(event())).status).toBe(503);
    expect(t.repository.mandates.get(t.mandate.id)?.reservedMinor).toBe("600");
    expect(t.repository.events.get("WH-1")?.state).toBe("RETRY");
  });
  it("rejects missing signature headers, malformed JSON and oversized streaming bodies before processing", async () => {
    const factory = vi.fn(async () => {
      throw new Error("SHOULD_NOT_START");
    });
    expect(
      (
        await handlePayPalWebhook(
          new Request("https://app.example/", { method: "POST", body: "{}" }),
          factory,
        )
      ).status,
    ).toBe(401);
    const t = await setup();
    const invalid = await handlePayPalWebhook(
      new Request("https://app.example/", {
        method: "POST",
        headers: headers(),
        body: "{",
      }),
      async () => t.webhook,
    );
    expect(invalid.status).toBe(400);
    const huge = await handlePayPalWebhook(
      new Request("https://app.example/", {
        method: "POST",
        headers: headers(),
        body: " ".repeat(262145),
      }),
      factory,
    );
    expect(huge.status).toBe(413);
    expect(factory).not.toHaveBeenCalled();
  });
  it("sanitizes unexpected failures and never returns raw errors", async () => {
    const t = await setup();
    t.gateway.verifyWebhook.mockRejectedValueOnce(
      new Error("private customer info test-secret"),
    );
    const response = await t.call(event());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "PAYPAL_WEBHOOK_UNAVAILABLE",
    });
  });
});
