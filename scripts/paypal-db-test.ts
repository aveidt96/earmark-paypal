import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createDatabase } from "@flint/agent/server";
import { loadPayPalEnvironment } from "./paypal-env";
import {
  approvedMigrationChecksum,
  approvedPayPalTarget,
  verifyPayPalConnection,
  safeDatabaseFailure,
} from "./paypal-db-safety";

async function main() {
  const args = process.argv.slice(2);
  if (
    args.length > 1 ||
    (args[0] &&
      !["--all", "--campaign", "--invariants", "--capture"].includes(args[0]))
  )
    throw new Error("INVALID_DATABASE_TEST_ARGUMENTS");
  loadPayPalEnvironment();
  const target = approvedPayPalTarget();
  const pool = createDatabase(target.toString());
  try {
    const client = await pool.connect();
    client.on("error", () => {});
    try {
      await client.query("BEGIN READ ONLY");
      const identity = await verifyPayPalConnection(client, target);
      if (!identity.paypalSchemaPresent)
        throw new Error("MIGRATED_PAYPAL_DATABASE_REQUIRED");
      const binding = await client.query(
        "SELECT environment,version FROM earmark_paypal.environment",
      );
      const history = await client.query(
        "SELECT version,checksum FROM earmark_paypal.schema_migrations",
      );
      if (
        binding.rows[0]?.environment !== "sandbox" ||
        binding.rows[0]?.version !== 1 ||
        history.rows[0]?.version !== 1 ||
        history.rows[0]?.checksum !== approvedMigrationChecksum
      )
        throw new Error("PAYPAL_DATABASE_BINDING_MISMATCH");
    } finally {
      await client.query("ROLLBACK").catch(() => {});
      client.release();
    }
  } finally {
    await pool.end();
  }
  const root = fileURLToPath(new URL("../", import.meta.url));
  const all = args.includes("--all");
  const command = all ? process.env.npm_execpath : undefined;
  if (all && !command) throw new Error("RUN_FULL_DATABASE_REGRESSION_VIA_NPM");
  const child = spawn(
    process.execPath,
    all
      ? [command as string, "test"]
      : [
          "node_modules/vitest/vitest.mjs",
          "run",
          "web/test/paypal-database.integration.test.ts",
          ...(args.includes("--campaign") ? ["-t", "Task05C"] : []),
          ...(args.includes("--invariants")
            ? ["-t", "database triggers protect policy"]
            : []),
          ...(args.includes("--capture")
            ? ["-t", "capture-once", "--silent=false"]
            : []),
        ],
    {
      cwd: root,
      stdio: "inherit",
      windowsHide: true,
      env: {
        ...process.env,
        PAYPAL_TEST_DATABASE_URL: target.toString(),
        PAYPAL_RUN_DATABASE_TESTS: "true",
        PAYPAL_RUN_NEON_DATABASE_TESTS: "true",
        PAYPAL_RUN_SANDBOX_TESTS: "false",
        PAYPAL_PAYMENTS_ENABLED: "false",
        PAYPAL_BACKEND_ENABLED: "false",
        EARMARK_TEST_DB_URL: "",
      },
    },
  );
  const code = await new Promise<number>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (status) => resolve(status ?? 1));
  });
  process.exitCode = code;
}
main().catch((error: unknown) => {
  console.error(JSON.stringify(safeDatabaseFailure(error)));
  process.exitCode = 1;
});
