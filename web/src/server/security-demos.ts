import "server-only";
import { isAbsolute } from "node:path";
import { open } from "node:fs/promises";
import { demoSuiteSchema } from "@flint/agent/demos";
/** Read-only, explicitly enabled local evidence. No signing or scenario-control API. */
export async function readDemoEvidence(
  request: Request,
  path = process.env.EARMARK_DEMO_STATE_PATH,
) {
  const host = new URL(request.url).hostname;
  if (
    !["localhost", "127.0.0.1", "[::1]"].includes(host) ||
    !path ||
    !isAbsolute(path)
  )
    throw new Error("DEMO_VIEWER_DISABLED");
  const handle = await open(path, "r");
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > 2_000_000)
      throw new Error("INVALID_DEMO_EVIDENCE");
    return demoSuiteSchema.parse(JSON.parse(await handle.readFile("utf8")));
  } finally {
    await handle.close();
  }
}
