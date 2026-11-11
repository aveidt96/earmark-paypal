"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type {
  AgentCheckoutView,
  AgentSyntheticDiagnostic,
} from "../lib/agent-checkout";
import {
  PUBLIC_DEMO_ONLY,
  VERIFIED_PAYPAL_AGENT_RECEIPT,
} from "../lib/paypal-agent";
import { Button, Panel, PanelTitle } from "./glass";
type State = AgentCheckoutView & { csrfToken: string };
export function AgentCheckoutPreparation() {
  const [state, setState] = useState<State | null>(null),
    [diagnostic, setDiagnostic] = useState<AgentSyntheticDiagnostic | null>(
      null,
    ),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const response = await fetch("/api/paypal/agent-checkout", {
      cache: "no-store",
      credentials: "same-origin",
    });
    const result = (await response.json()) as State & {
      error?: string;
      diagnostic?: AgentSyntheticDiagnostic;
    };
    if (!response.ok) {
      setState(null);
      setError(result.error ?? "AGENT_CHECKOUT_UNAVAILABLE");
      return;
    }
    setState(result);
    setError("");
  }, []);
  useEffect(() => {
    if (PUBLIC_DEMO_ONLY) return;
    void load().catch(() => setError("AGENT_CHECKOUT_UNAVAILABLE"));
  }, [load]);
  if (PUBLIC_DEMO_ONLY) {
    return (
      <div
        className="page-shell"
        style={{ overflowWrap: "anywhere", minWidth: 0 }}
      >
        <h2>Agent checkout preparation disabled on public demo</h2>
        <p className="notice">
          <strong>PUBLIC DEMO · READ-ONLY.</strong> Live Gemini inference,
          owner-test authentication, internal diagnostics, and PayPal payment
          execution are disabled on this public deployment.
        </p>
        <Panel>
          <PanelTitle icon="shield">
            Verified $6.00 USD Gemini + PayPal Sandbox Receipt
          </PanelTitle>
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
      </div>
    );
  }
  async function run(action: string, payload: Record<string, string> = {}) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/paypal/agent-checkout/${action}`, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          ...(state ? { "X-Earmark-CSRF": state.csrfToken } : {}),
        },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as State & {
        error?: string;
        diagnostic?: AgentSyntheticDiagnostic;
      };
      if (!response.ok) {
        setError(result.error ?? "AGENT_CHECKOUT_UNAVAILABLE");
        return;
      }
      if (action === "logout") {
        setState(null);
        setDiagnostic(null);
        return;
      }
      if (action === "diagnose") {
        if (!result.diagnostic) throw new Error("DIAGNOSTIC_RESULT_REQUIRED");
        setDiagnostic(result.diagnostic);
        return;
      }
      if (action === "login") await load();
      else setState(result);
    } catch {
      setError("AGENT_CHECKOUT_REQUEST_UNAVAILABLE_REFRESH_SAVED_STATE");
    } finally {
      setBusy(false);
    }
  }
  const intent = state?.intent,
    m = state?.mandate,
    payment = state?.payment,
    attempt = payment?.attempt;
  return (
    <div
      className="page-shell"
      style={{ overflowWrap: "anywhere", minWidth: 0 }}
    >
      <h2>Gemini proposal → human-authorized checkout preparation</h2>
      <p className="notice">
        <strong>SYNTHETIC MERCHANT CATALOG — NOT REAL INVENTORY.</strong> $6 USD
        offer under a $10 test mandate. Model proposals reserve no funds.
        Sandbox checkout requires separate owner authorization and human buyer
        approval.
      </p>
      {!state ? (
        <Panel>
          <PanelTitle icon="lock">Local test-owner authentication</PanelTitle>
          <p>
            This loopback-only workflow is available at{" "}
            <code>http://127.0.0.1:3032</code>. It is not production
            authentication. Read the login secret from the protected local
            owner-auth file and keep it private.
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const submitted = password;
              setPassword("");
              void run("login", { password: submitted });
            }}
          >
            <label htmlFor="agent-owner-password">
              Local agent test-owner password
            </label>
            <input
              id="agent-owner-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              disabled={busy}
            />
            <Button type="submit" disabled={busy || !password}>
              Sign in to agent checkout preparation
            </Button>
          </form>
        </Panel>
      ) : (
        <>
          <div className="gemini-controls">
            <Button
              disabled={busy || !!m}
              onClick={() => void run("initialize")}
            >
              Prepare isolated $10 test mandate
            </Button>
            <Button
              disabled={
                busy ||
                !m ||
                m.expired ||
                !state.liveGeminiConfigured ||
                !!intent ||
                state.evaluationState !== "NOT_STARTED"
              }
              onClick={() => void run("evaluate")}
            >
              Evaluate with live Gemini
            </Button>
            <Button variant="soft" disabled={busy} onClick={() => void load()}>
              Refresh saved intent
            </Button>
            <Button
              variant="soft"
              disabled={busy}
              onClick={() => void run("logout")}
            >
              Sign out
            </Button>
          </div>
          {state.blocker && (
            <p className="notice pending" role="status">
              Saved campaign blocked: <code>{state.blocker}</code>.{" "}
              {["MISSING_MODEL_CONFIGURATION", "GEMINI_DISABLED"].includes(
                state.blocker,
              )
                ? "Configure server-side Gemini and restart the local profile."
                : "Review this campaign's failure and expiry before any separately authorized durable retry. Synthetic live verification below preserves this record."}
            </p>
          )}
          <Panel>
            <PanelTitle icon="spark">
              Live Gemini verification with synthetic offers
            </PanelTitle>
            <p>
              Run live Earmark AI against a separate in-memory $10 test policy
              and synthetic $6 offer. This check does not resume the saved
              campaign or create a durable checkout intent.
            </p>
            <Button
              disabled={busy || !state.liveGeminiConfigured}
              onClick={() => void run("diagnose")}
              style={{ whiteSpace: "normal", maxWidth: "100%" }}
            >
              Verify live Gemini with synthetic offers
            </Button>
            {diagnostic && (
              <div role="status" aria-label="Synthetic live Gemini result">
                <p>
                  <strong>
                    {diagnostic.source === "LIVE_GOOGLE_API"
                      ? "REAL GEMINI INFERENCE — SYNTHETIC OFFERS"
                      : "MOCKED TRANSPORT TEST — NOT LIVE INFERENCE"}
                  </strong>
                </p>
                <p>
                  Policy validated: {diagnostic.proposal.offerId} · $6.00 USD.
                  No intent saved, funds reserved, owner payment authorization,
                  PayPal order or capture.
                </p>
                <ul>
                  {diagnostic.policyChecks.map((check) => (
                    <li key={check.id}>
                      {check.passed ? "PASS" : "REJECT"}: {check.label}
                    </li>
                  ))}
                </ul>
                <details>
                  <summary>Verified native tool calls</summary>
                  <ol>
                    {diagnostic.requests.map((request) => (
                      <li key={request.step}>
                        HTTP {request.httpStatus} ·{" "}
                        {request.toolNames.join(", ") || "structured finish"} ·{" "}
                        {request.category}
                      </li>
                    ))}
                  </ol>
                </details>
              </div>
            )}
          </Panel>

          <Panel>
            <PanelTitle icon="shield">
              Isolated mandate and checkout lifecycle
            </PanelTitle>
            <p>
              Campaign: <code>{state.campaign?.version ?? "Unavailable"}</code>{" "}
              · ID <code>{state.campaign?.id ?? "Unavailable"}</code>
            </p>
            <p>
              Owner: <code>{state.campaign?.ownerId ?? "Unavailable"}</code> ·
              Agent: <code>{state.campaign?.agentId ?? "Unavailable"}</code>
            </p>
            <p>
              Mandate: <code>{m?.id ?? "Not yet prepared"}</code> · Cap $10.00
              USD · Reserved{" "}
              <strong>{m?.reservedMinor ?? "0"} minor units</strong> · Consumed{" "}
              {m?.consumedMinor ?? "0"} minor units · Available{" "}
              {m?.availableMinor ?? "0"} minor units.
            </p>
            <p>
              Expiry: {m?.expiresAt ?? "Not initialized"}
              {m?.expired ? " — EXPIRED; fresh policy authority required" : ""}
            </p>
            <ol aria-label="Agent checkout lifecycle">
              <li>
                Gemini evaluation —{" "}
                {busy
                  ? "request in progress"
                  : intent
                    ? intent.evidence.kind
                    : state.liveGeminiConfigured
                      ? state.evaluationState
                      : "BLOCKED: no configured live inference"}
              </li>
              <li>
                Proposed purchase —{" "}
                {intent
                  ? `${intent.offerId}: $6.00 USD`
                  : "No saved campaign proposal yet"}
              </li>
              <li>
                Independent policy decision —{" "}
                {intent
                  ? "VALIDATED against immutable server terms"
                  : "Waiting for a genuine model proposal"}
              </li>
              <li>
                <strong>Human authorization required</strong> —{" "}
                {attempt
                  ? "Owner-authorized payment attempt exists; see its status below"
                  : intent
                    ? "PENDING; owner has not authorized financial reservation"
                    : "Not yet ready"}
              </li>
              <li>
                <strong>PayPal checkout</strong> —{" "}
                {attempt ? attempt.state : "No order or capture"}
              </li>
            </ol>
          </Panel>
          {intent && (
            <Panel>
              <PanelTitle icon="spark">
                Validated pending checkout intent
              </PanelTitle>
              <p>
                Intent <code>{intent.id}</code> ·{" "}
                <code>{intent.idempotencyKey}</code>
              </p>
              <p>
                Source: <strong>{intent.evidence.kind}</strong> · Model{" "}
                {intent.evidence.model}. Model explanation:{" "}
                {intent.modelSummary}
              </p>
              <p>
                Approved Sandbox merchant: <code>{intent.merchantId}</code> ·
                USD600 minor units · Delivery commitment{" "}
                <code>{intent.deliveryCommitment}</code>
              </p>
              <ul>
                {intent.policyChecks.map((check) => (
                  <li key={check.id}>
                    {check.passed ? "PASS" : "REJECT"}: {check.label} —{" "}
                    {check.detail}
                  </li>
                ))}
              </ul>
              <details>
                <summary>Gemini tool and policy trace</summary>
                <ol>
                  {intent.trace.map((step) => (
                    <li key={step.step}>
                      {step.actor} · {step.toolName ?? "finish"} —{" "}
                      {step.summary}
                    </li>
                  ))}
                </ol>
              </details>
              <Button
                disabled={
                  busy ||
                  !state.orderCreationEnabled ||
                  !m ||
                  m.expired ||
                  m.status !== "ACTIVE" ||
                  (!!attempt && attempt.state !== "RESERVED")
                }
                onClick={() => void run("authorize-order")}
                style={{ whiteSpace: "normal", maxWidth: "100%" }}
              >
                {state.orderCreationEnabled
                  ? "Authorize $6 reservation and create one Sandbox order"
                  : "Human authorization required — payment remains disabled"}
              </Button>
              <p>
                This proposal remains a non-financial record. Only the
                authenticated owner can authorize checkout under a fresh,
                unexpired campaign. Payment execution stays disabled until
                separately enabled for that campaign. Buyer approval and a
                separate capture action are required; returning from PayPal
                grants no authority.
              </p>
              {attempt && (
                <>
                  <p>
                    Payment attempt <code>{attempt.id}</code> · {attempt.state}{" "}
                    · Budget {attempt.budgetState}. Order:{" "}
                    {attempt.orderId ?? "none"} · Capture:{" "}
                    {attempt.captureId ?? "none"}.
                  </p>
                  {attempt.approvalUrl &&
                    attempt.state === "AWAITING_APPROVAL" && (
                      <p>
                        <a
                          href={attempt.approvalUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Open PayPal Sandbox for human buyer approval
                        </a>
                      </p>
                    )}
                  <Button
                    variant="soft"
                    disabled={
                      busy || !payment?.executionEnabled || !attempt.orderId
                    }
                    onClick={() => void run("reconcile")}
                  >
                    Check PayPal approval / reconcile
                  </Button>
                  <Button
                    disabled={
                      busy ||
                      !state.captureEnabled ||
                      attempt.state !== "APPROVED" ||
                      !m ||
                      m.expired ||
                      m.status !== "ACTIVE"
                    }
                    onClick={() => void run("capture")}
                  >
                    Capture approved $6 Sandbox order
                  </Button>
                </>
              )}
            </Panel>
          )}
        </>
      )}
      {error && (
        <p className="notice pending" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
