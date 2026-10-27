import { randomUUID, createHash } from "node:crypto";
import { readFileSync } from "node:fs";
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
  return Object.assign(
    new Error(
      typeof e?.message === "string" && /^[A-Z][A-Z0-9_]+$/.test(e.message)
        ? e.message
        : `POSTGRES_${code}`,
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
      try {
        return await target.query(rewrite(text), values);
      } catch (error) {
        throw sanitized(error);
      }
    };
  const pool = new Proxy(rawPool, {
    get(target, key) {
      if (key === "query") return query(target);
      if (key === "connect")
        return async () => {
          let client: PoolClient;
          try {
            client = await target.connect();
          } catch (error) {
            throw sanitized(error);
          }
          guardClient(client);
          return new Proxy(client, {
            get(c, k) {
              if (k === "query") return query(c);
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
      await rawPool.end();
    }
  }
  try {
    const client = await rawPool.connect();
    guardClient(client);
    try {
      await client.query("BEGIN");
      if (neon) await verifyPayPalConnection(client, url);
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
  return { pool: pool as Pool, schema, close };
}
