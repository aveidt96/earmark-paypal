import { readFileSync, writeFileSync } from "node:fs";
import { createDatabase } from "@flint/agent/server";
import { loadPayPalEnvironment } from "./paypal-env";
import {
  approvedPayPalTarget,
  verifyPayPalConnection,
} from "./paypal-db-safety";
import { PayPalClient } from "../web/src/server/paypal/client";
import { paypalOAuthSettings } from "../web/src/server/paypal/config";
import { merchantBinding } from "../web/src/server/paypal/test-config";
import {
  parse,
  paypalMerchantSchema,
  PaymentError,
} from "../web/src/server/paypal/domain";

const oldMandateId = "8fb8ada6-ad12-5bc8-ac4c-90e6a07ed064";
const oldOrderId = "9N317079B4816951W";
const safeCode = (value: unknown) =>
  typeof value === "string" && /^[A-Z][A-Z0-9_]{1,100}$/.test(value)
    ? value
    : null;
const object = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== "--confirm-us-seller"))
    throw new PaymentError("INVALID_PREFLIGHT_ARGUMENTS");
  loadPayPalEnvironment();
  const settings = paypalOAuthSettings();
  const merchant = parse(paypalMerchantSchema, process.env.PAYPAL_MERCHANT_ID);
  const auth = JSON.parse(
    readFileSync(
      new URL("../.tools/paypal-test-auth.json", import.meta.url),
      "utf8",
    ),
  ) as { ownerId: string; merchantBinding: string };
  const target = approvedPayPalTarget(),
    pool = createDatabase(target.toString());
  let old: Record<string, unknown>;
  try {
    const db = await pool.connect();
    db.on("error", () => {});
    try {
      await db.query("BEGIN READ ONLY");
      await verifyPayPalConnection(db, target);
      const result = await db.query<Record<string, unknown>>(
        `SELECT m.owner_id,m.reserved_minor::text,m.consumed_minor::text,a.merchant_id,a.id,a.order_id,a.state,a.budget_state
        FROM earmark_paypal.mandates m JOIN earmark_paypal.attempts a ON a.mandate_id=m.id
        WHERE m.id=$1 AND a.order_id=$2`,
        [oldMandateId, oldOrderId],
      );
      const row = result.rows[0];
      if (!row || result.rows.length !== 1 || row.owner_id !== auth.ownerId)
        throw new PaymentError("ORIGINAL_CHECKOUT_BINDING_REQUIRED");
      old = row;
    } finally {
      await db.query("ROLLBACK").catch(() => {});
      db.release();
    }
  } finally {
    await pool.end();
  }
  if (
    old.merchant_id === merchant ||
    auth.merchantBinding === merchantBinding(settings.clientId, merchant) ||
    auth.merchantBinding ===
      merchantBinding(settings.clientId, String(old.merchant_id))
  )
    throw new PaymentError("DISTINCT_NEW_APP_AND_MERCHANT_REQUIRED");
  const requests: Record<string, unknown>[] = [];
  let grantedPaymentScope = false;
  let grantedOrdersScope = false;
  const client = new PayPalClient(settings, {
    fetch: async (input, init) => {
      if (
        String(input) !== `${settings.baseUrl}/v1/oauth2/token` ||
        init?.method !== "POST"
      )
        throw new PaymentError("PREFLIGHT_TRANSPORT_FORBIDDEN");
      const response = await fetch(input, init);
      const grant = object(
        await response
          .clone()
          .json()
          .catch(() => ({})),
      );
      const scopes =
        typeof grant.scope === "string" ? grant.scope.split(/\s+/) : [];
      grantedPaymentScope = scopes.includes(
        "https://uri.paypal.com/services/payments/payment",
      );
      grantedOrdersScope = scopes.includes(
        "https://uri.paypal.com/services/payments/orders/client",
      );
      requests.push({
        operation: "NEW_APP_OAUTH",
        httpStatus: response.status,
        debugId: response.headers.get("paypal-debug-id"),
      });
      return response;
    },
  });
  const token = await client.accessToken();
  const response = await fetch(
    `${settings.baseUrl}/v1/identity/openidconnect/userinfo?schema=openid`,
    {
      method: "GET",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    },
  );
  const identity = object(await response.json().catch(() => ({})));
  requests.push({
    operation: "NEW_APP_USERINFO",
    httpStatus: response.status,
    debugId: response.headers.get("paypal-debug-id"),
    error: safeCode(identity.name) ?? safeCode(identity.error),
  });
  // Only an explicit account identifier is evidence; app_id/sub/user_id are not guessed to be merchant IDs.
  const sellerId =
    typeof identity.payer_id === "string"
      ? identity.payer_id
      : typeof identity.merchant_id === "string"
        ? identity.merchant_id
        : identity.user_id === merchant
          ? merchant
          : undefined;
  const oldCredentialPrefix = ["PAYPAL_ORIGINAL", "PAYPAL_OLD"].find(
    (prefix) =>
      process.env[`${prefix}_CLIENT_ID`] &&
      process.env[`${prefix}_CLIENT_SECRET`] &&
      process.env[`${prefix}_MERCHANT_ID`] === old.merchant_id,
  );
  let oldRead: Record<string, unknown> = {
    attempted: false,
    reason: "ORIGINAL_CREDENTIALS_NOT_CONFIGURED",
  };
  if (oldCredentialPrefix) {
    const original = paypalOAuthSettings({
      ...process.env,
      PAYPAL_CLIENT_ID: process.env[`${oldCredentialPrefix}_CLIENT_ID`],
      PAYPAL_CLIENT_SECRET: process.env[`${oldCredentialPrefix}_CLIENT_SECRET`],
    });
    if (
      merchantBinding(original.clientId, String(old.merchant_id)) !==
      auth.merchantBinding
    )
      throw new PaymentError("ORIGINAL_APP_BINDING_MISMATCH");
    const originalClient = new PayPalClient(original, {
      fetch: async (input, init) => {
        const url = String(input);
        if (!(
          (url === `${settings.baseUrl}/v1/oauth2/token` &&
            init?.method === "POST") ||
          (url === `${settings.baseUrl}/v2/checkout/orders/${oldOrderId}` &&
            init?.method === "GET")
        ))
          throw new PaymentError("ORIGINAL_READ_TRANSPORT_FORBIDDEN");
        const result = await fetch(input, init);
        const body = object(
          await result
            .clone()
            .json()
            .catch(() => ({})),
        );
        requests.push({
          operation:
            init?.method === "GET" ? "ORIGINAL_ORDER_GET" : "ORIGINAL_OAUTH",
          httpStatus: result.status,
          debugId: result.headers.get("paypal-debug-id"),
          error: safeCode(body.name),
        });
        return result;
      },
    });
    try {
      const order = await originalClient.getOrder(oldOrderId);
      oldRead = {
        attempted: true,
        status: order.status,
        merchantMatched:
          order.purchase_units[0]?.payee.merchant_id === old.merchant_id,
      };
    } catch (error) {
      oldRead = {
        attempted: true,
        error:
          error instanceof PaymentError
            ? error.code
            : "ORIGINAL_READ_UNAVAILABLE",
        disposition: "UNRESOLVED_RESERVATION_RETAINED",
      };
    }
  }
  const report = {
    observedAt: new Date().toISOString(),
    sandboxOnly: true,
    requests,
    oauthVerified: true,
    appMerchantBinding: merchantBinding(settings.clientId, merchant),
    newMerchantDistinctFromOriginal: true,
    newClientIdDistinctFromOriginal: true,
    savedOwnerMatchesOriginal: true,
    sellerIdentityApi: {
      supportedWithCurrentToken: response.ok && !!sellerId,
      merchantMatched: sellerId ? sellerId === merchant : null,
      returnedFieldNames: Object.keys(identity),
      userIdExactMerchantMatch: identity.user_id === merchant,
      accountType: ["BUSINESS", "PERSONAL"].includes(
        String(identity.account_type),
      )
        ? identity.account_type
        : null,
      country: object(identity.address).country === "US" ? "US" : null,
    },
    receivingCapabilities: {
      oauthPaymentScopeGranted: grantedPaymentScope,
      oauthOrdersClientScopeGranted: grantedOrdersScope,
      verified: false,
      reason:
        "CLIENT_CREDENTIALS_OAUTH_IS_NOT_RECEIVING_ELIGIBILITY; NO_PARTNER_STATUS_INTEGRATION_CONFIGURED",
    },
    original: {
      mandateId: oldMandateId,
      orderId: oldOrderId,
      state: old.state,
      budgetState: old.budget_state,
      reservedMinor: old.reserved_minor,
      capturedMinor: old.consumed_minor,
      credentialRead: oldRead,
    },
    originalCredentialVariableNamesPresent: Object.keys(process.env).filter(
      (key) => /^PAYPAL_(?:OLD|ORIGINAL)_/.test(key),
    ),
    paymentMutationRequests: 0,
    databaseReadOnly: true,
  };
  writeFileSync(
    new URL("../.tools/paypal-us-preflight.json", import.meta.url),
    JSON.stringify(report, null, 2) + "\n",
    { mode: 0o600 },
  );
  if (args.includes("--confirm-us-seller")) {
    if (sellerId && sellerId !== merchant)
      throw new PaymentError("US_SELLER_IDENTITY_MISMATCH");
    writeFileSync(
      new URL("../.tools/paypal-us-profile.json", import.meta.url),
      JSON.stringify(
        {
          version: 1,
          campaign: "us-v1",
          ownerId: auth.ownerId,
          appMerchantBinding: report.appMerchantBinding,
          dashboardSellerConfirmed: true,
          confirmationSource: "EXPLICIT_HUMAN_DASHBOARD_CONFIRMATION",
          country: "US",
          apiMerchantIdentityVerified:
            report.sellerIdentityApi.merchantMatched === true,
          receivingEligibilityVerified: false,
          confirmedAt: new Date().toISOString(),
        },
        null,
        2,
      ) + "\n",
      { mode: 0o600, flag: "wx" },
    );
  }
  console.log(JSON.stringify(report, null, 2));
}
main().catch((error: unknown) => {
  console.error(
    error instanceof PaymentError
      ? error.code
      : "US_SANDBOX_PREFLIGHT_UNAVAILABLE",
  );
  process.exitCode = 1;
});
