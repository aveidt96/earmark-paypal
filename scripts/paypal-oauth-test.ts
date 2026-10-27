import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadPayPalEnvironment } from "./paypal-env";
import {
  paypalOAuthSettings,
  SANDBOX_BASE_URL,
} from "../web/src/server/paypal/config";
import {
  PaymentError,
  paypalMerchantSchema,
} from "../web/src/server/paypal/domain";

async function main() {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args[0] && args[0] !== "--all"))
    throw new PaymentError("INVALID_OAUTH_TEST_ARGUMENTS");
  const loaded = loadPayPalEnvironment();
  const settings = paypalOAuthSettings();
  if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0")
    throw new PaymentError("VERIFIED_HTTPS_REQUIRED");
  for (const key of Object.keys(process.env))
    if (
      key.startsWith("NEXT_PUBLIC_") &&
      process.env[key] &&
      (process.env[key]?.includes(settings.clientId) ||
        process.env[key]?.includes(settings.clientSecret))
    )
      throw new PaymentError("PUBLIC_PAYPAL_CREDENTIALS_FORBIDDEN");
  console.log(
    JSON.stringify({
      event: "PAYPAL_OAUTH_CONFIGURATION_VALIDATED",
      loadedFiles: loaded.files,
      endpoint: `${SANDBOX_BASE_URL}/v1/oauth2/token`,
      clientIdPresent: true,
      clientSecretPresent: true,
      merchantIdRequiredForOAuth: false,
      merchantIdPresent: !!process.env.PAYPAL_MERCHANT_ID?.trim(),
      merchantIdFormatValid: paypalMerchantSchema.safeParse(
        process.env.PAYPAL_MERCHANT_ID,
      ).success,
      webhookIdPresent: !!process.env.PAYPAL_WEBHOOK_ID?.trim(),
      paymentExecutionEnabled: false,
    }),
  );
  const all = args.includes("--all");
  const command = all ? process.env.npm_execpath : undefined;
  if (all && !command)
    throw new PaymentError("RUN_FULL_OAUTH_REGRESSION_VIA_NPM");
  const child = spawn(
    process.execPath,
    all
      ? [command as string, "test"]
      : ["node_modules/vitest/vitest.mjs", "run", "paypal-"],
    {
      cwd: fileURLToPath(new URL("../", import.meta.url)),
      stdio: "inherit",
      windowsHide: true,
      env: {
        ...process.env,
        PAYPAL_RUN_SANDBOX_TESTS: "true",
        PAYPAL_BACKEND_ENABLED: "false",
        PAYPAL_PAYMENTS_ENABLED: "false",
        PAYPAL_RUN_DATABASE_TESTS: "false",
        PAYPAL_RUN_NEON_DATABASE_TESTS: "false",
        PAYPAL_TEST_DATABASE_URL: "",
        EARMARK_TEST_DB_URL: "",
        NODE_DEBUG: "",
        NODE_DEBUG_NATIVE: "",
      },
    },
  );
  const code = await new Promise<number>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (status) => resolve(status ?? 1));
  });
  process.exitCode = code;
}
main().catch((error: unknown) => {
  console.error(
    error instanceof PaymentError
      ? error.code
      : "PAYPAL_OAUTH_TEST_UNAVAILABLE",
  );
  process.exitCode = 1;
});
