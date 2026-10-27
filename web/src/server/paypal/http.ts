import "server-only";
import { PaymentError } from "./domain";
import { getPayPalWebhooks } from "./runtime";
import { webhookHeaders, type PayPalWebhookService } from "./webhooks";

/** Public ingress authenticates only with PayPal's documented webhook signature. */
export async function handlePayPalWebhook(
  request: Request,
  service: () => Promise<PayPalWebhookService> = getPayPalWebhooks,
) {
  const headers = { "Cache-Control": "no-store" };
  try {
    webhookHeaders(request.headers);
    if (!request.headers.get("content-type")?.startsWith("application/json"))
      throw new PaymentError("INVALID_WEBHOOK_EVENT");
    if (Number(request.headers.get("content-length") ?? 0) > 262144)
      throw new PaymentError("WEBHOOK_TOO_LARGE");
    const reader = request.body?.getReader();
    if (!reader) throw new PaymentError("INVALID_WEBHOOK_EVENT");
    const parts: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const next = await reader.read();
        if (next.done) break;
        size += next.value.byteLength;
        if (size > 262144) throw new PaymentError("WEBHOOK_TOO_LARGE");
        parts.push(next.value);
      }
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
    const body = Buffer.concat(parts).toString("utf8");
    try {
      JSON.parse(body);
    } catch {
      throw new PaymentError("INVALID_WEBHOOK_EVENT");
    }
    const result = await (await service()).receive(request.headers, body);
    return Response.json(result, { headers });
  } catch (error) {
    const code =
      error instanceof PaymentError ? error.code : "PAYPAL_WEBHOOK_UNAVAILABLE";
    const status =
      code === "INVALID_WEBHOOK_SIGNATURE"
        ? 401
        : code === "WEBHOOK_TOO_LARGE"
          ? 413
          : code === "INVALID_WEBHOOK_EVENT"
            ? 400
            : 503;
    // No raw PayPal/database error, payload, customer data or secrets in responses/logs.
    return Response.json({ error: code }, { status, headers });
  }
}
