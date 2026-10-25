import { describe, it, expect, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import {
  identity,
  createDatabase,
  migrateDatabase,
  PostgresIntentStore,
  MockModel,
  type Pool,
} from "@flint/agent/server";
import { zeroHash, erc20Abi, type Hex } from "viem";
import type { WorkspaceSnapshot, LaunchChallenge } from "../src/lib/model";
import { startLocalWorkspace } from "../../agent/dist/local/workspace.js";
import { PostgresWorkspaceStore } from "../src/server/postgres-store";
import { WorkspaceService } from "../src/server/service";
import { launchTypedData } from "../src/lib/model";
import { ownerAbi } from "../src/lib/abi";
import { mandateTaskHash } from "@flint/agent/task";
import {
  startAnvil,
  createFixture,
  type LocalNode,
} from "../../agent/dist/local/harness.js";
import { reconcileHosted } from "../../api/src/recovery";
const url = process.env.EARMARK_TEST_DB_URL;
const suite = url ? describe : describe.skip;
let pool: Pool | undefined, node: LocalNode | undefined;
const scopes = new Set<string>();
afterAll(async () => {
  if (pool) {
    for (const scope of scopes)
      for (const table of [
        "earmark_events",
        "earmark_runs",
        "earmark_launch_nonces",
        "earmark_intents",
        "earmark_provider_calls",
        "earmark_workspaces",
      ])
        await pool.query(
          "DELETE FROM " + table + " WHERE scope=$1 OR scope LIKE $2",
          [scope, scope + ":%"],
        );
    await pool.end();
  }
  await node?.close();
});
suite("real PostgreSQL transaction and restart boundaries", () => {
  it("survives an abruptly killed Node worker and fails closed during connection loss", async () => {
    if (!url) throw Error("DATABASE_TEST_CONFIGURATION_REQUIRED");
    const fresh = createDatabase(url);
    await migrateDatabase(fresh);
    const scope = `test:${randomUUID()}`;
    scopes.add(scope);
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "web/test/fixtures/postgres-worker.ts"],
      {
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, EARMARK_TEST_SCOPE: scope },
      },
    );
    try {
      let phase = "STARTING";
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(Error(`TEST_WORKER_TIMEOUT_${phase}`)),
          90000,
        );
        child.on("error", (error) => {
          clearTimeout(timeout);
          reject(error);
        });
        child.on("exit", () => {
          clearTimeout(timeout);
          reject(Error("TEST_WORKER_EXITED"));
        });
        child.stdout.on("data", (data) => {
          const marker = String(data).match(/TEST_WORKER_[A-Z_]+/);
          if (marker) phase = marker[0];
          if (String(data).includes("DURABLE_UNCERTAIN_RECORD_READY")) {
            clearTimeout(timeout);
            resolve();
          }
        });
      });
      const exited = once(child, "exit");
      child.kill("SIGKILL");
      await exited;
      const task = identity("task", scope),
        provider = `0x${"11".repeat(20)}`;
      const store = new PostgresIntentStore(fresh, scope, {
        runId: identity("run", scope),
        mandateId: task,
        providers: [{ id: "datahub", address: provider }],
      });
      await store.exclusive(async () => {
        expect(
          (await store.get(identity("intent", scope)))?.requestTx?.state,
        ).toBe("uncertain");
      });
      const workspace = new PostgresWorkspaceStore(fresh, scope, {
        vault: provider as Hex,
        genesis: zeroHash,
      });
      expect((await workspace.read()).events).toHaveLength(1);
      await fresh.end();
      await expect(workspace.read()).rejects.toThrow();
      const recovered = createDatabase(url);
      try {
        expect(
          (
            await new PostgresWorkspaceStore(recovered, scope, {
              vault: provider as Hex,
              genesis: zeroHash,
            }).read()
          ).events,
        ).toHaveLength(1);
      } finally {
        await recovered.end();
      }
    } finally {
      if (child.exitCode === null) child.kill("SIGKILL");
      if (!(fresh as Pool & { ended?: boolean }).ended) await fresh.end();
    }
  }, 120000);
  it("restarts the actual purchasing Node process after a real broadcast, resumes once and settles the same payment", async () => {
    if (!url) throw Error("DATABASE_TEST_CONFIGURATION_REQUIRED");
    const local = await startLocalWorkspace();
    await local.node.testClient.setIntervalMining({ interval: 1 });
    const scope = `31337:${local.vault.toLowerCase()}`;
    scopes.add(scope);
    const workers: ReturnType<typeof spawn>[] = [];
    const start = async (uncertain = false) => {
      const child = spawn(
        process.execPath,
        ["--import", "tsx", "web/test/fixtures/purchase-worker.ts"],
        {
          windowsHide: true,
          stdio: ["ignore", "ignore", "ignore", "ipc"],
          env: {
            ...process.env,
            ...local.serverEnv,
            EARMARK_TEST_FAIL_BROADCAST: String(uncertain),
          },
        },
      );
      workers.push(child);
      let next = 0;
      const requests = new Map<
        number,
        {
          resolve: (value: unknown) => void;
          reject: (error: Error) => void;
          timer: ReturnType<typeof setTimeout>;
        }
      >();
      const event = (name: string) =>
        new Promise<unknown>((resolve, reject) => {
          const timer = setTimeout(() => {
            child.off("message", receive);
            reject(Error(`TEST_WORKER_${name.toUpperCase()}_TIMEOUT`));
          }, 90000);
          const receive = (raw: unknown) => {
            const m = raw as { event?: string; hash?: Hex };
            if (m.event === name) {
              clearTimeout(timer);
              child.off("message", receive);
              resolve(m.hash);
            }
          };
          child.on("message", receive);
        });
      child.on("message", (raw: unknown) => {
        const m = raw as {
          id: number;
          value?: unknown;
          error?: string;
          event?: string;
          action?: string;
        };
        if (m.event === "step") console.log(`PURCHASE_WORKER_STEP:${m.action}`);
        const pending = requests.get(m.id);
        if (!pending) return;
        clearTimeout(pending.timer);
        requests.delete(m.id);
        if (m.error) pending.reject(Error(m.error));
        else pending.resolve(m.value);
      });
      child.on("exit", () => {
        for (const p of requests.values()) {
          clearTimeout(p.timer);
          p.reject(Error("TEST_WORKER_EXITED"));
        }
        requests.clear();
      });
      await event("ready");
      const call = (action: string, input?: unknown) =>
        new Promise<unknown>((resolve, reject) => {
          const id = ++next;
          const timer = setTimeout(() => {
            requests.delete(id);
            reject(Error("TEST_WORKER_REQUEST_TIMEOUT"));
          }, 90000);
          requests.set(id, { resolve, reject, timer });
          child.send?.({ id, action, input });
        });
      return { child, call, event };
    };
    const kill = async (child: ReturnType<typeof spawn>) => {
      if (child.exitCode === null && child.signalCode === null) {
        const exit = once(child, "exit");
        child.kill("SIGKILL");
        await exit;
      }
    };
    try {
      await local.wait(
        await local.ownerWallet.writeContract({
          address: local.token,
          abi: erc20Abi,
          functionName: "approve",
          args: [local.vault, 20000000n],
        }),
      );
      await local.wait(
        await local.ownerWallet.writeContract({
          address: local.vault,
          abi: ownerAbi,
          functionName: "deposit",
          args: [local.token, 20000000n],
        }),
      );
      const description =
        "Purchase a weather dataset from an approved provider for no more than 10 USDC.";
      const task = mandateTaskHash(local.vault, description, zeroHash);
      const created = await local.wait(
        await local.ownerWallet.writeContract({
          address: local.vault,
          abi: ownerAbi,
          functionName: "createMandate",
          args: [
            task,
            local.agentAddress,
            local.token,
            10000000n,
            (await local.node.publicClient.getBlock()).timestamp + 86400n,
            local.providers.map((p) => p.address),
            {
              deliveryWindow: 3600n,
              challengeWindow: 3600n,
              trustedDeliverableHash: zeroHash,
            },
          ],
        }),
      );
      const first = await start(true);
      await first.call("register", {
        mandateId: task,
        description,
        salt: zeroHash,
        transactionHash: created.transactionHash,
      });
      const challenge = (await first.call("challenge", {
        mandateId: task,
        action: "launch",
      })) as LaunchChallenge;
      const signature = await local.ownerWallet.signTypedData(
        launchTypedData(challenge),
      );
      const broadcast = first.event("broadcast");
      await first.call("launch", { nonce: challenge.nonce, signature });
      const hash = (await broadcast) as Hex;
      expect(
        (await local.node.publicClient.waitForTransactionReceipt({ hash }))
          .status,
      ).toBe("success");
      await kill(first.child);
      const second = await start();
      const before = (await second.call("snapshot")) as WorkspaceSnapshot;
      expect(before.payments).toHaveLength(1);
      expect(before.payments[0]?.status).toBe("FUNDED");
      await expect(
        second.call("launch", { nonce: challenge.nonce, signature }),
      ).rejects.toThrow("AUTHORIZATION_EXPIRED_OR_USED");
      await expect(
        second
          .call("challenge", { mandateId: task, action: "launch" })
          .then(async (raw) => {
            const c = raw as LaunchChallenge;
            return second.call("launch", {
              nonce: c.nonce,
              signature: await local.ownerWallet.signTypedData(
                launchTypedData(c),
              ),
            });
          }),
      ).rejects.toThrow("DUPLICATE_TASK_INTENT");
      const resume = (await second.call("challenge", {
        mandateId: task,
        action: "resume",
      })) as LaunchChallenge;
      const launched = (await second.call("launch", {
        nonce: resume.nonce,
        signature: await local.ownerWallet.signTypedData(
          launchTypedData(resume),
        ),
      })) as { runId: Hex };
      await second.call("wait", launched.runId);
      const accepted = (await second.call("snapshot")) as WorkspaceSnapshot;
      expect(accepted.payments).toHaveLength(1);
      expect(accepted.payments[0]?.id).toBe(before.payments[0]?.id);
      expect(accepted.payments[0]?.status).toBe("ACCEPTED");
      expect(accepted.balance?.reserved).toBe("6000000");
      const payment = accepted.payments[0];
      if (!payment) throw Error("PAYMENT_MISSING");
      await local.node.testClient.increaseTime({ seconds: 3600 });
      await local.node.testClient.mine({ blocks: 1 });
      await local.wait(
        await local.ownerWallet.writeContract({
          address: local.vault,
          abi: ownerAbi,
          functionName: "settlePayment",
          args: [payment.id],
        }),
      );
      await kill(second.child);
      const third = await start();
      const completed = (await third.call("snapshot")) as WorkspaceSnapshot;
      expect(completed.payments).toHaveLength(1);
      expect(completed.payments[0]?.status).toBe("COMPLETED");
      expect(completed.balance?.available).toBe("14000000");
      expect(completed.balance?.reserved).toBe("0");
      expect(completed.runs[0]?.status).toBe("completed");
    } finally {
      for (const child of workers) await kill(child);
      await local.close();
    }
  }, 360000);
  it("migrates idempotently; commits immutable intents and excludes competing signers", async () => {
    if (!url) throw Error("DATABASE_TEST_CONFIGURATION_REQUIRED");
    pool = createDatabase(url);
    await migrateDatabase(pool);
    await migrateDatabase(pool);
    const scope = "test:" + randomUUID();
    scopes.add(scope);
    const task = identity("task", scope),
      run = identity("run", scope),
      provider = "0x" + "11".repeat(20);
    const binding = {
      runId: run,
      mandateId: task,
      providers: [{ id: "datahub", address: provider }],
    };
    const a = new PostgresIntentStore(pool, scope, binding),
      b = new PostgresIntentStore(pool, scope, binding);
    const quote = {
      providerId: "datahub",
      taskHash: task,
      token: ("0x" + "22".repeat(20)) as Hex,
      price: "6000000",
      quoteId: identity("quote", scope),
      expiresAt: 2000000000,
      currency: "mock-USDC" as const,
      decimals: 6 as const,
      commitment: identity("artifact", scope),
      description: "simulated",
    };
    const record = {
      key: identity("intent", scope),
      requestId: identity("request", scope),
      paymentId: identity("payment", scope),
      genesisHash: zeroHash,
      quote,
      requestTx: {
        hash: identity("transaction", scope),
        nonce: 0,
        state: "uncertain" as const,
      },
    };
    await expect(a.put(record)).rejects.toMatchObject({
      code: "INTENT_STORE_NOT_LOCKED",
    });
    await a.exclusive(async () => {
      await a.put(record);
      await expect(b.exclusive(async () => {})).rejects.toMatchObject({
        code: "INTENT_STORE_LOCKED",
      });
      // A separate connection sees the durable uncertain record before the signing lock ends.
      expect(await b.get(record.key)).toEqual(record);
      await expect(
        a.put({ ...record, quote: { ...quote, price: "7000000" } }),
      ).rejects.toMatchObject({ code: "INTENT_TERMS_IMMUTABLE" });
      await expect(
        a.put({
          ...record,
          requestTx: { ...record.requestTx, hash: identity("different") },
        }),
      ).rejects.toMatchObject({ code: "TRANSACTION_IDENTITY_IMMUTABLE" });
    });
    const restarted = createDatabase(url);
    try {
      expect(
        await new PostgresIntentStore(restarted, scope, binding).get(
          record.key,
        ),
      ).toEqual(record);
    } finally {
      await restarted.end();
    }
  }, 60000);
  it("atomically consumes a launch nonce exactly once and rolls failed mutations back", async () => {
    if (!pool) throw Error("DATABASE_TEST_CONFIGURATION_REQUIRED");
    const scope = "test:" + randomUUID();
    scopes.add(scope);
    const vault = ("0x" + "33".repeat(20)) as Hex,
      nonce = identity("nonce", scope),
      task = identity("task", scope);
    const a = new PostgresWorkspaceStore(pool, scope, {
      vault,
      genesis: zeroHash,
    });
    const b = new PostgresWorkspaceStore(pool, scope, {
      vault,
      genesis: zeroHash,
    });
    await a.mutate((s) => {
      s.challenges[nonce] = {
        nonce,
        mandateId: task,
        purchaseKey: task,
        action: "launch",
        owner: vault,
        expiresAt: 2000000000,
        chainId: 10143,
        vault,
        used: false,
      };
    });
    const use = (db: PostgresWorkspaceStore) =>
      db.mutate((s) => {
        const c = s.challenges[nonce];
        if (!c || c.used) throw Error("AUTHORIZATION_EXPIRED_OR_USED");
        c.used = true;
        s.nextId++;
      });
    const results = await Promise.allSettled([use(a), use(b)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await a.read()).nextId).toBe(2);
    await expect(
      a.mutate((s) => {
        s.nextId = 9;
        throw Error("EXPECTED_FAILURE");
      }),
    ).rejects.toThrow("EXPECTED_FAILURE");
    expect((await b.read()).nextId).toBe(2);
    await expect(
      a.mutate((s) => {
        const c = s.challenges[nonce];
        if (c) c.used = false;
      }),
    ).rejects.toThrow("AUTHORIZATION_EXPIRED_OR_USED");
    expect((await b.read()).challenges[nonce]?.used).toBe(true);
  }, 60000);
  it("funds a real vault, recovers after an uncertain receipt without a second purchase, and preserves owner nonce replay protection", async () => {
    if (!pool) throw Error("DATABASE_TEST_CONFIGURATION_REQUIRED");
    const phase = (name: string) =>
      console.log(`DB_RESTART_TEST_PHASE:${name}`);
    phase("anvil-start");
    node = await startAnvil();
    const f = await createFixture(node);
    phase("fixture-ready");
    const description =
      "Purchase a weather dataset from an approved provider for no more than 10 USDC.";
    const task = mandateTaskHash(f.vault, description, zeroHash);
    const receipt = await f.wait(
      await f.ownerWallet.writeContract({
        address: f.vault,
        abi: ownerAbi,
        functionName: "createMandate",
        args: [
          task,
          f.chain.agent,
          f.token,
          10000000n,
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
    const scope = "31337:" + f.vault.toLowerCase();
    scopes.add(scope);
    const dbPool = pool;
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
      model: new MockModel(),
      providers: f.providers,
      statePath: "unused-postgres",
      journalPath: "unused-postgres",
      fromBlock: receipt.blockNumber,
      storeFactory: (initial: { vault: Hex; genesis: Hex }) =>
        new PostgresWorkspaceStore(dbPool, scope, initial),
      journalFactory: (runId: Hex, mandateId: Hex) =>
        new PostgresIntentStore(
          dbPool,
          scope + ":" + f.chain.agent.toLowerCase(),
          { runId, mandateId, providers: f.infos },
        ),
    };
    phase("mandate-created");
    const service = new WorkspaceService(options);
    await service.register({
      mandateId: task,
      description,
      salt: zeroHash,
      transactionHash: receipt.transactionHash,
    });
    phase("registration-persisted");
    const c = await service.challenge({ mandateId: task, action: "launch" });
    const signature = await f.ownerWallet.signTypedData(launchTypedData(c));
    const originalReceipt = f.chain.receipt.bind(f.chain);
    let uncertain = true;
    f.chain.receipt = async (hash, wait) => {
      if (wait && uncertain) {
        uncertain = false;
        throw Error("SIMULATED_RPC_TIMEOUT_AFTER_BROADCAST");
      }
      return originalReceipt(hash, wait);
    };
    const launched = await service.launch({ nonce: c.nonce, signature });
    phase("initial-run-started");
    await service.waitForRun(launched.runId);
    phase("initial-run-stopped");
    f.chain.receipt = originalReceipt;
    const prior = await service.snapshot();
    expect(prior.payments).toHaveLength(1);
    expect(prior.payments[0]?.status).toBe("FUNDED");
    phase("first-snapshot");
    const restarted = new WorkspaceService(options);
    await restarted.ready();
    expect((await reconcileHosted(restarted, dbPool)).intents).toBe(1);
    await expect(
      restarted.launch({ nonce: c.nonce, signature }),
    ).rejects.toThrow("AUTHORIZATION_EXPIRED_OR_USED");
    phase("restart-reconciled");
    const resume = await restarted.challenge({
      mandateId: task,
      action: "resume",
    });
    const sig = await f.ownerWallet.signTypedData(launchTypedData(resume));
    const resumed = await restarted.launch({
      nonce: resume.nonce,
      signature: sig,
    });
    phase("resume-started");
    await restarted.waitForRun(resumed.runId);
    phase("resume-stopped");
    const after = await restarted.snapshot();
    expect(after.payments).toHaveLength(1);
    expect(after.payments[0]?.id).toBe(prior.payments[0]?.id);
    expect(after.payments[0]?.status).toBe("ACCEPTED");
    expect(after.balance?.reserved).toBe("6000000");
    phase("accepted-snapshot");
    const dbRestart = new WorkspaceService(options);
    expect((await dbRestart.snapshot()).events.map((e) => e.id)).toEqual(
      after.events.map((e) => e.id),
    );
  }, 180000);
});
