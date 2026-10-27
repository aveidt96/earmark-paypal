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

async function main() {
  loadPayPalEnvironment();
  const target = approvedPayPalTarget();
  const checksum = createHash("sha256")
    .update(
      readFileSync(
        new URL("../database/paypal/001_sandbox.sql", import.meta.url),
      ),
    )
    .digest("hex");
  if (checksum !== approvedMigrationChecksum)
    throw new Error("MIGRATION_CHECKSUM_MISMATCH");
  const pool = createDatabase(target.toString());
  try {
    const client = await pool.connect();
    client.on("error", () => {});
    try {
      await client.query("BEGIN READ ONLY");
      const identity = await verifyPayPalConnection(client, target);
      if (!identity.paypalSchemaPresent)
        throw new Error("PAYPAL_SCHEMA_REQUIRED");
      const tables = await client.query<{
        name: string;
      }>(`SELECT c.relname AS name FROM pg_class c
        JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='earmark_paypal' AND c.relkind='r' ORDER BY c.relname`);
      const expected = [
        "approved_merchants",
        "attempts",
        "audit",
        "environment",
        "idempotency",
        "mandates",
        "schema_migrations",
        "webhook_events",
      ];
      if (
        JSON.stringify(tables.rows.map((r) => r.name)) !==
        JSON.stringify(expected)
      )
        throw new Error("PAYPAL_TABLE_INVENTORY_MISMATCH");
      const constraints = await client.query<{
        table: string;
        type: string;
        definition: string;
        validated: boolean;
      }>(`SELECT c.relname AS "table",
        k.contype AS type,pg_get_constraintdef(k.oid) AS definition,k.convalidated AS validated
        FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='earmark_paypal' ORDER BY c.relname,k.contype,k.conname`);
      const indexes = await client.query<{
        name: string;
        valid: boolean;
        definition: string;
      }>(`SELECT c.relname AS name,i.indisvalid AS valid,
        pg_get_indexdef(i.indexrelid) AS definition FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid
        JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='earmark_paypal' ORDER BY c.relname`);
      const triggers = await client.query<{
        name: string;
        table: string;
        enabled: string;
        deferrable: boolean;
        initiallyDeferred: boolean;
        function: string;
      }>(`SELECT
        t.tgname AS name,c.relname AS "table",t.tgenabled AS enabled,t.tgdeferrable AS deferrable,t.tginitdeferred AS "initiallyDeferred",p.proname AS "function"
        FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
        JOIN pg_proc p ON p.oid=t.tgfoid WHERE n.nspname='earmark_paypal' AND NOT t.tgisinternal ORDER BY t.tgname`);
      const functions = await client.query<{
        name: string;
        language: string;
      }>(`SELECT p.proname AS name,l.lanname AS language
        FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang
        WHERE n.nspname='earmark_paypal' ORDER BY p.proname`);
      const columns = await client.query<{
        table: string;
        column: string;
        type: string;
        scale: number | null;
        precision: number | null;
        identity: string;
      }>(`SELECT
        table_name AS "table",column_name AS "column",data_type AS type,numeric_scale AS scale,numeric_precision AS precision,is_identity AS identity
        FROM information_schema.columns WHERE table_schema='earmark_paypal' ORDER BY table_name,ordinal_position`);
      const environment = await client.query<{
        environment: string;
        version: number;
      }>("SELECT environment,version FROM earmark_paypal.environment");
      const migration = await client.query<{
        version: number;
        checksum: string;
      }>("SELECT version,checksum FROM earmark_paypal.schema_migrations");
      const counts: Record<string, number> = {};
      for (const name of expected) {
        const count = await client.query<{ count: number }>(
          `SELECT count(*)::integer AS count FROM earmark_paypal.${name}`,
        );
        counts[name] = count.rows[0]?.count ?? -1;
      }
      const extras = await client.query<{
        testSchemas: number;
        outsideTables: number;
      }>(`SELECT
        (SELECT count(*)::integer FROM pg_namespace WHERE nspname ~ '^earmark_paypal_test_[a-f0-9]{32}$') AS "testSchemas",
        (SELECT count(*)::integer FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN ('r','p')
          AND n.nspname <> 'earmark_paypal' AND n.nspname <> 'information_schema' AND n.nspname NOT LIKE 'pg_%') AS "outsideTables"`);
      const constraintCounts = Object.fromEntries(
        ["p", "u", "f", "c"].map((type) => [
          type,
          constraints.rows.filter((r) => r.type === type).length,
        ]),
      );
      const lifecycle = constraints.rows.some(
        (r) =>
          r.table === "mandates" &&
          ["ACTIVE", "REVOKED", "CLOSED"].every((s) =>
            r.definition.includes(s),
          ),
      );
      const accounting = [
        "cap_minor",
        "per_transaction_minor",
        "reserved_minor",
        "consumed_minor",
      ].every((name) =>
        columns.rows.some(
          (r) =>
            r.table === "mandates" &&
            r.column === name &&
            r.type === "numeric" &&
            r.scale === 0 &&
            r.precision === 20,
        ),
      );
      const deferred = triggers.rows
        .filter((r) => r.deferrable && r.initiallyDeferred)
        .map((r) => r.name)
        .sort();
      const checks = {
        tableInventory: tables.rows.length === 8,
        primaryKeys: constraintCounts.p === 8,
        uniqueConstraints: constraintCounts.u === 6,
        foreignKeys: constraintCounts.f === 6,
        checkConstraints: constraintCounts.c === 21,
        allConstraintsValidated: constraints.rows.every((r) => r.validated),
        indexes:
          indexes.rows.length === 16 && indexes.rows.every((r) => r.valid),
        triggers:
          triggers.rows.length === 7 &&
          triggers.rows.every((r) => r.enabled === "O"),
        deferredLedgers:
          JSON.stringify(deferred) ===
          JSON.stringify(["attempt_ledger", "mandate_ledger"]),
        functions:
          functions.rows.length === 6 &&
          functions.rows.every((r) => r.language === "plpgsql"),
        sandboxSeed:
          environment.rows.length === 1 &&
          environment.rows[0]?.environment === "sandbox" &&
          environment.rows[0]?.version === 1,
        migrationHistory:
          migration.rows.length === 1 &&
          migration.rows[0]?.version === 1 &&
          migration.rows[0]?.checksum === checksum,
        mandateLifecycle: lifecycle,
        exactBudgetAccounting: accounting,
        auditIdentity: columns.rows.some(
          (r) =>
            r.table === "audit" && r.column === "id" && r.identity === "YES",
        ),
      };
      const passed = Object.values(checks).every(Boolean);
      console.log(
        JSON.stringify(
          {
            status: passed
              ? "PAYPAL_DATABASE_STRUCTURE_VERIFIED"
              : "PAYPAL_DATABASE_STRUCTURE_MISMATCH",
            checksum,
            identity,
            checks,
            tables: tables.rows.map((r) => r.name),
            constraintCounts,
            indexCount: indexes.rows.length,
            triggers: triggers.rows,
            functions: functions.rows.map((r) => r.name),
            rowCounts: counts,
            disposableTestSchemasRemaining: extras.rows[0]?.testSchemas,
            unrelatedUserTableCount: extras.rows[0]?.outsideTables,
            readOnly: true,
            sandboxApiConfiguration: {
              clientIdPresent: !!process.env.PAYPAL_CLIENT_ID?.trim(),
              clientSecretPresent: !!process.env.PAYPAL_CLIENT_SECRET?.trim(),
              webhookIdPresent: !!process.env.PAYPAL_WEBHOOK_ID?.trim(),
              merchantIdPresent: !!process.env.PAYPAL_MERCHANT_ID?.trim(),
              backendEnabled: process.env.PAYPAL_BACKEND_ENABLED === "true",
              paymentExecutionEnabled:
                process.env.PAYPAL_PAYMENTS_ENABLED === "true",
              paymentFlowVerified: false,
            },
          },
          null,
          2,
        ),
      );
      if (!passed) process.exitCode = 1;
    } finally {
      await client.query("ROLLBACK").catch(() => {});
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
