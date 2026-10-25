import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, openSync, closeSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { startLocalWorkspace } from "../agent/dist/local/workspace.js";
const root = fileURLToPath(new URL("../", import.meta.url));
export async function startApplication({
  port = 3000,
  production = false,
  ownerFile = false,
  demoStatePath,
  readOnlyGemini = false,
  geminiEnabled = false,
} = {}) {
  const local = await startLocalWorkspace();
  // Local block cadence stays below the existing provider timeout.
  // Mandate durations and the complete owner challenge window are unchanged.
  await local.node.testClient.setIntervalMining({ interval: 1 });
  const state = join(root, ".tools", "stage-6-state", randomUUID());
  mkdirSync(state, { recursive: true, mode: 0o700 });
  if (ownerFile)
    writeFileSync(join(state, "local-owner.key"), local.ownerKey, {
      mode: 0o600,
    });
  const origin = `http://127.0.0.1:${port}`;
  const log = openSync(join(state, "web.log"), "a", 0o600);
  const child = spawn(
    process.execPath,
    [
      join(root, "node_modules/next/dist/bin/next"),
      production ? "start" : "dev",
      ...(production ? [] : ["--webpack"]),
      "--hostname",
      "127.0.0.1",
      "--port",
      String(port),
    ],
    {
      cwd: join(root, "web"),
      windowsHide: true,
      stdio: ["ignore", log, log],
      env: {
        ...process.env,
        ...local.serverEnv,
        FLINT_STATE_DIR: state,
        FLINT_WEB_ORIGIN: origin,
        NEXT_TELEMETRY_DISABLED: "1",
        EARMARK_DEMO_STATE_PATH: demoStatePath,
        ...(readOnlyGemini
          ? {
              EARMARK_API_URL: "",
              EARMARK_DEPLOYMENT: "",
              VERCEL: "",
              AGENT_MODEL_PROVIDER: "mock",
              AI_ENABLE_NETWORK: "true",
              EARMARK_GEMINI_ENABLED: geminiEnabled ? "true" : "false",
              EARMARK_ENABLE_TESTNET_EXECUTION: "false",
            }
          : {}),
      },
    },
  );
  closeSync(log);
  let ended = false;
  child.on("error", () => {
    ended = true;
  });
  child.on("exit", () => {
    ended = true;
  });
  const close = async () => {
    if (!ended) {
      await new Promise((resolveExit) => {
        child.once("exit", resolveExit);
        child.kill();
      });
    }
    await local.close();
  };
  try {
    const deadline = Date.now() + 90000;
    for (;;) {
      if (ended || Date.now() > deadline)
        throw new Error(
          `LOCAL_WEB_START_FAILED: see ${join(state, "web.log")}`,
        );
      try {
        const r = await fetch(`${origin}/api/workspace`, {
          // Cold snapshots perform several verified RPC reads; keep the total startup bound.
          signal: AbortSignal.timeout(5000),
        });
        const s = await r.json();
        if (s.configured) break;
      } catch {
        /* Bounded local readiness; never resubmits a transaction. */
      }
      await new Promise((r) => setTimeout(r, 200));
    }
  } catch (e) {
    await close();
    throw e;
  }
  return { ...local, origin, state, close };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const app = await startApplication({ ownerFile: true });
  console.log(
    `Earmark local workspace: ${app.origin}\nRPC: ${app.node.rpcUrl}\nOwner: ${app.ownerWallet.account.address}\nVault: ${app.vault}\nLocal owner import file: ${join(app.state, "local-owner.key")}\nMock mode. Fresh vault: deposit and create a mandate through the UI. No external deployment.`,
  );
  let closing = false;
  for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, () => {
      if (!closing) {
        closing = true;
        void app.close().then(() => process.exit(0));
      }
    });
}
