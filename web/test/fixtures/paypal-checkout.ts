import { vi } from "vitest";
import { MemoryPaymentRepository, fixture, merchant } from "./paypal";
import {
  testCheckoutConfig,
  merchantBinding,
} from "../../src/server/paypal/test-config";
import { TestOwnerAuth } from "../../src/server/paypal/test-auth";
import {
  TestCheckoutService,
  type TestCheckoutRepository,
} from "../../src/server/paypal/test-checkout";

export const testEnv = {
  PAYPAL_CLIENT_ID: "unit-checkout-client",
  PAYPAL_CLIENT_SECRET: "unit-checkout-secret",
  PAYPAL_MERCHANT_ID: merchant,
  PAYPAL_ENVIRONMENT: "sandbox",
  PAYPAL_BACKEND_ENABLED: "true",
  PAYPAL_PAYMENTS_ENABLED: "true",
  PAYPAL_TEST_CHECKOUT_ENABLED: "true",
  PAYPAL_TEST_ORIGIN: "http://127.0.0.1:3030",
  PAYPAL_TEST_OWNER_ID: "paypal-test-owner-11111111111111111111111111111111",
  PAYPAL_TEST_LOGIN_SECRET: "unit-login-secret-that-is-only-a-fixture-123456",
  PAYPAL_TEST_SESSION_SECRET:
    "unit-session-signing-secret-that-is-only-a-fixture-123456789",
  PAYPAL_TEST_SESSION_EPOCH: "e".repeat(64),
  PAYPAL_TEST_MERCHANT_BINDING: merchantBinding(
    "unit-checkout-client",
    merchant,
  ),
};
export const usEnv = {
  PAYPAL_TEST_CAMPAIGN: "us-v1",
  PAYPAL_TEST_ORIGIN: "http://127.0.0.1:3031",
  PAYPAL_TEST_US_SELLER_CONFIRMED: "true",
  PAYPAL_PAYMENTS_ENABLED: "false",
  PAYPAL_CLIENT_ID: "unit-us-app",
  PAYPAL_MERCHANT_ID: "ZZZZZZZZZZZZZ",
  PAYPAL_TEST_MERCHANT_BINDING: merchantBinding("unit-us-app", "ZZZZZZZZZZZZZ"),
};
export async function checkoutFixture(
  envOverrides: Record<string, string> = {},
) {
  const base = await fixture(),
    memory = new MemoryPaymentRepository();
  const repository: TestCheckoutRepository = Object.assign(memory, {
    readCheckout: vi.fn(async (id: string, key: string) => {
      const m = memory.mandates.get(id),
        a = [...memory.attempts.values()].find(
          (a) => a.mandateId === id && a.purchaseKey === key,
        );
      return {
        mandate: m ? structuredClone(m) : undefined,
        attempt: a ? structuredClone(a) : undefined,
      };
    }),
    readMandate: vi.fn(async (id: string) => {
      const m = memory.mandates.get(id);
      return m ? structuredClone(m) : undefined;
    }),
    findPurchase: vi.fn(async (id: string, key: string) => {
      const a = [...memory.attempts.values()].find(
        (a) => a.mandateId === id && a.purchaseKey === key,
      );
      return a ? structuredClone(a) : undefined;
    }),
  });
  const config = testCheckoutConfig({ ...testEnv, ...envOverrides }),
    auth = new TestOwnerAuth(config, () => memory.now);
  const service = new TestCheckoutService(
    config,
    repository,
    base.gateway,
    () => memory.now,
  );
  const actor = {
    ownerId: config.ownerId,
    subjectId: config.ownerId,
    role: "owner" as const,
  };
  const request = (
    action?: string,
    body: unknown = {},
    cookie?: string,
    csrf?: string,
    origin = config.origin,
  ) =>
    new Request(
      `${config.origin}/api/paypal/test${action ? `/${action}` : ""}`,
      {
        method: action ? "POST" : "GET",
        headers: {
          Host: new URL(origin).host,
          Origin: origin,
          ...(action ? { "Content-Type": "application/json" } : {}),
          ...(cookie ? { Cookie: cookie } : {}),
          ...(csrf ? { "X-Earmark-CSRF": csrf } : {}),
        },
        ...(action ? { body: JSON.stringify(body) } : {}),
      },
    );
  const login = auth.login(request("login", { password: config.loginSecret }), {
    password: config.loginSecret,
  });
  const cookie = login.cookie.split(";")[0] ?? "";
  const checkout = vi.fn(async () => service);
  return {
    ...base,
    memory,
    repository,
    config,
    auth,
    service,
    actor,
    request,
    cookie,
    csrf: login.session.csrf,
    session: login.session,
    runtime: () => ({ auth, checkout }),
    checkout,
  };
}
