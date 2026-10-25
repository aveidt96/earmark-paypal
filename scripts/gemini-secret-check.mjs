import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
const key = process.env.GEMINI_API_KEY;
if (!key || process.env.EARMARK_ENABLE_TESTNET_EXECUTION !== "false")
  process.exit(1);
const tracked = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean);
const additions = [
  "scripts/gemini-readonly-fixture.mjs",
  "scripts/gemini-readonly-fixture.test.mjs",
  "scripts/gemini-secret-check.mjs",
];
const walk = (path) =>
  !existsSync(path)
    ? []
    : readdirSync(path, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory()
          ? walk(join(path, entry.name))
          : [join(path, entry.name)],
      );
const browser = walk("web/.next/static").filter((file) => file.endsWith(".js"));
const sources = [...new Set([...tracked, ...additions])].filter((file) =>
  existsSync(file),
);
const leaks = [...sources, ...browser].filter((file) =>
  readFileSync(file).includes(Buffer.from(key)),
);
console.log(
  JSON.stringify({
    sourceFiles: sources.length,
    browserChunks: browser.length,
    credentialMatches: leaks.length,
    financialExecution: false,
  }),
);
if (leaks.length) process.exit(1);
