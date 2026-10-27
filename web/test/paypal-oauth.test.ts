import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  paypalOAuthSettings,
  paypalSettings,
  SANDBOX_BASE_URL,
} from "../src/server/paypal/config";
import { PayPalClient, PayPalError } from "../src/server/paypal/client";
import { fixture, owner } from "./fixtures/paypal";

// All unit credentials/responses are synthetic. No process.env credentials or real fetch.
const env = {
  PAYPAL_CLIENT_ID: "unit-client",
  PAYPAL_CLIENT_SECRET: "unit-secret",
};
function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
const valid = (expires = 120) =>
  response({
    access_token: "unit-access-token-only",
    token_type: "Bearer",
    expires_in: expires,
  });
describe("OAuth-only configuration, parsing, cache and sanitized failures (mocked)", () => {
  it("requires no invented merchant/webhook or enabled backend/payment flag for OAuth", () => {
    const settings = paypalOAuthSettings(env);
    expect(settings.baseUrl).toBe(SANDBOX_BASE_URL);
    expect("merchantId" in settings).toBe(false);
    expect("webhookId" in settings).toBe(false);
    expect("paymentsEnabled" in settings).toBe(false);
  });
  it("retains full backend/merchant/webhook requirements for checkout configuration", () => {
    expect(() => paypalSettings(env)).toThrow("PAYPAL_BACKEND_DISABLED");
    expect(() =>
      paypalSettings({ ...env, PAYPAL_BACKEND_ENABLED: "true" }),
    ).toThrow("PAYPAL_CREDENTIALS_REQUIRED");
    expect(() =>
      paypalSettings({
        ...env,
        PAYPAL_BACKEND_ENABLED: "true",
        PAYPAL_WEBHOOK_ID: "WEBHOOK123",
      }),
    ).toThrow("INVALID_PAYMENT_INPUT");
  });
  it.each([
    { PAYPAL_CLIENT_ID: "unit-client" },
    { PAYPAL_CLIENT_SECRET: "unit-secret" },
    { PAYPAL_CLIENT_ID: " ", PAYPAL_CLIENT_SECRET: "unit-secret" },
  ])(
    "rejects missing/blank OAuth credentials without echoing values",
    (incomplete) => {
      expect(() => paypalOAuthSettings(incomplete)).toThrow(
        "PAYPAL_CREDENTIALS_REQUIRED",
      );
    },
  );
  it.each([
    "https://api-m.paypal.com",
    "http://api-m.sandbox.paypal.com",
    `${SANDBOX_BASE_URL}/wrong`,
    `${SANDBOX_BASE_URL}?q=bad`,
  ])("rejects non-Sandbox origin %s", (base) => {
    expect(() =>
      paypalOAuthSettings({ ...env, PAYPAL_BASE_URL: base }),
    ).toThrow("PAYPAL_SANDBOX_ONLY");
  });
  it("rejects Live environment before sending any authentication request", () => {
    expect(() =>
      paypalOAuthSettings({ ...env, PAYPAL_ENVIRONMENT: "live" }),
    ).toThrow("PAYPAL_SANDBOX_ONLY");
  });
  it("an OAuth-only client cannot create/capture or verify webhooks", async () => {
    const transport = vi.fn<typeof fetch>(),
      client = new PayPalClient(paypalOAuthSettings(env), { fetch: transport });
    const t = await fixture(),
      a = await t.service.reserve(owner, t.input);
    a.state = "CREATING";
    await expect(client.createOrder(a)).rejects.toThrow(
      "PAYPAL_PAYMENTS_DISABLED",
    );
    a.state = "CAPTURING";
    a.orderId = "ORDER123";
    await expect(client.captureOrder(a)).rejects.toThrow(
      "PAYPAL_OPERATION_NOT_PREPARED",
    );
    await expect(client.verifyWebhook(new Headers(), {})).rejects.toThrow(
      "PAYPAL_WEBHOOK_NOT_CONFIGURED",
    );
    expect(transport).not.toHaveBeenCalled();
  });
  it.each([
    { access_token: "", token_type: "Bearer", expires_in: 120 },
    { access_token: " ", token_type: "Bearer", expires_in: 120 },
    { access_token: "unit-token", token_type: "bearer", expires_in: 120 },
    { access_token: "unit-token", token_type: "MAC", expires_in: 120 },
    { access_token: "unit-token", token_type: "Bearer", expires_in: "120" },
    { access_token: "unit-token", token_type: "Bearer", expires_in: 0 },
    { access_token: "unit-token", token_type: "Bearer", expires_in: -1 },
    { access_token: "unit-token", token_type: "Bearer", expires_in: 1.5 },
    { access_token: "unit-token", token_type: "Bearer", expires_in: 86401 },
  ])("does not cache malformed OAuth data (case %#)", async (payload) => {
    const transport = vi.fn<typeof fetch>(async () => response(payload));
    const client = new PayPalClient(paypalOAuthSettings(env), {
      fetch: transport,
    });
    await expect(client.accessToken()).rejects.toThrow(
      "PAYPAL_AUTHENTICATION_FAILED",
    );
    expect(client.oauthCacheStatus()).toMatchObject({
      cached: false,
      tokenType: null,
      lifetimeSeconds: null,
    });
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it("interprets expiry seconds, applies 60-second skew and refreshes at the exact cache boundary", async () => {
    let now = 1000;
    const transport = vi.fn<typeof fetch>(async () => valid());
    const client = new PayPalClient(paypalOAuthSettings(env), {
      fetch: transport,
      now: () => now,
    });
    await client.accessToken();
    expect(client.oauthCacheStatus()).toEqual({
      cached: true,
      tokenType: "Bearer",
      lifetimeSeconds: 120,
      receivedAtMs: 1000,
      usableUntilMs: 61000,
      expirySafetySeconds: 60,
    });
    now = 60999;
    await client.accessToken();
    expect(transport).toHaveBeenCalledTimes(1);
    now = 61000;
    expect(client.oauthCacheStatus().cached).toBe(false);
    await client.accessToken();
    expect(transport).toHaveBeenCalledTimes(2);
    expect(client.oauthCacheStatus().usableUntilMs).toBe(121000);
    expect(JSON.stringify(client.oauthCacheStatus())).not.toContain(
      "unit-access-token-only",
    );
  });
  it.each([1, 30, 60])(
    "does not reuse a token with only %s seconds of lifetime",
    async (seconds) => {
      const transport = vi.fn<typeof fetch>(async () => valid(seconds));
      const client = new PayPalClient(paypalOAuthSettings(env), {
        fetch: transport,
        now: () => 0,
      });
      await client.accessToken();
      expect(client.oauthCacheStatus().cached).toBe(false);
      await client.accessToken();
      expect(transport).toHaveBeenCalledTimes(2);
    },
  );
  it.each([400, 401, 403])(
    "sanitizes mocked HTTP %s credential failures without retrying bad credentials",
    async (status) => {
      const transport = vi.fn<typeof fetch>(async () =>
        response(
          {
            error: "invalid_client",
            error_description: "unit-secret",
            access_token: "sensitive-unit-response-token",
          },
          status,
        ),
      );
      const client = new PayPalClient(paypalOAuthSettings(env), {
        fetch: transport,
      });
      let caught: unknown;
      try {
        await client.accessToken();
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(PayPalError);
      expect(caught).toMatchObject({
        code: "PAYPAL_AUTHENTICATION_FAILED",
        httpStatus: status,
        ambiguous: false,
      });
      const printable =
        String(caught) +
        JSON.stringify(caught) +
        JSON.stringify(client.oauthCacheStatus());
      expect(printable).not.toContain("unit-secret");
      expect(printable).not.toContain("sensitive-unit-response-token");
      expect(client.oauthCacheStatus().cached).toBe(false);
      expect(transport).toHaveBeenCalledTimes(1);
    },
  );
  it("bounds transient authentication retries and backs off", async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(async () => response({}, 503))
      .mockImplementationOnce(async () => valid());
    const sleep = vi.fn(async (_ms: number) => {});
    const client = new PayPalClient(paypalOAuthSettings(env), {
      fetch: transport,
      sleep,
      jitter: () => 0,
    });
    await client.accessToken();
    expect(transport).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(200);
  });
});
