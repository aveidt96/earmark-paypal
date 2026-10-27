import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createDatabase } from "@flint/agent/server";
import { loadPayPalEnvironment } from "./paypal-env";
import {
  approvedPayPalTarget,
  verifyPayPalConnection,
} from "./paypal-db-safety";
import { paypalOAuthSettings } from "../web/src/server/paypal/config";
import { PayPalClient, PayPalError } from "../web/src/server/paypal/client";
import { merchantBinding } from "../web/src/server/paypal/test-config";
import { PaymentError } from "../web/src/server/paypal/domain";

// Fixed existing order only. No checkout service, financial POST or ledger write.
const orderId = "9N317079B4816951W";
const mandateId = "8fb8ada6-ad12-5bc8-ac4c-90e6a07ed064";
const orderPath = `/v2/checkout/orders/${orderId}`;
const object = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const code = (value: unknown) =>
  typeof value === "string" && /^[A-Z][A-Z0-9_]{1,100}$/.test(value)
    ? value
    : null;
const debugId = (value: unknown) =>
  typeof value === "string" && /^[a-f0-9]{8,64}$/i.test(value) ? value : null;
const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
function approval(value: unknown) {
  try {
    const url = new URL(String(value));
    return {
      origin: url.origin,
      path: url.pathname,
      officialSandbox: url.origin === "https://www.sandbox.paypal.com",
      tokenMatchesOrder: url.searchParams.get("token") === orderId,
      embeddedCredentials: !!(url.username || url.password),
      queryKeys: [...url.searchParams.keys()],
    };
  } catch {
    return null;
  }
}
async function main() {
  loadPayPalEnvironment();
  const authPath = new URL("../.tools/paypal-test-auth.json", import.meta.url);
  const authText = readFileSync(authPath, "utf8");
  const auth = object(JSON.parse(authText));
  const settings = paypalOAuthSettings();
  const target = approvedPayPalTarget();
  const pool = createDatabase(target.toString());
  async function snapshot() {
    const db = await pool.connect();
    db.on("error", () => {});
    try {
      await db.query("BEGIN READ ONLY");
      await verifyPayPalConnection(db, target);
      const result = await db.query<{ data: Record<string, unknown> }>(
        `SELECT jsonb_build_object(
          'mandate',to_jsonb(m),'attempt',to_jsonb(a),
          'merchants',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.merchant_id)
            FROM earmark_paypal.approved_merchants p WHERE p.mandate_id=m.id),
          'idempotency',(SELECT jsonb_agg(to_jsonb(i) ORDER BY i.request_id)
            FROM earmark_paypal.idempotency i WHERE i.attempt_id=a.id),
          'audit',(SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id)
            FROM earmark_paypal.audit e WHERE e.mandate_id=m.id)
        ) AS data FROM earmark_paypal.mandates m
        JOIN earmark_paypal.attempts a ON a.mandate_id=m.id
        WHERE m.id=$1 AND a.order_id=$2 AND m.owner_id=$3`,
        [mandateId, orderId, auth.ownerId],
      );
      const row = result.rows[0];
      if (result.rows.length !== 1 || !row)
        throw new PaymentError("EXISTING_CHECKOUT_BINDING_REQUIRED");
      return row.data;
    } finally {
      await db.query("ROLLBACK").catch(() => {});
      db.release();
    }
  }
  try {
    const before = await snapshot();
    if (
      object(before.attempt).merchant_id !== process.env.PAYPAL_MERCHANT_ID ||
      auth.merchantBinding !==
        merchantBinding(settings.clientId, process.env.PAYPAL_MERCHANT_ID ?? "")
    )
      throw new PaymentError("MATCHING_ORIGINAL_MERCHANT_CREDENTIALS_REQUIRED");
    const requests: Record<string, unknown>[] = [];
    let rawOrder: Record<string, unknown> | undefined;
    const client = new PayPalClient(settings, {
      fetch: async (input, init) => {
        const url = new URL(String(input));
        const method = init?.method ?? "GET";
        if (
          url.origin !== "https://api-m.sandbox.paypal.com" ||
          !(
            (url.pathname === "/v1/oauth2/token" && method === "POST") ||
            (url.pathname === orderPath && method === "GET")
          ) ||
          url.search ||
          url.hash ||
          url.username ||
          url.password
        )
          throw new PaymentError("DIAGNOSTIC_TRANSPORT_FORBIDDEN");
        const response = await fetch(input, init);
        const body = object(
          await response
            .clone()
            .json()
            .catch(() => ({})),
        );
        const details = Array.isArray(body.details) ? body.details : [];
        requests.push({
          operation: method === "GET" ? "GET_EXISTING_ORDER" : "OAUTH_ONLY",
          httpStatus: response.status,
          debugId:
            debugId(response.headers.get("paypal-debug-id")) ??
            debugId(body.debug_id),
          errorName: code(body.name),
          issues: details
            .map((item) => code(object(item).issue))
            .filter(Boolean),
        });
        if (method === "GET" && response.ok) rawOrder = body;
        return response;
      },
    });
    let failure: Record<string, unknown> | null = null;
    try {
      await client.getOrder(orderId);
    } catch (error) {
      failure = {
        code:
          error instanceof PaymentError ? error.code : "DIAGNOSTIC_READ_FAILED",
        httpStatus:
          error instanceof PayPalError ? (error.httpStatus ?? null) : null,
      };
    }
    const after = await snapshot();
    const mandate = object(after.mandate),
      attempt = object(after.attempt);
    const record = object(attempt.record);
    const units = Array.isArray(rawOrder?.purchase_units)
      ? rawOrder.purchase_units
      : [];
    const links = Array.isArray(rawOrder?.links) ? rawOrder.links : [];
    let historical: Record<string, unknown> = {};
    try {
      historical = object(
        JSON.parse(
          readFileSync(
            new URL(
              "../.tools/paypal-test-authoritative-status.json",
              import.meta.url,
            ),
            "utf8",
          ),
        ),
      );
    } catch {
      /* Historical evidence is optional, never current authority. */
    }
    const logPath = new URL(
      "../.tools/paypal-test-server.log",
      import.meta.url,
    );
    let log: Record<string, unknown> = { available: false };
    try {
      const text = readFileSync(logPath, "utf8");
      log = {
        available: true,
        // Output only known code-shaped tokens, never raw lines/URLs/customer data.
        codes: [
          ...new Set(
            text.match(
              /\b(?:PAYPAL_[A-Z_]+|PAYEE_[A-Z_]+|MERCHANT_[A-Z_]+|INSTRUMENT_DECLINED|RESOURCE_NOT_FOUND|INVALID_RESOURCE_ID|CURRENCY_NOT_SUPPORTED|DOMESTIC_TRANSACTION_REQUIRED|PAYER_CANNOT_PAY|TRANSACTION_REFUSED)\b/g,
            ) ?? [],
          ),
        ],
        debugIds: [
          ...new Set(
            [
              ...text.matchAll(
                /(?:paypal-debug-id|debug_id)["'\s:=]+([a-f0-9]{8,64})/gi,
              ),
            ].map((m) => m[1]),
          ),
        ],
      };
    } catch {
      /* Missing logs are reported without filesystem contents. */
    }
    console.log(
      JSON.stringify(
        {
          observedAt: new Date().toISOString(),
          orderId,
          mandateId,
          requests,
          failure,
          currentOrder: rawOrder
            ? {
                status: rawOrder.status,
                intent: rawOrder.intent,
                createTime: rawOrder.create_time ?? null,
                updateTime: rawOrder.update_time ?? null,
                purchaseUnits: units.map((item) => {
                  const unit = object(item),
                    payee = object(unit.payee);
                  const money = object(unit.amount);
                  const captures = object(unit.payments).captures;
                  return {
                    referenceMatchesAttempt: unit.reference_id === attempt.id,
                    customMatchesAttempt: unit.custom_id === attempt.id,
                    payeeMatchesConfiguredMerchant:
                      payee.merchant_id === process.env.PAYPAL_MERCHANT_ID,
                    currency: money.currency_code,
                    amount: money.value,
                    captureCount: Array.isArray(captures) ? captures.length : 0,
                  };
                }),
                approvalLinks: links
                  .filter((item) =>
                    ["approve", "payer-action"].includes(
                      String(object(item).rel),
                    ),
                  )
                  .map((item) => ({
                    rel: object(item).rel,
                    ...approval(object(item).href),
                  })),
                paymentSourceTypes: Object.keys(
                  object(rawOrder.payment_source),
                ),
              }
            : null,
          local: {
            mandateStatus: mandate.status,
            expiresAt: mandate.expires_at,
            mandateTimeExpired:
              Date.parse(String(mandate.expires_at)) <= Date.now(),
            attemptCreatedAt: attempt.created_at,
            currency: attempt.currency,
            requestedMinor: attempt.amount_minor,
            capMinor: mandate.cap_minor,
            reservedMinor: mandate.reserved_minor,
            capturedMinor: mandate.consumed_minor,
            availableMinor: (
              BigInt(String(mandate.cap_minor)) -
              BigInt(String(mandate.reserved_minor)) -
              BigInt(String(mandate.consumed_minor))
            ).toString(),
            state: attempt.state,
            budgetState: attempt.budget_state,
            captureId: attempt.capture_id,
            lastRemoteState: record.lastRemoteState ?? null,
            errorCode: code(record.errorCode),
            merchantMatchesConfigured:
              attempt.merchant_id === process.env.PAYPAL_MERCHANT_ID,
            savedApprovalLink: approval(record.approvalUrl),
            idempotencyCount: Array.isArray(after.idempotency)
              ? after.idempotency.length
              : 0,
            auditCount: Array.isArray(after.audit) ? after.audit.length : 0,
          },
          historicalEvidenceOnly: {
            sameOrder: historical.orderId === orderId,
            lastRecordedStatus: historical.paypalOrderStatus ?? null,
            lastRecordedMerchantMatched: historical.merchantMatched ?? null,
          },
          savedAppMerchantBindingMatches:
            auth.merchantBinding ===
            merchantBinding(
              settings.clientId,
              process.env.PAYPAL_MERCHANT_ID ?? "",
            ),
          sanitizedServerLog: log,
          preservation: {
            financialRowsUnchangedDuringDiagnostic:
              digest(JSON.stringify(before)) === digest(JSON.stringify(after)),
            ownerAuthFileUnchanged:
              digest(authText) === digest(readFileSync(authPath, "utf8")),
            databaseReadOnly: true,
            paymentMutationRequests: 0,
          },
        },
        null,
        2,
      ),
    );
  } finally {
    await pool.end();
  }
}
main().catch((error: unknown) => {
  console.error(
    error instanceof PaymentError
      ? error.code
      : "PAYPAL_MERCHANT_DIAGNOSTIC_UNAVAILABLE",
  );
  process.exitCode = 1;
});
