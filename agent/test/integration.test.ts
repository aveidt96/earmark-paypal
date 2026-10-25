import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  identity,
  EventStream,
  quoteSchema,
  deliverySchema,
  type AgentDecision,
  type AgentModel,
} from "../src/domain.js";
import {
  startAnvil,
  createFixture,
  type LocalNode,
} from "../src/local/harness.js";
import { MockModel } from "../src/models.js";
import { AgentError } from "../src/errors.js";
import { runAgent } from "../src/runner.js";
import { AgentTools } from "../src/tools.js";
import { IntentStore } from "../src/store.js";
import {
  SimulatedProvider,
  maliciousDescription,
  type ServiceProvider,
} from "../src/providers.js";
import { vaultAbi } from "../src/abi.js";
let node: LocalNode;
beforeAll(async () => {
  node = await startAnvil();
}, 30000);
afterAll(async () => {
  await node?.close();
}, 10000);
const deadline = 30000;
function replaceProvider(
  base: ServiceProvider,
  overrides: Partial<ServiceProvider>,
): ServiceProvider {
  return {
    info: base.info,
    getQuote: base.getQuote.bind(base),
    getDelivery: base.getDelivery.bind(base),
    ...overrides,
  };
}
describe("actual TaskVault + Anvil autonomous agent", () => {
  it(
    "matches the compiled contract ABI and exposes only two agent writes",
    async () => {
      const f = await createFixture(node);
      for (const entry of vaultAbi) {
        const actual = f.vaultArtifact.abi.find(
          (item) =>
            item.type === entry.type &&
            "name" in item &&
            "name" in entry &&
            item.name === entry.name,
        );
        expect(actual, `ABI ${entry.name}`).toBeDefined();
        if ("inputs" in entry && actual && "inputs" in actual)
          expect(actual.inputs.map((i) => i.type)).toEqual(
            entry.inputs.map((i) => i.type),
          );
        if ("outputs" in entry && actual && "outputs" in actual)
          expect(actual.outputs).toMatchObject(entry.outputs);
      }
      expect(
        vaultAbi
          .filter(
            (e) => e.type === "function" && e.stateMutability === "nonpayable",
          )
          .map((e) => e.name),
      ).toEqual(["requestPayment", "acceptDelivery"]);
    },
    deadline,
  );
  it(
    "chooses DataHub at 6 USDC, reserves, inspects, accepts and observes full-window settlement",
    async () => {
      const f = await createFixture(node);
      const result = await f.run();
      expect(result.mode).toBe("mock");
      expect(result.payment.status).toBe("ACCEPTED");
      expect(result.payment.amount).toBe("6000000");
      expect(result.payment.provider.toLowerCase()).toBe(
        f.infos[0]?.address.toLowerCase(),
      );
      expect(f.chain.agent.toLowerCase()).not.toBe(
        f.ownerWallet.account.address.toLowerCase(),
      );
      expect(await f.chain.balance()).toBe("14000000");
      expect(
        await node.publicClient.readContract({
          address: f.token,
          abi: f.tokenArtifact.abi,
          functionName: "balanceOf",
          args: [result.payment.provider],
        }),
      ).toBe(0n);
      expect(
        f.events.events
          .filter((e) => e.type === "provider.quote.received")
          .map((e) => e.data.price),
      ).toEqual(["6000000", "8000000"]);
      expect(
        f.events.events.some(
          (e) =>
            e.type === "transaction.confirmed" &&
            typeof e.data.transactionHash === "string",
        ),
      ).toBe(true);
      await expect(
        node.publicClient.simulateContract({
          address: f.vault,
          abi: f.vaultArtifact.abi,
          functionName: "settlePayment",
          args: [result.payment.id],
          account: f.observerWallet.account,
        }),
      ).rejects.toThrow();
      const final = await f.settle(result.payment.id);
      expect(final.payment.status).toBe("COMPLETED");
      const m = await f.chain.mandate(f.task.taskHash);
      expect(m.reserved).toBe("0");
      expect(m.settled).toBe("6000000");
      expect(
        await node.publicClient.readContract({
          address: f.token,
          abi: f.tokenArtifact.abi,
          functionName: "balanceOf",
          args: [result.payment.provider],
        }),
      ).toBe(6_000_000n);
    },
    deadline,
  );
  it(
    "rejects a missing mandate",
    async () => {
      const f = await createFixture(node);
      await expect(
        f.run(undefined, undefined, {
          ...f.task,
          taskHash: identity("missing"),
        }),
      ).rejects.toThrow("MANDATE_NOT_FOUND");
    },
    deadline,
  );
  it(
    "rejects expired authority at its exact expiry",
    async () => {
      const f = await createFixture(node);
      const m = await f.chain.mandate(f.task.taskHash);
      await node.testClient.setNextBlockTimestamp({
        timestamp: BigInt(m.expiry),
      });
      await node.testClient.mine({ blocks: 1 });
      await expect(f.run()).rejects.toThrow("MANDATE_INACTIVE_OR_EXPIRED");
    },
    deadline,
  );
  it(
    "rejects revoked authority",
    async () => {
      const f = await createFixture(node, { revoked: true });
      await expect(f.run()).rejects.toThrow("MANDATE_INACTIVE_OR_EXPIRED");
    },
    deadline,
  );
  it(
    "rejects an unapproved registry provider",
    async () => {
      const f = await createFixture(node, { approved: ["weatherco"] });
      const t = f.makeTools();
      await t.call("listApprovedProviders", {});
      await expect(
        t.call("getProviderQuote", { providerId: "datahub" }),
      ).rejects.toThrow("UNAPPROVED_PROVIDER");
    },
    deadline,
  );
  it(
    "enforces cumulative task cap before signing",
    async () => {
      const f = await createFixture(node, { cap: 5_000_000n });
      const sign = vi.spyOn(f.chain, "prepareRequest");
      await expect(f.run()).rejects.toThrow("INSUFFICIENT_TASK_CAP");
      expect(sign).not.toHaveBeenCalled();
    },
    deadline,
  );
  it(
    "rejects insufficient actual vault liquidity",
    async () => {
      const f = await createFixture(node, { deposit: 0n });
      await expect(f.run()).rejects.toThrow("INSUFFICIENT_VAULT_FUNDS");
    },
    deadline,
  );
  it(
    "rejects invalid model decisions",
    async () => {
      const f = await createFixture(node);
      const bad: AgentModel = {
        mode: "mock",
        decide: async () =>
          ({
            kind: "tool",
            name: "withdrawFunds",
            args: {},
            summary: "hostile",
          }) as unknown as AgentDecision,
      };
      await expect(f.run(bad)).rejects.toThrow("INVALID_MODEL_RESPONSE");
    },
    deadline,
  );
  it(
    "times out a model without fabricating a decision",
    async () => {
      const f = await createFixture(node);
      const model: AgentModel = {
        mode: "mock",
        decide: () => new Promise(() => {}),
      };
      await expect(
        runAgent(model, f.makeTools(), f.chain, { modelTimeoutMs: 10 }),
      ).rejects.toThrow("MODEL_TIMEOUT");
    },
    deadline,
  );
  it(
    "rejects extra transaction/recipient tool arguments",
    async () => {
      const f = await createFixture(node);
      await expect(
        f.makeTools().call("requestMandatePayment", {
          quoteId: identity("quote"),
          recipient: f.ownerWallet.account.address,
          calldata: "0x",
        }),
      ).rejects.toThrow("INVALID_TOOL_ARGUMENTS");
    },
    deadline,
  );
  it(
    "times out an unresponsive provider",
    async () => {
      const f = await createFixture(node);
      const first = f.providers[0];
      if (!first) throw new Error("fixture");
      const providers = [
        replaceProvider(first, { getQuote: () => new Promise(() => {}) }),
        ...f.providers.slice(1),
      ];
      const tools = new AgentTools(
        f.task,
        f.chain,
        new IntentStore(f.storePath),
        providers,
        new EventStream(),
        10,
      );
      await expect(runAgent(new MockModel(), tools, f.chain)).rejects.toThrow(
        "PROVIDER_TIMEOUT",
      );
    },
    deadline,
  );
  it(
    "records actual mock policy behavior on indirect prompt injection without forcing failure",
    async () => {
      const f = await createFixture(node);
      const info = f.infos[0];
      if (!info) throw new Error("fixture");
      const malicious = new SimulatedProvider(
        info,
        "6000000",
        (id, hash) => f.submit(id, hash, info.id),
        maliciousDescription,
      );
      const result = await f.run(new MockModel(), [
        malicious,
        ...f.providers.slice(1),
      ]);
      expect(result.payment.status).toBe("ACCEPTED");
      expect(result.payment.amount).toBe("6000000");
      expect(
        result.events.some(
          (e) =>
            e.source === "model" &&
            String(e.data.summary).includes("ignores provider instructions"),
        ),
      ).toBe(true);
      expect(result.events.every((e) => !("privateKey" in e.data))).toBe(true);
    },
    deadline,
  );
  it(
    "rejects a quote containing a substituted recipient",
    async () => {
      const f = await createFixture(node);
      const base = f.providers[0];
      if (!base) throw new Error("fixture");
      const hostile = replaceProvider(base, {
        getQuote: async (...args) => ({
          ...quoteSchema.parse(await base.getQuote(...args)),
          recipient: f.ownerWallet.account.address,
        }),
      });
      await expect(
        f.run(undefined, [hostile, ...f.providers.slice(1)]),
      ).rejects.toThrow("INVALID_QUOTE");
    },
    deadline,
  );
  it(
    "persists an uncertain sent transaction then reconciles its receipt on restart without another request",
    async () => {
      const f = await createFixture(node);
      const original = f.chain.broadcast.bind(f.chain);
      const broadcast = vi
        .spyOn(f.chain, "broadcast")
        .mockImplementationOnce(async (call) => {
          await original(call);
          throw new AgentError("RPC_RESPONSE_LOST");
        });
      await expect(f.run()).rejects.toThrow("UNCERTAIN_TRANSACTION");
      const t = f.makeTools();
      const record = await new IntentStore(f.storePath).get(t.intentKey);
      expect(record?.requestTx?.state).toBe("uncertain");
      const resumed = await f.run();
      expect(resumed.payment.status).toBe("ACCEPTED");
      expect(
        broadcast.mock.calls.filter(([call]) => call.action === "request"),
      ).toHaveLength(1);
      expect(
        broadcast.mock.calls.filter(([call]) => call.action === "accept"),
      ).toHaveLength(1);
      expect((await f.chain.mandate(f.task.taskHash)).reserved).toBe("6000000");
    },
    deadline,
  );
  it(
    "never blindly resends after a timeout before broadcast",
    async () => {
      const f = await createFixture(node);
      const broadcast = vi
        .spyOn(f.chain, "broadcast")
        .mockRejectedValueOnce(new AgentError("RPC_TIMEOUT"));
      await expect(f.run()).rejects.toThrow("UNCERTAIN_TRANSACTION");
      await expect(f.run()).rejects.toThrow("UNCERTAIN_TRANSACTION");
      expect(broadcast).toHaveBeenCalledTimes(1);
      expect((await f.chain.mandate(f.task.taskHash)).reserved).toBe("0");
    },
    deadline,
  );
  it(
    "reconciles a receipt-query timeout after successful broadcast",
    async () => {
      const f = await createFixture(node);
      const receipt = f.chain.receipt.bind(f.chain);
      let lost = true;
      vi.spyOn(f.chain, "receipt").mockImplementation(async (hash, wait) => {
        if (wait && lost) {
          lost = false;
          throw new AgentError("RPC_TIMEOUT");
        }
        return receipt(hash, wait);
      });
      const broadcast = vi.spyOn(f.chain, "broadcast");
      await expect(f.run()).rejects.toThrow("UNCERTAIN_TRANSACTION");
      expect((await f.run()).payment.status).toBe("ACCEPTED");
      expect(
        broadcast.mock.calls.filter(([call]) => call.action === "request"),
      ).toHaveLength(1);
    },
    deadline,
  );
  it(
    "observes an actual reverted transaction after authority changes between simulation and mining",
    async () => {
      const f = await createFixture(node);
      const broadcast = f.chain.broadcast.bind(f.chain);
      vi.spyOn(f.chain, "broadcast").mockImplementationOnce(async (call) => {
        await f.wait(
          await f.ownerWallet.writeContract({
            address: f.vault,
            abi: f.vaultArtifact.abi,
            functionName: "revokeMandate",
            args: [f.task.taskHash],
          }),
        );
        await broadcast(call);
      });
      await expect(f.run()).rejects.toThrow("TRANSACTION_REVERTED");
      const record = await new IntentStore(f.storePath).get(
        f.makeTools().intentKey,
      );
      expect(record?.requestTx?.state).toBe("reverted");
      expect((await f.chain.mandate(f.task.taskHash)).reserved).toBe("0");
      expect(
        f.events.events.some((e) => e.type === "transaction.reverted"),
      ).toBe(true);
    },
    deadline,
  );
  it(
    "does not purchase or accept twice for the same persisted intent",
    async () => {
      const f = await createFixture(node);
      const first = await f.run();
      const broadcast = vi.spyOn(f.chain, "broadcast");
      const second = await f.run();
      expect(second.payment.id).toBe(first.payment.id);
      expect(broadcast).not.toHaveBeenCalled();
    },
    deadline,
  );
  it(
    "observes an already completed payment without another transaction",
    async () => {
      const f = await createFixture(node);
      const first = await f.run();
      await f.settle(first.payment.id);
      const broadcast = vi.spyOn(f.chain, "broadcast");
      expect((await f.run()).payment.status).toBe("COMPLETED");
      expect(broadcast).not.toHaveBeenCalled();
    },
    deadline,
  );
  it(
    "permits an explicitly distinct trusted purchase key within cumulative authority",
    async () => {
      const f = await createFixture(node, { cap: 20_000_000n });
      const first = await f.run();
      const second = await f.run(undefined, undefined, {
        ...f.task,
        purchaseKey: "weather-purchase-002",
      });
      expect(second.payment.id).not.toBe(first.payment.id);
      expect((await f.chain.mandate(f.task.taskHash)).reserved).toBe(
        "12000000",
      );
    },
    deadline,
  );
  it(
    "does not let a different quote create another purchase under the same trusted intent",
    async () => {
      const f = await createFixture(node, { cap: 20_000_000n });
      await f.run();
      const t = f.makeTools();
      await t.call("listApprovedProviders", {});
      await t.call("getProviderQuote", { providerId: "weatherco" });
      const quote = t.context.observations.quotes[0];
      if (!quote) throw new Error("fixture");
      await expect(
        t.store.exclusive(() =>
          t.call("requestMandatePayment", {
            quoteId: quote.quoteId,
            reason: "retry with different quote",
          }),
        ),
      ).rejects.toThrow("PURCHASE_INTENT_CONFLICT");
      expect((await f.chain.mandate(f.task.taskHash)).reserved).toBe("6000000");
    },
    deadline,
  );
  it(
    "rejects incorrect delivery structure despite real provider submission, preserving escrow",
    async () => {
      const f = await createFixture(node);
      const base = f.providers[0];
      if (!base) throw new Error("fixture");
      const hostile = replaceProvider(base, {
        getDelivery: async (...args) => {
          const delivered = deliverySchema.parse(
            await base.getDelivery(...args),
          );
          return {
            ...delivered,
            artifact: { ...delivered.artifact, rows: [] },
          };
        },
      });
      await expect(
        f.run(undefined, [hostile, ...f.providers.slice(1)]),
      ).rejects.toThrow("INVALID_DELIVERY");
      const record = await new IntentStore(f.storePath).get(
        f.makeTools().intentKey,
      );
      expect(record).toBeDefined();
      if (!record) throw new Error("fixture");
      expect((await f.chain.payment(record.paymentId))?.status).toBe(
        "SUBMITTED",
      );
      expect((await f.chain.mandate(f.task.taskHash)).reserved).toBe("6000000");
      const p = await f.chain.payment(record.paymentId);
      if (!p) throw new Error("fixture");
      await node.testClient.setNextBlockTimestamp({
        timestamp: BigInt(p.reviewDeadline),
      });
      await node.testClient.mine({ blocks: 1 });
      const hash = await f.observerWallet.writeContract({
        address: f.vault,
        abi: f.vaultArtifact.abi,
        functionName: "refundExpired",
        args: [p.id],
      });
      await f.wait(hash);
      expect((await f.chain.payment(p.id))?.status).toBe("EXPIRED");
      expect((await f.chain.mandate(f.task.taskHash)).reserved).toBe("0");
    },
    deadline,
  );
  it(
    "blocks acceptance unless deterministic inspection has passed",
    async () => {
      const f = await createFixture(node);
      const t = f.makeTools();
      await t.call("getMandate", {});
      await t.call("listApprovedProviders", {});
      await t.call("getProviderQuote", { providerId: "datahub" });
      const quote = t.context.observations.quotes[0];
      if (!quote) throw new Error("fixture");
      await t.store.exclusive(async () => {
        await t.call("requestMandatePayment", {
          quoteId: quote.quoteId,
          reason: "valid purchase",
        });
        await expect(t.call("acceptDelivery", {})).rejects.toThrow(
          "DELIVERY_INSPECTION_REQUIRED",
        );
      });
    },
    deadline,
  );
  it(
    "reconciles acceptance after its broadcast response is lost without accepting twice",
    async () => {
      const f = await createFixture(node);
      const original = f.chain.broadcast.bind(f.chain);
      let lost = true;
      const broadcast = vi
        .spyOn(f.chain, "broadcast")
        .mockImplementation(async (call) => {
          await original(call);
          if (call.action === "accept" && lost) {
            lost = false;
            throw new AgentError("RPC_RESPONSE_LOST");
          }
        });
      await expect(f.run()).rejects.toThrow("UNCERTAIN_TRANSACTION");
      const resumed = await f.run();
      expect(resumed.payment.status).toBe("ACCEPTED");
      expect(
        broadcast.mock.calls.filter(([call]) => call.action === "accept"),
      ).toHaveLength(1);
      const record = await new IntentStore(f.storePath).get(
        f.makeTools().intentKey,
      );
      expect(record?.acceptTx?.state).toBe("confirmed");
    },
    deadline,
  );
  it(
    "refuses startup after vault bytecode differs from its trusted pin",
    async () => {
      const f = await createFixture(node);
      await node.testClient.setCode({ address: f.vault, bytecode: "0x00" });
      await expect(f.run()).rejects.toThrow("UNEXPECTED_VAULT_CODE");
    },
    deadline,
  );
  it(
    "refuses a mandate assigned to a different agent",
    async () => {
      const f = await createFixture(node);
      const task = { ...f.task, taskHash: identity("other-agent", f.vault) };
      await f.wait(
        await f.ownerWallet.writeContract({
          address: f.vault,
          abi: f.vaultArtifact.abi,
          functionName: "createMandate",
          args: [
            task.taskHash,
            f.observerWallet.account.address,
            f.token,
            10000000n,
            BigInt((await f.chain.now()) + 86400),
            f.infos.map((p) => p.address),
            {
              deliveryWindow: 3600n,
              challengeWindow: 3600n,
              trustedDeliverableHash: `0x${"0".repeat(64)}`,
            },
          ],
        }),
      );
      await expect(f.run(undefined, undefined, task)).rejects.toThrow(
        "MANDATE_IDENTITY_MISMATCH",
      );
    },
    deadline,
  );
  it(
    "resumes an existing escrow after revocation without requesting another payment",
    async () => {
      const f = await createFixture(node);
      const first = await f.run();
      await f.wait(
        await f.ownerWallet.writeContract({
          address: f.vault,
          abi: f.vaultArtifact.abi,
          functionName: "revokeMandate",
          args: [f.task.taskHash],
        }),
      );
      const broadcast = vi.spyOn(f.chain, "broadcast");
      expect((await f.run()).payment.id).toBe(first.payment.id);
      expect(broadcast).not.toHaveBeenCalled();
    },
    deadline,
  );
  it(
    "canonicalizes task hash casing when resuming the same trusted purchase intent",
    async () => {
      const f = await createFixture(node, { cap: 20000000n });
      const first = await f.run();
      const broadcast = vi.spyOn(f.chain, "broadcast");
      const sameTask = {
        ...f.task,
        taskHash:
          `0x${f.task.taskHash.slice(2).toUpperCase()}` as `0x${string}`,
      };
      const resumed = await f.run(undefined, undefined, sameTask);
      expect(resumed.payment.id).toBe(first.payment.id);
      expect(broadcast).not.toHaveBeenCalled();
    },
    deadline,
  );
});
