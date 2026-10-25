import { startApplication } from "./start-workspace.mjs";
import { join } from "node:path";
if (
  process.env.EARMARK_ENABLE_TESTNET_EXECUTION !== "false" ||
  !process.env.GEMINI_API_KEY
)
  throw new Error("SECURE_READ_ONLY_ENVIRONMENT_REQUIRED");
const app = await startApplication({
  port: 3117,
  production: true,
  readOnlyGemini: true,
  geminiEnabled: true,
  ownerFile: true,
});
console.log(
  `Earmark Live Gemini console: ${app.origin}\nLocal owner: ${app.ownerWallet.account.address}\nImport only the fresh local owner file into a development wallet: ${join(app.state, "local-owner.key")}\nLocal Anvil bootstrap only; Gemini sessions cannot sign or broadcast. Never import a production owner key here.`,
);
let closing = false;
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    if (!closing) {
      closing = true;
      void app.close().then(() => process.exit(0));
    }
  });
