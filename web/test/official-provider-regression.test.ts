import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  OfferDiscovery,
  IncompleteOfferComparison,
} from "../src/components/offer-discovery";
import { conciseResearchDescription } from "../src/lib/offer-discovery";
vi.mock("server-only", () => ({}));
import {
  classifyProviderSource,
  discoverOffers,
  TAVILY_SEARCH_URL,
  type ValidatedResearchResults,
} from "../src/server/paypal/offer-discovery";

// Constructed offline evidence, not captured live responses or current prices.
const retrievedAt = "2026-11-15T00:00:00.000Z";
const source = (url: string, title: string, snippet: string) => ({
  url,
  title,
  snippet,
  retrievedAt,
});
const instruction = "Research $20 Chinese AI model plans";
const badSources = [
  source(
    "https://aicodewith.ai/",
    "AI Code With plans",
    "AI coding assistants and subscription credits for developers.",
  ),
  source(
    "https://glbgpt.com/",
    "Claude pricing | GlobalGPT",
    "A guide to Claude Pro subscriptions at USD 20 per month.",
  ),
  source(
    "https://toolgrowthhq.com/",
    "Originality.ai review",
    "Originality.ai detection credit pricing and a review of its tools.",
  ),
  source(
    "https://openai.com/api/pricing/",
    "API pricing | OpenAI",
    "OpenAI develops our own language models. Chinese language support and China token pricing region.",
  ),
  source(
    "https://credits.example/pricing",
    "Credits plans",
    "Generic prepaid credit packages for AI assistants.",
  ),
];
const goodSources = [
  source(
    "https://api-docs.deepseek.com/quick_start/pricing",
    "Models & Pricing | DeepSeek API Docs",
    "DeepSeek is a China-based AI provider. DeepSeek develops its own AI models and provides a model API with pay-as-you-go token billing.",
  ),
  source(
    "https://www.alibabacloud.com/help/en/model-studio/model-pricing",
    "Model pricing - Alibaba Cloud Model Studio",
    "Alibaba is a China-based AI provider. Alibaba develops its own language models including Qwen. Alibaba Cloud Model Studio offers Qwen model API token pricing.",
  ),
  source(
    "https://open.bigmodel.cn/pricing",
    "GLM model pricing | Zhipu AI BigModel",
    "Zhipu AI is a China-based AI provider. We develop our own language models including GLM. BigModel offers API access and prepaid credits.",
  ),
];
const env = {
  EARMARK_OFFER_DISCOVERY_ENABLED: "true",
  EARMARK_GEMINI_ENABLED: "true",
  AI_ENABLE_NETWORK: "true",
  GEMINI_API_KEY: "offline-gemini-key-only",
  TAVILY_API_KEY: "offline-tavily-key-only",
  GEMINI_MODEL: "gemini-3.8-flash",
  AI_TIMEOUT_MS: "60000",
  PAYPAL_BACKEND_ENABLED: "false",
  PAYPAL_PAYMENTS_ENABLED: "false",
};

function offlineTransport(
  initial: typeof goodSources,
  followup: typeof goodSources,
  offers: unknown[] = [],
) {
  let searches = 0;
  return vi.fn<typeof fetch>(async (input, init) => {
    if (String(input) === TAVILY_SEARCH_URL) {
      searches += 1;
      const body = JSON.parse(String(init?.body));
      const results = searches === 1 ? initial : searches === 2 ? followup : [];
      return Response.json({
        query: body.query,
        results: results.map(({ snippet, ...item }) => ({
          ...item,
          content: snippet,
        })),
      });
    }
    if (
      String(input).startsWith("https://generativelanguage.googleapis.com/") &&
      String(input).includes(":generateContent")
    ) {
      return Response.json({
        candidates: [
          {
            finishReason: "STOP",
            content: {
              role: "model",
              parts: [
                {
                  functionCall: {
                    name: "reportDiscoveredOffers",
                    args: { offers },
                  },
                },
              ],
            },
          },
        ],
      });
    }
    throw new Error("Unexpected outbound call in offline regression");
  });
}

describe("official provider identity and relevance regression", () => {
  it.each(badSources)(
    "rejects $url as an official Chinese model provider",
    (item) => {
      expect(classifyProviderSource(item, instruction)).not.toBe("first-party");
    },
  );

  it("distinguishes resellers and editorial sources from original developers", () => {
    expect(
      classifyProviderSource(
        source(
          "https://glbgpt.com/",
          "GlobalGPT plans",
          "A multi-model aggregator selling access to Chinese AI models.",
        ),
        instruction,
      ),
    ).toBe("reseller");
    expect(
      classifyProviderSource(
        source(
          "https://toolgrowthhq.com/blog/originality-ai",
          "Originality.ai review",
          "AI detection credit plans.",
        ),
        instruction,
      ),
    ).toBe("editorial");
    expect(
      classifyProviderSource(
        source(
          "https://aicodewith.ai/pricing",
          "AI Code With plans",
          "An AI coding assistant subscription.",
        ),
        instruction,
      ),
    ).toBe("irrelevant");
  });

  it.each([false, true])(
    "preserves verified links independently of Gemini offers (poisoned offers: %s)",
    async (poisoned) => {
      const modelOffers = poisoned
        ? badSources.slice(0, 3).map((item) => ({
            provider: new URL(item.url).hostname.split(".")[0],
            service: "AI model plan",
            priceMinor: "2000",
            currency: "USD",
            billing: "per month",
            availability: null,
            delivery: null,
            slaMinutes: null,
            paypal: "claimed",
            paypalEvidence: "PayPal accepted",
            sourceUrls: [item.url],
          }))
        : [];
      const transport = offlineTransport(badSources, goodSources, modelOffers);
      const result = await discoverOffers(instruction, env, transport, 2000);
      expect(transport).toHaveBeenCalledTimes(4); // Existing search -> provider search -> collector -> payment search.
      expect(result.evidence.searchRequests).toBe(3);
      expect(result.offers).toEqual([]);
      expect(result.officialProviders?.map((item) => item.url)).toEqual(
        goodSources.map((item) => item.url),
      );
      expect(result).toMatchObject({
        proposal: null,
        ownerAuthorized: false,
        persisted: false,
        fundsReserved: false,
      });
      for (const item of result.officialProviders ?? []) {
        expect(item).toMatchObject({
          pricingStatus: "unknown",
          paypal: "unknown",
          checkoutUrl: null,
        });
      }
      const html = renderToStaticMarkup(
        createElement(OfferDiscovery, { result, assistedCheckout: true }),
      );
      for (const item of goodSources)
        expect(html).toContain(`href="${item.url}"`);
      for (const item of badSources)
        expect(html).not.toContain(new URL(item.url).hostname);
      expect(html).toContain("Billing model:");
      expect(html).toContain("Price: Unknown");
      expect(html).not.toContain("Approve for manual checkout");
      expect(html).not.toContain("Continue to merchant checkout");
    },
  );

  it("requires identity, original-model evidence and origin instead of fuzzy domain prefixes", () => {
    const novel = source(
      "https://haihe.example/docs/pricing",
      "Haihe API pricing",
      "Haihe is a China-based AI provider. Haihe develops its own AI models and provides model API usage billing.",
    );
    expect(classifyProviderSource(novel, instruction)).toBe("first-party");
    expect(
      classifyProviderSource(
        { ...novel, url: "https://haihe-discounts.example/pricing" },
        instruction,
      ),
    ).not.toBe("first-party");
    expect(
      classifyProviderSource(
        { ...novel, url: "https://haiheapi.example/pricing" },
        instruction,
      ),
    ).not.toBe("first-party");
    expect(
      classifyProviderSource(
        { ...novel, url: "https://haihe.example.evil.example/pricing" },
        instruction,
      ),
    ).not.toBe("first-party");
    expect(
      classifyProviderSource(
        { ...novel, snippet: "Haihe sells access to Chinese AI model APIs." },
        instruction,
      ),
    ).toBe("irrelevant");
    expect(
      classifyProviderSource(
        {
          ...novel,
          snippet:
            "Haihe develops language models with Chinese language support.",
        },
        instruction,
      ),
    ).toBe("irrelevant");
    expect(
      classifyProviderSource({ ...novel, title: "Pricing" }, instruction),
    ).toBe("unverified");
  });

  it("does not borrow relevance or origin from another domain or a same-domain blog", () => {
    const [deepseek] = goodSources;
    if (!deepseek) throw new Error("Missing offline fixture");
    const sparse = {
      ...deepseek,
      snippet: "DeepSeek model API token pricing.",
    };
    const article = {
      ...deepseek,
      url: "https://api-docs.deepseek.com/blog/company",
      title: "DeepSeek company review",
    };
    expect(
      classifyProviderSource(sparse, instruction, [
        sparse,
        article,
        ...goodSources.slice(1),
      ]),
    ).toBe("irrelevant");
    expect(
      classifyProviderSource(
        {
          ...sparse,
          snippet:
            "We develop our own language models. Alibaba is a China-based AI company.",
        },
        instruction,
      ),
    ).toBe("irrelevant");
    expect(
      classifyProviderSource(
        { ...sparse, snippet: "We develop Chinese language models." },
        instruction,
      ),
    ).toBe("irrelevant");
  });

  it("returns a clear empty state when no suitable first-party source is verified", async () => {
    const result = await discoverOffers(
      instruction,
      env,
      offlineTransport(badSources, badSources),
      2000,
    );
    expect(result.officialProviders).toEqual([]);
    expect(result.offers).toEqual([]);
    expect(result.summary).toContain(
      "No suitable first-party provider was verified",
    );
    const html = renderToStaticMarkup(
      createElement(OfferDiscovery, { result }),
    );
    expect(html).toContain("No suitable first-party provider was verified");
    expect(html).not.toContain("Verified official providers");
  });

  it("does not use a blog price as verified pricing for a genuine provider", async () => {
    const [deepseek] = goodSources;
    if (!deepseek) throw new Error("Missing offline fixture");
    const article = source(
      "https://glbgpt.com/blog/deepseek-pricing",
      "DeepSeek Starter pricing",
      "Starter costs USD 20 per month. PayPal accepted.",
    );
    const transport = offlineTransport(
      [deepseek, article],
      [],
      [
        {
          provider: "DeepSeek",
          service: "Starter",
          priceMinor: "2000",
          currency: "USD",
          billing: "per month",
          availability: null,
          delivery: null,
          slaMinutes: null,
          paypal: "unknown",
          paypalEvidence: null,
          sourceUrls: [deepseek.url, article.url],
        },
      ],
    );
    const result = await discoverOffers(instruction, env, transport, 2000);
    expect(result.offers[0]).toMatchObject({
      priceMinor: null,
      paypal: "unknown",
      pricing: { status: "unknown" },
      officialCheckoutUrl: null,
    });
    expect(result.offers[0]?.sources).toContainEqual({
      url: article.url,
      cited: false,
    });
    expect(result.officialProviders?.map((item) => item.url)).toEqual([
      deepseek.url,
    ]);
  });

  it("generalizes to transactional email and rejects AI plans, articles and email resellers", async () => {
    const email = [
      source(
        "https://resend.com/pricing",
        "Pricing | Resend",
        "Resend provides a transactional email API with monthly billing.",
      ),
      source(
        "https://postmarkapp.com/pricing",
        "Pricing | Postmark (postmarkapp.com)",
        "Postmark transactional email API pricing and billing plans.",
      ),
    ];
    const irrelevant = [
      ...goodSources.slice(0, 1),
      source("https://glbgpt.com/", "GlobalGPT plans", "AI assistant credits."),
      source(
        "https://emailhub.example/pricing",
        "EmailHub pricing",
        "An aggregator reselling transactional email API plans.",
      ),
    ];
    const request = "Research $20 transactional email API plans";
    const transport = offlineTransport([...email, ...irrelevant], []);
    const result = await discoverOffers(request, env, transport, 2000);
    expect(transport).toHaveBeenCalledTimes(3);
    expect(result.officialProviders?.map((item) => item.url)).toEqual(
      email.map((item) => item.url),
    );
    for (const item of email)
      expect(classifyProviderSource(item, instruction)).toBe("irrelevant");
  });

  it("keeps UI excerpts short and plain, including partial-comparison fallbacks", () => {
    const markdown =
      "## Useful **billing** terms. [Source](https://example.com). Third sentence must be removed. " +
      "Long excerpt. ".repeat(100);
    const description = conciseResearchDescription(markdown);
    expect(description.length).toBeLessThanOrEqual(240);
    expect(description).not.toMatch(/[#*|`]|https?:|Third sentence/);
    const results: ValidatedResearchResults["results"] = [
      source("https://resend.com/pricing", "Resend pricing", markdown),
    ];
    const html = renderToStaticMarkup(
      createElement(IncompleteOfferComparison, {
        result: {
          reason: "timeout",
          sources: results.map((item) => item.url),
          results,
        },
      }),
    );
    expect(html).toContain('href="https://resend.com/pricing"');
    expect(html).not.toContain("Long excerpt");
    expect(html).not.toContain("**billing**");
  });
});
