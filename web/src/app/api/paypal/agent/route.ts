import { z } from "zod";
import {
  paypalAgentExecutionModes,
  paypalAgentScenarioIds,
} from "../../../../lib/paypal-agent";
import { evaluatePayPalAgentScenario } from "../../../../server/paypal/agent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.strictObject({
  scenarioId: z.enum(paypalAgentScenarioIds).default("normal"),
  mode: z.enum(paypalAgentExecutionModes).default("deterministic-policy"),
});

const rateBucket = new Map<string, { until: number; count: number }>();

function checkRateLimit(key: string, maxPerMinute: number): boolean {
  const now = Date.now();
  let bucket = rateBucket.get(key);
  if (!bucket || bucket.until <= now) {
    bucket = { until: now + 60_000, count: 0 };
    rateBucket.set(key, bucket);
  }
  bucket.count += 1;
  return bucket.count <= maxPerMinute;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const parsed = querySchema.safeParse({
      scenarioId: url.searchParams.get("scenarioId") ?? undefined,
      mode: url.searchParams.get("mode") ?? undefined,
    });
    if (!parsed.success) {
      return Response.json(
        { error: "INVALID_AGENT_SCENARIO_PARAMETERS" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }
    if (parsed.data.mode === "gemini")
      return Response.json(
        { error: "AUTHENTICATED_AGENT_WORKFLOW_REQUIRED" },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    if (!checkRateLimit("paypal-agent-sim", 120)) {
      return Response.json(
        { error: "RATE_LIMITED" },
        { status: 429, headers: { "Cache-Control": "no-store" } },
      );
    }
    const result = await evaluatePayPalAgentScenario({
      scenarioId: parsed.data.scenarioId,
      mode: parsed.data.mode,
      allowGracefulMissingCredentialsView: true,
    });
    return Response.json(result, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const code =
      error instanceof Error && /^[A-Z0-9_]+$/.test(error.message)
        ? error.message
        : "AGENT_EVALUATION_FAILED";
    return Response.json(
      { error: code },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export async function POST(request: Request) {
  try {
    if (!request.headers.get("content-type")?.startsWith("application/json")) {
      return Response.json(
        { error: "JSON_REQUIRED" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }
    const text = await request.text();
    if (text.length > 16_000) {
      return Response.json(
        { error: "REQUEST_TOO_LARGE" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }
    const raw = JSON.parse(text) as unknown;
    const parsed = querySchema.safeParse(raw);
    if (!parsed.success) {
      return Response.json(
        { error: "INVALID_AGENT_SCENARIO_PARAMETERS" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }
    if (parsed.data.mode === "gemini")
      return Response.json(
        { error: "AUTHENTICATED_AGENT_WORKFLOW_REQUIRED" },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    if (!checkRateLimit("paypal-agent-sim", 120)) {
      return Response.json(
        { error: "RATE_LIMITED" },
        { status: 429, headers: { "Cache-Control": "no-store" } },
      );
    }
    const result = await evaluatePayPalAgentScenario({
      scenarioId: parsed.data.scenarioId,
      mode: parsed.data.mode,
      allowGracefulMissingCredentialsView: true,
    });
    return Response.json(result, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const code =
      error instanceof Error && /^[A-Z0-9_]+$/.test(error.message)
        ? error.message
        : "AGENT_EVALUATION_FAILED";
    return Response.json(
      { error: code },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}
