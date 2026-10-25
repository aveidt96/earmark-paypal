import { describe, it, expect, vi } from "vitest";
import { GeminiModel, type GeminiSettings } from "../src/models.js";
import { createReadOnlyTools } from "../src/read-only.js";
import { runReadOnlyAgent } from "../src/runner.js";
import { EventStream, identity, type AgentContext } from "../src/domain.js";
const settings: GeminiSettings = {
  apiKey: "synthetic-key",
  baseUrl: "https://generativelanguage.googleapis.com/v1beta",
  model: "gemini-3.8-flash",
  timeoutMs: 100,
  networkEnabled: true,
  conversation: true,
};
const context: AgentContext = {
  task: {
    taskHash: identity("task"),
    purchaseKey: "read-only",
    instruction: "Find a weather dataset.",
    budget: "10000000",
  },
  observations: { quotes: [] },
};
describe("native read-only Gemini conversation", () => {
  it("returns matching IDs and preserves opaque signatures without adding credentials", async () => {
    const fetcher = vi.fn<typeof fetch>(
      async () =>
        new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  role: "model",
                  parts: [
                    {
                      functionCall: {
                        name: "getMandate",
                        args: {},
                        id: "call-1",
                      },
                      thoughtSignature: "synthetic-opaque-signature",
                    },
                  ],
                },
              },
            ],
          }),
        ),
    );
    const model = new GeminiModel(settings, fetcher);
    await model.decide(context);
    model.toolResult("getMandate", { result: { cap: "10000000" } });
    await model.decide(context);
    const body = JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body));
    expect(body.contents[1].parts[0].thoughtSignature).toBe(
      "synthetic-opaque-signature",
    );
    expect(body.contents[2].parts[0].functionResponse).toEqual({
      name: "getMandate",
      id: "call-1",
      response: { result: { cap: "10000000" } },
    });
    expect(JSON.stringify(body)).not.toContain(settings.apiKey);
  });
  it("rejects mismatched tool results and multiple native calls before any dispatch", async () => {
    const payload = {
      candidates: [
        {
          content: {
            parts: [
              { functionCall: { name: "getMandate", args: {} } },
              { functionCall: { name: "getVaultBalance", args: {} } },
            ],
          },
        },
      ],
    };
    const model = new GeminiModel(
      settings,
      async () => new Response(JSON.stringify(payload)),
    );
    expect(() => model.toolResult("getMandate", {})).toThrow(
      "INVALID_FUNCTION_RESPONSE",
    );
    await expect(model.decide(context)).rejects.toMatchObject({
      code: "INVALID_MODEL_RESPONSE",
    });
  });
});
async function fixture() {
  return createReadOnlyTools({
    vault: "0x1100000000000000000000000000000000000001",
    agent: "0x2200000000000000000000000000000000000001",
    token: "0x3300000000000000000000000000000000000001",
    providers: [
      {
        id: "datahub",
        name: "DataHub",
        address: "0x4400000000000000000000000000000000000001",
      },
      {
        id: "weatherco",
        name: "WeatherCo",
        address: "0x5500000000000000000000000000000000000001",
      },
    ],
    now: 100,
    injection: false,
    sessionId: identity("session"),
    events: new EventStream(),
  });
}
describe("bounded read-only agent runner", () => {
  it("uses real existing financial checks and stops before signing", async () => {
    const f = await fixture();
    const model = {
      mode: "gemini" as const,
      toolResult: vi.fn(),
      decide: vi.fn(async () => ({
        kind: "tool" as const,
        name: "requestMandatePayment" as const,
        args: {
          quoteId: f.tools.context.observations.quotes[0]?.quoteId,
          reason: "Cheapest provider.",
        },
        summary: "Request DataHub.",
      })),
    };
    const emit = vi.fn(
      async (
        _type: string,
        _data: Record<string, string | number | boolean>,
      ) => {},
    );
    const result = await runReadOnlyAgent(model, f, {
      enabled: () => true,
      cancelled: () => false,
      emit,
    });
    expect(result.quote.providerId).toBe("datahub");
    expect(f.counters).toEqual({ preparationAttempts: 1, broadcasts: 0 });
    expect(emit.mock.calls.some(([type]) => type === "gemini.validated")).toBe(
      true,
    );
  });
  it.each(["disabled", "cancelled"])(
    "stops %s before inference",
    async (state) => {
      const f = await fixture();
      const model = {
        mode: "gemini" as const,
        toolResult: vi.fn(),
        decide: vi.fn(),
      };
      await expect(
        runReadOnlyAgent(model, f, {
          enabled: () => state !== "disabled",
          cancelled: () => state === "cancelled",
          emit: async () => {},
        }),
      ).rejects.toMatchObject({
        code: state === "disabled" ? "GEMINI_DISABLED" : "INFERENCE_CANCELLED",
      });
      expect(model.decide).not.toHaveBeenCalled();
      expect(f.counters.broadcasts).toBe(0);
    },
  );
  it("rejects a disabled switch after an in-flight model response without dispatch", async () => {
    const f = await fixture();
    let enabled = true;
    const model = {
      mode: "gemini" as const,
      toolResult: vi.fn(),
      decide: vi.fn(async () => {
        enabled = false;
        return {
          kind: "tool" as const,
          name: "getMandate" as const,
          args: {},
          summary: "Read mandate.",
        };
      }),
    };
    await expect(
      runReadOnlyAgent(model, f, {
        enabled: () => enabled,
        cancelled: () => false,
        emit: async () => {},
      }),
    ).rejects.toMatchObject({ code: "GEMINI_DISABLED" });
    expect(model.toolResult).not.toHaveBeenCalled();
  });
});
