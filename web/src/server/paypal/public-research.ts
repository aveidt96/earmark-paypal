import "server-only";
import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { AgentError, createDatabase, type Pool } from "@flint/agent/server";
import { z } from "zod";
import { discoveryInstruction, discoverOffers } from "./offer-discovery";
import { PaymentError } from "./domain";

type Env = Record<string, string | undefined>;
const input = z.strictObject({
  instruction: z.string().trim().min(1).max(1000),
  budgetMinor: z.number().int().min(1).max(1000),
});
const MAX_BODY_BYTES = 4096;

const providerFailures = {
  TAVILY_AUTH_ERROR: "PUBLIC_RESEARCH_SEARCH_UNAVAILABLE",
  TAVILY_RATE_LIMITED: "PUBLIC_RESEARCH_SEARCH_UNAVAILABLE",
  TAVILY_API_ERROR: "PUBLIC_RESEARCH_SEARCH_UNAVAILABLE",
  TAVILY_INVALID_RESPONSE: "PUBLIC_RESEARCH_SEARCH_UNAVAILABLE",
  MODEL_AUTH_ERROR: "PUBLIC_RESEARCH_ANALYSIS_UNAVAILABLE",
  MODEL_RATE_LIMITED: "PUBLIC_RESEARCH_ANALYSIS_UNAVAILABLE",
  MODEL_API_ERROR: "PUBLIC_RESEARCH_ANALYSIS_UNAVAILABLE",
  MODEL_TRANSPORT_ERROR: "PUBLIC_RESEARCH_PROVIDER_UNAVAILABLE",
  DISCOVERY_MODEL_UNSUPPORTED: "PUBLIC_RESEARCH_ANALYSIS_UNAVAILABLE",
  DISCOVERY_REPORT_REQUIRED: "PUBLIC_RESEARCH_EVIDENCE_UNAVAILABLE",
  INVALID_MODEL_RESPONSE: "PUBLIC_RESEARCH_EVIDENCE_UNAVAILABLE",
  DISCOVERY_GROUNDING_REQUIRED: "PUBLIC_RESEARCH_NO_SOURCES",
  MODEL_TIMEOUT: "PUBLIC_RESEARCH_TIMEOUT",
} as const;

function profile(env: Env) {
  if (
    env.NEXT_PUBLIC_DEMO_ONLY !== "true" ||
    env.EARMARK_PUBLIC_DEMO_ONLY !== "true" ||
    env.EARMARK_PUBLIC_RESEARCH_ENABLED !== "true" ||
    env.EARMARK_ENABLE_TESTNET_EXECUTION === "true" ||
    env.PAYPAL_BACKEND_ENABLED === "true" ||
    env.PAYPAL_PAYMENTS_ENABLED === "true" ||
    env.NODE_TLS_REJECT_UNAUTHORIZED === "0" ||
    !env.EARMARK_RESEARCH_DATABASE_URL ||
    env.EARMARK_RESEARCH_DATABASE_URL === env.PAYPAL_DATABASE_URL ||
    !/^[a-f0-9]{64}$/i.test(env.EARMARK_RESEARCH_QUOTA_SECRET ?? "") ||
    !env.GEMINI_API_KEY ||
    !env.TAVILY_API_KEY
  )
    return null;
  try {
    const origin = new URL(env.EARMARK_PUBLIC_RESEARCH_ORIGIN ?? "");
    const hosted = env.VERCEL === "1";
    if (
      origin.origin !== env.EARMARK_PUBLIC_RESEARCH_ORIGIN ||
      (hosted
        ? origin.protocol !== "https:" || !!origin.port
        : origin.protocol !== "http:" || origin.hostname !== "127.0.0.1")
    )
      return null;
    return { origin, hosted };
  } catch {
    return null;
  }
}

let quotaPool: Pool | undefined;
async function reserveQuota(
  visitor: string,
  databaseUrl: string,
): Promise<boolean> {
  quotaPool ??= createDatabase(databaseUrl);
  return reservePublicResearchQuota(quotaPool, visitor);
}

export async function reservePublicResearchQuota(pool: Pool, visitor: string) {
  // PostgreSQL locks the UTC day's row and rechecks the WHERE condition
  // against the current row on conflict, including across function instances.
  const result = await pool.query(
    `INSERT INTO earmark_research.daily_quota AS q (day, used, visitors)
       VALUES ((statement_timestamp() AT TIME ZONE 'UTC')::date, 1,
               jsonb_build_object($1::text, 1))
     ON CONFLICT (day) DO UPDATE SET
       used = q.used + 1,
       visitors = jsonb_set(q.visitors, ARRAY[$1::text],
         to_jsonb(COALESCE((q.visitors->>$1::text)::integer, 0) + 1))
     WHERE q.used < 24 AND COALESCE((q.visitors->>$1::text)::integer, 0) < 3
     RETURNING 1`,
    [visitor],
  );
  return result.rowCount === 1;
}

function json(body: object, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

async function readInput(request: Request) {
  if (
    !request.headers
      .get("content-type")
      ?.match(/^application\/json(?:\s*;|$)/i) ||
    Number(request.headers.get("content-length")) > MAX_BODY_BYTES
  )
    throw new Error("INVALID_RESEARCH_REQUEST");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("INVALID_RESEARCH_REQUEST");
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    void reader.cancel().catch(() => {});
  }, 2000);
  try {
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let size = 0;
    let body = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) throw new Error("INVALID_RESEARCH_REQUEST");
      body += decoder.decode(value, { stream: true });
    }
    if (timedOut || request.signal.aborted)
      throw new Error("INVALID_RESEARCH_REQUEST");
    return input.parse(JSON.parse(body + decoder.decode()));
  } finally {
    clearTimeout(timer);
    void reader.cancel().catch(() => {});
  }
}

const safeInstructionErrors = new Set([
  "DISCOVERY_INSTRUCTION_REQUIRED",
  "DISCOVERY_PRIVATE_INPUT_REJECTED",
  "DISCOVERY_INSTRUCTION_REJECTED",
  "OUTBOUND_PAYLOAD_REJECTED",
]);

export async function handlePublicResearch(
  request: Request,
  env: Env = process.env,
  reserve = reserveQuota,
  discover = discoverOffers,
) {
  const config = profile(env);
  const hostMatches = config?.origin.host === request.headers.get("host");
  if (request.method === "GET")
    return json({ available: Boolean(config && hostMatches) });
  if (!config) return json({ error: "PUBLIC_RESEARCH_DISABLED" }, 404);
  if (!hostMatches || request.headers.get("origin") !== config.origin.origin)
    return json({ error: "PUBLIC_RESEARCH_ORIGIN_REQUIRED" }, 403);
  const ip = config.hosted
    ? (request.headers.get("x-vercel-forwarded-for") ?? "")
    : "127.0.0.1";
  const version = isIP(ip);
  if (!version)
    return json({ error: "PUBLIC_RESEARCH_CONTEXT_UNAVAILABLE" }, 503);

  let payload: z.infer<typeof input>;
  try {
    payload = await readInput(request);
    discoveryInstruction(
      payload.instruction,
      Object.entries(env)
        .filter(([name]) => /SECRET|TOKEN|PASSWORD|KEY|DATABASE_URL/.test(name))
        .map(([, value]) => value ?? ""),
    );
  } catch {
    return json({ error: "INVALID_RESEARCH_REQUEST" }, 400);
  }

  const address = version === 6 ? new URL(`http://[${ip}]`).hostname : ip;
  const visitor = createHmac("sha256", env.EARMARK_RESEARCH_QUOTA_SECRET ?? "")
    .update(new Date().toISOString().slice(0, 10))
    .update(address)
    .digest("hex");
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const admitted = await Promise.race([
      reserve(visitor, env.EARMARK_RESEARCH_DATABASE_URL ?? ""),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("QUOTA_TIMEOUT")), 3000);
      }),
    ]);
    if (!admitted) return json({ error: "PUBLIC_RESEARCH_LIMIT_REACHED" }, 429);
  } catch {
    console.warn("public-research: quota storage unavailable");
    return json({ error: "PUBLIC_RESEARCH_QUOTA_UNAVAILABLE" }, 503);
  } finally {
    clearTimeout(timer);
  }

  try {
    const discovery = await discover(
      payload.instruction,
      {
        ...env,
        EARMARK_OFFER_DISCOVERY_ENABLED: "true",
        EARMARK_GEMINI_ENABLED: "true",
        AI_ENABLE_NETWORK: "true",
        // Two searches and one extraction, 16 seconds each, within 60 seconds.
        AI_TIMEOUT_MS: "16000",
      },
      undefined,
      payload.budgetMinor,
    );
    return json({ discovery });
  } catch (error) {
    if (error instanceof PaymentError && safeInstructionErrors.has(error.code))
      return json({ error: "INVALID_RESEARCH_REQUEST" }, 400);
    const code =
      error instanceof PaymentError || error instanceof AgentError
        ? error.code
        : "";
    if (Object.hasOwn(providerFailures, code)) {
      const reason = providerFailures[code as keyof typeof providerFailures];
      console.warn("public-research:", code);
      return json(
        { error: reason },
        reason === "PUBLIC_RESEARCH_TIMEOUT" ? 504 : 502,
      );
    }
    console.warn("public-research: backend unavailable");
    return json({ error: "PUBLIC_RESEARCH_UNAVAILABLE" }, 502);
  }
}
