import { isPublicDemoOnly } from "../../../../../lib/paypal-agent";
import { handleAgentCheckout } from "../../../../../server/paypal/agent-checkout-http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(
  request: Request,
  context: { params: Promise<{ action: string }> },
) {
  if (isPublicDemoOnly()) {
    return Response.json(
      { error: "PUBLIC_DEMO_ENDPOINT_DISABLED" },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }
  return handleAgentCheckout(request, (await context.params).action);
}

// Session/CSRF discovery for chat does not load the durable checkout repository.
export async function GET(
  request: Request,
  context: { params: Promise<{ action: string }> },
) {
  if ((await context.params).action !== "chat")
    return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  return POST(request, context);
}
