import { fileURLToPath } from "node:url";
import { loadEnvConfig } from "@next/env";

/** Match Next.js loading from the web workspace, including $VARIABLE expansion. */
export function loadPayPalEnvironment() {
  let failed = false;
  const result = loadEnvConfig(
    fileURLToPath(new URL("../web/", import.meta.url)),
    process.env.NODE_ENV === "development",
    {
      info() {},
      error() {
        failed = true;
      },
    },
  );
  if (failed) throw new Error("PAYPAL_ENVIRONMENT_LOAD_FAILED");
  // Never expose loadedEnvFiles contents/combinedEnv: they contain credentials.
  return { files: result.loadedEnvFiles.map((file) => `web/${file.path}`) };
}
