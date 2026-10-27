import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createDatabase } from "@flint/agent/server";
import { loadPayPalEnvironment } from "./paypal-env";
import {
  approvedMigrationChecksum,
  approvedPayPalTarget,
  verifyPayPalConnection,
  safeDatabaseFailure,
} from "./paypal-db-safety";

// Default is an offline plan. --apply must be explicitly requested by the operator.
async function main() {
  const sql = readFileSync(
    new URL("../database/paypal/001_sandbox.sql", import.meta.url),
    "utf8",
  );
  const checksum = createHash("sha256").update(sql).digest("hex");
  const args = process.argv.slice(2);
  if (args.length > 1 || (args[0] && args[0] !== "--apply"))
    throw new Error("INVALID_MIGRATION_ARGUMENTS");
  if (!args.includes("--apply")) {
    console.log(
      JSON.stringify({
        migration: "paypal/001_sandbox.sql",
        checksum,
        mode: "plan-only",
        databaseContacted: false,
      }),
    );
    return;
  }
  loadPayPalEnvironment();
  const target = approvedPayPalTarget();
  if (checksum !== approvedMigrationChecksum)
    throw new Error("UNAPPROVED_MIGRATION_CHECKSUM");
  const pool = createDatabase(target.toString());
  try {
    const client = await pool.connect();
    client.on("error", () => {});
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL lock_timeout='10000ms'");
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended('earmark-paypal-schema',0))",
      );
      await verifyPayPalConnection(client, target, true);
      await client.query(sql);
      await client.query(
        "INSERT INTO earmark_paypal.schema_migrations(version,checksum) VALUES(1,$1)",
        [checksum],
      );
      await client.query("COMMIT");
      console.log(
        JSON.stringify({
          status: "PAYPAL_SANDBOX_MIGRATION_APPLIED",
          checksum,
          transactionCommitted: true,
        }),
      );
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      console.error(
        JSON.stringify({
          status: "PAYPAL_DATABASE_MIGRATION_ROLLED_BACK",
          ...safeDatabaseFailure(error),
        }),
      );
      process.exitCode = 1;
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}
main().catch((error: unknown) => {
  console.error(JSON.stringify(safeDatabaseFailure(error)));
  process.exitCode = 1;
});
