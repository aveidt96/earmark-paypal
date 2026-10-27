import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { createDatabase } from "@flint/agent/server";
import { loadPayPalEnvironment } from "./paypal-env";
import {
  approvedPayPalTarget,
  verifyPayPalConnection,
} from "./paypal-db-safety";
import { ORIGINAL_MANDATE_ID } from "../web/src/server/paypal/operator-hold";
import { PaymentError } from "../web/src/server/paypal/domain";

const hash = (s: string) => createHash("sha256").update(s).digest("hex");
/** Owner-authenticated preparation only; this script cannot contact PayPal. */
async function main() {
  if (process.argv.slice(2).length)
    throw new PaymentError("INVALID_PREPARATION_ARGUMENTS");
  loadPayPalEnvironment();
  const directory = new URL("../.tools/", import.meta.url);
  const authText = readFileSync(
    new URL("paypal-test-auth.json", directory),
    "utf8",
  );
  const auth = JSON.parse(authText) as { ownerId: string; loginSecret: string };
  const server = JSON.parse(
    readFileSync(new URL("paypal-us-server.json", directory), "utf8"),
  ) as {
    origin: string;
    epoch: string;
    preparationOnly: boolean;
    campaign: string;
  };
  if (
    server.origin !== "http://127.0.0.1:3031" ||
    server.preparationOnly !== true ||
    server.campaign !== "us-v1" ||
    !/^[a-f0-9]{64}$/.test(server.epoch)
  )
    throw new PaymentError("US_PREPARATION_SERVER_REQUIRED");
  const read = async (path: string, init?: RequestInit) => {
    const response = await fetch(`${server.origin}/api/paypal/test${path}`, {
      ...init,
      redirect: "error",
      signal: AbortSignal.timeout(30000),
    });
    if (response.headers.get("x-earmark-test-epoch") !== server.epoch)
      throw new PaymentError("US_SERVER_IDENTITY_MISMATCH");
    return response;
  };
  if ((await read("")).status !== 401)
    throw new PaymentError("US_SERVER_AUTH_BOUNDARY_REQUIRED");
  const login = await read("/login", {
    method: "POST",
    headers: { Origin: server.origin, "Content-Type": "application/json" },
    body: JSON.stringify({ password: auth.loginSecret }),
  });
  const logged = (await login.json()) as { csrfToken: string };
  const cookie = login.headers.get("set-cookie")?.split(";")[0];
  if (!login.ok || !cookie || !logged.csrfToken)
    throw new PaymentError("US_OWNER_AUTH_REQUIRED");
  const target = approvedPayPalTarget(),
    pool = createDatabase(target.toString());
  async function original() {
    const db = await pool.connect();
    db.on("error", () => {});
    try {
      await db.query("BEGIN READ ONLY");
      await verifyPayPalConnection(db, target);
      const rows = await db.query<{ financial: unknown; audit: unknown[] }>(
        `SELECT jsonb_build_object('mandate',to_jsonb(m),
        'attempts',(SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id) FROM earmark_paypal.attempts a WHERE a.mandate_id=m.id),
        'merchants',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.merchant_id) FROM earmark_paypal.approved_merchants p WHERE p.mandate_id=m.id),
        'idempotency',(SELECT jsonb_agg(to_jsonb(i) ORDER BY i.request_id) FROM earmark_paypal.idempotency i JOIN earmark_paypal.attempts a ON a.id=i.attempt_id WHERE a.mandate_id=m.id)) AS financial,
        (SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id) FROM earmark_paypal.audit e WHERE e.mandate_id=m.id) AS audit
        FROM earmark_paypal.mandates m WHERE m.id=$1 AND m.owner_id=$2`,
        [ORIGINAL_MANDATE_ID, auth.ownerId],
      );
      const row = rows.rows[0];
      if (!row) throw new PaymentError("ORIGINAL_CHECKOUT_REQUIRED");
      return row;
    } finally {
      await db.query("ROLLBACK").catch(() => {});
      db.release();
    }
  }
  try {
    const before = await original();
    let snapshot: Record<string, unknown> = {};
    for (const action of ["hold-original", "mandate", "reserve"]) {
      const response = await read(`/${action}`, {
        method: "POST",
        headers: {
          Origin: server.origin,
          "Content-Type": "application/json",
          Cookie: cookie,
          "X-Earmark-CSRF": logged.csrfToken,
        },
        body: "{}",
      });
      const result = (await response.json()) as Record<string, unknown>;
      if (!response.ok)
        throw new PaymentError(
          typeof result.error === "string" && /^[A-Z_]+$/.test(result.error)
            ? result.error
            : "US_PREPARATION_FAILED",
        );
      snapshot = result;
    }
    const after = await original();
    const mandate = snapshot.mandate as { id: string; expired: boolean };
    const attempt = snapshot.attempt as {
      id: string;
      state: string;
      orderId: string | null;
      captureId: string | null;
    };
    if (
      !mandate ||
      !attempt ||
      mandate.expired ||
      attempt.state !== "RESERVED" ||
      attempt.orderId ||
      attempt.captureId ||
      snapshot.preparationOnly !== true ||
      snapshot.executionEnabled !== false ||
      snapshot.reservedMinor !== "600" ||
      snapshot.capturedMinor !== "0"
    )
      throw new PaymentError("US_PREPARED_STATE_REQUIRES_REVIEW");
    const check = await pool.query<{
      isolated: boolean;
      original_reserved: string;
      combined_reserved: string;
      combined_captured: string;
    }>(
      `SELECT (n.merchant_id<>o.merchant_id AND n.create_request_id<>o.create_request_id
       AND n.capture_request_id<>o.capture_request_id AND n.purchase_key<>o.purchase_key AND n.mandate_id<>o.mandate_id
       AND n.record->>'ownerId'=o.record->>'ownerId') AS isolated,
       om.reserved_minor::text AS original_reserved,
       (om.reserved_minor+nm.reserved_minor)::text AS combined_reserved,
       (om.consumed_minor+nm.consumed_minor)::text AS combined_captured
       FROM earmark_paypal.attempts n JOIN earmark_paypal.mandates nm ON nm.id=n.mandate_id
       JOIN earmark_paypal.attempts o ON o.mandate_id=$1
       JOIN earmark_paypal.mandates om ON om.id=o.mandate_id WHERE n.id=$2`,
      [ORIGINAL_MANDATE_ID, attempt.id],
    );
    const financialUnchanged =
      hash(JSON.stringify(before.financial)) ===
      hash(JSON.stringify(after.financial));
    const auditPreserved = before.audit.every((row) =>
      after.audit.some(
        (saved) => JSON.stringify(saved) === JSON.stringify(row),
      ),
    );
    const ownerUnchanged =
      hash(authText) ===
      hash(readFileSync(new URL("paypal-test-auth.json", directory), "utf8"));
    if (
      !financialUnchanged ||
      !auditPreserved ||
      !ownerUnchanged ||
      check.rows.length !== 1 ||
      check.rows[0]?.isolated !== true
    )
      throw new PaymentError("US_PREPARATION_PRESERVATION_CHECK_FAILED");
    const report = {
      observedAt: new Date().toISOString(),
      status: "US_MANDATE_AND_RESERVATION_PREPARED_NO_ORDER",
      url: `${server.origin}/paypal-test`,
      mandateId: mandate.id,
      attemptId: attempt.id,
      orderId: null,
      captureId: null,
      authorizedMinor: snapshot.authorizedMinor,
      reservedMinor: snapshot.reservedMinor,
      capturedMinor: snapshot.capturedMinor,
      availableMinor: snapshot.availableMinor,
      authenticatedOwner: true,
      distinctMerchantMandatePurchaseAndRequestIds: true,
      originalFinancialRowsUnchanged: financialUnchanged,
      originalAuditHistoryPreserved: auditPreserved,
      originalAuditEntriesAdded: after.audit.length - before.audit.length,
      preservedOwnerAuthFile: ownerUnchanged,
      originalReservationRetainedMinor: check.rows[0]?.original_reserved,
      combinedReservedMinor: check.rows[0]?.combined_reserved,
      combinedCapturedMinor: check.rows[0]?.combined_captured,
      paymentExecutionEnabled: false,
      paypalRequestsFromPreparationScript: 0,
    };
    writeFileSync(
      new URL("paypal-us-prepared.json", directory),
      JSON.stringify(report, null, 2) + "\n",
      { mode: 0o600 },
    );
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await pool.end();
  }
}
main().catch((error: unknown) => {
  console.error(
    error instanceof PaymentError ? error.code : "US_PREPARATION_UNAVAILABLE",
  );
  process.exitCode = 1;
});
