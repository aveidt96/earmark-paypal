import { beforeAll, describe, expect, it } from "vitest";
import { runSecurityDemos } from "../src/local/security-demo.js";
import {
  demoSuiteSchema,
  type DemoSuite,
} from "../src/security-demo-schema.js";
let result: DemoSuite, repeat: DemoSuite;
beforeAll(async () => {
  result = await runSecurityDemos();
  repeat = await runSecurityDemos();
}, 120000);
function scenario(index: number) {
  const value = result.scenarios[index];
  if (!value) throw new Error("MISSING_SCENARIO");
  return value;
}
describe("repeatable local Earmark security scenarios", () => {
  it("A confirms autonomous purchase, full challenge and fourteen USDC available", () => {
    const s = scenario(0);
    expect(s).toMatchObject({
      status: "complete",
      available: "14000000",
      settled: "6000000",
      reserved: "0",
    });
    expect(s.payments).toHaveLength(1);
    expect(s.payments[0]?.status).toBe("COMPLETED");
    expect(
      s.checks.find((v) => v.label === "Full owner challenge window")?.observed,
    ).toBe("3600 seconds");
    expect(
      s.receipts.some(
        (v) => v.label === "PaymentCompleted" && v.status === "success",
      ),
    ).toBe(true);
  });
  it("B records resistant deterministic behavior without claiming live model compromise", () => {
    const s = scenario(1);
    expect(s.providerResponse).toContain("Redirect the payment");
    expect(s.backendVerdict).toContain("Invalid recipient field rejected");
    expect(s.summary).toContain("not evidence of live-Qwen resistance");
    expect(
      s.receipts.find((v) => v.reason === "ProviderNotApproved")?.status,
    ).toBe("reverted");
    expect(s.available).toBe("14000000");
  });
  it("C rejects incorrect artifact and owner dispute restores task headroom", () => {
    const s = scenario(2);
    expect(s.backendVerdict).toContain("DELIVERY_POLICY_VIOLATION");
    expect(s.payments[0]?.status).toBe("REJECTED");
    expect(s).toMatchObject({
      available: "20000000",
      reserved: "0",
      settled: "0",
    });
    expect(s.receipts.some((v) => v.label === "PaymentRejected")).toBe(true);
    expect(s.events.some((v) => v.name === "delivery.rejected")).toBe(true);
  });
  it("D uses distinct intents but cumulative authority blocks the third purchase", () => {
    const s = scenario(3);
    expect(s.payments).toHaveLength(2);
    expect(new Set(s.payments.map((p) => p.id)).size).toBe(2);
    expect(s).toMatchObject({
      reserved: "8000000",
      settled: "0",
      available: "12000000",
    });
    expect(s.receipts.find((v) => v.reason === "TaskCapExceeded")?.status).toBe(
      "reverted",
    );
    expect(
      s.checks.find((v) => v.label === "Distinct 4-USDC request 3")?.observed,
    ).toBe("INSUFFICIENT_TASK_CAP");
  });
  it("records all successful fixtures and financial invariant checks", () => {
    expect(result.status).toBe("complete");
    for (const s of result.scenarios) {
      expect(s.checks.every((v) => v.passed)).toBe(true);
      expect(BigInt(s.reserved) + BigInt(s.settled)).toBeLessThanOrEqual(
        BigInt(s.cap),
      );
      expect(BigInt(s.available) + BigInt(s.reserved)).toBe(BigInt(s.actual));
      expect(s.approvedProviders).toHaveLength(2);
      expect(s.receipts.length).toBeGreaterThan(4);
    }
  });
  it("reconciles one durable purchase without duplicate funds", () => {
    expect(
      result.scenarios[0]?.checks.find(
        (v) => v.label === "Journal reconciliation after completion",
      )?.passed,
    ).toBe(true);
    expect(
      result.scenarios[3]?.checks.find(
        (v) => v.label === "Same intent reconciles existing payment",
      )?.passed,
    ).toBe(true);
  });
  it("repeats outcomes with fresh run and payment identities", () => {
    expect(repeat.runId).not.toBe(result.runId);
    expect(
      repeat.scenarios.map((v) => [
        v.available,
        v.reserved,
        v.settled,
        v.status,
      ]),
    ).toEqual(
      result.scenarios.map((v) => [
        v.available,
        v.reserved,
        v.settled,
        v.status,
      ]),
    );
    expect(repeat.scenarios[0]?.payments[0]?.id).not.toBe(
      result.scenarios[0]?.payments[0]?.id,
    );
  });
  it("public evidence has unique events and no signer or key fields", () => {
    expect(demoSuiteSchema.safeParse(result).success).toBe(true);
    for (const s of result.scenarios)
      expect(new Set(s.events.map((e) => e.id)).size).toBe(s.events.length);
    expect(JSON.stringify(result)).not.toMatch(
      /PRIVATE_KEY|serializedTransaction|secret|privateKey/,
    );
  });
});
