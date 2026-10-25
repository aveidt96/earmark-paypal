import { readFileSync } from "node:fs";
import {
  createDatabase,
  migrateDatabase,
  bindTestnetDatabase,
} from "@flint/agent/server";
async function main() {
  const context = JSON.parse(
    readFileSync(new URL("../.neon", import.meta.url), "utf8"),
  ) as { projectId?: string; branch?: string };
  const url = process.env.DATABASE_URL_UNPOOLED;
  if (
    context.projectId !== "square-glade-65269089" ||
    context.branch !== "production" ||
    !url ||
    new URL(url).hostname !==
      "ep-restless-leaf-babqdcr8.c-8.eu-central-1.aws.neon.tech"
  )
    throw new Error("EARMARK_TESTNET_PRODUCTION_DATABASE_REQUIRED");
  const pool = createDatabase(url);
  try {
    const before = await pool.query<{ name: string }>(
      "SELECT tablename AS name FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
    );
    console.log(
      JSON.stringify({
        environment: "earmark-testnet",
        chainId: 10143,
        project: context.projectId,
        branch: context.branch,
        existingTables: before.rows.map((r) => r.name),
      }),
    );
    await migrateDatabase(pool);
    await bindTestnetDatabase(pool);
    const result = await pool.query(
      "SELECT environment,chain_id,project_id,branch FROM earmark_environment",
    );
    console.log(
      JSON.stringify({
        status: "EARMARK_DATABASE_SCHEMA_READY",
        binding: result.rows,
        existingDataPreserved: true,
      }),
    );
  } finally {
    await pool.end();
  }
}
main().catch(() => {
  console.error("DATABASE_MIGRATION_FAILED");
  process.exitCode = 1;
});
