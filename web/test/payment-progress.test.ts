import { describe, expect, it } from "vitest";
import { paymentProgress, paymentStages } from "../src/lib/payment-progress";
import { normalFrame } from "../src/lib/recorded-demo";
import {
  challengeRemaining,
  type PaymentRecord,
  type RunView,
} from "../src/lib/model";
describe("five receipt-backed payment stages", () => {
  it("has exactly the approved five stages", () =>
    expect(paymentStages).toEqual([
      "Requested",
      "Earmarked",
      "Delivered",
      "Accepted",
      "Settled",
    ]));
  it.each([0, 1, 2, 3, 4])(
    "maps historical frame %s to the true original lifecycle",
    (frame) => {
      const s = normalFrame(frame);
      expect(paymentProgress(s.runs[0], s.payments[0], s.events)).toBe(frame);
    },
  );
  it("failure without funded receipt never advances to earmarked", () =>
    expect(
      paymentProgress(
        { ...normalFrame(4).runs[0], status: "failed" } as RunView,
        undefined,
        [],
      ),
    ).toBe(-1));
  it.each(["REJECTED", "EXPIRED"] as const)(
    "%s stops after the last real transition",
    (status) => {
      expect(
        paymentProgress(
          undefined,
          {
            ...normalFrame(4).payments[0],
            status,
            challengeDeadline: 0,
            deliveredHash: "0x" + "0".repeat(64),
          } as PaymentRecord,
          [],
        ),
      ).toBe(1);
      expect(
        paymentProgress(
          undefined,
          {
            ...normalFrame(4).payments[0],
            status,
            challengeDeadline: 0,
            deliveredHash: "0x01",
          } as PaymentRecord,
          [],
        ),
      ).toBe(2);
    },
  );
  it("challenge starts on acceptance and never implies settlement at the deadline", () => {
    const p = normalFrame(3).payments[0];
    expect(p).toBeDefined();
    if (!p) return;
    expect(challengeRemaining(p, 1791813637)).toBe(3600);
    expect(challengeRemaining(p, p.challengeDeadline)).toBe(0);
    expect(paymentProgress(undefined, p, [])).toBe(3);
    expect(challengeRemaining({ ...p, status: "SUBMITTED" }, 1791813637)).toBe(
      0,
    );
  });
});
