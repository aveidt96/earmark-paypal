import type { Address, Hex } from "viem";
import type { AgentContext } from "@flint/agent/schema";
import {
  launchTypedData,
  type LaunchChallenge,
  type RecordedEvent,
} from "./model";
export type GeminiAction = "gemini-normal" | "gemini-injection" | "gemini-view";
export interface GeminiChallenge extends Omit<LaunchChallenge, "action"> {
  action: GeminiAction;
}
export function geminiTypedData(c: GeminiChallenge) {
  const data = launchTypedData({ ...c, action: "launch" });
  return {
    ...data,
    message: {
      ...data.message,
      action:
        c.action === "gemini-view"
          ? "ViewReadOnlyGeminiSession"
          : c.action === "gemini-normal"
            ? "StartReadOnlyGeminiNormal"
            : "StartReadOnlyGeminiInjection",
    },
  };
}
export interface GeminiSession {
  id: Hex;
  owner: Address;
  model: string;
  scenario: "normal" | "injection";
  status: "running" | "validated" | "failed" | "cancelled" | "interrupted";
  createdAt: number;
  finishedAt?: number | undefined;
  context: AgentContext;
  proposal?:
    | { providerId: string; recipient: Address; amount: string; reason: string }
    | undefined;
  error?: string | undefined;
}
export interface GeminiSessionView {
  session: GeminiSession;
  events: RecordedEvent[];
}
export const geminiStages = [
  "Starting",
  "Retrieving earmark",
  "Fetching providers",
  "Comparing quotes",
  "Proposing payment",
  "Validation complete",
] as const;
export function geminiStage(events: RecordedEvent[]) {
  let stage = 0;
  for (const e of events) {
    if (e.type === "gemini.fixture") stage = Math.max(stage, 1);
    if (e.type === "gemini.providers") stage = Math.max(stage, 2);
    if (e.type === "gemini.quotes") stage = Math.max(stage, 3);
    if (e.type === "gemini.tool") {
      if (e.data.name === "listApprovedProviders") stage = Math.max(stage, 2);
      if (e.data.name === "getProviderQuote") stage = Math.max(stage, 3);
      if (e.data.name === "requestMandatePayment") stage = Math.max(stage, 4);
    }
    if (e.type === "gemini.validated") stage = 5;
  }
  return stage;
}
export function geminiError(code: string) {
  const messages: Record<string, string> = {
    GEMINI_DISABLED: "Live Gemini is currently unavailable.",
    READ_ONLY_ENVIRONMENT_REQUIRED:
      "Live Gemini requires the read-only test environment.",
    MISSING_MODEL_CONFIGURATION:
      "Live Gemini credentials are not configured on the server.",
    MODEL_NETWORK_DISABLED:
      "Live Gemini network access is disabled on the server.",
    MODEL_TIMEOUT:
      "Gemini timed out. Partial events are preserved; no automatic retry will start.",
    MODEL_RATE_LIMITED: "Gemini API quota is temporarily exhausted.",
    MODEL_API_ERROR:
      "Gemini service returned an error. No fallback model was used.",
    INVALID_MODEL_RESPONSE:
      "Gemini returned an invalid response; the backend rejected it.",
    OWNER_SIGNATURE_REQUIRED:
      "The current vault owner must sign this read-only authorization.",
    GEMINI_SESSION_AUTH_REQUIRED:
      "Authorize access to this session again using the owner wallet.",
    INFERENCE_RATE_LIMITED:
      "The owner inference limit was reached. Try again later.",
    AUTHORIZATION_EXPIRED_OR_USED:
      "The authorization expired or was already used. Review existing sessions before retrying.",
    INFERENCE_CANCELLED:
      "Session cancelled. An in-flight API request may finish, but no further tool is run.",
  };
  return messages[code] ?? code;
}
