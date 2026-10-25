"use client";
import Link from "next/link";
import { ExecutionConsole } from "./execution-console";
import { useState } from "react";
import { canReject, canRefund, challengeRemaining } from "../lib/model";
import { useWorkspace } from "./workspace-provider";
import {
  ActivityFeed,
  MandateDetails,
  PaymentBadge,
  Settlements,
  money,
  useOwner,
} from "./dashboard";
import { Button, Empty, Icon, Modal, Panel, PanelTitle } from "./glass";
export function MandatesPage() {
  const w = useWorkspace();
  return (
    <main id="main" className="page-shell">
      <div className="page-heading">
        <div>
          <h1>Earmarks</h1>
          <p>Immutable permissions. Cumulative budgets. Owner control.</p>
        </div>
        <Link className="button primary" href="/mandates/new">
          Create an Earmark <Icon name="arrow" />
        </Link>
      </div>
      {w.snapshot.mandates.length ? (
        <div className="list-grid">
          {w.snapshot.mandates.map((m) => (
            <Panel key={m.id}>
              <MandateDetails mandate={m} />
            </Panel>
          ))}
        </div>
      ) : (
        <Panel>
          <Empty>
            {w.loading || w.offline
              ? "Earmark data is loading. Existing permissions are unchanged."
              : "No earmarks yet. Create your first task authorization to begin."}
          </Empty>
        </Panel>
      )}
    </main>
  );
}
export function PaymentsPage() {
  return (
    <main id="main" className="page-shell">
      <div className="page-heading">
        <div>
          <h1>Payments</h1>
          <p>
            Reserved funds remain in the vault until a confirmed settlement.
          </p>
        </div>
      </div>
      <Link className="button soft" href="/resolve">
        Resolve escrow directly onchain
      </Link>
      <Settlements full />
    </main>
  );
}
export function ActivityPage() {
  return (
    <main id="main" className="page-shell">
      <div className="page-heading">
        <div>
          <h1>Live Activity</h1>
          <p>
            Persistent agent observations and confirmed contract events.
            Observation and block times are identified separately.
          </p>
        </div>
      </div>
      <ActivityFeed full />
    </main>
  );
}
export function ExecutionPage({ id }: { id: string }) {
  const w = useWorkspace(),
    owner = useOwner();
  const [reject, setReject] = useState(false),
    [reason, setReason] = useState("");
  const run = w.snapshot.runs.find((r) => r.id === id),
    p = w.snapshot.payments.find((p) => p.id === run?.paymentId),
    m = w.snapshot.mandates.find((m) => m.id === run?.mandateId);
  return (
    <main id="main" className="page-shell">
      <div className="page-heading">
        <div>
          <span className="eyebrow">TASK TRANSPARENCY</span>
          <h1>Agent Activity</h1>
          <p>{m?.description ?? "Task execution details"}</p>
        </div>
        <Link className="text-action" href="/">
          Workspace <Icon name="arrow" />
        </Link>
      </div>
      {!run ? (
        <Panel>
          <Empty>
            {w.loading
              ? "Loading run…"
              : "No recorded run with this ID. Launch an authorized task from the workspace."}
          </Empty>
        </Panel>
      ) : (
        <>
          <ExecutionConsole mandate={m} run={run} payment={p} />
          <div className="details-grid">
            <Panel>
              <PanelTitle icon="shield">Transaction Evidence</PanelTitle>
              {p ? (
                <>
                  <PaymentBadge status={p.status} />
                  <dl className="value-list detailed">
                    <div>
                      <dt>Amount</dt>
                      <dd>{money(p.amount)} mock USDC</dd>
                    </div>
                    <div>
                      <dt>Recipient fixed at funding</dt>
                      <dd className="hash">{p.provider}</dd>
                    </div>
                    <div>
                      <dt>Payment ID</dt>
                      <dd className="hash">{p.id}</dd>
                    </div>
                    <div>
                      <dt>Earmark ID</dt>
                      <dd className="hash">{p.taskHash}</dd>
                    </div>
                  </dl>
                  <div className="receipt-list">
                    <span className="micro">Confirmed funding transaction</span>
                    <code className="hash">{p.transactionHash}</code>
                    {p.resolutionHash && (
                      <>
                        <span className="micro">
                          Confirmed resolution transaction
                        </span>
                        <code className="hash">{p.resolutionHash}</code>
                      </>
                    )}
                  </div>
                  <p className="info-callout">
                    The funded receipt confirms earmark, agent, provider, token,
                    cumulative cap and liquidity checks at reservation time.
                  </p>
                </>
              ) : (
                <Empty>
                  No confirmed escrow record yet. A model decision alone is not
                  payment authorization.
                </Empty>
              )}
            </Panel>
            <Panel className="span-two">
              <PanelTitle icon="clock">Escrow Status</PanelTitle>
              {p ? (
                <>
                  <dl className="value-list detailed">
                    <div>
                      <dt>Delivered commitment</dt>
                      <dd className="hash">
                        {p.deliveredHash === `0x${"0".repeat(64)}`
                          ? "Not submitted"
                          : p.deliveredHash}
                      </dd>
                    </div>
                    <div>
                      <dt>Deterministic inspection</dt>
                      <dd>
                        {run.inspected
                          ? "Task, quote, payment, artifact schema and commitment passed"
                          : "No successful inspection recorded"}
                      </dd>
                    </div>
                    <div>
                      <dt>Delivery deadline</dt>
                      <dd>
                        {new Date(p.deliveryDeadline * 1000).toLocaleString()}
                      </dd>
                    </div>
                    <div>
                      <dt>Review deadline</dt>
                      <dd>
                        {new Date(p.reviewDeadline * 1000).toLocaleString()}
                      </dd>
                    </div>
                    {p.challengeDeadline > 0 && (
                      <div>
                        <dt>Owner challenge deadline</dt>
                        <dd>
                          {new Date(
                            p.challengeDeadline * 1000,
                          ).toLocaleString()}
                        </dd>
                      </div>
                    )}
                    <div>
                      <dt>Owner-trusted hash</dt>
                      <dd className="hash">
                        {m?.trustedHash &&
                        m.trustedHash !== `0x${"0".repeat(64)}`
                          ? m.trustedHash
                          : "Not configured"}
                      </dd>
                    </div>
                  </dl>
                  <details>
                    <summary>Threat Model</summary>
                    <p className="muted">
                      The owner is the trusted dispute authority. A provider
                      commitment and deterministic structure checks do not prove
                      semantic correctness. Bad delivery can settle if the agent
                      accepts it and the owner misses the challenge deadline.
                    </p>
                  </details>
                  {p.status === "ACCEPTED" && (
                    <p className="info-callout">
                      {challengeRemaining(p, w.snapshot.chainTime) > 0
                        ? `${challengeRemaining(p, w.snapshot.chainTime)} seconds remain according to the latest chain block. Settlement is unavailable until the full deadline.`
                        : "The full challenge deadline has elapsed onchain. Permissionless settlement is available."}
                    </p>
                  )}
                  <div className="detail-actions">
                    <Button
                      variant="soft"
                      disabled={
                        !owner || !canReject(p, w.snapshot.chainTime) || w.busy
                      }
                      onClick={() => setReject(true)}
                    >
                      Reject payment
                    </Button>
                    <Button
                      disabled={
                        !w.wallet ||
                        w.offline ||
                        p.status !== "ACCEPTED" ||
                        challengeRemaining(p, w.snapshot.chainTime) > 0 ||
                        w.busy
                      }
                      onClick={() =>
                        void w.perform(
                          () => w.ownerWallet().settle(p.id),
                          "Provider payment settlement confirmed",
                        )
                      }
                    >
                      Settle payment
                    </Button>
                    <Button
                      variant="soft"
                      disabled={
                        !w.wallet ||
                        w.offline ||
                        !canRefund(p, w.snapshot.chainTime) ||
                        w.busy
                      }
                      onClick={() =>
                        void w.perform(
                          () => w.ownerWallet().refund(p.id),
                          "Timeout refund confirmed",
                        )
                      }
                    >
                      Refund expired payment
                    </Button>
                  </div>
                  <p className="micro">
                    Refunds release reservations and restore task headroom.
                    Settlement consumes historical task authority. Accepted
                    payments cannot timeout-refund.
                  </p>
                </>
              ) : (
                <Empty>
                  Delivery and settlement details appear after escrow funding.
                </Empty>
              )}
            </Panel>
          </div>
        </>
      )}
      {reject && p && (
        <Modal
          title="Reject this escrow payment"
          onClose={() => setReject(false)}
        >
          <p className="muted">
            This owner dispute releases the reservation without increasing
            settled spending.
          </p>
          <label className="field">
            Rejection reason
            <textarea
              maxLength={256}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
            />
          </label>
          <Button
            disabled={!reason.trim() || w.busy}
            onClick={() =>
              void w
                .perform(
                  () => w.ownerWallet().reject(p.id, reason),
                  "Owner rejection confirmed",
                )
                .then((result) => {
                  if (result) setReject(false);
                })
            }
          >
            Confirm rejection in wallet
          </Button>
        </Modal>
      )}
    </main>
  );
}
