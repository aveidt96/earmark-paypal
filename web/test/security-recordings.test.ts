import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import local from "../src/lib/demo/security.json";
describe("recorded adversarial evidence provenance", () => {
  const original = JSON.parse(
    readFileSync(
      new URL("../../demo/earmark-demo-evidence.json", import.meta.url),
      "utf8",
    ),
  );
  it.each(["B", "C", "D"])(
    "scenario %s is the original local record, not invented outcomes",
    (id) => {
      const s = local.scenarios.find((s) => s.id === id);
      expect(s).toEqual(
        original.scenarios.find((s: { id: string }) => s.id === id),
      );
      expect(
        BigInt(s?.reserved ?? 0) + BigInt(s?.settled ?? 0),
      ).toBeLessThanOrEqual(BigInt(s?.cap ?? 0));
    },
  );
  it("separates resistant mock behavior and independent unauthorized-provider reverted receipt", () => {
    const b = local.scenarios.find((s) => s.id === "B");
    expect(b?.backendVerdict).toContain("Mock policy ignored");
    expect(
      b?.receipts.some(
        (r) =>
          r.status === "reverted" &&
          "reason" in r &&
          r.reason === "ProviderNotApproved",
      ),
    ).toBe(true);
  });
  it("invalid delivery restores headroom through owner rejection without settlement", () => {
    const c = local.scenarios.find((s) => s.id === "C");
    expect(c?.payments[0]?.status).toBe("REJECTED");
    expect(c?.settled).toBe("0");
    expect(c?.reserved).toBe("0");
    expect(c?.available).toBe("20000000");
  });
  it("budget exhaustion leaves two real funded obligations, not settled or refunded", () => {
    const d = local.scenarios.find((s) => s.id === "D");
    expect(d?.payments).toHaveLength(2);
    expect(d?.reserved).toBe("8000000");
    expect(d?.settled).toBe("0");
    expect(
      d?.receipts.some(
        (r) =>
          r.status === "reverted" &&
          "reason" in r &&
          r.reason === "TaskCapExceeded",
      ),
    ).toBe(true);
  });
});
