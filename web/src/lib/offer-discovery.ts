/** Research evidence only. Never a checkout or merchant-approval payload. */
export type OfferBillingPeriod = "month" | "year" | "one-time";
export type OfferBillingModel =
  "subscription" | "prepaid-credits" | "usage-based";
export type ManualCheckoutDecision = "approved-manual" | "rejected";

export type OfferUnitPrice = {
  label: string;
  amount: string;
  currency: "USD" | "EUR" | "GBP";
  unit: string;
  sourceUrl: string;
};

export type VerifiedOfferPricingDetails = {
  billingModel: OfferBillingModel;
  modelName: string | null;
  region: string | null;
  currency: "USD" | "EUR" | "GBP" | null;
  unitPrices: OfferUnitPrice[];
  billingTerms: string | null;
  sourceUrl: string;
};

export type SearchSourceCategory = "pricing" | "docs" | "web";

export type PartialSearchSource = {
  title: string;
  url: string;
  snippet: string;
  category?: SearchSourceCategory | undefined;
  /** Set by the server after independent provider verification. */
  providerVerified?: true;
};

/** Small plain-text excerpts only; search markdown is never product copy. */
export function conciseResearchDescription(value: string): string {
  const plain = (value.split("|")[0] ?? "")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/<[^>]*>/g, "")
    .replace(/[|#*_`>]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!plain) return "";
  const sentences = plain.match(/[^.!?]+(?:[.!?]+|$)/g) ?? [plain];
  const short = sentences.slice(0, 2).join("").trim();
  return short.length <= 240 ? short : `${short.slice(0, 237).trimEnd()}…`;
}

export type IncompleteComparison = {
  instruction?: string;
  reason: "timeout" | "unavailable";
  sources: string[];
  results?: PartialSearchSource[] | undefined;
  retrievedAt?: string | undefined;
};

// A comparison limit only. Financial mandates use their own policy and amounts.
export const MAX_RESEARCH_BUDGET_MINOR = 10_000_000;

export function isResearchBudgetMinor(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 1 &&
    value <= MAX_RESEARCH_BUDGET_MINOR
  );
}

export function parseResearchBudget(input: string): number | null {
  const amount = /^(\d{1,6}|\d{1,3}(?:,\d{3}){1,2})(?:\.(\d{1,2}))?$/.exec(
    input.trim(),
  );
  if (!amount?.[1]) return null;
  const minor =
    Number(amount[1].replaceAll(",", "")) * 100 +
    Number((amount[2] ?? "").padEnd(2, "0"));
  return isResearchBudgetMinor(minor) ? minor : null;
}

export function formatResearchBudget(minor: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(minor / 100);
}

const SENSITIVE_QUERY_RE =
  /\b(?:token|key|secret|password|auth|session|order|capture|account)\b/i;
const REDIRECT_PARAM_RE =
  /^(?:redirect(?:_uri|_url)?|return(?:_to|_url|url)?|next|continue|url|dest(?:ination)?|goto|target|callback|out)$/i;

/** Validate citation URLs as public HTTPS pages without credentials, private hosts or open-redirect parameters. */
export function safeExternalOfferUrl(value: string): string | null {
  try {
    const u = new URL(value);
    const host = u.hostname.toLowerCase();
    if (
      u.protocol !== "https:" ||
      u.username ||
      u.password ||
      u.port ||
      u.hash ||
      host.startsWith("[") ||
      host.endsWith("]") ||
      host.includes(":") ||
      /^\d+(?:\.\d+)*$/.test(host) ||
      /\.\d+$/.test(host) ||
      !host.includes(".") ||
      !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+(?:[a-z]{2,}|xn--[a-z0-9-]{2,})$/.test(
        host,
      ) ||
      /(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(host) ||
      SENSITIVE_QUERY_RE.test(u.search)
    )
      return null;
    for (const [param, paramValue] of u.searchParams) {
      if (
        REDIRECT_PARAM_RE.test(param) ||
        /(?:^[a-z][a-z0-9+.-]*:|\/\/)/i.test(paramValue.trim())
      )
        return null;
    }
    return u.href;
  } catch {
    return null;
  }
}

/** A public checkout page must carry a plain, exact plan selector. */
export function safePlanCheckoutUrl(
  value: string,
  service: string,
): string | null {
  const safe = safeExternalOfferUrl(value);
  if (!safe) return null;
  const url = new URL(safe);
  const match = /^\/checkout(?:\/([a-z0-9-]+))?\/?$/i.exec(url.pathname);
  if (!match) return null;
  const params = [...url.searchParams];
  const selector = match[1] ?? params[0]?.[1];
  const plan = service
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .replace(/-(?:plan|tier|subscription)$/, "");
  if (
    !selector ||
    !plan ||
    selector.toLowerCase() !== plan ||
    /^(?:login|signup|session|confirm|complete|cancel|pay|capture|order)$/.test(
      plan,
    ) ||
    (match[1]
      ? params.length !== 0
      : params.length !== 1 || params[0]?.[0] !== "plan")
  )
    return null;
  return safe;
}

/** Select an existing cited, provenance-verified HTTPS merchant source URL; never invents checkout links. */
export function selectVerifiedOfferSourceUrl(
  offer: Pick<
    DiscoveredOffer,
    "sources" | "pricing" | "pricingDetails" | "paypalSourceUrl"
  >,
): string | null {
  const citedUrls: string[] = [];
  for (const source of offer.sources) {
    if (!source.cited) continue;
    const safe = safeExternalOfferUrl(source.url);
    if (safe && !citedUrls.includes(safe)) citedUrls.push(safe);
  }
  if (citedUrls.length === 0) return null;
  const pricingUrl = offer.pricing.sourceUrl
    ? safeExternalOfferUrl(offer.pricing.sourceUrl)
    : null;
  if (pricingUrl && citedUrls.includes(pricingUrl)) return pricingUrl;
  const detailsUrl = offer.pricingDetails?.sourceUrl
    ? safeExternalOfferUrl(offer.pricingDetails.sourceUrl)
    : null;
  if (detailsUrl && citedUrls.includes(detailsUrl)) return detailsUrl;
  const paypalUrl = offer.paypalSourceUrl
    ? safeExternalOfferUrl(offer.paypalSourceUrl)
    : null;
  const nonPaymentUrl = citedUrls.find((candidate) => candidate !== paypalUrl);
  return nonPaymentUrl ?? citedUrls[0] ?? null;
}

export interface DiscoveredOfficialProvider {
  id: string;
  provider: string;
  service?: string;
  domain: string;
  url: string;
  title: string;
  snippet: string;
  kind: "pricing" | "docs" | "official-site";
  pricingStatus: "source-matched" | "conflicting" | "unknown";
  billingModel: OfferBillingModel | "unknown";
  paypal: "claimed" | "unknown" | "not-listed";
  checkoutUrl: null;
  /** Independently retrieved identity references; never checkout evidence. */
  verificationSources?: string[];
}
export interface DiscoveredOffer {
  id: string;
  provider: string;
  service: string;
  priceMinor: string | null;
  currency: "USD" | "EUR" | "GBP" | null;
  billing: string | null;
  availability: string | null;
  delivery: string | null;
  slaMinutes: number | null;
  paypal: "claimed" | "unknown" | "not-listed";
  paypalEvidence: string | null;
  paypalSourceUrl?: string | null;
  sources: Array<{ url: string; cited: boolean }>;
  officialMerchantUrl?: string | null;
  officialCheckoutUrl?: string | null;
  providerVerification?: "corroborated" | "unverified";
  features?: Array<{ text: string; sourceUrl: string }>;
  billingEvidence?: { period: OfferBillingPeriod; sourceUrl: string } | null;
  pricingDetails?: VerifiedOfferPricingDetails | null;
  factStatus: "claimed" | "unknown";
  pricing: {
    status: "source-matched" | "conflicting" | "unknown";
    period: OfferBillingPeriod | null;
    sourceUrl: string | null;
  };
  reviewFit: "matches" | "needs-evidence" | "does-not-match";
  policy: { eligible: false; canonicalVerdict: string; reasons: string[] };
}
export interface OfferDiscoveryResult {
  source:
    | "LIVE_GEMINI_GROUNDED"
    | "LIVE_BRAVE_SEARCH"
    | "OFFLINE_SEARCH_FIXTURE";
  instruction: string;
  retrievedAt: string;
  targetMerchantDomain?: string;
  officialProviders?: DiscoveredOfficialProvider[];
  /** Relevant research links without independently corroborated identity. */
  providerCandidates?: DiscoveredOfficialProvider[];
  offers: DiscoveredOffer[];
  /** Index into offers for human review only. Never an authorized proposal. */
  reviewRecommendation: number | null;
  summary: string;
  searchSuggestions: string;
  evidence: {
    httpStatus: number;
    durationMs: number;
    modelTurns: 0 | 1 | 2;
    searchProvider?: "gemini-google-search" | "brave" | "hybrid";
    searchRequests?: 1 | 2 | 3 | 4 | 5 | 6;
    searchResultsCount?: number;
    paymentSearchResultsCount?: number;
    collectorModel?: string;
    collectedTool: "reportDiscoveredOffers" | null;
    citedSourceCount: number;
    outboundGuardPassed: true;
  };
  proposal: null;
  ownerAuthorized: false;
  persisted: false;
  fundsReserved: false;
}
