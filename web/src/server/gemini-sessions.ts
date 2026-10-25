import { createHash, randomBytes } from "node:crypto";
import { verifyTypedData, type Hex } from "viem";
import { z } from "zod";
import {
  hashSchema,
  GeminiModel,
  isGeminiEnabled,
  createReadOnlyTools,
  runReadOnlyAgent,
  EventStream,
  AgentError,
  type AgentModel,
} from "@flint/agent/server";
import {
  geminiTypedData,
  type GeminiChallenge,
  type GeminiSessionView,
} from "../lib/gemini";
import type { WorkspaceService } from "./service";
import { WorkspaceStore, type WorkspaceRepository } from "./store";

export interface GeminiSessionOptions {
  env: Record<string, string | undefined>;
  modelFactory?: () => AgentModel & {
    toolResult(name: string, result: unknown): void;
  };
}
const signature = z.strictObject({
  nonce: hashSchema,
  signature: z.string().regex(/^0x[0-9a-fA-F]{130}$/),
});
const access = z.strictObject({
  sessionId: hashSchema,
  token: z.string().regex(/^[0-9a-f]{64}$/),
});
const digest = (token: string) =>
  `0x${createHash("sha256").update(token).digest("hex")}` as Hex;
export class GeminiSessions {
  #jobs = new Map<Hex, Promise<void>>();
  #cancelled = new Set<Hex>();
  #persistenceFailed = false;
  #db: WorkspaceRepository | undefined;
  constructor(
    readonly host: WorkspaceService,
    readonly options: GeminiSessionOptions = { env: {} },
  ) {}
  private async ready() {
    const main = await this.host.ready();
    if (!this.#db) {
      const { vault, genesis } = await main.read();
      this.#db =
        this.host.options.geminiStoreFactory?.({ vault, genesis }) ??
        new WorkspaceStore(this.host.options.statePath + ".gemini.json", {
          vault,
          genesis,
        });
      await this.#db.mutate((state) => {
        for (const r of Object.values(state.geminiSessions ?? {}))
          if (r.status === "running" && r.worker !== this.host.worker) {
            r.status = "interrupted";
            r.error = "SERVER_RESTART_NO_AUTOMATIC_INFERENCE";
            r.finishedAt = Date.now();
          }
      });
    }
    return this.#db;
  }
  available() {
    const e = this.options.env;
    return (
      isGeminiEnabled(e) &&
      e.EARMARK_ENABLE_TESTNET_EXECUTION === "false" &&
      e.AI_ENABLE_NETWORK === "true" &&
      Boolean(e.GEMINI_API_KEY)
    );
  }
  private enabled() {
    if (this.#persistenceFailed) throw new Error("GEMINI_PERSISTENCE_FAILURE");
    if (!isGeminiEnabled(this.options.env)) throw new Error("GEMINI_DISABLED");
    if (this.options.env.EARMARK_ENABLE_TESTNET_EXECUTION !== "false")
      throw new Error("READ_ONLY_ENVIRONMENT_REQUIRED");
    if (!this.available()) throw new Error("MISSING_MODEL_CONFIGURATION");
  }
  async challenge(raw: unknown) {
    const p = z
      .strictObject({
        action: z.enum(["gemini-normal", "gemini-injection", "gemini-view"]),
        sessionId: hashSchema.optional(),
      })
      .parse(raw);
    if (p.action !== "gemini-view") this.enabled();
    if ((p.action === "gemini-view") !== Boolean(p.sessionId))
      throw new Error("INVALID_GEMINI_CHALLENGE");
    const db = await this.ready();
    const owner = await this.host.owner();
    if (p.sessionId && !(await db.read()).geminiSessions?.[p.sessionId])
      throw new Error("GEMINI_SESSION_NOT_FOUND");
    const nonce = `0x${randomBytes(32).toString("hex")}` as Hex;
    const c: GeminiChallenge = {
      nonce,
      mandateId: (await import("@flint/agent/server")).identity(
        "earmark-gemini-readonly-fixture",
        this.host.config.vault.toLowerCase(),
      ),
      purchaseKey: p.sessionId ?? nonce,
      action: p.action,
      owner,
      expiresAt: this.host.now() + 120,
      chainId: this.host.config.chainId,
      vault: this.host.config.vault,
    };
    await db.mutate((state) => {
      for (const [key, prior] of Object.entries(state.challenges))
        if (prior.expiresAt < this.host.now() - 60)
          delete state.challenges[key as Hex];
      if (Object.keys(state.challenges).length >= 100)
        throw new Error("TOO_MANY_LAUNCH_CHALLENGES");
      state.challenges[nonce] = { ...c, used: false };
    });
    return c;
  }
  async start(raw: unknown) {
    const p = signature.parse(raw);
    const db = await this.ready();
    const c = (await db.read()).challenges[p.nonce];
    if (!c || c.used || c.expiresAt <= this.host.now())
      throw new Error("AUTHORIZATION_EXPIRED_OR_USED");
    if (
      !["gemini-normal", "gemini-injection", "gemini-view"].includes(c.action)
    )
      throw new Error("WRONG_AUTHORIZATION_ACTION");
    const owner = await this.host.owner();
    if (
      owner.toLowerCase() !== c.owner.toLowerCase() ||
      c.chainId !== this.host.config.chainId ||
      c.vault.toLowerCase() !== this.host.config.vault.toLowerCase() ||
      !(await verifyTypedData({
        address: owner,
        ...geminiTypedData(c as GeminiChallenge),
        signature: p.signature as Hex,
      }))
    )
      throw new Error("OWNER_SIGNATURE_REQUIRED");
    const viewing = c.action === "gemini-view";
    if (!viewing) this.enabled();
    const token = randomBytes(32).toString("hex");
    const id = c.purchaseKey;
    const events = new EventStream(); // Fixture creation does not run model or financial operations.
    const fixture = viewing
      ? undefined
      : await createReadOnlyTools({
          ...this.host.config,
          sessionId: id,
          injection: c.action === "gemini-injection",
          now: this.host.now(),
          events,
        });
    await db.mutate((state) => {
      const current = state.challenges[p.nonce];
      if (!current || current.used || current.expiresAt <= this.host.now())
        throw new Error("AUTHORIZATION_EXPIRED_OR_USED");
      state.geminiSessions ??= {};
      const sessions = state.geminiSessions;
      if (viewing) {
        const r = sessions[id];
        if (!r || r.owner.toLowerCase() !== owner.toLowerCase())
          throw new Error("GEMINI_SESSION_AUTH_REQUIRED");
        r.accessHash = digest(token);
        r.accessExpiresAt = this.host.now() + 1800;
      } else {
        if (sessions[id]) throw new Error("DUPLICATE_GEMINI_SESSION");
        const recent = Object.values(sessions).filter(
          (r) =>
            r.owner.toLowerCase() === owner.toLowerCase() &&
            r.createdAt > Date.now() - 3600000,
        );
        if (
          recent.length >= 6 ||
          recent.some(
            (r) => r.status === "running" || r.createdAt > Date.now() - 30000,
          )
        )
          throw new Error("INFERENCE_RATE_LIMITED");
        if (Object.keys(sessions).length >= 100)
          throw new Error("GEMINI_SESSION_STORAGE_LIMIT");
        if (!fixture) throw new Error("FIXTURE_REQUIRED");
        sessions[id] = {
          id,
          owner,
          model: this.options.env.GEMINI_MODEL || "gemini-3.8-flash",
          scenario: c.action === "gemini-injection" ? "injection" : "normal",
          status: "running",
          createdAt: Date.now(),
          context: fixture.tools.context as (typeof sessions)[Hex]["context"],
          worker: this.host.worker,
          accessHash: digest(token),
          accessExpiresAt: this.host.now() + 1800,
        };
      }
      current.used = true;
    });
    if (fixture) {
      const job = this.execute(db, id, fixture).catch(() => {
        this.#persistenceFailed = true;
        console.error("GEMINI_PERSISTENCE_FAILURE");
      });
      this.#jobs.set(id, job);
      void job.finally(() => this.#jobs.delete(id));
    }
    return { sessionId: id, token };
  }
  async view(raw: unknown): Promise<GeminiSessionView> {
    const { sessionId, token } = access.parse(raw);
    const db = await this.ready();
    const state = await db.read();
    const r = state.geminiSessions?.[sessionId];
    if (
      !r ||
      r.accessHash !== digest(token) ||
      r.accessExpiresAt <= this.host.now() ||
      r.owner.toLowerCase() !== (await this.host.owner()).toLowerCase()
    )
      throw new Error("GEMINI_SESSION_AUTH_REQUIRED");
    const {
      accessHash: _hash,
      accessExpiresAt: _expiry,
      worker: _worker,
      ...session
    } = r;
    return {
      session,
      events: state.events.filter((e) => e.runId === sessionId),
    };
  }
  async cancel(raw: unknown) {
    const view = await this.view(raw);
    this.#cancelled.add(view.session.id);
    const db = await this.ready();
    await db.mutate((state) => {
      const r = state.geminiSessions?.[view.session.id];
      if (r?.status === "running") {
        r.status = "cancelled";
        r.finishedAt = Date.now();
        r.error = "INFERENCE_CANCELLED";
      }
    });
    return { sessionId: view.session.id };
  }
  private async execute(
    db: WorkspaceRepository,
    id: Hex,
    fixture: Awaited<ReturnType<typeof createReadOnlyTools>>,
  ) {
    const emit = async (
      type: string,
      data: Record<string, string | number | boolean>,
    ) => {
      await db.mutate((state) => {
        state.events.push({
          id: state.nextId++,
          runId: id,
          observedAt: Date.now(),
          type,
          source: type === "gemini.decision" ? "model" : "application",
          data: { ...data, readOnly: true, dataSource: "synthetic fixture" },
        });
      });
    };
    try {
      await emit("gemini.started", {
        model: this.options.env.GEMINI_MODEL || "gemini-3.8-flash",
      });
      await emit("gemini.fixture", {
        task: fixture.tools.context.task.instruction,
        authority: "Synthetic read-only fixture; no onchain authorization",
      });
      await emit("gemini.providers", {
        source: "Server-configured fixture registry",
        count: fixture.tools.context.observations.providers?.length ?? 0,
      });
      await emit("gemini.quotes", {
        source: "Actual simulated-provider quotes supplied to Gemini",
        count: fixture.tools.context.observations.quotes.length,
      });
      this.enabled();
      const model =
        this.options.modelFactory?.() ??
        new GeminiModel({
          apiKey: this.options.env.GEMINI_API_KEY ?? "",
          baseUrl: "https://generativelanguage.googleapis.com/v1beta",
          model: this.options.env.GEMINI_MODEL || "gemini-3.8-flash",
          timeoutMs: 60000,
          networkEnabled: true,
          conversation: true,
        });
      const proposal = await runReadOnlyAgent(model, fixture, {
        enabled: () => this.available(),
        cancelled: () => this.#cancelled.has(id),
        emit,
        authorize: async () => {
          const r = (await db.read()).geminiSessions?.[id];
          if (
            !r ||
            r.accessExpiresAt <= this.host.now() ||
            r.owner.toLowerCase() !== (await this.host.owner()).toLowerCase()
          )
            throw new Error("OWNER_SIGNATURE_REQUIRED");
        },
      });
      await db.mutate((state) => {
        const r = state.geminiSessions?.[id];
        if (r?.status === "running") {
          r.status = "validated";
          r.finishedAt = Date.now();
          r.proposal = {
            providerId: proposal.quote.providerId,
            recipient: proposal.recipient,
            amount: proposal.quote.price,
            reason: proposal.reason,
          };
        }
      });
    } catch (error) {
      const code =
        error instanceof AgentError
          ? error.code
          : error instanceof Error && /^[A-Z0-9_]+$/.test(error.message)
            ? error.message
            : "GEMINI_SESSION_FAILED";
      await emit("gemini.failed", { code });
      await db.mutate((state) => {
        const r = state.geminiSessions?.[id];
        if (r?.status === "running") {
          r.status = code === "INFERENCE_CANCELLED" ? "cancelled" : "failed";
          r.finishedAt = Date.now();
          r.error = code;
        }
      });
    }
  }
  async drain() {
    await Promise.allSettled([...this.#jobs.values()]);
  }
}
