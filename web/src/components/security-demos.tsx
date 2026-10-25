"use client";
import Link from "next/link";
import { RecordedDemo, RecordedHistory } from "./recorded-demo";
import { useEffect, useState } from "react";
import { formatUnits } from "viem";
import {
  demoSuiteSchema,
  scenarioIds,
  scenarioLabels,
  type DemoSuite,
} from "@flint/agent/demos";
import { Brand, Badge, Panel, PanelTitle, Empty } from "./glass";
export function SecurityDemoLinks() {
  return (
    <Panel className="security-demo-links">
      <PanelTitle icon="shield">Security Demos</PanelTitle>
      <p className="muted">
        Four repeatable local scenarios. Inspect actual agent behavior and
        confirmed contract outcomes.
      </p>
      <div className="demo-tabs">
        {scenarioIds.map((id) => (
          <Link
            key={id}
            className="button soft"
            href={"/security?scenario=" + id}
          >
            {scenarioLabels[id]}
          </Link>
        ))}
      </div>
    </Panel>
  );
}
const amount = (value: string) => formatUnits(BigInt(value), 6) + " USDC";
export function SecurityDemos({
  selected,
  scene,
}: {
  selected: string;
  scene: string;
}) {
  const [id, setId] = useState(scenarioIds.find((v) => v === selected) ?? "A");
  const [suite, setSuite] = useState<DemoSuite>();
  const [error, setError] = useState("");
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    const poll = async () => {
      try {
        const r = await fetch("/api/security-demos", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!r.ok)
          throw new Error(
            "Start the local fixture runner to load verified demo evidence.",
          );
        const parsed = demoSuiteSchema.parse(await r.json());
        if (!stopped) {
          setSuite(parsed);
          setError("");
        }
      } catch (e) {
        if (!stopped)
          setError(
            e instanceof Error ? e.message : "Demo connection unavailable.",
          );
      } finally {
        if (!stopped) timer = setTimeout(() => void poll(), 1000);
      }
    };
    void poll();
    return () => {
      stopped = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, []);
  if (scene === "intro" || scene === "outro")
    return (
      <main id="main" className="demo-scene glass">
        <Brand priority imageSizes="128px" />
        <span className="eyebrow">
          MONAD METROPOLIS · LOCAL SECURITY DEMONSTRATION
        </span>
        <h1>
          {scene === "intro"
            ? "Give AI agents money with purpose."
            : "Every payment has a purpose."}
        </h1>
        <p>
          {scene === "intro"
            ? "Task-scoped financial authority. Approved providers. Delivery-conditional escrow. AI makes decisions. Earmark enforces boundaries."
            : "The agent chooses. The mandate constrains. Delivery settles."}
        </p>
        <div className="demo-principles">
          <span>Task-specific earmark</span>
          <span>Contract-enforced boundaries</span>
          <span>Delivery before settlement</span>
        </div>
        <p className="demo-disclosure">
          Local Anvil · mock USDC · simulated providers · deterministic mock
          model
          <br />
          Test-only Anvil time advancement. No public Monad Testnet
          transactions. No live Qwen claims.
        </p>
      </main>
    );
  if (!suite)
    return (
      <main id="main" className="demo-workspace">
        <RecordedDemo initial={id} />
        <RecordedHistory />
      </main>
    );
  const s = suite?.scenarios.find((v) => v.id === id);
  return (
    <main id="main" className="detail-shell demo-shell">
      <div className="page-heading">
        <div>
          <span className="eyebrow">EARMARK SECURITY LAB</span>
          <h1>Security Demos</h1>
        </div>
        <Link className="button soft" href="/">
          Back to Workspace
        </Link>
      </div>
      <p className="demo-disclosure">
        Local Anvil · mock USDC · simulated providers ·{" "}
        <strong>Deterministic Mock</strong>. Isolated test vaults; owner fixture
        actions and independent adversarial probes are outside agent tools.
      </p>
      <fieldset className="demo-tabs" aria-label="Security scenarios">
        {scenarioIds.map((v) => (
          <button
            type="button"
            key={v}
            aria-pressed={v === id}
            className={"button " + (v === id ? "primary" : "soft")}
            onClick={() => {
              setId(v);
              window.history.replaceState(null, "", "/security?scenario=" + v);
            }}
          >
            {scenarioLabels[v]}
          </button>
        ))}
      </fieldset>
      {error && (
        <p role="status" className="info-callout">
          {error} Run <code>npm run demo:serve</code> in PowerShell.{" "}
          {suite &&
            "Last verified snapshot retained; connection is interrupted."}
        </p>
      )}
      {!s ? (
        <Empty>
          No demonstration results yet. Outcomes appear only after real local
          fixtures run.
        </Empty>
      ) : (
        <>
          <section className="demo-result glass" aria-live="polite">
            <Badge
              tone={
                s.status === "complete"
                  ? "success"
                  : s.status === "failed"
                    ? "danger"
                    : "blue"
              }
            >
              {s.label} · {s.status}
            </Badge>
            <p>{s.summary}</p>
            <small>
              Confirmed local snapshot · run {suite?.runId} ·{" "}
              {suite && new Date(suite.updatedAt).toLocaleTimeString()}
            </small>
          </section>
          <div className="demo-columns">
            <Panel>
              <PanelTitle icon="spark">Agent Activity</PanelTitle>
              <h3>Owner task</h3>
              <p>{s.task}</p>
              <h3>Untrusted provider response</h3>
              <pre className="demo-provider">
                {s.providerResponse || "Awaiting provider observations."}
              </pre>
              <h3>Decision summary &amp; tool results</h3>
              <ol className="demo-events">
                {s.events
                  .filter((e) => e.source !== "contract")
                  .map((e) => (
                    <li key={e.id}>
                      <Badge>{e.source}</Badge>
                      <strong>{e.name}</strong>
                      <p>{e.text}</p>
                    </li>
                  ))}
              </ol>
              {id === "B" && (
                <p className="info-callout">
                  The mock policy ignores instruction text by design. This run
                  does not demonstrate the behavior of a live language model.
                </p>
              )}
              {id === "C" && (
                <p className="info-callout">
                  Commitments bind bytes, not semantic quality. An agent could
                  accept bad work; the owner must dispute within the permitted
                  window.
                </p>
              )}
            </Panel>
            <Panel>
              <PanelTitle icon="shield">Contract Authority</PanelTitle>
              <dl className="demo-ledger">
                <div>
                  <dt>Earmark status</dt>
                  <dd>{s.active ? "Active" : "Not loaded"}</dd>
                </div>
                <div>
                  <dt>Maximum task authority</dt>
                  <dd>{amount(s.cap)}</dd>
                </div>
                <div>
                  <dt>Cumulative reserved</dt>
                  <dd data-testid="demo-reserved">{amount(s.reserved)}</dd>
                </div>
                <div>
                  <dt>Historical settled</dt>
                  <dd>{amount(s.settled)}</dd>
                </div>
                <div>
                  <dt>Available vault funds</dt>
                  <dd data-testid="demo-available">{amount(s.available)}</dd>
                </div>
                <div>
                  <dt>Approved providers</dt>
                  <dd>{s.approvedProviders.length} exact addresses</dd>
                </div>
              </dl>
              <p className="micro hash">
                Isolated vault: {s.vault ?? "Awaiting fixture"}
                <br />
                Earmark: {s.mandateId ?? "Awaiting fixture"}
              </p>
              <h3>Backend validation</h3>
              <p>{s.backendVerdict}</p>
              <h3>Contract verdict</h3>
              <p data-testid="contract-verdict">{s.contractVerdict}</p>
              <div className="demo-payments">
                {s.payments.map((p) => (
                  <div key={p.id}>
                    <Badge
                      tone={
                        p.status === "COMPLETED"
                          ? "success"
                          : p.status === "REJECTED"
                            ? "danger"
                            : "warning"
                      }
                    >
                      {p.status}
                    </Badge>{" "}
                    {amount(p.amount)}
                    <small className="hash">Payment ID: {p.id}</small>
                  </div>
                ))}
              </div>
              <details open>
                <summary>Confirmed transactions · {s.receipts.length}</summary>
                <div className="demo-receipts">
                  {s.receipts.slice(-6).map((r) => (
                    <div key={r.hash}>
                      <strong>{r.label}</strong>
                      <Badge
                        tone={r.status === "success" ? "success" : "danger"}
                      >
                        {r.status}
                      </Badge>
                      <code>{r.hash}</code>
                      {r.reason && (
                        <small>Contract simulation reason: {r.reason}</small>
                      )}
                    </div>
                  ))}
                </div>
              </details>
              <details>
                <summary>
                  Verification checks ·{" "}
                  {s.checks.filter((c) => c.passed).length}/{s.checks.length}
                </summary>
                <ul>
                  {s.checks.map((c) => (
                    <li key={c.label}>
                      {c.passed ? "✓" : "✕"} {c.label}: {c.observed}
                    </li>
                  ))}
                </ul>
              </details>
            </Panel>
          </div>
          <p className="demo-disclosure">
            {suite?.clockDisclosure} D ends with 8 USDC in backed escrow in a
            disposable test-chain snapshot. Reverted probe receipts are
            independent of model/backend decisions.
          </p>
        </>
      )}
    </main>
  );
}
