"use client";
import { useEffect, useState, type ReactNode } from "react";
import { formatUnits } from "viem";
import type { Hex } from "viem";
import { useWorkspace } from "./workspace-provider";
import { RecordedDemo } from "./recorded-demo";
import { ExecutionConsole } from "./execution-console";
import { AgentCheckoutPreparation } from "./agent-checkout";
import { useTheme } from "./theme-provider";
import { PayPalAgentConsole as PayPalPolicyConsole } from "./paypal-agent-console";
import { Button, Icon } from "./glass";
import {
  geminiError,
  geminiStage,
  geminiStages,
  type GeminiChallenge,
  type GeminiSessionView,
} from "../lib/gemini";
import type { MandateView, RunView, PaymentRecord } from "../lib/model";
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
export function PayPalAgentConsole({ controls }: { controls?: ReactNode }) {
  return (
    <PayPalPolicyConsole
      controls={controls}
      renderPreparation={(preparationControls) => (
        <ExecutionConsole
          mandate={undefined}
          run={undefined}
          payment={undefined}
          source="Owner-authenticated Gemini checkout preparation · Synthetic catalog · No payment execution"
          controls={preparationControls}
          content={<AgentCheckoutPreparation />}
        />
      )}
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
