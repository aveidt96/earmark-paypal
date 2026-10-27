import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createDatabase } from "@flint/agent/server";
import { loadPayPalEnvironment } from "./paypal-env";

const root = fileURLToPath(new URL("../", import.meta.url));
const legacyEndpoint =
  "ep-restless-leaf-babqdcr8.c-8.eu-central-1.aws.neon.tech";
function endpoint(raw: string | undefined) {
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    if (
      !["postgres:", "postgresql:"].includes(url.protocol) ||
      !url.hostname.endsWith(".neon.tech") ||
      !url.username ||
      !url.password ||
      url.pathname.length < 2 ||
      url.hash ||
      [...url.searchParams.keys()].some(
        (key) => !["sslmode", "channel_binding"].includes(key),
      )
    )
      return undefined;
    return url;
  } catch {
    return undefined;
  }
}
function javascriptFiles(path: string): string[] {
  if (!existsSync(path)) return [];
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const file = join(path, entry.name);
    return entry.isDirectory()
      ? javascriptFiles(file)
      : file.endsWith(".js")
        ? [file]
        : [];
  });
}
async function main() {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args[0] && args[0] !== "--connect"))
    throw new Error("INVALID_INSPECTION_ARGUMENTS");
  const loaded = loadPayPalEnvironment();
  const direct = endpoint(process.env.PAYPAL_DATABASE_URL);
  const pooled = endpoint(process.env.DATABASE_URL);
  const directAlias = endpoint(process.env.PAYPAL_DATABASE_DIRECT_URL);
  const canonicalHost = (url: URL) => url.hostname.replace("-pooler", "");
  const legacy = direct ? canonicalHost(direct) === legacyEndpoint : undefined;
  const staticFiles = javascriptFiles(join(root, "web/.next/static"));
  const secrets = [
    process.env.PAYPAL_DATABASE_URL,
    process.env.PAYPAL_DATABASE_DIRECT_URL,
    process.env.DATABASE_URL,
    direct?.password && decodeURIComponent(direct.password),
    pooled?.password && decodeURIComponent(pooled.password),
  ].filter((value): value is string => !!value && value.length >= 8);
  const publicKeys = Object.keys(process.env).filter(
    (name) =>
      name.startsWith("NEXT_PUBLIC_") &&
      !!process.env[name] &&
      (/(?:DATABASE|DB|POSTGRES|PGHOST|PGUSER|PGPASSWORD|NEON)/i.test(name) ||
        /postgres(?:ql)?:\/\//i.test(process.env[name] ?? "") ||
        secrets.some((secret) => process.env[name]?.includes(secret))),
  );
  let chunkMatches = 0;
  for (const file of staticFiles) {
    const contents = readFileSync(file);
    if (secrets.some((secret) => contents.includes(Buffer.from(secret))))
      chunkMatches++;
  }
  const sql = readFileSync(
    join(root, "database/paypal/001_sandbox.sql"),
    "utf8",
  );
  const migration = {
    path: "database/paypal/001_sandbox.sql",
    sha256: createHash("sha256").update(sql).digest("hex"),
    applied: null as boolean | null,
  };
  const report: Record<string, unknown> = {
    loadedFiles: loaded.files,
    configuration: {
      paypalDatabaseUrlPresent: !!process.env.PAYPAL_DATABASE_URL,
      paypalDatabaseEnvironmentIsSandbox:
        process.env.PAYPAL_DATABASE_ENVIRONMENT === "sandbox",
      directNeonUrlValid: !!direct && !direct.hostname.includes("-pooler"),
      differsFromPinnedLegacyEndpoint: direct ? !legacy : null,
      directAliasMatchesCanonical:
        direct && directAlias
          ? direct.toString() === directAlias.toString()
          : null,
      pooledAndDirectSameTarget:
        direct && pooled
          ? canonicalHost(direct) === canonicalHost(pooled) &&
            direct.pathname === pooled.pathname &&
            direct.username === pooled.username
          : null,
      publicDatabaseVariablesPresent: publicKeys.length > 0,
    },
    browser: {
      existingChunksScanned: staticFiles.length,
      credentialMatches: chunkMatches,
      freshBuild: false,
    },
    migration,
    mode: args.includes("--connect")
      ? "read-only-connection"
      : "configuration-only",
    databaseContacted: false,
  };
  const safe =
    direct &&
    !legacy &&
    !direct.hostname.includes("-pooler") &&
    process.env.PAYPAL_DATABASE_ENVIRONMENT === "sandbox" &&
    publicKeys.length === 0 &&
    chunkMatches === 0;
  if (!args.includes("--connect") || !safe) {
    report.readyForMigration = false;
    report.result = safe
      ? "READ_ONLY_CONNECTION_CHECK_NOT_RUN"
      : "PAYPAL_DATABASE_CONFIGURATION_NOT_READY";
    console.log(JSON.stringify(report, null, 2));
    if (!safe) process.exitCode = 1;
    return;
  }
  const pool = createDatabase(process.env.PAYPAL_DATABASE_URL as string);
  try {
    report.databaseContacted = true;
    const client = await pool.connect();
    client.on("error", () => {}); // Prevent raw driver/socket errors from logging credentials.
    try {
      await client.query("BEGIN READ ONLY");
      await client.query("SET LOCAL statement_timeout='5000ms'");
      const metadata = await client.query<{
        database_name: string;
        read_only: boolean;
        tls: boolean;
        can_create_schema: boolean;
        plpgsql_usage: boolean;
        advisory_lock_usage: boolean;
      }>(`SELECT current_database() AS database_name,
        current_setting('transaction_read_only')='on' AS read_only,
        EXISTS(SELECT 1 FROM pg_stat_ssl WHERE pid=pg_backend_pid() AND ssl) AS tls,
        has_database_privilege(current_database(),'CREATE') AS can_create_schema,
        has_language_privilege(current_user,'plpgsql','USAGE') AS plpgsql_usage,
        has_function_privilege(current_user,'pg_catalog.pg_advisory_xact_lock(bigint)','EXECUTE') AS advisory_lock_usage`);
      const catalog = await client.query<{
        legacy_objects: boolean;
        paypal_schema: boolean;
        user_table_count: string;
      }>(`SELECT
        EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE c.relname IN ('earmark_schema','earmark_environment','earmark_workspaces','earmark_intents',
            'earmark_launch_nonces','earmark_runs','earmark_events','earmark_provider_calls') AND n.nspname <> 'earmark_paypal') AS legacy_objects,
        to_regnamespace('earmark_paypal') IS NOT NULL AS paypal_schema,
        (SELECT count(*)::text FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE c.relkind IN ('r','p') AND n.nspname <> 'information_schema' AND n.nspname NOT LIKE 'pg_%') AS user_table_count`);
      const m = metadata.rows[0],
        c = catalog.rows[0];
      if (!m || !c) throw new Error("PAYPAL_DATABASE_INSPECTION_INCOMPLETE");
      const matches =
        m.database_name === decodeURIComponent(direct.pathname.slice(1));
      // Neon may terminate TLS at its proxy; pg_stat_ssl describes the proxy-to-compute leg.
      const stream = (
        client as unknown as {
          connection?: {
            stream?: { encrypted?: boolean; authorized?: boolean };
          };
        }
      ).connection?.stream;
      const tls = stream?.encrypted === true,
        certificateVerified = stream?.authorized === true;
      report.connection = {
        connected: true,
        tls,
        certificateVerified,
        serverReportsTls: m.tls,
        transactionReadOnly: m.read_only,
        configuredDatabaseMatches: matches,
        canCreateSchema: m.can_create_schema,
        plpgsqlUsage: m.plpgsql_usage,
        advisoryLockUsage: m.advisory_lock_usage,
      };
      report.isolation = {
        legacyObjectsPresent: c.legacy_objects,
        paypalSchemaPresent: c.paypal_schema,
        userTableCount: Number(c.user_table_count),
        projectDisplayNameVerified: false,
      };
      migration.applied = c.paypal_schema ? null : false;
      if (c.paypal_schema) {
        const markers = await client.query(
          "SELECT to_regclass('earmark_paypal.environment') AS environment,to_regclass('earmark_paypal.schema_migrations') AS history",
        );
        if (markers.rows[0]?.environment && markers.rows[0]?.history) {
          const seed = await client.query(
            "SELECT environment,version FROM earmark_paypal.environment",
          );
          const history = await client.query(
            "SELECT version,checksum FROM earmark_paypal.schema_migrations",
          );
          migration.applied =
            seed.rows.length === 1 &&
            seed.rows[0]?.environment === "sandbox" &&
            seed.rows[0]?.version === 1 &&
            history.rows.length === 1 &&
            history.rows[0]?.version === 1 &&
            history.rows[0]?.checksum === migration.sha256;
        }
      }
      report.readyForMigration =
        tls &&
        certificateVerified &&
        m.read_only &&
        matches &&
        m.can_create_schema &&
        m.plpgsql_usage &&
        m.advisory_lock_usage &&
        !c.legacy_objects &&
        !c.paypal_schema;
      report.result = migration.applied
        ? "PAYPAL_DATABASE_ALREADY_MIGRATED"
        : report.readyForMigration
          ? "READY_FOR_EXPLICIT_MIGRATION_APPROVAL"
          : "REVIEW_DATABASE_BEFORE_MIGRATION";
    } finally {
      await client.query("ROLLBACK").catch(() => {});
      client.release();
    }
  } catch {
    report.readyForMigration = false;
    report.result = "PAYPAL_DATABASE_READ_ONLY_CHECK_FAILED";
  } finally {
    await pool.end();
  }
  console.log(JSON.stringify(report, null, 2));
  if (!report.readyForMigration && migration.applied !== true)
    process.exitCode = 1;
}
main().catch(() => {
  console.error("PAYPAL_DATABASE_INSPECTION_FAILED");
  process.exitCode = 1;
});
