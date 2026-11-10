import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { PayPalClient, type PayPalOrder } from "../src/server/paypal/client";
import {
  SANDBOX_BASE_URL,
  type PayPalCheckoutSettings,
} from "../src/server/paypal/config";
import { createMandate } from "../src/server/paypal/policy";
import { savedWalletPurchaseKey } from "../src/server/paypal/saved-wallet";
import { PayPalPaymentService } from "../src/server/paypal/service";
import { merchantBinding } from "../src/server/paypal/test-config";
import {
  agent,
  mandateInput,
  MemoryPaymentRepository,
  merchant,
  orderFor,
  owner,
} from "./fixtures/paypal";

const fakeVaultId = "offline-wallet-token-only";
type Behavior =
  | "approved"
  | "completed"
  | "payer-action"
  | "step-up-on-read"
  | "step-up-on-capture"
  | "refused"
  | "uncertain";

async function fixture(behavior: Behavior = "approved") {
  const repository = new MemoryPaymentRepository();
  const mandate = createMandate(
    owner,
    { ...mandateInput, capMinor: "600", perTransactionMinor: "600" },
    repository.now,
  );
  await repository.insertMandate(mandate);
  const settings: PayPalCheckoutSettings = {
    baseUrl: SANDBOX_BASE_URL,
    clientId: "offline-app",
    clientSecret: "offline-secret",
    merchantId: merchant,
    timeoutMs: 1000,
    maxRetries: 2,
    paymentsEnabled: true,
    credentialSellerOnly: true,
  };
  const purchase = {
    mandateId: mandate.id,
    purchaseKey: savedWalletPurchaseKey,
    merchantId: merchant,
    amountMinor: "600",
    currency: "USD" as const,
  };
  const consent = {
    vaultId: fakeVaultId,
    payerId: "OFFLINEPAYER",
    ownerId: owner.ownerId,
    purchase,
    appMerchantBinding: merchantBinding(settings.clientId, merchant),
    evidence: "PAYPAL_APPROVED_AND_EXCHANGED",
    usageType: "MERCHANT",
    usagePattern: "IMMEDIATE",
    approvedAt: new Date(repository.now - 1000).toISOString(),
    expiresAt: new Date(repository.now + 60000).toISOString(),
  };
  const posts: { path: string; requestId: string | null; body: unknown }[] = [];
  let current: PayPalOrder | undefined;
  const fetcher = vi.fn<typeof fetch>(async (input, init) => {
    const url = new URL(String(input));
    expect(url.origin).toBe(SANDBOX_BASE_URL);
    expect(init?.redirect).toBe("error");
    if (url.pathname === "/v1/oauth2/token")
      return Response.json({
        access_token: "offline-oauth",
        token_type: "Bearer",
        expires_in: 3600,
      });
    const bound = [...repository.attempts.values()][0];
    if (!bound) throw new Error("MOCK_DISPATCH_WITHOUT_DURABLE_ATTEMPT");
    const stepUp = () => orderFor(bound, "PAYER_ACTION_REQUIRED");
    if (init?.method === "GET") {
      expect(url.pathname).toBe("/v2/checkout/orders/ORDER123");
      return Response.json(behavior === "step-up-on-read" ? stepUp() : current);
    }
    posts.push({
      path: url.pathname,
      requestId: new Headers(init?.headers).get("PayPal-Request-Id"),
      body: JSON.parse(String(init?.body)),
    });
    if (url.pathname === "/v2/checkout/orders") {
      expect(bound.state).toBe("CREATING");
      if (behavior === "refused") return Response.json({}, { status: 403 });
      if (behavior === "uncertain")
        throw new Error("OFFLINE_TRANSPORT_TIMEOUT");
      current =
        behavior === "payer-action"
          ? stepUp()
          : behavior === "completed"
            ? { ...orderFor(bound, "COMPLETED", "COMPLETED"), links: [] }
            : { ...orderFor(bound, "APPROVED"), links: [] };
    } else {
      expect(url.pathname).toBe("/v2/checkout/orders/ORDER123/capture");
      expect(bound.state).toBe("CAPTURING");
      current =
        behavior === "step-up-on-capture"
          ? stepUp()
          : { ...orderFor(bound, "COMPLETED", "COMPLETED"), links: [] };
    }
    // PayPal can echo details; the server must not return or persist them.
    return Response.json(
      { ...current, payment_source: { paypal: { vault_id: fakeVaultId } } },
      { status: 201 },
    );
  });
  const options = {
    actor: owner,
    purchase,
    consent,
    expectedPayerId: consent.payerId,
    settings,
    repository,
    fetch: fetcher,
    now: () => repository.now,
  };
  const run = (
    override: Partial<
      Parameters<typeof PayPalPaymentService.checkoutSavedWalletOnce>[0]
    > = {},
  ) =>
    PayPalPaymentService.checkoutSavedWalletOnce({ ...options, ...override });
  return {
    mandate,
    repository,
    purchase,
    consent,
    settings,
    posts,
    fetcher,
    run,
  };
}

describe("single merchant-initiated Wallet checkout (offline)", () => {
  it("sends the agreed Wallet credential fields and accounts for exactly one charge across concurrent calls and replay", async () => {
    const t = await fixture();
    await Promise.all([t.run(), t.run()]);
    const paid = await t.run();
    expect(paid).toMatchObject({
      state: "SUCCEEDED",
      budgetState: "CONSUMED",
      captureId: "CAPTURE123",
    });
    expect(t.posts.map((p) => [p.path, p.requestId])).toEqual([
      ["/v2/checkout/orders", paid.createRequestId],
      ["/v2/checkout/orders/ORDER123/capture", paid.captureRequestId],
    ]);
    for (const post of t.posts)
      expect(post.body).toMatchObject({
        payment_source: {
          paypal: {
            vault_id: fakeVaultId,
            stored_credential: {
              payment_initiator: "MERCHANT",
              usage: "SUBSEQUENT",
              usage_pattern: "IMMEDIATE",
            },
          },
        },
      });
    expect(JSON.stringify(t.posts)).not.toContain("billing_plan");
    expect(t.repository.mandates.get(t.mandate.id)).toMatchObject({
      reservedMinor: "0",
      consumedMinor: "600",
    });
    expect(
      JSON.stringify({
        paid,
        audit: t.repository.audit,
        attempts: [...t.repository.attempts.values()],
      }),
    ).not.toContain(fakeVaultId);
  });

  it("does not capture again if create already returned a verified completed capture", async () => {
    const t = await fixture("completed");
    expect(await t.run()).toMatchObject({
      state: "SUCCEEDED",
      budgetState: "CONSUMED",
    });
    expect(t.posts).toHaveLength(1);
  });

  it.each(["payer-action", "step-up-on-read", "step-up-on-capture"] as const)(
    "stops on %s without exposing an approval link or retrying",
    async (behavior) => {
      const t = await fixture(behavior);
      const stopped = await t.run();
      expect(stopped).toMatchObject({
        budgetState: "RESERVED",
        errorCode: "PAYPAL_SAVED_WALLET_PAYER_ACTION_REQUIRED",
      });
      expect(stopped.approvalUrl).toBeUndefined();
      const ordinaryCheckout = new PayPalPaymentService(
        t.repository,
        new PayPalClient(t.settings, { fetch: t.fetcher }),
      );
      await expect(
        ordinaryCheckout.createOrder(owner, t.purchase),
      ).rejects.toThrow("PAYPAL_SAVED_WALLET_SCOPE_REQUIRED");
      await expect(ordinaryCheckout.capture(owner, stopped.id)).rejects.toThrow(
        "PAYPAL_SAVED_WALLET_SCOPE_REQUIRED",
      );
      expect(await t.run()).toEqual(stopped);
      expect(t.posts).toHaveLength(behavior === "step-up-on-capture" ? 2 : 1);
    },
  );

  it.each(["refused", "uncertain"] as const)(
    "does not repeat a %s create",
    async (behavior) => {
      const t = await fixture(behavior);
      const stopped = await t.run();
      expect(stopped).toMatchObject(
        behavior === "refused"
          ? { state: "FAILED", budgetState: "RELEASED" }
          : { state: "CREATE_UNCERTAIN", budgetState: "RESERVED" },
      );
      expect(await t.run()).toEqual(stopped);
      expect(t.posts).toHaveLength(1);
    },
  );

  it("rejects wrong payer, app, expired consent and a recurring arrangement before any transport or reservation", async () => {
    const t = await fixture();
    await expect(t.run({ expectedPayerId: "OTHER" })).rejects.toThrow(
      "PAYPAL_SAVED_WALLET_BINDING_MISMATCH",
    );
    await expect(
      t.run({ consent: { ...t.consent, appMerchantBinding: "0".repeat(64) } }),
    ).rejects.toThrow("PAYPAL_SAVED_WALLET_BINDING_MISMATCH");
    await expect(
      t.run({ consent: { ...t.consent, vaultId: "" } }),
    ).rejects.toThrow("PAYPAL_SAVED_WALLET_CONSENT_REQUIRED");
    await expect(
      t.run({
        consent: { ...t.consent, usagePattern: "SUBSCRIPTION_PREPAID" },
      }),
    ).rejects.toThrow("PAYPAL_SAVED_WALLET_CONSENT_REQUIRED");
    await expect(
      t.run({
        consent: {
          ...t.consent,
          expiresAt: new Date(t.repository.now).toISOString(),
        },
      }),
    ).rejects.toThrow("PAYPAL_SAVED_WALLET_CONSENT_EXPIRED");
    expect(t.fetcher).not.toHaveBeenCalled();
    expect(t.repository.attempts.size).toBe(0);
  });

  it("requires the owner, exact purchase and an unexpired single-merchant mandate with sufficient funds", async () => {
    const t = await fixture();
    await expect(t.run({ actor: agent })).rejects.toThrow(
      "MANDATE_OWNER_REQUIRED",
    );
    for (const change of [
      { amountMinor: "601" },
      { merchantId: "OTHER" },
      { currency: "EUR" as const },
    ])
      await expect(
        t.run({ purchase: { ...t.purchase, ...change } }),
      ).rejects.toThrow("PAYPAL_SAVED_WALLET_PURCHASE_MISMATCH");
    t.repository.mandates.set(t.mandate.id, {
      ...t.mandate,
      merchants: [merchant, "OTHER"],
    });
    await expect(t.run()).rejects.toThrow(
      "PAYPAL_SAVED_WALLET_MANDATE_MISMATCH",
    );
    t.repository.mandates.set(t.mandate.id, {
      ...t.mandate,
      expiresAt: new Date(t.repository.now).toISOString(),
    });
    await expect(t.run()).rejects.toThrow(
      "PAYPAL_SAVED_WALLET_MANDATE_MISMATCH",
    );
    t.repository.mandates.set(t.mandate.id, {
      ...t.mandate,
      consumedMinor: "100",
    });
    await expect(t.run()).rejects.toThrow("BUDGET_EXHAUSTED");
    expect(t.fetcher).not.toHaveBeenCalled();
    expect(t.repository.attempts.size).toBe(0);
  });
});
