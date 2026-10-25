import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
const root = "web/.next/static";
function files(path) {
  return readdirSync(path, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(path, e.name)) : [join(path, e.name)],
  );
}
const chunks = files(root).filter((f) => f.endsWith(".js"));
for (const file of chunks) {
  if (
    /AGENT_PRIVATE_KEY|SIM_DATAHUB_PRIVATE_KEY|SIM_WEATHERCO_PRIVATE_KEY|AI_API_KEY|GEMINI_API_KEY|DATABASE_URL|PAYPAL_CLIENT_SECRET|PAYPAL_WEBHOOK_ID|BEGIN (?:EC |RSA )?PRIVATE KEY/.test(
      readFileSync(file, "utf8"),
    )
  )
    throw new Error(`SERVER_SECRET_BOUNDARY_FAILED: ${file}`);
}
console.log(
  `Browser boundary passed: ${chunks.length} compiled JavaScript chunks contain no server credential variable names or private-key PEM material.`,
);
