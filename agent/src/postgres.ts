import pg, { type Pool, type PoolClient } from "pg";
import type { Hex } from "viem";
import {
  intentSchema,
  type IntentJournal,
  type IntentRecord,
} from "./store.js";
import { AgentError } from "./errors.js";

/** Direct Neon connections: session locks are incompatible with transaction-mode poolers. */
export function createDatabase(url: string, localTest = false): Pool {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new Error("INVALID_DATABASE_CONFIGURATION");
  }
  const local = ["127.0.0.1", "localhost", "[::1]"].includes(u.hostname);
  if (
    !["postgres:", "postgresql:"].includes(u.protocol) ||
    !u.username ||
    !u.password ||
    u.pathname.length < 2 ||
    u.hash ||
    (local
      ? !localTest
      : !u.hostname.endsWith(".neon.tech") || u.hostname.includes("-pooler"))
  )
    throw new Error("DIRECT_NEON_DATABASE_REQUIRED");
  for (const key of [...u.searchParams.keys()]) {
    if (!["sslmode", "channel_binding"].includes(key))
      throw new Error("UNSUPPORTED_DATABASE_OPTION");
    u.searchParams.delete(key);
  }
  const pool = new pg.Pool({
    connectionString: u.toString(),
    max: 4,
    idleTimeoutMillis: 5000,
    connectionTimeoutMillis: 10000,
    statement_timeout: 10000,
    query_timeout: 15000,
    application_name: "earmark-api-testnet",
    ssl: local ? false : { rejectUnauthorized: true },
  });
  pool.on("error", () => console.error("DATABASE_CONNECTION_LOST"));
  return pool;
}

export async function migrateDatabase(pool: Pool) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended('earmark-schema-v1',0))",
    );
    await client.query(`CREATE TABLE IF NOT EXISTS earmark_schema (version integer PRIMARY KEY CHECK(version=1));
      INSERT INTO earmark_schema VALUES(1) ON CONFLICT DO NOTHING;
      CREATE TABLE IF NOT EXISTS earmark_environment (
        singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
        environment text NOT NULL CHECK(environment='earmark-testnet'),
        chain_id integer NOT NULL CHECK(chain_id=10143), project_id text NOT NULL, branch text NOT NULL);
      CREATE TABLE IF NOT EXISTS earmark_workspaces (
        scope text PRIMARY KEY, state jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE IF NOT EXISTS earmark_intents (
        scope text NOT NULL, intent_id text NOT NULL, mandate_id text NOT NULL, quote_id text NOT NULL,
        amount numeric(39,0) NOT NULL CHECK(amount > 0), recipient text NOT NULL, run_id text NOT NULL,
        payment_id text NOT NULL, record jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY(scope,intent_id), UNIQUE(scope,payment_id));
      CREATE TABLE IF NOT EXISTS earmark_launch_nonces (
        scope text NOT NULL, nonce text NOT NULL, mandate_id text NOT NULL, consumed boolean NOT NULL,
        expires_at bigint NOT NULL, record jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY(scope,nonce));
      CREATE TABLE IF NOT EXISTS earmark_runs (
        scope text NOT NULL, run_id text NOT NULL, record jsonb NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(scope,run_id));
      CREATE TABLE IF NOT EXISTS earmark_events (
        scope text NOT NULL, event_id bigint NOT NULL, record jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(scope,event_id));
      CREATE TABLE IF NOT EXISTS earmark_provider_calls (
        scope text NOT NULL, payment_id text NOT NULL, commitment text NOT NULL, recipient text NOT NULL,
        tx_hash text NOT NULL, nonce bigint NOT NULL, state text NOT NULL CHECK(state IN ('prepared','submitted','uncertain','confirmed','reverted')),
        updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(scope,payment_id), UNIQUE(scope,tx_hash));`);
    await client.query("COMMIT");
  } catch {
    await client.query("ROLLBACK").catch(() => {});
    throw new Error("DATABASE_MIGRATION_FAILED");
  } finally {
    client.release();
  }
}

export interface IntentBinding {
  runId: Hex;
  mandateId: Hex;
  providers: { id: string; address: string }[];
}
/** One live connection owns the signing lock. Each put autocommits BEFORE broadcast.
 * Disconnecting loses the lock and prevents writes on that connection; no lease can expire under a live signer.
 */
export class PostgresIntentStore implements IntentJournal {
  #client: PoolClient | undefined;
  constructor(
    readonly pool: Pool,
    readonly scope: string,
    readonly binding: IntentBinding,
  ) {}
  async exclusive<T>(work: () => Promise<T>): Promise<T> {
    if (this.#client) throw new AgentError("INTENT_STORE_LOCKED");
    const client = await this.pool.connect();
    let acquired = false,
      lost = false;
    const connectionLost = () => {
      lost = true;
      this.#client = undefined;
    };
    client.on("error", connectionLost);
    try {
      const result = await client.query<{ locked: boolean }>(
        "SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS locked",
        ["earmark-signing:" + this.scope],
      );
      if (!result.rows[0]?.locked) throw new AgentError("INTENT_STORE_LOCKED");
      acquired = true;
      this.#client = client;
      const workResult = await work();
      if (lost) throw new AgentError("INTENT_STORE_UNREADABLE");
      return workResult;
    } finally {
      this.#client = undefined;
      if (acquired)
        await client
          .query("SELECT pg_advisory_unlock(hashtextextended($1,0))", [
            "earmark-signing:" + this.scope,
          ])
          .catch(() => {});
      client.removeListener("error", connectionLost);
      client.release(lost);
    }
  }
  async get(key: Hex): Promise<IntentRecord | undefined> {
    const result = await (this.#client ?? this.pool).query<{ record: unknown }>(
      "SELECT record FROM earmark_intents WHERE scope=$1 AND intent_id=$2",
      [this.scope, key],
    );
    return result.rows[0]
      ? intentSchema.parse(result.rows[0].record)
      : undefined;
  }
  async put(input: IntentRecord) {
    const client = this.#client;
    if (!client) throw new AgentError("INTENT_STORE_NOT_LOCKED");
    const record = intentSchema.parse(input);
    const previous = await this.get(record.key);
    if (record.quote.taskHash !== this.binding.mandateId)
      throw new AgentError("INTENT_CHAIN_MISMATCH");
    if (
      previous &&
      (previous.requestId !== record.requestId ||
        previous.paymentId !== record.paymentId ||
        previous.genesisHash !== record.genesisHash ||
        JSON.stringify(previous.quote) !== JSON.stringify(record.quote))
    )
      throw new AgentError("INTENT_TERMS_IMMUTABLE");
    for (const action of ["requestTx", "acceptTx"] as const) {
      const before = previous?.[action],
        after = record[action];
      if (
        before &&
        (!after || before.hash !== after.hash || before.nonce !== after.nonce)
      )
        throw new AgentError("TRANSACTION_IDENTITY_IMMUTABLE");
    }
    const recipient = this.binding.providers.find(
      (p) => p.id === record.quote.providerId,
    )?.address;
    if (!recipient) throw new AgentError("UNAPPROVED_PROVIDER");
    await client.query(
      `INSERT INTO earmark_intents(scope,intent_id,mandate_id,quote_id,amount,recipient,run_id,payment_id,record)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(scope,intent_id) DO UPDATE SET record=EXCLUDED.record,updated_at=now()`,
      [
        this.scope,
        record.key,
        this.binding.mandateId,
        record.quote.quoteId,
        record.quote.price,
        recipient.toLowerCase(),
        this.binding.runId,
        record.paymentId,
        JSON.stringify(record),
      ],
    );
  }
}
export type { Pool, PoolClient } from "pg";

/** Pins this dedicated database to the approved testnet environment. Never rewrites an existing binding. */
export async function bindTestnetDatabase(pool: Pool) {
  await pool.query(`INSERT INTO earmark_environment(singleton,environment,chain_id,project_id,branch)
    VALUES(true,'earmark-testnet',10143,'square-glade-65269089','production') ON CONFLICT DO NOTHING`);
  const result = await pool.query<{
    environment: string;
    chain_id: number;
    project_id: string;
    branch: string;
  }>(
    "SELECT environment,chain_id,project_id,branch FROM earmark_environment WHERE singleton=true",
  );
  const row = result.rows[0];
  if (
    row?.environment !== "earmark-testnet" ||
    row.chain_id !== 10143 ||
    row.project_id !== "square-glade-65269089" ||
    row.branch !== "production"
  )
    throw new Error("DATABASE_ENVIRONMENT_MISMATCH");
}
