import {
  createDatabase,
  PostgresIntentStore,
  identity,
} from "@flint/agent/server";
import { PostgresWorkspaceStore } from "../../src/server/postgres-store";
import { zeroHash } from "viem";
const url = process.env.EARMARK_TEST_DB_URL,
  rawScope = process.env.EARMARK_TEST_SCOPE;
if (!url || !rawScope?.startsWith("test:"))
  throw Error("ISOLATED_DATABASE_TEST_REQUIRED");
const scope = rawScope;
const pool = createDatabase(url),
  task = identity("task", scope),
  run = identity("run", scope),
  provider = `0x${"11".repeat(20)}`;
const store = new PostgresIntentStore(pool, scope, {
  runId: run,
  mandateId: task,
  providers: [{ id: "datahub", address: provider }],
});
const db = new PostgresWorkspaceStore(pool, scope, {
  vault: provider as `0x${string}`,
  genesis: zeroHash,
});
async function main() {
  console.log("TEST_WORKER_STARTED");
  await store.exclusive(async () => {
    console.log("TEST_WORKER_LOCK_ACQUIRED");
    await store.put({
      key: identity("intent", scope),
      requestId: identity("request", scope),
      paymentId: identity("payment", scope),
      genesisHash: zeroHash,
      quote: {
        providerId: "datahub",
        taskHash: task,
        token: provider as `0x${string}`,
        price: "6000000",
        quoteId: identity("quote", scope),
        expiresAt: 2000000000,
        currency: "mock-USDC",
        decimals: 6,
        commitment: identity("artifact", scope),
        description: "simulated",
      },
      requestTx: {
        hash: identity("transaction", scope),
        nonce: 0,
        state: "uncertain",
      },
    });
    console.log("TEST_WORKER_INTENT_COMMITTED");
    await db.mutate((s) => {
      s.events.push({
        id: s.nextId++,
        observedAt: Date.now(),
        runId: run,
        type: "transaction.uncertain",
        source: "application",
        data: { transactionHash: identity("transaction", scope) },
      });
    });
    console.log("DURABLE_UNCERTAIN_RECORD_READY");
    await new Promise<void>(() => {
      setInterval(() => {}, 1000);
    });
  });
}
main().catch(() => {
  console.error("TEST_WORKER_FAILED");
  process.exitCode = 1;
});
