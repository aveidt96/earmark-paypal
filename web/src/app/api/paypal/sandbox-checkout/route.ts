import { handleSandboxCheckout } from "../../../../server/paypal/sandbox-checkout";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleSandboxCheckout(request);
}

export async function POST(request: Request) {
  return handleSandboxCheckout(request);
}
