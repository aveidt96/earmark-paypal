import "server-only";
import { AgentError } from "@flint/agent/server";
import type {
  OfferDiscoveryResult,
  PartialSearchSource,
} from "../../lib/offer-discovery";
import { PaymentError } from "./domain";
import {
  BRAVE_SEARCH_URL,
  runBraveFallbackSearch,
  runGeminiGroundedDiscovery,
  runGeminiStructuredExtraction,
  type DiscoveredCandidate,
} from "./search/grounding";
import {
  DEFAULT_FALLBACK_MODEL,
  DEFAULT_GEMINI_MODEL,
  GEMINI_3_MODEL_PATTERN,
  LOCAL_DISCOVERY_BUDGET_MINOR,
  assertDiscoveryBudget,
  collectForbiddenSecrets,
  discoveryInstruction,
  resolveFallbackModel,
  rootDomain,
} from "./search/guard";
import { fetchMerchantPages } from "./search/page-fetch";
import { buildProviderLinks, buildVerifiedOffers } from "./search/verify";

export { BRAVE_SEARCH_URL, discoveryInstruction };

const STAGE_LIMITS = {
  grounded_search: 18000,
  offer_search: 12000,
  page_fetch: 8000,
  offer_analysis: 22000,
} as const;

export type ResearchStageFailure = {
  stage: keyof typeof STAGE_LIMITS;
  classification:
    | "deadline_exhausted"
    | "local_timeout"
    | "upstream_timeout"
    | "authentication"
    | "rate_limit"
    | "transport"
    | "invalid_response"
    | "upstream_http"
    | "rejected_or_internal";
  elapsedMs: number;
  timeoutMs: number;
  httpStatus: number | null;
};

export type PartialComparisonContext = {
  sources: string[];
  results: PartialSearchSource[];
  retrievedAt: string;
};

export type PublicResearchTiming = {
  deadlineAt: number;
  onPlan?: (info: {
    plannerUsed: boolean;
    queryCount: number;
    elapsedMs: number;
    fallbackReason?: string;
  }) => void;
  onRetrievalSummary?: (info: {
    rawResults: number;
    relevantResults: number;
    verifiedProviders: number;
    candidateProviders: number;
    searchRequests: number;
  }) => void;
  onEvidenceGap?: (counts: {
    initialResults: number;
    followupResults: number;
    relevantPages: number;
    visibleResearchLinks: number;
    searchRequests: number;
  }) => void;
  onFailure: (
    failure: ResearchStageFailure,
    comparisonContext?: PartialComparisonContext,
  ) => void;
  onComparisonRetry?: (info: {
    model: string;
    attempt: number;
    delayMs: number;
    httpStatus: number;
    remainingMs: number;
  }) => void;
  onComparisonFallback?: (info: {
    fromModel: string;
    toModel: string;
    reason: ResearchStageFailure["classification"];
    httpStatus: number | null;
    remainingMs: number;
  }) => void;
};

function classifyFailure(
  error: unknown,
): ResearchStageFailure["classification"] {
  const code =
    error instanceof PaymentError || error instanceof AgentError
      ? error.code
      : "";
  if (code === "MODEL_TIMEOUT") return "local_timeout";
  if (code === "MODEL_AUTH_ERROR" || code === "BRAVE_AUTH_ERROR")
    return "authentication";
  if (code === "MODEL_RATE_LIMITED" || code === "BRAVE_RATE_LIMITED")
    return "rate_limit";
  if (code === "MODEL_TRANSPORT_ERROR") return "transport";
  if (code === "INVALID_MODEL_RESPONSE" || code === "BRAVE_INVALID_RESPONSE")
    return "invalid_response";
  if (code === "MODEL_API_ERROR" || code === "BRAVE_API_ERROR")
    return "upstream_http";
  return "rejected_or_internal";
}

function stageTimeoutMs(
  stage: keyof typeof STAGE_LIMITS,
  fallbackTimeout: number,
  timing?: PublicResearchTiming,
): number {
  const cap = STAGE_LIMITS[stage];
  if (!timing) return Math.min(fallbackTimeout, cap);
  const remaining = Math.floor(timing.deadlineAt - performance.now());
  return Math.max(0, Math.min(cap, remaining));
}

export async function discoverOffers(
  instruction: string,
  env: Record<string, string | undefined>,
  fetcher?: typeof fetch,
  budgetMinor = LOCAL_DISCOVERY_BUDGET_MINOR,
  timing?: PublicResearchTiming,
): Promise<OfferDiscoveryResult> {
  assertDiscoveryBudget(budgetMinor);
  const forbidden = collectForbiddenSecrets(env);
  discoveryInstruction(instruction, forbidden);

  const geminiKey = env.GEMINI_API_KEY?.trim() ?? "";
  const braveKey = env.BRAVE_SEARCH_API_KEY?.trim() ?? "";
  if (
    env.EARMARK_OFFER_DISCOVERY_ENABLED !== "true" ||
    env.EARMARK_GEMINI_ENABLED !== "true" ||
    env.AI_ENABLE_NETWORK !== "true" ||
    !geminiKey
  )
    throw new PaymentError("DISCOVERY_DISABLED");

  const model =
    env.GEMINI_COLLECTOR_MODEL ?? env.GEMINI_MODEL ?? DEFAULT_GEMINI_MODEL;
  if (!GEMINI_3_MODEL_PATTERN.test(model))
    throw new PaymentError("DISCOVERY_MODEL_UNSUPPORTED");

  const fallbackModel = resolveFallbackModel(
    model,
    env.GEMINI_COLLECTOR_FALLBACK_MODEL,
    Boolean(timing) || model !== DEFAULT_FALLBACK_MODEL,
  );
  const timeout = Number(env.AI_TIMEOUT_MS ?? "60000");
  if (
    !timing &&
    (!Number.isInteger(timeout) || timeout < 10000 || timeout > 60000)
  )
    throw new PaymentError("INVALID_MODEL_TIMEOUT");

  const started = Date.now();
  const retrievedAt = new Date().toISOString();
  const mode = (env.EARMARK_SEARCH_GROUNDING_MODE ?? "hybrid").toLowerCase();

  let httpStatus = 200;
  let usedGeminiSearch = false;
  let usedBraveSearch = false;
  let candidates: DiscoveredCandidate[] = [];
  let fallbackReason: ResearchStageFailure["classification"] | undefined;

  // Stage 1: Hybrid discovery (Gemini native google_search, with Brave fallback)
  if (mode !== "brave") {
    const t0 = performance.now();
    const limit = stageTimeoutMs("grounded_search", timeout, timing);
    try {
      if (!limit) throw new AgentError("MODEL_TIMEOUT");
      const discovered = await runGeminiGroundedDiscovery({
        instruction,
        budgetMinor,
        apiKey: geminiKey,
        model,
        timeoutMs: limit,
        ...(fetcher ? { fetcher } : {}),
      });
      httpStatus = discovered.status;
      candidates = discovered.candidates;
      usedGeminiSearch = true;
    } catch (error) {
      fallbackReason = classifyFailure(error);
      if (!braveKey) {
        timing?.onFailure({
          stage: "grounded_search",
          classification: limit ? fallbackReason : "deadline_exhausted",
          elapsedMs: Math.round(performance.now() - t0),
          timeoutMs: limit,
          httpStatus: null,
        });
        throw error;
      }
    }
  }

  if (!candidates.length && braveKey) {
    const t0 = performance.now();
    const limit = stageTimeoutMs("offer_search", timeout, timing);
    try {
      if (!limit) throw new AgentError("MODEL_TIMEOUT");
      const brave = await runBraveFallbackSearch({
        instruction,
        apiKey: braveKey,
        timeoutMs: limit,
        ...(fetcher ? { fetcher } : {}),
      });
      httpStatus = brave.status;
      candidates = brave.candidates;
      usedBraveSearch = true;
    } catch (error) {
      timing?.onFailure({
        stage: "offer_search",
        classification: limit ? classifyFailure(error) : "deadline_exhausted",
        elapsedMs: Math.round(performance.now() - t0),
        timeoutMs: limit,
        httpStatus: null,
      });
      throw error;
    }
  }

  timing?.onPlan?.({
    plannerUsed: usedGeminiSearch,
    queryCount: usedGeminiSearch && usedBraveSearch ? 2 : 1,
    elapsedMs: Date.now() - started,
    ...(fallbackReason ? { fallbackReason } : {}),
  });

  if (!candidates.length)
    throw new PaymentError("DISCOVERY_GROUNDING_REQUIRED");

  // Stage 2: SSRF-safe direct fetch of top merchant pricing pages
  const fetchLimit = stageTimeoutMs("page_fetch", timeout, timing);
  const pages = await fetchMerchantPages(candidates, fetchLimit, fetcher);
  if (!pages.length) throw new PaymentError("DISCOVERY_GROUNDING_REQUIRED");

  const partialContext: PartialComparisonContext = {
    sources: pages.map((page) => page.url),
    results: pages.map((page) => ({
      title: page.title,
      url: page.url,
      snippet: page.text.slice(0, 280),
      category: /pricing|plans?|billing/i.test(page.url)
        ? "pricing"
        : /docs?|api|developers?/i.test(page.url)
          ? "docs"
          : "web",
      ...(page.fetchedLive ? { providerVerified: true as const } : {}),
    })),
    retrievedAt,
  };

  // Stage 3: Single structured extraction + deterministic price/PayPal/budget verification
  const analysisStart = performance.now();
  const analysisLimit = stageTimeoutMs("offer_analysis", timeout, timing);
  let extracted: Awaited<ReturnType<typeof runGeminiStructuredExtraction>>;
  try {
    if (!analysisLimit) throw new AgentError("MODEL_TIMEOUT");
    extracted = await runGeminiStructuredExtraction({
      instruction,
      budgetMinor,
      pages,
      apiKey: geminiKey,
      model,
      fallbackModel,
      timeoutMs: analysisLimit,
      ...(fetcher ? { fetcher } : {}),
    });
    httpStatus = extracted.status;
  } catch (error) {
    timing?.onFailure(
      {
        stage: "offer_analysis",
        classification: analysisLimit
          ? classifyFailure(error)
          : "deadline_exhausted",
        elapsedMs: Math.round(performance.now() - analysisStart),
        timeoutMs: analysisLimit,
        httpStatus: null,
      },
      partialContext,
    );
    throw error;
  }

  const verified = buildVerifiedOffers({
    rawOffers: extracted.offers,
    pages,
    budgetMinor,
  });
  const providerLinks = buildProviderLinks(pages);
  const firstOfferUrl = verified.offers[0]?.sources[0]?.url;
  const targetMerchantDomain = firstOfferUrl
    ? rootDomain(new URL(firstOfferUrl).hostname)
    : undefined;

  const searchProvider =
    usedGeminiSearch && usedBraveSearch
      ? "hybrid"
      : usedGeminiSearch
        ? "gemini-google-search"
        : "brave";

  timing?.onRetrievalSummary?.({
    rawResults: candidates.length,
    relevantResults: pages.length,
    verifiedProviders: pages.filter((page) => page.fetchedLive).length,
    candidateProviders: providerLinks.length,
    searchRequests: usedGeminiSearch && usedBraveSearch ? 2 : 1,
  });

  return {
    source: fetcher
      ? "OFFLINE_SEARCH_FIXTURE"
      : usedGeminiSearch
        ? "LIVE_GEMINI_GROUNDED"
        : "LIVE_BRAVE_SEARCH",
    instruction,
    retrievedAt,
    ...(targetMerchantDomain ? { targetMerchantDomain } : {}),
    officialProviders: verified.offers.length ? [] : providerLinks,
    providerCandidates: [],
    offers: verified.offers,
    reviewRecommendation: verified.reviewRecommendation,
    summary: verified.offers.length
      ? "Compare retrieved public offers for review. External merchants need a separate approved merchant binding before Earmark can consider payment."
      : "Retrieved merchant pricing pages are listed below. Confirm current pricing and terms directly on the merchant site.",
    searchSuggestions: "",
    evidence: {
      httpStatus,
      durationMs: Date.now() - started,
      modelTurns: usedGeminiSearch ? 2 : 1,
      searchProvider,
      searchRequests: usedGeminiSearch && usedBraveSearch ? 2 : 1,
      searchResultsCount: pages.length,
      paymentSearchResultsCount: 0,
      collectorModel: extracted.modelUsed,
      collectedTool: "reportDiscoveredOffers",
      citedSourceCount: verified.citedCount,
      outboundGuardPassed: true,
    },
    proposal: null,
    ownerAuthorized: false,
    persisted: false,
    fundsReserved: false,
  };
}
