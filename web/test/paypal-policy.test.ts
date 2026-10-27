import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { fromDecimal, toDecimal } from "../src/server/paypal/domain";
import { agent, fixture, merchant, owner } from "./fixtures/paypal";

describe("provider-neutral authorization and exact money", () => {
  it("reserves validated agent spending and binds immutable trusted identities", async () => {
    const t = await fixture();
    const a = await t.service.reserve(agent, t.input);
    expect(a).toMatchObject({
      ownerId: owner.ownerId,
      agentId: agent.subjectId,
      merchantId: merchant,
      amountMinor: "600",
      currency: "USD",
      budgetState: "RESERVED",
    });
    expect(t.repository.mandates.get(t.mandate.id)?.reservedMinor).toBe("600");
  });
  it.each([
    [
      "unauthorized agent",
      { ...agent, subjectId: "bad-agent" },
      {},
      "UNAUTHORIZED_AGENT",
    ],
    [
      "wrong owner scope",
      { ...agent, ownerId: "other-owner" },
      {},
      "MANDATE_OWNERSHIP_MISMATCH",
    ],
    [
      "forged owner role",
      { ...owner, subjectId: "bad-agent" },
      {},
      "MANDATE_OWNER_REQUIRED",
    ],
    [
      "unapproved merchant",
      agent,
      { merchantId: "other-merchant" },
      "UNAPPROVED_MERCHANT",
    ],
    ["currency mismatch", agent, { currency: "EUR" }, "CURRENCY_MISMATCH"],
    [
      "transaction limit",
      agent,
      { amountMinor: "1001" },
      "TRANSACTION_LIMIT_EXCEEDED",
    ],
  ] as const)("rejects %s", async (_, actor, changes, code) => {
    const t = await fixture();
    await expect(
      t.service.reserve(actor, { ...t.input, ...changes }),
    ).rejects.toThrow(code);
    expect(t.repository.attempts.size).toBe(0);
  });
  it("enforces expiry at its exact boundary", async () => {
    const t = await fixture();
    t.repository.now = Date.parse(t.mandate.expiresAt);
    await expect(t.service.reserve(agent, t.input)).rejects.toThrow(
      "MANDATE_EXPIRED",
    );
  });
  it("rejects revocation and cannot revive a revoked mandate", async () => {
    const t = await fixture();
    await t.service.revokeMandate(owner, t.mandate.id);
    await expect(t.service.reserve(agent, t.input)).rejects.toThrow(
      "MANDATE_INACTIVE",
    );
    await expect(
      t.repository.mutate(t.mandate.id, undefined, (tx) => {
        tx.mandate.status = "ACTIVE";
      }),
    ).rejects.toThrow("MANDATE_REVOCATION_PERMANENT");
  });
  it("checks cumulative reservations and consumption rather than only each transaction", async () => {
    const t = await fixture();
    const a = await t.service.createOrder(owner, t.input);
    t.approve(a);
    await t.service.capture(owner, a.id);
    await expect(
      t.service.reserve(agent, { ...t.input, purchaseKey: "second" }),
    ).rejects.toThrow("BUDGET_EXHAUSTED");
    expect(t.repository.mandates.get(t.mandate.id)?.consumedMinor).toBe("600");
  });
  it("serializes concurrent spending without oversubscribing budget (mock repository contract)", async () => {
    const t = await fixture();
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, (_, i) =>
        t.service.reserve(agent, { ...t.input, purchaseKey: `purchase-${i}` }),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(t.repository.mandates.get(t.mandate.id)?.reservedMinor).toBe("600");
  });
  it.each([0, 6.1, "0", "-1", "1.5", "1e3", "0600", "1000000000000000000"])(
    "rejects noncanonical/unsafe minor units %s",
    async (amountMinor) => {
      const t = await fixture();
      await expect(
        t.service.reserve(agent, { ...t.input, amountMinor }),
      ).rejects.toThrow("INVALID_PAYMENT_INPUT");
    },
  );
  it("rejects agent policy overrides and owner identity in proposal JSON", async () => {
    const t = await fixture();
    for (const extra of [
      { capMinor: "999999" },
      { ownerId: owner.ownerId },
      { agentId: agent.subjectId },
      { approved: true },
    ])
      await expect(
        t.service.reserve(agent, { ...t.input, ...extra }),
      ).rejects.toThrow("INVALID_PAYMENT_INPUT");
    await expect(t.service.createMandate(agent, {})).rejects.toThrow(
      "MANDATE_OWNER_REQUIRED",
    );
  });
  it("permanent policy terms cannot change behind existing reservations", async () => {
    const t = await fixture();
    await t.service.reserve(agent, t.input);
    await expect(
      t.repository.mutate(t.mandate.id, undefined, (tx) => {
        tx.mandate.capMinor = "9999";
      }),
    ).rejects.toThrow("MANDATE_POLICY_IMMUTABLE");
  });
  it("rejects malformed owner policies before creating any mandate", async () => {
    const t = await fixture();
    for (const changes of [
      { perTransactionMinor: "1001" },
      { merchants: [merchant, merchant] },
    ])
      await expect(
        t.service.createMandate(owner, { ...t.mandate, ...changes }),
      ).rejects.toThrow("INVALID_PAYMENT_INPUT");
    const { mandateInput } = await import("./fixtures/paypal");
    await expect(
      t.service.createMandate(owner, {
        ...mandateInput,
        perTransactionMinor: "1001",
      }),
    ).rejects.toThrow("INVALID_MANDATE_POLICY");
    await expect(
      t.service.createMandate(owner, {
        ...mandateInput,
        merchants: [merchant, merchant],
      }),
    ).rejects.toThrow("INVALID_MANDATE_POLICY");
    await expect(
      t.service.createMandate(owner, {
        ...mandateInput,
        expiresAt: new Date(t.repository.now).toISOString(),
      }),
    ).rejects.toThrow("MANDATE_EXPIRED");
  });
  it.each([
    ["1", "USD", "0.01"],
    ["600", "USD", "6.00"],
    ["123", "JPY", "123"],
    ["999999999999999999", "EUR", "9999999999999999.99"],
  ] as const)(
    "formats %s %s with no floating-point arithmetic",
    (minor, currency, decimal) => {
      expect(toDecimal(minor, currency)).toBe(decimal);
      expect(fromDecimal(decimal, currency)).toBe(minor);
    },
  );
  it.each(["6.001", "NaN", "1e5", "-6.00", "+6.00", "00.60"])(
    "rejects invalid provider decimal %s",
    (value) => {
      expect(() => fromDecimal(value, "USD")).toThrow();
    },
  );
  it("does not reinterpret fractional JPY or six-decimal USDC as cents", () => {
    expect(() => fromDecimal("1.00", "JPY")).toThrow();
    expect(() => fromDecimal("6.000000", "USD")).toThrow();
  });
});
