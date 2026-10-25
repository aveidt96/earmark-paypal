import { historyBatch } from "../lib/history-ranges";
import { GeminiSessions, type GeminiSessionOptions } from "./gemini-sessions";
import { randomBytes, randomUUID } from "node:crypto";
import {
  createPublicClient,
  erc20Abi,
  http,
  verifyTypedData,
  type Hex,
} from "viem";
import { runtimeChain } from "@flint/agent/server";
import { z } from "zod";
import {
  AgentTools,
  EventStream,
  IntentStore,
  identity,
  runAgent,
  hashSchema,
  AgentError,
  type AgentModel,
  type AgentEvent,
  type Quote,
  type VaultChain,
  type ServiceProvider,
  type IntentJournal,
} from "@flint/agent/server";
import { mandateTaskHash, taskDescriptionSchema } from "@flint/agent/task";
import { ownerAbi } from "../lib/abi";
import {
  launchTypedData,
  type LaunchChallenge,
  type MandateView,
  type PaymentRecord,
  type WorkspaceSnapshot,
  type WorkspaceConfig,
} from "../lib/model";
import {
  WorkspaceStore,
  type WorkspaceRepository,
  type WorkspaceState,
} from "./store";

export interface ServiceOptions {
  gemini?: GeminiSessionOptions;
  geminiStoreFactory?: (
    initial: Pick<WorkspaceState, "vault" | "genesis">,
  ) => WorkspaceRepository;
  config: WorkspaceConfig;
  chain: VaultChain;
  model: AgentModel;
  providers: ServiceProvider[];
  statePath: string;
  journalPath: string;
  fromBlock: bigint;
  now?: () => number;
  storeFactory?: (
    initial: Pick<WorkspaceState, "vault" | "genesis">,
  ) => WorkspaceRepository;
  journalFactory?: (runId: Hex, mandateId: Hex) => IntentJournal;
  providerTimeoutMs?: number;
}
const signatureSchema = z.strictObject({
  nonce: hashSchema,
  signature: z.string().regex(/^0x[0-9a-fA-F]{130}$/),
});
const registrationSchema = z.strictObject({
  mandateId: hashSchema,
  description: taskDescriptionSchema,
  salt: hashSchema,
  transactionHash: hashSchema,
});
export class WorkspaceService {
  readonly gemini: GeminiSessions;
  readonly config: WorkspaceConfig;
  readonly client;
  readonly worker = randomUUID();
  #db: WorkspaceRepository | undefined;
  #recordQueue: Promise<void> = Promise.resolve();
  #fatalPersistenceFailure = false;
  #active = new Set<string>();
  #jobs = new Map<string, Promise<void>>();
  constructor(readonly options: ServiceOptions) {
    this.gemini = new GeminiSessions(this, options.gemini);
    this.config = options.config;
    this.client = createPublicClient({
      chain: runtimeChain(options.config.chainId),
      transport: http(options.config.rpcUrl, {
        retryCount: 0,
        timeout: 10000,
        fetchOptions: { redirect: "error" },
      }),
    });
  }
  now() {
    return this.options.now?.() ?? Math.floor(Date.now() / 1000);
  }
  async ready() {
    if (this.#fatalPersistenceFailure)
      throw new Error("WORKSPACE_PERSISTENCE_FAILURE_REVIEW_REQUIRED");
    await this.options.chain.verify();
    const genesis = await this.options.chain.genesis();
    if (!this.#db) {
      this.#db =
        this.options.storeFactory?.({ vault: this.config.vault, genesis }) ??
        new WorkspaceStore(this.options.statePath, {
          vault: this.config.vault,
          genesis,
        });
      await this.#db.mutate((state) => {
        for (const r of Object.values(state.runs))
          if (r.status === "running" && r.worker !== this.worker) {
            r.status = "interrupted";
            r.error = "SERVER_RESTART_RECONCILE_REQUIRED";
          }
      });
    }
    if ((await this.#db.read()).genesis !== genesis)
      throw new Error("WORKSPACE_CHAIN_MISMATCH");
    return this.#db;
  }
  async owner() {
    return this.client.readContract({
      address: this.config.vault,
      abi: ownerAbi,
      functionName: "owner",
    });
  }
  async mandate(id: Hex): Promise<MandateView> {
    const [m, terms, providers, now] = await Promise.all([
      this.options.chain.mandate(id),
      this.client.readContract({
        address: this.config.vault,
        abi: ownerAbi,
        functionName: "getDeliveryTerms",
        args: [id],
      }),
      this.options.chain.providers(id),
      this.options.chain.now(),
    ]);
    const meta = this.#db ? (await this.#db.read()).mandates[id] : undefined;
    return {
      id,
      description: meta?.description ?? "Onchain task",
      registered: !!meta,
      agent: m.agent,
      token: m.token,
      cap: m.cap,
      reserved: m.reserved,
      settled: m.settled,
      remaining: String(BigInt(m.cap) - BigInt(m.reserved) - BigInt(m.settled)),
      expiry: Number(m.expiry),
      active: m.active && now < Number(m.expiry),
      providers: [...providers],
      deliveryWindow: Number(terms.deliveryWindow),
      reviewWindow: 172800,
      challengeWindow: Number(terms.challengeWindow),
      trustedHash: terms.trustedDeliverableHash,
    };
  }
  async eligible(id: Hex, existing = false) {
    const m = await this.mandate(id);
    if (!m.registered) throw new Error("TASK_REGISTRATION_REQUIRED");
    if (!m.active && !existing) throw new Error("MANDATE_INACTIVE_OR_EXPIRED");
    if (
      m.agent.toLowerCase() !== this.config.agent.toLowerCase() ||
      m.token.toLowerCase() !== this.config.token.toLowerCase()
    )
      throw new Error("MANDATE_IDENTITY_MISMATCH");
    if (
      !m.providers.length ||
      m.providers.some(
        (a) =>
          !this.config.providers.some(
            (p) => p.address.toLowerCase() === a.toLowerCase(),
          ),
      )
    )
      throw new Error("UNKNOWN_APPROVED_PROVIDER");
    return m;
  }
  async register(raw: unknown) {
    const p = registrationSchema.parse(raw);
    const db = await this.ready();
    if (
      mandateTaskHash(this.config.vault, p.description, p.salt) !== p.mandateId
    )
      throw new Error("TASK_HASH_MISMATCH");
    const receipt = await this.client.getTransactionReceipt({
      hash: p.transactionHash,
    });
    if (
      receipt.status !== "success" ||
      receipt.to?.toLowerCase() !== this.config.vault.toLowerCase()
    )
      throw new Error("CREATION_NOT_CONFIRMED");
    const logs = await this.client.getContractEvents({
      address: this.config.vault,
      abi: ownerAbi,
      eventName: "MandateCreated",
      fromBlock: receipt.blockNumber,
      toBlock: receipt.blockNumber,
    });
    if (
      !logs.some(
        (e) =>
          e.transactionHash === p.transactionHash &&
          e.args.taskHash === p.mandateId,
      )
    )
      throw new Error("CREATION_EVENT_MISMATCH");
    await this.mandate(p.mandateId);
    await db.mutate((state) => {
      const prior = state.mandates[p.mandateId];
      if (
        prior &&
        (prior.description !== p.description || prior.salt !== p.salt)
      )
        throw new Error("TASK_TERMS_IMMUTABLE");
      state.mandates[p.mandateId] = {
        description: p.description,
        salt: p.salt,
        creationTx: p.transactionHash,
      };
    });
    return { mandateId: p.mandateId };
  }
  async challenge(raw: unknown): Promise<LaunchChallenge> {
    const p = z
      .strictObject({
        mandateId: hashSchema,
        action: z.enum(["launch", "resume"]),
      })
      .parse(raw);
    const db = await this.ready();
    await this.eligible(p.mandateId, p.action === "resume");
    const owner = await this.owner();
    const nonce = `0x${randomBytes(32).toString("hex")}` as Hex;
    const c: LaunchChallenge = {
      nonce,
      mandateId: p.mandateId,
      purchaseKey: identity(
        "flint-ui-purchase-v1",
        this.config.vault.toLowerCase(),
        p.mandateId,
      ),
      action: p.action,
      owner,
      expiresAt: this.now() + 120,
      chainId: this.config.chainId,
      vault: this.config.vault,
    };
    await db.mutate((state) => {
      for (const [key, value] of Object.entries(state.challenges))
        if (value.expiresAt < this.now() - 60)
          delete state.challenges[key as Hex];
      if (Object.keys(state.challenges).length >= 100)
        throw new Error("TOO_MANY_LAUNCH_CHALLENGES");
      state.challenges[nonce] = { ...c, used: false };
    });
    return c;
  }
  async launch(raw: unknown) {
    const p = signatureSchema.parse(raw);
    const db = await this.ready();
    const c = (await db.read()).challenges[p.nonce];
    if (!c || c.used || c.expiresAt <= this.now())
      throw new Error("AUTHORIZATION_EXPIRED_OR_USED");
    if (c.action !== "launch" && c.action !== "resume")
      throw new Error("WRONG_AUTHORIZATION_ACTION");
    const owner = await this.owner();
    if (
      owner.toLowerCase() !== c.owner.toLowerCase() ||
      !(await verifyTypedData({
        address: owner,
        ...launchTypedData({ ...c, action: c.action }),
        signature: p.signature as Hex,
      }))
    )
      throw new Error("OWNER_SIGNATURE_REQUIRED");
    const m = await this.eligible(c.mandateId, c.action === "resume");
    const id = c.purchaseKey;
    await db.mutate((state) => {
      const current = state.challenges[p.nonce];
      if (!current || current.used || current.expiresAt <= this.now())
        throw new Error("AUTHORIZATION_EXPIRED_OR_USED");
      const prior = state.runs[id];
      if (prior && c.action === "launch")
        throw new Error("DUPLICATE_TASK_INTENT");
      if (
        c.action === "resume" &&
        (!prior ||
          !["failed", "interrupted"].includes(prior.status) ||
          this.#active.has(id))
      )
        throw new Error("RUN_NOT_RESUMABLE");
      current.used = true;
      state.runs[id] = {
        id,
        mandateId: c.mandateId,
        mode: this.options.model.mode,
        status: "running",
        createdAt: prior?.createdAt ?? Date.now(),
        quotes: prior?.quotes ?? [],
        inspected: prior?.inspected ?? false,
        worker: this.worker,
        ...(prior?.paymentId ? { paymentId: prior.paymentId } : {}),
      };
    });
    await this.record(id, {
      type: c.action === "launch" ? "task.launched" : "task.resume.authorized",
      source: "application",
      data: { mandateId: m.id, owner, mode: this.options.model.mode },
    });
    this.#active.add(id);
    const job = this.execute(id, m)
      .catch(() => {
        this.#fatalPersistenceFailure = true;
        console.error("WORKSPACE_PERSISTENCE_FAILURE_REVIEW_REQUIRED");
      })
      .finally(() => this.#active.delete(id));
    this.#jobs.set(id, job);
    return { runId: id };
  }
  record(id: string, event: AgentEvent, quotes?: Quote[], inspected?: boolean) {
    const db = this.#db;
    if (!db) throw new Error("WORKSPACE_NOT_READY");
    const saved = structuredClone({ event, quotes, inspected });
    const write = this.#recordQueue.then(async () => {
      await db.mutate((state) => {
        event = saved.event;
        quotes = saved.quotes;
        inspected = saved.inspected;
        const hash = event.data.transactionHash;
        const fact =
          event.source === "onchain"
            ? `agent:${event.type}:${String(hash ?? event.data.paymentId ?? "")}:${String(event.data.status ?? "")}`
            : undefined;
        if (fact && state.seen[fact]) return;
        if (fact) state.seen[fact] = "recorded";
        state.events.push({
          ...event,
          id: state.nextId++,
          observedAt: Date.now(),
          runId: id,
        });
        const r = state.runs[id as Hex];
        if (r) {
          if (quotes) r.quotes = quotes;
          if (inspected !== undefined) r.inspected = r.inspected || inspected;
          if (
            typeof event.data.paymentId === "string" &&
            hashSchema.safeParse(event.data.paymentId).success
          )
            r.paymentId = event.data.paymentId as Hex;
        }
      });
    });
    this.#recordQueue = write;
    void write.catch(() => {});
    return write;
  }
  async execute(id: Hex, m: MandateView) {
    let tools: AgentTools | undefined;
    try {
      const events = new EventStream((e) =>
        this.record(
          id,
          e,
          tools?.context.observations.quotes,
          tools?.context.observations.inspected,
        ),
      );
      tools = new AgentTools(
        {
          taskHash: m.id,
          purchaseKey: id,
          instruction: m.description,
          budget: m.cap,
        },
        this.options.chain,
        this.options.journalFactory?.(id, m.id) ??
          new IntentStore(this.options.journalPath),
        this.options.providers,
        events,
        this.options.providerTimeoutMs,
      );
      const result = await runAgent(
        this.options.model,
        tools,
        this.options.chain,
      );
      this.#db &&
        (await this.#db.mutate((state) => {
          const r = state.runs[id];
          if (r) {
            r.paymentId = result.payment.id;
            r.status =
              result.payment.status === "ACCEPTED"
                ? "awaiting-challenge"
                : result.payment.status === "COMPLETED"
                  ? "completed"
                  : "refunded";
          }
        }));
    } catch (error) {
      const code =
        error instanceof AgentError
          ? error.code
          : error instanceof Error && /^[A-Z0-9_]+$/.test(error.message)
            ? error.message
            : "RUN_FAILED_REVIEW_REQUIRED";
      await this.record(id, {
        type: "run.failed",
        source: "application",
        data: { code },
      });
      this.#db &&
        (await this.#db.mutate((state) => {
          const r = state.runs[id];
          if (r) {
            r.status = "failed";
            r.error = code;
          }
        }));
    }
  }
  async drain() {
    await this.gemini.drain();
    await Promise.allSettled([...this.#jobs.values()]);
    await this.#recordQueue;
  }
  async waitForRun(id: string) {
    await this.#jobs.get(id);
  }
  async snapshot(): Promise<WorkspaceSnapshot> {
    const db = await this.ready();
    const block = await this.client.getBlock(
      this.config.chainId === 10143 ? { blockTag: "finalized" } : {},
    );
    const latest = block.number;
    if (latest === null || latest < this.options.fromBlock)
      throw new Error("HISTORY_RANGE_REVIEW_REQUIRED");
    const indexed = await db.read();
    const cursor = indexed.historyThrough
      ? BigInt(indexed.historyThrough)
      : this.options.fromBlock;
    if (cursor > latest) throw new Error("CHAIN_REORG_REVIEW_REQUIRED");
    const overlap =
      cursor > this.options.fromBlock + 16n
        ? cursor - 16n
        : this.options.fromBlock;
    const { target, ranges } = historyBatch(
      overlap,
      latest,
      this.config.chainId,
    );
    const readLogs = (fromBlock: bigint, toBlock: bigint) =>
      this.client.getContractEvents({
        address: this.config.vault,
        abi: ownerAbi,
        fromBlock,
        toBlock,
        strict: true,
      });
    const logs: Awaited<ReturnType<typeof readLogs>> = [];
    for (const range of ranges) {
      logs.push(...(await readLogs(range.fromBlock, range.toBlock)));
    }
    const mandateIds = new Set<Hex>(indexed.historyMandates ?? []);
    const paymentLogs = new Map<Hex, { hash: Hex; resolution?: Hex }>(
      Object.entries(indexed.historyPayments ?? {}) as [
        Hex,
        { hash: Hex; resolution?: Hex },
      ][],
    );
    const blockTimes = new Map<bigint, number>();
    for (const log of logs) {
      if (
        log.blockNumber === null ||
        log.blockHash === null ||
        log.transactionHash === null ||
        log.logIndex === null ||
        log.removed
      )
        throw new Error("UNCONFIRMED_LOG_REJECTED");
      const args = log.args as Record<string, unknown>;
      if (
        log.eventName === "MandateCreated" &&
        typeof args.taskHash === "string"
      )
        mandateIds.add(args.taskHash as Hex);
      if (
        log.eventName === "PaymentFunded" &&
        typeof args.paymentId === "string"
      )
        paymentLogs.set(args.paymentId as Hex, {
          ...paymentLogs.get(args.paymentId as Hex),
          hash: log.transactionHash,
        });
      if (
        ["PaymentCompleted", "PaymentRejected", "PaymentExpired"].includes(
          log.eventName,
        ) &&
        typeof args.paymentId === "string"
      ) {
        const prior = paymentLogs.get(args.paymentId as Hex);
        if (prior) prior.resolution = log.transactionHash;
      }
      const key = `chain:${log.transactionHash}:${log.logIndex}`;
      const old = (await db.read()).seen[key];
      if (old && old !== log.blockHash)
        throw new Error("CHAIN_REORG_REVIEW_REQUIRED");
      if (!old) {
        let time = blockTimes.get(log.blockNumber);
        if (time === undefined) {
          time = Number(
            (await this.client.getBlock({ blockNumber: log.blockNumber }))
              .timestamp,
          );
          blockTimes.set(log.blockNumber, time);
        }
        await db.mutate((state) => {
          if (state.seen[key]) return;
          state.seen[key] = log.blockHash;
          const data: Record<string, string | number | boolean> = {
            transactionHash: log.transactionHash,
          };
          for (const [name, value] of Object.entries(args))
            if (typeof value === "string" || typeof value === "boolean")
              data[name] = value;
            else if (typeof value === "bigint") data[name] = String(value);
          state.events.push({
            id: state.nextId++,
            observedAt: Date.now(),
            chainTime: time,
            runId: "chain",
            type: log.eventName,
            source: "onchain",
            data,
          });
        });
      }
    }
    await db.mutate((state) => {
      const prior = BigInt(state.historyThrough ?? "0");
      if (prior <= target) {
        state.historyThrough = String(target);
        state.historyMandates = [
          ...new Set([...(state.historyMandates ?? []), ...mandateIds]),
        ];
        state.historyPayments = {
          ...state.historyPayments,
          ...Object.fromEntries(paymentLogs),
        };
      }
    });
    if (target < latest) throw new Error("HISTORY_SYNCING");
    const [owner, actual, reserved, available, decimals, symbol] =
      await Promise.all([
        this.owner(),
        this.client.readContract({
          address: this.config.token,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [this.config.vault],
          blockNumber: latest,
        }),
        this.client.readContract({
          address: this.config.vault,
          abi: ownerAbi,
          functionName: "totalReserved",
          blockNumber: latest,
        }),
        this.client.readContract({
          address: this.config.vault,
          abi: ownerAbi,
          functionName: "availableBalance",
          blockNumber: latest,
        }),
        this.client.readContract({
          address: this.config.token,
          abi: erc20Abi,
          functionName: "decimals",
        }),
        this.client.readContract({
          address: this.config.token,
          abi: erc20Abi,
          functionName: "symbol",
        }),
      ]);
    if (decimals !== 6)
      throw new Error("SIMULATED_PROVIDER_REQUIRES_SIX_DECIMALS");
    const mandates = await Promise.all(
      [...mandateIds].map((id) => this.mandate(id)),
    );
    const payments: PaymentRecord[] = [];
    for (const [id, history] of paymentLogs) {
      const p = await this.options.chain.payment(id);
      if (!p) throw new Error("PAYMENT_HISTORY_MISMATCH");
      const raw = await this.client.readContract({
        address: this.config.vault,
        abi: ownerAbi,
        functionName: "getPayment",
        args: [id],
      });
      payments.push({
        ...p,
        fundedAt: Number(raw.fundedAt),
        transactionHash: history.hash,
        ...(history.resolution ? { resolutionHash: history.resolution } : {}),
      });
    }
    await db.mutate((state) => {
      for (const r of Object.values(state.runs)) {
        const p = payments.find((p) => p.id === r.paymentId);
        if (p?.status === "COMPLETED") r.status = "completed";
        else if (p?.status === "REJECTED" || p?.status === "EXPIRED")
          r.status = "refunded";
        else if (p?.status === "ACCEPTED" && !this.#active.has(r.id))
          r.status = "awaiting-challenge";
      }
    });
    const state = await db.read();
    return {
      configured: true,
      config: this.config,
      owner,
      balance: {
        actual: String(actual),
        reserved: String(reserved),
        available: String(available),
        decimals,
        symbol: symbol === "mUSDC" ? "mock USDC (mUSDC)" : symbol,
      },
      chainTime: Number(block.timestamp),
      model: this.options.model.mode,
      geminiAvailable: this.gemini.available(),
      mandates,
      payments,
      runs: Object.values(state.runs).map(({ worker, ...r }) => r),
      events: state.events.filter(
        (e) => !state.geminiSessions?.[e.runId as Hex],
      ),
    };
  }
}
