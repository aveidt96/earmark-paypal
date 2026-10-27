import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { TestOwnerAuth } from "../src/server/paypal/test-auth";
import { testCheckoutConfig } from "../src/server/paypal/test-config";
import { checkoutFixture, testEnv } from "./fixtures/paypal-checkout";

describe("allowlisted loopback test-owner authentication", () => {
  it("accepts framework-normalized internal URLs only with the exact configured Host", async () => {
    const t = await checkoutFixture();
    const normalized = new Request("http://localhost:3030/api/paypal/test", {
      headers: { Host: "127.0.0.1:3030", Cookie: t.cookie },
    });
    expect(t.auth.authenticate(normalized).owner).toBe(t.config.ownerId);
    normalized.headers.set("host", "evil.example");
    expect(() => t.auth.authenticate(normalized)).toThrow(
      "UNTRUSTED_REQUEST_ORIGIN",
    );
  });
  it("issues a signed HttpOnly, SameSite session and derives the owner only server-side", async () => {
    const t = await checkoutFixture();
    const login = t.auth.login(t.request("login"), {
      password: t.config.loginSecret,
    });
    expect(login.cookie).toContain("HttpOnly");
    expect(login.cookie).toContain("SameSite=Lax");
    expect(login.cookie).toContain("Max-Age=1800");
    const s = t.auth.authenticate(t.request(undefined, {}, t.cookie));
    expect(t.auth.principal(s)).toEqual(t.actor);
    expect(s.csrf).toHaveLength(64);
  });
  it.each([
    { password: "wrong" },
    { password: testEnv.PAYPAL_TEST_LOGIN_SECRET, ownerId: "other" },
    {
      password: testEnv.PAYPAL_TEST_LOGIN_SECRET,
      agentId: "other",
      role: "owner",
    },
  ])(
    "rejects bad credentials or frontend identity injection (case %#)",
    async (raw) => {
      const t = await checkoutFixture();
      expect(() => t.auth.login(t.request("login"), raw)).toThrow();
    },
  );
  it("rejects unsigned, tampered and even correctly signed but unallowlisted owner payloads", async () => {
    const t = await checkoutFixture();
    for (const value of ["", `${t.cookie}x`])
      expect(() =>
        t.auth.authenticate(t.request(undefined, {}, value)),
      ).toThrow("TEST_OWNER_AUTH_REQUIRED");
    const payload = Buffer.from(
      JSON.stringify({ ...t.session, owner: "paypal-test-owner-other" }),
    ).toString("base64url");
    const sig = createHmac("sha256", t.config.sessionSecret)
      .update(`${t.config.sessionEpoch}\0${payload}`)
      .digest("base64url");
    expect(() =>
      t.auth.authenticate(
        t.request(
          undefined,
          {},
          `earmark_paypal_test_session=${payload}.${sig}`,
        ),
      ),
    ).toThrow("TEST_OWNER_AUTH_REQUIRED");
  });
  it("rejects expiry, revoked logout sessions and prior-server cookies", async () => {
    const t = await checkoutFixture();
    t.auth.logout(t.session);
    expect(() =>
      t.auth.authenticate(t.request(undefined, {}, t.cookie)),
    ).toThrow("TEST_OWNER_AUTH_REQUIRED");
    const fresh = new TestOwnerAuth(t.config, () => t.memory.now);
    t.memory.now += 1800000;
    expect(() =>
      fresh.authenticate(t.request(undefined, {}, t.cookie)),
    ).toThrow("TEST_OWNER_AUTH_REQUIRED");
    const next = new TestOwnerAuth(
      { ...t.config, sessionEpoch: "f".repeat(64) },
      () => 0,
    );
    expect(() => next.authenticate(t.request(undefined, {}, t.cookie))).toThrow(
      "TEST_OWNER_AUTH_REQUIRED",
    );
  });
  it("requires both exact Origin and session CSRF on mutations", async () => {
    const t = await checkoutFixture();
    expect(() =>
      t.auth.authenticate(t.request("capture", {}, t.cookie), true),
    ).toThrow("TEST_CSRF_REQUIRED");
    expect(() =>
      t.auth.authenticate(t.request("capture", {}, t.cookie, "wrong"), true),
    ).toThrow("TEST_CSRF_REQUIRED");
    expect(() =>
      t.auth.authenticate(
        t.request("capture", {}, t.cookie, t.csrf, "https://evil.example"),
        true,
      ),
    ).toThrow("UNTRUSTED_REQUEST_ORIGIN");
    expect(
      t.auth.authenticate(t.request("capture", {}, t.cookie, t.csrf), true)
        .owner,
    ).toBe(t.config.ownerId);
  });
  it("rejects Host spoofing and bounds local login guessing", async () => {
    const t = await checkoutFixture();
    const bad = t.request(undefined, {}, t.cookie);
    bad.headers.set("host", "evil.example");
    expect(() => t.auth.authenticate(bad)).toThrow("UNTRUSTED_REQUEST_ORIGIN");
    for (let i = 0; i < 5; i++)
      expect(() =>
        t.auth.login(t.request("login"), { password: "wrong" }),
      ).toThrow("TEST_OWNER_AUTH_REQUIRED");
    expect(() =>
      t.auth.login(t.request("login"), { password: t.config.loginSecret }),
    ).toThrow("TEST_LOGIN_RATE_LIMITED");
    t.memory.now += 61000;
    expect(
      t.auth.login(t.request("login"), { password: t.config.loginSecret })
        .session.owner,
    ).toBe(t.config.ownerId);
  });
  it.each([
    { PAYPAL_TEST_CHECKOUT_ENABLED: "false" },
    { VERCEL: "1" },
    { AWS_EXECUTION_ENV: "Lambda" },
    { PAYPAL_TEST_ORIGIN: "https://public.example" },
    { PAYPAL_BASE_URL: "https://api-m.paypal.com" },
    { PAYPAL_TEST_MERCHANT_BINDING: "incorrect" },
    { PAYPAL_TEST_OWNER_ID: "arbitrary-owner" },
  ])("rejects disabled/hosted/Live/unconfirmed scope (case %#)", (changes) => {
    expect(() => testCheckoutConfig({ ...testEnv, ...changes })).toThrow();
  });
});
