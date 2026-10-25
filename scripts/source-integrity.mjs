import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";

// Stores hashes only, never file contents. Baseline belongs in ignored .tools/.
const [mode, sourceArg, manifestArg] = process.argv.slice(2);
if (!["capture", "verify"].includes(mode) || !sourceArg || !manifestArg) {
  throw new Error("Usage: source-integrity.mjs capture|verify SOURCE MANIFEST");
}
const source = resolve(sourceArg);
const manifest = resolve(manifestArg);
const git = (...args) =>
  execFileSync("git", ["--no-optional-locks", "-C", source, ...args]);
const hash = (data) => createHash("sha256").update(data).digest("hex");
const names = new Set(
  Buffer.concat([
    git("ls-files", "-z", "--cached", "--others", "--exclude-standard"),
    git(
      "ls-files",
      "-z",
      "--others",
      "--ignored",
      "--exclude-standard",
      "--",
      ".env*",
      "*/.env*",
    ),
  ])
    .toString("utf8")
    .split("\0")
    .filter(Boolean),
);
const state = {
  head: git("rev-parse", "HEAD").toString().trim(),
  refs: hash(git("show-ref")),
  status: git("status", "--porcelain=v1", "--untracked-files=all").toString(),
  diff: hash(git("diff", "HEAD", "--binary")),
  files: Object.fromEntries(
    [...names].sort().map((name) => {
      try {
        return [name, hash(readFileSync(join(source, name)))];
      } catch (error) {
        if (error.code === "ENOENT") return [name, null];
        throw error;
      }
    }),
  ),
};
if (mode === "capture") {
  writeFileSync(manifest, JSON.stringify(state, null, 2) + "\n", {
    flag: "wx",
  });
  console.log(
    `Captured source HEAD, refs, status, diff and ${names.size} file hashes.`,
  );
} else {
  const baseline = JSON.parse(readFileSync(manifest, "utf8"));
  if (JSON.stringify(baseline) !== JSON.stringify(state)) {
    throw new Error("SOURCE_INTEGRITY_MISMATCH");
  }
  console.log(
    `PASS: source HEAD, refs, status, diff and ${names.size} file hashes unchanged.`,
  );
}
