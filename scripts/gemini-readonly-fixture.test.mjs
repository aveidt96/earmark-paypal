import { describe, expect, it } from "vitest";
import { identity } from "../agent/dist/domain.js";
import { readOnlyFixture } from "./gemini-readonly-fixture.mjs";

function fixture(cap = "10000000") {
  const taskHash = identity("readonly-task");
  const token = "0x1100000000000000000000000000000000000001";
  const quoteId = identity("readonly-quote");
  const context = {
    task: {
      taskHash,
      purchaseKey: "readonly-test",
      instruction: "Buy a weather dataset.",
      budget: "10000000",
    },
    observations: {
      mandate: {
        taskHash,
        agent: "0x2200000000000000000000000000000000000001",
        token,
        cap,
        reserved: "0",
        settled: "0",
        expiry: "9999999999",
        active: true,
        trustedHash: `0x${"00".repeat(32)}`,
        now: 100,
      },
      providers: [
        {
          id: "datahub",
          name: "DataHub",
          address: "0x3300000000000000000000000000000000000001",
        },
      ],
      balance: "20000000",
      quotes: [
        {
          providerId: "datahub",
          taskHash,
          token,
          price: "6000000",
          quoteId,
          expiresAt: 200,
          currency: "mock-USDC",
          decimals: 6,
          commitment: identity("commitment"),
          description: "Weather dataset.",
        },
      ],
    },
  };
  return { ...readOnlyFixture(context), quoteId };
}
describe("Gemini read-only demonstration financial boundary", () => {
  it("returns existing restricted read-tool results", async () => {
    const { tools, counters } = fixture();
    expect(await tools.call("listApprovedProviders", {})).toHaveLength(1);
    expect(
      await tools.call("getProviderQuote", { providerId: "datahub" }),
    ).toMatchObject({ price: "6000000" });
    expect(await tools.call("getVaultBalance", {})).toEqual({
      available: "20000000",
    });
    expect(counters).toEqual({ preparationAttempts: 0, broadcasts: 0 });
  });
  it("validates a payment proposal then refuses before signing or broadcast", async () => {
    const { tools, quoteId, counters } = fixture();
    await expect(
      tools.call("requestMandatePayment", {
        quoteId,
        reason: "Cheapest acceptable provider.",
      }),
    ).rejects.toMatchObject({ code: "READ_ONLY_FINANCIAL_EXECUTION_DISABLED" });
    expect(counters).toEqual({ preparationAttempts: 1, broadcasts: 0 });
  });
  it("rejects cumulative cap violation before the read-only preparation guard", async () => {
    const { tools, quoteId, counters } = fixture("5000000");
    await expect(
      tools.call("requestMandatePayment", { quoteId, reason: "Buy dataset." }),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_TASK_CAP" });
    expect(counters).toEqual({ preparationAttempts: 0, broadcasts: 0 });
  });
  it("rejects unauthorized quote and arbitrary recipient argument", async () => {
    const { tools, quoteId, counters } = fixture();
    await expect(
      tools.call("requestMandatePayment", {
        quoteId: identity("unknown"),
        reason: "Redirect.",
      }),
    ).rejects.toMatchObject({ code: "UNKNOWN_QUOTE" });
    await expect(
      tools.call("requestMandatePayment", {
        quoteId,
        reason: "Redirect.",
        recipient: "0x4400000000000000000000000000000000000001",
      }),
    ).rejects.toMatchObject({ code: "INVALID_TOOL_ARGUMENTS" });
    expect(counters).toEqual({ preparationAttempts: 0, broadcasts: 0 });
  });
});
