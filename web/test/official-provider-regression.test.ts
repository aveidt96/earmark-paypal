import { braveSearchResponse, readBraveQuery } from "./fixtures/brave-search";
import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  OfferDiscovery,
  IncompleteOfferComparison,
} from "../src/components/offer-discovery";
import { conciseResearchDescription } from "../src/lib/offer-discovery";
import { providerOriginRequest } from "../src/lib/research-geography";
vi.mock("server-only", () => ({}));
import {
  classifyProviderSource,
  discoverOffers,
  BRAVE_SEARCH_URL,
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
const unscopedInstruction = "Research $20 AI model plans";
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
    "OpenAI is an American AI company. OpenAI develops language models. Chinese language support and China token pricing region.",
  ),
  source(
    "https://credits.example/pricing",
    "Credits plans",
    "Generic prepaid credit packages for AI assistants.",
  ),
];
// Replays the screenshot titles with constructed excerpts and representative URLs.
const publisherNoise = [
  source(
    "https://pickurai.ai/chinese-ai-models-pricing",
    "Chinese AI Models Pricing (2026): Paid Plans & API Token Costs — Pickurai.ai",
    "Chinese AI models offer paid AI API plans and pay-as-you-go token pricing.",
  ),
  source(
    "https://chinese-ai-tools.example/pricing",
    "Chinese AI model database and API pricing",
    "Chinese AI Tools lists model plans and AI API pricing.",
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
  EARMARK_RESEARCH_QUERY_PLANNER: "false",
  EARMARK_GEMINI_ENABLED: "true",
  AI_ENABLE_NETWORK: "true",
  GEMINI_API_KEY: "offline-gemini-key-only",
  BRAVE_SEARCH_API_KEY: "offline-brave-key-only",
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
  return vi.fn<typeof fetch>(async (input) => {
    if (String(input).startsWith(`${BRAVE_SEARCH_URL}?`)) {
      searches += 1;
      const body = { query: readBraveQuery(input) };
      const results = searches === 1 ? initial : searches === 2 ? followup : [];
      return braveSearchResponse({
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
  const reference = (name: string, website: string, facts: string) =>
    source(
      `https://en.wikipedia.org/wiki/${name.replaceAll(" ", "_")}`,
      name,
      `${facts} Official API platform: ${website}`,
    );

  it("keeps the reported pricing article and model index out of provider results and the collector", async () => {
    const request = "find $20 chinese ai models";
    const fetcher = offlineTransport(publisherNoise, []);
    const onRetrievalSummary = vi.fn();
    for (const item of publisherNoise)
      expect(classifyProviderSource(item, request)).toBe("editorial");
    await expect(
      discoverOffers(request, env, fetcher, 2000, {
        deadlineAt: performance.now() + 55_000,
        onFailure: vi.fn(),
        onRetrievalSummary,
      }),
    ).rejects.toThrow("DISCOVERY_REGIONAL_PROVIDERS_UNVERIFIED");
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(
      fetcher.mock.calls.every(([input]) =>
        String(input).startsWith(`${BRAVE_SEARCH_URL}?`),
      ),
    ).toBe(true);
    expect(onRetrievalSummary).toHaveBeenCalledWith(
      expect.objectContaining({
        verifiedProviders: 0,
        candidateProviders: 0,
        relevantResults: 0,
        rejectedSources: expect.objectContaining({ editorial: 2 }),
      }),
    );
  });

  it("compares the walkthrough's weather API plans using corroborated pricing, with unknown PayPal acceptance", async () => {
    const plans = [
      {
        provider: "Northwind",
        domain: "northwind.example",
        service: "Starter",
        dollars: 12,
        fit: "matches",
      },
      {
        provider: "Southwind",
        domain: "southwind.example",
        service: "Team",
        dollars: 35,
        fit: "does-not-match",
      },
    ] as const;
    const pricingPages = plans.map(({ provider, domain, service, dollars }) =>
      source(
        `https://${domain}/pricing`,
        `${provider} Weather API Pricing`,
        `${service} costs USD ${dollars} per month. Weather API documentation.`,
      ),
    );
    const refs = plans.map(({ provider, domain }) =>
      reference(
        provider,
        `https://${domain}/`,
        `${provider} provides weather data.`,
      ),
    );
    const reported = plans.map(({ provider, service, dollars }, index) => ({
      provider,
      service,
      priceMinor: String(dollars * 100),
      currency: "USD",
      billing: "per month",
      availability: null,
      delivery: null,
      slaMinutes: null,
      paypal: "unknown",
      paypalEvidence: null,
      sourceUrls: [pricingPages[index]?.url],
    }));
    const result = await discoverOffers(
      "Find a weather API under $25 per month and check PayPal acceptance",
      env,
      offlineTransport([...pricingPages, ...refs], [], reported),
      2500,
    );
    expect(result.offers).toHaveLength(2);
    for (const [index, { provider, dollars, fit }] of plans.entries()) {
      expect(result.offers[index]).toMatchObject({
        provider,
        priceMinor: String(dollars * 100),
        reviewFit: fit,
        paypal: "unknown",
        pricing: {
          status: "source-matched",
          period: "month",
          sourceUrl: pricingPages[index]?.url,
        },
      });
    }
    expect(result.reviewRecommendation).toBe(0);
    expect(result.officialProviders?.map(({ url }) => url)).toEqual(
      pricingPages.map(({ url }) => url),
    );
    const html = renderToStaticMarkup(
      createElement(OfferDiscovery, { result, researchBudgetMinor: 2500 }),
    );
    expect(html).toContain("12.00 USD");
    expect(html).toContain("35.00 USD");
    expect(html).toContain("Matches requirements");
    expect(html).toContain("Does not match");
    expect(result).toMatchObject({
      proposal: null,
      fundsReserved: false,
      ownerAuthorized: false,
    });
  });

  it.each([
    [
      "Find $20 Canadian transactional email API plans",
      "Transactional email API pricing",
      "Transactional email API monthly billing.",
      "Northwind is a Canadian email service provider.",
    ],
    [
      "Find photo backup plans from providers based in Germany",
      "Photo backup subscription",
      "Photo backup pricing and storage plans.",
      "Northwind is headquartered in Berlin, Germany.",
    ],
    [
      "Buy solar lanterns from Kenya under $20",
      "Solar lantern store",
      "Buy Northwind solar lanterns. Product warranty included.",
      "Northwind is based in Nairobi, Kenya.",
    ],
  ])(
    "verifies official sources for non-AI searches with an origin: %s",
    async (request, title, snippet, origin) => {
      const correct = source(
        "https://northwind.example/products/offer",
        title,
        snippet,
      );
      const wrong = source(
        "https://southwind.example/products/offer",
        title,
        `${snippet} Available worldwide.`,
      );
      const possible = source("https://other.example/pricing", title, snippet);
      const fetcher = offlineTransport(
        [wrong, possible, correct],
        [
          reference("Northwind", "https://northwind.example/", origin),
          reference(
            "Southwind",
            "https://southwind.example/",
            "Southwind is based in Sweden and sells worldwide.",
          ),
        ],
      );
      const result = await discoverOffers(request, env, fetcher, 2000);
      expect(result.officialProviders?.map(({ url }) => url)).toEqual([
        correct.url,
      ]);
      expect(result.providerCandidates).toEqual([]);
      expect(fetcher).toHaveBeenCalledTimes(3);
      const html = renderToStaticMarkup(
        createElement(OfferDiscovery, { result }),
      );
      expect(html).toContain(correct.url);
      expect(html).not.toContain(wrong.url);
      expect(html).not.toContain(possible.url);
      const collector = String(fetcher.mock.calls[2]?.[1]?.body);
      expect(collector).toContain(correct.url);
      expect(collector).not.toContain(wrong.url);
      expect(collector).not.toContain(possible.url);
    },
  );

  it("distinguishes country of origin from language, service availability and 'us' as a pronoun", () => {
    for (const request of [
      "Find us running shoes",
      "Find French translation providers",
      "Find backup services available in the UK",
      "Find plans that accept American Express",
      "Find cloud storage plans under US$20",
    ]) {
      expect(providerOriginRequest(request).countries).toEqual([]);
    }
    expect(
      providerOriginRequest("Find $20 US cloud storage").countries,
    ).toEqual(["United States"]);
    expect(
      providerOriginRequest("Find garden tools from New Zealand").countries,
    ).toEqual(["New Zealand"]);
  });

  it("seeks independent evidence for an explicit official-links request without a country", async () => {
    const docs = source(
      "https://northwind.example/docs",
      "Northwind weather API",
      "Weather forecast API documentation.",
    );
    const unaffiliated = source(
      "https://southwind.example/pricing",
      "Southwind weather API",
      "Weather forecast API pricing.",
    );
    const result = await discoverOffers(
      "Find official links for weather API plans",
      env,
      offlineTransport(
        [unaffiliated, docs],
        [
          reference(
            "Northwind",
            "https://northwind.example/",
            "Northwind provides weather data.",
          ),
        ],
      ),
      2000,
    );
    expect(result.officialProviders?.map(({ url }) => url)).toEqual([docs.url]);
    expect(result.providerCandidates).toEqual([]);
  });

  it("keeps official evidence below the old five-result window in both searches", async () => {
    const docs = source(
      "https://northwind.example/docs",
      "Northwind weather API",
      "Weather forecast API documentation.",
    );
    const unrelated = (topic: string) =>
      Array.from({ length: 5 }, (_, index) =>
        source(
          `https://example.com/news/${topic}-${index}`,
          `News about ${topic}`,
          `Latest ${topic} headlines.`,
        ),
      );
    const fetcher = offlineTransport(
      [...unrelated("baseball"), docs],
      [
        ...unrelated("tennis"),
        reference(
          "Northwind",
          "https://northwind.example/",
          "Northwind provides weather data.",
        ),
      ],
    );

    const result = await discoverOffers(
      "Find official links for weather API plans",
      env,
      fetcher,
      2000,
    );
    const searchUrls = fetcher.mock.calls
      .map(([url]) => String(url))
      .filter((url) => url.startsWith(`${BRAVE_SEARCH_URL}?`));
    expect(
      searchUrls.map((url) => new URL(url).searchParams.get("count")),
    ).toEqual(["10", "10"]);
    expect(result.officialProviders?.map(({ url }) => url)).toEqual([docs.url]);
    expect(result.offers).toEqual([]);
  });

  const chineseProviders = [
    [
      "DeepSeek",
      "https://api-docs.deepseek.com/quick_start/pricing",
      "https://deepseek.com/",
      "DeepSeek API models and pricing",
      "Language model API token rates and pay-as-you-go billing.",
    ],
    [
      "Alibaba Cloud",
      "https://www.alibabacloud.com/help/en/model-studio/model-pricing",
      "https://alibabacloud.com/",
      "Qwen model pricing",
      "Input and output token rates for Qwen language models.",
    ],
    [
      "Moonshot AI",
      "https://platform.moonshot.ai/docs/pricing",
      "https://moonshot.ai/",
      "Kimi API pricing",
      "Kimi language model token pricing and prepaid credits.",
    ],
  ] as const;
  const usProviders = [
    [
      "OpenAI",
      "https://chatgpt.com/pricing",
      "https://chatgpt.com/",
      "ChatGPT plans",
      "Access to our latest AI models. Plus subscription at USD 20 per month.",
    ],
    [
      "Google",
      "https://one.google.com/about/google-ai-plans/",
      "https://google.com/",
      "Google AI plans",
      "Gemini AI chatbot subscription plans and monthly pricing.",
    ],
    [
      "Anthropic",
      "https://claude.com/pricing",
      "https://claude.com/",
      "Claude pricing",
      "Claude AI chatbot plans for individual and team subscriptions.",
    ],
  ] as const;

  it.each([
    [
      "Find me $20 Chinese ai model plans",
      "Chinese",
      chineseProviders,
      usProviders[0],
    ],
    [
      "Find me $20 us ai model plans",
      "American",
      usProviders,
      chineseProviders[0],
    ],
    ["Find a $20 Chinese ai plan", "Chinese", chineseProviders, usProviders[0]],
    [
      "Find me a $20 Chinese ai model plan",
      "Chinese",
      chineseProviders,
      usProviders[0],
    ],
  ] as const)(
    "shows only corroborated country-matched links for %s even with no structured offers",
    async (request, country, providers, wrongProvider) => {
      const pages = providers.map(([, url, , title, snippet]) =>
        source(url, title, snippet),
      );
      const refs = providers.map(([name, , official]) =>
        source(
          `https://en.wikipedia.org/wiki/${name.replaceAll(" ", "_")}`,
          name,
          `${request === "Find me a $20 Chinese ai model plan" ? "Background information. ".repeat(35) : ""}${name} is an ${country} technology company. ${name} develops language models. Website | [${new URL(official).hostname}](${official})`,
        ),
      );
      const [wrongName, wrongUrl, wrongOfficial, wrongTitle, wrongSnippet] =
        wrongProvider;
      const wrongPage = source(
        wrongUrl,
        wrongTitle,
        `${wrongSnippet} Available in both China and the United States.`,
      );
      const wrongRef = reference(
        wrongName,
        wrongOfficial,
        `${wrongName} is a ${country === "Chinese" ? "US-based" : "China-based"} AI company that develops language models.`,
      );
      const reseller = source(
        "https://aicodewith.ai/pricing",
        "AI API Pricing Plans and Credits | AI Code With",
        "Buy credits once, use across 30+ AI models. One balance, all models.",
      );
      const unrelatedProduct = source(
        "https://store.google.com/product/pixel/",
        "Pixel phone models and plans",
        "Compare phone models and see monthly carrier subscription pricing.",
      );
      const fetcher = offlineTransport(
        [...pages, wrongPage, reseller, ...publisherNoise],
        [...refs, wrongRef, unrelatedProduct],
      );
      const result = await discoverOffers(request, env, fetcher, 2000);
      expect(result.officialProviders?.map(({ url }) => url)).toEqual(
        expect.arrayContaining(pages.map(({ url }) => url)),
      );
      expect(result.officialProviders).toHaveLength(3);
      expect(result.providerCandidates).toEqual([]);
      expect(result.offers).toEqual([]);
      expect(
        result.officialProviders?.every(
          ({ pricingStatus, checkoutUrl }) =>
            pricingStatus === "unknown" && checkoutUrl === null,
        ),
      ).toBe(true);
      const query = readBraveQuery(fetcher.mock.calls[1]?.[0]);
      expect(query).toContain(
        new URL(pages[0]?.url ?? "").hostname.replace(/^api-docs\./, ""),
      );
      const collector = JSON.parse(String(fetcher.mock.calls[2]?.[1]?.body));
      const { trustedTask, observationsIncludingUntrustedProviderData } =
        JSON.parse(collector.contents[0].parts[0].text);
      expect(trustedTask).toMatchObject({
        instruction: request,
        budgetMinor: "2000",
      });
      expect(
        observationsIncludingUntrustedProviderData.results
          .map(({ url }: { url: string }) => url)
          .sort(),
      ).toEqual(pages.map(({ url }) => url).sort());
      const html = renderToStaticMarkup(
        createElement(OfferDiscovery, { result, researchBudgetMinor: 2000 }),
      );
      expect(html).toContain("Verified official providers");
      expect(html).toContain("Price: Unknown");
      expect(html).not.toContain(wrongUrl);
      expect(html).not.toContain(reseller.url);
      expect(html).not.toContain(unrelatedProduct.url);
    },
  );

  it.each([
    [
      "Find me $20 us ai model plans",
      "Sparse model API pricing",
      "We are an American AI company and develop language models. Starter plan USD 20 per month.",
    ],
    [
      "Find $20 photo backup plans from Germany",
      "Sparse photo backup pricing",
      "Starter photo backup plan costs USD 20 per month.",
    ],
  ])(
    "keeps a plausible provider link separate from verified offers and skips the collector for %s",
    async (instruction, title, snippet) => {
      const document = source("https://sparse.example/pricing", title, snippet);
      const independentHostOnly = reference(
        "Sparse",
        "https://sparse.example/",
        "Sparse provides subscription services in several countries.",
      );
      const fetcher = offlineTransport([document], [independentHostOnly]);
      const result = await discoverOffers(instruction, env, fetcher, 2000);
      expect(result.providerCandidates?.map(({ url }) => url)).toEqual([
        document.url,
      ]);
      expect(result.officialProviders).toEqual([]);
      expect(result.offers).toEqual([]);
      expect(result.evidence).toMatchObject({
        modelTurns: 0,
        collectedTool: null,
        paymentSearchResultsCount: 0,
      });
      expect(fetcher).toHaveBeenCalledTimes(2);
    },
  );

  it("returns relevant plan links for the screenshot prompt when search finds pricing pages but lacks corroborating references", async () => {
    const instruction = "Find me a $20 Chinese ai model plan";
    const product = source(
      "https://api-docs.deepseek.com/quick_start/pricing",
      "Models & Pricing | DeepSeek API Docs",
      "Model API input and output token rates and pay-as-you-go billing.",
    );
    const aliasedProduct = source(
      "https://platform.moonshot.ai/docs/pricing",
      "Kimi API pricing",
      "Moonshot AI offers Kimi language model token pricing.",
    );
    const reseller = source(
      "https://aicodewith.ai/pricing",
      "AI Code With API pricing",
      "Buy credits once, use across 30+ AI models. Unified billing.",
    );
    const unrelated = source(
      "https://shattered.io/openai-cuts-funding-target-10-billion-20-billion-1-25-trillion-valuation-2026",
      "OpenAI Funding Target Cut $10B to $20B [2026]",
      "Sensible hedges are cheap. Keep prompts portable across providers.",
    );
    const wrongCountry = source(
      "https://chatgpt.com/pricing",
      "ChatGPT AI model plans",
      "Our AI chatbot subscription is offered worldwide.",
    );
    const evidence = reference(
      "OpenAI",
      "https://chatgpt.com/",
      "OpenAI is an American AI company that develops language models.",
    );
    const fetcher = offlineTransport(
      [product, aliasedProduct, reseller, unrelated, wrongCountry],
      [evidence],
    );
    const onEvidenceGap = vi.fn();
    const result = await discoverOffers(instruction, env, fetcher, 2000, {
      deadlineAt: performance.now() + 55000,
      onFailure: vi.fn(),
      onEvidenceGap,
    });
    expect(readBraveQuery(fetcher.mock.calls[0]?.[0])).toBe(
      "Chinese ai model plan official provider pricing documentation",
    );
    expect(result.providerCandidates?.map(({ url }) => url)).toEqual([
      product.url,
      aliasedProduct.url,
    ]);
    expect(result.officialProviders).toEqual([]);
    expect(result.offers).toEqual([]);
    expect(result.reviewRecommendation).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(onEvidenceGap).toHaveBeenCalledWith({
      initialResults: 5,
      followupResults: 1,
      relevantPages: expect.any(Number),
      visibleResearchLinks: 2,
      searchRequests: 2,
    });
    const html = renderToStaticMarkup(
      createElement(OfferDiscovery, { result, researchBudgetMinor: 2000 }),
    );
    expect(html).toContain(product.url);
    expect(html).toContain(aliasedProduct.url);
    expect(html).toContain("identity unverified");
    expect(html).toContain("Price: Unknown");
    expect(html).not.toContain(wrongCountry.url);
    expect(html).not.toContain(reseller.url);
    expect(html).not.toContain(unrelated.url);
    expect(html).not.toContain("Verified official providers");
  });

  it("requires corroboration when the user explicitly requests official links", async () => {
    const document = source(
      "https://northwind.example/pricing",
      "Northwind weather API pricing",
      "Weather forecast API plans and monthly pricing.",
    );
    const fetcher = offlineTransport([document], []);
    await expect(
      discoverOffers(
        "Find official links for weather API providers based in Canada",
        env,
        fetcher,
        2000,
      ),
    ).rejects.toThrow("DISCOVERY_REGIONAL_PROVIDERS_UNVERIFIED");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("verifies an in-budget subscription from the official product domain and withholds an above-budget recommendation", async () => {
    const document = source(
      "https://chatgpt.com/pricing",
      "ChatGPT AI model plans",
      "Plus costs USD 20 per month. Pro costs USD 200 per month.",
    );
    const identity = reference(
      "OpenAI",
      "https://chatgpt.com/",
      "OpenAI is an American AI company that develops language models.",
    );
    const offers = [
      ["Plus", "2000"],
      ["Pro", "20000"],
    ].map(([service, priceMinor]) => ({
      provider: "OpenAI",
      service,
      priceMinor,
      currency: "USD",
      billing: "per month",
      availability: null,
      delivery: null,
      slaMinutes: null,
      paypal: "unknown",
      paypalEvidence: null,
      sourceUrls: [document.url],
    }));
    const result = await discoverOffers(
      "Find me $20 us ai model plans",
      env,
      offlineTransport([document], [identity], offers),
      2500,
    );
    expect(result.offers).toEqual([
      expect.objectContaining({
        service: "Plus",
        priceMinor: "2000",
        providerVerification: "corroborated",
        officialMerchantUrl: document.url,
        officialCheckoutUrl: null,
        reviewFit: "matches",
      }),
      expect.objectContaining({
        service: "Pro",
        priceMinor: "20000",
        reviewFit: "does-not-match",
        policy: expect.objectContaining({
          reasons: expect.arrayContaining(["RESEARCH_BUDGET_EXCEEDED"]),
        }),
      }),
    ]);
    expect(result.reviewRecommendation).toBe(0);
  });

  it.each([
    [
      "Qwen",
      "Alibaba Cloud",
      "https://www.alibabacloud.com/help/en/model-studio/model-pricing",
      "https://www.alibabacloud.com/",
    ],
    [
      "GLM",
      "Zhipu AI",
      "https://open.bigmodel.cn/pricing",
      "https://open.bigmodel.cn/",
    ],
    [
      "Nimbus",
      "AuroraForge",
      "https://tessera-cloud.example/docs/pricing",
      "https://tessera-cloud.example/",
    ],
  ])(
    "retains sparse %s docs and corroborates their corporate alias independently",
    async (product, company, url, website) => {
      const document = source(
        url,
        `${product} API pricing`,
        `${product}: input USD 0.10 per 1M tokens; output USD 0.30 per 1M tokens.`,
      );
      const identity = reference(
        company,
        website,
        `${company} is a Chinese AI company that develops ${product} language models.`,
      );
      expect(classifyProviderSource(document, instruction)).toBe("candidate");
      expect(
        classifyProviderSource(document, instruction, [document, identity]),
      ).toBe("first-party");
      expect(
        classifyProviderSource(
          { ...document, title: `${product} Official API pricing` },
          instruction,
          [document, identity],
        ),
      ).toBe("first-party");
      const result = await discoverOffers(
        instruction,
        env,
        offlineTransport([document, identity], []),
        2000,
      );
      expect(result.offers).toEqual([]);
      expect(result.officialProviders?.map((provider) => provider.url)).toEqual(
        [url],
      );
      expect(result.officialProviders?.[0]?.verificationSources).toEqual([
        identity.url,
      ]);
      const html = renderToStaticMarkup(
        createElement(OfferDiscovery, { result }),
      );
      expect(html).toContain(`href="${url}"`);
      expect(html).toContain(`href="${identity.url}"`);
    },
  );

  it("does not verify arbitrary self-assertions, cloned claims, or unrelated references", () => {
    const claimed = source(
      "https://fabricated.example/pricing",
      "Fabricated API pricing",
      "Fabricated is a Chinese AI company. We develop our own language models. Model API token plans.",
    );
    const identity = reference(
      "Fabricated",
      "https://fabricated.example/",
      "Fabricated is a Chinese AI company that develops language models.",
    );
    expect(classifyProviderSource(claimed, instruction)).toBe("candidate");
    for (const invalid of [
      { ...identity, url: "https://arbitrary.example/about" },
      {
        ...identity,
        url: "https://en.wikipedia.org.evil.example/wiki/Fabricated",
      },
      { ...identity, url: "https://en.wikipedia.org/wiki/User:Fabricated" },
      {
        ...identity,
        snippet: identity.snippet.replace(
          "fabricated.example",
          "another.example",
        ),
      },
      { ...identity, snippet: "Fabricated develops Chinese language models." },
    ])
      expect(
        classifyProviderSource(claimed, instruction, [claimed, invalid]),
      ).toBe("candidate");
  });

  it("does not borrow relevance from another product on the same corporate domain", () => {
    const model = source(
      "https://www.alibabacloud.com/help/en/model-studio/model-pricing",
      "Qwen model API pricing",
      "Qwen language model API token rates.",
    );
    const compute = source(
      "https://www.alibabacloud.com/product/ecs/pricing",
      "Alibaba Cloud ECS pricing",
      "Elastic compute virtual machine pricing and server API access.",
    );
    const identity = reference(
      "Alibaba Cloud",
      "https://www.alibabacloud.com/",
      "Alibaba Cloud is a Chinese AI company that develops Qwen language models.",
    );
    expect(
      classifyProviderSource(model, "Research Alibaba Qwen model API pricing", [
        model,
        compute,
        identity,
      ]),
    ).toBe("first-party");
    expect(
      classifyProviderSource(
        compute,
        "Research Alibaba Qwen model API pricing",
        [model, compute, identity],
      ),
    ).toBe("irrelevant");
  });

  it("corroborates unrelated corporate aliases without assuming the product name equals its domain", async () => {
    const document = source(
      "https://postmarkapp.com/pricing",
      "Postmark transactional email pricing",
      "SMTP and transactional email API plans.",
    );
    const identity = reference(
      "Postmark",
      "https://postmarkapp.com/",
      "Postmark provides transactional email services.",
    );
    const request =
      "Could you help me find a service that sends transactional emails under $20?";
    expect(
      classifyProviderSource(document, request, [document, identity]),
    ).toBe("first-party");
    const result = await discoverOffers(
      request,
      env,
      offlineTransport([document, identity], []),
      2000,
    );
    expect(result.officialProviders?.map((provider) => provider.url)).toEqual([
      document.url,
    ]);
  });

  it.each([
    [
      "Could you please help me find a reliable service that sends transactional emails under $20?",
      "https://resend.com/pricing",
      "Resend pricing",
      "Resend provides a transactional email API.",
    ],
    [
      "I would like a tool with weather forecasts for my app below $20",
      "https://climate.example/docs/pricing",
      "Climate API pricing",
      "Weather forecast API pricing and billing plans.",
    ],
    [
      "Can you suggest cloud object storage API plans under $20?",
      "https://storage.example/pricing",
      "Storage pricing",
      "Cloud object storage API billing plans.",
    ],
  ])(
    "retains relevant documentation for natural requests: %s",
    (request, url, title, snippet) => {
      const document = source(url, title, snippet);
      expect(classifyProviderSource(document, request)).toBe("candidate");
      const unrelated = source(
        "https://resend.com/pricing",
        "Resend pricing",
        "Transactional email API pricing.",
      );
      if (!request.includes("email"))
        expect(classifyProviderSource(unrelated, request)).toBe("irrelevant");
    },
  );

  it("keeps sparse undocumented identities visible without official or checkout claims", async () => {
    const document = source(
      "https://sparse.example/docs/pricing",
      "Nimbus API pricing",
      "Nimbus language model API token pricing.",
    );
    const result = await discoverOffers(
      unscopedInstruction,
      env,
      offlineTransport([document], []),
      2000,
    );
    expect(result.officialProviders).toEqual([]);
    expect(result.providerCandidates?.map((provider) => provider.url)).toEqual([
      document.url,
    ]);
    const html = renderToStaticMarkup(
      createElement(OfferDiscovery, { result, assistedCheckout: true }),
    );
    expect(html).toContain("identity unverified");
    expect(html).toContain(`href="${document.url}"`);
    expect(html).not.toContain("Verified official providers");
    expect(html).not.toContain("Approve for manual checkout");
    expect(html).not.toContain("Continue to merchant checkout");
  });

  it("never recommends or exposes checkout from an uncorroborated provider even with an exact price and retrieved checkout", async () => {
    const document = source(
      "https://fabricated.example/pricing",
      "Fabricated API pricing",
      "Fabricated is a China-based AI company. We develop our own language models. Starter costs USD 20 per month for our model API.",
    );
    const checkout = source(
      "https://fabricated.example/checkout/starter",
      "Starter checkout",
      "Complete your purchase.",
    );
    const result = await discoverOffers(
      unscopedInstruction,
      env,
      offlineTransport(
        [document, checkout],
        [],
        [
          {
            provider: "Fabricated",
            service: "Starter",
            priceMinor: "2000",
            currency: "USD",
            billing: "per month",
            availability: null,
            delivery: null,
            slaMinutes: null,
            paypal: "unknown",
            paypalEvidence: null,
            sourceUrls: [document.url],
          },
        ],
      ),
      2000,
    );
    expect(result.officialProviders).toEqual([]);
    expect(result.offers[0]).toMatchObject({
      providerVerification: "unverified",
      officialMerchantUrl: null,
      officialCheckoutUrl: null,
      reviewFit: "needs-evidence",
      policy: {
        eligible: false,
        reasons: expect.arrayContaining(["PROVIDER_IDENTITY_UNVERIFIED"]),
      },
    });
    expect(result.reviewRecommendation).toBeNull();
  });

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
    "preserves separate unverified candidates for unscoped requests (poisoned offers: %s)",
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
      const noise = badSources.map((item) =>
        item.url.includes("openai.com")
          ? {
              ...item,
              title: "Company funding news",
              snippet: "Business news about financing.",
            }
          : item,
      );
      const transport = offlineTransport(noise, goodSources, modelOffers);
      const result = await discoverOffers(
        unscopedInstruction,
        env,
        transport,
        2000,
      );
      expect(transport).toHaveBeenCalledTimes(4); // Existing search -> provider search -> collector -> payment search.
      expect(result.evidence.searchRequests).toBe(3);
      expect(result.offers).toEqual([]);
      expect(result.officialProviders).toEqual([]);
      expect(result.providerCandidates?.map((item) => item.url)).toEqual(
        goodSources.map((item) => item.url),
      );
      expect(result).toMatchObject({
        proposal: null,
        ownerAuthorized: false,
        persisted: false,
        fundsReserved: false,
      });
      for (const item of result.providerCandidates ?? []) {
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
    expect(classifyProviderSource(novel, instruction)).toBe("candidate");
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
    ).not.toBe("first-party");
    expect(
      classifyProviderSource(
        {
          ...novel,
          snippet:
            "Haihe develops language models with Chinese language support.",
        },
        instruction,
      ),
    ).not.toBe("first-party");
    expect(
      classifyProviderSource({ ...novel, title: "Pricing" }, instruction),
    ).toBe("candidate");
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
    ).toBe("candidate");
    expect(
      classifyProviderSource(
        {
          ...sparse,
          snippet:
            "We develop our own language models. Alibaba is a China-based AI company.",
        },
        instruction,
      ),
    ).not.toBe("first-party");
    expect(
      classifyProviderSource(
        { ...sparse, snippet: "We develop Chinese language models." },
        instruction,
      ),
    ).not.toBe("first-party");
  });

  it("returns a clear empty state when no suitable first-party source is verified", async () => {
    await expect(
      discoverOffers(
        instruction,
        env,
        offlineTransport(badSources, badSources),
        2000,
      ),
    ).rejects.toThrow("DISCOVERY_REGIONAL_PROVIDERS_UNVERIFIED");
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
      [
        reference(
          "DeepSeek",
          "https://deepseek.com/",
          "DeepSeek is a Chinese AI company that develops language models.",
        ),
      ],
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
    expect(result.offers[0]?.sources.map(({ url }) => url)).not.toContain(
      article.url,
    );
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
    const transport = offlineTransport(
      [...email, ...irrelevant],
      [
        reference(
          "Resend",
          "https://resend.com/",
          "Resend provides transactional email infrastructure.",
        ),
      ],
    );
    const result = await discoverOffers(request, env, transport, 2000);
    expect(transport).toHaveBeenCalledTimes(4);
    expect(readBraveQuery(transport.mock.calls[1]?.[0])).toContain(
      "resend.com OR postmarkapp.com",
    );
    expect(result.officialProviders?.map((item) => item.url)).toEqual([
      email[0]?.url,
    ]);
    expect(result.providerCandidates?.map((item) => item.url)).toEqual([
      email[1]?.url,
    ]);
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
          instruction: "Compare Resend pricing",
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
