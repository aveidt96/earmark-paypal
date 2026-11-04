"use client";
import { useEffect, useState, type ReactNode } from "react";
import { formatUnits } from "viem";
import type { Hex } from "viem";
import { useWorkspace } from "./workspace-provider";
import { RecordedDemo } from "./recorded-demo";
import { ExecutionConsole } from "./execution-console";
import { AgentCheckoutPreparation } from "./agent-checkout";
import { useTheme } from "./theme-provider";
import { PurchasingChat } from "./purchasing-chat";
import { Badge, Button, Icon } from "./glass";
import {
  geminiError,
  geminiStage,
  geminiStages,
  type GeminiChallenge,
  type GeminiSessionView,
} from "../lib/gemini";
import type { MandateView, RunView, PaymentRecord } from "../lib/model";
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
type Access = { sessionId: Hex; token?: string };
function LiveGemini({ controls }: { controls: ReactNode }) {
  const w = useWorkspace();
  const [scenario, setScenario] = useState<"normal" | "injection">("normal");
  const [view, setView] = useState<GeminiSessionView | null>(null);
  const [access, setAccess] = useState<Access | null>(null);
  const [pending, setPending] = useState(false),
    [error, setError] = useState(""),
    [restored, setRestored] = useState(false);
  const [tick, setTick] = useState(Date.now());
  const config = w.snapshot.config;
  const authorized = Boolean(
    w.wallet &&
    config &&
    w.wallet.chainId === config.chainId &&
    w.wallet.account.toLowerCase() === w.snapshot.owner?.toLowerCase(),
  );
  const storageKey =
    "earmark-gemini:" + (config?.vault ?? "") + ":" + (w.wallet?.account ?? "");
  useEffect(() => {
    setView(null);
    setAccess(null);
    setRestored(true);
    try {
      const value = sessionStorage.getItem(storageKey);
      if (value) setAccess(JSON.parse(value) as Access);
    } catch {
      /* Explicit reauthorization is available. */
    }
  }, [storageKey]);
  useEffect(() => {
    if (!access?.token || !authorized) return;
    let stopped = false,
      failures = 0;
    let timer: ReturnType<typeof setTimeout>;
    const read = async () => {
      try {
        const response = await w.post("gemini-read", access);
        if (stopped) return;
        const next = response as unknown as GeminiSessionView;
        setView(next);
        setError("");
        failures = 0;
        if (next.session.status === "running")
          timer = setTimeout(() => void read(), 1500);
      } catch (e) {
        if (stopped) return;
        setError(e instanceof Error ? e.message : "CONNECTION_INTERRUPTED");
        if (++failures < 5) timer = setTimeout(() => void read(), 3000);
      }
    };
    void read();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [access, authorized, w.post]); // POST reads never launch or retry inference.
  useEffect(() => {
    if (view?.session.status !== "running") return;
    const timer = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [view?.session.status]);
  const save = (value: Access) => {
    setAccess(value);
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(value));
    } catch {
      /* Run ID remains available for signed recovery. */
    }
  };
  const start = async (recover = false) => {
    setPending(true);
    setError("");
    setView(null);
    setAccess(null); // Never show the previous verdict as the result of a new request.
    try {
      const c = (await w.post(
        "gemini-challenge",
        recover
          ? { action: "gemini-view", sessionId: access?.sessionId }
          : {
              action:
                scenario === "normal" ? "gemini-normal" : "gemini-injection",
            },
      )) as unknown as GeminiChallenge;
      const signature = await w.ownerWallet().signGemini(c);
      save({ sessionId: c.purchaseKey }); // Save identity before the uncertain HTTP boundary.
      const result = await w.post("gemini-start", {
        nonce: c.nonce,
        signature,
      });
      if (!result.sessionId || !result.token)
        throw new Error("AUTHORIZATION_RESULT_UNCERTAIN");
      save({ sessionId: result.sessionId as Hex, token: result.token });
      setRestored(recover);
      setView(null);
      setTick(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : "AUTHORIZATION_FAILED");
    } finally {
      setPending(false);
    }
  };
  const cancel = async () => {
    setPending(true);
    try {
      await w.post("gemini-cancel", access);
      setAccess((saved) => (saved ? { ...saved } : null));
    } catch (e) {
      setError(e instanceof Error ? e.message : "CANCELLATION_FAILED");
    } finally {
      setPending(false);
    }
  };
  const session = view?.session,
    events = view?.events ?? [];
  const proposal = session?.proposal;
  const validated = session?.status === "validated",
    failed =
      session &&
      ["failed", "cancelled", "interrupted"].includes(session.status);
  const running = session?.status === "running",
    stage = geminiStage(events);
  const quotes = session?.context.observations.quotes ?? [];
  const toolEvents = events.filter((e) =>
    ["gemini.tool", "gemini.tool.result"].includes(e.type),
  );
  const reason =
    proposal?.reason ??
    events.findLast((e) => e.type === "gemini.decision")?.data.summary;
  return (
    <ExecutionConsole
      mandate={undefined}
      run={undefined}
      payment={undefined}
      source={
        session
          ? error
            ? "Recorded Live Gemini Session · connection interrupted"
            : running && !restored
              ? "Live Gemini · live inference"
              : "Recorded Live Gemini Session"
          : "Live Gemini · owner-only read-only session"
      }
      controls={
        <>
          {controls}
          <div className="gemini-controls">
            <fieldset aria-label="Live Gemini scenarios">
              <Button
                variant={scenario === "normal" ? "primary" : "soft"}
                aria-pressed={scenario === "normal"}
                disabled={running || pending}
                onClick={() => setScenario("normal")}
              >
                Normal Provider Selection
              </Button>
              <Button
                variant={scenario === "injection" ? "primary" : "soft"}
                aria-pressed={scenario === "injection"}
                disabled={running || pending}
                onClick={() => setScenario("injection")}
              >
                Prompt Injection · Live Gemini
              </Button>
            </fieldset>
            <p className="micro">
              Synthetic read-only earmark fixture · 10 mock USDC cap · simulated
              providers · genuine Gemini inference.
            </p>
            <div className="gemini-actions">
              <Button
                disabled={
                  !authorized ||
                  !w.snapshot.geminiAvailable ||
                  pending ||
                  running ||
                  Boolean(access && !view)
                }
                onClick={() => void start()}
              >
                {pending
                  ? "Awaiting owner authorization…"
                  : "Start read-only Gemini session"}
              </Button>
              {running && (
                <Button
                  variant="soft"
                  disabled={pending}
                  onClick={() => void cancel()}
                >
                  Cancel session
                </Button>
              )}
              {access && !view && (
                <Button
                  variant="soft"
                  disabled={!authorized || pending}
                  onClick={() => void start(true)}
                >
                  Recover session
                </Button>
              )}
              {error && access?.token && (
                <Button
                  variant="soft"
                  onClick={() =>
                    setAccess((saved) => (saved ? { ...saved } : null))
                  }
                >
                  Reconnect to existing session
                </Button>
              )}
              {view && (
                <Button
                  variant="ghost"
                  onClick={() =>
                    void navigator.clipboard
                      .writeText(JSON.stringify(view, null, 2))
                      .then(() =>
                        w.notify({
                          kind: "success",
                          message: "Sanitized Gemini summary copied.",
                        }),
                      )
                      .catch(() => setError("COPY_UNAVAILABLE"))
                  }
                >
                  Copy execution summary
                </Button>
              )}
            </div>
            {!w.snapshot.geminiAvailable && (
              <p role="status">Live Gemini is currently unavailable.</p>
            )}
            {!authorized && (
              <p className="micro">
                Connect the current vault owner on the configured network to
                authorize live inference.
              </p>
            )}
            {error && (
              <p className="gemini-error" role="alert">
                {geminiError(error)} <code>{error}</code>
              </p>
            )}
            {session && (
              <div className="gemini-session-meta">
                <time dateTime={new Date(session.createdAt).toISOString()}>
                  {new Date(session.createdAt).toLocaleString()}
                </time>
                <span>{session.model}</span>
                <code className="hash">{session.id}</code>
              </div>
            )}
          </div>
        </>
      }
      content={
        <div className="console-body">
          <div className="console-pane">
            <span className="console-kicker">
              01 / LIVE GEMINI — AGENT PROPOSAL
            </span>
            <div className="console-identity">
              <span className="console-agent-icon">
                <Icon name="spark" />
              </span>
              <div>
                <h3>Research Agent</h3>
                <p>
                  {session?.model ?? "Server-configured Gemini"} ·{" "}
                  {running
                    ? "Inference in progress"
                    : (session?.status ??
                      "Awaiting signed owner authorization")}
                </p>
              </div>
            </div>
            <div className="console-inset">
              <span className="console-kicker">TASK</span>
              <h4>
                {session?.context.task.instruction ??
                  "Find a suitable provider for a 2026 Lagos weather dataset. Maximum spending: 10 mock USDC."}
              </h4>
            </div>
            <div className="console-section-title">
              <span>PROVIDER QUOTES</span>
              <small>Simulated offers supplied to Gemini</small>
            </div>
            <div className="console-quote-list">
              {quotes.length ? (
                quotes.map((q) => (
                  <div
                    key={q.quoteId}
                    className={
                      q.providerId === proposal?.providerId ? "selected" : ""
                    }
                  >
                    <div>
                      <strong>
                        {q.providerId === "datahub" ? "DataHub" : "WeatherCo"}
                      </strong>
                      <small>
                        {q.providerId === proposal?.providerId
                          ? "Gemini recommended"
                          : "Fixture offer"}
                      </small>
                    </div>
                    <span className="console-mono">
                      {formatUnits(BigInt(q.price), 6)} mock USDC
                    </span>
                  </div>
                ))
              ) : (
                <p className="muted">
                  Quotes appear when the authorized session starts.
                </p>
              )}
            </div>
            {session?.scenario === "injection" && (
              <details className="untrusted-input" open>
                <summary>Untrusted malicious provider response</summary>
                <pre>
                  {
                    quotes.find((q) => q.providerId === "weatherco")
                      ?.description
                  }
                </pre>
              </details>
            )}
            <div className="console-section-title">
              <span>ACTUAL MODEL DECISION</span>
              <small>No hidden reasoning</small>
            </div>
            <p className="console-decision">
              {reason ??
                "The actual model summary appears after Gemini returns."}
            </p>
            <div className="console-request">
              <span className="console-kicker">PROPOSED PAYMENT</span>
              <strong>
                {proposal
                  ? formatUnits(BigInt(proposal.amount), 6) +
                    " mock USDC → " +
                    proposal.providerId
                  : "No validated proposal yet"}
              </strong>
              {proposal && <code className="hash">{proposal.recipient}</code>}
            </div>
            <details className="gemini-tools" open>
              <summary>
                Actual tool activity · {toolEvents.length} records
              </summary>
              {toolEvents.map((e) => (
                <div key={e.id}>
                  <strong>
                    {String(e.data.name)} ·{" "}
                    {e.type === "gemini.tool"
                      ? "Gemini request"
                      : "Backend tool result"}
                  </strong>
                  <pre>{String(e.data.args ?? e.data.result)}</pre>
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
              02 / EARMARK — BACKEND AUTHORIZATION
            </span>
            <div className="console-identity">
              <span className="console-agent-icon">
                <Icon name="shield" />
              </span>
              <div>
                <h3>Read-only earmark fixture</h3>
                <p>Synthetic permissions · no onchain check claimed</p>
              </div>
            </div>
            <div className="console-inset console-budget">
              <span className="console-kicker">SPENDING CAP</span>
              <strong>10 mock USDC</strong>
              <p>
                Fixture liquidity: 20 mock USDC. Nothing reserved or
                transferred.
              </p>
            </div>
            <ul className="console-checks sequential-checks">
              {[
                "Authorized fixture agent",
                "Approved provider",
                "Cumulative budget & liquidity",
                "Active fixture & valid expiry",
                "Approved fixture token",
              ].map((label, i) => (
                <li
                  key={label}
                  className={validated ? "revealed" : "pending"}
                  style={{ animationDelay: `${i * 120}ms` }}
                >
                  <span className={validated ? "passed" : ""}>
                    <Icon name={validated ? "check" : "shield"} />
                  </span>
                  <strong>{label}</strong>
                  <small>
                    {validated ? "BACKEND PASSED" : "AWAITING VALIDATION"}
                  </small>
                </li>
              ))}
            </ul>
            {session && (
              <p className="console-terms">
                Providers:{" "}
                {session.context.observations.providers
                  ?.map((p) => p.name)
                  .join(", ")}
                .<br />
                Fixture agent:{" "}
                <code className="hash">
                  {session.context.observations.mandate?.agent}
                </code>
                <br />
                Token:{" "}
                <code className="hash">
                  {session.context.observations.mandate?.token}
                </code>
                <br />
                Fixture expiry:{" "}
                {new Date(
                  Number(session.context.observations.mandate?.expiry) * 1000,
                ).toLocaleString()}
              </p>
            )}
            <div
              className={
                "console-verdict " +
                (validated ? "success" : failed ? "danger" : "warning")
              }
              role="status"
            >
              <span className="console-kicker">
                INDEPENDENT BACKEND VERDICT
              </span>
              <strong data-testid="gemini-verdict">
                {validated
                  ? "PROPOSAL VALIDATED"
                  : failed
                    ? session.status === "failed"
                      ? "PROPOSAL BLOCKED"
                      : "SESSION " + session.status.toUpperCase()
                    : "AWAITING PROPOSAL"}
              </strong>
              <p>Read-only AI session — no transaction submitted.</p>
              {session?.error && (
                <code>
                  {geminiError(session.error)} · {session.error}
                </code>
              )}
            </div>
            {running && (
              <p className="gemini-wait" role="status">
                <Icon name="clock" />{" "}
                {error
                  ? "Connection interrupted; last reported state: running · "
                  : "Gemini is responding · "}
                {Math.max(0, Math.floor((tick - session.createdAt) / 1000))}s
                elapsed. Tool events appear when confirmed by the backend.
              </p>
            )}
          </div>
        </div>
      }
      lifecycle={
        <ol className="gemini-progress" aria-label="Live inference progress">
          {geminiStages.map((name, i) => (
            <li key={name} className={session && i <= stage ? "reached" : ""}>
              {name}
            </li>
          ))}
        </ol>
      }
    />
  );
}
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
              Ask the agent to find, compare and prepare purchases inside
              synthetic policy.
            </p>
          </div>
          <Badge>{PUBLIC_DEMO_ONLY ? "Public demo" : "Sandbox"}</Badge>
        </header>
        <section
          className="norway-budget"
          aria-label="Recorded Sandbox accounting"
        >
          <div className="norway-card-heading">
            <h3>RECORDED SANDBOX MANDATE</h3>
            <Badge tone="success">Completed</Badge>
          </div>
          <div className="norway-budget-main">
            <strong>
              $4.00 <span>available</span>
            </strong>
            <dl className="norway-budget-values">
              <div>
                <dt>Authorized</dt>
                <dd>$10.00</dd>
              </div>
              <div>
                <dt>Reserved</dt>
                <dd>$0.00</dd>
              </div>
              <div>
                <dt>Consumed</dt>
                <dd>$6.00</dd>
              </div>
            </dl>
          </div>
          <div
            className="norway-budget-meter"
            role="img"
            aria-label="$6 consumed of $10 authorized"
          >
            <span />
          </div>
          <div className="norway-card-heading">
            <small>$10.00 authorized</small>
            <small>$6.00 consumed · $0 reserved</small>
          </div>
          <p className="micro" style={{ marginTop: "14px" }}>
            Historical Task 05J · not current authority. No replay. Evaluation
            uses a separate fixture.
          </p>
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
            Live Gemini chat
          </Button>
        </div>
        {chatMode ? (
          <PurchasingChat onEvaluation={setChatResult} />
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
                ? chatResult?.source === "MOCKED_TRANSPORT_TEST"
                  ? "Mocked transport test"
                  : "Real Gemini evaluation"
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
            Only permitted synthetic catalog and policy data may leave the
            server.
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
}: {
  controls?: ReactNode;
  initialScenarioId?: PayPalAgentScenarioId;
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

  if (execMode === "gemini")
    return (
      <ExecutionConsole
        mandate={undefined}
        run={undefined}
        payment={undefined}
        source="Owner-authenticated Gemini checkout preparation · Synthetic catalog · No payment execution"
        controls={
          <>
            {controls}
            <Button
              variant="soft"
              onClick={() => setExecMode("deterministic-policy")}
            >
              Deterministic Policy Simulation
            </Button>
          </>
        }
        content={<AgentCheckoutPreparation />}
      />
    );

  return (
    <ExecutionConsole
      mandate={undefined}
      run={undefined}
      payment={undefined}
      source={
        result
          ? `${result.actualExecutionLabel} · Synthetic Merchant Catalog · No PayPal Order Created`
          : "PayPal Purchasing Agent · Policy Authorization Boundary"
      }
      controls={
        <>
          {controls}
          <div className="gemini-controls">
            <fieldset aria-label="PayPal agent execution adapter">
              <Button
                variant={
                  execMode === "deterministic-policy" ? "primary" : "soft"
                }
                aria-pressed={execMode === "deterministic-policy"}
                disabled={loading}
                onClick={() => setExecMode("deterministic-policy")}
              >
                Deterministic Policy Simulation
              </Button>
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
            </fieldset>
            {PUBLIC_DEMO_ONLY && (
              <p className="micro">
                Public demo mode: live Gemini calls &amp; PayPal payment
                execution are disabled · recorded $6.00 USD Sandbox receipt
                verified.
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
              <summary>
                Additional policy boundary probes (P3 / P5 / P6)
              </summary>
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
      }
      content={
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
                    {result?.actualExecutionLabel ===
                    "REAL_GEMINI_API_INFERENCE"
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
                    VERIFIED COMPLETED $6.00 USD PAYPAL SANDBOX TRANSACTION
                    (TASK 05J — READ-ONLY, NO REPLAY)
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
                    <code>
                      Capture {VERIFIED_PAYPAL_AGENT_RECEIPT.captureId}
                    </code>
                  </div>
                  <p className="micro">
                    <strong>Accounting ($10 Mandate):</strong> $10.00 (
                    {VERIFIED_PAYPAL_AGENT_RECEIPT.authorizedMinor}) Authorized
                    ·{" "}
                    <strong>
                      $6.00 ({VERIFIED_PAYPAL_AGENT_RECEIPT.consumedMinor})
                      Consumed
                    </strong>{" "}
                    · $0.00 ({VERIFIED_PAYPAL_AGENT_RECEIPT.reservedMinor})
                    Reserved · $4.00 (
                    {VERIFIED_PAYPAL_AGENT_RECEIPT.availableMinor}) Available.
                    <br />
                    Campaign{" "}
                    <code>
                      {VERIFIED_PAYPAL_AGENT_RECEIPT.campaignVersion}
                    </code>{" "}
                    (<code>{VERIFIED_PAYPAL_AGENT_RECEIPT.campaignId}</code>) ·
                    Mandate{" "}
                    <code>{VERIFIED_PAYPAL_AGENT_RECEIPT.mandateId}</code> ·
                    Live Gemini Intent{" "}
                    <code>{VERIFIED_PAYPAL_AGENT_RECEIPT.intentId}</code> ·
                    Attempt{" "}
                    <code>{VERIFIED_PAYPAL_AGENT_RECEIPT.attemptId}</code> ·
                    Completed{" "}
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
                  <code>
                    {result?.objective.requiredDataset ?? "weather-v1"}
                  </code>{" "}
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
                    Untrusted adversarial merchant descriptions (override
                    attempts rejected by tool &amp; policy boundaries)
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
                    IMPLEMENTED FULFILLMENT SAFEGUARDS VS. PAYPAL ORDERS V2
                    SCOPE
                  </span>
                  <p className="micro">
                    <strong>Implemented in PayPal path:</strong> Pre-proposal{" "}
                    <code>keccak256</code> offer commitment digest verification
                    (<code>INVALID_DELIVERY_COMMITMENT</code>), SLA suitability
                    checks, SHA-256 immutable intent-to-checkout term binding (
                    <code>AGENT_CHECKOUT_IMMUTABLE_TERMS_MISMATCH</code>), human
                    owner + buyer approval gates, and canonical post-capture
                    seller/amount/order binding (
                    <code>PAYPAL_CAPTURE_BINDING_MISMATCH</code>).
                    <br />
                    <strong>
                      Honest boundary (not simulated as real):
                    </strong>{" "}
                    Unlike legacy EVM <code>TaskVault.sol</code> escrow (shown
                    in <code>Demo Mode → C — Invalid Delivery</code>), PayPal
                    Orders v2 immediate <code>CAPTURE</code> does not implement
                    post-capture merchant payload delivery inspection,
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
                  Provider & Decision Trace · {result?.trace.length ?? 0}{" "}
                  step(s)
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
                {(result?.authorizationDecision.checks ?? []).map(
                  (check, i) => (
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
                  ),
                )}
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
                  <code>
                    {result.historicalImmutableRecords.agentCaptureId}
                  </code>{" "}
                  ({result.historicalImmutableRecords.agentCaptureStatus},
                  $10.00 authorized, $6.00 consumed, $0.00 reserved, $4.00
                  available).
                  <br />
                  <strong>
                    Immutable Task 03G US Record (Untouched):
                  </strong>{" "}
                  Order{" "}
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
                  {result?.executionBoundary.paypalCapturesExecuted ?? 0} ·
                  Buyer Approval Required: true
                </code>
              </div>
            </div>
          </div>
        </>
      }
      lifecycle={
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
      }
    />
  );
}

export function ExecutionWorkspace({
  live,
}: {
  live?: {
    mandate: MandateView | undefined;
    run: RunView | undefined;
    payment: PaymentRecord | undefined;
  };
}) {
  const w = useWorkspace();
  const { preference } = useTheme();
  const [selectedMode, setMode] = useState<
    "demo" | "gemini" | "paypal-agent" | null
  >(null);
  const mode =
    selectedMode ?? (preference === "norway" ? "paypal-agent" : "demo");
  const allowed = Boolean(
    w.wallet &&
    w.snapshot.config &&
    w.wallet.account.toLowerCase() === w.snapshot.owner?.toLowerCase() &&
    w.wallet.chainId === w.snapshot.config.chainId,
  );
  const modeKey = `earmark-execution-mode:${w.snapshot.config?.vault ?? ""}:${w.wallet?.account ?? ""}`;
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(modeKey);
      if (saved === "paypal-agent") {
        setMode("paypal-agent");
        return;
      }
      if (saved === "gemini" && allowed) {
        setMode("gemini");
        return;
      }
    } catch {
      /* Demo remains the safe initial view. */
    }
    if (!allowed && mode === "gemini") setMode("demo");
  }, [allowed, modeKey, mode]);
  const chooseMode = (value: "demo" | "gemini" | "paypal-agent") => {
    setMode(value);
    try {
      sessionStorage.setItem(modeKey, value);
    } catch {
      /* Mode switching remains functional. */
    }
  };
  const controls = (
    <fieldset className="execution-modes" aria-label="Execution mode">
      <Button
        variant={mode === "demo" ? "primary" : "soft"}
        aria-pressed={mode === "demo"}
        onClick={() => chooseMode("demo")}
      >
        Demo Mode
      </Button>
      <Button
        variant={mode === "paypal-agent" ? "primary" : "soft"}
        aria-pressed={mode === "paypal-agent"}
        onClick={() => chooseMode("paypal-agent")}
      >
        PayPal Agent · Policy
      </Button>
      <Button
        variant={mode === "gemini" ? "primary" : "soft"}
        aria-pressed={mode === "gemini"}
        disabled={!allowed}
        onClick={() => chooseMode("gemini")}
      >
        Live Gemini
      </Button>
      <span className="micro">
        {mode === "paypal-agent"
          ? "PayPal policy evaluation · no orders created · Task 03G immutable"
          : !allowed
            ? "Live Gemini requires the current owner wallet."
            : !w.snapshot.geminiAvailable
              ? "Live Gemini is currently unavailable."
              : "Owner-only · genuine inference · read-only"}
      </span>
    </fieldset>
  );
  return mode === "gemini" ? (
    <LiveGemini controls={controls} />
  ) : mode === "paypal-agent" ? (
    <PayPalAgentConsole controls={controls} />
  ) : (
    <RecordedDemo {...(live ? { live } : {})} modeControls={controls} />
  );
}
