import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadPayPalEnvironment } from "./paypal-env";

const root = fileURLToPath(new URL("../", import.meta.url));
function chunks(path: string): string[] {
  if (!existsSync(path)) return [];
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? chunks(join(path, entry.name))
      : entry.name.endsWith(".js")
        ? [join(path, entry.name)]
        : [],
  );
}
try {
  loadPayPalEnvironment();
  const id = process.env.PAYPAL_CLIENT_ID,
    secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!id || !secret) throw new Error("PAYPAL_CREDENTIALS_REQUIRED");
  const values = [
    id,
    secret,
    Buffer.from(`${id}:${secret}`).toString("base64"),
  ];
  for (const prefix of ["PAYPAL_ORIGINAL", "PAYPAL_OLD"]) {
    const originalId = process.env[`${prefix}_CLIENT_ID`];
    const originalSecret = process.env[`${prefix}_CLIENT_SECRET`];
    if (originalId) values.push(originalId);
    if (originalSecret) values.push(originalSecret);
    if (originalId && originalSecret)
      values.push(
        Buffer.from(`${originalId}:${originalSecret}`).toString("base64"),
      );
  }
  const authPath = new URL("../.tools/paypal-test-auth.json", import.meta.url);
  if (existsSync(authPath)) {
    const auth = JSON.parse(readFileSync(authPath, "utf8")) as {
      loginSecret?: string;
      sessionSecret?: string;
    };
    if (auth.loginSecret) values.push(auth.loginSecret);
    if (auth.sessionSecret) values.push(auth.sessionSecret);
  }
  const needles = values.map((value) => Buffer.from(value));
  const git = (...args: string[]) =>
    execFileSync("git", args, {
      cwd: root,
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString("utf8")
      .split("\0")
      .filter(Boolean);
  const tracked = git("ls-files", "-z");
  const candidates = git(
    "ls-files",
    "-z",
    "--cached",
    "--others",
    "--exclude-standard",
  );
  const browser = chunks(join(root, "web/.next/static"));
  const leaks = (files: string[], relative: boolean) =>
    files.filter((path) => {
      const content = readFileSync(relative ? join(root, path) : path);
      return needles.some((needle) => content.includes(needle));
    }).length;
  const trackedMatches = leaks(tracked, true),
    candidateMatches = leaks(candidates, true),
    browserMatches = leaks(browser, false);
  const envTracked = tracked.some(
    (path) => /(^|\/)\.env(?:\.|$)/.test(path) && !/\.example$/.test(path),
  );
  const ignored =
    execFileSync("git", ["check-ignore", "--quiet", "--", "web/.env.local"], {
      cwd: root,
      stdio: "ignore",
    }) !== undefined;
  console.log(
    JSON.stringify(
      {
        trackedFilesScanned: tracked.length,
        candidateFilesScanned: candidates.length,
        browserChunksScanned: browser.length,
        trackedCredentialMatches: trackedMatches,
        candidateCredentialMatches: candidateMatches,
        browserCredentialMatches: browserMatches,
        secretEnvironmentTracked: envTracked,
        localEnvironmentIgnored: ignored,
        valuesPrinted: false,
      },
      null,
      2,
    ),
  );
  if (
    trackedMatches ||
    candidateMatches ||
    browserMatches ||
    envTracked ||
    !browser.length
  )
    process.exitCode = 1;
} catch {
  console.error("PAYPAL_SECRET_BOUNDARY_CHECK_FAILED");
  process.exitCode = 1;
}
