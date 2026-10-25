import { readDemoEvidence } from "../../../server/security-demos";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
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
