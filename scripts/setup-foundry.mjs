import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import {
  forgePath,
  installDirectory,
  platform,
  release,
} from "./foundry-paths.mjs";

const asset = release.assets[platform];
if (!asset) {
  throw new Error(
    `Unsupported Foundry platform: ${platform}. See scripts/foundry-release.json.`,
  );
}

function verifyVersion() {
  const result = spawnSync(forgePath, ["--version"], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (
    result.error ||
    result.status !== 0 ||
    !result.stdout.includes(`Version: ${release.version}`)
  ) {
    throw new Error(
      "The local Forge binary does not match the pinned release.",
    );
  }
  console.log(result.stdout.trim());
}

if (existsSync(forgePath)) {
  verifyVersion();
} else {
  const url = `https://github.com/foundry-rs/foundry/releases/download/v${release.version}/${asset.file}`;
  let archive;
  if (process.env.FOUNDRY_ARCHIVE_PATH) {
    // Offline/slow-network install uses the identical pinned checksum below.
    archive = readFileSync(process.env.FOUNDRY_ARCHIVE_PATH);
  } else {
    console.log(
      `Downloading official Foundry ${release.version} for ${platform}...`,
    );
    const response = await fetch(url, { signal: AbortSignal.timeout(600_000) });
    if (!response.ok)
      throw new Error(`Foundry download failed: HTTP ${response.status}`);
    archive = Buffer.from(await response.arrayBuffer());
  }
  if (createHash("sha256").update(archive).digest("hex") !== asset.sha256) {
    throw new Error(
      "Foundry checksum mismatch; refusing to extract or execute.",
    );
  }
  mkdirSync(installDirectory, { recursive: true });
  const archivePath = join(installDirectory, asset.file);
  writeFileSync(archivePath, archive);
  const result = spawnSync(
    "tar",
    ["-xf", archivePath, "-C", installDirectory],
    {
      stdio: "inherit",
      windowsHide: true,
    },
  );
  if (result.error || result.status !== 0) {
    throw new Error(
      "Foundry extraction failed. Install tar (included in supported Windows/macOS/Linux).",
    );
  }
  verifyVersion();
}
