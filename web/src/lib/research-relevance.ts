import { providerOriginRequest } from "./research-geography";
import {
  safeExternalOfferUrl,
  type PartialSearchSource,
} from "./offer-discovery";

// Topic evidence only. This never verifies identity, prices, payment or checkout.
const normalized = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

export const GENERIC_BRAND_WORDS = new Set([
  "api",
  "apis",
  "app",
  "billing",
  "cloud",
  "cost",
  "credit",
  "credits",
  "dev",
  "developer",
  "developers",
  "doc",
  "docs",
  "documentation",
  "edition",
  "enterprise",
  "faq",
  "fixture",
  "free",
  "guide",
  "help",
  "home",
  "hub",
  "international",
  "list",
  "llm",
  "llms",
  "merchant",
  "model",
  "models",
  "official",
  "overview",
  "package",
  "packages",
  "page",
  "pay",
  "payment",
  "payments",
  "plan",
  "plans",
  "platform",
  "prepaid",
  "price",
  "prices",
  "pricing",
  "pro",
  "product",
  "products",
  "provider",
  "providers",
  "quickstart",
  "rate",
  "rates",
  "reference",
  "region",
  "service",
  "services",
  "site",
  "starter",
  "studio",
  "support",
  "tier",
  "tiers",
  "token",
  "tokens",
  "usage",
  "vendor",
  "web",
  "website",
]);

export const MODEL_REQUEST_RE =
  /\b(?:AI\s+(?:models?|plans?|subscriptions?|chatbots?)|LLMs?|language\s+models?|foundation\s+models?|model\s+APIs?)\b/i;

export function expandAiPlanQuery(topic: string): string {
  return topic.replace(/\bAI\s+(?=plans?\b|subscriptions?\b)/i, "AI model ");
}

const INTENT_FILLER = new Set(
  "a an the i d we you this that with and where supports support accepts accept accepted paypal payment billing period periods sla delivery minute minutes activation can could would please help need want like looking look suggest recommend tool tools inexpensive scalable low find research compare show discover get me for of to my our your from in about suitable option options sending send offering affordable cheap best fast reliable approved allowlisted authorized official original direct directly first party sources source links link manufacturers manufacturer verified provider providers vendor vendors plan plans pricing price prices api apis service services product products model models ai llm llms costing cost costs less than at most budget monthly yearly annual per month year usd eur gbp dollars prepaid credit credits pay go subscription subscriptions".split(
    " ",
  ),
);

function requestSubjectWords(instruction: string): string[] {
  // Payment, budget and delivery constraints have separate evidence validators.
  const subject =
    instruction.split(
      /\b(?:under|below|within|costing|priced|up to|less than|per month|per year)\b|[;!]/i,
    )[0] ?? instruction;
  return requestWords(subject).filter(
    (word) =>
      word.length > 1 && !/^\d+$/.test(word) && !INTENT_FILLER.has(word),
  );
}

function requestWords(value: string): string[] {
  return normalized(
    value
      .replace(/\be[- ]mail\b/gi, "email")
      .replace(/\b(?:SMTP|mail)\b/gi, "email"),
  )
    .split(" ")
    .map((word) => word.replace(/ies$/, "y").replace(/s$/, ""));
}

export function isRelevantPurchasingSource(
  source: Pick<PartialSearchSource, "title" | "url" | "snippet">,
  instruction: string,
  identityTerms: readonly string[] = [],
): boolean {
  if (!instruction.trim() || !safeExternalOfferUrl(source.url)) return false;
  // Editorial money/news vocabulary must not substitute for a product offering.
  if (
    /\b(?:funding|fundraising|treasury|valuation|earnings|IPO)\b/i.test(
      source.title,
    ) &&
    !/\b(?:pricing|plans?|subscriptions?|documentation|developers?|rate cards?)\b/i.test(
      source.title,
    )
  )
    return false;
  // A corporate domain can host unrelated products. Relevance must be supported
  // by this page; another page on that domain cannot turn compute pricing into
  // model API pricing.
  const evidence = `${source.title} ${source.snippet} ${new URL(source.url).pathname}`;
  if (
    !/\b(?:APIs?|pricing|prices?|plans?|billing|subscriptions?|packages?|credits?|rates?|documentation|docs|developers?|quickstart|models?|inference|products?|services?|buy|shop|warranty|specifications?)\b|[$€£]\s*\d|\b(?:USD|EUR|GBP)\s*\d/i.test(
      evidence,
    )
  )
    return false;
  if (MODEL_REQUEST_RE.test(instruction)) {
    const apiEvidence = /\b(?:APIs?|inference|tokens?)\b/i.test(evidence);
    const modelEvidence =
      /\b(?:LLMs?|inference|AI\s+chatbots?|(?:AI|language|foundation|reasoning|multimodal|generative)\s+models?)\b|\b(?:input|output|prompt|completion)\b[^;|]{0,120}\btokens?\b/i.test(
        evidence,
      ) ||
      (apiEvidence && /\bmodels?\b/i.test(evidence));
    if (
      !modelEvidence ||
      (/\bAPIs?\b/i.test(instruction)
        ? !apiEvidence
        : !apiEvidence &&
          !/\b(?:pricing|prices?|subscriptions?|plans?|billing)\b|[$€£]\s*\d/i.test(
            evidence,
          ))
    )
      return false;
  }
  const { subject: productRequest } = providerOriginRequest(instruction);
  const subject = productRequest.replace(MODEL_REQUEST_RE, "model");
  const words = requestSubjectWords(subject).filter(
    (word) => !GENERIC_BRAND_WORDS.has(word),
  );
  if (!words.length)
    return MODEL_REQUEST_RE.test(instruction) || identityTerms.some(Boolean);
  const identityWords = new Set(requestWords(identityTerms.join(" ")));
  const evidenceWords = new Set(requestWords(evidence));
  // Comparison requests can name alternatives (a model's usage rates and credit
  // packs, for example). Each page need only match one substantive alternative.
  const alternatives = subject
    .split(/\b(?:and|or|versus|vs)\b/i)
    .map((part) =>
      requestSubjectWords(part).filter(
        (word) => !GENERIC_BRAND_WORDS.has(word),
      ),
    )
    .filter((part) => part.length > 0);
  return (alternatives.length ? alternatives : [words]).some((part) => {
    const productWords = part.filter((word) => !identityWords.has(word));
    const topicWords = productWords.length ? productWords : part;
    const matches = topicWords.filter((word) => evidenceWords.has(word));
    return matches.length >= Math.max(1, Math.ceil(topicWords.length / 2));
  });
}
