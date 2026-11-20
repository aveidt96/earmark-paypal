import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { safePublicMerchantUrl, sanitizePlainText } from "./guard";

export const MAX_MERCHANT_PAGES = 4;
const PAGE_TIMEOUT_MS = 5000;
const MAX_PAGE_BYTES = 200_000;
const MAX_EXTRACTED_CHARS = 6000;

export interface FetchedMerchantPage {
  url: string;
  title: string;
  text: string;
  fetchedLive: boolean;
}

export function isPrivateOrReservedIp(ip: string): boolean {
  const normalized = ip.toLowerCase().replace(/^::ffff:/, "");
  const version = isIP(normalized);
  if (version === 4) {
    const parts = normalized.split(".").map(Number);
    const [a = 0, b = 0] = parts;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a >= 224) return true;
    return false;
  }
  if (version === 6) {
    if (normalized === "::" || normalized === "::1") return true;
    if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
    if (/^fe[89ab]/i.test(normalized)) return true;
    if (normalized.startsWith("ff")) return true;
    return false;
  }
  return true;
}

export function extractTextFromHtml(rawHtml: string): {
  title: string;
  text: string;
} {
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(rawHtml);
  const title = sanitizePlainText(decodeEntities(titleMatch?.[1] ?? ""), 160);
  const stripped = rawHtml
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|iframe|template)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(?:br|\/p|\/div|\/li|\/tr|\/h[1-6]|\/section|\/article)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  const decoded = decodeEntities(stripped)
    .replace(/[ \t\r\f\v]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim()
    .slice(0, MAX_EXTRACTED_CHARS);
  return { title, text: decoded };
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code: string) => {
      const n = Number(code);
      return n >= 32 && n <= 126 ? String.fromCharCode(n) : " ";
    });
}

async function readBoundedText(
  response: Response,
  signal: AbortSignal,
): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder("utf-8", { fatal: false });
  let total = 0;
  let out = "";
  try {
    for (;;) {
      if (signal.aborted) break;
      const { done, value } = await reader.read();
      if (done) break;
      const remaining = MAX_PAGE_BYTES - total;
      if (remaining <= 0) break;
      const slice =
        value.byteLength > remaining ? value.subarray(0, remaining) : value;
      total += slice.byteLength;
      out += decoder.decode(slice, { stream: true });
      if (total >= MAX_PAGE_BYTES) break;
    }
    out += decoder.decode();
    return out;
  } finally {
    void reader.cancel().catch(() => {});
  }
}

export async function fetchMerchantPage(
  candidate: { url: string; title?: string; fallbackSnippet?: string },
  timeoutMs: number,
  fetcher?: typeof fetch,
): Promise<FetchedMerchantPage | null> {
  const safeUrl = safePublicMerchantUrl(candidate.url);
  if (!safeUrl) return null;
  const fallbackTitle =
    sanitizePlainText(candidate.title, 160) || new URL(safeUrl).hostname;
  const fallback: FetchedMerchantPage | null = candidate.fallbackSnippet?.trim()
    ? {
        url: safeUrl,
        title: fallbackTitle,
        text: sanitizePlainText(candidate.fallbackSnippet, MAX_EXTRACTED_CHARS),
        fetchedLive: false,
      }
    : null;

  const effectiveTimeout = Math.min(PAGE_TIMEOUT_MS, Math.max(0, timeoutMs));
  if (effectiveTimeout < 500) return fallback;

  if (!fetcher) {
    try {
      const records = await lookup(new URL(safeUrl).hostname, { all: true });
      if (
        !records.length ||
        records.some((record) => isPrivateOrReservedIp(record.address))
      )
        return fallback;
    } catch {
      return fallback;
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), effectiveTimeout);
  try {
    const response = await (fetcher ?? fetch)(safeUrl, {
      method: "GET",
      redirect: "error",
      signal: controller.signal,
      headers: {
        Accept: "text/html,text/plain;q=0.9",
        "User-Agent": "EarmarkResearchBot/1.0 (read-only pricing check)",
      },
    });
    if (!response.ok) {
      void response.body?.cancel().catch(() => {});
      return fallback;
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (
      contentType &&
      !/^(?:text\/html|text\/plain|application\/xhtml\+xml|application\/json)/i.test(
        contentType,
      )
    ) {
      void response.body?.cancel().catch(() => {});
      return fallback;
    }
    const raw = await readBoundedText(response, controller.signal);
    const isHtml =
      /html/i.test(contentType) || /<html|<body|<title/i.test(raw);
    const extracted = isHtml
      ? extractTextFromHtml(raw)
      : {
          title: sanitizePlainText(candidate.title, 160),
          text: sanitizePlainText(raw, MAX_EXTRACTED_CHARS),
        };
    if (!extracted.text) return fallback;
    return {
      url: safeUrl,
      title: extracted.title || fallbackTitle,
      text: extracted.text,
      fetchedLive: true,
    };
  } catch {
    return fallback;
  } finally {
    clearTimeout(timer);
  }
}

type PageCandidate = {
  url: string;
  title?: string;
  fallbackSnippet?: string;
};

export async function fetchMerchantPages(
  candidates: readonly PageCandidate[],
  timeoutMs: number,
  fetcher?: typeof fetch,
): Promise<FetchedMerchantPage[]> {
  const unique: PageCandidate[] = [];
  const seen = new Set<string>();
  for (const item of candidates) {
    const safeUrl = safePublicMerchantUrl(item.url);
    if (!safeUrl || seen.has(safeUrl)) continue;
    seen.add(safeUrl);
    unique.push({ ...item, url: safeUrl });
    if (unique.length >= MAX_MERCHANT_PAGES) break;
  }
  const settled = await Promise.all(
    unique.map((item) => fetchMerchantPage(item, timeoutMs, fetcher)),
  );
  return settled.filter((page): page is FetchedMerchantPage => page !== null);
}
