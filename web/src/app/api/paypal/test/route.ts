import { isPublicDemoOnly } from "../../../../lib/paypal-agent";
import { handleTestCheckout } from "../../../../server/paypal/test-http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET(request: Request) {
  if (isPublicDemoOnly()) {
    return Response.json(
      { error: "PUBLIC_DEMO_ENDPOINT_DISABLED" },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }
  return handleTestCheckout(request);
}
