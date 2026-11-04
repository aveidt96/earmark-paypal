import { describe, expect, it } from "vitest";
import { runInNewContext } from "node:vm";
import { parseTheme, themeBootstrap, THEME_KEY } from "../src/lib/theme";
import { contractVerdict } from "../src/lib/console-view";
import type { PaymentRecord, RunView } from "../src/lib/model";
const payment = (status: PaymentRecord["status"]) =>
  ({ status, challengeDeadline: 100 }) as PaymentRecord;
describe("appearance preferences", () => {
  it.each([null, undefined, "unknown", {}, "LIGHT"])(
    "invalid preference %s defaults to Norway",
    (v) => expect(parseTheme(v)).toBe("norway"),
  );
  it.each(["light", "norway"] as const)(
    "preserves explicit %s preference",
    (v) => expect(parseTheme(v)).toBe(v),
  );
  it.each(["airy", "dark", "system"])("migrates legacy %s to Norway", (v) => {
    expect(parseTheme(v)).toBe("norway");
  });
  it.each([null, "airy", "dark", "system", "norway", "light", "invalid"])(
    "first paint and storage migration agree for %s without consulting the OS",
    (saved) => {
      const storage = new Map(saved === null ? [] : [[THEME_KEY, saved]]);
      const document = { documentElement: { dataset: { theme: "norway" } } };
      runInNewContext(themeBootstrap, {
        document,
        localStorage: {
          getItem: (key: string) => storage.get(key) ?? null,
          setItem: (key: string, value: string) => storage.set(key, value),
        },
        matchMedia: () => {
          throw new Error("OS_THEME_MUST_NOT_ACTIVATE_DARK");
        },
      });
      expect(document.documentElement.dataset.theme).toBe(parseTheme(saved));
      expect(storage.get(THEME_KEY)).toBe(parseTheme(saved));
    },
  );
  it("still applies Norway when browser storage is blocked", () => {
    const document = { documentElement: { dataset: { theme: "norway" } } };
    runInNewContext(themeBootstrap, {
      document,
      localStorage: {
        getItem: () => {
          throw new Error("STORAGE_BLOCKED");
        },
      },
    });
    expect(document.documentElement.dataset.theme).toBe("norway");
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
