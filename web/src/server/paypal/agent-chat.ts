import "server-only";
import type { PurchasingChatResult } from "../../lib/paypal-agent";
import { evaluatePayPalAgentScenario } from "./agent";

/** Existing native Gemini/tools/policy path, with no durable repository or intent. */
export async function evaluatePurchasingChat(
  instruction: string,
  env: Record<string, string | undefined> = process.env,
  fetcher?: typeof fetch,
): Promise<PurchasingChatResult> {
  const result = await evaluatePayPalAgentScenario({
    scenarioId: "normal",
    mode: "gemini",
    instruction,
    env,
    ...(fetcher ? { fetcher } : {}),
    now: () => new Date(),
  });
  return {
    source: fetcher ? "MOCKED_TRANSPORT_TEST" : "LIVE_GOOGLE_API",
    objective: result.objective,
    offersEvaluated: result.offersEvaluated,
    agentExplanation: result.agentExplanation,
    proposalState: result.proposalState,
    authorizationDecision: result.authorizationDecision,
    proposal: result.authorizationDecision.allowed ? result.proposal : null,
    persisted: false,
    fundsReserved: false,
    ownerAuthorized: false,
  };
}
