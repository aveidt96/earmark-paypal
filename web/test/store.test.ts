import { it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { join, dirname } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { zeroHash } from "viem";
import { WorkspaceStore } from "../src/server/store";
function store() {
  return new WorkspaceStore(
    join(
      process.cwd(),
      "..",
      ".tools",
      "stage-6-store-tests",
      `${randomUUID()}.json`,
    ),
    { vault: `0x${"12".repeat(20)}`, genesis: zeroHash },
  );
}
it("persists atomic workspace events with stable identities", () => {
  const s = store();
  s.mutate((v) => {
    v.events.push({
      id: v.nextId++,
      observedAt: 123,
      runId: "chain",
      type: "PaymentFunded",
      source: "onchain",
      data: { amount: "6000000" },
    });
  });
  expect(s.read().events[0]?.id).toBe(1);
  expect(s.read().nextId).toBe(2);
});
it("an existing writer lock blocks changes without resetting the state", () => {
  const s = store();
  s.mutate((v) => {
    v.nextId = 9;
  });
  writeFileSync(`${s.path}.lock`, "test-held-lock");
  expect(() =>
    s.mutate((v) => {
      v.nextId = 1;
    }),
  ).toThrow();
  expect(s.read().nextId).toBe(9);
});
it("corrupt workspace data fails closed instead of creating empty history", () => {
  const s = store();
  mkdirSync(dirname(s.path), { recursive: true });
  writeFileSync(s.path, "{broken");
  expect(() => s.read()).toThrow();
});
it("a journal from a different chain genesis is rejected", () => {
  const s = store();
  s.mutate(() => {});
  const other = new WorkspaceStore(s.path, {
    vault: `0x${"12".repeat(20)}`,
    genesis: `0x${"ab".repeat(32)}`,
  });
  expect(() => other.read()).toThrow("WORKSPACE_CHAIN_MISMATCH");
});
