import { handlePayPalWebhook } from "../../../../server/paypal/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function POST(request: Request) {
  return handlePayPalWebhook(request);
}
