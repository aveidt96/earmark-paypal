import { describe, expect, it, vi } from "vitest";
import { GeminiModel } from "../src/models.js";
import {
  GeminiResponseError,
  parseGeminiResponse,
} from "../src/gemini-response.js";
const call = { functionCall: { name: "getMandate", args: {} } };
const response = (parts: unknown[], finishReason = "STOP") => ({
  candidates: [{ finishReason, content: { role: "model", parts } }],
});
const classify = (value: unknown) => {
  try {
    parseGeminiResponse(
      typeof value === "string" ? value : JSON.stringify(value),
    );
  } catch (error) {
    expect(error).toBeInstanceOf(GeminiResponseError);
    return (error as GeminiResponseError).diagnostic;
  }
  throw new Error("Expected strict rejection");
};
describe("Gemini sanitized response classification", () => {
  it.each([
    ["not json", "MALFORMED_JSON"],
    [response([], "MAX_TOKENS"), "OUTPUT_TRUNCATED"],
    [response([call], "MAX_TOKENS"), "OUTPUT_TRUNCATED"],
    [{ candidates: [{ finishReason: "MAX_TOKENS" }] }, "OUTPUT_TRUNCATED"],
    [{ promptFeedback: { blockReason: "SAFETY" } }, "SAFETY_BLOCK"],
    [response([call], "SAFETY"), "SAFETY_BLOCK"],
    [response([], "MALFORMED_FUNCTION_CALL"), "MALFORMED_FUNCTION_CALL"],
    [response([call], "OTHER"), "UNSUPPORTED_FINISH_REASON"],
    [{ candidates: [] }, "INVALID_ENVELOPE"],
    [{ candidates: [{}, {}] }, "INVALID_ENVELOPE"],
    [response([]), "MISSING_TOOL_CALL"],
    [response([call, call]), "MULTIPLE_TOOL_CALLS"],
    [
      response([
        { functionCall: { name: "getMandate", args: { extra: true } } },
      ]),
      "INVALID_TOOL_ARGUMENTS",
    ],
    [
      response([{ functionCall: { name: "getMandate", args: "{}" } }]),
      "INVALID_TOOL_ARGUMENTS",
    ],
    [
      response([{ functionCall: { name: "private-model-string", args: {} } }]),
      "UNDECLARED_TOOL",
    ],
    [response([{ text: "ordinary prose" }]), "INVALID_FINISH_JSON"],
    [
      response([
        {
          text: JSON.stringify({
            kind: "tool",
            name: "getMandate",
            args: {},
            summary: "x",
          }),
        },
      ]),
      "INVALID_FINISH_SCHEMA",
    ],
  ])("rejects and distinguishes %j", (value, category) => {
    expect(classify(value).category).toBe(category);
  });
  it("redacts unknown function names, arguments, response text and issues", () => {
    const diagnostic = classify(
      response([
        {
          functionCall: {
            name: "private-model-string",
            args: { secret: "private-value" },
          },
        },
      ]),
    );
    expect(diagnostic).toMatchObject({
      toolNames: ["UNDECLARED_TOOL"],
      argumentsValid: [false],
    });
    expect(JSON.stringify(diagnostic)).not.toMatch(/private|secret/);
  });
  it("accepts only schema-valid tools and combines non-thought finish text parts", () => {
    expect(
      parseGeminiResponse(JSON.stringify(response([call]))).diagnostic.category,
    ).toBe("VALID_TOOL_CALL");
    const parts = [
      { text: "untrusted thought summary", thought: true },
      { text: '{"kind":"finish",' },
      { text: '"summary":"Done."}' },
    ];
    expect(
      parseGeminiResponse(JSON.stringify(response(parts))).decision,
    ).toEqual({ kind: "finish", summary: "Done." });
  });
});
describe("native Gemini continuation contract", () => {
  const settings = {
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    model: "synthetic-model",
    apiKey: "synthetic-credential",
    timeoutMs: 1000,
    networkEnabled: true,
    conversation: true,
    // Mock transport only; production composition must supply its DTO boundary.
    outboundPolicy: () => {},
  };
  it("round-trips exact IDs, opaque thought signatures and part order across tool turns", async () => {
    const content = {
      role: "model",
      parts: [
        { text: "", thoughtSignature: "synthetic-opaque-text-signature" },
        {
          functionCall: { id: "native-call-1", name: "getMandate", args: {} },
          thoughtSignature: "synthetic-opaque-call-signature",
        },
      ],
    };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({ candidates: [{ content, finishReason: "STOP" }] }),
      )
      .mockResolvedValueOnce(
        Response.json(
          response([{ text: '{"kind":"finish","summary":"Done."}' }]),
        ),
      );
    const model = new GeminiModel(settings, fetcher);
    await model.decide({ task: {}, observations: {} });
    model.toolResult("getMandate", { result: { synthetic: true } });
    await model.decide({ task: {}, observations: {} });
    const body = JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body));
    expect(body.contents[1]).toEqual(content);
    expect(body.contents[2]).toEqual({
      role: "user",
      parts: [
        {
          functionResponse: {
            id: "native-call-1",
            name: "getMandate",
            response: { result: { synthetic: true } },
          },
        },
      ],
    });
  });
  it("does not arm a pending tool result for an invalid argument schema", async () => {
    const model = new GeminiModel(settings, async () =>
      Response.json(
        response([
          { functionCall: { name: "getMandate", args: { extra: true } } },
        ]),
      ),
    );
    await expect(
      model.decide({ task: {}, observations: {} }),
    ).rejects.toMatchObject({
      diagnostic: { category: "INVALID_TOOL_ARGUMENTS" },
    });
    expect(() => model.toolResult("getMandate", {})).toThrow(
      "INVALID_FUNCTION_RESPONSE",
    );
  });
});

describe("Gemini finish Markdown regression (live synthetic reproduction)", () => {
  const wrap = (text: string) =>
    JSON.stringify({
      candidates: [
        { finishReason: "STOP", content: { role: "model", parts: [{ text }] } },
      ],
    });
  it.each(["json", ""])(
    "accepts one %s fence around a strict finish object",
    (language) => {
      const finish = {
        kind: "finish",
        summary:
          "Synthetic proposal validated; human authorization still required.",
      };
      const text = "```" + language + "\n" + JSON.stringify(finish) + "\n```";
      expect(parseGeminiResponse(wrap(text)).decision).toEqual(finish);
    },
  );
  it.each([
    '```json\n{"kind":"tool","name":"getMandate","args":{},"summary":"x"}\n```',
    '```json\n{"kind":"finish","summary":"ok","amountMinor":"600"}\n```',
    '```json\n{"kind":"finish","summary":""}\n```',
    '```json\n{"kind":"finish","summary":\n```',
    'Explanation\n```json\n{"kind":"finish","summary":"ok"}\n```',
    '```json\n{"kind":"finish","summary":"ok"}\n```\nExplanation',
    '```javascript\n{"kind":"finish","summary":"ok"}\n```',
    '```json\n{"kind":"finish","summary":"' + "x".repeat(501) + '"}\n```',
  ])("rejects invalid or tool-shaped fenced output %j", (text) => {
    expect(() => parseGeminiResponse(wrap(text))).toThrow(
      "INVALID_MODEL_RESPONSE",
    );
  });
});
