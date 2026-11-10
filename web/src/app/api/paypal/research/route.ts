import { handlePublicResearch } from "../../../../server/paypal/public-research";

export const runtime = "nodejs";
export const maxDuration = 60;

export function GET(request: Request) {
  return handlePublicResearch(request);
}

export function POST(request: Request) {
  return handlePublicResearch(request);
}
