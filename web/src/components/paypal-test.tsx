"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Panel, PanelTitle } from "./glass";
import {
  PUBLIC_DEMO_ONLY,
  VERIFIED_PAYPAL_AGENT_RECEIPT,
} from "../lib/paypal-agent";
import type { TestCheckoutSnapshot } from "../server/paypal/test-checkout";
import styles from "./paypal-test.module.css";

type State = TestCheckoutSnapshot & { csrfToken: string };
const money = (minor: string) =>
  `$${BigInt(minor) / 100n}.${(BigInt(minor) % 100n).toString().padStart(2, "0")}`;
const explanations: Record<string, string> = {
  TEST_OWNER_AUTH_REQUIRED: "Sign in as the allowlisted local test owner.",
  PAYPAL_TEST_CHECKOUT_DISABLED:
    "Controlled checkout is disabled here. Start the approved local test server on port 3030.",
  BUYER_APPROVAL_REQUIRED:
    "PayPal has not confirmed buyer approval. Complete the official Sandbox flow first.",
  RECONCILIATION_REQUIRED:
    "This request may have reached PayPal. Keep the reservation and use recovery; do not create a new intent.",
  MANDATE_INACTIVE:
    "This mandate was revoked. New financial actions are blocked; existing outcomes can still be reconciled.",
  MANDATE_EXPIRED:
    "This mandate expired. Its existing reservation is retained for safe reconciliation.",
};
export function PayPalTestCheckout() {
  const [state, setState] = useState<State | null>(null),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [hint, setHint] = useState(""),
    [orderHint, setOrderHint] = useState("");
  const load = useCallback(async () => {
    const response = await fetch("/api/paypal/test", {
      cache: "no-store",
      credentials: "same-origin",
    });
    const data = (await response.json()) as State & { error?: string };
    if (!response.ok) {
      setState(null);
      setError(data.error ?? "PAYPAL_TEST_CHECKOUT_UNAVAILABLE");
      return;
    }
    setState(data);
    setError("");
  }, []);
  useEffect(() => {
    if (PUBLIC_DEMO_ONLY) return;
    void load().catch(() =>
      setError(
        "Saved state is unavailable. Refresh before retrying a financial action.",
      ),
    );
    const returned = new URL(window.location.href).searchParams.get(
      "paypal_return",
    );
    if (returned === "approved")
      setHint(
        "Returned from PayPal. This URL is not payment proof. Read authoritative status; capture requires separate authorization.",
      );
    if (returned === "cancelled")
      setHint(
        "PayPal returned via the cancellation URL. No refund or budget release is inferred. Confirm local cancellation or recover the authoritative state.",
      );
  }, [load]);
  if (PUBLIC_DEMO_ONLY) {
    return (
      <main id="main" className="page-shell">
        <div className="page-heading">
          <div>
            <span className="eyebrow">PUBLIC DEMO · READ-ONLY</span>
            <h1>PayPal Sandbox checkout disabled on public demo</h1>
            <p>
              Live payment execution, financial mutations, and owner-test
              authentication are disabled on this public hackathon demo.
            </p>
          </div>
          <Badge tone="warning">Read-only demo</Badge>
        </div>
        <Panel className={styles.panel ?? ""}>
          <PanelTitle icon="shield">
            Verified $6.00 USD PayPal Sandbox Receipt (Read-Only)
          </PanelTitle>
          <p className="muted">
            Completed Gemini → Earmark Policy → PayPal Sandbox transaction
            recorded without replay:
          </p>
          <p>
            Order <code>{VERIFIED_PAYPAL_AGENT_RECEIPT.orderId}</code> · Capture{" "}
            <code>{VERIFIED_PAYPAL_AGENT_RECEIPT.captureId}</code> ·{" "}
            <strong>{VERIFIED_PAYPAL_AGENT_RECEIPT.status}</strong> (
            {VERIFIED_PAYPAL_AGENT_RECEIPT.amountDisplay}) · $10.00 authorized,
            $6.00 consumed, $0.00 reserved, $4.00 available.
          </p>
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            <Link className="button primary" href="/">
              Open Demo Workspace
            </Link>
            <Link className="button soft" href="/security">
              Open Four Security Scenarios
            </Link>
          </div>
        </Panel>
      </main>
    );
  }
  async function run(action: string, payload: Record<string, string> = {}) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/paypal/test/${action}`, {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          ...(state ? { "X-Earmark-CSRF": state.csrfToken } : {}),
        },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as State & { error?: string };
      if (!response.ok) {
        await load();
        setError(data.error ?? "PAYPAL_TEST_CHECKOUT_UNAVAILABLE");
        return;
      }
      if (action === "logout") {
        setState(null);
        setHint(
          "Signed out. Your durable mandate and payment intent remain unchanged.",
        );
      } else if (action === "login") await load();
      else setState(data);
    } catch {
      setError(
        "Request outcome is uncertain. Refresh saved state and use recovery before retrying; do not start a new purchase.",
      );
    } finally {
      setBusy(false);
    }
  }
  const a = state?.attempt,
    m = state?.mandate;
  const active = !!m && m.status === "ACTIVE" && !m.expired;
  return (
    <main id="main" className="page-shell">
      <div className="page-heading">
        <div>
          <span className="eyebrow">
            CONTROLLED · HUMAN-APPROVED · SANDBOX ONLY
          </span>
          <h1>PayPal test checkout</h1>
          <p>
            One $6 USD purchase under an immutable $10 mandate. Buyer approval
            belongs to PayPal.
          </p>
        </div>
        <Badge tone="warning">Sandbox · Test funds only</Badge>
      </div>
      {hint && (
        <p className="notice" role="status">
          {hint}
        </p>
      )}
      {error && (
        <p className="notice pending" role="alert">
          {explanations[error] ?? error}
        </p>
      )}
      {!state ? (
        <Panel className={styles.panel ?? ""}>
          <PanelTitle icon="lock">Verified test-owner sign-in</PanelTitle>
          <p className="muted">
            This local account is allowlisted on the server. Owner IDs, agent
            IDs and policies cannot be chosen by the browser.
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const submitted = password;
              setPassword("");
              void run("login", { password: submitted });
            }}
          >
            <label htmlFor="test-password">Local test-owner password</label>
            <input
              id="test-password"
              className={styles.input}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              disabled={busy}
            />
            <p className="micro">
              Read the generated loginSecret from your ignored local
              .tools/paypal-test-auth.json file. Never share it or your Sandbox
              account credentials.
            </p>
            <Button type="submit" disabled={busy || !password}>
              Sign in to controlled checkout
            </Button>
          </form>
        </Panel>
      ) : (
        <>
          <div className={styles.session}>
            <Badge tone="success">{state.ownerLabel}</Badge>
            <Button
              variant="soft"
              disabled={busy}
              onClick={() => void run("logout")}
            >
              Sign out
            </Button>
          </div>
          {state.preparationOnly && (
            <p className="notice" role="status">
              {state.paymentConfirmed
                ? "US Sandbox capture authoritatively confirmed. "
                : a?.orderId
                  ? "US Sandbox order recorded; human buyer approval is pending. "
                  : "US merchant preparation only. "}
              This is a separate $10 mandate and $6 reservation; the original
              unresolved $6 remains held separately. Capture, cancellation and
              recovery mutations remain disabled.
              {state.paymentConfirmed
                ? " No further payment is authorized."
                : a?.orderId
                  ? " Use the official Sandbox approval link below manually; return does not authorize capture."
                  : " No general order-creation permission is enabled."}
              Receiving eligibility is not proven by order creation.
            </p>
          )}
          <div className={styles.grid}>
            <Panel className={styles.panel ?? ""}>
              <PanelTitle icon="shield">Spending mandate</PanelTitle>
              <dl className={styles.details}>
                <div>
                  <dt>Maximum authorized budget</dt>
                  <dd data-testid="authorized-budget">
                    {money(state.authorizedMinor)} USD
                  </dd>
                </div>
                <div>
                  <dt>Approved Sandbox merchant</dt>
                  <dd className={styles.hash}>{state.merchantId}</dd>
                </div>
                <div>
                  <dt>Requested purchase</dt>
                  <dd>{money(state.requestedMinor)} USD</dd>
                </div>
                <div>
                  <dt>Mandate</dt>
                  <dd className={styles.hash}>{m?.id ?? "Not created"}</dd>
                </div>
                <div>
                  <dt>Lifecycle</dt>
                  <dd>
                    {m
                      ? `${m.status}${m.expired ? " · EXPIRED" : ""}`
                      : "Awaiting owner authorization"}
                  </dd>
                </div>
                <div>
                  <dt>Authorization decision</dt>
                  <dd>{state.authorizationDecision.replaceAll("_", " ")}</dd>
                </div>
              </dl>
              <div className={styles.actions}>
                <Button
                  disabled={busy || !!m}
                  onClick={() => void run("mandate")}
                >
                  Create $10 mandate
                </Button>
                <Button
                  variant="soft"
                  disabled={busy || !active || !!a}
                  onClick={() => void run("reserve")}
                >
                  Reserve $6
                </Button>
                <Button
                  disabled={
                    busy ||
                    !active ||
                    !state.executionEnabled ||
                    (!!a && a.state !== "RESERVED")
                  }
                  onClick={() => void run("order")}
                >
                  Create $6 Sandbox order
                </Button>
              </div>
              <p className="micro">
                Mandate creation reserves no funds. The server fixes merchant,
                USD amount, owner and one purchase key; retries reuse the same
                durable intent.
              </p>
            </Panel>
            <Panel className={styles.panel ?? ""}>
              <PanelTitle icon="wallet">Payment and budget</PanelTitle>
              <dl className={styles.details}>
                <div>
                  <dt>Captured spending</dt>
                  <dd data-testid="captured-spending">
                    {money(state.capturedMinor)} USD
                  </dd>
                </div>
                <div>
                  <dt>Held reservation</dt>
                  <dd data-testid="held-reservation">
                    {money(state.reservedMinor)} USD
                  </dd>
                </div>
                <div>
                  <dt>Available budget</dt>
                  <dd data-testid="remaining-budget">
                    {money(state.availableMinor)} USD
                  </dd>
                </div>
                <div>
                  <dt>Unspent lifetime cap</dt>
                  <dd>{money(state.unspentMinor)} USD</dd>
                </div>
                <div>
                  <dt>Transaction status</dt>
                  <dd data-testid="transaction-status">
                    {a?.state ?? "NO PAYMENT"}
                  </dd>
                </div>
                <div>
                  <dt>PayPal order ID</dt>
                  <dd className={styles.hash}>{a?.orderId ?? "Not created"}</dd>
                </div>
                <div>
                  <dt>PayPal capture ID</dt>
                  <dd className={styles.hash}>
                    {a?.captureId ?? "Not captured"}
                  </dd>
                </div>
                <div>
                  <dt>Authoritative remote observation</dt>
                  <dd>{a?.lastRemoteState ?? "None"}</dd>
                </div>
              </dl>
              {state.paymentConfirmed ? (
                <p className="notice" role="status">
                  Authoritative capture confirmed. {money(state.capturedMinor)}{" "}
                  spent; {money(state.availableMinor)} available.
                </p>
              ) : (
                <p className="muted">
                  Not a confirmed payment. Pending/ambiguous outcomes retain the
                  reservation until trusted reconciliation.
                </p>
              )}
              {a?.errorCode && <p className="notice pending">{a.errorCode}</p>}
            </Panel>
          </div>
          <Panel className={styles.panel ?? ""}>
            <PanelTitle icon="globe">Human buyer approval</PanelTitle>
            <p>
              Open PayPal’s official Sandbox interface and use a Sandbox{" "}
              <strong>Personal buyer</strong> account. The application never
              approves on your behalf.
            </p>
            <div className={styles.actions}>
              {a?.approvalUrl && active && (
                <a
                  className="button primary"
                  href={a.approvalUrl}
                  rel="noreferrer"
                >
                  Approve with PayPal Sandbox
                </a>
              )}
              <Button
                variant="soft"
                disabled={busy || state.preparationOnly || !a?.orderId}
                onClick={() => void run("approval")}
              >
                Verify buyer approval
              </Button>
              <Button
                disabled={
                  busy ||
                  !active ||
                  !state.executionEnabled ||
                  a?.state !== "APPROVED"
                }
                onClick={() => void run("capture")}
              >
                Capture approved $6
              </Button>
              <Button
                variant="soft"
                disabled={busy}
                onClick={() =>
                  void load().catch(() =>
                    setError(
                      "Saved state is unavailable; do not retry a financial operation blindly.",
                    ),
                  )
                }
              >
                Refresh saved state
              </Button>
              <Button
                variant="soft"
                disabled={
                  busy ||
                  state.preparationOnly ||
                  !a ||
                  a.budgetState !== "RESERVED"
                }
                onClick={() => void run("cancel")}
              >
                Cancel local checkout
              </Button>
            </div>
            <p className="micro">
              A return/cancel URL is only a hint. Capture rechecks buyer
              approval through PayPal and all mandate rules. Local cancellation
              after order creation revokes new authority but does not pretend
              PayPal voided/refunded an order.
            </p>
          </Panel>
          <Panel className={styles.panel ?? ""}>
            <PanelTitle icon="clock">Safe recovery</PanelTitle>
            <p className="muted">
              Recovery reads PayPal; it never blindly creates or captures again.
              Unknown order creation may require an operator-located order ID,
              verified against immutable terms.
            </p>
            <label htmlFor="known-order">
              Known order ID (optional, for ambiguous creation)
            </label>
            <input
              id="known-order"
              className={styles.input}
              value={orderHint}
              onChange={(event) => setOrderHint(event.target.value)}
              autoComplete="off"
            />
            <Button
              variant="soft"
              disabled={busy || state.preparationOnly || !a}
              onClick={() =>
                void run(
                  "recover",
                  orderHint ? { orderId: orderHint.trim() } : {},
                )
              }
            >
              Reconcile authoritative status
            </Button>
            <p className="micro">
              No webhook ID is fabricated. This test uses direct authenticated
              order/capture reads; webhook delivery is not claimed verified.
            </p>
          </Panel>
        </>
      )}
    </main>
  );
}
