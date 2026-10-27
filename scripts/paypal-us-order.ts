import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createDatabase } from "@flint/agent/server";
import { loadPayPalEnvironment } from "./paypal-env";
import {
  approvedPayPalTarget,
  verifyPayPalConnection,
} from "./paypal-db-safety";
import { paypalOAuthSettings } from "../web/src/server/paypal/config";
import { merchantBinding } from "../web/src/server/paypal/test-config";
import { ORIGINAL_MANDATE_ID } from "../web/src/server/paypal/operator-hold";
import {
  US_MANDATE_ID,
  US_ATTEMPT_ID,
  US_PURCHASE_KEY,
} from "../web/src/server/paypal/us-order";
import {
  attemptSchema,
  parse,
  paypalMerchantSchema,
  PaymentError,
} from "../web/src/server/paypal/domain";

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
    (args[0] && !["--create", "--verify"].includes(args[0]))
  )
    throw new PaymentError("INVALID_ONE_ORDER_ARGUMENTS");
  const create = args.includes("--create");
  const verify = args.includes("--verify");
  loadPayPalEnvironment();
  const settings = paypalOAuthSettings(),
    merchant = parse(paypalMerchantSchema, process.env.PAYPAL_MERCHANT_ID);
  const directory = new URL("../.tools/", import.meta.url);
  const authText = readFileSync(
    new URL("paypal-test-auth.json", directory),
    "utf8",
  );
  const auth = JSON.parse(authText) as { ownerId: string; loginSecret: string };
  const profile = JSON.parse(
    readFileSync(new URL("paypal-us-profile.json", directory), "utf8"),
  ) as {
    ownerId: string;
    appMerchantBinding: string;
    dashboardSellerConfirmed: boolean;
  };
  const binding = merchantBinding(settings.clientId, merchant);
  if (
    profile.ownerId !== auth.ownerId ||
    profile.appMerchantBinding !== binding ||
    profile.dashboardSellerConfirmed !== true
  )
    throw new PaymentError("CONFIRMED_US_APP_MERCHANT_REQUIRED");
  const target = approvedPayPalTarget(),
    pool = createDatabase(target.toString());
  async function snapshot(id: string): Promise<Snapshot> {
    const db = await pool.connect();
    db.on("error", () => {});
    try {
      await db.query("BEGIN READ ONLY");
      await verifyPayPalConnection(db, target);
      const result = await db.query<{ data: Snapshot }>(
        `SELECT jsonb_build_object('mandate',to_jsonb(m),
        'attempts',(SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id) FROM earmark_paypal.attempts a WHERE a.mandate_id=m.id),
        'merchants',ARRAY(SELECT merchant_id FROM earmark_paypal.approved_merchants WHERE mandate_id=m.id ORDER BY merchant_id),
        'idempotency',(SELECT jsonb_agg(to_jsonb(i) ORDER BY i.request_id) FROM earmark_paypal.idempotency i JOIN earmark_paypal.attempts a ON a.id=i.attempt_id WHERE a.mandate_id=m.id),
        'audit',(SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id) FROM earmark_paypal.audit e WHERE e.mandate_id=m.id)) AS data
        FROM earmark_paypal.mandates m WHERE m.id=$1 AND m.owner_id=$2`,
        [id, auth.ownerId],
      );
      const row = result.rows[0];
      if (!row) throw new PaymentError("EXISTING_MANDATE_REQUIRED");
      return row.data;
    } finally {
      await db.query("ROLLBACK").catch(() => {});
      db.release();
    }
  }
  try {
    const original = await snapshot(ORIGINAL_MANDATE_ID),
      us = await snapshot(US_MANDATE_ID);
    const raw = us.attempts?.[0];
    if (!raw || us.attempts.length !== 1)
      throw new PaymentError("EXACT_PREPARED_US_ATTEMPT_REQUIRED");
    const a = parse(attemptSchema, raw.record),
      m = us.mandate;
    if (
      a.id !== US_ATTEMPT_ID ||
      a.mandateId !== US_MANDATE_ID ||
      a.ownerId !== auth.ownerId ||
      a.merchantId !== merchant ||
      a.amountMinor !== "600" ||
      a.currency !== "USD" ||
      a.purchaseKey !== US_PURCHASE_KEY ||
      m.status !== "ACTIVE" ||
      Date.parse(String(m.expires_at)) <= Date.now() ||
      String(m.cap_minor) !== "1000" ||
      String(m.reserved_minor) !== "600" ||
      String(m.consumed_minor) !== "0" ||
      m.currency !== "USD" ||
      us.merchants.length !== 1 ||
      us.merchants[0] !== merchant
    )
      throw new PaymentError("US_MANDATE_SCOPE_OR_AUTHORITY_MISMATCH");
    const baselinePath = new URL("paypal-us-order-baseline.json", directory);
    if (verify) {
      const previous = JSON.parse(readFileSync(baselinePath, "utf8")) as {
        originalDigest: string;
        ownerAuthDigest: string;
        appMerchantBinding: string;
      };
      const log = readFileSync(
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
      const posts = log.filter(
        (e) =>
          e.event === "TASK03E_PAYPAL_API" &&
          e.operation === "CREATE_ONE_ORDER",
      );
      const originalUnchanged = previous.originalDigest === hash(original),
        ownerUnchanged = previous.ownerAuthDigest === hash(authText);
      const claims = us.audit.filter(
        (e) => e.attempt_id === a.id && e.action === "CREATE_PREPARED",
      ).length;
      if (
        !originalUnchanged ||
        !ownerUnchanged ||
        previous.appMerchantBinding !== binding ||
        !a.orderId ||
        a.captureId ||
        a.budgetState !== "RESERVED" ||
        a.state !== "AWAITING_APPROVAL" ||
        claims !== 1 ||
        posts.length !== 1 ||
        ![200, 201].includes(posts[0]?.httpStatus ?? 0)
      )
        throw new PaymentError("US_ORDER_VERIFICATION_REQUIRES_REVIEW");
      const report = {
        status: "ONE_US_ORDER_PERSISTED_ORIGINAL_UNCHANGED",
        mandateId: US_MANDATE_ID,
        attemptId: a.id,
        orderId: a.orderId,
        captureId: null,
        creationClaims: claims,
        observedCreatePosts: posts.length,
        createHttpStatus: posts[0]?.httpStatus,
        createDebugId: posts[0]?.debugId,
        reservedMinor: "600",
        capturedMinor: "0",
        availableMinor: "400",
        originalRowsAndAuditUnchanged: originalUnchanged,
        ownerIdentityPreserved: ownerUnchanged,
        createAndCaptureKeysPreserved: us.idempotency.every(
          (i) =>
            i.request_id ===
            (i.operation === "CREATE" ? a.createRequestId : a.captureRequestId),
        ),
        approvalAvailable: !!a.approvalUrl,
        paymentMutationRequests: 0,
        databaseReadOnly: true,
      };
      writeFileSync(
        new URL("paypal-us-order-verification.json", directory),
        JSON.stringify(report, null, 2) + "\n",
        { mode: 0o600 },
      );
      console.log(JSON.stringify(report, null, 2));
      return;
    }
    if (
      a.state !== "RESERVED" ||
      a.budgetState !== "RESERVED" ||
      a.orderId ||
      a.captureId ||
      a.errorCode ||
      a.lastRemoteState ||
      us.idempotency?.length !== 2 ||
      us.idempotency.some(
        (i) =>
          i.state !== "RESERVED" ||
          i.fingerprint !== a.fingerprint ||
          i.request_id !==
            (i.operation === "CREATE" ? a.createRequestId : a.captureRequestId),
      ) ||
      us.audit.some(
        (e) => e.attempt_id === a.id && e.action !== "BUDGET_RESERVED",
      )
    )
      throw new PaymentError("PRIOR_CREATION_OR_AMBIGUITY_STOP_NO_DUPLICATE");
    if (
      original.attempts.some(
        (o) =>
          o.merchant_id === merchant ||
          o.create_request_id === a.createRequestId ||
          o.capture_request_id === a.captureRequestId,
      )
    )
      throw new PaymentError("US_ORIGINAL_IDENTITY_COLLISION");
    const baseline = {
      version: 1,
      mandateId: US_MANDATE_ID,
      attemptId: a.id,
      ownerId: auth.ownerId,
      appMerchantBinding: binding,
      buyerSeparateConfirmed: true,
      buyerConfirmationSource: "EXPLICIT_USER_TASK03E_CONFIRMATION",
      originalDigest: hash(original),
      usPreflightDigest: hash(us),
      ownerAuthDigest: hash(authText),
    };
    if (!create) {
      if (existsSync(baselinePath)) {
        if (
          hash(JSON.parse(readFileSync(baselinePath, "utf8"))) !==
          hash(baseline)
        )
          throw new PaymentError("SAVED_ONE_SHOT_BASELINE_CHANGED_STOP");
      } else
        writeFileSync(baselinePath, JSON.stringify(baseline, null, 2) + "\n", {
          flag: "wx",
          mode: 0o600,
        });
      console.log(
        JSON.stringify(
          {
            status: "EXACT_US_ORDER_PREFLIGHT_PASSED",
            mandateId: US_MANDATE_ID,
            attemptId: a.id,
            activeUnexpired: true,
            merchantMatched: true,
            existingOrderId: null,
            existingCaptureId: null,
            priorCreationEvents: 0,
            idempotencyRowsReserved: 2,
            reservedMinor: "600",
            capturedMinor: "0",
            buyerSeparateHumanConfirmed: true,
            databaseReadOnly: true,
            paypalRequests: 0,
            permission: "ONE_EXACT_PREPARED_ORDER_ONLY_NO_CAPTURE",
          },
          null,
          2,
        ),
      );
      return;
    }
    if (
      !existsSync(baselinePath) ||
      hash(JSON.parse(readFileSync(baselinePath, "utf8"))) !== hash(baseline)
    )
      throw new PaymentError("ONE_SHOT_BASELINE_REQUIRED_STOP");
    const server = JSON.parse(
      readFileSync(new URL("paypal-us-server.json", directory), "utf8"),
    ) as { origin: string; epoch: string; orderOnlyAuthorization: boolean };
    if (
      server.origin !== "http://127.0.0.1:3031" ||
      server.orderOnlyAuthorization !== true ||
      !/^[a-f0-9]{64}$/.test(server.epoch)
    )
      throw new PaymentError("ONE_SHOT_SERVER_PROFILE_REQUIRED");
    const local = async (path: string, init?: RequestInit) => {
      const response = await fetch(`${server.origin}/api/paypal/test${path}`, {
        ...init,
        redirect: "error",
        signal: AbortSignal.timeout(180000),
      });
      if (response.headers.get("x-earmark-test-epoch") !== server.epoch)
        throw new PaymentError("ONE_SHOT_SERVER_IDENTITY_MISMATCH");
      return response;
    };
    if ((await local("")).status !== 401)
      throw new PaymentError("OWNER_AUTH_BOUNDARY_REQUIRED");
    const login = await local("/login", {
      method: "POST",
      headers: { Origin: server.origin, "Content-Type": "application/json" },
      body: JSON.stringify({ password: auth.loginSecret }),
    });
    const cookie = login.headers.get("set-cookie")?.split(";")[0];
    const session = (await login.json()) as { csrfToken: string };
    if (!login.ok || !cookie || !session.csrfToken)
      throw new PaymentError("VERIFIED_OWNER_SESSION_REQUIRED");
    // Exactly one local submission. The server commits its irreversible claim before provider dispatch.
    const result = await local("/order-once", {
      method: "POST",
      headers: {
        Origin: server.origin,
        "Content-Type": "application/json",
        Cookie: cookie,
        "X-Earmark-CSRF": session.csrfToken,
      },
      body: "{}",
    });
    const responseBody = (await result.json()) as { error?: string };
    const afterOriginal = await snapshot(ORIGINAL_MANDATE_ID),
      after = await snapshot(US_MANDATE_ID);
    const order = after.attempts[0];
    const saved = parse(attemptSchema, order?.record);
    const preserved =
      hash(afterOriginal) === baseline.originalDigest &&
      hash(authText) ===
        hash(readFileSync(new URL("paypal-test-auth.json", directory), "utf8"));
    if (!preserved)
      throw new PaymentError("ORIGINAL_PRESERVATION_REVIEW_REQUIRED");
    const report = {
      observedAt: new Date().toISOString(),
      status:
        result.ok && saved.orderId && saved.approvalUrl
          ? "ONE_US_ORDER_RECORDED_AWAIT_HUMAN"
          : "STOP_RECONCILIATION_REQUIRED",
      mandateId: US_MANDATE_ID,
      attemptId: saved.id,
      orderId: saved.orderId ?? null,
      captureId: saved.captureId ?? null,
      state: saved.state,
      lastRemoteState: saved.lastRemoteState ?? null,
      approvalAvailable: !!saved.approvalUrl,
      reservedMinor: String(after.mandate.reserved_minor),
      capturedMinor: String(after.mandate.consumed_minor),
      availableMinor: (
        BigInt(String(after.mandate.cap_minor)) -
        BigInt(String(after.mandate.reserved_minor)) -
        BigInt(String(after.mandate.consumed_minor))
      ).toString(),
      creationClaims: after.audit.filter(
        (e) => e.attempt_id === saved.id && e.action === "CREATE_PREPARED",
      ).length,
      originalRowsAndAuditUnchanged: preserved,
      ownerIdentityPreserved: true,
      captureAuthorized: false,
      buyerApprovalAutomated: false,
      error:
        responseBody.error && /^[A-Z_]+$/.test(responseBody.error)
          ? responseBody.error
          : null,
    };
    writeFileSync(
      new URL("paypal-us-order-result.json", directory),
      JSON.stringify(report, null, 2) + "\n",
      { mode: 0o600 },
    );
    console.log(JSON.stringify(report, null, 2));
    if (report.status !== "ONE_US_ORDER_RECORDED_AWAIT_HUMAN")
      process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
main().catch((error: unknown) => {
  console.error(
    error instanceof PaymentError
      ? error.code
      : "ONE_SHOT_OUTCOME_UNCERTAIN_STOP_DO_NOT_RETRY",
  );
  process.exitCode = 1;
});
