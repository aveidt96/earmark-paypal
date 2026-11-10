import { isPublicDemoOnly } from "../../../../lib/paypal-agent";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const limits = new Map<string, { until: number; count: number }>();
function allow(action: string) {
  const key = action === "gemini-read" ? "gemini-read" : "gemini-write";
  const now = Date.now();
  let bucket = limits.get(key);
  if (!bucket || bucket.until <= now) {
    bucket = { until: now + 60000, count: 0 };
    limits.set(key, bucket);
  }
  return ++bucket.count <= (key === "gemini-read" ? 120 : 12);
}
export async function POST(
  request: Request,
  { params }: { params: Promise<{ action: string }> },
) {
  if (isPublicDemoOnly()) {
    return Response.json(
      { error: "PUBLIC_DEMO_READ_ONLY" },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }
  try {
    const { action } = await params;
    const { forwardApi } = await import("../../../../server/api-proxy");
    const response = await forwardApi(request, action);
    if (response) return response;
    const { getService, readBody } = await import("../../../../server/runtime");
    const body = await readBody(request);
    if (
      ["challenge", "launch"].includes(action) &&
      process.env.EARMARK_ENABLE_TESTNET_EXECUTION === "false"
    )
      throw new Error("TESTNET_EXECUTION_NOT_ENABLED");
    if (action.startsWith("gemini-") && !allow(action))
      return Response.json({ error: "RATE_LIMITED" }, { status: 429 });
    const service = getService();
    const result =
      action === "gemini-challenge"
        ? await service.gemini.challenge(body)
        : action === "gemini-start"
          ? await service.gemini.start(body)
          : action === "gemini-read"
            ? await service.gemini.view(body)
            : action === "gemini-cancel"
              ? await service.gemini.cancel(body)
              : action === "challenge"
                ? await service.challenge(body)
                : action === "launch"
                  ? await service.launch(body)
                  : action === "register"
                    ? await service.register(body)
                    : null;
    if (!result)
      return Response.json({ error: "UNKNOWN_ACTION" }, { status: 404 });
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const code =
      error instanceof Error && /^[A-Z0-9_]+$/.test(error.message)
        ? error.message
        : "REQUEST_REJECTED";
    return Response.json(
      { error: code },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}
