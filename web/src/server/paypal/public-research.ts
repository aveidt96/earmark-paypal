import "server-only";
import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { AgentError, createDatabase, type Pool } from "@flint/agent/server";
import { z } from "zod";
import {
  isResearchBudgetMinor,
  type IncompleteComparison,
} from "../../lib/offer-discovery";
import {
  discoveryInstruction,
  discoverOffers,
  type PartialComparisonContext,
  type ResearchStageFailure,
} from "./offer-discovery";
import { PaymentError } from "./domain";
import { isRelevantPurchasingSource } from "../../lib/research-relevance";

type Env = Record<string, string | undefined>;
const input = z.strictObject({
  instruction: z.string().trim().min(1).max(1000),
  budgetMinor: z.number().refine(isResearchBudgetMinor),
});
const MAX_BODY_BYTES = 4096;
const QUOTA_TIMEOUT_MS = 8000;
// Keep this in sync with the CHECK constraint in docs/public-research-quota.sql.
const MAX_DAILY_RESEARCH_REQUESTS = 120;
// Leave 5 seconds of the 60-second route for local evaluation and the response.
const PUBLIC_RESEARCH_DEADLINE_MS = 55000;
const stageTimeouts = {
  grounded_search: "PUBLIC_RESEARCH_SEARCH_TIMEOUT",
  offer_search: "PUBLIC_RESEARCH_SEARCH_TIMEOUT",
  page_fetch: "PUBLIC_RESEARCH_SEARCH_TIMEOUT",
  offer_analysis: "PUBLIC_RESEARCH_ANALYSIS_TIMEOUT",
} as const;

type QuotaAttempt = {
  phase: "connection" | "query";
  signal: AbortSignal;
  day: string;
  limits: { perVisitor: number; global: number };
};

const quotaPostgresErrors = {
  "08000": "connection_failed",
  "08001": "connection_failed",
  "08003": "connection_failed",
  "08004": "connection_failed",
  "08006": "connection_failed",
  "08P01": "connection_failed",
  "28000": "authentication_failed",
  "28P01": "authentication_failed",
  "3D000": "database_missing",
  "3F000": "schema_or_table_missing",
  "42501": "permission_denied",
  "42P01": "schema_or_table_missing",
  "53300": "connection_failed",
  "57014": "query_timeout_or_cancelled",
  "57P01": "connection_failed",
  "57P03": "connection_failed",
  "22P02": "query_failed",
  "23514": "query_failed",
  "40001": "query_failed",
  "40P01": "query_failed",
  "42601": "query_failed",
  "42703": "query_failed",
  "55P03": "query_failed",
} as const;

function quotaFailure(error: unknown, attempt: QuotaAttempt) {
  const code =
    error && typeof error === "object" && "code" in error
      ? error.code
      : undefined;
  const message = error instanceof Error ? error.message : "";
  if (attempt.signal.aborted || code === "ETIMEDOUT")
    return { classification: `${attempt.phase}_timeout` };
  if (typeof code === "string" && Object.hasOwn(quotaPostgresErrors, code))
    return {
      classification:
        quotaPostgresErrors[code as keyof typeof quotaPostgresErrors],
      pgCode: code,
    };
  switch (message) {
    case "INVALID_DATABASE_CONFIGURATION":
      return { classification: "invalid_database_url" };
    case "DIRECT_NEON_DATABASE_REQUIRED":
      return { classification: "direct_neon_url_required" };
    case "UNSUPPORTED_DATABASE_OPTION":
      return { classification: "unsupported_database_url_option" };
    case "timeout exceeded when trying to connect":
    case "Connection terminated due to connection timeout":
      return { classification: "connection_timeout" };
    case "Query read timeout":
      return { classification: "query_timeout" };
    case "Connection terminated":
    case "Connection terminated unexpectedly":
      return { classification: "connection_failed" };
    default:
      return {
        classification:
          code === "ECONNRESET" || code === "EPIPE"
            ? "connection_failed"
            : `${attempt.phase}_failed`,
      };
  }
}

const providerFailures = {
  BRAVE_AUTH_ERROR: "PUBLIC_RESEARCH_SEARCH_UNAVAILABLE",
  BRAVE_RATE_LIMITED: "PUBLIC_RESEARCH_SEARCH_UNAVAILABLE",
  BRAVE_API_ERROR: "PUBLIC_RESEARCH_SEARCH_UNAVAILABLE",
  BRAVE_INVALID_RESPONSE: "PUBLIC_RESEARCH_SEARCH_UNAVAILABLE",
  MODEL_AUTH_ERROR: "PUBLIC_RESEARCH_ANALYSIS_UNAVAILABLE",
  MODEL_RATE_LIMITED: "PUBLIC_RESEARCH_ANALYSIS_UNAVAILABLE",
  MODEL_API_ERROR: "PUBLIC_RESEARCH_ANALYSIS_UNAVAILABLE",
  MODEL_TRANSPORT_ERROR: "PUBLIC_RESEARCH_PROVIDER_UNAVAILABLE",
  DISCOVERY_MODEL_UNSUPPORTED: "PUBLIC_RESEARCH_ANALYSIS_UNAVAILABLE",
  DISCOVERY_REPORT_REQUIRED: "PUBLIC_RESEARCH_EVIDENCE_UNAVAILABLE",
  INVALID_MODEL_RESPONSE: "PUBLIC_RESEARCH_EVIDENCE_UNAVAILABLE",
  DISCOVERY_GROUNDING_REQUIRED: "PUBLIC_RESEARCH_NO_SOURCES",
  DISCOVERY_RELEVANT_SOURCES_REQUIRED: "PUBLIC_RESEARCH_NO_RELEVANT_SOURCES",
  DISCOVERY_REGIONAL_PROVIDERS_UNVERIFIED:
    "PUBLIC_RESEARCH_NO_VERIFIED_REGIONAL_PROVIDERS",
  DISCOVERY_OFFICIAL_PROVIDERS_UNVERIFIED:
    "PUBLIC_RESEARCH_NO_VERIFIED_OFFICIAL_PROVIDERS",
  MODEL_TIMEOUT: "PUBLIC_RESEARCH_TIMEOUT",
} as const;

function configurationFailure(error: string, ...prerequisites: string[]) {
  return { error, prerequisites } as const;
}

function dailyQuotaLimit(value: string | undefined, fallback: number) {
  if (value === undefined) return fallback;
  const count = Number(value);
  return Number.isInteger(count) &&
    count >= 1 &&
    count <= MAX_DAILY_RESEARCH_REQUESTS &&
    String(count) === value
    ? count
    : null;
}

function profile(env: Env) {
  if (env.EARMARK_PUBLIC_RESEARCH_ENABLED !== "true")
    return configurationFailure(
      "PUBLIC_RESEARCH_NOT_ENABLED",
      "EARMARK_PUBLIC_RESEARCH_ENABLED",
    );
  const profileFlags = [
    ...["NEXT_PUBLIC_DEMO_ONLY", "EARMARK_PUBLIC_DEMO_ONLY"].filter(
      (name) => env[name] !== "true",
    ),
    ...[
      "EARMARK_ENABLE_TESTNET_EXECUTION",
      "PAYPAL_BACKEND_ENABLED",
      "PAYPAL_PAYMENTS_ENABLED",
    ].filter((name) => env[name] === "true"),
  ];
  if (env.NODE_TLS_REJECT_UNAUTHORIZED === "0")
    profileFlags.push("NODE_TLS_REJECT_UNAUTHORIZED");
  if (profileFlags.length)
    return configurationFailure(
      "PUBLIC_RESEARCH_PROFILE_BLOCKED",
      ...profileFlags,
    );

  const quotaSettings: string[] = [];
  if (
    !env.EARMARK_RESEARCH_DATABASE_URL?.trim() ||
    env.EARMARK_RESEARCH_DATABASE_URL === env.PAYPAL_DATABASE_URL
  )
    quotaSettings.push("EARMARK_RESEARCH_DATABASE_URL");
  if (!/^[a-f0-9]{64}$/i.test(env.EARMARK_RESEARCH_QUOTA_SECRET ?? ""))
    quotaSettings.push("EARMARK_RESEARCH_QUOTA_SECRET");
  const perVisitor = dailyQuotaLimit(
    env.EARMARK_RESEARCH_VISITOR_DAILY_LIMIT,
    3,
  );
  const global = dailyQuotaLimit(env.EARMARK_RESEARCH_GLOBAL_DAILY_LIMIT, 24);
  if (perVisitor === null)
    quotaSettings.push("EARMARK_RESEARCH_VISITOR_DAILY_LIMIT");
  if (global === null)
    quotaSettings.push("EARMARK_RESEARCH_GLOBAL_DAILY_LIMIT");
  if (perVisitor === null || global === null || quotaSettings.length)
    return configurationFailure(
      "PUBLIC_RESEARCH_QUOTA_NOT_CONFIGURED",
      ...quotaSettings,
    );

  const providerSettings = ["GEMINI_API_KEY"].filter(
    (name) => !env[name]?.trim(),
  );
  if (providerSettings.length)
    return configurationFailure(
      "PUBLIC_RESEARCH_PROVIDERS_NOT_CONFIGURED",
      ...providerSettings,
    );

  try {
    const origin = new URL(env.EARMARK_PUBLIC_RESEARCH_ORIGIN ?? "");
    const hosted = env.VERCEL === "1";
    if (
      !hosted &&
      origin.origin === env.EARMARK_PUBLIC_RESEARCH_ORIGIN &&
      origin.protocol === "https:" &&
      !origin.port
    )
      return configurationFailure(
        "PUBLIC_RESEARCH_RUNTIME_NOT_CONFIGURED",
        "VERCEL",
      );
    if (
      origin.origin !== env.EARMARK_PUBLIC_RESEARCH_ORIGIN ||
      (hosted
        ? origin.protocol !== "https:" || !!origin.port
        : origin.protocol !== "http:" || origin.hostname !== "127.0.0.1")
    )
      return configurationFailure(
        "PUBLIC_RESEARCH_ORIGIN_NOT_CONFIGURED",
        "EARMARK_PUBLIC_RESEARCH_ORIGIN",
      );
    return { origin, hosted, limits: { perVisitor, global } };
  } catch {
    return configurationFailure(
      "PUBLIC_RESEARCH_ORIGIN_NOT_CONFIGURED",
      "EARMARK_PUBLIC_RESEARCH_ORIGIN",
    );
  }
}

let quotaPool: Pool | undefined;
async function reserveQuota(
  visitor: string,
  databaseUrl: string,
  attempt: QuotaAttempt,
): Promise<boolean> {
  quotaPool ??= createDatabase(databaseUrl);
  return reservePublicResearchQuota(quotaPool, visitor, attempt);
}

export async function reservePublicResearchQuota(
  pool: Pick<Pool, "connect">,
  visitor: string,
  attempt: QuotaAttempt,
) {
  // PostgreSQL locks the day's row and rechecks both limits on conflict.
  return queryQuota(
    pool,
    attempt,
    `INSERT INTO earmark_research.daily_quota AS q (day, used, visitors)
     VALUES ($4::date, 1, jsonb_build_object($1::text, 1))
     ON CONFLICT (day) DO UPDATE SET
       used = q.used + 1,
       visitors = jsonb_set(q.visitors, ARRAY[$1::text],
         to_jsonb(COALESCE((q.visitors->>$1::text)::integer, 0) + 1))
     WHERE q.used < $2::integer
       AND COALESCE((q.visitors->>$1::text)::integer, 0) < $3::integer
     RETURNING 1`,
    [visitor, attempt.limits.global, attempt.limits.perVisitor, attempt.day],
  );
}

async function refundQuota(visitor: string, attempt: QuotaAttempt) {
  if (!quotaPool) throw new Error("QUOTA_POOL_UNAVAILABLE");
  return refundPublicResearchVisitorQuota(quotaPool, visitor, attempt);
}

export async function refundPublicResearchVisitorQuota(
  pool: Pick<Pool, "connect">,
  visitor: string,
  attempt: QuotaAttempt,
) {
  // Keep the site-wide admission count as the hard cap on provider work.
  return queryQuota(
    pool,
    attempt,
    `UPDATE earmark_research.daily_quota AS q
     SET visitors = jsonb_set(q.visitors, ARRAY[$1::text],
         to_jsonb((q.visitors->>$1::text)::integer - 1))
     WHERE q.day = $2::date
       AND COALESCE((q.visitors->>$1::text)::integer, 0) > 0
     RETURNING 1`,
    [visitor, attempt.day],
  );
}

async function queryQuota(
  pool: Pick<Pool, "connect">,
  attempt: QuotaAttempt,
  statement: string,
  parameters: Array<string | number>,
) {
  const client = await pool.connect();
  const { signal } = attempt;
  if (signal.aborted) {
    client.release();
    throw signal.reason;
  }
  attempt.phase = "query";
  const discardClient = () => client.release(true);
  // pg rejects the active query and emits a client error on socket loss.
  const handleClientError = () => {};
  client.on("error", handleClientError);
  signal.addEventListener("abort", discardClient, { once: true });
  let queryFailed = true;
  try {
    const result = await client.query(statement, parameters);
    queryFailed = false;
    return result.rowCount === 1;
  } finally {
    signal.removeEventListener("abort", discardClient);
    if (!signal.aborted) client.release(queryFailed);
    client.off("error", handleClientError);
  }
}

async function runQuotaOperation(
  window: Pick<QuotaAttempt, "day" | "limits">,
  work: (attempt: QuotaAttempt) => Promise<boolean>,
  logMessage: string,
  timeoutMs = QUOTA_TIMEOUT_MS,
) {
  const started = performance.now();
  const deadline = new AbortController();
  const attempt: QuotaAttempt = {
    ...window,
    phase: "connection",
    signal: deadline.signal,
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work(attempt),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          const error = new Error("QUOTA_TIMEOUT");
          reject(error);
          deadline.abort(error);
        }, timeoutMs);
      }),
    ]);
  } catch (error) {
    console.warn(logMessage, {
      ...quotaFailure(error, attempt),
      elapsedMs: Math.round(performance.now() - started),
    });
    return null;
  } finally {
    clearTimeout(timer);
  }
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
  refund = refundQuota,
) {
  const deadlineAt = performance.now() + PUBLIC_RESEARCH_DEADLINE_MS;
  const config = profile(env);
  if ("error" in config) {
    if (request.method === "GET") return json({ available: false });
    console.warn(
      "public-research: configuration",
      config.error,
      config.prerequisites,
    );
    return json({ error: config.error }, 404);
  }
  const hostMatches = config.origin.host === request.headers.get("host");
  if (request.method === "GET") return json({ available: hostMatches });
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
  } catch (error) {
    if (
      error instanceof z.ZodError &&
      error.issues.every((issue) => issue.path[0] === "budgetMinor")
    )
      return json({ error: "INVALID_RESEARCH_BUDGET" }, 400);
    return json({ error: "INVALID_RESEARCH_REQUEST" }, 400);
  }

  const address = version === 6 ? new URL(`http://[${ip}]`).hostname : ip;
  const window = {
    day: new Date().toISOString().slice(0, 10),
    limits: config.limits,
  };
  const visitor = createHmac("sha256", env.EARMARK_RESEARCH_QUOTA_SECRET ?? "")
    .update(window.day)
    .update(address)
    .digest("hex");
  const admitted = await runQuotaOperation(
    window,
    (attempt) =>
      reserve(visitor, env.EARMARK_RESEARCH_DATABASE_URL ?? "", attempt),
    "public-research: quota storage unavailable",
  );
  if (admitted === null)
    return json({ error: "PUBLIC_RESEARCH_QUOTA_UNAVAILABLE" }, 503);
  if (!admitted) return json({ error: "PUBLIC_RESEARCH_LIMIT_REACHED" }, 429);

  const provider: {
    failure?: ResearchStageFailure;
    comparison?: PartialComparisonContext | undefined;
  } = {};
  try {
    const discovery = await discover(
      payload.instruction,
      {
        ...env,
        EARMARK_OFFER_DISCOVERY_ENABLED: "true",
        EARMARK_GEMINI_ENABLED: "true",
        AI_ENABLE_NETWORK: "true",
      },
      undefined,
      payload.budgetMinor,
      {
        deadlineAt,
        onPlan(info) {
          console.info("public-research: planned search queries", info);
        },
        onRetrievalSummary(info) {
          console.info("public-research: retrieval summary", info);
        },
        onEvidenceGap(counts) {
          console.info(
            "public-research: official provider evidence gap",
            counts,
          );
        },
        onFailure(failure, comparisonContext) {
          provider.failure = failure;
          provider.comparison = comparisonContext;
          console.warn("public-research: provider stage failed", failure);
        },
        onComparisonRetry(info) {
          console.info("public-research: retrying offer comparison", info);
        },
        onComparisonFallback(info) {
          console.info(
            "public-research: falling back for offer comparison",
            info,
          );
        },
      },
    );
    return json({ discovery });
  } catch (error) {
    if (error instanceof PaymentError && safeInstructionErrors.has(error.code))
      return json({ error: "INVALID_RESEARCH_REQUEST" }, 400);
    const failure = provider.failure;
    const timedOut =
      failure?.classification === "deadline_exhausted" ||
      failure?.classification === "local_timeout" ||
      failure?.classification === "upstream_timeout";
    const comparisonUnavailable =
      failure?.stage === "offer_analysis" && failure.httpStatus === 503;
    const recoverablePartialComparison =
      failure?.stage === "offer_analysis" &&
      (timedOut ||
        comparisonUnavailable ||
        failure.classification === "transport" ||
        failure.classification === "invalid_response" ||
        (failure.classification === "upstream_http" &&
          failure.httpStatus !== 429 &&
          failure.httpStatus !== 401 &&
          failure.httpStatus !== 403));
    if (comparisonUnavailable) {
      const timeLeft = Math.floor(deadlineAt - performance.now());
      if (timeLeft > 0)
        await runQuotaOperation(
          window,
          (attempt) => refund(visitor, attempt),
          "public-research: quota refund unavailable",
          Math.min(QUOTA_TIMEOUT_MS, timeLeft),
        );
    }
    if (recoverablePartialComparison && provider.comparison) {
      const results = provider.comparison.results.filter((source) =>
        isRelevantPurchasingSource(source, payload.instruction),
      );
      const incompleteComparison: IncompleteComparison = {
        instruction: payload.instruction,
        reason: timedOut ? "timeout" : "unavailable",
        sources: results.map((source) => source.url),
        results,
        retrievedAt: provider.comparison.retrievedAt,
      };
      return json({ incompleteComparison });
    }
    if (failure && timedOut)
      return json({ error: stageTimeouts[failure.stage] }, 504);
    const code =
      error instanceof PaymentError || error instanceof AgentError
        ? error.code
        : "";
    if (Object.hasOwn(providerFailures, code)) {
      const reason = providerFailures[code as keyof typeof providerFailures];
      if (!failure) console.warn("public-research:", code);
      return json(
        { error: reason },
        reason === "PUBLIC_RESEARCH_TIMEOUT" ? 504 : 502,
      );
    }
    if (!failure) console.warn("public-research: backend unavailable");
    return json({ error: "PUBLIC_RESEARCH_UNAVAILABLE" }, 502);
  }
}
