import { readFileSync, writeFileSync } from "node:fs";
import { createDatabase } from "@flint/agent/server";
import { loadPayPalEnvironment } from "./paypal-env";
import {
  approvedPayPalTarget,
  verifyPayPalConnection,
} from "./paypal-db-safety";
import { paypalOAuthSettings } from "../web/src/server/paypal/config";
import { PayPalClient } from "../web/src/server/paypal/client";
import {
  fromDecimal,
  parse,
  paypalMerchantSchema,
  PaymentError,
} from "../web/src/server/paypal/domain";
import { testMandateId } from "../web/src/server/paypal/test-checkout";

/** Read-only operator evidence. Never approves, creates, captures or reconciles/writes a payment. */
async function main() {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args[0] && args[0] !== "--us"))
    throw new PaymentError("INVALID_STATUS_ARGUMENTS");
  const us = args.includes("--us");
  loadPayPalEnvironment();
  const merchant = parse(paypalMerchantSchema, process.env.PAYPAL_MERCHANT_ID);
  const owner = (
    JSON.parse(
      readFileSync(
        new URL("../.tools/paypal-test-auth.json", import.meta.url),
        "utf8",
      ),
    ) as { ownerId: string }
  ).ownerId;
  const target = approvedPayPalTarget(),
    pool = createDatabase(target.toString());
  let record: Record<string, unknown> | undefined;
  try {
    const client = await pool.connect();
    client.on("error", () => {});
    try {
      await client.query("BEGIN READ ONLY");
      await verifyPayPalConnection(client, target);
      const result = await client.query<Record<string, unknown>>(
        `SELECT m.id AS mandate_id,m.currency,m.status AS mandate_status,
        m.cap_minor::text AS authorized,m.reserved_minor::text AS reserved,m.consumed_minor::text AS captured,
        (m.cap_minor-m.reserved_minor-m.consumed_minor)::text AS available,a.id AS attempt_id,a.amount_minor::text AS requested,
         a.state,a.budget_state,a.merchant_id,a.order_id,a.capture_id FROM earmark_paypal.mandates m
         LEFT JOIN earmark_paypal.attempts a ON a.mandate_id=m.id AND a.purchase_key=$3
         WHERE m.id=$1 AND m.owner_id=$2`,
        [
          testMandateId(owner, us ? merchant : undefined),
          owner,
          us ? "paypal-test-us-6usd-v1" : "paypal-test-6usd-v1",
        ],
      );
      record = result.rows[0];
    } finally {
      await client.query("ROLLBACK").catch(() => {});
      client.release();
    }
  } finally {
    await pool.end();
  }
  if (!record) throw new PaymentError("CONTROLLED_TEST_MANDATE_REQUIRED");
  if (record.merchant_id !== merchant)
    throw new PaymentError("MATCHING_MERCHANT_CREDENTIALS_REQUIRED");
  if (us && record.order_id === null) {
    console.log(
      JSON.stringify(
        {
          scope: "read-only-us-preparation-no-order",
          mandateId: record.mandate_id,
          attemptId: record.attempt_id,
          orderId: null,
          captureId: record.capture_id,
          database: {
            mandateStatus: record.mandate_status,
            authorizedMinor: record.authorized,
            requestedMinor: record.requested,
            reservedMinor: record.reserved,
            capturedMinor: record.captured,
            availableMinor: record.available,
            state: record.state,
            budgetState: record.budget_state,
          },
          merchantMatchesConfigured: true,
          paypalRequests: 0,
          paymentMutationRequests: 0,
          databaseReadOnly: true,
          objectiveComplete: false,
        },
        null,
        2,
      ),
    );
    return;
  }
  if (typeof record.order_id !== "string")
    throw new PaymentError("CONTROLLED_TEST_ORDER_REQUIRED");
  const client = new PayPalClient(paypalOAuthSettings()),
    order = await client.getOrder(record.order_id),
    u = order.purchase_units[0];
  const bound =
    !!u &&
    u.reference_id === record.attempt_id &&
    u.custom_id === record.attempt_id &&
    u.payee.merchant_id === merchant &&
    u.amount.currency_code === "USD" &&
    fromDecimal(u.amount.value, "USD") === "600";
  if (!bound) throw new PaymentError("PAYPAL_ORDER_BINDING_MISMATCH");
  const observed = order.purchase_units[0]?.payments?.captures?.[0];
  const capture = observed ? await client.getCapture(observed.id) : undefined;
  if (
    capture &&
    (capture.id !== observed?.id ||
      capture.amount.currency_code !== "USD" ||
      fromDecimal(capture.amount.value, "USD") !== "600" ||
      (capture.supplementary_data?.related_ids.order_id &&
        capture.supplementary_data.related_ids.order_id !== order.id))
  )
    throw new PaymentError("PAYPAL_CAPTURE_BINDING_MISMATCH");
  const complete =
    capture?.status === "COMPLETED" &&
    record.captured === "600" &&
    record.reserved === "0" &&
    record.available === "400" &&
    record.authorized === "1000" &&
    record.state === "SUCCEEDED" &&
    record.capture_id === capture.id;
  const report = {
    scope: "read-only-real-sandbox-checkout-evidence",
    mandateId: record.mandate_id,
    orderId: order.id,
    captureId: capture?.id ?? null,
    paypalOrderStatus: order.status,
    paypalCaptureStatus: capture?.status ?? null,
    merchantMatched: bound,
    approvalAvailable: !!order.links?.some((link) => {
      if (!["approve", "payer-action"].includes(link.rel)) return false;
      try {
        const url = new URL(link.href);
        return (
          url.origin === "https://www.sandbox.paypal.com" &&
          !url.username &&
          !url.password &&
          url.searchParams.get("token") === order.id
        );
      } catch {
        return false;
      }
    }),
    amountUsd: u?.amount.value,
    database: {
      mandateStatus: record.mandate_status,
      authorizedMinor: record.authorized,
      requestedMinor: record.requested,
      reservedMinor: record.reserved,
      capturedMinor: record.captured,
      availableMinor: record.available,
      state: record.state,
      budgetState: record.budget_state,
    },
    objectiveComplete: !!complete,
    humanApprovalStillRequired: order.status !== "APPROVED" && !capture,
    paymentMutationRequests: 0,
    databaseReadOnly: true,
  };
  writeFileSync(
    new URL(
      us
        ? "../.tools/paypal-us-authoritative-status.json"
        : "../.tools/paypal-test-authoritative-status.json",
      import.meta.url,
    ),
    JSON.stringify(report, null, 2) + "\n",
    { mode: 0o600 },
  );
  console.log(JSON.stringify(report, null, 2));
}
main().catch((error: unknown) => {
  console.error(
    error instanceof PaymentError
      ? error.code
      : "PAYPAL_TEST_STATUS_UNAVAILABLE",
  );
  process.exitCode = 1;
});
