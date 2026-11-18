import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("server-only", () => ({}));
import { AgentError } from "@flint/agent/server";
import { isRelevantPurchasingSource } from "../src/lib/research-relevance";
import { IncompleteOfferComparison } from "../src/components/offer-discovery";
import {
  classifyProviderSource,
  discoverOffers,
  TAVILY_SEARCH_URL,
} from "../src/server/paypal/offer-discovery";
import { handlePublicResearch } from "../src/server/paypal/public-research";

// Screenshot titles/excerpts, with constructed offline transport responses.
// The Finder path/body were not visible in full and are fixture data.
const unwanted = [
  {
    title: "OpenAI Funding Target Cut $10B to $20B [2026]",
    url: "https://shattered.io/openai-cuts-funding-target-10-billion-20-billion-1-25-trillion-valuation-2026",
    snippet:
      "Sensible hedges are cheap. Keep prompts and evaluation sets portable across providers.",
  },
  {
    title: "All About Galaxy: Galaxy AI, One UI & More | Samsung US",
    url: "https://www.samsung.com/us/mobile",
    snippet:
      "For a limited time while supplies last, purchase a new Galaxy S26 Ultra device and receive $150 Samsung Credit towards additional eligible purchases.",
  },
  {
    title:
      "Cryptocurrency Treasury Companies | Who Is Holding Crypto? | Finder",
    url: "https://www.finder.com/cryptocurrency/treasury-companies",
    snippet:
      "Cryptocurrency treasury companies holding Bitcoin and other crypto assets.",
  },
];
const requests = [
  {
    instruction: "Find me $20 Chinese model API plans",
    source: {
      title: "Models & Pricing | DeepSeek API Docs",
      url: "https://api-docs.deepseek.com/quick_start/pricing",
      snippet:
        "Model API input/output token pricing and pay-as-you-go usage billing.",
    },
  },
  {
    instruction: "Find transactional email API plans under $20",
    source: {
      title: "Resend API pricing",
      url: "https://resend.com/pricing",
      snippet:
        "Transactional email API plans, monthly pricing and developer documentation.",
    },
  },
  {
    instruction: "Find weather API plans under $20",
    source: {
      title: "Weather API pricing",
      url: "https://weather.example/pricing",
      snippet: "Weather forecast API plans and monthly pricing.",
    },
  },
];
const modelReference = {
  title: "DeepSeek",
  url: "https://en.wikipedia.org/wiki/DeepSeek",
  snippet:
    "DeepSeek is a Chinese AI company that develops language models. Official website: https://deepseek.com/",
};
const env = {
  EARMARK_OFFER_DISCOVERY_ENABLED: "true",
  EARMARK_GEMINI_ENABLED: "true",
  AI_ENABLE_NETWORK: "true",
  GEMINI_API_KEY: "offline-gemini-key-only",
  TAVILY_API_KEY: "offline-tavily-key-only",
  GEMINI_MODEL: "gemini-3.8-flash",
  AI_TIMEOUT_MS: "60000",
  GEMINI_COLLECTOR_FALLBACK_MODEL: "off",
  PAYPAL_BACKEND_ENABLED: "false",
  PAYPAL_PAYMENTS_ENABLED: "false",
};
const origin = "https://preview.example.com";
const publicEnv = {
  ...env,
  VERCEL: "1",
  NEXT_PUBLIC_DEMO_ONLY: "true",
  EARMARK_PUBLIC_DEMO_ONLY: "true",
  EARMARK_PUBLIC_RESEARCH_ENABLED: "true",
  EARMARK_PUBLIC_RESEARCH_ORIGIN: origin,
  EARMARK_RESEARCH_DATABASE_URL: "offline-quota-url",
  EARMARK_RESEARCH_QUOTA_SECRET: "a".repeat(64),
};
function request(instruction: string) {
  return new Request(`${origin}/api/paypal/research`, {
    method: "POST",
    headers: {
      Host: new URL(origin).host,
      Origin: origin,
      "Content-Type": "application/json",
      "x-vercel-forwarded-for": "203.0.113.10",
    },
    body: JSON.stringify({ instruction, budgetMinor: 2000 }),
  });
}
function fixture(results: typeof unwanted, failCollector = false) {
  const queries: string[] = [],
    collectorPayloads: Array<{
      trustedTask: { instruction: string; budgetMinor: string };
      observationsIncludingUntrustedProviderData: { results: typeof unwanted };
    }> = [];
  const fetcher = vi.fn<typeof fetch>(async (url, init) => {
    if (String(url) === TAVILY_SEARCH_URL) {
      const { query } = JSON.parse(String(init?.body));
      queries.push(query);
      return Response.json({
        query,
        results: (queries.length === 1 ? results : []).map(
          ({ snippet, ...item }) => ({ ...item, content: snippet }),
        ),
      });
    }
    if (String(url).includes(":generateContent")) {
      const body = JSON.parse(String(init?.body));
      collectorPayloads.push(JSON.parse(body.contents[0].parts[0].text));
      return Response.json(
        failCollector
          ? { candidates: [] }
          : {
              candidates: [
                {
                  finishReason: "STOP",
                  content: {
                    role: "model",
                    parts: [
                      {
                        functionCall: {
                          name: "reportDiscoveredOffers",
                          args: { offers: [] },
                        },
                      },
                    ],
                  },
                },
              ],
            },
      );
    }
    throw Error("Unexpected transport in offline test");
  });
  return { fetcher, queries, collectorPayloads };
}

describe("purchasing relevance across discovery and incomplete comparison", () => {
  it("retains an independently corroborated official document when the collector fails", async () => {
    const entry = requests[0];
    if (!entry) throw Error("Missing offline fixture");
    expect(
      classifyProviderSource(
        { ...entry.source, retrievedAt: "2026-11-15T06:43:00.000Z" },
        entry.instruction,
        [entry.source, modelReference].map((item) => ({
          ...item,
          retrievedAt: "2026-11-15T06:43:00.000Z",
        })),
      ),
    ).toBe("first-party");
    const f = fixture([entry.source, modelReference], true);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const response = await handlePublicResearch(
        request(entry.instruction),
        publicEnv,
        async () => true,
        (text, configured, _, budget, timing) =>
          discoverOffers(text, configured, f.fetcher, budget, timing),
        async () => true,
      );
      expect(response.status).toBe(200);
      expect((await response.json()).incompleteComparison.sources).toContain(
        entry.source.url,
      );
    } finally {
      warn.mockRestore();
    }
  });

  it.each(requests)(
    "rejects the screenshot sources for $instruction",
    ({ instruction }) => {
      for (const source of unwanted)
        expect(isRelevantPurchasingSource(source, instruction)).toBe(false);
      const html = renderToStaticMarkup(
        createElement(IncompleteOfferComparison, {
          result: {
            reason: "unavailable",
            instruction,
            sources: unwanted.map((source) => source.url),
            results: unwanted,
          },
        }),
      );
      expect(html).toContain(
        "No relevant product or pricing sources could be preserved",
      );
      for (const source of unwanted) expect(html).not.toContain(source.url);
    },
  );

  it.each(requests)(
    "keeps useful sources out of unrelated noise before the collector: $instruction",
    async ({ instruction, source }) => {
      const regional = instruction.includes("Chinese");
      const f = fixture([
        ...unwanted,
        source,
        ...(regional ? [modelReference] : []),
      ]);
      const result = await discoverOffers(instruction, env, f.fetcher, 2000);
      expect(f.collectorPayloads).toHaveLength(1);
      expect(
        f.collectorPayloads[0]?.observationsIncludingUntrustedProviderData.results.map(
          (item) => item.url,
        ),
      ).toEqual([source.url]);
      expect(f.collectorPayloads[0]?.trustedTask).toMatchObject({
        instruction,
        budgetMinor: "2000",
      });
      expect(
        (regional ? result.officialProviders : result.providerCandidates)?.map(
          (item) => item.url,
        ),
      ).toContain(source.url);
    },
  );

  it("removes monetary search noise, preserves the original budget, and stops before Gemini when searches have no relevant evidence", async () => {
    const f = fixture(unwanted);
    const reserve = vi.fn(async () => true),
      refund = vi.fn(async () => true);
    const response = await handlePublicResearch(
      request("Find me $20 Chinese model API plans"),
      publicEnv,
      reserve,
      (instruction, configured, _, budget, timing) =>
        discoverOffers(instruction, configured, f.fetcher, budget, timing),
      refund,
    );
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: "PUBLIC_RESEARCH_NO_VERIFIED_REGIONAL_PROVIDERS",
    });
    expect(f.queries).toEqual([
      "Chinese model API plans original model developers official pricing",
      "Chinese model API plans China original model developers official website pricing Wikipedia Wikidata",
    ]);
    expect(f.collectorPayloads).toEqual([]);
    expect(f.fetcher).toHaveBeenCalledTimes(2);
    expect(reserve).toHaveBeenCalledOnce();
    expect(refund).not.toHaveBeenCalled();
  });

  it.each(requests)(
    "preserves relevant product links through a collector rejection: $instruction",
    async ({ instruction, source }) => {
      const f = fixture(
        [
          ...unwanted,
          source,
          ...(instruction.includes("Chinese") ? [modelReference] : []),
        ],
        true,
      );
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      try {
        const response = await handlePublicResearch(
          request(instruction),
          publicEnv,
          async () => true,
          (text, configured, _, budget, timing) =>
            discoverOffers(text, configured, f.fetcher, budget, timing),
          async () => true,
        );
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.incompleteComparison).toMatchObject({
          instruction,
          reason: "unavailable",
          sources: [source.url],
        });
        const html = renderToStaticMarkup(
          createElement(IncompleteOfferComparison, {
            result: body.incompleteComparison,
          }),
        );
        expect(html).toContain(`href="${source.url}"`);
        for (const bad of unwanted) expect(html).not.toContain(bad.url);
        expect(f.collectorPayloads).toHaveLength(1);
      } finally {
        warn.mockRestore();
      }
    },
  );

  it("rechecks fallback relevance against the trusted purchasing instruction even if an alternate discovery callback supplies raw sources", async () => {
    const instruction = "Find me $20 Chinese model API plans";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const response = await handlePublicResearch(
        request(instruction),
        publicEnv,
        async () => true,
        async (_, __, ___, ____, timing) => {
          timing?.onFailure(
            {
              stage: "offer_analysis",
              classification: "invalid_response",
              elapsedMs: 1,
              timeoutMs: 32000,
              httpStatus: 200,
            },
            {
              sources: unwanted.map((item) => item.url),
              results: unwanted,
              retrievedAt: "2026-11-15T06:43:00.000Z",
            },
          );
          throw new AgentError("INVALID_MODEL_RESPONSE");
        },
        async () => true,
      );
      expect(response.status).toBe(200);
      expect((await response.json()).incompleteComparison).toMatchObject({
        instruction,
        results: [],
        sources: [],
      });
    } finally {
      warn.mockRestore();
    }
  });

  it("fails closed for URL-only fallback data or missing request context", () => {
    for (const result of [
      {
        reason: "timeout" as const,
        sources: unwanted.map((item) => item.url),
        instruction: "Find me $20 Chinese model API plans",
      },
      {
        reason: "unavailable" as const,
        sources: unwanted.map((item) => item.url),
        results: unwanted,
      },
    ]) {
      const html = renderToStaticMarkup(
        createElement(IncompleteOfferComparison, { result }),
      );
      expect(html).not.toContain("href=");
      expect(html).toContain(
        "No relevant product or pricing sources could be preserved",
      );
    }
  });
});
