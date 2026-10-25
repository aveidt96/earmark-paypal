import { paypalPreparationStatus } from "../../../../server/paypal-config";

export const dynamic = "force-dynamic";

/** Read-only preparation status; no OAuth, order creation or payment requests. */
export function GET() {
  try {
    return Response.json(paypalPreparationStatus(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json(
      { error: "INVALID_PAYPAL_PREPARATION_CONFIGURATION" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
