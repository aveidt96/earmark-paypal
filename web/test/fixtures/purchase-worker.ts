/** Isolated test worker; local Anvil only. No HTTP endpoint or key export. */
import {
  createDatabase,
  parseRuntimeConfig,
  VaultChain,
  MockModel,
  SimulatedProvider,
  PostgresIntentStore,
} from "@flint/agent/server";
import { createPublicClient, createWalletClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { anvil } from "viem/chains";
import { WorkspaceService } from "../../src/server/service";
import { PostgresWorkspaceStore } from "../../src/server/postgres-store";
import { ownerAbi } from "../../src/lib/abi";
import { reconcileHosted } from "../../../api/src/recovery";
async function main() {
  if (
    process.env.AGENT_CHAIN_ID !== "31337" ||
    !process.env.EARMARK_TEST_DB_URL ||
    !process.send
  )
    throw Error("LOCAL_TEST_WORKER_REQUIRED");
  const config = parseRuntimeConfig(process.env),
    chain = new VaultChain(config),
    pool = createDatabase(process.env.EARMARK_TEST_DB_URL);
  const scope = `31337:${chain.vault.toLowerCase()}`;
  const accounts = ["SIM_DATAHUB_PRIVATE_KEY", "SIM_WEATHERCO_PRIVATE_KEY"].map(
    (name) => privateKeyToAccount(process.env[name] as Hex),
  );
  const client = createPublicClient({
    chain: anvil,
    transport: http(config.AGENT_RPC_URL, { retryCount: 0 }),
  });
  const infos = accounts.map((a, i) => ({
    id: i ? "weatherco" : "datahub",
    name: i ? "WeatherCo" : "DataHub",
    address: a.address,
  }));
  const providers = infos.map(
    (info, i) =>
      new SimulatedProvider(
        info,
        i ? "8000000" : "6000000",
        async (id, commitment) => {
          const account = accounts[i];
          if (!account) throw Error("TEST_PROVIDER_MISSING");
          const payment = await chain.payment(id);
          if (
            !payment ||
            payment.provider.toLowerCase() !== info.address.toLowerCase()
          )
            throw Error("PROVIDER_PAYMENT_MISMATCH");
          if (
            payment.status === "SUBMITTED" &&
            payment.deliveredHash === commitment
          )
            return;
          const wallet = createWalletClient({
            chain: anvil,
            account,
            transport: http(config.AGENT_RPC_URL, { retryCount: 0 }),
          });
          const tx = await wallet.writeContract({
            address: chain.vault,
            abi: ownerAbi,
            functionName: "submitDelivery",
            args: [id, commitment],
          });
          if (
            (
              await client.waitForTransactionReceipt({
                hash: tx,
                timeout: 10000,
                pollingInterval: 50,
              })
            ).status !== "success"
          )
            throw Error("PROVIDER_SUBMISSION_REVERTED");
        },
      ),
  );
  if (process.env.EARMARK_TEST_FAIL_BROADCAST === "true") {
    const broadcast = chain.broadcast.bind(chain);
    chain.broadcast = async (signed) => {
      const hash = await broadcast(signed);
      process.send?.({ event: "broadcast", hash: signed.hash });
      // Test-only lost RPC response after a real broadcast. Parent kills this worker here.
      await new Promise<void>(() => {});
      return hash;
    };
  }
  const service = new WorkspaceService({
    config: {
      chainId: 31337,
      network: "Local Anvil",
      rpcUrl: config.AGENT_RPC_URL,
      vault: chain.vault,
      token: chain.token,
      agent: chain.agent,
      providers: infos,
    },
    chain,
    model: {
      mode: "mock",
      decide: async (context) => {
        const decision = await new MockModel().decide(context);
        process.send?.({
          event: "step",
          action: decision.kind === "tool" ? decision.name : "finish",
        });
        return decision;
      },
    },
    providers,
    providerTimeoutMs: 30000,
    fromBlock: BigInt(process.env.FLINT_DEPLOYMENT_BLOCK ?? "0"),
    statePath: "unused-postgres",
    journalPath: "unused-postgres",
    storeFactory: (initial) => new PostgresWorkspaceStore(pool, scope, initial),
    journalFactory: (runId, mandateId) =>
      new PostgresIntentStore(pool, `${scope}:${chain.agent.toLowerCase()}`, {
        runId,
        mandateId,
        providers: infos,
      }),
  });
  await service.ready();
  await reconcileHosted(service, pool);
  process.on("message", async (raw: unknown) => {
    const message = raw as { id: number; action: string; input: unknown };
    try {
      const value =
        message.action === "register"
          ? await service.register(message.input)
          : message.action === "challenge"
            ? await service.challenge(message.input)
            : message.action === "launch"
              ? await service.launch(message.input)
              : message.action === "snapshot"
                ? await service.snapshot()
                : message.action === "wait"
                  ? await service.waitForRun(String(message.input))
                  : (() => {
                      throw Error("UNKNOWN_TEST_ACTION");
                    })();
      process.send?.({ id: message.id, value });
    } catch (error) {
      process.send?.({
        id: message.id,
        error:
          error instanceof Error && /^[A-Z0-9_]+$/.test(error.message)
            ? error.message
            : "TEST_WORKER_REQUEST_FAILED",
      });
    }
  });
  process.send({ event: "ready" });
}
main().catch(() => {
  console.error("LOCAL_DATABASE_TEST_WORKER_FAILED");
  process.exit(1);
});
