import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { PaymentError } from "./domain";
import type { VerifiedEvent } from "./repository";
import type { PayPalPaymentService } from "./service";

const eventSchema = z.object({
  id: z.string().regex(/^[A-Z0-9-]{1,100}$/),
  event_type: z.string().regex(/^[A-Z._]{1,100}$/),
  resource: z.object({
    id: z.string().min(1).max(100),
    custom_id: z.uuid().optional(),
    purchase_units: z
      .array(z.object({ custom_id: z.uuid().optional() }))
      .max(1)
      .optional(),
    supplementary_data: z
      .object({
        related_ids: z.object({ order_id: z.string().max(36).optional() }),
      })
      .optional(),
  }),
});
function canonical(value: unknown, depth = 0): string {
  if (depth > 32) throw new PaymentError("INVALID_WEBHOOK_EVENT");
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value))
    return `[${value.map((v) => canonical(v, depth + 1)).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map(
      (key) =>
        `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key], depth + 1)}`,
    )
    .join(",")}}`;
}
export function webhookHeaders(headers: Headers) {
  for (const [name, max] of [
    ["paypal-auth-algo", 100],
    ["paypal-cert-url", 500],
    ["paypal-transmission-id", 50],
    ["paypal-transmission-sig", 500],
    ["paypal-transmission-time", 100],
  ] as const) {
    const value = headers.get(name);
    if (!value || value.length > max)
      throw new PaymentError("INVALID_WEBHOOK_SIGNATURE");
  }
}
export class PayPalWebhookService {
  constructor(readonly payments: PayPalPaymentService) {}
  async receive(headers: Headers, body: string) {
    webhookHeaders(headers);
    if (Buffer.byteLength(body, "utf8") > 262144)
      throw new PaymentError("WEBHOOK_TOO_LARGE");
    let raw: unknown;
    try {
      raw = JSON.parse(body);
    } catch {
      throw new PaymentError("INVALID_WEBHOOK_EVENT");
    }
    const result = eventSchema.safeParse(raw);
    if (!result.success) throw new PaymentError("INVALID_WEBHOOK_EVENT");
    const digest = createHash("sha256").update(canonical(raw)).digest("hex");
    // The original full parsed event is sent, never the schema-stripped projection.
    await this.payments.gateway.verifyWebhook(headers, raw);
    const event = result.data;
    const attemptId =
      event.resource.custom_id ?? event.resource.purchase_units?.[0]?.custom_id;
    const orderHint = event.event_type.startsWith("CHECKOUT.ORDER.")
      ? event.resource.id
      : event.resource.supplementary_data?.related_ids.order_id;
    const row = await this.payments.repository.saveVerifiedEvent({
      id: event.id,
      type: event.event_type,
      resourceId: event.resource.id,
      ...(orderHint ? { orderId: orderHint } : {}),
      ...(attemptId ? { attemptId } : {}),
      digest,
      state: "PENDING",
      attempts: 0,
      nextRetryAt: new Date().toISOString(),
    });
    if (row.state === "PROCESSED" || row.state === "IGNORED")
      return { eventId: row.id, duplicate: true };
    await this.process(row);
    return { eventId: row.id, duplicate: false };
  }
  async process(event: VerifiedEvent) {
    const store = this.payments.repository;
    const orderEvent = [
      "CHECKOUT.ORDER.APPROVED",
      "CHECKOUT.ORDER.COMPLETED",
    ].includes(event.type);
    const captureEvent = [
      "PAYMENT.CAPTURE.COMPLETED",
      "PAYMENT.CAPTURE.PENDING",
      "PAYMENT.CAPTURE.DENIED",
    ].includes(event.type);
    if (!orderEvent && !captureEvent) {
      await store.finishEvent(event.id, "IGNORED");
      return;
    }
    try {
      let orderId = event.orderId;
      if (captureEvent) {
        const capture = await this.payments.gateway.getCapture(
          event.resourceId,
        );
        if (capture.id !== event.resourceId)
          throw new PaymentError("PAYPAL_CAPTURE_BINDING_MISMATCH");
        const trustedOrderId = capture.supplementary_data?.related_ids.order_id;
        if (trustedOrderId && orderId && trustedOrderId !== orderId)
          throw new PaymentError("PAYPAL_CAPTURE_BINDING_MISMATCH");
        orderId = trustedOrderId ?? orderId;
      }
      let a = orderId
        ? await store.findOrder(orderId)
        : await store.findCapture(event.resourceId);
      if (!a && event.attemptId) a = await store.findAttempt(event.attemptId);
      if (!a) throw new PaymentError("WEBHOOK_ATTEMPT_NOT_FOUND");
      orderId ??= a.orderId;
      if (!orderId) throw new PaymentError("WEBHOOK_ORDER_REFERENCE_REQUIRED");
      await this.payments.reconcileProviderReference(
        a.id,
        orderId,
        captureEvent ? event.resourceId : undefined,
      );
      await store.finishEvent(event.id, "PROCESSED");
    } catch (error) {
      await store.finishEvent(
        event.id,
        "RETRY",
        error instanceof PaymentError ? error.code : "RECONCILIATION_REQUIRED",
      );
      throw new PaymentError("WEBHOOK_RECONCILIATION_PENDING");
    }
  }
  /** Explicit worker invocation only. Recovery performs authenticated reads, never payments. */
  async recover(limit = 50) {
    const result: { id: string; processed: boolean }[] = [];
    for (const event of await this.payments.repository.pendingEvents(limit)) {
      try {
        await this.process(event);
        result.push({ id: event.id, processed: true });
      } catch {
        result.push({ id: event.id, processed: false });
      }
    }
    return result;
  }
}
