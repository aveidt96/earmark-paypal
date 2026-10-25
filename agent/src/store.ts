import type { Hex } from "viem";
import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { hashSchema, quoteSchema, type Quote } from "./domain.js";
import { AgentError } from "./errors.js";
export const txSchema = z.strictObject({
  hash: hashSchema,
  nonce: z.number().int().nonnegative().safe(),
  state: z.enum([
    "prepared",
    "submitted",
    "confirmed",
    "reverted",
    "uncertain",
  ]),
});
export type TxRecord = z.infer<typeof txSchema>;
export const intentSchema = z.strictObject({
  key: hashSchema,
  requestId: hashSchema,
  paymentId: hashSchema,
  genesisHash: hashSchema,
  quote: quoteSchema,
  requestTx: txSchema.optional(),
  acceptTx: txSchema.optional(),
});
export type IntentRecord = z.infer<typeof intentSchema>;
export interface IntentJournal {
  exclusive<T>(work: () => Promise<T>): Promise<T>;
  get(key: Hex): Promise<IntentRecord | undefined>;
  put(record: IntentRecord): Promise<void>;
}
const journalSchema = z.strictObject({
  version: z.literal(1),
  intents: z.record(hashSchema, intentSchema),
});
type Journal = z.infer<typeof journalSchema>;
export class IntentStore {
  #locked = false;
  constructor(readonly path: string) {}
  async exclusive<T>(work: () => Promise<T>): Promise<T> {
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    let lock: Awaited<ReturnType<typeof open>>;
    try {
      lock = await open(`${this.path}.lock`, "wx", 0o600);
    } catch {
      throw new AgentError("INTENT_STORE_LOCKED");
    }
    this.#locked = true;
    try {
      return await work();
    } finally {
      this.#locked = false;
      await lock.close();
      await unlink(`${this.path}.lock`);
    }
  }
  async #journal(): Promise<Journal> {
    let text: string;
    try {
      text = await readFile(this.path, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT")
        return { version: 1, intents: {} };
      throw new AgentError("INTENT_STORE_UNREADABLE");
    }
    try {
      if (text.length > 5_000_000) throw new Error("limit");
      return journalSchema.parse(JSON.parse(text));
    } catch {
      throw new AgentError("INTENT_STORE_CORRUPT");
    }
  }
  async get(key: Hex): Promise<IntentRecord | undefined> {
    return (await this.#journal()).intents[key];
  }
  async put(record: IntentRecord): Promise<void> {
    if (!this.#locked) throw new AgentError("INTENT_STORE_NOT_LOCKED");
    const parsed = intentSchema.parse(record);
    const journal = await this.#journal();
    const previous = journal.intents[parsed.key];
    if (
      previous &&
      (previous.requestId !== parsed.requestId ||
        previous.paymentId !== parsed.paymentId ||
        JSON.stringify(previous.quote) !== JSON.stringify(parsed.quote) ||
        previous.genesisHash !== parsed.genesisHash)
    )
      throw new AgentError("INTENT_TERMS_IMMUTABLE");
    for (const action of ["requestTx", "acceptTx"] as const) {
      const before = previous?.[action],
        after = parsed[action];
      if (
        before &&
        (!after || before.hash !== after.hash || before.nonce !== after.nonce)
      )
        throw new AgentError("TRANSACTION_IDENTITY_IMMUTABLE");
    }
    journal.intents[parsed.key] = parsed;
    const temp = `${this.path}.${randomUUID()}.tmp`;
    const file = await open(temp, "wx", 0o600);
    try {
      await file.writeFile(JSON.stringify(journal));
      await file.sync();
    } finally {
      await file.close();
    }
    await rename(temp, this.path);
  }
  static sameQuote(a: Quote, b: Quote) {
    return (
      a.quoteId === b.quoteId &&
      a.providerId === b.providerId &&
      a.taskHash === b.taskHash &&
      a.token === b.token &&
      a.price === b.price &&
      a.commitment === b.commitment
    );
  }
}
