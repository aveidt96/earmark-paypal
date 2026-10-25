import { it, expect } from "vitest";
import { historyBatch } from "../src/lib/history-ranges";
it("bounds testnet history to four exact 100-block RPC ranges without skipped events", () => {
  const first = historyBatch(500n, 5000n, 10143);
  expect(first.target).toBe(899n);
  expect(first.ranges).toEqual([
    { fromBlock: 500n, toBlock: 599n },
    { fromBlock: 600n, toBlock: 699n },
    { fromBlock: 700n, toBlock: 799n },
    { fromBlock: 800n, toBlock: 899n },
  ]);
  const next = historyBatch(first.target - 16n, 5000n, 10143);
  expect(next.ranges[0]?.fromBlock).toBe(883n);
  expect(next.target).toBeGreaterThan(first.target);
});
it("clamps inclusive cutoff and single-block reads", () => {
  expect(historyBatch(500n, 500n, 10143).ranges).toEqual([
    { fromBlock: 500n, toBlock: 500n },
  ]);
  expect(historyBatch(500n, 612n, 10143).ranges).toEqual([
    { fromBlock: 500n, toBlock: 599n },
    { fromBlock: 600n, toBlock: 612n },
  ]);
});
it("preserves Anvil batching and rejects invalid history boundaries", () => {
  expect(historyBatch(0n, 10000n, 31337).target).toBe(3999n);
  expect(() => historyBatch(-1n, 100n, 10143)).toThrow(
    "HISTORY_RANGE_REVIEW_REQUIRED",
  );
  expect(() => historyBatch(101n, 100n, 10143)).toThrow(
    "HISTORY_RANGE_REVIEW_REQUIRED",
  );
});
