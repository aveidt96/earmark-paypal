import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";

const source = resolve(process.argv[2] ?? "../project-flint");
const revision = "cc20daa06392c588a42925d3844311abac1a067f";
const tree = execFileSync("git", [
  "--no-optional-locks",
  "-C",
  source,
  "ls-tree",
  "-r",
  "-z",
  revision,
])
  .toString("utf8")
  .split("\0")
  .filter(Boolean);
const unchanged = [],
  modified = [],
  missing = [];
for (const record of tree) {
  const [entry, path] = record.split("\t");
  if (!existsSync(path)) {
    missing.push(path);
    continue;
  }
  const content = readFileSync(path);
  const blob = createHash("sha1")
    .update(`blob ${content.length}\0`)
    .update(content)
    .digest("hex");
  (entry.endsWith(blob) ? unchanged : modified).push(path);
}
const files = execFileSync("git", [
  "ls-files",
  "-z",
  "--cached",
  "--others",
  "--exclude-standard",
])
  .toString("utf8")
  .split("\0")
  .filter(Boolean);
const findings = [];
const credentialPatterns = [
  /AIza[0-9A-Za-z_-]{35}/,
  /gh[pousr]_[0-9A-Za-z]{30,}/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
];
for (const path of files) {
  if (/(^|\/)\.env(?:\.|$)/.test(path) && !/\.example$/.test(path))
    findings.push({ path, rule: "non-template-environment-file" });
  const content = readFileSync(join(process.cwd(), path)).toString("utf8");
  if (credentialPatterns.some((pattern) => pattern.test(content)))
    findings.push({ path, rule: "credential-pattern" });
}
console.log(
  JSON.stringify(
    {
      sourceRevision: revision,
      originalTrackedFiles: tree.length,
      unchangedFiles: unchanged.length,
      modifiedFiles: modified,
      missingFiles: missing,
      candidateFilesScanned: files.length,
      credentialFindings: findings,
    },
    null,
    2,
  ),
);
if (missing.length || findings.length) process.exitCode = 1;
