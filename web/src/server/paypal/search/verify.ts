import "server-only";
import {
  safePlanCheckoutUrl,
  type DiscoveredOffer,
  type DiscoveredOfficialProvider,
  type OfferBillingPeriod,
} from "../../../lib/offer-discovery";
import type { RawExtractedOffer } from "./grounding";
import { rootDomain, safePublicMerchantUrl, sanitizePlainText } from "./guard";
import type { FetchedMerchantPage } from "./page-fetch";

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Deterministically verify that the claimed price & currency appear in the source text. */
export function verifyPriceInSource(
  priceMinor: string | null,
  currency: "USD" | "EUR" | "GBP" | null,
  sourceText: string,
): boolean {
  if (!priceMinor || !currency || !sourceText) return false;
  const minor = Number(priceMinor);
  if (!Number.isInteger(minor) || minor < 0) return false;

  const whole = Math.floor(minor / 100);
  const cents = minor % 100;
  const formattedWhole = whole.toLocaleString("en-US");
  const centsStr = String(cents).padStart(2, "0");

  const amountPatterns = [
    `${escapeRegex(String(whole))}\\.${centsStr}`,
    `${escapeRegex(formattedWhole)}\\.${centsStr}`,
  ];
  if (cents === 0) {
    amountPatterns.push(escapeRegex(String(whole)));
    if (formattedWhole !== String(whole)) {
      amountPatterns.push(escapeRegex(formattedWhole));
    }
  }
  const amountGroup = `(?:${amountPatterns.join("|")})(?!\\d|\\.[0-9])`;

  const symbolMap: Record<"USD" | "EUR" | "GBP", string> = {
    USD: "(?:US\\$|\\$|USD\\s*\\$?)",
    EUR: "(?:€|EUR\\s*€?)",
    GBP: "(?:£|GBP\\s*£?)",
  };
  const prefixRe = new RegExp(`${symbolMap[currency]}\\s*${amountGroup}`, "i");
  const suffixRe = new RegExp(`(?<!\\d)${amountGroup}\\s*${currency}\\b`, "i");
  return prefixRe.test(sourceText) || suffixRe.test(sourceText);
}

type BillingKind = "month" | "year" | "one-time" | "usage-based" | "prepaid";

const PERIOD_PATTERNS: Record<BillingKind, RegExp> = {
  month:
    /\/\s*mo(?:nth)?\.?\b|\b(?:per\s+mo(?:nth)?\.?|monthly|each\s+month|billed\s+monthly)\b/i,
  year:
    /\/\s*(?:yr|year)\.?\b|\b(?:per\s+(?:yr|year)\.?|yearly|annual(?:ly)?|billed\s+annually)\b/i,
  "one-time": /\b(?:one[- ]time|single\s+payment|lifetime|buy\s+now)\b/i,
  "usage-based":
    /\b(?:pay[- ]as[- ]you[- ]go|usage[- ]based|per\s+(?:1[mk]|1,000,000|million|thousand)\s+tokens?|metered)\b/i,
  prepaid: /\b(?:prepaid|credit\s+(?:pack|package|balance|top[- ]?up))\b/i,
};

function isFixedBillingPeriod(
  value: BillingKind | null,
): value is OfferBillingPeriod {
  return value === "month" || value === "year" || value === "one-time";
}

export function verifyPayPalInSource(
  claimed: "claimed" | "unknown" | "not-listed",
  sourceText: string,
): { paypal: "claimed" | "unknown" | "not-listed"; evidence: string | null } {
  if (!sourceText) return { paypal: "unknown", evidence: null };
  const sentences = sourceText
    .split(/[\n.!?]+/)
    .map((line) => line.trim())
    .filter(Boolean);
  for (const sentence of sentences) {
    if (!/\bpaypal\b/i.test(sentence)) continue;
    if (
      /\b(?:no|not|never|don't|do not|unsupported|coming soon|refunds?|logo|badge)\b/i.test(
        sentence,
      )
    ) {
      return { paypal: "unknown", evidence: null };
    }
    if (
      /\b(?:accept(?:s|ed|ing)?|support(?:s|ed|ing)?|pay\s+(?:with|via|using)|payment\s+methods?|checkout|billing|visa|mastercard|credit\s+cards?|debit\s+cards?)\b/i.test(
        sentence,
      )
    ) {
      return {
        paypal: "claimed",
        evidence: sanitizePlainText(sentence, 200),
      };
    }
  }
  if (claimed === "not-listed") {
    const completeList = sentences.find((sentence) =>
      /\b(?:we\s+(?:only\s+)?accept|accepted\s+payment\s+methods)\b/i.test(
        sentence,
      ),
    );
    if (completeList && !/\bpaypal\b/i.test(completeList)) {
      return {
        paypal: "not-listed",
        evidence: sanitizePlainText(completeList, 200),
      };
    }
  }
  return { paypal: "unknown", evidence: null };
}

export function buildVerifiedOffers(input: {
  rawOffers: readonly RawExtractedOffer[];
  pages: readonly FetchedMerchantPage[];
  budgetMinor: number;
}): {
  offers: DiscoveredOffer[];
  reviewRecommendation: number | null;
  citedCount: number;
} {
  const pageByUrl = new Map(input.pages.map((page) => [page.url, page]));
  const offers: DiscoveredOffer[] = [];
  const citedUrls = new Set<string>();

  for (const raw of input.rawOffers) {
    const validPages: FetchedMerchantPage[] = [];
    const seenPageUrls = new Set<string>();
    for (const url of raw.sourceUrls) {
      const safe = safePublicMerchantUrl(url);
      if (!safe || seenPageUrls.has(safe)) continue;
      const page = pageByUrl.get(safe);
      if (!page) continue;
      seenPageUrls.add(safe);
      validPages.push(page);
    }
    const primaryPage = validPages[0];
    if (!primaryPage) continue;
    const combinedText = validPages.map((page) => page.text).join("\n");
    const priceVerified = verifyPriceInSource(
      raw.priceMinor,
      raw.currency,
      combinedText,
    );
    const verifiedPriceMinor = priceVerified ? raw.priceMinor : null;
    const verifiedCurrency = priceVerified ? raw.currency : null;

    const verifiedBilling: BillingKind | null =
      raw.billingPeriod && PERIOD_PATTERNS[raw.billingPeriod].test(combinedText)
        ? raw.billingPeriod
        : null;
    let verifiedPeriod: OfferBillingPeriod | null = null;
    if (isFixedBillingPeriod(verifiedBilling)) {
      verifiedPeriod = verifiedBilling;
    }

    const paypalCheck = verifyPayPalInSource(raw.paypal, combinedText);
    const sources = validPages.map((page) => {
      citedUrls.add(page.url);
      return { url: page.url, cited: true };
    });

    const checkoutUrl = safePlanCheckoutUrl(primaryPage.url, raw.service);
    const features = raw.features
      .map((text) => sanitizePlainText(text, 140))
      .filter(Boolean)
      .slice(0, 4)
      .map((text) => ({ text, sourceUrl: primaryPage.url }));

    let reviewFit: DiscoveredOffer["reviewFit"] = "needs-evidence";
    if (verifiedPriceMinor !== null && verifiedCurrency === "USD") {
      reviewFit =
        Number(verifiedPriceMinor) <= input.budgetMinor
          ? "matches"
          : "does-not-match";
    }

    offers.push({
      id: `offer-${offers.length + 1}`,
      provider: sanitizePlainText(raw.provider, 80),
      service: sanitizePlainText(raw.service, 120),
      priceMinor: verifiedPriceMinor,
      currency: verifiedCurrency,
      billing: verifiedBilling,
      availability: raw.availability
        ? sanitizePlainText(raw.availability, 120)
        : null,
      delivery: raw.delivery ? sanitizePlainText(raw.delivery, 120) : null,
      slaMinutes: raw.slaMinutes,
      paypal: paypalCheck.paypal,
      paypalEvidence: paypalCheck.evidence,
      paypalSourceUrl: paypalCheck.evidence ? primaryPage.url : null,
      sources,
      officialMerchantUrl: primaryPage.url,
      officialCheckoutUrl: checkoutUrl,
      providerVerification: primaryPage.fetchedLive
        ? "corroborated"
        : "unverified",
      features,
      billingEvidence: verifiedPeriod
        ? { period: verifiedPeriod, sourceUrl: primaryPage.url }
        : null,
      pricingDetails: null,
      factStatus: priceVerified ? "claimed" : "unknown",
      pricing: {
        status: priceVerified ? "source-matched" : "unknown",
        period: verifiedPeriod,
        sourceUrl: primaryPage.url,
      },
      reviewFit,
      policy: {
        eligible: false,
        canonicalVerdict: "EXTERNAL_MERCHANT_UNBOUND",
        reasons: [
          "External merchants require an approved merchant binding before payment.",
        ],
      },
    });
  }

  let reviewRecommendation: number | null = null;
  let bestPrice = Number.POSITIVE_INFINITY;
  for (let index = 0; index < offers.length; index += 1) {
    const offer = offers[index];
    if (
      offer &&
      offer.reviewFit === "matches" &&
      offer.priceMinor !== null &&
      Number(offer.priceMinor) < bestPrice
    ) {
      bestPrice = Number(offer.priceMinor);
      reviewRecommendation = index;
    }
  }

  return { offers, reviewRecommendation, citedCount: citedUrls.size };
}

export function buildProviderLinks(
  pages: readonly FetchedMerchantPage[],
): DiscoveredOfficialProvider[] {
  const seen = new Set<string>();
  const out: DiscoveredOfficialProvider[] = [];
  for (const page of pages) {
    const domain = rootDomain(new URL(page.url).hostname);
    if (seen.has(domain)) continue;
    seen.add(domain);
    const stem = domain.split(".")[0] ?? domain;
    const provider = `${stem[0]?.toUpperCase() ?? ""}${stem.slice(1)}`;
    out.push({
      id: `provider-${out.length + 1}-${domain.replace(/[^a-z0-9]/gi, "-")}`,
      provider,
      service: page.title,
      domain,
      url: page.url,
      title: page.title,
      snippet: "",
      kind: /pricing|plans?|billing/i.test(page.url)
        ? "pricing"
        : /docs?|api|developers?/i.test(page.url)
          ? "docs"
          : "official-site",
      pricingStatus: "unknown",
      billingModel: "unknown",
      paypal: "unknown",
      checkoutUrl: null,
    });
  }
  return out;
}
