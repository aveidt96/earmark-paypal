import { isPublicDemoOnly } from "../../../../lib/paypal-agent";
import { handlePayPalWebhook } from "../../../../server/paypal/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function POST(request: Request) {
  if (isPublicDemoOnly()) {
    return Response.json(
      { error: "PUBLIC_DEMO_ENDPOINT_DISABLED" },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }
  return handlePayPalWebhook(request);
}
