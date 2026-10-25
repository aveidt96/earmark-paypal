/** Provider-neutral boundary for a future server-side Qwen-compatible adapter. */
export interface ModelMessage {
  readonly role: "system" | "user" | "assistant";
  readonly content: string;
}

export interface ModelRequest {
  readonly messages: readonly ModelMessage[];
  readonly maxOutputTokens: number;
}

export interface ModelResult {
  readonly text: string;
  readonly model: string;
  readonly usage?: {
    readonly inputTokens: number;
    readonly outputTokens: number;
  };
}

/** Implementations must not hold wallet keys or expose transaction execution. */
export interface ModelAdapter {
  generate(request: ModelRequest, signal: AbortSignal): Promise<ModelResult>;
}
