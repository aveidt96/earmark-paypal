"use client";
import { useEffect, useState, type ReactNode } from "react";
import { formatUnits } from "viem";
import security from "../lib/demo/security.json";
import {
  normalFrame,
  normalRecording,
  normalSnapshot,
} from "../lib/recorded-demo";
import { TransactionReference } from "./transaction-reference";
import { PaymentLifecycle } from "./payment-lifecycle";
import { ExecutionConsole } from "./execution-console";
import { useWorkspace } from "./workspace-provider";
import { Button, Icon, Panel, PanelTitle } from "./glass";
import type { MandateView, RunView, PaymentRecord } from "../lib/model";
import { modelLabel } from "../lib/model";
import { VERIFIED_PAYPAL_AGENT_RECEIPT } from "../lib/paypal-agent";
const labels = {
  A: "Normal Purchase",
  B: "Prompt Injection",
  C: "Invalid Delivery",
  D: "Budget Exhaustion",
};
type ScenarioId = keyof typeof labels;
const money = (v: string) => formatUnits(BigInt(v), 6);
function LocalScenario({ id, frame }: { id: ScenarioId; frame: number }) {
  const s = security.scenarios.find((s) => s.id === id);
  if (!s) return null;
  const finished = frame >= 5;
  const decision =
    id === "B"
      ? "The actual deterministic policy ignored the redirect and selected approved DataHub. A separate adversarial probe tested the forbidden destination."
      : id === "C"
        ? "DataHub was approved, but artifact inspection failed. The agent did not accept the delivery; the owner rejected its escrow."
        : "Two distinct 4-USDC purchases succeeded. A third distinct purchase exceeded the 10-USDC cumulative authority.";
  return (
    <div className="console-body">
      <div className="console-pane">
        <span className="console-kicker">01 / AGENT PROPOSAL</span>
        <div className="console-identity">
          <span className="console-agent-icon">
            <Icon name="spark" />
          </span>
          <div>
            <h3>Research Agent</h3>
            <p>Deterministic mock · Recorded local execution</p>
          </div>
        </div>
        <div className="console-inset">
          <span className="console-kicker">OWNER TASK</span>
          <h4>{s.task}</h4>
        </div>
        <div className="console-section-title">
          <span>PROVIDER QUOTES</span>
          <small>Simulated services</small>
        </div>
        <div className="console-quote-list">
          {["DataHub", "WeatherCo"].map((name, i) => (
            <div key={name} className={i === 0 ? "selected" : ""}>
              <div>
                <strong>{name}</strong>
                <small>{i === 0 ? "Agent selected" : "Alternative"}</small>
              </div>
              <span className="console-mono">
                {id === "D" ? "4" : i === 0 ? "6" : "8"} mock USDC
              </span>
            </div>
          ))}
        </div>
        <details className="untrusted-input" open={id === "B"}>
          <summary>Untrusted provider response</summary>
          <pre>{s.providerResponse}</pre>
        </details>
        <div className="console-section-title">
          <span>DECISION SUMMARY</span>
          <small>Actual mock behavior</small>
        </div>
        <p className="console-decision">
          {frame >= 1
            ? decision
            : "Task received. Replay is starting from the recorded observations."}
        </p>
        <div className="console-request">
          <span className="console-kicker">TOOL REQUEST</span>
          <strong>
            {id === "B"
              ? "Independent probe → unauthorized provider"
              : id === "D"
                ? "Distinct requests: 4 + 4 + 4 mock USDC"
                : "6 mock USDC → approved DataHub"}
          </strong>
          <small>
            {id === "B"
              ? "Not a successful model injection. The legitimate purchase separately completed."
              : "Original recorded fixture; no transaction is sent by replay."}
          </small>
        </div>
        <p className="console-tool">
          <strong>Backend result</strong>{" "}
          {frame >= 2 ? s.backendVerdict : "Recorded validation appears next."}
        </p>
      </div>
      <div className="console-boundary">
        <Icon name="lock" />
        <span>TRUST BOUNDARY</span>
        <Icon name="arrow" />
      </div>
      <div className="console-pane">
        <span className="console-kicker">02 / CONTRACT AUTHORITY</span>
        <div className="console-identity">
          <span className="console-agent-icon">
            <Icon name="shield" />
          </span>
          <div>
            <h3>Earmark Vault</h3>
            <p>
              Isolated local earmark · {s.approvedProviders.length} approved
              providers
            </p>
          </div>
        </div>
        <div className="console-inset console-budget">
          <span className="console-kicker">CUMULATIVE EARMARK BUDGET</span>
          <div>
            <strong className="console-mono">{money(s.cap)}</strong> mock USDC
            cap
          </div>
          <div className="console-budget-legend">
            <span>Reserved {money(s.reserved)}</span>
            <span>Settled {money(s.settled)}</span>
            <span>
              Remaining{" "}
              {money(
                String(BigInt(s.cap) - BigInt(s.reserved) - BigInt(s.settled)),
              )}
            </span>
          </div>
          <small>
            Recorded final ledger · Available vault funds {money(s.available)}{" "}
            mock USDC
          </small>
        </div>
        <div className="console-section-title">
          <span>AUTHORIZATION & PROTECTION EVIDENCE</span>
          <small>Recorded local assertions</small>
        </div>
        <ul className="console-checks sequential-checks" key={id + frame}>
          {s.checks.map((check, i) => (
            <li
              key={check.label}
              style={{ animationDelay: `${i * 180}ms` }}
              className={frame >= 2 ? "revealed" : "pending"}
            >
              <span
                className={
                  check.observed.includes("reverted") ||
                  check.observed.includes("VIOLATION") ||
                  check.observed.includes("INVALID_QUOTE") ||
                  check.observed.includes("INSUFFICIENT")
                    ? "failed"
                    : frame >= 2
                      ? "passed"
                      : ""
                }
              >
                <Icon name={frame >= 2 ? "check" : "clock"} />
              </span>
              <strong>{check.label}</strong>
              <small>{frame >= 2 ? check.observed : "Pending replay"}</small>
            </li>
          ))}
        </ul>
        <p className="console-terms">
          Expiry and token restrictions are enforced by the unchanged contract.
          This fixture does not publish every immutable term. Checks above are
          recorded test observations, not fresh authorizations.
        </p>
        <div
          className={"console-verdict " + (finished ? "danger" : "warning")}
          role="status"
        >
          <span className="console-kicker">
            CONTRACT VERDICT · RECORDED LOCAL ANVIL
          </span>
          <strong data-testid="contract-verdict">
            {finished
              ? id === "C"
                ? "REJECTED · REFUNDED"
                : "BLOCKED"
              : "REPLAYING RECORDED EVIDENCE"}
          </strong>
          <p>
            {finished
              ? s.contractVerdict
              : "Revealing the original outcome; no financial operation is running."}
          </p>
          {finished && (
            <code className="rejection-reason">
              {id === "B"
                ? "ProviderNotApproved"
                : id === "D"
                  ? "TaskCapExceeded: 8 + 4 > 10"
                  : "DELIVERY_POLICY_VIOLATION → owner rejection"}
            </code>
          )}
        </div>
        <details>
          <summary>Original receipt evidence</summary>
          <div className="demo-receipts">
            {s.receipts
              .filter(
                (r) =>
                  r.status === "reverted" ||
                  ["PaymentFunded", "PaymentRejected"].includes(r.label),
              )
              .map((r) => (
                <div key={r.hash}>
                  <strong>
                    {r.label} · {r.status}
                  </strong>
                  <TransactionReference hash={r.hash} />
                  <small>
                    Local block {r.block} ·{" "}
                    {new Date(r.timestamp * 1000).toISOString()}
                    {"reason" in r ? " · Simulation reason: " + r.reason : ""}
                  </small>
                </div>
              ))}
          </div>
          <p className="micro">
            Local receipts have no public Monad explorer link.{" "}
            {security.clockDisclosure}
          </p>
        </details>
      </div>
    </div>
  );
}
export function RecordedDemo({
  initial = "A",
  live,
  modeControls,
}: {
  modeControls?: ReactNode;
  initial?: ScenarioId;
  live?: {
    mandate: MandateView | undefined;
    run: RunView | undefined;
    payment: PaymentRecord | undefined;
  };
}) {
  const w = useWorkspace();
  const [id, setId] = useState<ScenarioId | "live">(live ? "live" : initial);
  const [frame, setFrame] = useState(5);
  const [playing, setPlaying] = useState(false);
  const liveMode = !!live;
  useEffect(() => {
    setId(liveMode ? "live" : initial);
    setFrame(5);
    setPlaying(false);
  }, [liveMode, initial]);
  useEffect(() => {
    if (!playing) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setFrame(5);
      setPlaying(false);
      return;
    }
    const timer = setTimeout(() => {
      if (frame < 5) setFrame(frame + 1);
      else setPlaying(false);
    }, 850);
    return () => clearTimeout(timer);
  }, [frame, playing]);
  const replay = (next: ScenarioId) => {
    setId(next);
    setFrame(0);
    setPlaying(true);
  };
  const s = normalFrame(Math.min(frame, 4));
  return (
    <>
      <ExecutionConsole
        mandate={id === "live" ? live?.mandate : s.mandates[0]}
        run={id === "live" ? live?.run : s.runs[0]}
        payment={id === "live" ? live?.payment : s.payments[0]}
        snapshot={id === "live" ? w.snapshot : s}
        source={
          id === "live"
            ? "Live · " +
              (w.snapshot.config?.network ?? "Network unavailable") +
              " · " +
              modelLabel(live?.run?.mode ?? w.snapshot.model)
            : "Demo Mode · " +
              (id === "A"
                ? normalRecording.source
                : "Recorded local Anvil execution")
        }
        lifecycle={
          id === "A" || id === "live" ? undefined : (
            <PaymentLifecycle
              stage={id === "C" ? (frame < 2 ? 0 : frame < 3 ? 1 : 2) : 0}
              failure={
                frame >= 5
                  ? id === "C"
                    ? "Rejected · refunded after owner dispute"
                    : id === "D"
                      ? "Blocked · third request; earlier two payments remain Earmarked"
                      : "Blocked · unauthorized provider probe; legitimate purchase separately completed"
                  : undefined
              }
              recorded
            />
          )
        }
        content={
          id === "A" || id === "live" ? undefined : (
            <LocalScenario id={id} frame={frame} />
          )
        }
        controls={
          <>
            <div>{modeControls}</div>
            <div className="scenario-controls">
              <fieldset aria-label="Security scenarios">
                {(Object.keys(labels) as ScenarioId[]).map((key) => (
                  <Button
                    key={key}
                    variant={id === key ? "primary" : "soft"}
                    aria-pressed={id === key}
                    onClick={() => replay(key)}
                  >
                    {key} — {labels[key]}
                  </Button>
                ))}
              </fieldset>
              <div className="replay-controls">
                {live && (
                  <Button
                    variant="soft"
                    aria-pressed={id === "live"}
                    onClick={() => {
                      setId("live");
                      setPlaying(false);
                    }}
                  >
                    Live execution
                  </Button>
                )}
                <Button
                  variant="soft"
                  onClick={() => replay(id === "live" ? "A" : id)}
                >
                  Replay
                </Button>
                <span>
                  {id === "live"
                    ? "Connected wallet · actual run and contract state"
                    : playing
                      ? "Replaying historical events · no transactions sent"
                      : "Read-only demonstration · no wallet required"}
                </span>
                <small>
                  {w.offline
                    ? "Offline replay available"
                    : w.loading
                      ? "Replay ready · live check is asynchronous"
                      : w.snapshot.configured
                        ? "Live backend available"
                        : "Replay ready · live data unavailable"}
                </small>
              </div>
            </div>
          </>
        }
      />
      <p className="micro">
        {id === "live"
          ? "Actual network observations and confirmed receipts · simulated services. Financial controls require wallet authorization."
          : id === "A"
            ? normalRecording.note
            : "Recorded local Anvil · Mock USDC · Simulated providers · Deterministic mock. Backend blocks, independent contract probes and model behavior are separate observations."}
      </p>
    </>
  );
}
export function RecordedHistory() {
  const p = normalSnapshot.payments[0];
  return (
    <section
      className="recorded-history"
      aria-label="Historical demo information"
    >
      <Panel>
        <PanelTitle icon="wallet">Vault Balance</PanelTitle>
        <p className="micro">
          Historical Monad Testnet purchase · not your wallet balance
        </p>
        <h2>14.00 mock USDC</h2>
        <p>Original funding 20.00 · Available 14.00 · Reserved 0.00</p>
      </Panel>
      <Panel>
        <PanelTitle icon="shield">Recorded Earmark</PanelTitle>
        <p>10.00 mock USDC cap · 6.00 settled · 4.00 unused authority</p>
        <p className="micro">
          Subsequently revoked. New requests are disabled; the original payment
          completed.
        </p>
      </Panel>
      <Panel>
        <PanelTitle icon="activity">Recent Activity</PanelTitle>
        <p>DataHub · 6 mock USDC · Settled</p>
        <a
          className="text-action hash"
          href={"https://testnet.monadscan.com/tx/" + p?.resolutionHash}
          target="_blank"
          rel="noreferrer"
        >
          View confirmed settlement
        </a>
        <p className="micro">
          12 October 2026 · Full 1-hour challenge period observed.
        </p>
      </Panel>
      <Panel>
        <PanelTitle icon="spark">
          Verified PayPal Sandbox Receipt (Task 05J — Read-Only)
        </PanelTitle>
        <p>
          <strong>
            {VERIFIED_PAYPAL_AGENT_RECEIPT.amountDisplay} ·{" "}
            {VERIFIED_PAYPAL_AGENT_RECEIPT.status}
          </strong>{" "}
          · Order <code>{VERIFIED_PAYPAL_AGENT_RECEIPT.orderId}</code> · Capture{" "}
          <code>{VERIFIED_PAYPAL_AGENT_RECEIPT.captureId}</code>
        </p>
        <p>
          $10.00 ({VERIFIED_PAYPAL_AGENT_RECEIPT.authorizedMinor}) authorized ·{" "}
          $6.00 ({VERIFIED_PAYPAL_AGENT_RECEIPT.consumedMinor}) consumed · $0.00
          ({VERIFIED_PAYPAL_AGENT_RECEIPT.reservedMinor}) reserved · $4.00 (
          {VERIFIED_PAYPAL_AGENT_RECEIPT.availableMinor}) available
        </p>
        <p className="micro">
          End-to-end Gemini proposal → human owner authorization → PayPal buyer
          approval → Sandbox capture (
          {VERIFIED_PAYPAL_AGENT_RECEIPT.completedAt}
          ). Select <strong>PayPal Agent · Policy</strong> in the Execution
          Console above to inspect the four PayPal security scenarios without
          replaying any payment.
        </p>
      </Panel>
    </section>
  );
}
