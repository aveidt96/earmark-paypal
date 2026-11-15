import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { NextRequest } from "next/server";
import { proxy } from "../src/proxy";
import { privateCheckoutOrigin } from "../src/lib/private-checkout-profile";
import { testCheckoutConfig } from "../src/server/paypal/test-config";
import { TestOwnerAuth } from "../src/server/paypal/test-auth";
import { handleTestCheckout } from "../src/server/paypal/test-http";
import { checkoutFixture, testEnv } from "./fixtures/paypal-checkout";

const hosted = {
  PAYPAL_TEST_HOSTING_PROFILE: "private-https",
  PAYPAL_TEST_GATEWAY_PROTECTED: "true",
  PAYPAL_TEST_ORIGIN: "https://checkout.example.com",
};
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("explicit private HTTPS checkout", () => {
  it("keeps loopback as default and builds exact hosted callbacks only with opt-in", () => {
    expect(privateCheckoutOrigin({})).toBeUndefined();
    expect(() =>
      testCheckoutConfig({
        ...testEnv,
        PAYPAL_TEST_ORIGIN: hosted.PAYPAL_TEST_ORIGIN,
      }),
    ).toThrow("LOOPBACK_TEST_ORIGIN_REQUIRED");
    const c = testCheckoutConfig({ ...testEnv, ...hosted });
    expect(c.settings.returnUrl).toBe(
      hosted.PAYPAL_TEST_ORIGIN + "/paypal-test?paypal_return=approved",
    );
    expect(c.settings.cancelUrl).toBe(
      hosted.PAYPAL_TEST_ORIGIN + "/paypal-test?paypal_return=cancelled",
    );
    expect(c.settings.credentialSellerOnly).toBe(true);
  });
  it.each([
    "http://checkout.example.com",
    "https://checkout.example.com/",
    "https://checkout.example.com/path",
    "https://checkout.example.com?x=1",
    "https://checkout.example.com#x",
    "https://user:pass@checkout.example.com",
    "https://*.example.com",
    "https://127.0.0.1",
    "https://localhost",
    "https://[::1]",
    "https://x.localhost",
    "https://checkout.example.com.",
    "https://CHECKOUT.example.com",
  ])("rejects noncanonical or unsafe origin %s", (origin) => {
    expect(() =>
      privateCheckoutOrigin({ ...hosted, PAYPAL_TEST_ORIGIN: origin }),
    ).toThrow();
  });
  it.each([
    { VERCEL: "1" },
    { AWS_EXECUTION_ENV: "nodejs" },
    { AWS_LAMBDA_FUNCTION_NAME: "test" },
    { NEXT_PUBLIC_DEMO_ONLY: "true" },
    { EARMARK_PUBLIC_DEMO_ONLY: "true" },
    { EARMARK_PUBLIC_RESEARCH_ENABLED: "true" },
    { PAYPAL_TEST_GATEWAY_PROTECTED: "false" },
    { PAYPAL_TEST_HOSTING_PROFILE: "typo" },
    { NODE_TLS_REJECT_UNAUTHORIZED: "0" },
  ])("rejects conflicting profile %#", (changes) => {
    expect(() => privateCheckoutOrigin({ ...hosted, ...changes })).toThrow();
  });
  it("fails closed if the private build loses its runtime opt-in", () => {
    expect(() =>
      privateCheckoutOrigin({ EARMARK_PRIVATE_CHECKOUT_BUILD: "true" }),
    ).toThrow();
  });
  it("does not reactivate historical US permissions or accept live API configuration", () => {
    for (const changes of [
      { PAYPAL_TEST_CAMPAIGN: "us-v1" },
      { PAYPAL_TEST_US_ORDER_ONCE: "task03e-existing-us-attempt" },
      { PAYPAL_BASE_URL: "https://api-m.paypal.com" },
      { PAYPAL_TEST_MERCHANT_BINDING: "wrong" },
    ])
      expect(() =>
        testCheckoutConfig({ ...testEnv, ...hosted, ...changes }),
      ).toThrow();
  });
  it("requires owner login, pinned Host, Origin and CSRF even behind a gateway", async () => {
    const t = await checkoutFixture(hosted);
    const request = (headers: Record<string, string> = {}) =>
      new Request("http://localhost:3030/api/paypal/test/capture", {
        method: "POST",
        headers: {
          Host: "checkout.example.com",
          Origin: hosted.PAYPAL_TEST_ORIGIN,
          Cookie: t.cookie,
          "X-Earmark-CSRF": t.csrf,
          ...headers,
        },
      });
    const logged = t.auth.login(request(), { password: t.config.loginSecret });
    expect(logged.cookie).toContain("Secure");
    expect(logged.cookie).toContain("HttpOnly");
    expect(logged.cookie).toContain("SameSite=Lax");
    expect(t.auth.principal(t.auth.authenticate(request(), true))).toEqual(
      t.actor,
    );
    for (const headers of [
      { Cookie: "", "Cf-Access-Authenticated-User-Email": "owner@example.com" },
      { Host: "evil.example", "X-Forwarded-Host": "checkout.example.com" },
      { Origin: "https://evil.example" },
      { "X-Earmark-CSRF": "wrong" },
    ])
      expect(() => t.auth.authenticate(request(headers), true)).toThrow();
    const noHost = new Request(hosted.PAYPAL_TEST_ORIGIN, {
      headers: { Cookie: t.cookie },
    });
    expect(() => t.auth.authenticate(noHost)).toThrow(
      "UNTRUSTED_REQUEST_ORIGIN",
    );
    const otherHost = new TestOwnerAuth(
      { ...t.config, origin: "https://other.example.com" },
      () => t.memory.now,
    );
    expect(() =>
      otherHost.authenticate(
        request({
          Host: "other.example.com",
          Origin: "https://other.example.com",
        }),
      ),
    ).toThrow();
    t.auth.logout(t.session);
    expect(() => t.auth.authenticate(request())).toThrow();
    const next = new TestOwnerAuth(
      { ...t.config, sessionEpoch: "f".repeat(64) },
      () => t.memory.now,
    );
    expect(() => next.authenticate(request())).toThrow();
    t.memory.now += 1800001;
    expect(() =>
      new TestOwnerAuth(t.config, () => t.memory.now).authenticate(request()),
    ).toThrow();
  });
  it("callback/query claims cannot authorize an order or capture", async () => {
    const t = await checkoutFixture(hosted);
    for (const query of [
      "paypal_return=approved&capture=true",
      "paypal_return=cancelled",
      "ownerId=other&token=FAKE&PayerID=FAKE",
    ]) {
      const request = new Request(
        hosted.PAYPAL_TEST_ORIGIN + "/api/paypal/test?" + query,
        { headers: { Host: "checkout.example.com", Cookie: t.cookie } },
      );
      expect(
        (await handleTestCheckout(request, undefined, t.runtime)).status,
      ).toBe(200);
    }
    expect(t.gateway.createOrder).not.toHaveBeenCalled();
    expect(t.gateway.captureOrder).not.toHaveBeenCalled();
    expect(t.memory.attempts.size).toBe(0);
    expect(t.memory.mandates.size).toBe(0);
    expect(
      (
        await handleTestCheckout(
          new Request(
            hosted.PAYPAL_TEST_ORIGIN +
              "/api/paypal/test?paypal_return=approved",
            { headers: { Host: "checkout.example.com" } },
          ),
          undefined,
          t.runtime,
        )
      ).status,
    ).toBe(401);
  });
  it("allows only private checkout routes and assets; ordinary public routing is unchanged", () => {
    for (const [key, value] of Object.entries(hosted)) vi.stubEnv(key, value);
    vi.stubEnv("EARMARK_PRIVATE_CHECKOUT_BUILD", "true");
    const req = (path: string, method = "GET", host = "checkout.example.com") =>
      new NextRequest("http://localhost:3030" + path, {
        method,
        headers: { Host: host, "X-Forwarded-Host": "checkout.example.com" },
      });
    for (const path of [
      "/paypal-test",
      "/paypal-test?paypal_return=approved&token=fake",
      "/api/paypal/test",
      "/_next/static/chunks/app.js",
      "/fonts/norway/inter-tight-0.woff2",
    ])
      expect(proxy(req(path)).status).toBe(200);
    expect(proxy(req("/api/paypal/test/capture", "POST")).status).toBe(200); // handler still requires auth/CSRF
    for (const path of [
      "/",
      "/judge",
      "/api/paypal/research",
      "/api/paypal/agent-checkout/capture",
      "/api/workspace",
      "/api/paypal/webhooks",
      "/api/paypal/test/capture-once",
      "/_next/image",
      "/.tools/test.json",
      "/paypal-test/extra",
    ])
      expect(proxy(req(path)).status).toBe(404);
    expect(proxy(req("/api/paypal/test/capture")).status).toBe(404);
    expect(proxy(req("/paypal-test", "POST")).status).toBe(404);
    expect(proxy(req("/paypal-test", "GET", "evil.example")).status).toBe(403);
    vi.stubEnv("PAYPAL_TEST_GATEWAY_PROTECTED", "false");
    expect(proxy(req("/paypal-test")).status).toBe(503);
    vi.stubEnv("PAYPAL_TEST_HOSTING_PROFILE", "");
    expect(proxy(req("/")).status).toBe(503);
    vi.stubEnv("EARMARK_PRIVATE_CHECKOUT_BUILD", "false");
    expect(proxy(req("/")).status).toBe(200);
  });
});

describe("integration preserves upstream production defaults", () => {
  it.each([
    {
      supplied: undefined,
      vercel: undefined,
      privateProfile: undefined,
      publicFlag: "true",
      marker: "false",
    },
    {
      supplied: "false",
      vercel: "production",
      privateProfile: undefined,
      publicFlag: "true",
      marker: "false",
    },
    {
      supplied: "false",
      vercel: undefined,
      privateProfile: "private-https",
      publicFlag: "false",
      marker: "true",
    },
  ])("keeps the expected public/private build mode (case %#)", async (c) => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_DEMO_ONLY", c.supplied);
    vi.stubEnv("VERCEL_ENV", c.vercel);
    vi.stubEnv("PAYPAL_TEST_HOSTING_PROFILE", c.privateProfile);
    vi.resetModules();
    const { default: config } = await import("../next.config");
    expect(config.env).toEqual({
      NEXT_PUBLIC_DEMO_ONLY: c.publicFlag,
      EARMARK_PRIVATE_CHECKOUT_BUILD: c.marker,
    });
  });
});
