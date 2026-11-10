import { spawn, spawnSync } from "node:child_process";
import { stopOwnedAgentWithoutConsole } from "./paypal-agent-stop";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { AGENT_RUNTIME_VERSION } from "../web/src/server/paypal/agent-diagnostic";
import { randomBytes } from "node:crypto";
import {
  readFileSync,
  writeFileSync,
  existsSync,
  openSync,
  closeSync,
} from "node:fs";
import { createServer } from "node:net";
import { createDatabase } from "@flint/agent/server";
import { loadPayPalEnvironment } from "./paypal-env";
import {
  approvedPayPalTarget,
  verifyPayPalConnection,
} from "./paypal-db-safety";
import { merchantBinding } from "../web/src/server/paypal/test-config";
import { agentCheckoutConfig } from "../web/src/server/paypal/agent-checkout-config";
import { PaymentError } from "../web/src/server/paypal/domain";

async function main() {
  const args = process.argv.slice(2),
    directory = new URL("../.tools/", import.meta.url),
    origin = "http://127.0.0.1:3032";
  if (args.length === 1 && args[0] === "--stop") {
    const saved = JSON.parse(
      readFileSync(new URL("paypal-agent-server.json", directory), "utf8"),
    ) as { origin: string; epoch: string; pid: number };
    if (
      saved.origin !== origin ||
      !/^[a-f0-9]{64}$/.test(saved.epoch) ||
      !Number.isInteger(saved.pid)
    )
      throw new PaymentError("OWNED_AGENT_SERVER_REQUIRED");
    const response = await fetch(`${origin}/api/paypal/agent-checkout`, {
      signal: AbortSignal.timeout(10000),
      redirect: "error",
    });
    if (
      response.status !== 401 ||
      response.headers.get("x-earmark-agent-epoch") !== saved.epoch
    )
      throw new PaymentError("OWNED_AGENT_SERVER_MISMATCH");
    if (process.platform === "win32") {
      const stopped = spawnSync(
        join(
          process.env.SystemRoot ?? "C:\\Windows",
          "System32/WindowsPowerShell/v1.0/powershell.exe",
        ),
        [
          "-NoProfile",
          "-NonInteractive",
          "-File",
          fileURLToPath(new URL("./stop-owned-agent.ps1", import.meta.url)),
          "-TargetProcessId",
          String(saved.pid),
        ],
        {
          windowsHide: true,
          stdio: ["ignore", "pipe", "pipe"],
          timeout: 45000,
        },
      );
      if (stopped.status !== 0) {
        if (
          stopped.stderr?.toString().includes("OWNED_AGENT_CONSOLE_UNAVAILABLE")
        )
          await stopOwnedAgentWithoutConsole(saved);
        else throw new PaymentError("OWNED_AGENT_GRACEFUL_STOP_FAILED");
      }
    } else {
      process.kill(saved.pid, "SIGTERM");
    }
    console.log("OWNED_AGENT_SERVER_STOPPED");
    return;
  }
  if (args.some((arg) => arg !== "--detach"))
    throw new PaymentError("INVALID_AGENT_SERVER_ARGUMENTS");
  loadPayPalEnvironment();
  const auth = JSON.parse(
    readFileSync(new URL("paypal-test-auth.json", directory), "utf8"),
  ) as { ownerId: string; loginSecret: string; sessionSecret: string };
  const seller = JSON.parse(
    readFileSync(new URL("paypal-us-profile.json", directory), "utf8"),
  ) as {
    ownerId: string;
    dashboardSellerConfirmed: boolean;
    appMerchantBinding: string;
  };
  const binding = merchantBinding(
    process.env.PAYPAL_CLIENT_ID ?? "",
    process.env.PAYPAL_MERCHANT_ID ?? "",
  );
  if (
    seller.ownerId !== auth.ownerId ||
    seller.dashboardSellerConfirmed !== true ||
    seller.appMerchantBinding !== binding
  )
    throw new PaymentError("CONFIRMED_AGENT_SELLER_REQUIRED");
  const epoch = randomBytes(32).toString("hex"),
    keyPresent = !!process.env.GEMINI_API_KEY;
  const env = {
    ...process.env,
    PAYPAL_AGENT_CHECKOUT_ENABLED: "true",
    PAYPAL_AGENT_CAMPAIGN: process.env.PAYPAL_AGENT_CAMPAIGN ?? "agent-05c-v1",
    PAYPAL_AGENT_ORIGIN: origin,
    PAYPAL_AGENT_MERCHANT_BINDING: binding,
    PAYPAL_TEST_OWNER_ID: auth.ownerId,
    PAYPAL_TEST_LOGIN_SECRET: auth.loginSecret,
    PAYPAL_TEST_SESSION_SECRET: auth.sessionSecret,
    PAYPAL_TEST_SESSION_EPOCH: epoch,
    PAYPAL_BACKEND_ENABLED: "false",
    PAYPAL_PAYMENTS_ENABLED: "false",
    PAYPAL_TEST_CHECKOUT_ENABLED: "false",
    PAYPAL_TEST_US_ORDER_ONCE: "",
    PAYPAL_TEST_US_CAPTURE_ONCE: "",
    PAYPAL_AGENT_CHECKOUT_EXECUTION:
      process.env.PAYPAL_AGENT_CAMPAIGN === "agent-09-v1"
        ? (process.env.PAYPAL_AGENT_CHECKOUT_EXECUTION ?? "")
        : "",
    PAYPAL_AGENT_CHECKOUT_MANDATE_ID:
      process.env.PAYPAL_AGENT_CAMPAIGN === "agent-09-v1"
        ? (process.env.PAYPAL_AGENT_CHECKOUT_MANDATE_ID ?? "")
        : "",
    PAYPAL_AGENT_BUYER_SEPARATE:
      process.env.PAYPAL_AGENT_CAMPAIGN === "agent-09-v1"
        ? (process.env.PAYPAL_AGENT_BUYER_SEPARATE ?? "false")
        : "false",
    PAYPAL_AGENT_CAPTURE_MANDATE_ID:
      process.env.PAYPAL_AGENT_CAMPAIGN === "agent-09-v1"
        ? (process.env.PAYPAL_AGENT_CAPTURE_MANDATE_ID ?? "")
        : "",
    EARMARK_GEMINI_ENABLED: keyPresent ? "true" : "false",
    AI_ENABLE_NETWORK: keyPresent ? "true" : "false",
    EARMARK_ENABLE_TESTNET_EXECUTION: "false",
    NODE_DEBUG: "",
    NODE_DEBUG_NATIVE: "",
  };
  const config = agentCheckoutConfig(env);
  const target = approvedPayPalTarget(),
    pool = createDatabase(target.toString());
  try {
    const db = await pool.connect();
    try {
      await db.query("BEGIN READ ONLY");
      await verifyPayPalConnection(db, target);
    } finally {
      await db.query("ROLLBACK").catch(() => {});
      db.release();
    }
  } finally {
    await pool.end();
  }
  if (!existsSync(new URL("../web/.next/BUILD_ID", import.meta.url)))
    throw new PaymentError("PRODUCTION_BUILD_REQUIRED");
  const probe = createServer();
  await new Promise<void>((resolve, reject) => {
    probe.once("error", () => reject(new PaymentError("AGENT_PORT_IN_USE")));
    probe.listen(3032, "127.0.0.1", resolve);
  });
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  const detached = args.includes("--detach"),
    log = detached
      ? openSync(new URL("paypal-agent-server.log", directory), "a", 0o600)
      : undefined;
  const child = spawn(
    process.execPath,
    [
      "../node_modules/next/dist/bin/next",
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      "3032",
    ],
    {
      cwd: new URL("../web/", import.meta.url),
      env,
      detached,
      windowsHide: true,
      stdio: detached ? ["ignore", log as number, log as number] : "inherit",
    },
  );
  if (log !== undefined) closeSync(log);
  const deadline = Date.now() + 120000;
  for (;;) {
    if (child.exitCode !== null || Date.now() > deadline) {
      child.kill();
      throw new PaymentError("AGENT_SERVER_START_FAILED");
    }
    try {
      const response = await fetch(`${origin}/api/paypal/agent-checkout`, {
        signal: AbortSignal.timeout(5000),
      });
      if (
        response.status === 401 &&
        response.headers.get("x-earmark-agent-epoch") === epoch &&
        response.headers.get("x-earmark-agent-runtime") ===
          AGENT_RUNTIME_VERSION
      )
        break;
    } catch {
      /* bounded owned readiness */
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  writeFileSync(
    new URL("paypal-agent-server.json", directory),
    JSON.stringify(
      {
        origin,
        epoch,
        pid: child.pid,
        createdAt: new Date().toISOString(),
        liveGeminiKeyPresent: keyPresent,
        paymentExecutionEnabled: false,
        campaign: config.campaign,
        runtimeVersion: AGENT_RUNTIME_VERSION,
        buildId: readFileSync(
          new URL("../web/.next/BUILD_ID", import.meta.url),
          "utf8",
        ).trim(),
      },
      null,
      2,
    ) + "\n",
    { mode: 0o600 },
  );
  console.log(
    JSON.stringify({
      status: "LOCAL_AGENT_PREPARATION_READY",
      url: `${origin}/agent-checkout`,
      authFile: ".tools/paypal-test-auth.json",
      liveGeminiConfigured: keyPresent,
      campaign: config.campaign,
      paymentExecutionEnabled: false,
      persistentReservationEnabled: false,
    }),
  );
  if (detached) child.unref();
}
main().catch((error: unknown) => {
  console.error(
    error instanceof PaymentError
      ? error.code
      : "LOCAL_AGENT_SERVER_UNAVAILABLE",
  );
  process.exitCode = 1;
});
