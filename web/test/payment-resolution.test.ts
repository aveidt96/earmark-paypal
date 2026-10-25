import { describe, it, expect } from "vitest";
import { encodeFunctionData, type Address, type Hex } from "viem";
import { ownerAbi } from "../src/lib/abi";
import {
  deployment,
  eligibleResolution,
  matchingResolutionTransaction,
  pendingResolutionSchema,
  type PendingResolution,
} from "../src/lib/payment-resolution";
const paymentId = ("0x" + "a".repeat(64)) as Hex;
const account = "0x9Db22De53242B5376fC4B87B523a0a91aDD0b09A" as Address;
const deadlines = {
  deliveryDeadline: 100n,
  reviewDeadline: 200n,
  challengeDeadline: 300n,
};
describe("backend-independent resolution", () => {
  it.each([0, 4, 5, 6])(
    "never resolves missing or terminal status %i",
    (status) => {
      expect(eligibleResolution({ status, ...deadlines }, 1000n)).toBeNull();
    },
  );
  it("preserves the complete challenge period including its exact boundary", () => {
    expect(eligibleResolution({ status: 3, ...deadlines }, 299n)).toBeNull();
    expect(eligibleResolution({ status: 3, ...deadlines }, 300n)).toBe(
      "settlePayment",
    );
    expect(eligibleResolution({ status: 3, ...deadlines }, 1000n)).toBe(
      "settlePayment",
    );
  });
  it.each([
    [1, 100n],
    [2, 200n],
  ])("refunds status %i only at its actual timeout", (status, cutoff) => {
    expect(
      eligibleResolution({ status, ...deadlines }, cutoff - 1n),
    ).toBeNull();
    expect(eligibleResolution({ status, ...deadlines }, cutoff)).toBe(
      "refundExpired",
    );
  });
  it("rejects malformed durable attempts and unapproved operations", () => {
    const p = { paymentId, account, action: "settlePayment" };
    expect(pendingResolutionSchema.parse(p)).toEqual(p);
    for (const invalid of [
      { ...p, action: "withdraw" },
      { ...p, paymentId: "0xabc" },
      { ...p, hash: "0xabc" },
      { ...p, to: account },
    ])
      expect(pendingResolutionSchema.safeParse(invalid).success).toBe(false);
  });
  it.each(["settlePayment", "refundExpired"] as const)(
    "binds reconciliation to exact %s, payment, chain, sender and vault",
    (action) => {
      const p: PendingResolution = { paymentId, account, action };
      const tx = {
        chainId: 10143,
        to: deployment.vault.address as Address,
        from: account,
        input: encodeFunctionData({
          abi: ownerAbi,
          functionName: action,
          args: [paymentId],
        }),
        value: 0n,
      };
      expect(matchingResolutionTransaction(p, tx)).toBe(true);
      for (const changed of [
        { chainId: 1 },
        { chainId: undefined },
        { to: account },
        { from: deployment.token.address as Address },
        { value: 1n },
        { input: "0x" as Hex },
        {
          input: encodeFunctionData({
            abi: ownerAbi,
            functionName: action,
            args: [("0x" + "b".repeat(64)) as Hex],
          }),
        },
      ])
        expect(matchingResolutionTransaction(p, { ...tx, ...changed })).toBe(
          false,
        );
    },
  );
});
