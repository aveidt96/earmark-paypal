import { isPublicDemoOnly } from "../../../lib/paypal-agent";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    if (isPublicDemoOnly()) throw new Error("DEMO_EVIDENCE_UNAVAILABLE");
    const { readDemoEvidence } = await import("../../../server/security-demos");
    return Response.json(await readDemoEvidence(request), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json(
      { error: "DEMO_EVIDENCE_UNAVAILABLE" },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }
}
