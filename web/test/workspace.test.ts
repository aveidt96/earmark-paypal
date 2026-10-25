import { describe, it, expect, vi } from "vitest";
import { zeroHash, type Address } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { validateCreation } from "../src/lib/forms";
import { mandateTaskHash } from "@flint/agent/task";
import {
  OwnerWallet,
  readWallet,
  walletError,
  receiptMatchesPending,
  type InjectedProvider,
} from "../src/lib/wallet";
import {
  canRefund,
  canReject,
  challengeRemaining,
  launchTypedData,
  mergeEvents,
  type LaunchChallenge,
} from "../src/lib/model";
const addresses = Array.from(
  { length: 4 },
  () => privateKeyToAccount(generatePrivateKey()).address,
);
const [vault, agent, token, owner] = addresses as [
  Address,
  Address,
  Address,
  Address,
];
const config = {
  vault,
  agent,
  token,
  owner,
  decimals: 6,
  providers: [owner],
  now: 100,
};
const input = {
  description: "Purchase an approved weather dataset",
  salt: zeroHash,
  agent,
  token,
  cap: "10",
  providers: [owner],
  expiry: 1000,
  deliveryWindow: 3600,
  challengeWindow: 3600,
  trustedHash: zeroHash,
};
describe("Immutable mandate form", () => {
  it("uses shared task hash and exact base units", () => {
    const m = validateCreation(input, config);
    expect(m.capUnits).toBe(10_000_000n);
    expect(m.taskHash).toBe(
      mandateTaskHash(vault, input.description, zeroHash),
    );
  });
  it.each([
    "0",
    "-1",
    "NaN",
    "0.0000001",
    "340282366920938463463374607431768211456",
  ])("rejects invalid budget %s", (cap) =>
    expect(() => validateCreation({ ...input, cap }, config)).toThrow(),
  );
  it.each(
    [[], [owner, owner], [vault], [agent]].map((providers) => ({ providers })),
  )("rejects invalid providers %j", ({ providers }) =>
    expect(() => validateCreation({ ...input, providers }, config)).toThrow(),
  );
  it.each([
    { expiry: 100 },
    { expiry: 100 + 366 * 86400 },
    { deliveryWindow: 3599 },
    { challengeWindow: 2592001 },
    { trustedHash: "0xbad" },
    { agent: owner },
    { token: agent },
  ])("rejects invalid immutable terms %j", (patch) =>
    expect(() => validateCreation({ ...input, ...patch }, config)).toThrow(),
  );
  it("hash changes with task, vault or salt, never semantic proof", () =>
    expect(mandateTaskHash(agent, input.description, zeroHash)).not.toBe(
      mandateTaskHash(vault, input.description, zeroHash),
    ));
});
describe("Wallet boundaries", () => {
  const provider = (
    accounts: unknown = [owner],
    chain: unknown = "0x7a69",
  ): InjectedProvider => ({
    request: vi.fn(async ({ method }) =>
      method === "eth_chainId" ? chain : accounts,
    ),
  });
  it("connects only a real returned account", async () =>
    expect(await readWallet(provider(), true)).toEqual({
      account: owner,
      chainId: 31337,
    }));
  it("disconnected wallet stays disconnected", async () =>
    expect(await readWallet(provider([]))).toBeNull());
  it("reads wrong chain without falsely claiming local connection", async () =>
    expect((await readWallet(provider([owner], "0x1")))?.chainId).toBe(1));
  it("reads changed wallet accounts", async () =>
    expect((await readWallet(provider([agent])))?.account).toBe(agent));
  it("rejects malformed accounts", async () =>
    expect(readWallet(provider(["invented"]))).rejects.toThrow());
  it("rejects malformed chain", async () =>
    expect(readWallet(provider([owner], "invented"))).rejects.toThrow());
  it("handles rejected signature without success", () =>
    expect(walletError({ code: 4001 })).toContain("declined"));
  it("labels uncertain RPC outcomes", () =>
    expect(walletError(new Error("RPC timeout"))).toContain("uncertain"));
  it("uses precise token amounts", () => {
    const w = new OwnerWallet(
      provider(),
      {
        chainId: 31337,
        network: "Local Anvil",
        rpcUrl: "http://127.0.0.1:1",
        vault,
        token,
        agent,
        providers: [],
      },
      () => {},
    );
    expect(w.amount("6.000001", 6)).toBe(6_000_001n);
    expect(() => w.amount("6.0000001", 6)).toThrow();
    expect(() => w.amount("0", 6)).toThrow();
  });
});
describe("Escrow state representation", () => {
  const p = {
    status: "FUNDED",
    deliveryDeadline: 200,
    reviewDeadline: 300,
    challengeDeadline: 400,
  } as Parameters<typeof canRefund>[0];
  it("uses strict delivery dispute cutoff and inclusive refund cutoff", () => {
    expect(canReject(p, 199)).toBe(true);
    expect(canReject(p, 200)).toBe(false);
    expect(canRefund(p, 200)).toBe(true);
  });
  it("uses actual submitted review cutoff", () => {
    const s = { ...p, status: "SUBMITTED" as const };
    expect(canReject(s, 299)).toBe(true);
    expect(canRefund(s, 299)).toBe(false);
    expect(canRefund(s, 300)).toBe(true);
  });
  it("never timeout refunds accepted escrow", () => {
    const a = { ...p, status: "ACCEPTED" as const };
    expect(challengeRemaining(a, 399)).toBe(1);
    expect(canReject(a, 400)).toBe(false);
    expect(canRefund(a, 401)).toBe(false);
    expect(challengeRemaining(a, 400)).toBe(0);
  });
  it.each(["COMPLETED", "REJECTED", "EXPIRED"] as const)(
    "terminal %s has no refund or rejection action",
    (status) => {
      expect(canReject({ ...p, status }, 1)).toBe(false);
      expect(canRefund({ ...p, status }, 999)).toBe(false);
    },
  );
  it("deduplicates persistent events by stable identity", () => {
    const e = {
      id: 1,
      observedAt: 100,
      runId: "x",
      type: "PaymentFunded",
      source: "onchain" as const,
      data: {},
    };
    expect(mergeEvents([e], [e, { ...e, id: 2 }])).toHaveLength(2);
  });
  it("signature domain binds owner launch to chain/vault/action/mandate/intent/expiry", () => {
    const c: LaunchChallenge = {
      nonce: zeroHash,
      mandateId: zeroHash,
      purchaseKey: zeroHash,
      action: "launch",
      owner,
      expiresAt: 200,
      chainId: 31337,
      vault,
    };
    const t = launchTypedData(c);
    expect(t.domain).toMatchObject({
      chainId: 31337,
      verifyingContract: vault,
    });
    expect(t.message).toMatchObject({
      action: "LaunchTask",
      nonce: zeroHash,
      expiresAt: 200n,
    });
    expect(launchTypedData({ ...c, action: "resume" }).message.action).toBe(
      "ResumeTask",
    );
  });
});

it("a late approval receipt cannot consume a newer deposit's pending record", () => {
  const oldHash = `0x${"ab".repeat(32)}`,
    newHash = `0x${"cd".repeat(32)}`;
  const pending = JSON.stringify({ hash: newHash, vault, chainId: 31337 });
  expect(
    receiptMatchesPending(pending, oldHash, { vault, chainId: 31337 }),
  ).toBe(false);
  expect(
    receiptMatchesPending(pending, newHash, { vault, chainId: 31337 }),
  ).toBe(true);
});
it("pending reconciliation refuses another vault, chain or corrupt record", () => {
  const pending = JSON.stringify({ hash: zeroHash, vault, chainId: 31337 });
  expect(
    receiptMatchesPending(pending, zeroHash, { vault: token, chainId: 31337 }),
  ).toBe(false);
  expect(
    receiptMatchesPending(pending, zeroHash, { vault, chainId: 10143 }),
  ).toBe(false);
  expect(
    receiptMatchesPending("{broken", zeroHash, { vault, chainId: 31337 }),
  ).toBe(false);
});
