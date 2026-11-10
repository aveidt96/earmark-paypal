/** Research evidence only. Never a checkout or merchant-approval payload. */
export type OfferBillingPeriod = "month" | "year" | "one-time";
export type ManualCheckoutDecision = "approved-manual" | "rejected";

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

/** Select an existing cited, provenance-verified HTTPS merchant source URL; never invents checkout links. */
export function selectVerifiedOfferSourceUrl(
  offer: Pick<DiscoveredOffer, "sources" | "pricing" | "paypalSourceUrl">,
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
  const paypalUrl = offer.paypalSourceUrl
    ? safeExternalOfferUrl(offer.paypalSourceUrl)
    : null;
  const nonPaymentUrl = citedUrls.find((candidate) => candidate !== paypalUrl);
  return nonPaymentUrl ?? citedUrls[0] ?? null;
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
    "LIVE_TAVILY_SEARCH" | "LIVE_GOOGLE_SEARCH" | "OFFLINE_SEARCH_FIXTURE";
  instruction: string;
  retrievedAt: string;
  targetMerchantDomain?: string;
  offers: DiscoveredOffer[];
  /** Index into offers for human review only. Never an authorized proposal. */
  reviewRecommendation: number | null;
  summary: string;
  searchSuggestions: string;
  evidence: {
    httpStatus: number;
    durationMs: number;
    modelTurns: 1 | 2;
    searchProvider?: "tavily";
    searchRequests?: 1 | 2;
    searchResultsCount?: number;
    paymentSearchResultsCount?: number;
    collectorModel?: string;
    collectedTool: "reportDiscoveredOffers";
    citedSourceCount: number;
    outboundGuardPassed: true;
  };
  proposal: null;
  ownerAuthorized: false;
  persisted: false;
  fundsReserved: false;
}
