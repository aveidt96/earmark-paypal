import "server-only";
import { z } from "zod";
import {
  type Attempt,
  externalIdSchema,
  PaymentError,
  toDecimal,
} from "./domain";
import {
  type PayPalSettings,
  type PayPalCheckoutSettings,
  type PayPalOAuthSettings,
  SANDBOX_BASE_URL,
} from "./config";
import { assertOrderScope } from "./us-order";
import { assertCaptureScope } from "./us-capture";

export class PayPalError extends PaymentError {
  constructor(
    code: string,
    readonly ambiguous = false,
    readonly httpStatus?: number,
  ) {
    super(code);
  }
}
const money = z.object({
  currency_code: z.string().length(3),
  value: z.string().max(32),
});
const capture = z.object({
  id: externalIdSchema,
  status: z.enum([
    "COMPLETED",
    "PENDING",
    "DECLINED",
    "DENIED",
    "FAILED",
    "REFUNDED",
    "PARTIALLY_REFUNDED",
  ]),
  amount: money,
  final_capture: z.boolean().optional(),
  supplementary_data: z
    .object({
      related_ids: z.object({ order_id: externalIdSchema.optional() }),
    })
    .optional(),
});
export const orderSchema = z.object({
  id: externalIdSchema,
  intent: z.literal("CAPTURE"),
  status: z.enum([
    "CREATED",
    "SAVED",
    "PAYER_ACTION_REQUIRED",
    "APPROVED",
    "COMPLETED",
    "VOIDED",
  ]),
  purchase_units: z
    .array(
      z.object({
        reference_id: z.string().max(256),
        custom_id: z.string().max(255),
        amount: money,
        payee: z.object({ merchant_id: z.string().max(36) }),
        payments: z
          .object({ captures: z.array(capture).max(1).optional() })
          .optional(),
      }),
    )
    .length(1),
  links: z
    .array(z.object({ rel: z.string().max(100), href: z.string().max(2048) }))
    .max(30)
    .optional(),
});
export type PayPalOrder = z.infer<typeof orderSchema>;
export type PayPalCapture = z.infer<typeof capture>;
type Dependencies = {
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  jitter?: () => number;
};
export class PayPalClient {
  private token:
    | {
        value: string;
        expiresAt: number;
        lifetimeSeconds: number;
        receivedAt: number;
      }
    | undefined;
  private tokenFlight: Promise<string> | undefined;
  private readonly fetcher: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private readonly jitter: () => number;
  constructor(
    readonly settings:
      PayPalSettings | PayPalCheckoutSettings | PayPalOAuthSettings,
    dependencies: Dependencies = {},
  ) {
    // Validate even when a caller bypasses the environment parser.
    if (
      settings.baseUrl !== SANDBOX_BASE_URL ||
      !Number.isInteger(settings.maxRetries) ||
      settings.maxRetries < 0 ||
      settings.maxRetries > 3 ||
      !Number.isInteger(settings.timeoutMs) ||
      settings.timeoutMs < 1 ||
      settings.timeoutMs > 15000
    )
      throw new PaymentError("INVALID_PAYPAL_CONFIGURATION");
    this.fetcher = dependencies.fetch ?? fetch;
    if (
      "orderOnlyPermission" in settings &&
      settings.orderOnlyPermission &&
      "captureOnlyPermission" in settings &&
      settings.captureOnlyPermission
    )
      throw new PaymentError("CONFLICTING_PAYMENT_PERMISSIONS");
    this.sleep =
      dependencies.sleep ??
      ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.now = dependencies.now ?? Date.now;
    this.jitter = dependencies.jitter ?? Math.random;
  }
  private async backoff(attempt: number) {
    await this.sleep(
      Math.min(2000, 200 * 2 ** attempt) + Math.floor(this.jitter() * 100),
    );
  }
  private async json(response: Response): Promise<unknown> {
    if (
      !response.headers.get("content-type")?.includes("application/json") ||
      !response.body
    )
      throw new PayPalError("PAYPAL_INVALID_RESPONSE");
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
      for (;;) {
        const next = await reader.read();
        if (next.done) break;
        bytes += next.value.byteLength;
        if (bytes > 262144) throw new PayPalError("PAYPAL_INVALID_RESPONSE");
        chunks.push(next.value);
      }
      return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  }
  async accessToken(): Promise<string> {
    if (this.token && this.now() < this.token.expiresAt)
      return this.token.value;
    if (this.tokenFlight) return this.tokenFlight;
    this.tokenFlight = this.obtainToken();
    try {
      return await this.tokenFlight;
    } finally {
      this.tokenFlight = undefined;
    }
  }
  /** Safe server-side diagnostics; never includes the token, app ID, scopes or credentials. */
  oauthCacheStatus() {
    return {
      cached: !!this.token && this.now() < this.token.expiresAt,
      tokenType: this.token ? ("Bearer" as const) : null,
      lifetimeSeconds: this.token?.lifetimeSeconds ?? null,
      receivedAtMs: this.token?.receivedAt ?? null,
      usableUntilMs: this.token?.expiresAt ?? null,
      expirySafetySeconds: 60,
    };
  }
  private async obtainToken() {
    for (let i = 0; i <= this.settings.maxRetries; i++) {
      try {
        const response = await this.fetcher(
          `${SANDBOX_BASE_URL}/v1/oauth2/token`,
          {
            method: "POST",
            headers: {
              Authorization: `Basic ${Buffer.from(`${this.settings.clientId}:${this.settings.clientSecret}`).toString("base64")}`,
              "Content-Type": "application/x-www-form-urlencoded",
              Accept: "application/json",
            },
            body: "grant_type=client_credentials",
            redirect: "error",
            cache: "no-store",
            signal: AbortSignal.timeout(this.settings.timeoutMs),
          },
        );
        if (!response.ok) {
          await response.body?.cancel();
          if (
            (response.status === 429 || response.status >= 500) &&
            i < this.settings.maxRetries
          ) {
            await this.backoff(i);
            continue;
          }
          throw new PayPalError(
            "PAYPAL_AUTHENTICATION_FAILED",
            false,
            response.status,
          );
        }
        const token = z
          .object({
            access_token: z.string().min(1).max(10000).regex(/^\S+$/),
            token_type: z.literal("Bearer"),
            expires_in: z.number().int().min(1).max(86400),
          })
          .safeParse(await this.json(response));
        if (!token.success)
          throw new PayPalError("PAYPAL_AUTHENTICATION_FAILED");
        const receivedAt = this.now();
        this.token = {
          value: token.data.access_token,
          lifetimeSeconds: token.data.expires_in,
          receivedAt,
          expiresAt:
            receivedAt + Math.max(0, token.data.expires_in - 60) * 1000,
        };
        return this.token.value;
      } catch (error) {
        if (error instanceof PayPalError) throw error;
        if (i === this.settings.maxRetries)
          throw new PayPalError("PAYPAL_AUTHENTICATION_UNAVAILABLE");
        await this.backoff(i);
      }
    }
    throw new PayPalError("PAYPAL_AUTHENTICATION_UNAVAILABLE");
  }
  private async request(
    path: string,
    body?: unknown,
    requestId?: string,
  ): Promise<unknown> {
    if (
      "captureOnlyPermission" in this.settings &&
      this.settings.captureOnlyPermission &&
      body !== undefined &&
      (path !==
        `/v2/checkout/orders/${this.settings.captureOnlyPermission.orderId}/capture` ||
        requestId !== this.settings.captureOnlyPermission.captureRequestId)
    )
      throw new PayPalError("ONE_SHOT_PAYMENT_OPERATION_FORBIDDEN");
    if (
      "orderOnlyPermission" in this.settings &&
      this.settings.orderOnlyPermission &&
      body !== undefined &&
      (path !== "/v2/checkout/orders" ||
        requestId !== this.settings.orderOnlyPermission.createRequestId)
    )
      throw new PayPalError("ONE_SHOT_PAYMENT_OPERATION_FORBIDDEN");
    const financial = requestId !== undefined;
    const retries = financial ? 0 : this.settings.maxRetries;
    for (let i = 0; i <= retries; i++) {
      const token = await this.accessToken(); // Token failure precedes financial dispatch.
      try {
        const response = await this.fetcher(SANDBOX_BASE_URL + path, {
          method: body === undefined ? "GET" : "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            Accept: "application/json",
            Prefer: "return=representation",
            ...(requestId ? { "PayPal-Request-Id": requestId } : {}),
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          cache: "no-store",
          redirect: "error",
          signal: AbortSignal.timeout(this.settings.timeoutMs),
        });
        if (!response.ok) {
          await response.body?.cancel();
          if (response.status === 401 && this.token?.value === token)
            this.token = undefined;
          if (
            [401, 408, 429].includes(response.status) ||
            response.status >= 500
          ) {
            if (i < retries) {
              await this.backoff(i);
              continue;
            }
          }
          throw new PayPalError(
            "PAYPAL_REQUEST_REJECTED",
            financial &&
              (response.status === 408 ||
                response.status === 409 ||
                response.status === 429 ||
                response.status >= 500),
            response.status,
          );
        }
        return await this.json(response);
      } catch (error) {
        if (
          error instanceof PayPalError &&
          error.code !== "PAYPAL_INVALID_RESPONSE"
        )
          throw error;
        if (i === retries)
          throw new PayPalError("PAYPAL_RESPONSE_UNCERTAIN", financial);
        await this.backoff(i);
      }
    }
    throw new PayPalError("PAYPAL_UNAVAILABLE");
  }
  private parsedOrder(raw: unknown, financial: boolean) {
    const result = orderSchema.safeParse(raw);
    if (!result.success)
      throw new PayPalError("PAYPAL_INVALID_ORDER", financial);
    return result.data;
  }
  private async financialOrder(raw: unknown, expectedId?: string) {
    const identity = z.object({ id: externalIdSchema }).safeParse(raw);
    if (!identity.success || (expectedId && identity.data.id !== expectedId))
      throw new PayPalError("PAYPAL_INVALID_ORDER", true);
    const full = orderSchema.safeParse(raw);
    if (full.success) return full.data;
    // Capture responses can omit purchase-unit terms, even with representation preference.
    // Resolve through canonical GET; GET failure must not be classified as a failed POST.
    try {
      return await this.getOrder(identity.data.id);
    } catch {
      throw new PayPalError("PAYPAL_RESPONSE_UNCERTAIN", true);
    }
  }
  async createOrder(a: Attempt) {
    if (
      "captureOnlyPermission" in this.settings &&
      this.settings.captureOnlyPermission
    )
      throw new PayPalError("PAYPAL_NEW_ORDERS_NOT_AUTHORIZED");
    if (
      "orderOnlyPermission" in this.settings &&
      this.settings.orderOnlyPermission
    )
      assertOrderScope(a, this.settings.orderOnlyPermission);
    if (a.state !== "CREATING")
      throw new PayPalError("PAYPAL_OPERATION_NOT_PREPARED");
    if (!("paymentsEnabled" in this.settings) || !this.settings.paymentsEnabled)
      throw new PayPalError("PAYPAL_PAYMENTS_DISABLED");
    if (a.merchantId !== this.settings.merchantId)
      throw new PayPalError("PAYPAL_MERCHANT_NOT_CONFIGURED");
    const raw = await this.request(
      "/v2/checkout/orders",
      {
        intent: "CAPTURE",
        purchase_units: [
          {
            reference_id: a.id,
            custom_id: a.id,
            invoice_id: a.id,
            ...(this.settings.credentialSellerOnly
              ? {}
              : { payee: { merchant_id: a.merchantId } }),
            amount: {
              currency_code: a.currency,
              value: toDecimal(a.amountMinor, a.currency),
            },
          },
        ],
        ...(this.settings.returnUrl && this.settings.cancelUrl
          ? {
              payment_source: {
                paypal: {
                  experience_context: {
                    return_url: this.settings.returnUrl,
                    cancel_url: this.settings.cancelUrl,
                    shipping_preference: "NO_SHIPPING",
                    user_action: "PAY_NOW",
                  },
                },
              },
            }
          : {}),
      },
      a.createRequestId,
    );
    return this.financialOrder(raw);
  }
  async getOrder(id: string) {
    if (!externalIdSchema.safeParse(id).success)
      throw new PaymentError("INVALID_PAYPAL_REFERENCE");
    const order = this.parsedOrder(
      await this.request(`/v2/checkout/orders/${id}`),
      false,
    );
    if (order.id !== id) throw new PayPalError("PAYPAL_INVALID_ORDER");
    return order;
  }
  async captureOrder(a: Attempt) {
    if (
      "captureOnlyPermission" in this.settings &&
      this.settings.captureOnlyPermission
    )
      assertCaptureScope(a, this.settings.captureOnlyPermission);
    if (
      "orderOnlyPermission" in this.settings &&
      this.settings.orderOnlyPermission
    )
      throw new PayPalError("PAYPAL_CAPTURE_NOT_AUTHORIZED");
    if (
      a.state !== "CAPTURING" ||
      !("merchantId" in this.settings) ||
      a.merchantId !== this.settings.merchantId
    )
      throw new PayPalError("PAYPAL_OPERATION_NOT_PREPARED");
    if (!this.settings.paymentsEnabled)
      throw new PayPalError("PAYPAL_PAYMENTS_DISABLED");
    if (!a.orderId || !externalIdSchema.safeParse(a.orderId).success)
      throw new PaymentError("INVALID_PAYPAL_REFERENCE");
    return this.financialOrder(
      await this.request(
        `/v2/checkout/orders/${a.orderId}/capture`,
        {},
        a.captureRequestId,
      ),
      a.orderId,
    );
  }
  async getCapture(id: string): Promise<PayPalCapture> {
    if (!externalIdSchema.safeParse(id).success)
      throw new PaymentError("INVALID_PAYPAL_REFERENCE");
    const result = capture.safeParse(
      await this.request(`/v2/payments/captures/${id}`),
    );
    if (!result.success) throw new PayPalError("PAYPAL_INVALID_CAPTURE");
    return result.data;
  }
  async verifyWebhook(headers: Headers, event: unknown) {
    if (
      !("webhookId" in this.settings) ||
      typeof this.settings.webhookId !== "string" ||
      !this.settings.webhookId
    )
      throw new PayPalError("PAYPAL_WEBHOOK_NOT_CONFIGURED");
    const fields: Record<string, string> = {};
    for (const [field, name, max] of [
      ["auth_algo", "paypal-auth-algo", 100],
      ["cert_url", "paypal-cert-url", 500],
      ["transmission_id", "paypal-transmission-id", 50],
      ["transmission_sig", "paypal-transmission-sig", 500],
      ["transmission_time", "paypal-transmission-time", 100],
    ] as const) {
      const value = headers.get(name);
      if (!value || value.length > max)
        throw new PaymentError("INVALID_WEBHOOK_SIGNATURE");
      fields[field] = value;
    }
    // We never fetch this untrusted URL. Only forward PayPal certificate URLs to PayPal's verifier.
    let cert: URL;
    try {
      cert = new URL(fields.cert_url ?? "");
    } catch {
      throw new PaymentError("INVALID_WEBHOOK_SIGNATURE");
    }
    if (
      cert.origin !== "https://api.sandbox.paypal.com" &&
      cert.origin !== SANDBOX_BASE_URL
    )
      throw new PaymentError("INVALID_WEBHOOK_SIGNATURE");
    if (
      cert.username ||
      cert.password ||
      cert.search ||
      cert.hash ||
      !cert.pathname.startsWith("/v1/notifications/certs/")
    )
      throw new PaymentError("INVALID_WEBHOOK_SIGNATURE");
    const result = await this.request(
      "/v1/notifications/verify-webhook-signature",
      {
        ...fields,
        webhook_id: this.settings.webhookId,
        webhook_event: event,
      },
    );
    if (
      !z.object({ verification_status: z.literal("SUCCESS") }).safeParse(result)
        .success
    )
      throw new PaymentError("INVALID_WEBHOOK_SIGNATURE");
  }
}
