import "server-only";
import {
  GeminiResponseError,
  parseGeminiResponse,
  readGeminiBody,
  type GeminiResponseDiagnostic,
} from "@flint/agent/server";
import type { AgentSyntheticDiagnostic } from "../../lib/agent-checkout";
import type { AgentCheckoutConfig } from "./agent-checkout-config";
import {
  agentCheckoutMandateId,
  inferPendingAgentIntent,
} from "./agent-checkout";
import { paypalAgentCustomTools } from "./agent";
import type { Mandate } from "./domain";
import {
  GEMINI_BOUNDARY_VERSION,
  type BoundaryEvidence,
} from "./gemini-boundary";

/** Public build marker; deliberately independent of credentials and campaign state. */
export const AGENT_RUNTIME_VERSION = "task05ct-transport-v1" as const;

/** Explicit test authority only. Never substitute this for the persisted campaign. */
export function syntheticAgentFixture(now: number) {
  const config: AgentCheckoutConfig = {
    campaign: "agent-05a",
    origin: "http://127.0.0.1:3032",
    ownerId: "paypal-test-owner-synthetic-diagnostic",
    agentId: "agent05a-synthetic-diagnostic",
    merchantId: "SYNTHETICDIAG1",
    loginSecret: "synthetic-diagnostic-login-not-real-123456789",
    sessionSecret: "synthetic-diagnostic-session-not-real-12345678901234567890",
    sessionEpoch: "d".repeat(64),
  };
  const mandate: Mandate = {
    id: agentCheckoutMandateId(config),
    ownerId: config.ownerId,
    agentId: config.agentId,
    merchants: [config.merchantId],
    currency: "USD",
    capMinor: "1000",
    perTransactionMinor: "600",
    reservedMinor: "0",
    consumedMinor: "0",
    status: "ACTIVE",
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 3600000).toISOString(),
  };
  return { config, mandate };
}

/** No database import, persistent campaign, real owner/merchant or PayPal transport. */
export async function runSyntheticAgentDiagnostic(
  env: Record<string, string | undefined> = process.env,
  fetcher: typeof fetch = fetch,
  source: AgentSyntheticDiagnostic["source"] = "LIVE_GOOGLE_API",
  now: () => number = Date.now,
  progress?: Pick<AgentSyntheticDiagnostic, "requests" | "outboundBoundary">,
): Promise<AgentSyntheticDiagnostic> {
  const fixture = syntheticAgentFixture(now());
  const modelEnv: Record<string, string | undefined> = Object.fromEntries(
    [
      "GEMINI_API_KEY",
      "GEMINI_MODEL",
      "GEMINI_BASE_URL",
      "AI_TIMEOUT_MS",
      "AI_ENABLE_NETWORK",
      "EARMARK_GEMINI_ENABLED",
      "GEMINI_HTTP_MAX_ATTEMPTS",
    ].map((key) => [key, env[key]]),
  );
  const requests: AgentSyntheticDiagnostic["requests"] =
    progress?.requests ?? [];
  const outboundBoundary: BoundaryEvidence = progress?.outboundBoundary ?? {
    version: GEMINI_BOUNDARY_VERSION,
    accepted: 0,
    rejected: 0,
    toolResponsesValidated: 0,
    canaryRejected: 0,
  };
  const intent = await inferPendingAgentIntent(
    fixture.config,
    fixture.mandate,
    modelEnv,
    async (input, init) => {
      const response = await fetcher(input, init);
      if (!response.ok) {
        requests.push({
          step: requests.length + 1,
          httpStatus: response.status,
          category: "HTTP_API_ERROR",
          candidateCount: 0,
          finishReason: null,
          blockReason: null,
          toolNames: [],
          argumentsValid: [],
        });
        return response;
      }
      const request: AgentSyntheticDiagnostic["requests"][number] = {
        step: requests.length + 1,
        httpStatus: response.status,
        category: "RESPONSE_BODY_PENDING",
        candidateCount: 0,
        finishReason: null,
        blockReason: null,
        toolNames: [],
        argumentsValid: [],
      };
      requests.push(request);
      const aborted = () => {
        request.category = "LOCAL_TIMEOUT";
      };
      init?.signal?.addEventListener("abort", aborted, { once: true });
      let diagnostic: GeminiResponseDiagnostic;
      try {
        diagnostic = parseGeminiResponse(
          await readGeminiBody(response, init?.signal),
          paypalAgentCustomTools,
        ).diagnostic;
      } catch (error) {
        if (!(error instanceof GeminiResponseError)) {
          request.category = init?.signal?.aborted
            ? "LOCAL_TIMEOUT"
            : "RESPONSE_BODY_ERROR";
          throw error;
        }
        diagnostic = error.diagnostic;
      } finally {
        init?.signal?.removeEventListener("abort", aborted);
      }
      Object.assign(request, diagnostic);
      return response;
    },
    source,
    now,
    outboundBoundary,
  );
  return {
    runtimeVersion: AGENT_RUNTIME_VERSION,
    source,
    verifiedAt: new Date(now()).toISOString(),
    syntheticCatalog: true,
    policyValidated: true,
    proposal: {
      offerId: intent.offerId,
      amountMinor: intent.amountMinor,
      currency: intent.currency,
    },
    policyChecks: intent.policyChecks.map(({ id, label, passed }) => ({
      id,
      label,
      passed,
    })),
    requests,
    outboundBoundary,
    persisted: false,
    ownerAuthorized: false,
    fundsReserved: false,
    paypalOrderId: null,
    paypalCaptureId: null,
  };
}
