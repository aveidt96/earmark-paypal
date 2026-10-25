import { z } from "zod";
import {
  mkdirSync,
  openSync,
  readFileSync,
  writeFileSync,
  fsyncSync,
  closeSync,
  renameSync,
  unlinkSync,
} from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { addressSchema, hashSchema, quoteSchema } from "@flint/agent/server";
const challenge = z.strictObject({
  nonce: hashSchema,
  mandateId: hashSchema,
  purchaseKey: hashSchema,
  action: z.enum([
    "launch",
    "resume",
    "gemini-normal",
    "gemini-injection",
    "gemini-view",
  ]),
  owner: addressSchema,
  expiresAt: z.number().int(),
  chainId: z.union([z.literal(31337), z.literal(10143)]),
  vault: addressSchema,
  used: z.boolean(),
});
const run = z.strictObject({
  id: hashSchema,
  mandateId: hashSchema,
  mode: z.enum(["mock", "qwen", "gemini"]),
  status: z.enum([
    "running",
    "awaiting-challenge",
    "completed",
    "refunded",
    "failed",
    "interrupted",
  ]),
  createdAt: z.number(),
  quotes: z.array(quoteSchema),
  paymentId: hashSchema.optional(),
  error: z.string().optional(),
  inspected: z.boolean(),
  worker: z.string(),
});
const event = z.strictObject({
  id: z.number().int(),
  observedAt: z.number(),
  runId: z.string(),
  chainTime: z.number().optional(),
  type: z.string(),
  source: z.enum(["application", "model", "onchain", "simulated-provider"]),
  data: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
});
const geminiSession = z.object({
  id: hashSchema,
  owner: addressSchema,
  model: z.string().max(100),
  scenario: z.enum(["normal", "injection"]),
  status: z.enum([
    "running",
    "validated",
    "failed",
    "cancelled",
    "interrupted",
  ]),
  createdAt: z.number(),
  finishedAt: z.number().optional(),
  context: z.object({
    task: z.object({
      taskHash: hashSchema,
      purchaseKey: z.string(),
      instruction: z.string(),
      budget: z.string(),
    }),
    observations: z.object({
      mandate: z.object({
        taskHash: hashSchema,
        agent: addressSchema,
        token: addressSchema,
        cap: z.string(),
        reserved: z.string(),
        settled: z.string(),
        expiry: z.string(),
        active: z.boolean(),
        trustedHash: hashSchema,
        now: z.number(),
      }),
      providers: z.array(
        z.object({ id: z.string(), name: z.string(), address: addressSchema }),
      ),
      balance: z.string(),
      quotes: z.array(quoteSchema),
    }),
  }),
  proposal: z
    .object({
      providerId: z.string(),
      recipient: addressSchema,
      amount: z.string(),
      reason: z.string().max(500),
    })
    .optional(),
  error: z.string().optional(),
  worker: z.string(),
  accessHash: hashSchema,
  accessExpiresAt: z.number(),
});
export const workspaceStateSchema = z.strictObject({
  version: z.literal(1),
  vault: addressSchema,
  genesis: hashSchema,
  nextId: z.number().int(),
  mandates: z.record(
    hashSchema,
    z.strictObject({
      description: z.string().max(1000),
      salt: hashSchema,
      creationTx: hashSchema,
    }),
  ),
  challenges: z.record(hashSchema, challenge),
  runs: z.record(hashSchema, run),
  events: z.array(event).max(10000),
  seen: z.record(z.string(), z.string()),
  geminiSessions: z.record(hashSchema, geminiSession).optional(),
  historyThrough: z
    .string()
    .regex(/^[0-9]+$/)
    .optional(),
  historyMandates: z.array(hashSchema).optional(),
  historyPayments: z
    .record(
      hashSchema,
      z.strictObject({ hash: hashSchema, resolution: hashSchema.optional() }),
    )
    .optional(),
});
export type WorkspaceState = z.infer<typeof workspaceStateSchema>;
export interface WorkspaceRepository {
  read(): WorkspaceState | Promise<WorkspaceState>;
  mutate<T>(work: (state: WorkspaceState) => T): T | Promise<T>;
}
/** Cross-process fail-closed lock; synchronous append makes agent event persistence durable before continuing. */
export class WorkspaceStore {
  constructor(
    readonly path: string,
    private readonly initial: Pick<WorkspaceState, "vault" | "genesis">,
  ) {}
  read(): WorkspaceState {
    try {
      const text = readFileSync(this.path, "utf8");
      if (text.length > 12_000_000) throw new Error("STATE_LIMIT");
      const state = workspaceStateSchema.parse(JSON.parse(text));
      if (
        state.vault !== this.initial.vault.toLowerCase() ||
        state.genesis !== this.initial.genesis
      )
        throw new Error("WORKSPACE_CHAIN_MISMATCH");
      return state;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT")
        return {
          version: 1,
          ...this.initial,
          vault: this.initial.vault.toLowerCase() as WorkspaceState["vault"],
          nextId: 1,
          mandates: {},
          challenges: {},
          runs: {},
          events: [],
          seen: {},
        };
      throw new Error(
        e instanceof Error && e.message === "WORKSPACE_CHAIN_MISMATCH"
          ? e.message
          : "WORKSPACE_STATE_CORRUPT",
      );
    }
  }
  mutate<T>(work: (state: WorkspaceState) => T): T {
    mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 });
    let lock: number;
    try {
      lock = openSync(`${this.path}.lock`, "wx", 0o600);
    } catch {
      throw new Error("WORKSPACE_BUSY_OR_LOCKED");
    }
    try {
      const state = this.read();
      const result = work(state);
      workspaceStateSchema.parse(state);
      const tmp = `${this.path}.${randomUUID()}.tmp`;
      const fd = openSync(tmp, "wx", 0o600);
      try {
        writeFileSync(fd, JSON.stringify(state));
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
      renameSync(tmp, this.path);
      return result;
    } finally {
      closeSync(lock);
      unlinkSync(`${this.path}.lock`);
    }
  }
}
