import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

export const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
export const release = JSON.parse(
  readFileSync(new URL("./foundry-release.json", import.meta.url), "utf8"),
);
export const platform = `${process.platform}-${process.arch}`;
export const installDirectory = join(
  repositoryRoot,
  ".tools",
  `foundry-${release.version}-${platform}`,
);
export const forgePath = join(
  installDirectory,
  process.platform === "win32" ? "forge.exe" : "forge",
);
