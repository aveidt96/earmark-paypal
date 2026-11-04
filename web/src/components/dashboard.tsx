"use client";
import Link from "next/link";
import {
  paymentProgress as progressIndex,
  paymentStages as stages,
} from "../lib/payment-progress";
import { RecordedHistory } from "./recorded-demo";
import { ExecutionWorkspace } from "./gemini-console";
import { useTheme } from "./theme-provider";
import { useState, useEffect } from "react";
import { formatUnits } from "viem";
import { useWorkspace } from "./workspace-provider";
import {
  Badge,
  Button,
  Empty,
  Icon,
  Modal,
  Panel,
  PanelTitle,
  Robot,
  ContractArt,
  Tooltip,
} from "./glass";
import {
  short,
  challengeRemaining,
  modelLabel,
  type MandateView,
  type RunView,
  type PaymentRecord,
} from "../lib/model";
export function money(value: string | undefined, decimals = 6) {
  if (value === undefined) return "—";
  const [whole = "0", fraction = ""] = formatUnits(
    BigInt(value),
    decimals,
  ).split(".");
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${fraction.padEnd(2, "0")}`;
}
export function useOwner() {
  const w = useWorkspace();
  return (
    !!w.wallet &&
    !!w.snapshot.config &&
    !w.offline &&
    w.wallet.chainId === w.snapshot.config.chainId &&
    w.wallet.account.toLowerCase() === w.snapshot.owner?.toLowerCase()
  );
}
export function useSelectedMandate() {
  const { snapshot } = useWorkspace();
  const [id, setId] = useState<string>("");
  useEffect(() => {
    const saved = localStorage.getItem("flint-mandate");
    if (!id && snapshot.mandates.length)
      setId(
        snapshot.mandates.find((m) => m.id === saved)?.id ??
          snapshot.mandates.find((m) => m.active && m.registered)?.id ??
          snapshot.mandates[0]?.id ??
          "",
      );
  }, [snapshot.mandates, id]);
  const select = (value: string) => {
    setId(value);
    localStorage.setItem("flint-mandate", value);
  };
  return { mandate: snapshot.mandates.find((m) => m.id === id), select };
}
export function PaymentBadge({ status }: { status: string }) {
  return (
    <Badge
      tone={
        status === "COMPLETED"
          ? "success"
          : status === "REJECTED" || status === "EXPIRED"
            ? "danger"
            : status === "ACCEPTED"
              ? "warning"
              : "warning"
      }
    >
      {status[0]}
      {status.slice(1).toLowerCase()}
    </Badge>
  );
}
export function Hero({ secondary = false }: { secondary?: boolean }) {
  const Heading = secondary ? "h2" : "h1";
  const [help, setHelp] = useState<"flow" | "security" | null>(null);
  const features = [
    [
      "Task-Scoped Earmarks",
      "Give agents financial authority for specific jobs—not unrestricted access to your money.",
    ],
    [
      "Onchain Spending Controls",
      "Budgets, provider restrictions, and expiration rules are enforced by smart contracts.",
    ],
    [
      "Delivery-Conditional Escrow",
      "Authorized payments remain protected until the required delivery and settlement conditions are satisfied.",
    ],
    [
      "Autonomous Execution",
      "Agents can discover approved providers, compare offers, and initiate permitted payments without constant supervision.",
    ],
    [
      "Real-Time Transparency",
      "Follow agent decisions, authorization checks, escrow states, and confirmed transactions.",
    ],
    [
      "Owner Control",
      "Revoke earmarks, manage available funds, and challenge unsettled payments during the permitted window.",
    ],
  ];
  return (
    <>
      <section className="workspace-intro">
        <Heading>Every payment has a purpose.</Heading>
        <p>
          AI decisions. Task-scoped authority. Delivery-conditional settlement.
        </p>
        <div>
          <Button variant="soft" onClick={() => setHelp("flow")}>
            Explore How It Works
          </Button>
          <Link className="text-action" href="/mandates/new">
            Create an Earmark <Icon name="arrow" />
          </Link>
        </div>
      </section>
      {help === "flow" && (
        <Modal
          title="AI makes decisions. Earmark enforces boundaries."
          onClose={() => setHelp(null)}
        >
          <p>
            Agents choose how to accomplish tasks. You decide what they can
            spend, who they can pay, and when their authority expires.
          </p>
          <ol className="how-steps">
            {[
              [
                "Define the Task",
                "Describe what your AI agent needs to accomplish.",
              ],
              [
                "Set the Boundaries",
                "Specify its budget, approved providers, and authorization period.",
              ],
              [
                "Let the Agent Work",
                "Your agent evaluates providers and requests payments autonomously.",
              ],
              [
                "Protect the Payment",
                "Smart contracts validate spending permissions and hold authorized funds in escrow.",
              ],
              [
                "Settle on Delivery",
                "Delivery is inspected and accepted. Payment settles after the challenge period if no valid dispute is raised.",
              ],
            ].map(([title, description]) => (
              <li key={title}>
                <strong>{title}</strong>
                <p>{description}</p>
              </li>
            ))}
          </ol>
          <p className="info-callout">
            Creating a earmark grants authority; it does not lock funds. The
            owner is the trusted dispute authority. Commitment checks do not
            prove semantic quality.
          </p>
          <dl className="brand-features">
            {features.map(([title, description]) => (
              <div key={title}>
                <dt>{title}</dt>
                <dd>{description}</dd>
              </div>
            ))}
          </dl>
          <h3>What happens when an AI agent makes the wrong decision?</h3>
          <p>
            Earmark does not rely on the AI to enforce its own financial
            permissions. The smart contract independently checks every payment
            request against the owner&apos;s authorized earmark.
          </p>
          <Button variant="soft" onClick={() => setHelp("security")}>
            Explore Security Demos <Icon name="arrow" />
          </Button>
        </Modal>
      )}
      {help === "security" && (
        <Modal title="Security demonstrations" onClose={() => setHelp(null)}>
          <p>
            The existing local automated scenarios verify unauthorized payment
            rejection, signature replay rejection and escrow recovery after
            provider failure.
          </p>
          <p>
            Four repeatable local security scenarios are available. These are
            recorded test results, not a live attack demonstration or an audit
            certification.
          </p>
          <p className="info-callout">
            The agent chooses. The mandate constrains. Delivery settles.
          </p>
          <Link className="button primary" href="/security">
            Open Security Demos
          </Link>
          <Button variant="soft" onClick={() => setHelp("flow")}>
            Back to How It Works
          </Button>
        </Modal>
      )}
    </>
  );
}
export function Flow({
  mandate,
  run,
  payment,
}: {
  mandate: MandateView | undefined;
  run: RunView | undefined;
  payment: PaymentRecord | undefined;
}) {
  const { snapshot } = useWorkspace();
  const selected =
    snapshot.config?.providers.find(
      (p) => p.address.toLowerCase() === payment?.provider.toLowerCase(),
    )?.name ??
    run?.quotes.find((q) =>
      snapshot.events.some(
        (e) =>
          e.runId === run.id &&
          e.type === "provider.selected" &&
          e.data.quoteId === q.quoteId,
      ),
    )?.providerId;
  const blocked =
    run?.status === "failed" ||
    run?.status === "interrupted" ||
    payment?.status === "REJECTED";
  const stage =
    payment?.status === "EXPIRED"
      ? "refunded"
      : blocked
        ? "blocked"
        : payment?.status === "ACCEPTED"
          ? "challenge"
          : payment?.status === "COMPLETED"
            ? "settled"
            : payment
              ? "authorized"
              : run?.status === "running"
                ? "validating"
                : "idle";
  const confirmed = !!payment;
  return (
    <section
      className={`flow-scene ${stage}`}
      aria-label="Agent and smart contract trust boundary"
    >
      <div className="flow-halo" aria-hidden="true" />
      <div className="agent-floating glass">
        <Robot />
        <h2>Research Agent</h2>
        <Badge
          tone={
            run?.status === "running"
              ? "blue"
              : blocked
                ? "danger"
                : confirmed
                  ? "success"
                  : "neutral"
          }
        >
          {run?.status === "running"
            ? "Working"
            : blocked
              ? "Needs review"
              : confirmed
                ? "Task observed"
                : "Ready when authorized"}
        </Badge>
        <p className="flow-task">
          {mandate?.description ??
            "A designated agent, ready for your next task."}
        </p>
        <dl className="micro-details">
          <div>
            <dt>Selected provider</dt>
            <dd>{selected ?? "Awaiting quotes"}</dd>
          </div>
          <div>
            <dt>{payment ? "Escrow amount" : "Proposed payment"}</dt>
            <dd>
              {payment
                ? `${money(payment.amount)} mock USDC`
                : selected
                  ? `${money(run?.quotes.find((q) => q.providerId === selected.toLowerCase())?.price)} mock USDC`
                  : "—"}
            </dd>
          </div>
        </dl>
      </div>
      <div className="trust-bridge">
        <span>AGENT DECISION</span>
        <div className="connector" />
        <div className="trust-pill">
          <Icon name="lock" />
          TRUST BOUNDARY
        </div>
        <div className="connector" />
        <span>
          EARMARK CHECK
          <br />
          ESCROW AUTHORIZATION
        </span>
        <Badge
          tone={
            stage === "blocked"
              ? "danger"
              : stage === "challenge"
                ? "warning"
                : confirmed
                  ? "success"
                  : "blue"
          }
        >
          {stage === "idle"
            ? "Awaiting request"
            : stage === "challenge"
              ? "Challenge active"
              : stage === "refunded"
                ? "Refunded"
                : stage === "settled"
                  ? "Settled"
                  : stage === "authorized"
                    ? "Confirmed"
                    : stage === "blocked"
                      ? "Blocked"
                      : "Validating"}
        </Badge>
      </div>
      <div className="contract-floating glass">
        <ContractArt />
        <h2>Authorization Checks</h2>
        <ul className="contract-checks">
          {[
            "Valid earmark",
            "Authorized agent",
            "Approved provider",
            "Within task budget",
            "Valid deadlines",
            "Vault liquidity",
          ].map((label) => (
            <li key={label}>
              <span className={confirmed ? "check confirmed" : "check"}>
                <Icon name={confirmed ? "check" : "shield"} />
              </span>
              {label}
            </li>
          ))}
        </ul>
        <p className="micro">
          {confirmed
            ? "Checks enforced when escrow was funded."
            : "Checks confirm only after a real funded receipt."}
        </p>
      </div>
      <p className="flow-caption">
        AI makes decisions. <strong>Earmark enforces boundaries.</strong>
      </p>
    </section>
  );
}
export function WalletPanel() {
  const w = useWorkspace(),
    owner = useOwner();
  const [action, setAction] = useState<"deposit" | "withdraw" | null>(null),
    [amount, setAmount] = useState(""),
    [sent, setSent] = useState(false);
  const b = w.snapshot.balance;
  const percent =
    b && BigInt(b.actual) > 0n
      ? Number((BigInt(b.available) * 10000n) / BigInt(b.actual)) / 100
      : 0;
  const submit = async () => {
    const result = await w.perform(
      () => {
        const wallet = w.ownerWallet();
        return action === "deposit"
          ? wallet.deposit(amount, b?.decimals ?? 6)
          : wallet.withdraw(amount, b?.decimals ?? 6);
      },
      `${action === "deposit" ? "Deposit" : "Withdrawal"} confirmed`,
    );
    if (result) {
      setSent(true);
      setAction(null);
      setAmount("");
    }
  };
  return (
    <>
      <Panel className="wallet-panel">
        <PanelTitle
          icon="wallet"
          action={
            <Link className="text-action" href="/payments">
              View <Icon name="arrow" />
            </Link>
          }
        >
          Vault Balance
        </PanelTitle>
        <div className="balance-number" data-testid="vault-balance">
          {money(b?.actual, b?.decimals)}
        </div>
        <span className="balance-currency">{b?.symbol ?? "mock USDC"}</span>
        <div
          className="balance-bar"
          role="img"
          aria-label={
            b
              ? `Available ${money(b.available, b.decimals)}, reserved ${money(b.reserved, b.decimals)}`
              : "Vault balance unavailable"
          }
        >
          <i style={{ width: `${percent}%` }} />
          <i style={{ width: `${b ? 100 - percent : 0}%` }} />
        </div>
        <div className="balance-legend">
          <div>
            <span>
              <i />
              Available
            </span>
            <strong data-testid="available-balance">
              {money(b?.available, b?.decimals)}
            </strong>
          </div>
          <div>
            <span>
              <i />
              Reserved
            </span>
            <strong data-testid="reserved-balance">
              {money(b?.reserved, b?.decimals)}
            </strong>
          </div>
        </div>
        <div className="wallet-actions">
          <Button
            variant="soft"
            disabled={!owner || w.busy}
            onClick={() => {
              setAction("deposit");
              setSent(false);
            }}
          >
            Deposit
          </Button>
          <Button
            variant="ghost"
            disabled={!owner || w.busy || !b || BigInt(b.available) === 0n}
            onClick={() => {
              setAction("withdraw");
              setSent(false);
            }}
          >
            Withdraw
          </Button>
        </div>
        <div className="panel-foot">
          <span>{w.snapshot.config?.network ?? "Not configured"}</span>
          <span title={w.snapshot.config?.vault}>
            {w.snapshot.config
              ? short(w.snapshot.config.vault)
              : "Vault not configured"}
          </span>
        </div>
      </Panel>
      {action && (
        <Modal
          title={
            action === "deposit"
              ? "Deposit mock USDC"
              : "Withdraw available funds"
          }
          onClose={() => setAction(null)}
        >
          <p className="muted">
            {action === "deposit"
              ? "Approve the exact amount, then confirm your deposit in the owner wallet."
              : `Reserved escrow cannot be withdrawn. Available: ${money(b?.available, b?.decimals)} mock USDC.`}
          </p>
          <label className="field">
            Amount
            <input
              autoComplete="off"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
            />
          </label>
          <Button
            disabled={w.busy || !amount || sent}
            onClick={() => void submit()}
          >
            {w.busy
              ? "Waiting for wallet…"
              : action === "deposit"
                ? "Confirm deposit"
                : "Confirm withdrawal"}
          </Button>
        </Modal>
      )}
    </>
  );
}
export function MandateSummary({
  mandate,
}: {
  mandate: MandateView | undefined;
}) {
  const w = useWorkspace();
  const unavailable = w.loading || w.offline;
  const [manage, setManage] = useState(false);
  return (
    <>
      <Panel className="mandate-panel">
        <PanelTitle
          icon="database"
          action={
            mandate ? (
              <button
                type="button"
                className="text-action"
                onClick={() => setManage(true)}
              >
                Manage <Icon name="arrow" />
              </button>
            ) : unavailable ? undefined : (
              <Link className="text-action" href="/mandates/new">
                Create <Icon name="arrow" />
              </Link>
            )
          }
        >
          Active Earmark
        </PanelTitle>
        {mandate ? (
          <>
            <div className="mandate-heading">
              <span className="icon-tile">
                <Icon name="database" />
              </span>
              <strong>{mandate.description}</strong>
              <Badge tone={mandate.active ? "success" : "warning"}>
                {mandate.active ? "Active" : "Inactive"}
              </Badge>
            </div>
            <dl className="value-list">
              <div>
                <dt>Maximum task budget</dt>
                <dd>{money(mandate.cap)} USDC</dd>
              </div>
              <div>
                <dt>
                  Remaining authority
                  <Tooltip text="Task cap minus this earmark's reserved and settled spending. This is not the global vault balance." />
                </dt>
                <dd>{money(mandate.remaining)} USDC</dd>
              </div>
              <div>
                <dt>Reserved / settled</dt>
                <dd>
                  {money(mandate.reserved)} / {money(mandate.settled)}
                </dd>
              </div>
              <div>
                <dt>Approved providers</dt>
                <dd>{mandate.providers.length}</dd>
              </div>
              <div>
                <dt>Challenge window</dt>
                <dd>
                  {mandate.challengeWindow / 3600} hour
                  {mandate.challengeWindow === 3600 ? "" : "s"}
                </dd>
              </div>
            </dl>
          </>
        ) : (
          <Empty>
            {unavailable
              ? "Earmark data is loading. Existing permissions are unchanged."
              : "No earmark selected. Define the agent’s permissions before launching a task."}
          </Empty>
        )}
      </Panel>
      {manage && mandate && (
        <Modal title="Manage earmark" onClose={() => setManage(false)}>
          <MandateDetails mandate={mandate} />
        </Modal>
      )}
    </>
  );
}
export function MandateDetails({ mandate: m }: { mandate: MandateView }) {
  const w = useWorkspace(),
    owner = useOwner();
  return (
    <>
      <h3>{m.description}</h3>
      <Badge tone={m.active ? "success" : "warning"}>
        {m.active ? "Active" : "Expired or revoked"}
      </Badge>
      <dl className="value-list detailed">
        <div>
          <dt>Earmark ID</dt>
          <dd className="hash">{m.id}</dd>
        </div>
        <div>
          <dt>Authorized agent</dt>
          <dd className="hash">{m.agent}</dd>
        </div>
        <div>
          <dt>Approved token</dt>
          <dd className="hash">{m.token}</dd>
        </div>
        <div>
          <dt>Maximum / reserved / settled</dt>
          <dd>
            {money(m.cap)} / {money(m.reserved)} / {money(m.settled)} mock USDC
          </dd>
        </div>
        <div>
          <dt>Remaining authority</dt>
          <dd>{money(m.remaining)} mock USDC</dd>
        </div>
        <div>
          <dt>Expiry</dt>
          <dd>{new Date(m.expiry * 1000).toLocaleString()}</dd>
        </div>
        <div>
          <dt>Delivery / acceptance / challenge</dt>
          <dd>
            {m.deliveryWindow / 3600}h / 48h fixed / {m.challengeWindow / 3600}h
          </dd>
        </div>
      </dl>
      <p className="micro">Approved providers</p>
      {m.providers.map((p) => (
        <p key={p} className="hash small">
          {w.snapshot.config?.providers.find(
            (i) => i.address.toLowerCase() === p.toLowerCase(),
          )?.name ?? "Provider"}{" "}
          · {p}
        </p>
      ))}
      <p className="muted">
        Revocation prevents new payments. Existing escrow remains subject to its
        delivery, dispute and settlement deadlines.
      </p>
      <Button
        variant="soft"
        disabled={!owner || !m.active || w.busy}
        onClick={() =>
          void w.perform(
            () => w.ownerWallet().revoke(m.id),
            "Earmark revocation confirmed",
          )
        }
      >
        Revoke earmark
      </Button>
    </>
  );
}
export function Composer({
  mandate,
  select,
  run,
}: {
  mandate: MandateView | undefined;
  select: (id: string) => void;
  run: RunView | undefined;
}) {
  const w = useWorkspace(),
    owner = useOwner();
  const [draft, setDraft] = useState(
    "Find and purchase a weather dataset from an approved provider for no more than 10 USDC.",
  );
  const unavailable = w.loading || w.offline;
  const canResume = run && ["failed", "interrupted"].includes(run.status);
  const launch = async () => {
    if (!mandate) return;
    const result = await w.perform(
      () => w.launch(mandate.id, !!canResume),
      canResume
        ? "Same purchase intent resumed"
        : "Owner authorization verified. Task launched.",
    );
    if (result) window.location.hash = "execution";
  };
  return (
    <Panel className="composer" id="compose">
      <PanelTitle icon="spark">Create a New Task</PanelTitle>
      <label className="field task-field">
        <span className="sr-only">Task description</span>
        <textarea
          value={mandate?.description ?? draft}
          readOnly={!!mandate}
          onChange={(e) => setDraft(e.target.value)}
          rows={4}
        />
      </label>
      <div className="composer-fields">
        <div className="field">
          Agent
          <div className="read-field">
            <Icon name="spark" />
            Research Agent{" "}
            <span title={w.snapshot.config?.agent}>
              {w.snapshot.config
                ? short(w.snapshot.config.agent)
                : "Unconfigured"}
            </span>
          </div>
        </div>
        <label className="field">
          Earmark
          <select
            aria-label="Selected earmark"
            value={mandate?.id ?? ""}
            onChange={(e) => select(e.target.value)}
          >
            <option value="">
              {unavailable ? "Loading earmarks…" : "Choose an existing earmark"}
            </option>
            {w.snapshot.mandates.map((m) => (
              <option value={m.id} key={m.id}>
                {m.description} · {m.active ? "Active" : "Inactive"}
              </option>
            ))}
          </select>
        </label>
      </div>
      {mandate ? (
        <p className="micro">
          {money(mandate.remaining)} mock USDC remaining ·{" "}
          {mandate.providers.length} approved provider
          {mandate.providers.length === 1 ? "" : "s"}. Task text is bound to
          this immutable earmark.
        </p>
      ) : (
        <p className="micro">
          {unavailable
            ? "Earmark data is loading. Existing permissions are unchanged."
            : "Create a earmark first. Launching a task never creates or expands spending permissions."}
        </p>
      )}
      <Button
        className="full-width"
        disabled={
          !owner ||
          !mandate ||
          (!mandate.active && !canResume) ||
          !mandate.registered ||
          w.busy ||
          (!!run && !canResume)
        }
        onClick={() => void launch()}
      >
        {w.busy
          ? "Awaiting authorization…"
          : canResume
            ? "Resume & Reconcile"
            : run
              ? "Task already launched"
              : "Run Agent"}
        <Icon name="arrow" />
      </Button>
      {!mandate && !unavailable && (
        <Link
          className="text-action centered"
          href={`/mandates/new?task=${encodeURIComponent(draft)}`}
        >
          Create an Earmark first <Icon name="arrow" />
        </Link>
      )}
      {!w.wallet && (
        <p className="micro centered">Connect the owner wallet to launch.</p>
      )}
    </Panel>
  );
}
export { paymentProgress as progressIndex } from "../lib/payment-progress";
export function Execution({
  run,
  payment,
}: {
  run: RunView | undefined;
  payment: PaymentRecord | undefined;
}) {
  const w = useWorkspace();
  const i = progressIndex(run, payment, w.snapshot.events);
  const failed = run?.status === "failed" || run?.status === "interrupted";
  const refunded =
    payment?.status === "REJECTED" || payment?.status === "EXPIRED";
  const current = refunded
    ? payment.status === "REJECTED"
      ? "Owner rejected the payment. Reservation released."
      : "Payment expired. Reservation refunded."
    : failed
      ? (run.error ?? "Run requires review")
      : payment?.status === "ACCEPTED"
        ? "Delivery accepted. Your challenge window is active."
        : payment?.status === "COMPLETED"
          ? "Payment settled to the approved provider."
          : run
            ? "Research Agent is working within your earmark."
            : "Ready for an authorized task.";
  return (
    <Panel
      className={`execution-panel ${failed ? "blocked" : ""}`}
      id="execution"
    >
      <div className="execution-top">
        <Badge
          tone={
            failed
              ? "danger"
              : payment?.status === "COMPLETED"
                ? "success"
                : run
                  ? "warning"
                  : "neutral"
          }
        >
          {failed
            ? "Needs review"
            : payment?.status === "COMPLETED"
              ? "Completed"
              : run
                ? "In progress"
                : "Not started"}
        </Badge>
        {run && (
          <Link className="text-action" href={`/executions/${run.id}`}>
            View details <Icon name="arrow" />
          </Link>
        )}
      </div>
      <div className="execution-message">
        <span className="icon-tile">
          <Icon name="spark" />
        </span>
        <div>
          <h2>{current}</h2>
          <p>
            {modelLabel(run?.mode)} ·{" "}
            {run
              ? "Actual events and confirmed chain state"
              : "Simulated service providers, real contract enforcement"}
          </p>
        </div>
      </div>
      <ol className="progress-timeline">
        {stages.map((stage, n) => (
          <li
            key={stage}
            className={n <= i ? "reached" : ""}
            aria-current={n === i ? "step" : undefined}
          >
            <span>{n < i ? <Icon name="check" /> : null}</span>
            <small>{stage}</small>
          </li>
        ))}
      </ol>
      {payment?.status === "ACCEPTED" && (
        <p className="challenge-note">
          <Icon name="clock" />
          {challengeRemaining(payment, w.snapshot.chainTime) > 0
            ? `${Math.ceil(challengeRemaining(payment, w.snapshot.chainTime) / 60)} minutes remaining from the latest chain block`
            : "Challenge deadline reached. Permissionless settlement is available."}
        </p>
      )}
      {failed && (
        <p className="error-copy">
          No successful payment is assumed. Inspect the existing intent and
          receipts before resuming.
        </p>
      )}
    </Panel>
  );
}
export function Quotes({
  run,
  payment,
}: {
  run: RunView | undefined;
  payment: PaymentRecord | undefined;
}) {
  const { snapshot } = useWorkspace();
  const selected = snapshot.events.findLast(
    (e) => e.runId === run?.id && e.type === "provider.selected",
  )?.data.providerId;
  const infos = snapshot.config?.providers ?? [
    { id: "datahub", name: "DataHub" },
    { id: "weatherco", name: "WeatherCo" },
  ];
  return (
    <section className="quotes-section" aria-labelledby="quotes-title">
      <div className="section-heading">
        <h2 id="quotes-title">Provider Quotes</h2>
        <span className="micro">Simulated services</span>
      </div>
      <div className="quote-grid">
        {infos.map((info) => {
          const quote = run?.quotes.find((q) => q.providerId === info.id);
          const chosen = selected === info.id;
          return (
            <Panel
              key={info.id}
              className={`quote-card ${chosen ? "selected" : ""}`}
            >
              <div className="quote-heading">
                <span className={`provider-logo ${info.id}`}>
                  <Icon name={info.id === "datahub" ? "database" : "globe"} />
                </span>
                <strong>{info.name}</strong>
                {chosen && <Badge tone="blue">Agent selected</Badge>}
              </div>
              <strong className="quote-price">
                {quote ? `${money(quote.price)} mock USDC` : "Awaiting quote"}
              </strong>
              <p>
                {quote?.description ??
                  "Deterministic weather dataset · simulated provider"}
              </p>
              <div className="quote-foot">
                {quote ? (
                  <>
                    <span>
                      Expires{" "}
                      {new Date(quote.expiresAt * 1000).toLocaleTimeString()}
                    </span>
                    <span>
                      <Icon name={payment && chosen ? "check" : "shield"} />
                      {payment && chosen
                        ? "Destination confirmed"
                        : "Registry destination checked"}
                    </span>
                  </>
                ) : (
                  <span>No offer has been requested.</span>
                )}
              </div>
            </Panel>
          );
        })}
      </div>
    </section>
  );
}
const eventNames: Record<string, string> = {
  "task.launched": "Owner authorized task launch",
  "task.started": "Agent workflow started",
  "mandate.loaded": "Earmark loaded",
  "provider.quote.received": "Provider quote received",
  "provider.selected": "Agent selected provider",
  "payment.requested": "Payment requested",
  "transaction.submitted": "Transaction submitted",
  "transaction.confirmed": "Transaction confirmed",
  "transaction.reverted": "Transaction reverted",
  "transaction.uncertain": "Receipt reconciliation required",
  "provider.delivery.submitted": "Provider submitted delivery",
  "delivery.received": "Delivery inspection passed",
  "delivery.accepted": "Agent accepted delivery",
  "challenge.active": "Owner challenge window active",
  "payment.settled": "Payment settled",
  "payment.refunded": "Reservation refunded",
  "run.failed": "Agent run failed",
  "delivery.rejected": "Delivery inspection rejected",
  MandateCreated: "Earmark confirmed",
  Deposited: "Vault deposit confirmed",
  Withdrawn: "Vault withdrawal confirmed",
  MandateRevoked: "Earmark revoked",
  PaymentFunded: "Contract authorized and reserved funds",
  DeliverySubmitted: "Delivery commitment confirmed",
  DeliveryAccepted: "Acceptance confirmed",
  PaymentCompleted: "Provider payment completed",
  PaymentRejected: "Owner rejected payment",
  PaymentExpired: "Timeout refund completed",
};
export function ActivityFeed({ full = false }: { full?: boolean }) {
  const { snapshot } = useWorkspace();
  const events = [...snapshot.events].reverse().slice(0, full ? 300 : 7);
  return (
    <Panel className="activity-panel">
      <PanelTitle
        icon="activity"
        action={
          <Link className="text-action" href="/activity">
            See all <Icon name="arrow" />
          </Link>
        }
      >
        Live Activity
      </PanelTitle>
      {events.length ? (
        <ol className="activity-feed">
          {events.map((e) => (
            <li key={e.id}>
              <span
                className={`event-icon ${e.type.includes("failed") || e.type.includes("Rejected") ? "danger" : ""}`}
              >
                <Icon
                  name={
                    e.source === "model"
                      ? "spark"
                      : e.source === "onchain"
                        ? "shield"
                        : "activity"
                  }
                />
              </span>
              <div>
                <p>{eventNames[e.type] ?? e.type}</p>
                <span className="event-source">
                  {e.source === "model"
                    ? "Agent decision"
                    : e.source === "onchain"
                      ? "Smart-contract transaction"
                      : e.source === "simulated-provider"
                        ? "Mock provider"
                        : "Backend validation"}
                </span>
                <time
                  dateTime={new Date(e.observedAt).toISOString()}
                  title="Time observed by this workspace"
                >
                  {new Date(e.observedAt).toLocaleTimeString()}
                </time>
                {full && (
                  <>
                    <pre className="event-data">
                      {JSON.stringify(e.data, null, 2)}
                    </pre>
                    {e.chainTime !== undefined && (
                      <span className="micro">
                        Block time:{" "}
                        {new Date(e.chainTime * 1000).toLocaleString()}
                      </span>
                    )}
                  </>
                )}
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <Empty>
          Your actual task and transaction activity will appear here.
        </Empty>
      )}
    </Panel>
  );
}
export function Settlements({ full = false }: { full?: boolean }) {
  const { snapshot } = useWorkspace();
  const payments = [...snapshot.payments].reverse().slice(0, full ? 100 : 4);
  return (
    <Panel className="settlements-panel">
      <PanelTitle
        icon="shield"
        action={
          <Link className="text-action" href="/payments">
            View all <Icon name="arrow" />
          </Link>
        }
      >
        Recent Payments
      </PanelTitle>
      {payments.length ? (
        <div className="payment-table-wrap">
          <table className="payment-table">
            <thead>
              <tr>
                <th>Provider / task</th>
                <th>Amount</th>
                <th>Status</th>
                {full && <th>Confirmed references</th>}
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id}>
                  <td>
                    <strong>
                      {snapshot.config?.providers.find(
                        (i) =>
                          i.address.toLowerCase() === p.provider.toLowerCase(),
                      )?.name ?? short(p.provider)}
                    </strong>
                    <small>
                      {short(p.taskHash)} ·{" "}
                      {new Date(p.fundedAt * 1000).toLocaleDateString()}
                    </small>
                  </td>
                  <td>
                    {money(p.amount)}
                    <small>mock USDC</small>
                  </td>
                  <td>
                    <PaymentBadge status={p.status} />
                    <small>
                      {p.status === "COMPLETED"
                        ? "Transferred"
                        : p.status === "REJECTED" || p.status === "EXPIRED"
                          ? "Reservation released"
                          : "Held in escrow"}
                    </small>
                  </td>
                  {full && (
                    <td>
                      <code className="hash">{p.id}</code>
                      <code className="hash">
                        {p.resolutionHash ?? p.transactionHash}
                      </code>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty>
          No escrow payments yet. Confirmed payments will appear after your
          first authorized task.
        </Empty>
      )}
    </Panel>
  );
}
export function Analytics() {
  const { snapshot } = useWorkspace();
  const complete = snapshot.payments.filter((p) => p.status === "COMPLETED"),
    refund = snapshot.payments.filter((p) =>
      ["REJECTED", "EXPIRED"].includes(p.status),
    );
  const total = complete.reduce((sum, p) => sum + BigInt(p.amount), 0n);
  return (
    <Panel className="analytics-panel">
      <PanelTitle icon="activity">Payment Analytics</PanelTitle>
      {!snapshot.payments.length ? (
        <Empty>Insights appear when real escrow activity is available.</Empty>
      ) : (
        <>
          <div className="analytics-metrics">
            <div>
              <strong>{money(String(total))}</strong>
              <span>Settled USDC</span>
            </div>
            <div>
              <strong>{complete.length}</strong>
              <span>Completed</span>
            </div>
            <div>
              <strong>{refund.length}</strong>
              <span>Refunded</span>
            </div>
          </div>
          <p className="micro">
            Currently reserved: {money(snapshot.balance?.reserved)} mock USDC
          </p>
          {complete.length >= 3 && (
            <div
              className="mini-chart"
              role="img"
              aria-label="Relative amounts of completed payments"
            >
              {complete.slice(-8).map((p) => (
                <i
                  key={p.id}
                  style={{
                    height: `${Number((BigInt(p.amount) * 80n) / (total || 1n)) + 10}%`,
                  }}
                />
              ))}
            </div>
          )}
        </>
      )}
    </Panel>
  );
}
export function Dashboard() {
  const w = useWorkspace();
  const { preference } = useTheme();
  const { mandate, select } = useSelectedMandate();
  const run = w.snapshot.runs.findLast((r) => r.mandateId === mandate?.id);
  const payment = w.snapshot.payments.find((p) => p.id === run?.paymentId);
  return (
    <main id="main" className="operational-workspace">
      {preference === "light" && <Hero />}
      {w.wallet ? (
        <ExecutionWorkspace live={{ mandate, run, payment }} />
      ) : (
        <ExecutionWorkspace />
      )}
      {preference === "norway" && <Hero secondary />}
      {w.wallet ? (
        <>
          <section className="workspace-finance">
            <WalletPanel />
            <MandateSummary mandate={mandate} />
            <Composer mandate={mandate} select={select} run={run} />
          </section>
          <section className="workspace-history">
            <ActivityFeed />
            <Settlements />
          </section>
        </>
      ) : (
        <RecordedHistory />
      )}
    </main>
  );
}
