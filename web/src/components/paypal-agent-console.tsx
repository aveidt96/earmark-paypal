"use client";
import { useEffect, useState, type ReactNode } from "react";
import { PurchasingChat } from "./purchasing-chat";
import { Badge, Button, Icon } from "./glass";
import {
  PAYPAL_CORE_DEMO_SCENARIOS,
  PAYPAL_EXTRA_POLICY_SCENARIOS,
  PUBLIC_DEMO_ONLY,
  VERIFIED_PAYPAL_AGENT_RECEIPT,
  type PayPalAgentEvaluationResult,
  type PayPalAgentExecutionMode,
  type PayPalAgentScenarioId,
  type PurchasingChatResult,
} from "../lib/paypal-agent";

function formatMinorUsd(minor: string | undefined, currency = "USD") {
  if (!minor) return `$0.00 ${currency}`;
  const value = BigInt(minor);
  const whole = value / 100n;
  const cents = (value % 100n).toString().padStart(2, "0");
  return `$${whole.toString()}.${cents} ${currency}`;
}

function PurchasingConversation({
  result,
  loading,
}: {
  result: PayPalAgentEvaluationResult | null;
  loading: boolean;
}) {
  const [chatMode, setChatMode] = useState(false);
  const [chatResult, setChatResult] = useState<PurchasingChatResult | null>(
    null,
  );
  const current = chatMode ? chatResult : loading ? null : result;
  const allowed = current?.authorizationDecision.allowed === true;
  const judgeSandbox = PUBLIC_DEMO_ONLY && chatMode;
  return (
    <div
      className="norway-commerce"
      data-testid="norway-purchasing-conversation"
    >
      <aside className="norway-overview">
        <header className="norway-page-heading">
          <div>
            <h1>Agent checkout</h1>
            <p>
              {PUBLIC_DEMO_ONLY
                ? "Try a controlled purchase with synthetic offers and real policy checks."
                : "Compare synthetic offers under policy or research real merchants for manual review."}
            </p>
          </div>
          <Badge>{PUBLIC_DEMO_ONLY ? "Public demo" : "Sandbox"}</Badge>
        </header>
        <section
          className="norway-budget"
          aria-label={
            chatMode
              ? judgeSandbox
                ? "Synthetic judge policy budget"
                : "Local evaluation limits"
              : "Recorded Sandbox accounting"
          }
        >
          <div className="norway-card-heading">
            <h3>
              {judgeSandbox
                ? "SYNTHETIC JUDGE POLICY"
                : chatMode
                  ? "LOCAL EVALUATION LIMITS"
                  : "RECORDED SANDBOX MANDATE"}
            </h3>
            <Badge tone="success">
              {chatMode ? "Evaluation only" : "Completed"}
            </Badge>
          </div>
          {chatMode && !judgeSandbox ? (
            <div className="norway-budget-main">
              <strong>
                $10.00 <span>evaluation ceiling</span>
              </strong>
              <p>
                Synthetic proposals have a $6 purchase cap. Live research is
                review only.
              </p>
            </div>
          ) : (
            <>
              <div className="norway-budget-main">
                <strong>
                  {judgeSandbox ? "$10.00" : "$4.00"} <span>available</span>
                </strong>
                <dl className="norway-budget-values">
                  <div>
                    <dt>{judgeSandbox ? "Policy ceiling" : "Authorized"}</dt>
                    <dd>$10.00</dd>
                  </div>
                  <div>
                    <dt>Reserved</dt>
                    <dd>$0.00</dd>
                  </div>
                  <div>
                    <dt>Consumed</dt>
                    <dd>{judgeSandbox ? "$0.00" : "$6.00"}</dd>
                  </div>
                </dl>
              </div>
              <div
                className="norway-budget-meter"
                role="img"
                aria-label={
                  judgeSandbox
                    ? "Zero synthetic funds consumed"
                    : "$6 consumed of $10 authorized"
                }
              >
                <span style={judgeSandbox ? { width: "0%" } : undefined} />
              </div>
              <div className="norway-card-heading">
                <small>
                  {judgeSandbox
                    ? "$10.00 synthetic ceiling"
                    : "$10.00 authorized"}
                </small>
                <small>
                  {judgeSandbox
                    ? "$0 consumed · $0 reserved"
                    : "$6.00 consumed · $0 reserved"}
                </small>
              </div>
              <p className="micro" style={{ marginTop: "14px" }}>
                {judgeSandbox
                  ? "Fresh disposable policy on every request. $6 maximum purchase; no campaign, funds, approval or financial records are created."
                  : "Historical Task 05J · not current authority. No replay. Evaluation uses a separate fixture."}
              </p>
            </>
          )}
        </section>
      </aside>
      <div className="norway-chat-panel">
        <div className="norway-card-heading">
          <Button
            variant={!chatMode ? "primary" : "soft"}
            aria-pressed={!chatMode}
            onClick={() => {
              setChatMode(false);
              setChatResult(null);
            }}
          >
            Policy demo
          </Button>
          <Button
            variant={chatMode ? "primary" : "soft"}
            aria-pressed={chatMode}
            onClick={() => {
              setChatMode(true);
              setChatResult(null);
            }}
          >
            {PUBLIC_DEMO_ONLY ? "Judge sandbox" : "Live Gemini chat"}
          </Button>
        </div>
        {chatMode ? (
          <PurchasingChat
            judgeSandbox={judgeSandbox}
            onEvaluation={setChatResult}
          />
        ) : (
          <section
            className="purchasing-chat"
            aria-label="Gemini purchasing conversation"
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
              <h3>Gemini purchasing assistant</h3>
              <Badge>Policy simulation</Badge>
            </header>
            <p className="chat-source">
              Synthetic offers · deterministic walkthrough · no live AI call
            </p>
            <p className="chat-user">
              {current?.objective.instruction ??
                "Compare approved weather-data offers within the spending mandate."}
            </p>
            <div className="chat-response" aria-busy={loading}>
              <strong className="norway-simulated-label">
                Purchasing agent · simulated response
              </strong>
              <p>
                {current?.agentExplanation ??
                  "Loading the existing server-side policy evaluation…"}
              </p>
              {current && (
                <article
                  className="chat-proposal"
                  aria-label="Embedded purchase proposal"
                >
                  <div className="norway-card-heading">
                    <strong>
                      {allowed ? "Purchase proposal" : "Proposal blocked"}
                    </strong>
                    <Badge tone={allowed ? "warning" : "danger"}>
                      {allowed
                        ? "Human authorization required"
                        : current.authorizationDecision.verdictCode}
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
                          {current.proposal?.merchantName ??
                            "No authorized proposal"}
                        </span>
                      </dd>
                    </div>
                    <div>
                      <dt>Purchase amount</dt>
                      <dd>
                        {current.proposal ? (
                          <span className="norway-price">
                            {current.proposal.amountDisplay.replace(
                              ` ${current.proposal.currency}`,
                              "",
                            )}{" "}
                            <small>{current.proposal.currency}</small>
                          </span>
                        ) : (
                          "Not authorized"
                        )}
                      </dd>
                    </div>
                  </dl>
                  <p className="proposal-safety">
                    {current.authorizationDecision.summary} No persistent
                    reservation, PayPal order or capture is created by this
                    walkthrough.
                  </p>
                  <Button disabled>Payment execution disabled</Button>
                </article>
              )}
            </div>
            <Button onClick={() => setChatMode(true)}>
              Write a purchasing instruction
            </Button>
          </section>
        )}
      </div>
      <aside
        className="norway-policy-rail"
        aria-label="Independent policy and recorded activity"
      >
        <section className="norway-policy-card">
          <div className="norway-card-heading">
            <h2>Policy checks</h2>
            <Badge
              tone={current ? (allowed ? "success" : "danger") : "neutral"}
            >
              {current
                ? allowed
                  ? "ALL PASSED"
                  : "BLOCKED"
                : "AWAITING EVALUATION"}
            </Badge>
          </div>
          <p className="chat-source">
            {chatMode
              ? current
                ? chatResult?.source === "DETERMINISTIC_POLICY_ENGINE"
                  ? "Real policy execution · mock AI planner"
                  : chatResult?.source === "MOCKED_TRANSPORT_TEST"
                    ? "Mocked transport test"
                    : "Real Gemini evaluation"
                : judgeSandbox
                  ? "Awaiting judge instruction"
                  : "No validated live result"
              : "Independent policy simulation · synthetic catalog"}
          </p>
          <p className="norway-check-total">
            <strong>
              {current
                ? current.authorizationDecision.checks.filter((c) => c.passed)
                    .length
                : "—"}
              /{current?.authorizationDecision.checks.length ?? "—"}
            </strong>{" "}
            checks passed
          </p>
          <div className="norway-check-meter" aria-hidden="true">
            {current?.authorizationDecision.checks.map((c) => (
              <span key={c.id} className={c.passed ? "passed" : "failed"} />
            ))}
          </div>
          <ul className="norway-policy-checks">
            {current?.authorizationDecision.checks.slice(0, 5).map((c) => (
              <li key={c.id}>
                <span className={c.passed ? "passed" : "failed"}>
                  <Icon name={c.passed ? "check" : "close"} />
                </span>
                <strong>{c.label}</strong>
                <code>{c.passed ? "PASSED" : (c.code ?? "REJECTED")}</code>
              </li>
            ))}
          </ul>
          {current && (
            <details>
              <summary>
                Show all {current.authorizationDecision.checks.length} checks
              </summary>
              <ul className="norway-policy-checks">
                {current.authorizationDecision.checks.map((c) => (
                  <li key={c.id}>
                    <span className={c.passed ? "passed" : "failed"}>
                      <Icon name={c.passed ? "check" : "close"} />
                    </span>
                    <div>
                      <strong>{c.label}</strong>
                      <p>{c.detail}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
        <section className="norway-recent-card">
          <div className="norway-card-heading">
            <h2>Recent activity</h2>
            <a href="/activity">View all</a>
          </div>
          <div className="norway-recent-item">
            <Icon name="shield" />
            <div>
              <strong>Gemini + PayPal Sandbox</strong>
              <p>Completed · 31 Oct 2026</p>
            </div>
            <span>$6.00</span>
          </div>
          <p className="micro">
            Verified Task 05J receipt · recorded, never replayed.
          </p>
        </section>
        <section className="norway-trust">
          <h3>
            <Icon name="shield" /> Private by design
          </h3>
          <p>Gemini never receives PayPal credentials.</p>
          <p>
            {chatMode && !judgeSandbox
              ? "Controlled evaluations use a bounded synthetic catalog. Online research uses public merchant sources."
              : "Only permitted synthetic catalog and policy data may leave the server."}
          </p>
          <p>Owner authorization and PayPal buyer approval remain mandatory.</p>
        </section>
      </aside>
    </div>
  );
}

export function PayPalAgentConsole({
  controls,
  initialScenarioId = "normal",
  renderPreparation,
}: {
  controls?: ReactNode;
  initialScenarioId?: PayPalAgentScenarioId;
  renderPreparation?: (controls: ReactNode) => ReactNode;
}) {
  const [scenarioId, setScenarioId] =
    useState<PayPalAgentScenarioId>(initialScenarioId);
  const [execMode, setExecMode] = useState<PayPalAgentExecutionMode>(
    "deterministic-policy",
  );
  const [result, setResult] = useState<PayPalAgentEvaluationResult | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    if (execMode === "gemini") {
      setResult(null);
      setLoading(false);
      return;
    }
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(
          `/api/paypal/agent?scenarioId=${encodeURIComponent(scenarioId)}&mode=${encodeURIComponent(execMode)}`,
          { method: "GET", headers: { Accept: "application/json" } },
        );
        const body = (await res.json()) as
          PayPalAgentEvaluationResult | { error?: string };
        if (cancelled) return;
        if (!res.ok || !("evaluationId" in body)) {
          setError(
            ("error" in body && body.error) || "AGENT_EVALUATION_FAILED",
          );
          return;
        }
        setResult(body);
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof Error ? e.message : "AGENT_EVALUATION_UNAVAILABLE",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [scenarioId, execMode]);

  const authorized =
    result?.proposalState === "PROPOSAL_AUTHORIZED_NO_ORDER_CREATED";
  const rejected = result?.proposalState === "PROPOSAL_REJECTED";
  const noEligible = result?.proposalState === "NO_ELIGIBLE_PROVIDER";

  if (execMode === "gemini" && renderPreparation)
    return renderPreparation(
      <>
        {controls}
        <Button
          variant="soft"
          onClick={() => setExecMode("deterministic-policy")}
        >
          Deterministic Policy Simulation
        </Button>
      </>,
    );

  return (
    <section className="execution-console" aria-label="Execution Console">
      <div className="console-heading">
        <div>
          <span className="console-kicker">PURPOSE-BOUND AUTHORITY / 01</span>
          <h2>Execution Console</h2>
          <p>The agent proposes. The mandate constrains.</p>
        </div>
        <Badge>
          {result
            ? `${result.actualExecutionLabel} · Synthetic Merchant Catalog · No PayPal Order Created`
            : "PayPal Purchasing Agent · Policy Authorization Boundary"}
        </Badge>
      </div>
      <>
        {controls}
        <div className="gemini-controls">
          <fieldset aria-label="PayPal agent execution adapter">
            <Button
              variant={execMode === "deterministic-policy" ? "primary" : "soft"}
              aria-pressed={execMode === "deterministic-policy"}
              disabled={loading}
              onClick={() => setExecMode("deterministic-policy")}
            >
              Deterministic Policy Simulation
            </Button>
            {renderPreparation && (
              <Button
                variant="soft"
                aria-pressed={false}
                disabled={loading || PUBLIC_DEMO_ONLY}
                onClick={() => {
                  if (!PUBLIC_DEMO_ONLY) setExecMode("gemini");
                }}
              >
                Live Gemini API Inference
              </Button>
            )}
          </fieldset>
          {PUBLIC_DEMO_ONLY && (
            <p className="micro">
              This policy demo runs without Gemini or PayPal calls. The $6.00
              USD Sandbox receipt is historical.
            </p>
          )}
          <fieldset aria-label="PayPal agent security scenarios">
            {PAYPAL_CORE_DEMO_SCENARIOS.map((item) => (
              <Button
                key={item.id}
                variant={scenarioId === item.id ? "primary" : "soft"}
                aria-pressed={scenarioId === item.id}
                disabled={loading}
                onClick={() => setScenarioId(item.id)}
              >
                {item.label}
              </Button>
            ))}
          </fieldset>
          <details className="micro">
            <summary>Additional policy boundary probes (P3 / P5 / P6)</summary>
            <fieldset
              aria-label="Additional PayPal policy scenarios"
              style={{ marginTop: "8px" }}
            >
              {PAYPAL_EXTRA_POLICY_SCENARIOS.map((item) => (
                <Button
                  key={item.id}
                  variant={scenarioId === item.id ? "primary" : "soft"}
                  aria-pressed={scenarioId === item.id}
                  disabled={loading}
                  onClick={() => setScenarioId(item.id)}
                >
                  {item.code} — {item.title}
                </Button>
              ))}
            </fieldset>
          </details>
          <p className="micro">
            <strong>Execution & Data Labels:</strong>{" "}
            {result?.actualExecutionLabel ?? "LOADING"} · Model:{" "}
            <code>{result?.modelName ?? "pending"}</code> ·{" "}
            {result?.syntheticCatalogNotice ??
              "Merchant offers are synthetic catalog entries; no PayPal order is created."}
          </p>
          {error && (
            <p className="gemini-error" role="alert">
              Evaluation error: <code>{error}</code>
            </p>
          )}
        </div>
      </>
      <>
        <PurchasingConversation result={result} loading={loading} />
        <div className="console-body">
          <div className="console-pane">
            <span className="console-kicker">
              01 / GEMINI PURCHASING AGENT — OFFER EVALUATION & PROPOSAL
            </span>
            <div className="console-identity">
              <span className="console-agent-icon">
                <Icon name="spark" />
              </span>
              <div>
                <h3>PayPal Mandate Purchasing Agent</h3>
                <p>
                  {result?.actualExecutionLabel === "REAL_GEMINI_API_INFERENCE"
                    ? `Real Gemini Inference (${result.modelName})`
                    : result?.actualExecutionLabel ===
                        "GEMINI_BLOCKED_MISSING_CREDENTIALS"
                      ? `Live Gemini Blocked (${result.errorCode}) — No Mock Substitution`
                      : `Simulated Deterministic Policy Adapter (${result?.modelName ?? "deterministic-policy-v1"})`}
                </p>
              </div>
            </div>
            {scenarioId === "normal" && (
              <div
                className="console-inset"
                data-testid="paypal-completed-receipt"
              >
                <span className="console-kicker">
                  VERIFIED COMPLETED $6.00 USD PAYPAL SANDBOX TRANSACTION (TASK
                  05J — READ-ONLY, NO REPLAY)
                </span>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "8px",
                    alignItems: "center",
                    margin: "6px 0",
                  }}
                >
                  <Badge tone="success">
                    {VERIFIED_PAYPAL_AGENT_RECEIPT.status} ·{" "}
                    {VERIFIED_PAYPAL_AGENT_RECEIPT.amountDisplay}
                  </Badge>
                  <code>Order {VERIFIED_PAYPAL_AGENT_RECEIPT.orderId}</code>
                  <code>Capture {VERIFIED_PAYPAL_AGENT_RECEIPT.captureId}</code>
                </div>
                <p className="micro">
                  <strong>Accounting ($10 Mandate):</strong> $10.00 (
                  {VERIFIED_PAYPAL_AGENT_RECEIPT.authorizedMinor}) Authorized ·{" "}
                  <strong>
                    $6.00 ({VERIFIED_PAYPAL_AGENT_RECEIPT.consumedMinor})
                    Consumed
                  </strong>{" "}
                  · $0.00 ({VERIFIED_PAYPAL_AGENT_RECEIPT.reservedMinor})
                  Reserved · $4.00 (
                  {VERIFIED_PAYPAL_AGENT_RECEIPT.availableMinor}) Available.
                  <br />
                  Campaign{" "}
                  <code>{VERIFIED_PAYPAL_AGENT_RECEIPT.campaignVersion}</code> (
                  <code>{VERIFIED_PAYPAL_AGENT_RECEIPT.campaignId}</code>) ·
                  Mandate <code>{VERIFIED_PAYPAL_AGENT_RECEIPT.mandateId}</code>{" "}
                  · Live Gemini Intent{" "}
                  <code>{VERIFIED_PAYPAL_AGENT_RECEIPT.intentId}</code> ·
                  Attempt <code>{VERIFIED_PAYPAL_AGENT_RECEIPT.attemptId}</code>{" "}
                  · Completed{" "}
                  <code>{VERIFIED_PAYPAL_AGENT_RECEIPT.completedAt}</code>.
                  <br />
                  Displayed read-only without replaying live Gemini or PayPal
                  API requests. Below is the offline deterministic policy
                  walkthrough.
                </p>
              </div>
            )}
            <div className="console-inset">
              <span className="console-kicker">PURCHASING OBJECTIVE</span>
              <h4>
                {result?.objective.title ??
                  "Acquire Verified US Regional Weather Feed (weather-v1)"}
              </h4>
              <p className="micro">
                {result?.objective.instruction} · Required dataset:{" "}
                <code>{result?.objective.requiredDataset ?? "weather-v1"}</code>{" "}
                · Max SLA: {result?.objective.maxSlaMinutes ?? 15}m · Target:{" "}
                {formatMinorUsd(
                  result?.objective.maxPriceMinor ?? "600",
                  result?.objective.targetCurrency ?? "USD",
                )}{" "}
                max
              </p>
            </div>
            <div className="console-section-title">
              <span>OFFERS EVALUATED & PRICE COMPARISON</span>
              <small>Synthetic merchant catalog · integer minor units</small>
            </div>
            <div className="console-quote-list">
              {result?.offersEvaluated.map((offer) => {
                const isRecommended =
                  offer.offerId === result.recommendedOfferId;
                const isProposed = offer.offerId === result.proposal?.offerId;
                return (
                  <div
                    key={offer.offerId}
                    className={isProposed || isRecommended ? "selected" : ""}
                  >
                    <div>
                      <strong>
                        {offer.merchantName} (<code>{offer.offerId}</code>)
                      </strong>
                      <small>
                        {isProposed
                          ? "Agent proposed"
                          : isRecommended
                            ? "Recommended eligible offer"
                            : offer.eligibility === "ELIGIBLE"
                              ? "Eligible backup offer"
                              : `Rejected: ${offer.rejectionReasons.join(", ")}`}{" "}
                        · SLA {offer.deliverySlaMinutes}m · Quality{" "}
                        {offer.qualityScore}/100 ·{" "}
                        {offer.approvedByMandate
                          ? "Approved Merchant"
                          : "Unapproved Merchant"}{" "}
                        ·{" "}
                        {offer.commitmentVerified
                          ? "Commitment Verified"
                          : "Commitment Mismatch"}
                      </small>
                    </div>
                    <span className="console-mono">
                      {offer.priceDisplay} ({offer.priceMinor} minor)
                    </span>
                  </div>
                );
              })}
            </div>
            {result?.scenarioId === "prompt-injection" && (
              <details className="untrusted-input" open>
                <summary>
                  Untrusted adversarial merchant descriptions (override attempts
                  rejected by tool &amp; policy boundaries)
                </summary>
                <pre>
                  {
                    result.offersEvaluated.find(
                      (o) => o.offerId === "offer-us-weather-std-600",
                    )?.untrustedDescription
                  }
                  {"\n\n"}
                  {
                    result.offersEvaluated.find(
                      (o) => o.offerId === "offer-unapproved-merchant-300",
                    )?.untrustedDescription
                  }
                </pre>
                <p className="micro" style={{ marginTop: "8px" }}>
                  Direct payment tool overrides (<code>captureOrder</code>,{" "}
                  <code>overridePolicy</code>, <code>createOrder</code>) are
                  blocked at the tool boundary (
                  <code>FORBIDDEN_AGENT_TOOL</code>
                  ), and any coerced proposal for an unlisted merchant is
                  independently rejected by <code>authorize()</code> (
                  <code>UNAPPROVED_MERCHANT</code>).
                </p>
              </details>
            )}
            {result?.scenarioId === "fabricated-delivery" && (
              <div className="console-inset" style={{ marginTop: "12px" }}>
                <span className="console-kicker">
                  IMPLEMENTED FULFILLMENT SAFEGUARDS VS. PAYPAL ORDERS V2 SCOPE
                </span>
                <p className="micro">
                  <strong>Implemented in PayPal path:</strong> Pre-proposal{" "}
                  <code>keccak256</code> offer commitment digest verification (
                  <code>INVALID_DELIVERY_COMMITMENT</code>), SLA suitability
                  checks, SHA-256 immutable intent-to-checkout term binding (
                  <code>AGENT_CHECKOUT_IMMUTABLE_TERMS_MISMATCH</code>), human
                  owner + buyer approval gates, and canonical post-capture
                  seller/amount/order binding (
                  <code>PAYPAL_CAPTURE_BINDING_MISMATCH</code>).
                  <br />
                  <strong>Honest boundary (not simulated as real):</strong>{" "}
                  PayPal Orders v2 immediate <code>CAPTURE</code> does not
                  implement post-capture merchant payload delivery inspection,
                  delivery-conditional PayPal escrow hold, or automated
                  post-capture refund/dispute reversal.
                </p>
              </div>
            )}
            <div className="console-section-title">
              <span>AGENT RECOMMENDATION & EXPLANATION</span>
              <small>Untrusted merchant text has zero authority</small>
            </div>
            <p className="console-decision">
              {result?.agentExplanation ??
                "Evaluating merchant offers against spending mandate..."}
            </p>
            <div className="console-request">
              <span className="console-kicker">
                PAYMENT PROPOSAL STATE ({result?.proposalState ?? "PENDING"})
              </span>
              <strong>
                {result?.proposal
                  ? `${result.proposal.amountDisplay} (${result.proposal.amountMinor} minor) → ${result.proposal.merchantId} (${result.proposal.offerId})`
                  : noEligible
                    ? "No Eligible Provider — No Purchase Proposed"
                    : "No Validated Proposal Submitted"}
              </strong>
              {result?.proposal && (
                <code className="hash">
                  purchaseKey: {result.proposal.purchaseKey} · commitment:{" "}
                  {result.proposal.deliveryCommitment.slice(0, 22)}…
                </code>
              )}
            </div>
            <details className="gemini-tools" open>
              <summary>
                Provider & Decision Trace · {result?.trace.length ?? 0} step(s)
              </summary>
              {result?.trace.map((step) => (
                <div key={step.step}>
                  <strong>
                    Step {step.step} · {step.actor}
                    {step.toolName ? ` · ${step.toolName}` : ""} (
                    {step.outcome.toUpperCase()})
                  </strong>
                  <pre>
                    {step.summary} — {step.detail}
                  </pre>
                </div>
              ))}
            </details>
          </div>
          <div className="console-boundary">
            <Icon name="lock" />
            <span>TRUST BOUNDARY</span>
            <Icon name="arrow" />
          </div>
          <div className="console-pane">
            <span className="console-kicker">
              02 / EARMARK PAYPAL POLICY ENGINE — AUTHORIZATION VERDICT
            </span>
            <div className="console-identity">
              <span className="console-agent-icon">
                <Icon name="shield" />
              </span>
              <div>
                <h3>Server-Side PayPal Policy & Budget Guard</h3>
                <p>
                  Isolated evaluation mandate{" "}
                  <code>{result?.mandate.id ?? "pending"}</code> · No PayPal
                  orders created
                </p>
              </div>
            </div>
            <div className="console-inset console-budget">
              <span className="console-kicker">
                EVALUATION MANDATE BUDGET (INTEGER MINOR UNITS)
              </span>
              <strong>
                Cap:{" "}
                {formatMinorUsd(
                  result?.mandate.capMinor,
                  result?.mandate.currency,
                )}{" "}
                ({result?.mandate.capMinor ?? "1000"} minor) · Per-Tx Limit:{" "}
                {formatMinorUsd(
                  result?.mandate.perTransactionMinor,
                  result?.mandate.currency,
                )}{" "}
                ({result?.mandate.perTransactionMinor ?? "600"} minor)
              </strong>
              <p>
                Available:{" "}
                {formatMinorUsd(
                  result?.mandate.availableMinor,
                  result?.mandate.currency,
                )}{" "}
                ({result?.mandate.availableMinor ?? "0"} minor) · Reserved:{" "}
                {formatMinorUsd(
                  result?.mandate.reservedMinor,
                  result?.mandate.currency,
                )}{" "}
                ({result?.mandate.reservedMinor ?? "0"} minor) · Consumed:{" "}
                {formatMinorUsd(
                  result?.mandate.consumedMinor,
                  result?.mandate.currency,
                )}{" "}
                ({result?.mandate.consumedMinor ?? "0"} minor) · Status:{" "}
                <code>{result?.mandate.status ?? "ACTIVE"}</code>
              </p>
            </div>
            <ul className="console-checks sequential-checks">
              {(result?.authorizationDecision.checks ?? []).map((check, i) => (
                <li
                  key={check.id}
                  className="revealed"
                  style={{ animationDelay: `${i * 80}ms` }}
                >
                  <span className={check.passed ? "passed" : "failed"}>
                    <Icon name={check.passed ? "check" : "shield"} />
                  </span>
                  <strong>{check.label}</strong>
                  <small>
                    {check.passed
                      ? "POLICY PASSED"
                      : `REJECTED (${check.code ?? "POLICY_VIOLATION"})`}
                  </small>
                </li>
              ))}
            </ul>
            {result && (
              <p className="console-terms">
                <strong>Payment Execution Boundary:</strong>{" "}
                {result.executionBoundary.boundarySummary}
                <br />
                <strong>
                  Immutable Task 05J Gemini + PayPal Record (Untouched):
                </strong>{" "}
                Order{" "}
                <code>
                  {result.historicalImmutableRecords.agentCaptureOrderId}
                </code>{" "}
                · Capture{" "}
                <code>{result.historicalImmutableRecords.agentCaptureId}</code>{" "}
                ({result.historicalImmutableRecords.agentCaptureStatus}, $10.00
                authorized, $6.00 consumed, $0.00 reserved, $4.00 available).
                <br />
                <strong>
                  Immutable Task 03G US Record (Untouched):
                </strong> Order{" "}
                <code>
                  {result.historicalImmutableRecords.usCaptureOrderId}
                </code>{" "}
                · Capture{" "}
                <code>{result.historicalImmutableRecords.usCaptureId}</code> (
                {result.historicalImmutableRecords.usCaptureStatus}, $6.00
                consumed, $0.00 reserved, $4.00 available).
                <br />
                <strong>
                  Immutable Task 03C Held Record (Untouched):
                </strong>{" "}
                Order{" "}
                <code>
                  {result.historicalImmutableRecords.originalHeldOrderId}
                </code>{" "}
                ($6.00 reserved held).
              </p>
            )}
            <div
              className={
                "console-verdict " +
                (authorized
                  ? "success"
                  : rejected || noEligible
                    ? "danger"
                    : "warning")
              }
              role="status"
            >
              <span className="console-kicker">
                INDEPENDENT SERVER POLICY VERDICT
              </span>
              <strong data-testid="paypal-agent-verdict">
                {authorized
                  ? "PROPOSAL AUTHORIZED — NO PAYPAL ORDER CREATED"
                  : rejected
                    ? `PROPOSAL REJECTED (${result?.authorizationDecision.verdictCode})`
                    : noEligible
                      ? `NO ELIGIBLE PROVIDER (${result?.authorizationDecision.verdictCode})`
                      : `INFERENCE BLOCKED (${result?.authorizationDecision.verdictCode ?? "PENDING"})`}
              </strong>
              <p>{result?.authorizationDecision.summary}</p>
              <code>
                PayPal Orders Created:{" "}
                {result?.executionBoundary.paypalOrdersCreated ?? 0} · PayPal
                Captures Executed:{" "}
                {result?.executionBoundary.paypalCapturesExecuted ?? 0} · Buyer
                Approval Required: true
              </code>
            </div>
          </div>
        </div>
      </>
      <ol
        className="gemini-progress"
        aria-label="PayPal agent proposal lifecycle"
      >
        {[
          "Read Spending Mandate",
          "List Merchant Catalog",
          "Compare Price & Terms",
          "Server Policy Verdict",
          "Execution Boundary Locked (No Order)",
        ].map((name) => (
          <li key={name} className={result ? "reached" : ""}>
            {name}
          </li>
        ))}
      </ol>
    </section>
  );
}
