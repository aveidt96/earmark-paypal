"use client";
import { useEffect, useId, useRef, useState } from "react";
import type { PurchasingChatResult } from "../lib/paypal-agent";
import { PUBLIC_DEMO_ONLY } from "../lib/paypal-agent";
import { Badge, Button, Icon } from "./glass";
import {
  formatResearchBudget,
  MAX_RESEARCH_BUDGET_MINOR,
  parseResearchBudget,
  safeExternalOfferUrl,
  type IncompleteComparison,
  type OfferDiscoveryResult,
  type PartialSearchSource,
} from "../lib/offer-discovery";
import { IncompleteOfferComparison, OfferDiscovery } from "./offer-discovery";

const judgeErrors: Record<string, string> = {
  JUDGE_UNSUPPORTED_REQUIREMENTS:
    "Use a weather-data request with numeric USD ceilings and minute SLA limits. Other requirements are not supported by this mock planner.",
  JUDGE_POLICY_OVERRIDE_FORBIDDEN:
    "Instruction boundary rejected a policy override; policy, budget and approval rules cannot be disabled.",
  JUDGE_FINANCIAL_EXECUTION_DISABLED:
    "Instruction boundary rejected financial execution. Judges can evaluate recommendations only.",
  JUDGE_LIMIT_CANNOT_BE_INCREASED:
    "Use a positive purchase ceiling of at most $10. The independent $6 transaction cap still applies.",
  JUDGE_LOCAL_GEMINI_DISABLED:
    "Live inference is restricted to the separately configured, authenticated loopback judge profile.",
  DISCOVERY_GROUNDING_REQUIRED: "The search returned no usable public sources",
  DISCOVERY_DISABLED: "Online research is unavailable in this profile",
  DISCOVERY_INSTRUCTION_REQUIRED:
    "Describe the product, plan or service to research",
  DISCOVERY_PRIVATE_INPUT_REJECTED:
    "Use a public research request without private details or URLs",
  DISCOVERY_INSTRUCTION_REJECTED:
    "Research requests cannot override policy or ask Earmark to execute a payment",
  INVALID_MODEL_RESPONSE: "The response could not be verified",
  MODEL_TIMEOUT: "The evaluation took too long",
  TEST_CSRF_REQUIRED: "Your session expired. Authenticate again to continue",
};

const publicResearchErrors: Record<string, string> = {
  PUBLIC_RESEARCH_DISABLED: "Live research isn’t configured for this site.",
  PUBLIC_RESEARCH_NOT_ENABLED:
    "Live research is turned off for this deployment.",
  PUBLIC_RESEARCH_PROFILE_BLOCKED:
    "This deployment’s safety settings prevent public research.",
  PUBLIC_RESEARCH_QUOTA_NOT_CONFIGURED:
    "This deployment’s research quota isn’t configured.",
  PUBLIC_RESEARCH_PROVIDERS_NOT_CONFIGURED:
    "This deployment’s search or AI service isn’t configured.",
  PUBLIC_RESEARCH_ORIGIN_NOT_CONFIGURED:
    "This deployment’s research address isn’t configured correctly.",
  PUBLIC_RESEARCH_RUNTIME_NOT_CONFIGURED:
    "This deployment’s hosting settings prevent live research.",
  PUBLIC_RESEARCH_ROUTE_UNAVAILABLE:
    "This deployment doesn’t serve the live research endpoint.",
  PUBLIC_RESEARCH_ORIGIN_REQUIRED:
    "This address isn’t enabled for research. Open the designated Earmark site and try again.",
  PUBLIC_RESEARCH_CONTEXT_UNAVAILABLE:
    "Earmark couldn’t verify this request. Refresh the page and try again.",
  PUBLIC_RESEARCH_QUOTA_UNAVAILABLE:
    "Earmark couldn’t check the research limit. Try again later.",
  PUBLIC_RESEARCH_LIMIT_REACHED:
    "The daily research limit has been reached. Try again tomorrow (UTC).",
  PUBLIC_RESEARCH_SEARCH_UNAVAILABLE:
    "Merchant search is unavailable right now. Try again later.",
  PUBLIC_RESEARCH_ANALYSIS_UNAVAILABLE:
    "AI offer comparison is unavailable right now. Try again later.",
  PUBLIC_RESEARCH_PROVIDER_UNAVAILABLE:
    "Earmark couldn’t reach a research provider. Try again later.",
  PUBLIC_RESEARCH_EVIDENCE_UNAVAILABLE:
    "Earmark couldn’t verify the offer evidence. Try a more specific request.",
  PUBLIC_RESEARCH_NO_SOURCES:
    "No usable merchant sources were found. Try a more specific product or service.",
  PUBLIC_RESEARCH_TIMEOUT:
    "Live research did not finish in time. Try again in a moment.",
  PUBLIC_RESEARCH_SEARCH_TIMEOUT:
    "Merchant search timed out. Try again in a moment.",
  PUBLIC_RESEARCH_ANALYSIS_TIMEOUT:
    "Earmark AI offer comparison timed out. Try again in a moment.",
  PUBLIC_RESEARCH_PAYMENT_EVIDENCE_TIMEOUT:
    "Checking merchant payment evidence timed out. Try again in a moment.",
  PUBLIC_RESEARCH_PAYMENT_EVIDENCE_UNAVAILABLE:
    "The merchant payment evidence check is unavailable. Try again later.",
  INVALID_RESEARCH_BUDGET: `Enter a USD research budget from $0.01 to ${formatResearchBudget(MAX_RESEARCH_BUDGET_MINOR)} with up to two decimal places.`,
  INVALID_RESEARCH_REQUEST:
    "Describe what you want to buy without private details, credentials, or links.",
  PUBLIC_RESEARCH_ACCESS_REQUIRED:
    "This Preview requires access. Open an authorized Preview or the public Earmark site.",
};

const syntheticExample = "Find weather data under $5 with a 15 minute SLA.";
const researchExample =
  "Find weather API plans costing less than $10 USD per month. Compare their prices, billing periods and features, and identify evidence of PayPal acceptance where available.";
const publicResearchExample =
  "Compare weather API plans within my research budget. Check prices, billing periods, and PayPal acceptance.";

export function PurchasingChat({
  onEvaluation,
  judgeSandbox = false,
  publicResearch = false,
}: {
  onEvaluation?: (result: PurchasingChatResult | null) => void;
  judgeSandbox?: boolean;
  publicResearch?: boolean;
}) {
  const id = useId();
  const [instruction, setInstruction] = useState("");
  const [budget, setBudget] = useState("");
  const budgetMinor = parseResearchBudget(budget);
  const validBudget = budgetMinor !== null;
  const [submittedBudget, setSubmittedBudget] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState("");
  const [password, setPassword] = useState("");
  const [csrf, setCsrf] = useState("");
  const [loginRequired, setLoginRequired] = useState(false);
  const [localGeminiAvailable, setLocalGeminiAvailable] = useState(false);
  const [localDiscoveryAvailable, setLocalDiscoveryAvailable] = useState(false);
  const [judgeMode, setJudgeMode] = useState<"policy" | "gemini" | "discovery">(
    judgeSandbox ? "policy" : "gemini",
  );
  const researching = publicResearch || judgeMode === "discovery";
  const [busy, setBusy] = useState(false);
  const [authenticating, setAuthenticating] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<PurchasingChatResult | null>(null);
  const [discovery, setDiscovery] = useState<OfferDiscoveryResult | null>(null);
  const [incompleteComparison, setIncompleteComparison] =
    useState<IncompleteComparison | null>(null);
  const pending = useRef(false);

  useEffect(() => {
    if (publicResearch) return;
    const controller = new AbortController();
    void fetch(
      judgeSandbox ? "/api/judge-sandbox" : "/api/paypal/agent-checkout/chat",
      {
        credentials: "same-origin",
        signal: controller.signal,
      },
    )
      .then(async (response) => {
        const body = await response.json();
        if (controller.signal.aborted) return;
        if (judgeSandbox && response.ok) {
          setLocalGeminiAvailable(body.localGeminiAvailable === true);
          setLocalDiscoveryAvailable(body.localDiscoveryAvailable === true);
          setLoginRequired(!body.authenticated);
          setCsrf(body.csrfToken ?? "");
        } else if (response.status === 401) setLoginRequired(true);
        else if (!response.ok) setError(body.error || "CHAT_UNAVAILABLE");
        else {
          setCsrf(body.csrfToken);
          setLocalDiscoveryAvailable(body.localDiscoveryAvailable === true);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setError("CHAT_UNAVAILABLE");
      });
    return () => controller.abort();
  }, [judgeSandbox, publicResearch]);

  async function submit(login: boolean) {
    if (pending.current || (publicResearch && !validBudget)) return;
    pending.current = true;
    setBusy(true);
    setAuthenticating(login);
    setError("");
    setResult(null);
    setDiscovery(null);
    setIncompleteComparison(null);
    onEvaluation?.(null);
    if (!login) {
      setSubmitted(instruction);
      setSubmittedBudget(publicResearch ? budgetMinor : null);
    }
    const payload = publicResearch
      ? { instruction, budgetMinor }
      : judgeSandbox
        ? login
          ? { action: "login", password }
          : { action: "evaluate", mode: judgeMode, instruction }
        : login
          ? { password }
          : researching
            ? { instruction, mode: "discovery" }
            : { instruction };
    setPassword("");
    try {
      const response = await fetch(
        publicResearch
          ? "/api/paypal/research"
          : judgeSandbox
            ? "/api/judge-sandbox"
            : `/api/paypal/agent-checkout/${login ? "login" : "chat"}`,
        {
          method: "POST",
          // Preview protection is handled by the hosting layer. The research
          // and policy APIs still accept visitors without an Earmark session.
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            ...(publicResearch ? {} : { "X-Earmark-CSRF": csrf }),
          },
          body: JSON.stringify(payload),
        },
      );
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        if (
          !publicResearch &&
          (response.status === 401 || body?.error === "TEST_CSRF_REQUIRED")
        ) {
          setCsrf("");
          setLoginRequired(true);
        }
        const fallback =
          response.status === 504
            ? "PUBLIC_RESEARCH_TIMEOUT"
            : response.status === 401 || response.status === 403
              ? "PUBLIC_RESEARCH_ACCESS_REQUIRED"
              : response.status === 404
                ? "PUBLIC_RESEARCH_ROUTE_UNAVAILABLE"
                : "CHAT_EVALUATION_FAILED";
        throw new Error(
          typeof body?.error === "string" ? body.error : fallback,
        );
      }
      const incomplete = publicResearch ? body?.incompleteComparison : null;
      if (
        (incomplete?.reason === "timeout" ||
          incomplete?.reason === "unavailable") &&
        Array.isArray(incomplete.sources)
      ) {
        const sources = incomplete.sources
          .slice(0, 5)
          .flatMap((url: unknown) => {
            const safe =
              typeof url === "string" ? safeExternalOfferUrl(url) : null;
            return safe ? [safe] : [];
          });
        const uniqueSources = [...new Set<string>(sources)];
        const seenResults = new Set<string>();
        const results: PartialSearchSource[] = Array.isArray(incomplete.results)
          ? incomplete.results.slice(0, 5).flatMap((entry: unknown) => {
              if (!entry || typeof entry !== "object") return [];
              const item = entry as Record<string, unknown>;
              const safeUrl =
                typeof item.url === "string"
                  ? safeExternalOfferUrl(item.url)
                  : null;
              if (!safeUrl || seenResults.has(safeUrl)) return [];
              seenResults.add(safeUrl);
              const title =
                typeof item.title === "string" && item.title.trim()
                  ? item.title.trim().slice(0, 200)
                  : "Untitled result";
              const snippet =
                typeof item.snippet === "string" && item.snippet.trim()
                  ? item.snippet.trim().slice(0, 600)
                  : "No excerpt available.";
              const category =
                item.category === "pricing" ||
                item.category === "docs" ||
                item.category === "web"
                  ? item.category
                  : undefined;
              return [{ title, url: safeUrl, snippet, category }];
            })
          : [];
        if (uniqueSources.length) {
          setIncompleteComparison({
            reason: incomplete.reason,
            sources: uniqueSources,
            ...(results.length ? { results } : {}),
            ...(typeof incomplete.retrievedAt === "string" &&
            !Number.isNaN(Date.parse(incomplete.retrievedAt))
              ? { retrievedAt: incomplete.retrievedAt }
              : {}),
          });
          return;
        }
      }
      if (
        !body ||
        (publicResearch &&
          (body.discovery?.source !== "LIVE_TAVILY_SEARCH" ||
            !Array.isArray(body.discovery.offers)))
      )
        throw new Error("PUBLIC_RESEARCH_EVIDENCE_UNAVAILABLE");
      if (login) {
        setCsrf(body.csrfToken);
        setLoginRequired(false);
        if (!judgeSandbox)
          setLocalDiscoveryAvailable(body.localDiscoveryAvailable === true);
      } else {
        if (researching) setDiscovery(body.discovery);
        else {
          setResult(body.evaluation);
          onEvaluation?.(body.evaluation);
        }
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "CHAT_UNAVAILABLE");
    } finally {
      pending.current = false;
      setBusy(false);
      setAuthenticating(false);
    }
  }

  return (
    <section
      className={`purchasing-chat interactive-purchasing-chat${publicResearch ? " public-research-chat" : ""}`}
      aria-label={
        publicResearch
          ? "Earmark AI purchasing conversation"
          : "Gemini purchasing conversation"
      }
    >
      <header className="norway-card-heading">
        <span className="norway-agent-avatar" aria-hidden="true">
          <svg
            width="18"
            height="18"
            viewBox="0 0 20 20"
            fill="#fff"
            aria-hidden="true"
          >
            <path d="M10 2l1.8 5.2L17 9l-5.2 1.8L10 16l-1.8-5.2L3 9l5.2-1.8z" />
          </svg>
        </span>
        <h3>
          {publicResearch
            ? "Earmark AI"
            : judgeSandbox
              ? "Judge purchasing sandbox"
              : "Gemini purchasing assistant"}
        </h3>
        {!publicResearch && (
          <Badge>
            {judgeSandbox && judgeMode === "policy"
              ? "Real policy execution"
              : researching
                ? "Review only"
                : "Synthetic offers"}
          </Badge>
        )}
      </header>
      <p className="chat-source">
        {researching ? (
          "Compare current offers and review the evidence before visiting a merchant."
        ) : (
          <>
            {(judgeSandbox && judgeMode === "policy") ||
            result?.source === "DETERMINISTIC_POLICY_ENGINE"
              ? "Mock AI planner · real deterministic policy engine · no Gemini request"
              : result?.source === "MOCKED_TRANSPORT_TEST"
                ? "Mocked Gemini transport · offline test"
                : "Controlled purchasing · Gemini compares synthetic offers"}
            . $10 evaluation ceiling, $6 purchase cap. No current payment
            authority.
          </>
        )}
      </p>
      {judgeSandbox && judgeMode !== "discovery" && (
        <p>
          The mock planner reads a USD limit, a delivery SLA in minutes, and
          “backup only” for weather data.
        </p>
      )}
      {researching && (
        <p>
          Describe the product or service and its billing period. Ask for
          delivery or payment-method evidence if it matters.
        </p>
      )}
      {((judgeSandbox && localGeminiAvailable) || localDiscoveryAvailable) && (
        <label className="chat-mode">
          Evaluation mode{" "}
          <select
            className="chat-mode-select"
            aria-label={
              judgeSandbox
                ? "Judge evaluation mode"
                : "Purchasing evaluation mode"
            }
            value={judgeMode}
            onChange={(event) => {
              setJudgeMode(
                event.target.value as "policy" | "gemini" | "discovery",
              );
              setResult(null);
              setDiscovery(null);
              onEvaluation?.(null);
            }}
            disabled={busy}
          >
            {judgeSandbox && (
              <option value="policy">Mock planner + real policy</option>
            )}
            <option value="gemini">Controlled purchasing · synthetic</option>
            {localDiscoveryAvailable && (
              <option value="discovery">Live research · real merchants</option>
            )}
          </select>
        </label>
      )}
      {loginRequired &&
        (judgeSandbox
          ? localGeminiAvailable && judgeMode !== "policy"
          : !PUBLIC_DEMO_ONLY) && (
          <form
            className="chat-composer"
            onSubmit={(event) => {
              event.preventDefault();
              void submit(true);
            }}
          >
            <label htmlFor={`${id}-password`}>
              {judgeSandbox ? "Local judge access code" : "Owner login secret"}
            </label>
            <input
              id={`${id}-password`}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <Button type="submit" disabled={busy || !password}>
              {judgeSandbox ? "Authenticate judge" : "Authenticate owner"}
            </Button>
          </form>
        )}
      {PUBLIC_DEMO_ONLY && !csrf && !judgeSandbox && !publicResearch && (
        <p>
          Live chat is disabled in this read-only public preview. Use the
          authenticated local agent profile for a separately authorized live
          test.
        </p>
      )}
      {judgeSandbox && !localGeminiAvailable && (
        <p className="chat-source">
          Public live Gemini is unavailable. This sandbox runs real policy
          checks with a mock planner; historical receipts are separate evidence.
        </p>
      )}
      {submitted && <p className="chat-user">{submitted}</p>}
      {busy && (
        <div className="chat-pending" role="status">
          <strong>
            {authenticating
              ? judgeSandbox
                ? "Authenticating judge…"
                : "Authenticating owner…"
              : judgeSandbox && judgeMode === "policy"
                ? "Evaluating your instruction against synthetic offers and real policy…"
                : researching
                  ? "Researching offers…"
                  : "Comparing eligible synthetic offers with Gemini…"}
          </strong>
          {researching && !authenticating && (
            <p className="chat-pending-detail">
              We search merchants, compare offers, and check payment evidence.
              {publicResearch
                ? " Allow up to a minute."
                : " This often takes 20–30 seconds."}
            </p>
          )}
        </div>
      )}
      <div className="chat-response" aria-busy={busy} aria-live="polite">
        {error && (
          <p role="alert">
            {publicResearch ? (
              Object.hasOwn(publicResearchErrors, error) ? (
                publicResearchErrors[error]
              ) : (
                "Live research couldn’t finish. Try again later."
              )
            ) : (
              <>
                {error === "PUBLIC_RESEARCH_LIMIT_REACHED"
                  ? "The daily research limit has been reached. Try again tomorrow (UTC)"
                  : error === "INVALID_RESEARCH_REQUEST"
                    ? "Use a product or service request without personal details or credentials"
                    : Object.hasOwn(judgeErrors, error)
                      ? judgeErrors[error]
                      : researching
                        ? "Online research couldn’t finish"
                        : "The evaluation couldn’t finish"}
                . No purchase intent or payment was created.
              </>
            )}
          </p>
        )}
        {incompleteComparison && (
          <IncompleteOfferComparison result={incompleteComparison} />
        )}
        {discovery && (
          <OfferDiscovery
            result={discovery}
            researchBudgetMinor={submittedBudget}
            assistedCheckout={
              publicResearch || (!judgeSandbox && Boolean(csrf))
            }
          />
        )}
        {result && (
          <>
            <strong>
              Purchasing agent ·{" "}
              {result.source === "DETERMINISTIC_POLICY_ENGINE"
                ? "mock planner / real policy result"
                : result.source === "MOCKED_TRANSPORT_TEST"
                  ? "mocked response"
                  : "real Gemini response"}
            </strong>
            <p>{result.agentExplanation}</p>
            <p>
              Evaluated constraints: maximum $
              {(Number(result.objective.maxPriceMinor) / 100).toFixed(2)} USD
              per purchase · SLA ≤{result.objective.maxSlaMinutes} minutes.
            </p>
            <ul aria-label="Eligible offer comparison">
              {result.offersEvaluated.map((offer) => (
                <li key={offer.offerId}>
                  {offer.merchantName}: {offer.priceDisplay},{" "}
                  {offer.deliverySlaMinutes}-minute delivery SLA
                  {" · "}
                  {offer.eligibility}
                  {offer.rejectionReasons.length > 0
                    ? ` (${offer.rejectionReasons.join(", ")})`
                    : ""}
                </li>
              ))}
            </ul>
            <article
              className="chat-proposal"
              aria-label="Embedded purchase proposal"
            >
              <div className="norway-card-heading">
                <strong>
                  {result.authorizationDecision.allowed
                    ? "Purchase proposal"
                    : "Proposal blocked"}
                </strong>
                <Badge
                  tone={
                    result.authorizationDecision.allowed ? "warning" : "danger"
                  }
                >
                  {result.authorizationDecision.allowed
                    ? "Human authorization required"
                    : result.authorizationDecision.verdictCode}
                </Badge>
              </div>
              <dl>
                <div>
                  <dt>Synthetic merchant</dt>
                  <dd>
                    <span className="norway-merchant-icon">
                      <Icon name="cloud" />
                    </span>
                    <span className="norway-merchant-name">
                      {result.proposal?.merchantName ?? "No eligible proposal"}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt>Purchase amount</dt>
                  <dd>
                    {result.proposal ? (
                      <span className="norway-price">
                        {result.proposal.amountDisplay.replace(
                          ` ${result.proposal.currency}`,
                          "",
                        )}{" "}
                        <small>{result.proposal.currency}</small>
                      </span>
                    ) : (
                      "Not authorized"
                    )}
                  </dd>
                </div>
              </dl>
              <p>{result.authorizationDecision.summary}</p>
              <p>
                {
                  result.authorizationDecision.checks.filter(
                    (check) => check.passed,
                  ).length
                }{" "}
                / {result.authorizationDecision.checks.length} independent
                policy checks passed.
              </p>
              <p className="proposal-safety">
                Evaluation only. No persistent intent, owner approval,
                reservation or payment. A fresh active campaign and separately
                authorized durable intent are required before checkout.
              </p>
              {!judgeSandbox && (
                <a href="/agent-checkout">
                  Open existing owner checkout workflow
                </a>
              )}
              <Button disabled>Payment execution disabled</Button>
            </article>
            {result.trace && (
              <details>
                <summary>Tool and policy trace</summary>
                <ol>
                  {result.trace.map((step) => (
                    <li key={step.step}>
                      {step.toolName ?? step.actor}: {step.summary} ·{" "}
                      {step.outcome}
                    </li>
                  ))}
                </ol>
              </details>
            )}
          </>
        )}
      </div>
      <form
        className="chat-composer"
        onSubmit={(event) => {
          event.preventDefault();
          void submit(false);
        }}
      >
        <label htmlFor={id}>Your purchasing instruction</label>
        <textarea
          id={id}
          maxLength={1000}
          value={instruction}
          disabled={busy}
          onChange={(event) => setInstruction(event.target.value)}
          placeholder={
            publicResearch
              ? "Compare weather API plans and check PayPal support…"
              : researching
                ? "Find weather API plans under $10 per month and check PayPal support…"
                : "Compare approved synthetic weather-data offers within my budget…"
          }
        />
        {publicResearch && (
          <div className="research-budget-field">
            <label htmlFor={`${id}-budget`}>Budget (USD)</label>
            <input
              id={`${id}-budget`}
              type="text"
              inputMode="decimal"
              placeholder="e.g. 100 or 1,000"
              maxLength={12}
              aria-describedby={`${id}-budget-help`}
              aria-invalid={budget.trim().length > 0 && !validBudget}
              required
              disabled={busy}
              value={budget}
              onChange={(event) => setBudget(event.target.value)}
            />
            <small id={`${id}-budget-help`}>
              {budget.trim().length > 0 && !validBudget
                ? publicResearchErrors.INVALID_RESEARCH_BUDGET
                : "For offer comparison only. No funds are reserved."}
            </small>
          </div>
        )}
        <div>
          <small>
            {publicResearch
              ? "Your request goes to search and AI providers. Leave out personal details and credentials."
              : "Leave out personal details and credentials. Chat never authorizes payment."}
          </small>
          <Button
            type="button"
            variant="soft"
            disabled={busy}
            onClick={() =>
              setInstruction(
                publicResearch
                  ? publicResearchExample
                  : researching
                    ? researchExample
                    : syntheticExample,
              )
            }
          >
            Use example
          </Button>
          <Button
            type="submit"
            disabled={
              busy ||
              (publicResearch
                ? !validBudget
                : !csrf && !(judgeSandbox && judgeMode === "policy")) ||
              !instruction.trim()
            }
          >
            {judgeSandbox && judgeMode === "policy"
              ? "Evaluate instruction"
              : researching
                ? "Research offers"
                : "Send to Gemini"}
          </Button>
        </div>
      </form>
    </section>
  );
}
