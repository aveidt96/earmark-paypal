import { isPublicDemoOnly } from "../../../../lib/paypal-agent";
import { handleAgentCheckout } from "../../../../server/paypal/agent-checkout-http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = (request: Request) =>
  isPublicDemoOnly()
    ? Response.json(
        { error: "PUBLIC_DEMO_ENDPOINT_DISABLED" },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      )
    : handleAgentCheckout(request);
export const POST = (request: Request) =>
  isPublicDemoOnly()
    ? Response.json(
        { error: "PUBLIC_DEMO_ENDPOINT_DISABLED" },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      )
    : handleAgentCheckout(request);
