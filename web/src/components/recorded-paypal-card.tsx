"use client";
import {
  PUBLIC_DEMO_ONLY,
  VERIFIED_PAYPAL_AGENT_RECEIPT as receipt,
} from "../lib/paypal-agent";
import { useTheme } from "./theme-provider";
import { Badge, Panel } from "./glass";

/** Existing published evidence only. Never reads or changes financial state. */
export function RecordedPayPalCard({
  view,
}: {
  view: "mandate" | "payment" | "activity";
}) {
  const { preference } = useTheme();
  if (preference !== "norway" && !PUBLIC_DEMO_ONLY) return null;
  return (
    <Panel className="norway-recorded-receipt">
      <div className="norway-card-heading">
        <div>
          <h2>
            {view === "mandate"
              ? "Recorded agent spending mandate"
              : "Gemini + PayPal Sandbox · $6.00"}
          </h2>
          <p className="micro">
            Task 05J · historical evidence · no current spending authority
          </p>
        </div>
        <Badge tone="success">Capture completed</Badge>
      </div>
      <p className="micro hash">
        Campaign {receipt.campaignId} · {receipt.campaignVersion}
      </p>
      <dl className="norway-recorded-accounting">
        <div>
          <dt>Authorized</dt>
          <dd>$10.00 USD</dd>
        </div>
        <div>
          <dt>Reserved</dt>
          <dd>$0.00 USD</dd>
        </div>
        <div>
          <dt>Consumed</dt>
          <dd>$6.00 USD</dd>
        </div>
        <div>
          <dt>Unused authority</dt>
          <dd>$4.00 USD</dd>
        </div>
      </dl>
      {view === "activity" && (
        <ol
          className="norway-receipt-stages"
          aria-label="Recorded Sandbox checkout stages"
        >
          {[
            "Gemini proposal",
            "Owner authorization",
            "Buyer approval",
            "Completed capture",
          ].map((stage) => (
            <li key={stage}>{stage}</li>
          ))}
        </ol>
      )}
      <details>
        <summary>Verified order and capture evidence</summary>
        <p className="hash">
          Order {receipt.orderId} · Capture {receipt.captureId}
        </p>
        <p>Completed {receipt.completedAt}</p>
      </details>
      <p className="micro">
        Read-only receipt. No replay, new authorization or live provider
        request. PayPal capture is not delivery-conditional escrow.
      </p>
    </Panel>
  );
}
