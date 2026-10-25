import { describe, expect, it } from "vitest";
import { normalFrame, normalSnapshot } from "../src/lib/recorded-demo";
describe("bundled recorded purchase", () => {
  it("pins the verified public payment, six decimal amounts and historical terminal receipt", () => {
    expect(normalSnapshot.config?.chainId).toBe(10143);
    expect(normalSnapshot.payments[0]?.resolutionHash).toBe(
      "0x95810b4c31144e9b044955d7fc9b4e9dc055fb6842aaab495ea677a9a0a66e25",
    );
    expect(normalSnapshot.balance?.available).toBe("14000000");
    expect(normalSnapshot.balance?.reserved).toBe("0");
    expect(normalSnapshot.payments[0]?.status).toBe("COMPLETED");
    expect(normalSnapshot.mandates[0]?.active).toBe(false);
  });
  it.each([0, 1, 2, 3, 4])(
    "frame %s preserves cap/backing accounting without mutating source",
    (frame) => {
      const s = normalFrame(frame),
        m = s.mandates[0];
      expect(
        BigInt(m?.reserved ?? 0) + BigInt(m?.settled ?? 0),
      ).toBeLessThanOrEqual(BigInt(m?.cap ?? 0));
      expect(
        BigInt(s.balance?.available ?? 0) + BigInt(s.balance?.reserved ?? 0),
      ).toBe(BigInt(s.balance?.actual ?? 0));
      expect(normalSnapshot.payments[0]?.status).toBe("COMPLETED");
      expect(
        s.events.every((e) =>
          normalSnapshot.events.some(
            (original) =>
              original.id === e.id && original.observedAt === e.observedAt,
          ),
        ),
      ).toBe(true);
    },
  );
  it("has no payment at proposal and starts the original challenge only after acceptance", () => {
    expect(normalFrame(0).payments).toHaveLength(0);
    expect(normalFrame(2).payments[0]?.challengeDeadline).toBe(0);
    expect(normalFrame(3).payments[0]?.challengeDeadline).toBe(1791817237);
    expect(normalFrame(3).chainTime).toBe(1791813637);
  });
});
