"use client";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { formatUnits } from "viem";
import { TransactionReference } from "./transaction-reference";
import { PaymentLifecycle } from "./payment-lifecycle";
import { Badge, Button, Icon, Modal } from "./glass";
import { useWorkspace } from "./workspace-provider";
import {
  short,
  modelLabel,
  GEMINI_UNAVAILABLE_NOTE,
  type MandateView,
  type RunView,
  type PaymentRecord,
  type WorkspaceSnapshot,
} from "../lib/model";
import { contractVerdict } from "../lib/console-view";
const units = (value: string | undefined, decimals: number) =>
  value === undefined ? "—" : formatUnits(BigInt(value), decimals);
export function ExecutionConsole({
  mandate,
  run,
  payment,
  snapshot,
  controls,
  source,
  content,
  lifecycle,
}: {
  mandate: MandateView | undefined;
  run: RunView | undefined;
  payment: PaymentRecord | undefined;
  snapshot?: WorkspaceSnapshot;
  controls?: ReactNode;
  source?: string;
  content?: ReactNode;
  lifecycle?: ReactNode;
}) {
  const [threat, setThreat] = useState(false);
  const w = useWorkspace(),
    s = snapshot ?? w.snapshot,
    decimals = s.balance?.decimals ?? 6;
  const events = s.events.filter((e) => e.runId === run?.id);
  const selected = events.findLast((e) => e.type === "provider.selected")?.data
    .providerId;
  const decision = events.findLast(
    (e) => e.type === "model.decision" || e.type === "provider.selected",
  );
  const tool = events.findLast((e) =>
    [
      "transaction.confirmed",
      "transaction.reverted",
      "transaction.uncertain",
      "delivery.received",
      "delivery.rejected",
      "payment.funded",
      "task.failed",
    ].includes(e.type),
  );
  const provider = s.config?.providers.find(
    (p) => p.address.toLowerCase() === payment?.provider.toLowerCase(),
  );
  const verdict = contractVerdict(payment, run, s.chainTime);
  const cap = BigInt(mandate?.cap ?? "0");
  const percentage = (v: string | undefined) =>
    cap > 0n ? Number((BigInt(v ?? "0") * 10000n) / cap) / 100 : 0;
  return (
    <section className="execution-console" aria-label="Execution Console">
      <div className="console-heading">
        <div>
          <span className="console-kicker">PURPOSE-BOUND AUTHORITY / 01</span>
          <h2>Execution Console</h2>
          <p>The agent proposes. The mandate constrains. Delivery settles.</p>
        </div>
        <Badge>
          {source ??
            "Live · " +
              (s.config?.network ?? "Network unavailable") +
              " · " +
              modelLabel(run?.mode ?? s.model)}
        </Badge>
      </div>
      {source === undefined && s.geminiAvailable === false ? (
        <p className="micro">{GEMINI_UNAVAILABLE_NOTE}</p>
      ) : null}
      {controls}
      {content ?? (
        <div className="console-body">
          <div className="console-pane">
            <span className="console-kicker">
              01 / AI AGENT — WHAT THE AI PROPOSES
            </span>
            <div className="console-identity">
              <span className="console-agent-icon">
                <Icon name="spark" />
              </span>
              <div>
                <h3>Research Agent</h3>
                <p>
                  {run
                    ? run.status.replaceAll("-", " ")
                    : "Awaiting an authorized task"}
                </p>
              </div>
            </div>
            <div className="console-inset">
              <span className="console-kicker">ACTIVE TASK</span>
              <h4>
                {mandate?.description ??
                  "Select a earmark to inspect its task."}
              </h4>
              <span className="console-mono">
                {mandate ? short(mandate.id) : "No earmark selected"}
              </span>
            </div>
            <div className="console-section-title">
              <span>PROVIDER QUOTES</span>
              <small>Simulated services · recorded offers</small>
            </div>
            <div className="console-quote-list">
              {run?.quotes.length ? (
                run.quotes.map((q) => (
                  <div
                    className={q.providerId === selected ? "selected" : ""}
                    key={q.quoteId}
                  >
                    <div>
                      <strong>
                        {s.config?.providers.find((p) => p.id === q.providerId)
                          ?.name ?? q.providerId}
                      </strong>
                      <small>
                        {q.providerId === selected
                          ? "Agent selected"
                          : "Alternative quote"}
                      </small>
                    </div>
                    <span className="console-mono">
                      {units(q.price, decimals)} mock USDC
                    </span>
                  </div>
                ))
              ) : (
                <p className="muted">No recorded quotes yet.</p>
              )}
            </div>
            <div className="console-section-title">
              <span>RECORDED DECISION</span>
              <small>No hidden reasoning</small>
            </div>
            <p className="console-decision">
              {decision?.data.summary
                ? String(decision.data.summary)
                : "A decision summary appears when the model records an action."}
            </p>
            <div className="console-request">
              <span className="console-kicker">
                {payment ? "CONFIRMED PAYMENT REQUEST" : "PAYMENT REQUEST"}
              </span>
              <strong>
                {payment
                  ? units(payment.amount, decimals) +
                    " mock USDC → " +
                    (provider?.name ?? short(payment.provider))
                  : "No confirmed escrow request"}
              </strong>
              {payment && (
                <Link
                  className="console-mono"
                  href={run ? "/executions/" + run.id : "/payments"}
                >
                  {short(payment.transactionHash)} <Icon name="external" />
                </Link>
              )}
            </div>
            {tool && (
              <p className="console-tool">
                <strong>Last tool result</strong> {tool.type} ·{" "}
                {Object.entries(tool.data)
                  .map(([k, v]) => k + ": " + String(v))
                  .join(" · ")}
              </p>
            )}
          </div>
          <div className="console-boundary">
            <Icon name="lock" />
            <span>TRUST BOUNDARY</span>
            <Icon name="arrow" />
          </div>
          <div className="console-pane">
            <span className="console-kicker">
              02 / SMART CONTRACT — WHAT THE EARMARK PERMITS
            </span>
            <div className="console-identity">
              <span className="console-agent-icon">
                <Icon name="shield" />
              </span>
              <div>
                <h3>Earmark Vault</h3>
                <p>
                  {mandate
                    ? "Earmark " + short(mandate.id)
                    : "Task-scoped spending authority"}
                </p>
              </div>
              {mandate && (
                <Badge
                  tone={
                    mandate.active && mandate.expiry > s.chainTime
                      ? "blue"
                      : "neutral"
                  }
                >
                  {mandate.active
                    ? mandate.expiry > s.chainTime
                      ? "Active"
                      : "Expired"
                    : "Revoked"}
                </Badge>
              )}
            </div>
            <div className="console-inset console-budget">
              <span className="console-kicker">CUMULATIVE TASK BUDGET</span>
              <div>
                <strong className="console-mono">
                  {units(mandate?.reserved, decimals)}
                </strong>
                <span>
                  {" "}
                  reserved / {units(mandate?.cap, decimals)} mock USDC cap
                </span>
              </div>
              <div
                className="console-budget-meter"
                role="img"
                aria-label={
                  mandate
                    ? "Task budget: " +
                      units(mandate.settled, decimals) +
                      " settled, " +
                      units(mandate.reserved, decimals) +
                      " reserved, " +
                      units(mandate.remaining, decimals) +
                      " remaining"
                    : "Task budget unavailable"
                }
              >
                <i style={{ width: percentage(mandate?.settled) + "%" }} />
                <i style={{ width: percentage(mandate?.reserved) + "%" }} />
              </div>
              <div className="console-budget-legend">
                <span>Settled {units(mandate?.settled, decimals)}</span>
                <span>Reserved {units(mandate?.reserved, decimals)}</span>
                <span>Remaining {units(mandate?.remaining, decimals)}</span>
              </div>
            </div>
            <div className="console-section-title">
              <span>AUTHORIZATION CHECKS</span>
              <small>
                {payment ? "Confirmed at funding" : "Awaiting funded receipt"}
              </small>
            </div>
            <ul className="console-checks sequential-checks">
              {[
                "Authorized agent",
                "Approved provider",
                "Cumulative task cap",
                "Earmark active & unexpired",
                "Approved token & vault liquidity",
              ].map((label, index) => (
                <li
                  key={label}
                  className={payment ? "revealed" : "pending"}
                  style={{ animationDelay: `${index * 180}ms` }}
                >
                  <span className={payment ? "passed" : ""}>
                    <Icon name={payment ? "check" : "shield"} />
                  </span>
                  <strong>{label}</strong>
                  <small>
                    {payment ? "PASSED AT FUNDING" : "NOT YET FUNDED"}
                  </small>
                </li>
              ))}
            </ul>
            <p className="console-terms">
              {mandate ? (
                <>
                  Approved providers:{" "}
                  {mandate.providers
                    .map(
                      (a) =>
                        s.config?.providers.find(
                          (p) => p.address.toLowerCase() === a.toLowerCase(),
                        )?.name ?? short(a),
                    )
                    .join(", ")}
                  . Challenge: {mandate.challengeWindow / 3600}h.{" "}
                  {mandate.active
                    ? "Expiry: " +
                      new Date(mandate.expiry * 1000).toLocaleString()
                    : "Revoked: new payments blocked; existing escrow can resolve."}
                </>
              ) : (
                "Immutable permissions load from the contract."
              )}
            </p>
            <div className={"console-verdict " + verdict.tone} role="status">
              <span className="console-kicker">
                <span className="console-verdict-dot" />
                CONTRACT VERDICT
              </span>
              <strong data-testid="contract-verdict">{verdict.title}</strong>
              <p>{verdict.detail}</p>
            </div>
          </div>
        </div>
      )}
      {lifecycle ?? (
        <PaymentLifecycle
          run={run}
          payment={payment}
          events={events}
          chainTime={s.chainTime}
          recorded={!!snapshot && source?.startsWith("Demo") === true}
        />
      )}
      {!content && payment && (
        <details className="console-evidence">
          <summary>Delivery receipt & settlement evidence</summary>
          <p className="micro hash">
            Delivered commitment:{" "}
            {payment.deliveredHash === "0x" + "0".repeat(64)
              ? "Not yet submitted"
              : payment.deliveredHash}
          </p>
          <p className="micro">
            Inspection:{" "}
            {run?.inspected
              ? "Recorded artifact checks passed"
              : "No successful inspection recorded"}
          </p>
          <TransactionReference
            hash={payment.resolutionHash ?? payment.transactionHash}
          />
          {s.config?.chainId === 10143 ? (
            <a
              className="text-action"
              href={
                "https://testnet.monadscan.com/tx/" +
                (payment.resolutionHash ?? payment.transactionHash)
              }
              target="_blank"
              rel="noreferrer"
            >
              View confirmed {payment.resolutionHash ? "resolution" : "funding"}{" "}
              transaction
            </a>
          ) : (
            <code className="hash">
              {payment.resolutionHash ?? payment.transactionHash}
            </code>
          )}
        </details>
      )}
      <div className="console-footnote">
        <span>
          <Icon name="shield" /> An agent proposal is not payment approval.
        </span>
        <Button variant="ghost" onClick={() => setThreat(true)}>
          Threat Model
        </Button>
      </div>
      {threat && (
        <Modal title="Threat Model" onClose={() => setThreat(false)}>
          <p>
            Task hashes and delivery commitments bind identifiers and bytes;
            they do not prove semantic quality.
          </p>
          <p>
            An approved provider may still deliver unsuitable work.
            Deterministic inspection checks the configured artifact, not every
            possible quality issue.
          </p>
          <p>
            The owner is the trusted dispute authority. If an agent accepts bad
            work and the owner misses the challenge deadline, the payment can
            settle.
          </p>
          <p>
            Earmark constrains financial authority, not every possible model
            error. Recorded replay cannot sign, authorize or send a payment.
          </p>
        </Modal>
      )}
    </section>
  );
}
