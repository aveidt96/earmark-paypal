import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { zeroHash } from "viem";
import {
  startAnvil,
  createFixture,
  type LocalNode,
  type LocalFixture,
} from "../../agent/dist/local/harness.js";
import { MockModel, type AgentModel } from "@flint/agent/server";
import { mandateTaskHash } from "@flint/agent/task";
import { WorkspaceService } from "../src/server/service";
import { ownerAbi } from "../src/lib/abi";
import { launchTypedData } from "../src/lib/model";
let node: LocalNode;
beforeAll(async () => {
  node = await startAnvil();
}, 30000);
afterAll(async () => {
  await node?.close();
});
async function fixture(model: AgentModel = new MockModel()) {
  const f = await createFixture(node);
  const description =
    "Purchase a weather dataset from an approved provider for no more than 10 USDC.";
  const salt = zeroHash;
  const id = mandateTaskHash(f.vault, description, salt);
  const receipt = await f.wait(
    await f.ownerWallet.writeContract({
      address: f.vault,
      abi: ownerAbi,
      functionName: "createMandate",
      args: [
        id,
        f.chain.agent,
        f.token,
        10_000_000n,
        BigInt((await f.chain.now()) + 86400),
        f.infos.map((p) => p.address),
        {
          deliveryWindow: 3600n,
          challengeWindow: 3600n,
          trustedDeliverableHash: zeroHash,
        },
      ],
    }),
  );
  let now = Math.floor(Date.now() / 1000);
  const options = {
    config: {
      chainId: 31337 as const,
      network: "Local Anvil",
      rpcUrl: node.rpcUrl,
      vault: f.vault,
      token: f.token,
      agent: f.chain.agent,
      providers: f.infos,
    },
    chain: f.chain,
    model,
    providers: f.providers,
    statePath: join(
      process.cwd(),
      "..",
      ".tools",
      "stage-6-tests",
      `${randomUUID()}.json`,
    ),
    journalPath: join(
      process.cwd(),
      "..",
      ".tools",
      "stage-6-tests",
      `${randomUUID()}.json`,
    ),
    fromBlock: 0n,
    now: () => now,
  };
  const service = new WorkspaceService(options);
  await service.register({
    mandateId: id,
    description,
    salt,
    transactionHash: receipt.transactionHash,
  });
  return {
    f,
    id,
    service,
    options,
    advance: (seconds = 121) => {
      now += seconds;
    },
  };
}
async function signed(
  t: Awaited<ReturnType<typeof fixture>>,
  action: "launch" | "resume" = "launch",
  wallet?: LocalFixture["ownerWallet"],
) {
  const c = await t.service.challenge({ mandateId: t.id, action });
  const signature = await (wallet ?? t.f.ownerWallet).signTypedData(
    launchTypedData(c),
  );
  return { nonce: c.nonce, signature };
}
describe("Signed owner launch with real TaskVault", () => {
  it("runs real reservation, delivery and acceptance; refresh recovery has stable events", async () => {
    const t = await fixture();
    const auth = await signed(t);
    const { runId } = await t.service.launch(auth);
    await t.service.waitForRun(runId);
    const s = await t.service.snapshot();
    const p = s.payments.find((p) => p.taskHash === t.id);
    expect(p?.status).toBe("ACCEPTED");
    expect(p?.amount).toBe("6000000");
    expect(s.balance?.reserved).toBe("6000000");
    expect(s.runs[0]?.inspected).toBe(true);
    expect(s.runs[0]?.quotes).toHaveLength(2);
    const recovered = await new WorkspaceService(t.options).snapshot();
    expect(recovered.events.map((e) => e.id)).toEqual(
      s.events.map((e) => e.id),
    );
    expect(recovered.payments).toEqual(s.payments);
    await expect(t.service.launch(auth)).rejects.toThrow("EXPIRED_OR_USED");
    await expect(t.service.launch(await signed(t))).rejects.toThrow(
      "DUPLICATE_TASK_INTENT",
    );
  }, 30000);
  it("rejects a non-owner signature and arbitrary tool fields", async () => {
    const t = await fixture();
    await expect(
      t.service.launch(await signed(t, "launch", t.f.observerWallet)),
    ).rejects.toThrow("OWNER_SIGNATURE_REQUIRED");
    await expect(
      t.service.challenge({
        mandateId: t.id,
        action: "launch",
        calldata: "0x",
      }),
    ).rejects.toThrow();
    expect((await t.service.snapshot()).runs).toHaveLength(0);
  }, 20000);
  it("rejects expired signed authorizations", async () => {
    const t = await fixture();
    const auth = await signed(t);
    t.advance();
    await expect(t.service.launch(auth)).rejects.toThrow("EXPIRED_OR_USED");
  }, 20000);
  it("revalidates revoked authority", async () => {
    const t = await fixture();
    const auth = await signed(t);
    await t.f.wait(
      await t.f.ownerWallet.writeContract({
        address: t.f.vault,
        abi: ownerAbi,
        functionName: "revokeMandate",
        args: [t.id],
      }),
    );
    await expect(t.service.launch(auth)).rejects.toThrow(
      "MANDATE_INACTIVE_OR_EXPIRED",
    );
  }, 20000);
  it("missing mandate fails closed", async () => {
    const t = await fixture();
    await expect(
      t.service.challenge({
        mandateId: `0x${"12".repeat(32)}`,
        action: "launch",
      }),
    ).rejects.toThrow();
  }, 20000);
  it("model failure records an error, no fabricated escrow", async () => {
    const t = await fixture({
      mode: "mock",
      async decide() {
        throw new Error("MODEL_UNAVAILABLE");
      },
    });
    const { runId } = await t.service.launch(await signed(t));
    await t.service.waitForRun(runId);
    const s = await t.service.snapshot();
    expect(s.runs[0]?.status).toBe("failed");
    expect(s.payments).toHaveLength(0);
    expect(s.events.some((e) => e.type === "run.failed")).toBe(true);
  }, 20000);
  it("reconciles an uncertain broadcast using the same durable intent", async () => {
    const t = await fixture();
    const broadcast = t.f.chain.broadcast.bind(t.f.chain);
    let first = true;
    t.f.chain.broadcast = async (tx) => {
      const hash = await broadcast(tx);
      if (first) {
        first = false;
        throw new Error("RPC_TIMEOUT");
      }
      return hash;
    };
    const { runId } = await t.service.launch(await signed(t));
    await t.service.waitForRun(runId);
    expect((await t.service.snapshot()).runs[0]?.status).toBe("failed");
    await t.service.launch(await signed(t, "resume"));
    await t.service.waitForRun(runId);
    const s = await t.service.snapshot();
    expect(s.payments).toHaveLength(1);
    expect(s.payments[0]?.status).toBe("ACCEPTED");
  }, 30000);
});

describe("Adversarial launch and persistence boundaries", () => {
  it("rejects a signature with the wrong chain domain", async () => {
    const t = await fixture();
    const c = await t.service.challenge({ mandateId: t.id, action: "launch" });
    const typed = launchTypedData(c);
    const signature = await t.f.ownerWallet.signTypedData({
      ...typed,
      domain: { ...typed.domain, chainId: 1 },
    });
    await expect(
      t.service.launch({ nonce: c.nonce, signature }),
    ).rejects.toThrow("OWNER_SIGNATURE_REQUIRED");
  }, 20000);
  it("rejects a signature for a different action", async () => {
    const t = await fixture();
    const c = await t.service.challenge({ mandateId: t.id, action: "launch" });
    const signature = await t.f.ownerWallet.signTypedData(
      launchTypedData({ ...c, action: "resume" }),
    );
    await expect(
      t.service.launch({ nonce: c.nonce, signature }),
    ).rejects.toThrow("OWNER_SIGNATURE_REQUIRED");
  }, 20000);
  it("expires authorization exactly at its cutoff", async () => {
    const t = await fixture();
    const auth = await signed(t);
    t.advance(120);
    await expect(t.service.launch(auth)).rejects.toThrow("EXPIRED_OR_USED");
  }, 20000);
  it("rechecks current owner after ownership transfer", async () => {
    const t = await fixture();
    const auth = await signed(t);
    await t.f.wait(
      await t.f.ownerWallet.writeContract({
        address: t.f.vault,
        abi: t.f.vaultArtifact.abi,
        functionName: "transferOwnership",
        args: [t.f.observerWallet.account.address],
      }),
    );
    await t.f.wait(
      await t.f.observerWallet.writeContract({
        address: t.f.vault,
        abi: t.f.vaultArtifact.abi,
        functionName: "acceptOwnership",
      }),
    );
    await expect(t.service.launch(auth)).rejects.toThrow(
      "OWNER_SIGNATURE_REQUIRED",
    );
  }, 20000);
  it("two valid nonces cannot create two purchases for one UI mandate", async () => {
    const t = await fixture();
    const a = await signed(t),
      b = await signed(t);
    const results = await Promise.allSettled([
      t.service.launch(a),
      t.service.launch(b),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const run = results.find((r) => r.status === "fulfilled");
    if (run?.status !== "fulfilled")
      throw new Error("Expected one accepted launch");
    await t.service.waitForRun(run.value.runId);
    expect((await t.service.snapshot()).payments).toHaveLength(1);
    const recovered = new WorkspaceService(t.options);
    await expect(recovered.launch(a)).rejects.toThrow();
    await expect(recovered.launch(b)).rejects.toThrow();
  }, 30000);
  it("provider failure is recorded without a payment success", async () => {
    const t = await fixture();
    const provider = t.f.providers[0];
    if (!provider) throw new Error("Missing fixture provider");
    vi.spyOn(provider, "getQuote").mockRejectedValue(
      new Error("PROVIDER_UNAVAILABLE"),
    );
    const { runId } = await t.service.launch(await signed(t));
    await t.service.waitForRun(runId);
    const s = await t.service.snapshot();
    expect(s.runs[0]?.status).toBe("failed");
    expect(s.payments).toHaveLength(0);
  }, 20000);
  it("invalid model output is rejected before financial calls", async () => {
    const t = await fixture({
      mode: "mock",
      async decide() {
        return { type: "sendTransaction", calldata: "0x" } as never;
      },
    });
    const { runId } = await t.service.launch(await signed(t));
    await t.service.waitForRun(runId);
    expect((await t.service.snapshot()).runs[0]?.status).toBe("failed");
    expect((await t.service.snapshot()).payments).toHaveLength(0);
  }, 20000);
  it("resumes existing escrow after revocation without creating new authority", async () => {
    const t = await fixture();
    const broadcast = t.f.chain.broadcast.bind(t.f.chain);
    let first = true;
    t.f.chain.broadcast = async (tx) => {
      const hash = await broadcast(tx);
      if (first) {
        first = false;
        throw new Error("RPC_TIMEOUT");
      }
      return hash;
    };
    const { runId } = await t.service.launch(await signed(t));
    await t.service.waitForRun(runId);
    expect((await t.service.snapshot()).payments[0]?.status).toBe("FUNDED");
    await t.f.wait(
      await t.f.ownerWallet.writeContract({
        address: t.f.vault,
        abi: ownerAbi,
        functionName: "revokeMandate",
        args: [t.id],
      }),
    );
    await t.service.launch(await signed(t, "resume"));
    await t.service.waitForRun(runId);
    const s = await t.service.snapshot();
    expect(s.payments).toHaveLength(1);
    expect(s.payments[0]?.status).toBe("ACCEPTED");
    expect(s.mandates.find((m) => m.id === t.id)?.active).toBe(false);
  }, 30000);
});
