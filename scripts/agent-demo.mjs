import { runLocalDemo } from "../agent/dist/local/demo.js";
import { AgentError } from "../agent/dist/errors.js";
import { join } from "node:path";
try {
  await runLocalDemo(
    process.env,
    join(process.cwd(), ".tools/stage-5-demo-evidence.json"),
  );
} catch (error) {
  process.stderr.write(
    `${error instanceof AgentError ? error.code : "DEMO_FAILED"}\n`,
  );
  process.exitCode = 1;
}
