import { handleTestCheckout } from "../../../../server/paypal/test-http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET(request: Request) {
  return handleTestCheckout(request);
}
