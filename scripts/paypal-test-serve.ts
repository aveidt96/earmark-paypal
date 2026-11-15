import { privateCheckoutOrigin } from "../web/src/lib/private-checkout-profile";
import { randomBytes, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  openSync,
  closeSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { createDatabase } from "@flint/agent/server";
import { loadPayPalEnvironment } from "./paypal-env";
import {
  approvedPayPalTarget,
  approvedMigrationChecksum,
  verifyPayPalConnection,
} from "./paypal-db-safety";
import { paypalOAuthSettings } from "../web/src/server/paypal/config";
import {
  parse,
  paypalMerchantSchema,
  PaymentError,
} from "../web/src/server/paypal/domain";
import {
  merchantBinding,
  testCheckoutConfig,
} from "../web/src/server/paypal/test-config";

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--stop-us") {
    const saved = JSON.parse(
      readFileSync(
        new URL("../.tools/paypal-us-server.json", import.meta.url),
        "utf8",
      ),
    ) as { pid: number; origin: string; epoch: string };
    if (
      saved.origin !== "http://127.0.0.1:3031" ||
      !Number.isInteger(saved.pid) ||
      !/^[a-f0-9]{64}$/.test(saved.epoch)
    )
      throw new PaymentError("OWNED_US_SERVER_REQUIRED");
    const response = await fetch(`${saved.origin}/api/paypal/test`, {
      signal: AbortSignal.timeout(10000),
      redirect: "error",
    });
    if (
      response.status !== 401 ||
      response.headers.get("x-earmark-test-epoch") !== saved.epoch
    )
      throw new PaymentError("OWNED_US_SERVER_IDENTITY_MISMATCH");
    process.kill(saved.pid, "SIGTERM");
    console.log(
      JSON.stringify({
        status: "OWNED_US_SERVER_STOPPED",
        financialRecordsChanged: false,
      }),
    );
    return;
  }
  if (
    args.some(
      (arg) =>
        ![
          "--confirm-merchant",
          "--detach",
          "--us-prepare",
          "--us-order-once",
          "--us-capture-once",
        ].includes(arg),
    )
  )
    throw new PaymentError("INVALID_TEST_SERVER_ARGUMENTS");
  loadPayPalEnvironment();
  const privateOrigin = privateCheckoutOrigin();
  if (privateOrigin && process.argv.some((arg) => arg.startsWith("--us-")))
    throw new PaymentError("PRIVATE_CHECKOUT_FRESH_CAMPAIGN_REQUIRED");
  const buildPath = new URL(
    "../web/.next/required-server-files.json",
    import.meta.url,
  );
  if (!existsSync(buildPath))
    throw new PaymentError("PRODUCTION_BUILD_REQUIRED");
  const built = JSON.parse(readFileSync(buildPath, "utf8")) as {
    config?: { env?: { EARMARK_PRIVATE_CHECKOUT_BUILD?: string } };
  };
  if (
    (built.config?.env?.EARMARK_PRIVATE_CHECKOUT_BUILD === "true") !==
    Boolean(privateOrigin)
  )
    throw new PaymentError("CHECKOUT_BUILD_PROFILE_MISMATCH");
  const oauth = paypalOAuthSettings(),
    merchant = parse(paypalMerchantSchema, process.env.PAYPAL_MERCHANT_ID);
  const target = approvedPayPalTarget(),
    pool = createDatabase(target.toString());
  try {
    const client = await pool.connect();
    client.on("error", () => {});
    try {
      await client.query("BEGIN READ ONLY");
      await verifyPayPalConnection(client, target);
      const row = await client.query(
        "SELECT environment,version FROM earmark_paypal.environment WHERE singleton=true",
      );
      const history = await client.query(
        "SELECT version,checksum FROM earmark_paypal.schema_migrations",
      );
      if (
        row.rows[0]?.environment !== "sandbox" ||
        row.rows[0]?.version !== 1 ||
        history.rows.length !== 1 ||
        history.rows[0]?.version !== 1 ||
        history.rows[0]?.checksum !== approvedMigrationChecksum
      )
        throw new PaymentError("PAYPAL_DATABASE_BINDING_MISMATCH");
    } finally {
      await client.query("ROLLBACK").catch(() => {});
      client.release();
    }
  } finally {
    await pool.end();
  }
  const oneOrder = args.includes("--us-order-once");
  const oneCapture = args.includes("--us-capture-once");
  if (oneOrder && oneCapture)
    throw new PaymentError("CONFLICTING_PAYMENT_PERMISSIONS");
  const us = args.includes("--us-prepare") || oneOrder || oneCapture;
  const port = us ? 3031 : 3030;
  const listenerOrigin = `http://127.0.0.1:${port}`;
  const origin = privateOrigin ?? listenerOrigin;
  if (!existsSync(new URL("../web/.next/BUILD_ID", import.meta.url)))
    throw new PaymentError("PRODUCTION_BUILD_REQUIRED");
  const probe = createServer();
  await new Promise<void>((resolve, reject) => {
    probe.once("error", () =>
      reject(new PaymentError("TEST_PORT_3030_IN_USE")),
    );
    probe.listen(port, "127.0.0.1", resolve);
  });
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  const directory = new URL("../.tools/", import.meta.url),
    authPath = new URL("paypal-test-auth.json", directory);
  mkdirSync(directory, { recursive: true });
  let auth: {
    version: number;
    ownerId: string;
    loginSecret: string;
    sessionSecret: string;
    merchantBinding: string;
  };
  if (existsSync(authPath))
    auth = JSON.parse(readFileSync(authPath, "utf8")) as typeof auth;
  else {
    if (us) throw new PaymentError("PRESERVED_OWNER_IDENTITY_REQUIRED");
    if (!args.includes("--confirm-merchant"))
      throw new PaymentError("SANDBOX_SELLER_CONFIRMATION_REQUIRED");
    auth = {
      version: 1,
      ownerId: `paypal-test-owner-${randomUUID().replaceAll("-", "")}`,
      loginSecret: randomBytes(32).toString("base64url"),
      sessionSecret: randomBytes(64).toString("base64url"),
      merchantBinding: merchantBinding(oauth.clientId, merchant),
    };
    writeFileSync(authPath, JSON.stringify(auth, null, 2) + "\n", {
      flag: "wx",
      mode: 0o600,
    });
  }
  let binding = auth.merchantBinding;
  if (us) {
    const profile = JSON.parse(
      readFileSync(new URL("paypal-us-profile.json", directory), "utf8"),
    ) as {
      campaign: string;
      ownerId: string;
      appMerchantBinding: string;
      dashboardSellerConfirmed: boolean;
    };
    if (
      profile.campaign !== "us-v1" ||
      profile.ownerId !== auth.ownerId ||
      profile.dashboardSellerConfirmed !== true ||
      profile.appMerchantBinding !==
        merchantBinding(oauth.clientId, merchant) ||
      profile.appMerchantBinding === auth.merchantBinding
    )
      throw new PaymentError("US_SELLER_PROFILE_BINDING_REQUIRED");
    binding = profile.appMerchantBinding;
  }
  if (
    auth.version !== 1 ||
    binding !== merchantBinding(oauth.clientId, merchant)
  )
    throw new PaymentError("TEST_MERCHANT_BINDING_MISMATCH");
  if (oneOrder) {
    const permission = JSON.parse(
      readFileSync(new URL("paypal-us-order-baseline.json", directory), "utf8"),
    ) as {
      ownerId: string;
      appMerchantBinding: string;
      buyerSeparateConfirmed: boolean;
      attemptId: string;
    };
    if (
      permission.ownerId !== auth.ownerId ||
      permission.appMerchantBinding !== binding ||
      permission.buyerSeparateConfirmed !== true ||
      permission.attemptId !== "422ae62d-cd25-425f-9fdb-ce50ad6f0ffa"
    )
      throw new PaymentError("US_ONE_SHOT_BASELINE_REQUIRED");
  }
  if (oneCapture) {
    const permission = JSON.parse(
      readFileSync(
        new URL("paypal-us-capture-baseline.json", directory),
        "utf8",
      ),
    ) as {
      ownerId: string;
      appMerchantBinding: string;
      mandateId: string;
      attemptId: string;
      orderId: string;
      amountMinor: string;
      currency: string;
      captureRequestId: string;
    };
    const buyer = JSON.parse(
      readFileSync(new URL("paypal-us-order-baseline.json", directory), "utf8"),
    ) as { buyerSeparateConfirmed: boolean };
    if (
      permission.ownerId !== auth.ownerId ||
      permission.appMerchantBinding !== binding ||
      permission.mandateId !== "889b9c4a-b875-5de9-a354-18a037d41f52" ||
      permission.attemptId !== "422ae62d-cd25-425f-9fdb-ce50ad6f0ffa" ||
      permission.orderId !== "72936380818559054" ||
      permission.amountMinor !== "600" ||
      permission.currency !== "USD" ||
      !/^[a-f0-9-]{36}$/i.test(permission.captureRequestId) ||
      buyer.buyerSeparateConfirmed !== true
    )
      throw new PaymentError("US_CAPTURE_BASELINE_REQUIRED");
  }
  const epoch = randomBytes(32).toString("hex");
  const env = {
    ...process.env,
    PAYPAL_TEST_CHECKOUT_ENABLED: "true",
    PAYPAL_BACKEND_ENABLED: "true",
    PAYPAL_PAYMENTS_ENABLED: us ? "false" : "true",
    PAYPAL_TEST_CAMPAIGN: us ? "us-v1" : "legacy",
    PAYPAL_TEST_US_SELLER_CONFIRMED: us ? "true" : "false",
    PAYPAL_TEST_US_ORDER_ONCE: oneOrder ? "task03e-existing-us-attempt" : "",
    PAYPAL_TEST_US_CAPTURE_ONCE: oneCapture
      ? "task03g-existing-approved-order"
      : "",
    PAYPAL_TEST_US_BUYER_SEPARATE: oneOrder || oneCapture ? "true" : "false",
    PAYPAL_TEST_ORIGIN: origin,
    PAYPAL_TEST_OWNER_ID: auth.ownerId,
    PAYPAL_TEST_LOGIN_SECRET: auth.loginSecret,
    PAYPAL_TEST_SESSION_SECRET: auth.sessionSecret,
    PAYPAL_TEST_SESSION_EPOCH: epoch,
    PAYPAL_TEST_MERCHANT_BINDING: binding,
    EARMARK_ENABLE_TESTNET_EXECUTION: "false",
    AGENT_MODEL_PROVIDER: "mock",
    AGENT_MODEL_MODE: "mock",
    AI_ENABLE_NETWORK: "false",
    NODE_DEBUG: "",
    NODE_DEBUG_NATIVE: "",
  };
  testCheckoutConfig(env); // Validate before launching or enabling any route.
  const detached = args.includes("--detach"),
    log = detached
      ? openSync(
          new URL(
            us ? "paypal-us-server.log" : "paypal-test-server.log",
            directory,
          ),
          "a",
          0o600,
        )
      : undefined;
  const child = spawn(
    process.execPath,
    [
      "../node_modules/next/dist/bin/next",
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(port),
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
  let readiness:
    { status: number; epochMatches: boolean; error: string | null } | undefined;
  for (;;) {
    if (child.exitCode !== null || Date.now() > deadline) {
      child.kill();
      throw new PaymentError("TEST_SERVER_START_FAILED");
    }
    try {
      const response = await fetch(`${listenerOrigin}/api/paypal/test`, {
        headers: { Host: new URL(origin).host },
        redirect: "error",
        signal: AbortSignal.timeout(5000),
      });
      const info = (await response.json().catch(() => ({}))) as {
        error?: unknown;
      };
      readiness = {
        status: response.status,
        epochMatches: response.headers.get("x-earmark-test-epoch") === epoch,
        error:
          typeof info.error === "string" && /^[A-Z_]+$/.test(info.error)
            ? info.error
            : null,
      };
      if (
        response.status === 401 &&
        response.headers.get("x-earmark-test-epoch") === epoch
      )
        break;
      if (readiness.error && [403, 409, 503].includes(response.status)) {
        child.kill();
        console.error(
          JSON.stringify({
            event: "TEST_SERVER_READINESS_FAILED",
            ...readiness,
          }),
        );
        throw new PaymentError("TEST_SERVER_START_FAILED");
      }
    } catch {
      /* Bounded loopback readiness. */
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  writeFileSync(
    new URL(
      us ? "paypal-us-server.json" : "paypal-test-server.json",
      directory,
    ),
    JSON.stringify(
      {
        pid: child.pid,
        origin,
        epoch,
        campaign: us ? "us-v1" : "legacy",
        preparationOnly: us,
        orderOnlyAuthorization: oneOrder,
        captureOnlyAuthorization: oneCapture,
        createdAt: new Date().toISOString(),
      },
      null,
      2,
    ) + "\n",
    { mode: 0o600 },
  );
  console.log(
    JSON.stringify({
      status: "CONTROLLED_SANDBOX_CHECKOUT_READY",
      url: `${origin}/paypal-test`,
      authFile: ".tools/paypal-test-auth.json",
      logFile: detached
        ? us
          ? ".tools/paypal-us-server.log"
          : ".tools/paypal-test-server.log"
        : null,
      mandateUsd: "10.00",
      purchaseUsd: "6.00",
      buyerApprovalRequired: true,
      preparationOnly: us,
      orderOnlyAuthorization: oneOrder,
      captureOnlyAuthorization: oneCapture,
      paymentExecutionEnabled: !us,
      automaticBuyerApproval: false,
      webhookIdFabricated: false,
    }),
  );
  if (detached) child.unref();
}
main().catch((error: unknown) => {
  console.error(
    error instanceof PaymentError
      ? error.code
      : "PAYPAL_TEST_SERVER_UNAVAILABLE",
  );
  process.exitCode = 1;
});
