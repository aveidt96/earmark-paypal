import { isPublicDemoOnly } from "../../../lib/paypal-agent";
import { forwardApi } from "../../../server/api-proxy";
import { getSnapshot } from "../../../server/runtime";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  if (isPublicDemoOnly()) {
    return Response.json(
      {
        configured: false,
        chainTime: 0,
        model: "mock",
        geminiAvailable: false,
        mandates: [],
        payments: [],
        runs: [],
        events: [],
        error: "PUBLIC_DEMO_READ_ONLY",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
  try {
    const response = await forwardApi(request);
    if (response) return response;
  } catch {
    return Response.json(
      { error: "BACKEND_WAKING_OR_UNAVAILABLE" },
      { status: 503 },
    );
  }
  return Response.json(await getSnapshot(), {
    headers: { "Cache-Control": "no-store" },
  });
}
