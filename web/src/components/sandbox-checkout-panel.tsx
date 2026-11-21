"use client";

import { useEffect, useState } from "react";
import { formatUsdMinor, type BoundSandboxOffer } from "../lib/bound-merchants";
import { Badge, Button } from "./glass";

type CaptureReceipt = {
  orderId: string;
  status: string;
  captureId: string | null;
  amount: string | null;
  currency: string;
};

export function SandboxCheckoutPanel() {
  const [available, setAvailable] = useState(false);
  const [offers, setOffers] = useState<BoundSandboxOffer[]>([]);
  const [budgetText, setBudgetText] = useState("10.00");
  const [busyOfferId, setBusyOfferId] = useState<string | null>(null);
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null);
  const [cancelled, setCancelled] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [receipt, setReceipt] = useState<CaptureReceipt | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams(window.location.search);
    const statusParam = params.get("sandboxOrder");
    const tokenParam = params.get("token");
    if (statusParam === "approved" && tokenParam) {
      setPendingOrderId(tokenParam);
    } else if (statusParam === "cancelled") {
      setCancelled(true);
    }

    fetch("/api/paypal/sandbox-checkout", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!active || !data?.available) return;
        setAvailable(true);
        setOffers(Array.isArray(data.offers) ? data.offers : []);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  if (!available) return null;

  const parsedBudget = Number(budgetText);
  const budgetMinor =
    Number.isFinite(parsedBudget) && parsedBudget > 0
      ? Math.round(parsedBudget * 100)
      : 0;

  async function startCheckout(offer: BoundSandboxOffer) {
    setError(null);
    setCancelled(false);
    setReceipt(null);
    setBusyOfferId(offer.id);
    try {
      const response = await fetch("/api/paypal/sandbox-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          offerId: offer.id,
          budgetMinor,
        }),
      });
      const data = await response.json();
      if (!response.ok || typeof data?.approvalUrl !== "string") {
        throw new Error(data?.error ?? "SANDBOX_CHECKOUT_FAILED");
      }
      window.location.assign(data.approvalUrl);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "SANDBOX_CHECKOUT_UNAVAILABLE",
      );
      setBusyOfferId(null);
    }
  }

  async function confirmCapture() {
    if (!pendingOrderId) return;
    setError(null);
    setCapturing(true);
    try {
      const response = await fetch("/api/paypal/sandbox-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "capture", orderId: pendingOrderId }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error ?? "SANDBOX_CAPTURE_FAILED");
      }
      setReceipt(data);
      setPendingOrderId(null);
      window.history.replaceState({}, "", window.location.pathname);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "SANDBOX_CAPTURE_UNAVAILABLE",
      );
    } finally {
      setCapturing(false);
    }
  }

  return (
    <section
      className="norway-card"
      aria-label="Bound PayPal Sandbox checkout"
      style={{ marginTop: "18px" }}
    >
      <div className="norway-card-heading">
        <h3>Bound PayPal Sandbox Checkout</h3>
        <Badge tone="success">PayPal Bound · Sandbox</Badge>
      </div>
      <p className="micro">
        Approved Sandbox merchant offers eligible for direct PayPal Sandbox
        Checkout redirect. Human buyer approval on PayPal is required before
        capture.
      </p>

      <div style={{ margin: "12px 0" }}>
        <label htmlFor="sandbox-budget-input" className="micro">
          Session budget limit (USD, $6.00 Sandbox cap)
        </label>
        <input
          id="sandbox-budget-input"
          type="number"
          min="0.01"
          max="100"
          step="0.01"
          value={budgetText}
          onChange={(event) => setBudgetText(event.target.value)}
          style={{ display: "block", marginTop: "4px", maxWidth: "160px" }}
        />
      </div>

      {cancelled && (
        <p role="status" className="micro">
          PayPal Sandbox checkout was cancelled. No funds were captured.
        </p>
      )}

      {pendingOrderId && (
        <div
          className="offer-research-card"
          role="region"
          aria-label="Confirm Sandbox capture"
          style={{ marginBottom: "12px" }}
        >
          <div className="norway-card-heading">
            <strong>Human approval returned from PayPal Sandbox</strong>
            <Badge tone="warning">Awaiting capture</Badge>
          </div>
          <p className="micro">Order ID: {pendingOrderId}</p>
          <Button
            variant="primary"
            disabled={capturing}
            onClick={() => void confirmCapture()}
          >
            {capturing ? "Capturing in Sandbox…" : "Confirm Sandbox Capture"}
          </Button>
        </div>
      )}

      {receipt && (
        <div
          className="offer-research-card"
          role="status"
          style={{ marginBottom: "12px" }}
        >
          <div className="norway-card-heading">
            <strong>Sandbox payment captured</strong>
            <Badge tone="success">{receipt.status}</Badge>
          </div>
          <p className="micro">
            Order {receipt.orderId}
            {receipt.captureId ? ` · Capture ${receipt.captureId}` : ""}
            {receipt.amount ? ` · ${receipt.amount} ${receipt.currency}` : ""}
          </p>
        </div>
      )}

      {error && (
        <p role="alert" className="micro">
          Sandbox checkout error: {error}
        </p>
      )}

      <div className="offer-research-list">
        {offers.map((offer) => {
          const withinBudget = offer.priceMinor <= budgetMinor;
          return (
            <article key={offer.id} className="offer-research-card">
              <div className="norway-card-heading">
                <div>
                  <strong>{offer.provider}</strong>
                  <p className="micro">{offer.service}</p>
                </div>
                <Badge tone={withinBudget ? "success" : "warning"}>
                  {withinBudget ? "Within budget" : "Exceeds budget"}
                </Badge>
              </div>
              <p className="offer-research-amount">
                <strong>{formatUsdMinor(offer.priceMinor)}</strong> /{" "}
                {offer.billing}
              </p>
              <p className="micro">{offer.features.join(" · ")}</p>
              <Button
                variant="primary"
                disabled={!withinBudget || busyOfferId !== null}
                onClick={() => void startCheckout(offer)}
              >
                {busyOfferId === offer.id
                  ? "Creating PayPal Sandbox order…"
                  : "Continue to PayPal Sandbox Checkout"}
              </Button>
            </article>
          );
        })}
      </div>
    </section>
  );
}
