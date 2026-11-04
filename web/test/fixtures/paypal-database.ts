import { randomUUID, createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { monitorEventLoopDelay } from "node:perf_hooks";
import {
  createDatabase,
  type Pool,
  type PoolClient,
} from "@flint/agent/server";
import {
  approvedMigrationChecksum,
  approvedPayPalTarget,
  verifyPayPalConnection,
} from "../../../scripts/paypal-db-safety";

function sanitized(error: unknown): Error {
  const e = error as { message?: unknown; code?: unknown };
  const code =
    typeof e?.code === "string" && /^[A-Z0-9]{5}$/.test(e.code)
      ? e.code
      : "UNKNOWN";
  const category =
    typeof e?.message === "string" &&
    /^(Query read timeout|timeout exceeded when trying to connect|Connection terminated unexpectedly|Connection terminated due to connection timeout)$/.test(
      e.message,
    )
      ? "POSTGRES_TRANSPORT_OR_TIMEOUT"
      : `POSTGRES_${code}`;
  return Object.assign(
    new Error(
      typeof e?.message === "string" && /^[A-Z][A-Z0-9_]+$/.test(e.message)
        ? e.message
        : category,
    ),
    { code },
  );
}
/** Tests only: run the unchanged repository SQL against a unique disposable namespace. */
export async function isolatedPayPalDatabase(raw: string, neon: boolean) {
  const url = new URL(raw);
  if (neon) {
    if (approvedPayPalTarget().toString() !== url.toString())
      throw new Error("PAYPAL_TEST_TARGET_MISMATCH");
  } else if (
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
    !/^\/earmark_paypal_test[a-zA-Z0-9_]*$/.test(url.pathname)
  )
    throw new Error("ISOLATED_TEST_DATABASE_REQUIRED");
  const source = readFileSync(
    new URL("../../../database/paypal/001_sandbox.sql", import.meta.url),
    "utf8",
  );
  if (
    createHash("sha256").update(source).digest("hex") !==
    approvedMigrationChecksum
  )
    throw new Error("UNAPPROVED_TEST_MIGRATION");
  const schema = `earmark_paypal_test_${randomUUID().replaceAll("-", "")}`;
  if (!/^earmark_paypal_test_[a-f0-9]{32}$/.test(schema))
    throw new Error("INVALID_DISPOSABLE_SCHEMA");
  const rawPool = createDatabase(raw, !neon);
  const application = `paypal-disposable-${schema.slice(-32)}`;
  rawPool.options.application_name = application;
  const observer = createDatabase(raw, !neon);
  Object.assign(observer.options, {
    max: 1,
    application_name: `paypal-observer-${schema.slice(-32)}`,
    connectionTimeoutMillis: 2000,
    query_timeout: 2000,
    statement_timeout: 2000,
    options: "-c statement_timeout=2000",
  });
  const checkedOut = new Set<PoolClient>();
  const loop = monitorEventLoopDelay({ resolution: 20 });
  loop.enable();
  let serverStatementTimeoutMs = 0,
    serverLockTimeoutMs = 0;
  let captureDiagnostics = false,
    samples = 0,
    maxWaiting = 0,
    maxCheckedOut = 0,
    maxAcquireMs = 0;
  const phaseCounts: Record<string, number> = {};
  const pending = new Set<Promise<void>>();
  const phase = (sql: string) =>
    /FOR UPDATE/i.test(sql)
      ? "row_lock"
      : /^\s*UPDATE\s+earmark_paypal\.mandates/i.test(sql)
        ? "mandate_update"
        : /^\s*UPDATE\s+earmark_paypal\.attempts/i.test(sql)
          ? "attempt_update"
          : (/^\s*(BEGIN|COMMIT|ROLLBACK)/i.exec(sql)?.[1]?.toLowerCase() ??
            "other");
  const sample = (operation: string, started: number) => {
    if (!captureDiagnostics || samples >= 6 || pending.size) return;
    samples++;
    const task = (async () => {
      try {
        const result = await observer.query<{
          sessions: number;
          active: number;
          idle_transaction: number;
          lock_waiters: number;
          blocked: number;
          max_query_ms: number;
          statement_timeout: string;
        }>(
          `SELECT count(*)::int AS sessions,
          count(*) FILTER(WHERE state='active')::int AS active,
          count(*) FILTER(WHERE state='idle in transaction')::int AS idle_transaction,
          count(*) FILTER(WHERE wait_event_type='Lock')::int AS lock_waiters,
          count(*) FILTER(WHERE cardinality(pg_blocking_pids(pid))>0)::int AS blocked,
          coalesce(max(extract(epoch FROM (clock_timestamp()-query_start))*1000),0)::float8 AS max_query_ms,
          current_setting('statement_timeout') AS statement_timeout
          FROM pg_stat_activity WHERE application_name=$1`,
          [application],
        );
        const row = result.rows[0];
        console.info(
          JSON.stringify({
            event: "DISPOSABLE_CAPTURE_WAIT_SAMPLE",
            phase: operation,
            elapsedMs: Date.now() - started,
            total: rawPool.totalCount,
            idle: rawPool.idleCount,
            waiting: rawPool.waitingCount,
            checkedOut: checkedOut.size,
            eventLoopDelayMaxMs: Math.round(loop.max / 1e6),
            processRssMb: Math.round(process.memoryUsage().rss / 1048576),
            ...row,
          }),
        );
      } catch {
        console.info(
          JSON.stringify({
            event: "DISPOSABLE_CAPTURE_WAIT_SAMPLE",
            phase: operation,
            category: "OBSERVER_UNAVAILABLE",
          }),
        );
      }
    })();
    pending.add(task);
    void task.finally(() => pending.delete(task));
  };
  const guardedClients = new WeakSet<PoolClient>();
  const guardClient = (client: PoolClient) => {
    if (!guardedClients.has(client)) {
      client.on("error", () => {});
      guardedClients.add(client);
    }
  };
  let created = false,
    schemaOid = 0;
  const rewrite = (text: string) => {
    if (typeof text !== "string") throw new Error("STRING_TEST_QUERY_REQUIRED");
    return text.replace(/\bearmark_paypal\b/g, schema);
  };
  const query =
    (target: Pool | PoolClient) => async (text: string, values?: unknown[]) => {
      const started = Date.now();
      const operation = phase(text);
      phaseCounts[operation] = (phaseCounts[operation] ?? 0) + 1;
      maxWaiting = Math.max(maxWaiting, rawPool.waitingCount);
      const timer = captureDiagnostics
        ? setTimeout(() => sample(operation, started), 750)
        : undefined;
      try {
        return await target.query(rewrite(text), values);
      } catch (error) {
        const safe = sanitized(error);
        if (safe.message.startsWith("POSTGRES_"))
          console.error(
            JSON.stringify({
              event: "PAYPAL_TEST_DATABASE_FAILURE",
              category: safe.message,
              elapsedMs: Date.now() - started,
              operation:
                /^\s*(SELECT|INSERT|UPDATE|DELETE|BEGIN|COMMIT|ROLLBACK)/i
                  .exec(text)?.[1]
                  ?.toUpperCase() ?? "OTHER",
            }),
          );
        throw safe;
      } finally {
        if (timer) clearTimeout(timer);
      }
    };
  const pool = new Proxy(rawPool, {
    get(target, key) {
      if (key === "query") return query(target);
      if (key === "connect")
        return async () => {
          let client: PoolClient;
          const acquired = Date.now();
          try {
            const connecting = target.connect();
            maxWaiting = Math.max(maxWaiting, target.waitingCount);
            client = await connecting;
            maxAcquireMs = Math.max(maxAcquireMs, Date.now() - acquired);
            checkedOut.add(client);
            maxCheckedOut = Math.max(maxCheckedOut, checkedOut.size);
          } catch (error) {
            throw sanitized(error);
          }
          guardClient(client);
          return new Proxy(client, {
            get(c, k) {
              if (k === "query") return query(c);
              if (k === "release")
                return (error?: Error | boolean) => {
                  checkedOut.delete(c);
                  c.release(error);
                };
              const value = Reflect.get(c, k, c) as unknown;
              return typeof value === "function" ? value.bind(c) : value;
            },
          });
        };
      const value = Reflect.get(target, key, target) as unknown;
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  async function close() {
    try {
      if (created) {
        // Cleanup only the exact namespace created by this invocation and still owned by this role.
        const own = await rawPool.query<{ oid: number; owned: boolean }>(
          "SELECT oid,nspowner=(current_user::regrole)::oid AS owned FROM pg_namespace WHERE nspname=$1",
          [schema],
        );
        if (own.rows[0]?.oid !== schemaOid || own.rows[0]?.owned !== true)
          throw new Error("DISPOSABLE_SCHEMA_OWNERSHIP_MISMATCH");
        await rawPool.query(`DROP SCHEMA ${schema} CASCADE`);
        created = false;
      }
    } finally {
      await Promise.allSettled([...pending]);
      await observer.end();
      await rawPool.end();
      loop.disable();
      console.info(
        JSON.stringify({
          event: "DISPOSABLE_POOL_SUMMARY",
          maxWaiting,
          maxCheckedOut,
          maxAcquireMs,
          checkedOutAtClose: checkedOut.size,
          phaseCounts,
          observerSamples: samples,
          schemaRemoved: !created,
          serverStatementTimeoutMs,
          serverLockTimeoutMs,
          eventLoopDelayMaxMs: Math.round(loop.max / 1e6),
        }),
      );
    }
  }
  try {
    const client = await rawPool.connect();
    guardClient(client);
    try {
      await client.query("BEGIN");
      if (neon) await verifyPayPalConnection(client, url);
      const timeouts = await client.query<{
        statement_ms: string;
        lock_ms: string;
      }>(
        "SELECT (SELECT setting FROM pg_settings WHERE name='statement_timeout') AS statement_ms, (SELECT setting FROM pg_settings WHERE name='lock_timeout') AS lock_ms",
      );
      serverStatementTimeoutMs = Number(timeouts.rows[0]?.statement_ms);
      serverLockTimeoutMs = Number(timeouts.rows[0]?.lock_ms);
      if (serverStatementTimeoutMs !== 10000)
        throw new Error("DISPOSABLE_SERVER_TIMEOUT_MISMATCH");
      const legacy = await client.query(
        "SELECT to_regclass('public.earmark_environment') AS legacy",
      );
      if (legacy.rows[0]?.legacy) throw new Error("LEGACY_DATABASE_FORBIDDEN");
      const exists = await client.query(
        "SELECT to_regnamespace($1) AS existing",
        [schema],
      );
      if (exists.rows[0]?.existing)
        throw new Error("DISPOSABLE_SCHEMA_ALREADY_EXISTS");
      await client.query(
        rewrite(source).replace("CREATE SCHEMA IF NOT EXISTS", "CREATE SCHEMA"),
      );
      const own = await client.query<{ oid: number }>(
        "SELECT oid FROM pg_namespace WHERE nspname=$1",
        [schema],
      );
      schemaOid = own.rows[0]?.oid ?? 0;
      if (!schemaOid) throw new Error("DISPOSABLE_SCHEMA_MISSING");
      await client.query("COMMIT");
      created = true;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw sanitized(error);
    } finally {
      client.release();
    }
  } catch (error) {
    await close();
    throw sanitized(error);
  }
  return {
    pool: pool as Pool,
    schema,
    close,
    captureDiagnostics: (active: boolean) => {
      captureDiagnostics = active;
      if (active) loop.reset();
    },
  };
}
