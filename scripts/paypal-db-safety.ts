import type { PoolClient } from "@flint/agent/server";

export const approvedMigrationChecksum =
  "eaa2680ae6a842456989b3895b944b73d4e1fd551a5ee66161ed836c42ba21ad";
export class DatabaseSafetyError extends Error {}

/** Server-only validation; returned URL must never be printed or serialized. */
export function approvedPayPalTarget(
  env: Record<string, string | undefined> = process.env,
): URL {
  if (env.PAYPAL_DATABASE_ENVIRONMENT !== "sandbox" || !env.PAYPAL_DATABASE_URL)
    throw new DatabaseSafetyError("PAYPAL_SANDBOX_DATABASE_REQUIRED");
  let target: URL;
  try {
    target = new URL(env.PAYPAL_DATABASE_URL);
  } catch {
    throw new DatabaseSafetyError("INVALID_PAYPAL_DATABASE_CONFIGURATION");
  }
  const host = (url: URL) => url.hostname.replace("-pooler", "");
  if (
    !["postgres:", "postgresql:"].includes(target.protocol) ||
    !target.hostname.endsWith(".neon.tech") ||
    target.hostname.includes("-pooler") ||
    !target.username ||
    !target.password ||
    target.pathname.length < 2 ||
    target.hash ||
    [...target.searchParams.keys()].some(
      (key) => !["sslmode", "channel_binding"].includes(key),
    )
  )
    throw new DatabaseSafetyError("DIRECT_NEON_DATABASE_REQUIRED");
  if (
    host(target) === "ep-restless-leaf-babqdcr8.c-8.eu-central-1.aws.neon.tech"
  )
    throw new DatabaseSafetyError("LEGACY_DATABASE_FORBIDDEN");
  try {
    if (
      env.PAYPAL_DATABASE_DIRECT_URL &&
      new URL(env.PAYPAL_DATABASE_DIRECT_URL).toString() !== target.toString()
    )
      throw new DatabaseSafetyError("PAYPAL_DIRECT_TARGET_MISMATCH");
    if (env.DATABASE_URL) {
      const pooled = new URL(env.DATABASE_URL);
      if (
        host(pooled) !== host(target) ||
        pooled.pathname !== target.pathname ||
        pooled.username !== target.username
      )
        throw new DatabaseSafetyError("PAYPAL_POOLED_TARGET_MISMATCH");
    }
  } catch (error) {
    if (error instanceof DatabaseSafetyError) throw error;
    throw new DatabaseSafetyError("INVALID_PAYPAL_DATABASE_CONFIGURATION");
  }
  return target;
}
export async function verifyPayPalConnection(
  client: PoolClient,
  target: URL,
  freshSchema = false,
) {
  const stream = (
    client as unknown as {
      connection?: { stream?: { encrypted?: boolean; authorized?: boolean } };
    }
  ).connection?.stream;
  if (stream?.encrypted !== true || stream.authorized !== true)
    throw new DatabaseSafetyError("VERIFIED_DATABASE_TLS_REQUIRED");
  const result = await client.query<{
    database_name: string;
    legacy: boolean;
    schema_exists: boolean;
  }>(`SELECT current_database() AS database_name,
    EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE
      c.relname IN ('earmark_schema','earmark_environment','earmark_workspaces','earmark_intents',
        'earmark_launch_nonces','earmark_runs','earmark_events','earmark_provider_calls') AND n.nspname <> 'earmark_paypal') AS legacy,
    to_regnamespace('earmark_paypal') IS NOT NULL AS schema_exists`);
  const row = result.rows[0];
  if (
    !row ||
    row.database_name !== decodeURIComponent(target.pathname.slice(1))
  )
    throw new DatabaseSafetyError("PAYPAL_DATABASE_IDENTITY_MISMATCH");
  if (row.legacy) throw new DatabaseSafetyError("LEGACY_DATABASE_FORBIDDEN");
  if (freshSchema && row.schema_exists)
    throw new DatabaseSafetyError("PAYPAL_SCHEMA_ALREADY_EXISTS");
  return {
    tlsVerified: true,
    databaseMatches: true,
    legacyObjectsPresent: false,
    paypalSchemaPresent: row.schema_exists,
  };
}
export function safeDatabaseFailure(error: unknown) {
  const code = (error as { code?: unknown })?.code;
  return {
    error:
      error instanceof DatabaseSafetyError
        ? error.message
        : "PAYPAL_DATABASE_OPERATION_FAILED",
    ...(typeof code === "string" && /^[A-Z0-9]{5}$/.test(code)
      ? { sqlState: code }
      : {}),
  };
}
