import { describe, expect, it, vi } from "vitest";
import { GeminiModel, type GeminiSettings } from "../src/models.js";
import { readGeminiBody } from "../src/gemini-body.js";

// All fetchers in this file are synthetic mocked transports.
const settings: GeminiSettings = {
  baseUrl: "https://generativelanguage.googleapis.com/v1beta",
  model: "synthetic-model",
  apiKey: "synthetic-credential",
  networkEnabled: true,
  timeoutMs: 1000,
  outboundPolicy: () => {},
  maxAttempts: 1,
};
const context = { task: {}, observations: {} };
describe("bounded single-read Gemini responses", () => {
  it("reports a body stream failure without exposing the underlying diagnostic", async () => {
    const response = new Response(
      new ReadableStream({
        start(c) {
          c.error(new TypeError("synthetic-private-diagnostic"));
        },
      }),
    );
    await expect(readGeminiBody(response)).rejects.toThrow(
      "MODEL_TRANSPORT_ERROR",
    );
  });
  it("shares one read across wrappers and preserves split UTF8 characters", async () => {
    const bytes = new TextEncoder().encode("synthetic € response");
    let offset = 0;
    const pull = vi.fn((c: ReadableStreamDefaultController<Uint8Array>) => {
      if (offset < bytes.length) c.enqueue(bytes.slice(offset, ++offset));
      else c.close();
    });
    const response = new Response(new ReadableStream({ pull }));
    const first = readGeminiBody(response);
    expect(readGeminiBody(response)).toBe(first);
    expect(await first).toBe("synthetic € response");
    expect(await readGeminiBody(response)).toBe("synthetic € response");
    expect(pull).toHaveBeenCalledTimes(bytes.length + 1);
  });
  it("bounds streamed bytes and cancels an oversized body", async () => {
    const cancel = vi.fn();
    const response = new Response(
      new ReadableStream({
        pull(c) {
          c.enqueue(new Uint8Array(100001));
        },
        cancel,
      }),
    );
    await expect(readGeminiBody(response)).rejects.toThrow(
      "INVALID_MODEL_RESPONSE",
    );
    expect(cancel).toHaveBeenCalledTimes(1);
  });
  it("aborts a hanging success body without an automatic retry or open reader", async () => {
    const cancel = vi.fn();
    let signal: AbortSignal | null | undefined;
    const fetcher = vi.fn<typeof fetch>(async (_u, init) => {
      signal = init?.signal;
      return new Response(new ReadableStream({ cancel }));
    });
    await expect(
      new GeminiModel({ ...settings, timeoutMs: 20 }, fetcher).decide(context),
    ).rejects.toThrow("MODEL_TIMEOUT");
    expect(signal?.aborted).toBe(true);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each([
    [408, "MODEL_API_ERROR"],
    [429, "MODEL_RATE_LIMITED"],
    [500, "MODEL_API_ERROR"],
    [503, "MODEL_API_ERROR"],
    [504, "MODEL_API_ERROR"],
  ])(
    "classifies remote HTTP %s even when its error body never finishes",
    async (status, category) => {
      const cancel = vi.fn();
      const fetcher = vi.fn<typeof fetch>(
        async () =>
          new Response(new ReadableStream({ cancel }), {
            status: Number(status),
          }),
      );
      await expect(
        new GeminiModel(settings, fetcher).decide(context),
      ).rejects.toThrow(String(category));
      expect(cancel).toHaveBeenCalledTimes(1);
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );
  it("rejects malformed policy or retry configuration before network use", () => {
    const fetcher = vi.fn<typeof fetch>();
    for (const outboundPolicy of [true, {}, "synthetic-policy"])
      expect(
        () =>
          new GeminiModel(
            { ...settings, outboundPolicy } as unknown as GeminiSettings,
            fetcher,
          ),
      ).toThrow("INVALID_GEMINI_OUTBOUND_POLICY");
    expect(
      () =>
        new GeminiModel(
          { ...settings, maxAttempts: 3 } as unknown as GeminiSettings,
          fetcher,
        ),
    ).toThrow("INVALID_MODEL_RETRY_CONFIGURATION");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
