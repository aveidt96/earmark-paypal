import { resolve } from "node:path";
import { runSecurityDemos } from "../agent/dist/local/security-demo.js";
import { writeEvidence } from "./demo-tools.mjs";
const path = resolve("demo/earmark-demo-evidence.json");
const suite = await runSecurityDemos({
  onUpdate: (value) => writeEvidence(path, value),
});
console.log(
  "Earmark local scenarios passed: " +
    suite.scenarios.map((s) => s.label + " = " + s.status).join("; "),
);
console.log(
  "Public evidence: " +
    path +
    ". Local Anvil, mock USDC, deterministic mock. No live Qwen.",
);
