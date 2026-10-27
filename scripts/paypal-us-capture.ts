import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createDatabase } from "@flint/agent/server";
import { loadPayPalEnvironment } from "./paypal-env";
import {
  approvedPayPalTarget,
  verifyPayPalConnection,
} from "./paypal-db-safety";
import { paypalOAuthSettings } from "../web/src/server/paypal/config";
import { PayPalClient } from "../web/src/server/paypal/client";
import { merchantBinding } from "../web/src/server/paypal/test-config";
import {
  attemptSchema,
  parse,
  paypalMerchantSchema,
  PaymentError,
  fromDecimal,
} from "../web/src/server/paypal/domain";
import { ORIGINAL_MANDATE_ID } from "../web/src/server/paypal/operator-hold";
import {
  US_MANDATE_ID,
  US_ATTEMPT_ID,
  US_PURCHASE_KEY,
} from "../web/src/server/paypal/us-order";
import { US_ORDER_ID } from "../web/src/server/paypal/us-capture";

const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
type Snapshot = {
  mandate: Record<string, unknown>;
  attempts: Record<string, unknown>[];
  merchants: string[];
  idempotency: Record<string, unknown>[];
  audit: Record<string, unknown>[];
};
async function main() {
  const args = process.argv.slice(2);
  if (
    args.length > 1 ||
    (args[0] && !["--execute", "--verify"].includes(args[0]))
  )
    throw new PaymentError("INVALID_CAPTURE_ARGUMENTS");
  const execute = args.includes("--execute"),
    verify = args.includes("--verify");
  loadPayPalEnvironment();
  const settings = paypalOAuthSettings(),
    merchant = parse(paypalMerchantSchema, process.env.PAYPAL_MERCHANT_ID);
  const directory = new URL("../.tools/", import.meta.url);
  const authText = readFileSync(
      new URL("paypal-test-auth.json", directory),
      "utf8",
    ),
    auth = JSON.parse(authText) as { ownerId: string; loginSecret: string };
  const profile = JSON.parse(
    readFileSync(new URL("paypal-us-profile.json", directory), "utf8"),
  ) as {
    ownerId: string;
    appMerchantBinding: string;
    dashboardSellerConfirmed: boolean;
  };
  const originalBaseline = JSON.parse(
    readFileSync(new URL("paypal-us-order-baseline.json", directory), "utf8"),
  ) as { originalDigest: string; ownerAuthDigest: string };
  const binding = merchantBinding(settings.clientId, merchant);
  if (
    profile.ownerId !== auth.ownerId ||
    profile.appMerchantBinding !== binding ||
    profile.dashboardSellerConfirmed !== true ||
    hash(authText) !== originalBaseline.ownerAuthDigest
  )
    throw new PaymentError("VERIFIED_US_OWNER_MERCHANT_REQUIRED");
  const target = approvedPayPalTarget(),
    pool = createDatabase(target.toString());
  async function snapshot(id: string): Promise<Snapshot> {
    const db = await pool.connect();
    db.on("error", () => {});
    try {
      await db.query("BEGIN READ ONLY");
      await verifyPayPalConnection(db, target);
      const rows = await db.query<{ data: Snapshot }>(
        `SELECT jsonb_build_object('mandate',to_jsonb(m),
        'attempts',(SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id) FROM earmark_paypal.attempts a WHERE a.mandate_id=m.id),
        'merchants',ARRAY(SELECT merchant_id FROM earmark_paypal.approved_merchants WHERE mandate_id=m.id ORDER BY merchant_id),
        'idempotency',(SELECT jsonb_agg(to_jsonb(i) ORDER BY i.request_id) FROM earmark_paypal.idempotency i JOIN earmark_paypal.attempts a ON a.id=i.attempt_id WHERE a.mandate_id=m.id),
        'audit',(SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id) FROM earmark_paypal.audit e WHERE e.mandate_id=m.id)) AS data
        FROM earmark_paypal.mandates m WHERE m.id=$1 AND m.owner_id=$2`,
        [id, auth.ownerId],
      );
      const row = rows.rows[0];
      if (!row) throw new PaymentError("EXISTING_MANDATE_REQUIRED");
      return row.data;
    } finally {
      await db.query("ROLLBACK").catch(() => {});
      db.release();
    }
  }
  const reads: Record<string, unknown>[] = [];
  const client = new PayPalClient(settings, {
    fetch: async (input, init) => {
      const url = new URL(String(input)),
        method = init?.method ?? "GET";
      if (
        url.origin !== settings.baseUrl ||
        url.search ||
        url.hash ||
        !(
          (method === "POST" && url.pathname === "/v1/oauth2/token") ||
          (method === "GET" &&
            (url.pathname === `/v2/checkout/orders/${US_ORDER_ID}` ||
              /^\/v2\/payments\/captures\/[A-Za-z0-9_-]+$/.test(url.pathname)))
        )
      )
        throw new PaymentError(
          "READONLY_CAPTURE_VERIFICATION_TRANSPORT_REQUIRED",
        );
      const response = await fetch(input, init),
        debug = response.headers.get("paypal-debug-id");
      reads.push({
        operation:
          method === "POST"
            ? "OAUTH"
            : url.pathname.includes("/captures/")
              ? "GET_CAPTURE"
              : "GET_ORDER",
        httpStatus: response.status,
        debugId: debug && /^[a-f0-9]{8,64}$/i.test(debug) ? debug : null,
      });
      return response;
    },
  });
  try {
    const old = await snapshot(ORIGINAL_MANDATE_ID),
      us = await snapshot(US_MANDATE_ID),
      raw = us.attempts?.[0];
    if (
      hash(old) !== originalBaseline.originalDigest ||
      us.attempts.length !== 1 ||
      !raw
    )
      throw new PaymentError("ORIGINAL_HISTORY_OR_US_ATTEMPT_REVIEW_REQUIRED");
    const a = parse(attemptSchema, raw.record),
      m = us.mandate;
    if (
      a.id !== US_ATTEMPT_ID ||
      a.mandateId !== US_MANDATE_ID ||
      a.orderId !== US_ORDER_ID ||
      a.ownerId !== auth.ownerId ||
      a.agentId !== m.agent_id ||
      a.merchantId !== merchant ||
      a.amountMinor !== "600" ||
      a.currency !== "USD" ||
      a.purchaseKey !== US_PURCHASE_KEY ||
      m.currency !== "USD" ||
      String(m.cap_minor) !== "1000" ||
      String(m.per_transaction_minor) !== "600" ||
      us.merchants.length !== 1 ||
      us.merchants[0] !== merchant ||
      us.idempotency.length !== 2 ||
      us.idempotency.some(
        (i) =>
          i.fingerprint !== a.fingerprint ||
          i.request_id !==
            (i.operation === "CREATE" ? a.createRequestId : a.captureRequestId),
      )
    )
      throw new PaymentError("EXACT_CAPTURE_SCOPE_REQUIRED");
    const order = await client.getOrder(US_ORDER_ID),
      unit = order.purchase_units[0];
    if (
      !unit ||
      order.intent !== "CAPTURE" ||
      unit.payee.merchant_id !== merchant ||
      unit.reference_id !== a.id ||
      unit.custom_id !== a.id ||
      unit.amount.currency_code !== "USD" ||
      fromDecimal(unit.amount.value, "USD") !== "600"
    )
      throw new PaymentError("PAYPAL_ORDER_BINDING_MISMATCH");
    const claims = us.audit.filter(
      (e) => e.attempt_id === a.id && e.action === "CAPTURE_PREPARED",
    ).length;
    const path = new URL("paypal-us-capture-baseline.json", directory);
    if (verify) {
      const member = unit.payments?.captures?.[0],
        capture = member ? await client.getCapture(member.id) : undefined;
      if (
        capture &&
        (capture.id !== member?.id ||
          capture.amount.currency_code !== "USD" ||
          fromDecimal(capture.amount.value, "USD") !== "600" ||
          (capture.supplementary_data?.related_ids.order_id &&
            capture.supplementary_data.related_ids.order_id !== US_ORDER_ID))
      )
        throw new PaymentError("PAYPAL_CAPTURE_BINDING_MISMATCH");
      const fresh = await snapshot(US_MANDATE_ID),
        original = await snapshot(ORIGINAL_MANDATE_ID),
        record = parse(attemptSchema, fresh.attempts[0]?.record);
      const baseline = JSON.parse(readFileSync(path, "utf8")) as {
        originalDigest: string;
        ownerAuthDigest: string;
        captureRequestId: string;
        appMerchantBinding: string;
      };
      const originalPreserved = hash(original) === baseline.originalDigest,
        ownerPreserved = hash(authText) === baseline.ownerAuthDigest;
      if (
        !originalPreserved ||
        !ownerPreserved ||
        baseline.captureRequestId !== record.captureRequestId ||
        baseline.appMerchantBinding !== binding
      )
        throw new PaymentError("CAPTURE_PRESERVATION_REVIEW_REQUIRED");
      const lines = readFileSync(
        new URL("paypal-us-server.log", directory),
        "utf8",
      )
        .split(/\r?\n/)
        .flatMap((line) => {
          try {
            return [
              JSON.parse(line) as {
                event?: string;
                operation?: string;
                httpStatus?: number;
                debugId?: string;
              },
            ];
          } catch {
            return [];
          }
        });
      const posts = lines.filter(
        (e) =>
          e.event === "TASK03G_PAYPAL_API" &&
          e.operation === "CAPTURE_ONE_ORDER",
      );
      const complete =
        order.status === "COMPLETED" &&
        capture?.status === "COMPLETED" &&
        capture.final_capture === true &&
        record.state === "SUCCEEDED" &&
        record.budgetState === "CONSUMED" &&
        record.captureId === capture.id &&
        String(fresh.mandate.reserved_minor) === "0" &&
        String(fresh.mandate.consumed_minor) === "600" &&
        claims === 1 &&
        posts.length === 1;
      const report = {
        observedAt: new Date().toISOString(),
        status: complete
          ? "TASK03G_COMPLETED_VERIFIED"
          : "TASK03G_PARTIAL_RECONCILIATION_REQUIRED",
        orderId: US_ORDER_ID,
        mandateId: US_MANDATE_ID,
        attemptId: record.id,
        paypalOrderStatus: order.status,
        captureId: capture?.id ?? null,
        paypalCaptureStatus: capture?.status ?? null,
        merchantMatched: true,
        amountUsd: unit.amount.value,
        localState: record.state,
        budgetState: record.budgetState,
        authorizedMinor: String(fresh.mandate.cap_minor),
        reservedMinor: String(fresh.mandate.reserved_minor),
        consumedMinor: String(fresh.mandate.consumed_minor),
        availableMinor: (
          BigInt(String(fresh.mandate.cap_minor)) -
          BigInt(String(fresh.mandate.reserved_minor)) -
          BigInt(String(fresh.mandate.consumed_minor))
        ).toString(),
        capturePreparedClaims: claims,
        observedCapturePosts: posts.length,
        captureHttpStatus: posts[0]?.httpStatus ?? null,
        captureDebugId: posts[0]?.debugId ?? null,
        completedLedgerObservations: fresh.audit.filter(
          (e) =>
            e.attempt_id === record.id &&
            e.action === "PAYPAL_STATE_RECONCILED" &&
            e.detail === "COMPLETED",
        ).length,
        originalRowsAndAuditUnchanged: originalPreserved,
        originalReservedMinor: String(original.mandate.reserved_minor),
        ownerIdentityPreserved: ownerPreserved,
        captureRequestIdentityPreserved: true,
        reads,
        paymentMutationRequests: 0,
        databaseReadOnly: true,
      };
      writeFileSync(
        new URL("paypal-us-capture-verification.json", directory),
        JSON.stringify(report, null, 2) + "\n",
        { mode: 0o600 },
      );
      console.log(JSON.stringify(report, null, 2));
      if (!complete) process.exitCode = 1;
      return;
    }
    if (
      m.status !== "ACTIVE" ||
      Date.parse(String(m.expires_at)) <= Date.now() ||
      String(m.reserved_minor) !== "600" ||
      String(m.consumed_minor) !== "0" ||
      !["AWAITING_APPROVAL", "APPROVED"].includes(a.state) ||
      a.budgetState !== "RESERVED" ||
      a.captureId ||
      a.errorCode ||
      claims !== 0 ||
      us.audit.some(
        (e) =>
          e.attempt_id === a.id && e.action === "TASK03G_CAPTURE_AUTHORIZED",
      ) ||
      us.idempotency.some(
        (i) => !["AWAITING_APPROVAL", "APPROVED"].includes(String(i.state)),
      ) ||
      order.status !== "APPROVED" ||
      (unit.payments?.captures?.length ?? 0) !== 0
    )
      throw new PaymentError("CAPTURE_PREFLIGHT_FAILED_STOP_NO_POST");
    const baseline = {
      version: 1,
      ownerId: auth.ownerId,
      appMerchantBinding: binding,
      mandateId: US_MANDATE_ID,
      attemptId: a.id,
      orderId: US_ORDER_ID,
      amountMinor: "600",
      currency: "USD",
      captureRequestId: a.captureRequestId,
      originalDigest: hash(old),
      usPreflightDigest: hash(us),
      ownerAuthDigest: hash(authText),
    };
    if (!execute) {
      if (existsSync(path)) {
        if (hash(JSON.parse(readFileSync(path, "utf8"))) !== hash(baseline))
          throw new PaymentError("CAPTURE_BASELINE_CHANGED_STOP");
      } else
        writeFileSync(path, JSON.stringify(baseline, null, 2) + "\n", {
          mode: 0o600,
          flag: "wx",
        });
      console.log(
        JSON.stringify(
          {
            status: "TASK03G_FRESH_CAPTURE_PREFLIGHT_PASSED",
            orderId: US_ORDER_ID,
            attemptId: a.id,
            approved: true,
            merchantMatched: true,
            amountMinor: "600",
            currency: "USD",
            mandateActiveUnexpired: true,
            expiresAt: m.expires_at,
            reservedMinor: "600",
            consumedMinor: "0",
            priorCaptureClaims: 0,
            originalPreserved: true,
            verifiedOwnerPreserved: true,
            reads,
            paymentMutationRequests: 0,
            databaseReadOnly: true,
          },
          null,
          2,
        ),
      );
      return;
    }
    if (
      !existsSync(path) ||
      hash(JSON.parse(readFileSync(path, "utf8"))) !== hash(baseline)
    )
      throw new PaymentError("EXACT_CAPTURE_BASELINE_REQUIRED");
    const server = JSON.parse(
      readFileSync(new URL("paypal-us-server.json", directory), "utf8"),
    ) as { origin: string; epoch: string; captureOnlyAuthorization: boolean };
    if (
      server.origin !== "http://127.0.0.1:3031" ||
      !server.captureOnlyAuthorization ||
      !/^[a-f0-9]{64}$/.test(server.epoch)
    )
      throw new PaymentError("EXACT_CAPTURE_SERVER_REQUIRED");
    const local = async (endpoint: string, init?: RequestInit) => {
      const response = await fetch(
        `${server.origin}/api/paypal/test${endpoint}`,
        { ...init, redirect: "error", signal: AbortSignal.timeout(180000) },
      );
      if (response.headers.get("x-earmark-test-epoch") !== server.epoch)
        throw new PaymentError("CAPTURE_SERVER_IDENTITY_MISMATCH");
      return response;
    };
    if ((await local("")).status !== 401)
      throw new PaymentError("VERIFIED_OWNER_BOUNDARY_REQUIRED");
    const login = await local("/login", {
      method: "POST",
      headers: { Origin: server.origin, "Content-Type": "application/json" },
      body: JSON.stringify({ password: auth.loginSecret }),
    });
    const cookie = login.headers.get("set-cookie")?.split(";")[0],
      session = (await login.json()) as { csrfToken: string };
    if (!login.ok || !cookie || !session.csrfToken)
      throw new PaymentError("VERIFIED_OWNER_SESSION_REQUIRED");
    // One local submission only; never retry it after a lost/ambiguous response.
    const response = await local("/capture-once", {
      method: "POST",
      headers: {
        Origin: server.origin,
        "Content-Type": "application/json",
        Cookie: cookie,
        "X-Earmark-CSRF": session.csrfToken,
      },
      body: "{}",
    });
    const result = (await response.json()) as { error?: string };
    const after = await snapshot(US_MANDATE_ID),
      oldAfter = await snapshot(ORIGINAL_MANDATE_ID),
      saved = parse(attemptSchema, after.attempts[0]?.record);
    if (hash(oldAfter) !== baseline.originalDigest)
      throw new PaymentError("ORIGINAL_PRESERVATION_REVIEW_REQUIRED");
    const report = {
      observedAt: new Date().toISOString(),
      status:
        response.ok && saved.state === "SUCCEEDED"
          ? "CAPTURE_RECORDED_REQUIRES_INDEPENDENT_VERIFICATION"
          : "CAPTURE_PARTIAL_STOP_RECONCILIATION",
      orderId: US_ORDER_ID,
      captureId: saved.captureId ?? null,
      localState: saved.state,
      budgetState: saved.budgetState,
      reservedMinor: String(after.mandate.reserved_minor),
      consumedMinor: String(after.mandate.consumed_minor),
      originalRowsAndAuditUnchanged: true,
      additionalCapturePostAuthorized: false,
      error:
        result.error && /^[A-Z_]+$/.test(result.error) ? result.error : null,
    };
    writeFileSync(
      new URL("paypal-us-capture-result.json", directory),
      JSON.stringify(report, null, 2) + "\n",
      { mode: 0o600 },
    );
    console.log(JSON.stringify(report, null, 2));
    if (!response.ok || saved.state !== "SUCCEEDED") process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
main().catch((error: unknown) => {
  console.error(
    error instanceof PaymentError
      ? error.code
      : "CAPTURE_OUTCOME_UNCERTAIN_STOP_DO_NOT_RETRY",
  );
  process.exitCode = 1;
});
