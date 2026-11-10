import { AgentError } from "./errors.js";

// Each native response has one bounded read. Server wrappers share the promise
// rather than teeing several clone streams and buffering the same body again.
const bodies = new WeakMap<Response, Promise<string>>();
export function readGeminiBody(
  response: Response,
  signal?: AbortSignal | null,
): Promise<string> {
  if (signal?.aborted) return Promise.reject(new AgentError("MODEL_TIMEOUT"));
  const cached = bodies.get(response);
  if (cached) return cached;
  const body = (async () => {
    if (!response.body) return "";
    const reader = response.body.getReader();
    const cancel = () => {
      void reader.cancel().catch(() => {});
    };
    signal?.addEventListener("abort", cancel, { once: true });
    let bytes = 0,
      text = "";
    const decoder = new TextDecoder();
    try {
      for (;;) {
        if (signal?.aborted) throw new AgentError("MODEL_TIMEOUT");
        const chunk = await reader.read();
        if (signal?.aborted) throw new AgentError("MODEL_TIMEOUT");
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > 1_000_000) {
          cancel();
          throw new AgentError("INVALID_MODEL_RESPONSE");
        }
        text += decoder.decode(chunk.value, { stream: true });
      }
      return text + decoder.decode();
    } catch (error) {
      if (signal?.aborted) throw new AgentError("MODEL_TIMEOUT");
      if (error instanceof AgentError) throw error;
      throw new AgentError("MODEL_TRANSPORT_ERROR");
    } finally {
      signal?.removeEventListener("abort", cancel);
      reader.releaseLock();
    }
  })();
  bodies.set(response, body);
  return body;
}
