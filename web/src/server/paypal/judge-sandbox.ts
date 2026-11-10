import "server-only";
import { z } from "zod";
import type { PurchasingChatResult } from "../../lib/paypal-agent";
import {
  evaluatePayPalAgentScenario,
  assertNoSensitiveMaterialInAgentPayload,
} from "./agent";
import { PaymentError } from "./domain";

/** Limited deterministic language parser, NOT an LLM or general language understanding. */
export function judgeRequirements(instruction: string) {
  if (!z.string().trim().min(1).max(1000).safeParse(instruction).success)
    throw new PaymentError("JUDGE_INSTRUCTION_REQUIRED");
  assertNoSensitiveMaterialInAgentPayload(instruction);
  const text = instruction.toLowerCase();
  const actionable = text.replace(
    /(?:do not|never|without)\s+(?:execute|executing|capture|capturing|reserve|reserving|pay|paying)(?:\s+(?:any|a|the))?(?:\s+(?:payment|funds|money))?/g,
    "",
  );
  if (/\b(?:execute|capture|reserve|refund|payout|transfer)\b/.test(actionable))
    throw new PaymentError("JUDGE_FINANCIAL_EXECUTION_DISABLED");
  if (
    /\b(?:ignore|override|bypass|disable)\b.*\b(?:policy|limits?|approval|allowlist|budget)\b/.test(
      text,
    )
  )
    throw new PaymentError("JUDGE_POLICY_OVERRIDE_FORBIDDEN");
  if (
    !/\b(?:weather|telemetry|weather-v1)\b/.test(text) ||
    /\b(?:eur|gbp|euro|bitcoin|stocks|crypto|at least)\b|\$-/.test(text)
  )
    throw new PaymentError("JUDGE_UNSUPPORTED_REQUIREMENTS");
  const amounts = [
    ...text.matchAll(
      /(?:\$(\d{1,4}(?:\.\d{1,2})?)|(\d{1,4}(?:\.\d{1,2})?)\s*(?:usd|dollars?))(?=$|[^\d.])/g,
    ),
  ];
  const prices = amounts.map((m) => {
    const [whole, cents = ""] = (m[1] ?? m[2] ?? "").split(".");
    return BigInt(whole ?? "0") * 100n + BigInt(cents.padEnd(2, "0"));
  });
  if (
    (text.match(/\$/g)?.length ?? 0) !==
    amounts.filter((m) => m[1] !== undefined).length
  )
    throw new PaymentError("JUDGE_UNSUPPORTED_REQUIREMENTS");
  if (prices.some((p) => p < 1n || p > 1000n))
    throw new PaymentError("JUDGE_LIMIT_CANNOT_BE_INCREASED");
  const slas = [...text.matchAll(/\b(\d{1,3})\s*(?:minutes?|mins?)\b/g)].map(
    (m) => Number(m[1]),
  );
  if (slas.some((n) => n < 1 || n > 60))
    throw new PaymentError("JUDGE_UNSUPPORTED_REQUIREMENTS");
  return {
    maxPriceMinor: prices.reduce((a, b) => (a < b ? a : b), 600n),
    maxSlaMinutes: Math.min(15, ...slas),
    backupOnly: /\bbackup\b/.test(text),
  };
}

export async function evaluateJudgeSandbox(
  instruction: string,
  mode: "policy" | "gemini" = "policy",
  env: Record<string, string | undefined> = {},
  fetcher?: typeof fetch,
): Promise<PurchasingChatResult> {
  const constraints = judgeRequirements(instruction);
  const evaluate = (
    execution: "deterministic-policy" | "gemini",
    modelEnv: Record<string, string | undefined> = {},
    transport?: typeof fetch,
  ) =>
    evaluatePayPalAgentScenario({
      scenarioId: "normal",
      mode: execution,
      instruction,
      constraints,
      env: modelEnv,
      now: () => new Date(),
      ...(transport ? { fetcher: transport } : {}),
    });
  // A genuine policy denial needs no billed inference. Every evaluation owns a new memory repository.
  let result = await evaluate("deterministic-policy");
  let source: PurchasingChatResult["source"] = "DETERMINISTIC_POLICY_ENGINE";
  if (mode === "gemini" && result.authorizationDecision.allowed) {
    const overall = AbortSignal.timeout(180000);
    const transport: typeof fetch = (url, init) =>
      (fetcher ?? fetch)(url, {
        ...init,
        signal: init?.signal
          ? AbortSignal.any([init.signal, overall])
          : overall,
      });
    // No owner config, PayPal credentials, historical rows, DB URLs or arbitrary API origin.
    const modelEnv = Object.fromEntries(
      [
        "EARMARK_GEMINI_ENABLED",
        "AI_ENABLE_NETWORK",
        "GEMINI_API_KEY",
        "GEMINI_MODEL",
        "AI_TIMEOUT_MS",
      ].map((k) => [k, env[k]]),
    );
    result = await evaluate(
      "gemini",
      { ...modelEnv, GEMINI_HTTP_MAX_ATTEMPTS: "1" },
      transport,
    );
    source = fetcher ? "MOCKED_TRANSPORT_TEST" : "LIVE_GOOGLE_API";
  }
  return {
    source,
    objective: result.objective,
    offersEvaluated: result.offersEvaluated,
    agentExplanation:
      source === "DETERMINISTIC_POLICY_ENGINE" &&
      result.authorizationDecision.allowed
        ? `The mock planner selected ${result.proposal?.merchantName} at ${result.proposal?.amountDisplay} using the evaluated constraints. Independent policy checks passed; human approval is still required. No payment or reservation exists.`
        : result.agentExplanation,
    proposalState: result.proposalState,
    authorizationDecision: {
      ...result.authorizationDecision,
      checks: result.authorizationDecision.checks.map((check) =>
        check.id === "mandate-isolation"
          ? {
              ...check,
              detail:
                "Disposable synthetic judge policy; no historical financial records are accessible.",
            }
          : check.id === "identity-owner"
            ? { ...check, label: "Synthetic owner / agent binding" }
            : check,
      ),
    },
    proposal: result.authorizationDecision.allowed ? result.proposal : null,
    trace: result.trace,
    persisted: false,
    fundsReserved: false,
    ownerAuthorized: false,
  };
}
