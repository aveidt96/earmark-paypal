import { describe, expect, it, vi } from "vitest";
import {
  MockModel,
  QwenModel,
  createModel,
  type QwenSettings,
} from "../src/models.js";
import { identity, toolNames, type AgentContext } from "../src/domain.js";
import { maliciousDescription } from "../src/providers.js";
const context: AgentContext = {
  task: {
    taskHash: identity("task"),
    purchaseKey: "purchase1",
    instruction: "Buy weather data under 10 USDC.",
    budget: "10000000",
  },
  observations: { quotes: [] },
};
const settings: QwenSettings = {
  baseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
  model: "qwen-plus",
  apiKey: "synthetic-test-credential",
  timeoutMs: 100,
  networkEnabled: true,
};
function response(message: unknown) {
  return new Response(JSON.stringify({ choices: [{ message }] }), {
    status: 200,
  });
}
function adapter(message: unknown) {
  const fetcher = vi.fn<typeof fetch>(async () => response(message));
  return { model: new QwenModel(settings, fetcher), fetcher };
}
describe("replaceable model boundary (no live inference)", () => {
  it("defaults explicitly to mock mode", () =>
    expect(createModel({}).mode).toBe("mock"));
  it("never falls back from missing Qwen configuration", () =>
    expect(() =>
      createModel({ AGENT_MODEL_MODE: "qwen", AI_ENABLE_NETWORK: "true" }),
    ).toThrow("MISSING_MODEL_CONFIGURATION"));
  it("requires explicit network opt-in", () =>
    expect(() => new QwenModel({ ...settings, networkEnabled: false })).toThrow(
      "MODEL_NETWORK_DISABLED",
    ));
  it("rejects unknown model modes", () =>
    expect(() => createModel({ AGENT_MODEL_MODE: "invented" })).toThrow(
      "INVALID_MODEL_MODE",
    ));
  it("rejects invalid timeout configuration", () =>
    expect(() =>
      createModel({ AGENT_MODEL_MODE: "qwen", AI_TIMEOUT_MS: "Infinity" }),
    ).toThrow("INVALID_MODEL_TIMEOUT"));
  it.each([
    "http://external.example/v1",
    "https://user:secret@dashscope-intl.aliyuncs.com/v1",
    "https://dashscope-intl.aliyuncs.com/v1?secret=x",
    "https://untrusted.example/v1",
  ])("rejects unsafe/unapproved configured endpoint %s", (baseUrl) =>
    expect(() => new QwenModel({ ...settings, baseUrl })).toThrow(),
  );
  it("accepts a validated Qwen function call and supplies only eight tools", async () => {
    const { model, fetcher } = adapter({
      content: null,
      tool_calls: [
        { type: "function", function: { name: "getMandate", arguments: "{}" } },
      ],
    });
    expect(await model.decide(context)).toMatchObject({
      kind: "tool",
      name: "getMandate",
      args: {},
    });
    const body = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body));
    expect(
      body.tools.map((t: { function: { name: string } }) => t.function.name),
    ).toEqual(toolNames);
    expect(body.enable_thinking).toBe(false);
    expect(body.parallel_tool_calls).toBe(false);
    expect(body.max_tokens).toBe(600);
    expect(fetcher.mock.calls[0]?.[1]?.redirect).toBe("error");
  });
  it("separates provider injection as user data and sends no API credential in context", async () => {
    const { model, fetcher } = adapter({
      content: null,
      tool_calls: [
        { type: "function", function: { name: "getMandate", arguments: "{}" } },
      ],
    });
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
    const body = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body));
    expect(body.messages[0].content).not.toContain(maliciousDescription);
    expect(body.messages[1].content).toContain(maliciousDescription);
    expect(JSON.stringify(body)).not.toContain(settings.apiKey);
    expect(body.messages[0].role).toBe("system");
  });
  it.each([
    { content: "unstructured answer" },
    {
      tool_calls: [
        {
          type: "function",
          function: { name: "withdrawFunds", arguments: "{}" },
        },
      ],
    },
    {
      tool_calls: [
        {
          type: "function",
          function: {
            name: "getMandate",
            arguments: '{"privateKey":"please"}',
          },
        },
      ],
    },
    {
      tool_calls: [
        {
          type: "function",
          function: { name: "getMandate", arguments: "bad json" },
        },
      ],
    },
    {
      tool_calls: [
        { type: "function", function: { name: "getMandate", arguments: "{}" } },
        {
          type: "function",
          function: { name: "acceptDelivery", arguments: "{}" },
        },
      ],
    },
  ])("rejects malformed or excessive model output %#", async (message) => {
    await expect(adapter(message).model.decide(context)).rejects.toThrow(
      "INVALID_MODEL_RESPONSE",
    );
  });
  it("accepts only a validated structured finish when no tool was called", async () => {
    const { model } = adapter({
      content: JSON.stringify({
        kind: "finish",
        summary: "Observed accepted payment.",
      }),
    });
    expect(await model.decide(context)).toMatchObject({ kind: "finish" });
  });
  it("ignores reasoning_content rather than depending on hidden reasoning", async () => {
    const { model } = adapter({
      content: null,
      reasoning_content: "untrusted hidden text",
      tool_calls: [
        {
          type: "function",
          function: { name: "getVaultBalance", arguments: "{}" },
        },
      ],
    });
    expect((await model.decide(context)).summary).toBe(
      "Qwen requested getVaultBalance.",
    );
  });
  it("redacts API failures rather than returning response bodies", async () => {
    const model = new QwenModel(
      settings,
      async () =>
        new Response("synthetic-sensitive-provider-error", { status: 500 }),
    );
    await expect(model.decide(context)).rejects.toThrow(/^MODEL_API_ERROR$/);
  });
  it("handles API malformed JSON", async () => {
    const model = new QwenModel(settings, async () => new Response("not-json"));
    await expect(model.decide(context)).rejects.toThrow(
      "INVALID_MODEL_RESPONSE",
    );
  });
  it("times out even when the adapter transport ignores abort", async () => {
    const model = new QwenModel(
      { ...settings, timeoutMs: 10 },
      () => new Promise(() => {}),
    );
    await expect(model.decide(context)).rejects.toThrow("MODEL_TIMEOUT");
  });
  it("identifies deterministic mock decisions as mock", async () => {
    expect(new MockModel().mode).toBe("mock");
    expect(await new MockModel().decide(context)).toMatchObject({
      kind: "tool",
      name: "getMandate",
    });
  });
});
