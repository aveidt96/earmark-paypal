import { describe, expect, it, vi } from "vitest";
import {
  GeminiModel,
  createGeminiModel,
  createModel,
  isGeminiEnabled,
  type GeminiSettings,
} from "../src/models.js";
import {
  decisionSchema,
  identity,
  toolNames,
  toolSchemas,
  type AgentContext,
} from "../src/domain.js";
import { maliciousDescription } from "../src/providers.js";

const context: AgentContext = {
  task: {
    taskHash: identity("task"),
    purchaseKey: "purchase1",
    instruction:
      "Find the cheapest approved provider offering a suitable Lagos weather dataset.",
    budget: "10000000",
  },
  observations: { quotes: [] },
};

const settings: GeminiSettings = {
  baseUrl: "https://generativelanguage.googleapis.com/v1beta",
  model: "gemini-3.8-flash",
  apiKey: "synthetic-test-credential",
  timeoutMs: 100,
  networkEnabled: true,
};

function contentResponse(parts: unknown) {
  return new Response(
    JSON.stringify({ candidates: [{ content: { parts } }] }),
    { status: 200 },
  );
}

function adapter(parts: unknown, status = 200) {
  const fetcher = vi.fn<typeof fetch>(async () =>
    status === 200 ? contentResponse(parts) : new Response("{}", { status }),
  );
  return { model: new GeminiModel(settings, fetcher), fetcher };
}

function enabledEnv(extra: Record<string, string | undefined> = {}) {
  return {
    AGENT_MODEL_PROVIDER: "gemini",
    EARMARK_GEMINI_ENABLED: "true",
    AI_ENABLE_NETWORK: "true",
    GEMINI_API_KEY: "synthetic-test-credential",
    ...extra,
  };
}

describe("gemini feature switch (disabled by default)", () => {
  it("stays on deterministic mock without explicit provider selection", () =>
    expect(createModel({}).mode).toBe("mock"));

  it("reports the backend-authoritative flag", () => {
    expect(isGeminiEnabled({})).toBe(false);
    expect(isGeminiEnabled({ EARMARK_GEMINI_ENABLED: "false" })).toBe(false);
    expect(isGeminiEnabled({ EARMARK_GEMINI_ENABLED: "true" })).toBe(true);
    expect(isGeminiEnabled({ EARMARK_GEMINI_ENABLED: "yes" })).toBe(false);
  });

  it("refuses Gemini construction while disabled, before any network use", () => {
    const fetcher = vi.fn<typeof fetch>(async () => contentResponse([]));
    expect(() => createModel({ AGENT_MODEL_PROVIDER: "gemini" })).toThrow(
      "GEMINI_DISABLED",
    );
    expect(() =>
      createModel({
        AGENT_MODEL_PROVIDER: "gemini",
        EARMARK_GEMINI_ENABLED: "false",
      }),
    ).toThrow("GEMINI_DISABLED");
    expect(() => createGeminiModel({})).toThrow("GEMINI_DISABLED");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("keeps legacy AGENT_MODEL_MODE working and prefers the new provider name", () => {
    expect(createModel({ AGENT_MODEL_MODE: "mock" }).mode).toBe("mock");
    expect(
      createModel({
        AGENT_MODEL_MODE: "mock",
        AGENT_MODEL_PROVIDER: "gemini",
        EARMARK_GEMINI_ENABLED: "true",
        AI_ENABLE_NETWORK: "true",
        GEMINI_API_KEY: "synthetic-test-credential",
      }).mode,
    ).toBe("gemini");
  });

  it("requires an explicit API key and network opt-in", () => {
    expect(() => createGeminiModel(enabledEnv({ GEMINI_API_KEY: "" }))).toThrow(
      "MISSING_MODEL_CONFIGURATION",
    );
    expect(() =>
      createGeminiModel(enabledEnv({ AI_ENABLE_NETWORK: "false" })),
    ).toThrow("MODEL_NETWORK_DISABLED");
    expect(
      () => new GeminiModel({ ...settings, networkEnabled: false }),
    ).toThrow("MODEL_NETWORK_DISABLED");
  });

  it("rejects unknown provider names without touching Gemini", () =>
    expect(() => createModel({ AGENT_MODEL_PROVIDER: "invented" })).toThrow(
      "INVALID_MODEL_MODE",
    ));

  it("records mode and model identity for journal attribution", () => {
    const model = new GeminiModel(settings);
    expect(model.mode).toBe("gemini");
    expect(model.modelName).toBe("gemini-3.8-flash");
  });
});

describe("gemini endpoint allowlist (server-side key only)", () => {
  it.each([
    "http://external.example/v1beta",
    "https://user:secret@generativelanguage.googleapis.com/v1beta",
    "https://generativelanguage.googleapis.com/v1beta?secret=x",
    "https://untrusted.example/v1beta",
    "https://generativelanguage.googleapis.com.evil.example/v1beta",
  ])("rejects unsafe/unapproved endpoint %s", (baseUrl) =>
    expect(() => new GeminiModel({ ...settings, baseUrl })).toThrow(),
  );

  it.each([
    "https://generativelanguage.googleapis.com/v1beta",
    "http://127.0.0.1:8080/v1beta",
  ])("accepts the official endpoint or loopback test endpoint %s", (baseUrl) =>
    expect(() => new GeminiModel({ ...settings, baseUrl })).not.toThrow(),
  );
});

describe("gemini function calling over existing restricted tools", () => {
  it("maps a validated function call and exposes all eight tools", async () => {
    const { model, fetcher } = adapter([
      {
        functionCall: {
          name: "getProviderQuote",
          args: { providerId: "datahub" },
        },
      },
    ]);
    const decision = await model.decide(context);
    expect(decision).toMatchObject({
      kind: "tool",
      name: "getProviderQuote",
      args: { providerId: "datahub" },
    });
    expect(decisionSchema.safeParse(decision).success).toBe(true);
    expect(
      toolSchemas[
        decision.kind === "tool" ? decision.name : "getMandate"
      ].safeParse(decision.kind === "tool" ? decision.args : {}).success,
    ).toBe(true);
    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toContain(":generateContent");
    expect(url).toContain(encodeURIComponent(settings.model));
    expect(url).not.toContain(settings.apiKey);
    expect(init.redirect).toBe("error");
    const headers = init.headers as Record<string, string>;
    expect(headers["x-goog-api-key"]).toBe(settings.apiKey);
    const body = JSON.parse(String(init.body));
    expect(
      body.tools[0].functionDeclarations.map((t: { name: string }) => t.name),
    ).toEqual(toolNames);
    expect(body.tools[0].functionDeclarations[0].parameters).toBeUndefined();
    expect(body.tools[0].functionDeclarations[0].parametersJsonSchema).toEqual({
      type: "object",
      properties: {},
      additionalProperties: false,
    });
    expect(body.generationConfig).toEqual({
      maxOutputTokens: 600,
      thinkingConfig: { thinkingLevel: "low" },
    });
    expect(JSON.stringify(body)).not.toContain(settings.apiKey);
  });

  it("accepts a structured finish answer and rejects tool-shaped text", async () => {
    const { model } = adapter([
      {
        text: JSON.stringify({
          kind: "finish",
          summary: "Both quotes compared.",
        }),
      },
    ]);
    expect(await model.decide(context)).toMatchObject({ kind: "finish" });
    const bad = adapter([
      { text: JSON.stringify({ kind: "tool", name: "getMandate", args: {} }) },
    ]);
    await expect(bad.model.decide(context)).rejects.toThrow(
      "INVALID_MODEL_RESPONSE",
    );
  });

  it.each([
    [[{ functionCall: { name: "withdrawFunds", args: {} } }]],
    [
      [
        {
          functionCall: { name: "getProviderQuote", args: { providerId: "" } },
        },
      ],
    ],
    [[{ functionCall: { name: "getMandate", args: { extra: true } } }]],
    [[{ text: "unstructured answer" }]],
    [[]],
    [[{ text: "x".repeat(10001) }]],
  ])(
    "rejects unknown functions, bad arguments and malformed output %j",
    async (parts) => {
      const { model } = adapter(parts);
      await expect(model.decide(context)).rejects.toThrow(
        "INVALID_MODEL_RESPONSE",
      );
    },
  );

  it("keeps provider injection as user data, never system instruction or credentials", async () => {
    const { model, fetcher } = adapter([
      { functionCall: { name: "getMandate", args: {} } },
    ]);
    const withProvider = structuredClone(context);
    withProvider.observations.quotes = [
      {
        providerId: "datahub",
        taskHash: context.task.taskHash,
        token: `0x${"1".repeat(40)}`,
        price: "6000000",
        quoteId: identity("q"),
        expiresAt: 9999999999,
        currency: "mock-USDC",
        decimals: 6,
        commitment: identity("data"),
        description: maliciousDescription,
      },
    ];
    await model.decide(withProvider);
    const [, init] = fetcher.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body.systemInstruction.parts[0].text).not.toContain(
      maliciousDescription,
    );
    expect(body.contents[0].parts[0].text).toContain(maliciousDescription);
    expect(JSON.stringify(body)).not.toContain(settings.apiKey);
  });
});

describe("gemini transport safety (bounded retries, no duplicates)", () => {
  it("surfaces transport failures without a response", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => {
      throw new TypeError("offline");
    });
    await expect(
      new GeminiModel(settings, fetcher).decide(context),
    ).rejects.toThrow("MODEL_TRANSPORT_ERROR");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("maps authentication failures without retry", async () => {
    for (const status of [401, 403]) {
      const fetcher = vi.fn<typeof fetch>(
        async () => new Response("{}", { status }),
      );
      await expect(
        new GeminiModel(settings, fetcher).decide(context),
      ).rejects.toThrow("MODEL_AUTH_ERROR");
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
  });

  it("retries a rate limit once, then reports exhaustion", async () => {
    let calls = 0;
    const flaky = vi.fn<typeof fetch>(async () => {
      calls += 1;
      return calls === 1
        ? new Response("{}", { status: 429 })
        : contentResponse([{ functionCall: { name: "getMandate", args: {} } }]);
    });
    const decision = await new GeminiModel(settings, flaky).decide(context);
    expect(decision).toMatchObject({ kind: "tool", name: "getMandate" });
    expect(flaky).toHaveBeenCalledTimes(2);
    const limited = vi.fn<typeof fetch>(
      async () => new Response("{}", { status: 429 }),
    );
    await expect(
      new GeminiModel(settings, limited).decide(context),
    ).rejects.toThrow("MODEL_RATE_LIMITED");
    expect(limited).toHaveBeenCalledTimes(2);
  });

  it("retries one transient server error and maps other failures", async () => {
    let calls = 0;
    const flaky = vi.fn<typeof fetch>(async () => {
      calls += 1;
      return calls === 1
        ? new Response("{}", { status: 500 })
        : contentResponse([{ functionCall: { name: "getMandate", args: {} } }]);
    });
    await expect(
      new GeminiModel(settings, flaky).decide(context),
    ).resolves.toMatchObject({ name: "getMandate" });
    const bad = vi.fn<typeof fetch>(
      async () => new Response("{}", { status: 400 }),
    );
    await expect(
      new GeminiModel(settings, bad).decide(context),
    ).rejects.toThrow("MODEL_API_ERROR");
    expect(bad).toHaveBeenCalledTimes(1);
  });

  it("enforces the configured timeout without hanging", async () => {
    const hanging = vi.fn<typeof fetch>(() => new Promise<Response>(() => {}));
    await expect(
      new GeminiModel({ ...settings, timeoutMs: 10 }, hanging).decide(context),
    ).rejects.toThrow("MODEL_TIMEOUT");
  });

  it("rejects oversized model payloads", async () => {
    const huge = vi.fn<typeof fetch>(
      async () => new Response("x".repeat(1_000_001), { status: 200 }),
    );
    await expect(
      new GeminiModel(settings, huge).decide(context),
    ).rejects.toThrow("INVALID_MODEL_RESPONSE");
  });
});

describe("gemini rollback semantics", () => {
  it("constructs only through the enabled provider path", () => {
    expect(createModel(enabledEnv()).mode).toBe("gemini");
    expect(() =>
      createModel({ ...enabledEnv(), EARMARK_GEMINI_ENABLED: "false" }),
    ).toThrow("GEMINI_DISABLED");
  });

  it("rejects invalid timeout configuration like other providers", () =>
    expect(() =>
      createModel({ ...enabledEnv(), AI_TIMEOUT_MS: "Infinity" }),
    ).toThrow("INVALID_MODEL_TIMEOUT"));

  it("keeps every decision inside the shared runner validation envelope", async () => {
    const { model } = adapter([
      {
        functionCall: {
          name: "requestMandatePayment",
          args: { quoteId: identity("q"), reason: "Cheapest validated offer." },
        },
      },
    ]);
    const decision = await model.decide(context);
    expect(decisionSchema.safeParse(decision).success).toBe(true);
    if (decision.kind === "tool")
      expect(toolSchemas[decision.name].safeParse(decision.args).success).toBe(
        true,
      );
    else throw new Error("expected a tool decision in this fixture");
  });
});
