import { z } from "zod";
import { AgentError } from "./errors.js";
import {
  decisionSchema,
  toolNames,
  toolSchemas,
  type AgentDecision,
  type ToolName,
} from "./domain.js";
import type { CustomToolDefinition } from "./models.js";

export type GeminiResponseCategory =
  | "VALID_TOOL_CALL"
  | "VALID_FINISH"
  | "OVERSIZED_RESPONSE"
  | "MALFORMED_JSON"
  | "INVALID_ENVELOPE"
  | "SAFETY_BLOCK"
  | "OUTPUT_TRUNCATED"
  | "MALFORMED_FUNCTION_CALL"
  | "UNSUPPORTED_FINISH_REASON"
  | "MULTIPLE_TOOL_CALLS"
  | "UNDECLARED_TOOL"
  | "INVALID_TOOL_ARGUMENTS"
  | "MISSING_TOOL_CALL"
  | "INVALID_FINISH_JSON"
  | "INVALID_FINISH_SCHEMA";

export interface GeminiResponseDiagnostic {
  category: GeminiResponseCategory;
  candidateCount: number;
  finishReason: string | null;
  blockReason: string | null;
  toolNames: string[];
  argumentsValid: boolean[];
}
/** Only bounded, allowlisted metadata. Never attach raw content or Zod issues. */
export class GeminiResponseError extends AgentError {
  constructor(readonly diagnostic: GeminiResponseDiagnostic) {
    super("INVALID_MODEL_RESPONSE");
  }
}
const responseSchema = z.object({
  promptFeedback: z.object({ blockReason: z.string().optional() }).optional(),
  candidates: z
    .array(
      z.object({
        finishReason: z.string().optional(),
        content: z
          .object({
            role: z.literal("model").optional(),
            parts: z
              .array(
                z.object({
                  text: z.string().max(10000).optional(),
                  thought: z.boolean().optional(),
                  functionCall: z
                    .object({
                      name: z.string(),
                      args: z.unknown(),
                      id: z.string().max(256).optional(),
                    })
                    .optional(),
                }),
              )
              .max(8),
          })
          .optional(),
      }),
    )
    .max(8)
    .optional(),
});
const safeEnum = (value: string | undefined) =>
  value && /^[A-Z_]{1,80}$/.test(value) ? value : null;

export function parseGeminiResponse(
  text: string,
  customTools?: readonly CustomToolDefinition[],
): {
  decision: AgentDecision;
  diagnostic: GeminiResponseDiagnostic;
  modelContent?: unknown;
  callId?: string;
} {
  const diagnostic: GeminiResponseDiagnostic = {
    category: "INVALID_ENVELOPE",
    candidateCount: 0,
    finishReason: null,
    blockReason: null,
    toolNames: [],
    argumentsValid: [],
  };
  const fail = (category: GeminiResponseCategory): never => {
    diagnostic.category = category;
    throw new GeminiResponseError(diagnostic);
  };
  if (text.length > 1000000) return fail("OVERSIZED_RESPONSE");
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return fail("MALFORMED_JSON");
  }
  const parsed = responseSchema.safeParse(raw);
  if (!parsed.success) return fail("INVALID_ENVELOPE");
  const { candidates = [], promptFeedback } = parsed.data;
  diagnostic.candidateCount = candidates.length;
  diagnostic.blockReason = safeEnum(promptFeedback?.blockReason);
  const candidate = candidates[0];
  diagnostic.finishReason = safeEnum(candidate?.finishReason);
  const parts = candidate?.content?.parts;
  const calls =
    parts?.flatMap((p) => (p.functionCall ? [p.functionCall] : [])) ?? [];
  const definitions =
    customTools ??
    toolNames.map((name) => ({ name, schema: toolSchemas[name] }));
  for (const call of calls) {
    const tool = definitions.find((t) => t.name === call.name);
    diagnostic.toolNames.push(tool?.name ?? "UNDECLARED_TOOL");
    diagnostic.argumentsValid.push(!!tool?.schema.safeParse(call.args).success);
  }
  if (
    promptFeedback?.blockReason &&
    promptFeedback.blockReason !== "BLOCK_REASON_UNSPECIFIED"
  )
    return fail("SAFETY_BLOCK");
  if (candidates.length !== 1) return fail("INVALID_ENVELOPE");
  const finishReason = candidate?.finishReason;
  if (finishReason === "MAX_TOKENS") return fail("OUTPUT_TRUNCATED");
  if (
    [
      "SAFETY",
      "RECITATION",
      "BLOCKLIST",
      "PROHIBITED_CONTENT",
      "SPII",
      "IMAGE_SAFETY",
    ].includes(finishReason ?? "")
  )
    return fail("SAFETY_BLOCK");
  if (
    ["MALFORMED_FUNCTION_CALL", "UNEXPECTED_TOOL_CALL"].includes(
      finishReason ?? "",
    )
  )
    return fail("MALFORMED_FUNCTION_CALL");
  if (finishReason && finishReason !== "STOP")
    return fail("UNSUPPORTED_FINISH_REASON");
  if (!parts) return fail("MISSING_TOOL_CALL");
  if (calls.length > 1) return fail("MULTIPLE_TOOL_CALLS");
  const call = calls[0];
  if (call) {
    const tool = definitions.find((t) => t.name === call.name);
    if (!tool) return fail("UNDECLARED_TOOL");
    const args = tool.schema.safeParse(call.args);
    if (!args.success) return fail("INVALID_TOOL_ARGUMENTS");
    diagnostic.category = "VALID_TOOL_CALL";
    return {
      decision: {
        kind: "tool",
        name: call.name as ToolName,
        args: args.data,
        summary: `Gemini requested ${call.name}.`,
      },
      diagnostic,
      // Preserve original parts, positions, IDs and thought signatures unchanged.
      modelContent: (raw as { candidates: Array<{ content: unknown }> })
        .candidates[0]?.content,
      ...(call.id !== undefined ? { callId: call.id } : {}),
    };
  }
  const content = parts
    .filter((p) => !p.thought && typeof p.text === "string")
    .map((p) => p.text)
    .join("");
  if (!content) return fail("MISSING_TOOL_CALL");
  // Gemini may format a valid finish object as a single JSON Markdown block.
  // Remove only that complete presentation wrapper; never repair JSON or accept
  // text-encoded tools, surrounding prose, extra keys or invalid finish fields.
  const fenced = /^\x60{3}(?:json)?\r?\n([\s\S]*?)\r?\n\x60{3}$/i.exec(
    content.trim(),
  );
  let finish: unknown;
  try {
    finish = JSON.parse(fenced?.[1] ?? content);
  } catch {
    return fail("INVALID_FINISH_JSON");
  }
  const decision = decisionSchema.safeParse(finish);
  if (!decision.success || decision.data.kind !== "finish")
    return fail("INVALID_FINISH_SCHEMA");
  diagnostic.category = "VALID_FINISH";
  return { decision: decision.data, diagnostic };
}
