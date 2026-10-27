import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { paypalPreparationStatus } from "../src/server/paypal-config";

describe("PayPal preparation boundary", () => {
  it("never reports payments as enabled or exposes supplied credentials", () => {
    const status = paypalPreparationStatus({
      PAYPAL_ENVIRONMENT: "sandbox",
      PAYPAL_PAYMENTS_ENABLED: "false",
      PAYPAL_CLIENT_ID: "test-client",
      PAYPAL_CLIENT_SECRET: "test-secret",
    });
    expect(status).toEqual({
      provider: "paypal",
      environment: "sandbox",
      status: "backend-foundation",
      backendImplemented: true,
      backendEnabled: false,
      manualPaymentsConfigured: false,
      sandboxVerified: false,
      autonomousPaymentsEnabled: false,
      paymentsImplemented: false,
      paymentsEnabled: false,
    });
    expect(JSON.stringify(status)).not.toContain("test-secret");
  });
  it("refuses live environments and malformed enable flags", () => {
    expect(() =>
      paypalPreparationStatus({ PAYPAL_ENVIRONMENT: "live" }),
    ).toThrow("PAYPAL_SANDBOX_ONLY");
    expect(() =>
      paypalPreparationStatus({ PAYPAL_PAYMENTS_ENABLED: "yes" }),
    ).toThrow("INVALID_PAYPAL_CONFIGURATION");
  });
});
