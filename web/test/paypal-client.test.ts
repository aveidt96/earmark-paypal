import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { PayPalClient, PayPalError } from "../src/server/paypal/client";
import {
  paypalSettings,
  SANDBOX_BASE_URL,
  type PayPalSettings,
} from "../src/server/paypal/config";
import { fixture, merchant, orderFor, owner } from "./fixtures/paypal";

const settings: PayPalSettings = {
  baseUrl: SANDBOX_BASE_URL,
  clientId: "test-client",
  clientSecret: "test-secret",
  webhookId: "WEBHOOK123",
  merchantId: merchant,
  paymentsEnabled: true,
  timeoutMs: 1000,
  maxRetries: 2,
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
const token = () =>
  json({
    access_token: "fake-access-token",
    token_type: "Bearer",
    expires_in: 120,
  });
async function bound() {
  const t = await fixture();
  const a = await t.service.reserve(owner, t.input);
  a.state = "CREATING";
  return a;
}
const signatureHeaders = () =>
  new Headers({
    "paypal-auth-algo": "SHA256withRSA",
    "paypal-cert-url":
      "https://api.sandbox.paypal.com/v1/notifications/certs/CERT123",
    "paypal-transmission-id": "transmission-123",
    "paypal-transmission-sig": "fake-signature",
    "paypal-transmission-time": "2026-10-25T12:00:00Z",
  });

describe("PayPal Sandbox HTTP boundary (mock transport only)", () => {
  it.each(["create", "capture"])(
    "resolves a partial %s POST response through canonical GET",
    async (operation) => {
      const a = await bound();
      if (operation === "capture") {
        a.state = "CAPTURING";
        a.orderId = "ORDER123";
      }
      const full =
        operation === "capture"
          ? orderFor(a, "COMPLETED", "COMPLETED")
          : orderFor(a);
      const fetcher = vi
        .fn<typeof fetch>()
        .mockImplementationOnce(async () => token())
        .mockImplementationOnce(async () =>
          json({ id: "ORDER123", status: full.status }),
        )
        .mockImplementationOnce(async () => json(full));
      const client = new PayPalClient(settings, { fetch: fetcher });
      expect(
        await (operation === "capture"
          ? client.captureOrder(a)
          : client.createOrder(a)),
      ).toEqual(full);
      expect(fetcher.mock.calls[2]?.[0]).toBe(
        `${SANDBOX_BASE_URL}/v2/checkout/orders/ORDER123`,
      );
      expect(fetcher.mock.calls[2]?.[1]?.method).toBe("GET");
    },
  );
  it("a failed canonical read after financial success remains ambiguous", async () => {
    const a = await bound();
    a.state = "CAPTURING";
    a.orderId = "ORDER123";
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(async () => token())
      .mockImplementationOnce(async () =>
        json({ id: "ORDER123", status: "COMPLETED" }),
      )
      .mockImplementationOnce(async () => json({}, 404));
    await expect(
      new PayPalClient(settings, { fetch: fetcher }).captureOrder(a),
    ).rejects.toMatchObject({
      ambiguous: true,
      code: "PAYPAL_RESPONSE_UNCERTAIN",
    });
    expect(
      fetcher.mock.calls.filter(([, init]) => init?.method === "POST"),
    ).toHaveLength(2); // OAuth + one capture.
  });
  it("coalesces OAuth tokens, caches with expiry skew and renews them", async () => {
    let now = 0;
    const fetcher = vi.fn<typeof fetch>(async () => token());
    const client = new PayPalClient(settings, {
      fetch: fetcher,
      now: () => now,
    });
    expect(
      await Promise.all(Array.from({ length: 20 }, () => client.accessToken())),
    ).toEqual(Array(20).fill("fake-access-token"));
    expect(fetcher).toHaveBeenCalledTimes(1);
    now = 60001;
    await client.accessToken();
    expect(fetcher).toHaveBeenCalledTimes(2);
    const [, init] = fetcher.mock.calls[0] ?? [];
    expect(init?.body).toBe("grant_type=client_credentials");
    expect(new Headers(init?.headers).get("Authorization")).toBe(
      `Basic ${Buffer.from("test-client:test-secret").toString("base64")}`,
    );
    expect(init?.redirect).toBe("error");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });
  it("creates one purchase unit with immutable merchant, exact decimal and persisted request ID", async () => {
    const a = await bound();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(async () => token())
      .mockImplementationOnce(async () => json(orderFor(a)));
    const client = new PayPalClient(settings, { fetch: fetcher });
    await client.createOrder(a);
    const [url, init] = fetcher.mock.calls[1] ?? [];
    expect(url).toBe(`${SANDBOX_BASE_URL}/v2/checkout/orders`);
    expect(new Headers(init?.headers).get("PayPal-Request-Id")).toBe(
      a.createRequestId,
    );
    expect(JSON.parse(String(init?.body))).toEqual({
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: a.id,
          custom_id: a.id,
          invoice_id: a.id,
          payee: { merchant_id: merchant },
          amount: { currency_code: "USD", value: "6.00" },
        },
      ],
    });
  });
  it("uses a different stable capture key and sends no arbitrary payer/payment source", async () => {
    const a = await bound();
    a.state = "CAPTURING";
    a.orderId = "ORDER123";
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(async () => token())
      .mockImplementationOnce(async () =>
        json(orderFor(a, "COMPLETED", "COMPLETED")),
      );
    await new PayPalClient(settings, { fetch: fetcher }).captureOrder(a);
    const [, init] = fetcher.mock.calls[1] ?? [];
    expect(new Headers(init?.headers).get("PayPal-Request-Id")).toBe(
      a.captureRequestId,
    );
    expect(a.captureRequestId).not.toBe(a.createRequestId);
    expect(init?.body).toBe("{}");
  });
  it("retries only safe reads with bounded exponential backoff", async () => {
    const a = await bound();
    const sleep = vi.fn(async (_ms: number) => {});
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(async () => token())
      .mockImplementationOnce(async () => json({}, 503))
      .mockRejectedValueOnce(new Error("network-private-detail"))
      .mockImplementationOnce(async () => json(orderFor(a)));
    await new PayPalClient(settings, {
      fetch: fetcher,
      sleep,
      jitter: () => 0,
    }).getOrder("ORDER123");
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([200, 400]);
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
  it("invalidates a 401 token before a bounded safe-read retry", async () => {
    const a = await bound(),
      sleep = vi.fn(async () => {});
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(async () => token())
      .mockImplementationOnce(async () => json({}, 401))
      .mockImplementationOnce(async () => token())
      .mockImplementationOnce(async () => json(orderFor(a)));
    await new PayPalClient(settings, { fetch: fetcher, sleep }).getOrder(
      "ORDER123",
    );
    expect(
      fetcher.mock.calls.filter(([url]) => String(url).endsWith("/token")),
    ).toHaveLength(2);
  });
  it.each(["create", "capture"])(
    "does not retry an ambiguous %s POST",
    async (operation) => {
      const a = await bound();
      if (operation === "capture") {
        a.state = "CAPTURING";
        a.orderId = "ORDER123";
      }
      const fetcher = vi
        .fn<typeof fetch>()
        .mockImplementationOnce(async () => token())
        .mockRejectedValueOnce(new DOMException("test-secret", "TimeoutError"));
      const client = new PayPalClient(settings, { fetch: fetcher });
      try {
        await (operation === "create"
          ? client.createOrder(a)
          : client.captureOrder(a));
        throw new Error("EXPECTED_FAILURE");
      } catch (error) {
        expect(error).toBeInstanceOf(PayPalError);
        expect((error as PayPalError).ambiguous).toBe(true);
        expect(String(error)).not.toContain("test-secret");
      }
      expect(fetcher).toHaveBeenCalledTimes(2);
    },
  );
  it.each([
    [503, true],
    [408, true],
    [409, true],
    [429, true],
    [422, false],
    [401, false],
  ] as const)(
    "classifies HTTP %s without exposing response details",
    async (status, ambiguous) => {
      const a = await bound();
      const fetcher = vi
        .fn<typeof fetch>()
        .mockImplementationOnce(async () => token())
        .mockImplementationOnce(async () =>
          json({ secret: "test-secret" }, status),
        );
      await expect(
        new PayPalClient(settings, { fetch: fetcher }).createOrder(a),
      ).rejects.toMatchObject({
        code: "PAYPAL_REQUEST_REJECTED",
        ambiguous,
        httpStatus: status,
      });
      expect(fetcher).toHaveBeenCalledTimes(2);
    },
  );
  it.each(["malformed", "oversized", "wrong-content-type"])(
    "holds financial outcome for %s successful response",
    async (kind) => {
      const a = await bound();
      const response =
        kind === "malformed"
          ? new Response("{", {
              headers: { "Content-Type": "application/json" },
            })
          : kind === "oversized"
            ? json({ huge: "x".repeat(262144) })
            : new Response("secret upstream HTML");
      const fetcher = vi
        .fn<typeof fetch>()
        .mockImplementationOnce(async () => token())
        .mockImplementationOnce(async () => response);
      await expect(
        new PayPalClient(settings, { fetch: fetcher }).createOrder(a),
      ).rejects.toMatchObject({ ambiguous: true });
    },
  );
  it("cannot enable live/arbitrary endpoints, path injection, or unprepared payments", async () => {
    for (const url of [
      "https://api-m.paypal.com",
      "https://evil.test",
      "http://api-m.sandbox.paypal.com",
      `${SANDBOX_BASE_URL}/evil`,
      `${SANDBOX_BASE_URL}?q=x`,
    ])
      expect(() => paypalSettings({ PAYPAL_BASE_URL: url })).toThrow(
        "PAYPAL_SANDBOX_ONLY",
      );
    expect(
      () =>
        new PayPalClient({
          ...settings,
          baseUrl: "https://evil.test" as typeof SANDBOX_BASE_URL,
        }),
    ).toThrow("INVALID_PAYPAL_CONFIGURATION");
    const fetcher = vi.fn<typeof fetch>();
    const client = new PayPalClient(settings, { fetch: fetcher });
    await expect(client.getOrder("../orders")).rejects.toThrow(
      "INVALID_PAYPAL_REFERENCE",
    );
    const a = await bound();
    a.state = "RESERVED";
    await expect(client.createOrder(a)).rejects.toThrow(
      "PAYPAL_OPERATION_NOT_PREPARED",
    );
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("keeps payments disabled independently of backend/read-only OAuth configuration", async () => {
    const a = await bound(),
      fetcher = vi.fn<typeof fetch>();
    await expect(
      new PayPalClient(
        { ...settings, paymentsEnabled: false },
        { fetch: fetcher },
      ).createOrder(a),
    ).rejects.toThrow("PAYPAL_PAYMENTS_DISABLED");
    expect(fetcher).not.toHaveBeenCalled();
    expect(() => paypalSettings({})).toThrow("PAYPAL_BACKEND_DISABLED");
    expect(() => paypalSettings({ PAYPAL_BACKEND_ENABLED: "true" })).toThrow(
      "PAYPAL_CREDENTIALS_REQUIRED",
    );
  });
  it("verifies the complete webhook with server-configured webhook ID and transmission headers", async () => {
    const raw = {
      id: "WH-123",
      event_type: "PAYMENT.CAPTURE.COMPLETED",
      resource: { id: "CAPTURE123", additional: "preserve" },
      extra: { signed: true },
    };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(async () => token())
      .mockImplementationOnce(async () =>
        json({ verification_status: "SUCCESS" }),
      );
    await new PayPalClient(settings, { fetch: fetcher }).verifyWebhook(
      signatureHeaders(),
      raw,
    );
    const [url, init] = fetcher.mock.calls[1] ?? [];
    expect(url).toBe(
      `${SANDBOX_BASE_URL}/v1/notifications/verify-webhook-signature`,
    );
    expect(JSON.parse(String(init?.body))).toMatchObject({
      webhook_id: "WEBHOOK123",
      webhook_event: raw,
      auth_algo: "SHA256withRSA",
      transmission_id: "transmission-123",
    });
  });
  it("rejects non-success signatures and untrusted certificate URLs", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(async () => token())
      .mockImplementationOnce(async () =>
        json({ verification_status: "FAILURE" }),
      );
    const client = new PayPalClient(settings, { fetch: fetcher });
    await expect(client.verifyWebhook(signatureHeaders(), {})).rejects.toThrow(
      "INVALID_WEBHOOK_SIGNATURE",
    );
    for (const cert of [
      "https://evil.test/cert",
      "http://169.254.169.254/",
      "not a url",
      `${SANDBOX_BASE_URL}/wrong`,
    ]) {
      const headers = signatureHeaders();
      headers.set("paypal-cert-url", cert);
      await expect(client.verifyWebhook(headers, {})).rejects.toThrow(
        "INVALID_WEBHOOK_SIGNATURE",
      );
    }
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("bounds failed OAuth attempts and never exposes credentials", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => {
      throw new Error("test-secret");
    });
    const client = new PayPalClient(settings, {
      fetch: fetcher,
      sleep: async () => {},
    });
    await expect(client.accessToken()).rejects.toThrow(
      "PAYPAL_AUTHENTICATION_UNAVAILABLE",
    );
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
});
