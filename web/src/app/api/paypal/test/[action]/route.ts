import { handleTestCheckout } from "../../../../../server/paypal/test-http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(
  request: Request,
  context: { params: Promise<{ action: string }> },
) {
  return handleTestCheckout(request, (await context.params).action);
}
