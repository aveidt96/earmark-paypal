import { describe, expect, it } from "vitest";
import { parseTheme, resolveTheme } from "../src/lib/theme";
import { contractVerdict } from "../src/lib/console-view";
import type { PaymentRecord, RunView } from "../src/lib/model";
const payment = (status: PaymentRecord["status"]) =>
  ({ status, challengeDeadline: 100 }) as PaymentRecord;
describe("appearance preferences", () => {
  it.each([null, undefined, "unknown", {}, "LIGHT"])(
    "invalid preference %s defaults to dark without discarding valid explicit choices",
    (v) => expect(parseTheme(v)).toBe("dark"),
  );
  it.each(["light", "dark", "system"] as const)(
    "preserves explicit %s preference",
    (v) => expect(parseTheme(v)).toBe(v),
  );
  it("system mode follows OS while explicit choices override it", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });
});
describe("receipt-backed contract verdicts", () => {
  it("model or tool failure is never mislabeled as a contract rejection", () => {
    expect(
      contractVerdict(undefined, { status: "failed" } as RunView, 90).title,
    ).toBe("REVIEW REQUIRED");
    expect(
      contractVerdict(undefined, { status: "running" } as RunView, 90).title,
    ).toBe("AWAITING AUTHORIZATION");
  });
  it.each([
    ["FUNDED", "PAYMENT IN ESCROW"],
    ["SUBMITTED", "DELIVERY SUBMITTED"],
    ["ACCEPTED", "CHALLENGE ACTIVE"],
    ["COMPLETED", "PAYMENT SETTLED"],
    ["REJECTED", "OWNER REJECTED"],
    ["EXPIRED", "RESERVATION REFUNDED"],
  ] as const)("renders %s from actual payment status", (status, title) =>
    expect(contractVerdict(payment(status), undefined, 99).title).toBe(title),
  );
  it("challenge cutoff makes settlement eligible but does not imply transfer", () => {
    const v = contractVerdict(payment("ACCEPTED"), undefined, 100);
    expect(v.title).toBe("READY TO SETTLE");
    expect(v.detail).toContain("remain reserved");
  });
  it("terminal escrow facts take priority over an earlier failed model run", () =>
    expect(
      contractVerdict(
        payment("COMPLETED"),
        { status: "failed" } as RunView,
        200,
      ).title,
    ).toBe("PAYMENT SETTLED"));
});
