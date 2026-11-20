import "server-only";
import { isIP } from "node:net";
import { z } from "zod";
import {
  isResearchBudgetMinor,
  safeExternalOfferUrl,
} from "../../../lib/offer-discovery";
import { assertNoSensitiveMaterialInAgentPayload } from "../agent";
import { PaymentError } from "../domain";

export const GEMINI_3_MODEL_PATTERN = /^gemini-3(?:\.[0-9]+)?-[a-z0-9-]+$/;
export const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash" as const;
export const DEFAULT_FALLBACK_MODEL = "gemini-3.5-flash-lite" as const;
export const LOCAL_DISCOVERY_BUDGET_MINOR = 1000;

const THIRD_PARTY_HOSTS = new Set([
  "reddit.com",
  "medium.com",
  "dev.to",
  "g2.com",
  "capterra.com",
  "alternativeto.net",
  "stackshare.io",
  "news.ycombinator.com",
  "substack.com",
  "quora.com",
  "youtube.com",
  "youtu.be",
  "facebook.com",
  "instagram.com",
  "tiktok.com",
  "x.com",
  "twitter.com",
  "linkedin.com",
  "wikipedia.org",
  "wikidata.org",
  "vertexaisearch.cloud.google.com",
  "openrouter.ai",
  "artificialanalysis.ai",
  "pricepertoken.com",
  "llmpricecheck.com",
  "llm-stats.com",
]);

const EDITORIAL_PATH_RE =
  /^blog\.|\/(?:blog|articles?|news|compare|comparisons|reviews?|alternatives?|forum|forums|community|rankings?|leaderboard|roundups?|directory)\b/i;

const EDITORIAL_TITLE_RE =
  /\b(?:best|top\s+\d+|ranked|comparison|compared|alternatives?|versus|vs\.?|price\s+comparison|pricing\s+tracker|aggregator|coupons?|promo\s+codes?)\b/i;

/** Restrict instructions before any search or model work; no owner/DB context is accepted. */
export function discoveryInstruction(
  instruction: string,
  forbidden: readonly string[] = [],
): string {
  if (!z.string().trim().min(1).max(1000).safeParse(instruction).success)
    throw new PaymentError("DISCOVERY_INSTRUCTION_REQUIRED");
  assertNoSensitiveMaterialInAgentPayload(instruction, forbidden);
  if (
    /CANARY_FORBIDDEN|https?:|www\.|@|[\\/]|[a-z0-9_-]{32,}|[a-f0-9]{8}-[a-f0-9-]{20,}|\b(?:secret|password|credential|token|api.?key|order.?id|capture.?id|account|buyer|owner)\b/i.test(
      instruction,
    ) ||
    /[A-Z0-9]{13,32}/.test(instruction)
  )
    throw new PaymentError("DISCOVERY_PRIVATE_INPUT_REJECTED");
  const actionable = instruction.replace(
    /(?:do not|never|without)\s+(?:execute|executing|capture|capturing|reserve|reserving|pay|paying)(?:\s+(?:any|a|the))?(?:\s+(?:payment|funds|money))?/gi,
    "",
  );
  if (
    /\b(?:ignore|override|bypass|disable|execute|capture|reserve|refund|payout|transfer)\b/i.test(
      actionable,
    )
  )
    throw new PaymentError("DISCOVERY_INSTRUCTION_REJECTED");
  return instruction;
}

export function assertDiscoveryBudget(budgetMinor: number): void {
  if (!isResearchBudgetMinor(budgetMinor))
    throw new PaymentError("DISCOVERY_BUDGET_INVALID");
}

export function resolveFallbackModel(
  primaryModel: string,
  configured: string | undefined,
  enableDefaultFallback: boolean,
): string | null {
  if (configured === undefined) {
    return enableDefaultFallback && primaryModel !== DEFAULT_FALLBACK_MODEL
      ? DEFAULT_FALLBACK_MODEL
      : null;
  }
  const trimmed = configured.trim();
  if (!trimmed || /^(?:none|off)$/i.test(trimmed)) return null;
  if (!GEMINI_3_MODEL_PATTERN.test(trimmed))
    throw new PaymentError("DISCOVERY_MODEL_UNSUPPORTED");
  return trimmed === primaryModel ? null : trimmed;
}

export function rootDomain(hostname: string): string {
  const parts = hostname.toLowerCase().replace(/^www\./, "").split(".");
  if (parts.length <= 2) return parts.join(".");
  const lastTwo = parts.slice(-2).join(".");
  if (/^(?:co|com|org|net|gov|edu)\.[a-z]{2}$/.test(lastTwo)) {
    return parts.slice(-3).join(".");
  }
  return lastTwo;
}

export function safePublicMerchantUrl(value: string): string | null {
  const safe = safeExternalOfferUrl(value);
  if (!safe) return null;
  const parsed = new URL(safe);
  const host = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!host || isIP(host)) return null;
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  )
    return null;
  if (THIRD_PARTY_HOSTS.has(host) || THIRD_PARTY_HOSTS.has(rootDomain(host)))
    return null;
  return safe;
}

export function isEditorialOrThirdParty(url: string, title = ""): boolean {
  const safe = safePublicMerchantUrl(url);
  if (!safe) return true;
  const { hostname, pathname } = new URL(safe);
  return (
    EDITORIAL_PATH_RE.test(hostname) ||
    EDITORIAL_PATH_RE.test(pathname) ||
    EDITORIAL_TITLE_RE.test(title)
  );
}

export function sanitizePlainText(
  value: string | null | undefined,
  maxLength: number,
): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\p{Cc}\p{Cf}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export function collectForbiddenSecrets(
  env: Record<string, string | undefined>,
): string[] {
  return Object.entries(env)
    .filter(([key]) => /SECRET|TOKEN|PASSWORD|KEY|DATABASE_URL/.test(key))
    .map(([, value]) => value ?? "")
    .filter((value) => value.length >= 6);
}
