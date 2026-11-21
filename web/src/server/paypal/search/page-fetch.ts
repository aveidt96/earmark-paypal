import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { rootDomain, safePublicMerchantUrl, sanitizePlainText } from "./guard";

export const MAX_MERCHANT_PAGES = 4;
const PAGE_TIMEOUT_MS = 4000;
const MAX_PAGE_BYTES = 200_000;
const MAX_EXTRACTED_CHARS = 4000;

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
    .replace(
      /<(script|style|noscript|svg|iframe|template|nav|header|footer|aside)[^>]*>[\s\S]*?<\/\1>/gi,
      " ",
    )
    .replace(
      /<(?:br|\/p|\/div|\/li|\/tr|\/h[1-6]|\/section|\/article)[^>]*>/gi,
      "\n",
    )
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

async function hasOnlyPublicIps(hostname: string): Promise<boolean> {
  try {
    const records = await lookup(hostname, { all: true });
    return (
      records.length > 0 &&
      !records.some((record) => isPrivateOrReservedIp(record.address))
    );
  } catch {
    return false;
  }
}

function pagePriority(url: string): number {
  const path = new URL(url).pathname.toLowerCase();
  if (/\/(?:pricing|plans?|packages?|tariffs?|subscribe)\b/.test(path)) return 3;
  if (/\/(?:billing|payment|checkout|faq|buy|shop|store|product)\b/.test(path))
    return 2;
  return 1;
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

  const initialHost = new URL(safeUrl).hostname;
  if (!fetcher && !(await hasOnlyPublicIps(initialHost))) return fallback;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), effectiveTimeout);
  const headers = {
    Accept: "text/html,text/plain;q=0.9",
    "Accept-Language": "en-US,en;q=0.9",
    "User-Agent": "EarmarkResearchBot/1.0 (read-only pricing check)",
  };
  try {
    let activeUrl = safeUrl;
    let response = await (fetcher ?? fetch)(activeUrl, {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
      headers,
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      void response.body?.cancel().catch(() => {});
      if (!location) return fallback;
      let resolved: string;
      try {
        resolved = new URL(location, activeUrl).toString();
      } catch {
        return fallback;
      }
      const nextSafe = safePublicMerchantUrl(resolved);
      if (
        !nextSafe ||
        rootDomain(new URL(nextSafe).hostname) !== rootDomain(initialHost)
      )
        return fallback;
      const nextHost = new URL(nextSafe).hostname;
      if (!fetcher && !(await hasOnlyPublicIps(nextHost))) return fallback;
      activeUrl = nextSafe;
      response = await (fetcher ?? fetch)(activeUrl, {
        method: "GET",
        redirect: "error",
        signal: controller.signal,
        headers,
      });
    }
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
    const isHtml = /html/i.test(contentType) || /<html|<body|<title/i.test(raw);
    const extracted = isHtml
      ? extractTextFromHtml(raw)
      : {
          title: sanitizePlainText(candidate.title, 160),
          text: sanitizePlainText(raw, MAX_EXTRACTED_CHARS),
        };
    if (!extracted.text) return fallback;
    return {
      url: activeUrl,
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
  const bestByDomain = new Map<string, PageCandidate>();
  for (const item of candidates) {
    const safeUrl = safePublicMerchantUrl(item.url);
    if (!safeUrl) continue;
    const domain = rootDomain(new URL(safeUrl).hostname);
    const current = bestByDomain.get(domain);
    if (!current || pagePriority(safeUrl) > pagePriority(current.url)) {
      bestByDomain.set(domain, { ...item, url: safeUrl });
    }
  }
  const unique = [...bestByDomain.values()]
    .sort((a, b) => pagePriority(b.url) - pagePriority(a.url))
    .slice(0, MAX_MERCHANT_PAGES);
  const settled = await Promise.all(
    unique.map((item) => fetchMerchantPage(item, timeoutMs, fetcher)),
  );
  return settled.filter((page): page is FetchedMerchantPage => page !== null);
}
