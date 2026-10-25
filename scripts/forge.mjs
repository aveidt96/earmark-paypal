import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { forgePath, repositoryRoot } from "./foundry-paths.mjs";

if (!existsSync(forgePath)) {
  console.error(
    "Pinned Forge is missing. Run npm run setup:contracts at the repository root.",
  );
  process.exit(1);
}

const result = spawnSync(forgePath, process.argv.slice(2), {
  cwd: join(repositoryRoot, "contracts"),
  stdio: "inherit",
  windowsHide: true,
});
if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
