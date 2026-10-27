# Task 03C — controlled first Sandbox checkout

Session: **2026-10-26**. Status: **PARTIAL — implementation and real order creation
verified; human buyer approval and actual capture remain pending.**

**Latest diagnostic supersedes the approval handoff below:** after the human saw
a merchant rejection, Orders v2 GET returned HTTP 404 `RESOURCE_NOT_FOUND` /
`INVALID_RESOURCE_ID`. Current remote status is unavailable; the earlier
`PAYER_ACTION_REQUIRED` result is historical. Pause approval/capture attempts and
follow the [read-only merchant rejection diagnosis](paypal-merchant-rejection-report.md).
The $6 reservation remains intact; no replacement order is authorized.

## Actual Sandbox result

- Local interface: `http://127.0.0.1:3030/paypal-test`.
- Mandate ID: `8fb8ada6-ad12-5bc8-ac4c-90e6a07ed064`.
- Actual PayPal Sandbox order: **`9N317079B4816951W`**.
- Authoritative PayPal GET status: **`PAYER_ACTION_REQUIRED`**.
- PayPal purchase amount/currency: **6.00 USD**, with matching immutable attempt
  references and matching configured merchant.
- Buyer approval: **not completed/verified**.
- Capture ID/status: **none**. No capture request was sent by this session.

Independent read-only Neon/PayPal evidence:

| Accounting                    | Current value                    |
| ----------------------------- | -------------------------------- |
| Mandate authorized cap        | **$10.00 USD**                   |
| Requested purchase            | **$6.00 USD**                    |
| Reserved/held                 | **$6.00 USD**                    |
| Captured spending             | **$0.00 USD**                    |
| Available budget              | **$4.00 USD**                    |
| Local payment state           | `AWAITING_APPROVAL` / `RESERVED` |
| End-to-end objective complete | **false**                        |

The $4 available amount reflects a held $6 reservation, not a completed payment.
The required final $6 captured / $4 remaining result is **not claimed**. The
read-only status command checks actual PayPal order/capture data against the
immutable attempt and reads the persisted accounting; it never approves,
captures, updates or reconciles records.

## Exact remaining human action

1. Open **http://127.0.0.1:3030/paypal-test** using that exact host/port.
2. Read **`loginSecret`** locally from the ignored
   **`.tools/paypal-test-auth.json`** file and enter it in the test-owner password
   form. Do not share the file/value. No owner ID or agent ID is entered.
3. Use **Approve with PayPal Sandbox** for the already-created order above.
4. Complete approval on PayPal's official Sandbox interface using a **Sandbox
   Personal buyer account**, not the seller Business account. The application
   never receives the buyer password and no automation performs this approval.
5. On return, click **Verify buyer approval**. The server must read `APPROVED`
   from PayPal; return URL parameters cannot grant approval.
6. Explicitly click **Capture approved $6**. The server rechecks authorization and
   approval, sends the single durable capture intent and validates a canonical
   capture GET before consuming the reservation.
7. If PayPal says PENDING or a response is ambiguous, use **Reconcile authoritative
   status**; do not start a new purchase or blindly retry capture. Only a matching
   COMPLETED capture may show $6 captured, $0 held, $4 available.

The local server remains running for this handoff. Its owned process/origin/epoch
metadata is in `.tools/paypal-test-server.json` and its private startup log is
`.tools/paypal-test-server.log`. Sessions last 30 minutes; re-login keeps the same
durable owner/campaign/intent. Keep the ignored auth file so server restarts do not
discard that local identity. Do not create a new test identity to retry uncertainty.

### 2026-10-27 continuation check

Fresh `npm run paypal:test:status` again confirmed the existing order is
`PAYER_ACTION_REQUIRED`, merchant matched, with $6 held, $0 captured, $4 available
and `objectiveComplete=false`. It performed zero payment mutations and used a
read-only database transaction. The first status invocation hit the tool timeout;
the standalone retry succeeded.

The prior local server was no longer reachable. Restarted with the existing saved
owner using `node --conditions=react-server --import tsx scripts/paypal-test-serve.ts --detach`;
the launcher's epoch/authentication readiness check passed and `/paypal-test`
returned HTTP 200. Existing sessions need a new login after restart; the durable
owner, mandate and order remain the same. Buyer approval and capture are still
pending. Test totals below describe the previous session, not fresh test runs.

## Preflight and seller validation

Sandbox credentials and a valid-format merchant ID were already locally
configured. The user explicitly confirmed it is the Business seller account
associated with the REST app. The test client creates an order with **no supplied
payee**, selecting PayPal's credential-owned default seller, and checks the actual
returned/canonical order payee against that server configuration before exposing
approval or allowing capture. The real order passed that check.

The dedicated Neon database passed read-only identity/TLS/Sandbox/version/checksum
and actual structure checks before execution, with no original Earmark markers.
No migration was changed/applied and no unrelated objects were altered. Real
checkout writes are confined to the approved `earmark_paypal` Sandbox ledger.

Webhook ID remains **unset**. No fake webhook was registered or supplied. Manual
checkout settings require the real seller but not a fabricated webhook ID;
signature ingress/full webhook settings remain strict. This milestone uses
authenticated direct PayPal order/capture reads, not a claim of tested webhook delivery.

## Verified owner authentication

This is a **local test-owner mechanism**, not a production SSO system:

- The operator launcher binds Next.js only to `127.0.0.1:3030`. The route is disabled
  in normal profiles and rejects hosted AWS/Vercel execution and non-loopback origin
  configuration.
- A random allowlisted owner ID, 256-bit login secret and separate session-signing
  key are generated only into ignored `.tools/paypal-test-auth.json` (0600 where
  supported). No values are printed, embedded into browser code or committed.
- Password verification uses constant-time comparison and a bounded local login
  attempt limiter. The browser supplies only a password, never an owner/agent/role.
- Sessions are HMAC-signed, HttpOnly, host-only, SameSite=Lax, 30-minute expiry;
  HTTPS uses Secure. A per-server epoch invalidates prior-server cookies, and
  logout revokes the current session.
- Server verifies the exact incoming Host authority, exact Origin for every POST,
  and session-bound CSRF header for mutations. The Host check intentionally handles
  Next.js internal URL normalization without trusting a client-selected identity.
- Principal is always derived from the verified allowlisted session; forged
  cookies, unallowlisted owners, body identity overrides and missing CSRF fail
  before the database or PayPal client initializes.

The separate PayPal buyer approval is not replaced by this owner authentication.
Loopback HTTP is intentional for this local test only; this auth mechanism is not
enabled as an internet-facing production login.

## Checkout implementation and invariants

Authenticated API prefix: `/api/paypal/test`:

- `GET`: consistent saved snapshot (one MVCC SQL statement for counters/attempt).
- `POST /login`, `/logout`: verified test-owner session lifecycle.
- `POST /mandate`: existing policy engine + transactional store, fixed $10 USD cap,
  $6 per-transaction limit, approved configured merchant and 24-hour expiry.
- `POST /reserve`, `/order`: fixed $6 USD, server agent/owner/campaign and durable
  purchase key; no frontend policy or request-ID overrides.
- `POST /approval`, `/capture`: authenticated PayPal approval verification and
  owner-invoked capture; current mandate and actual approval revalidated.
- `POST /recover`: read-only PayPal reconciliation; an optional operator-located
  order hint still requires every immutable binding to match trusted API data.
- `POST /cancel`: releases only an unsent reservation. After order creation it
  revokes new authority and preserves obligations until trusted resolution; it
  never pretends a frontend cancel URL is a PayPal void/refund.

One deterministic server campaign UUID binds one mandate to the allowlisted owner;
the existing SQL primary key handles concurrent creation. Repeated requests,
refreshes, re-login and server restart cannot reset the cap or create new purchase
keys. Existing atomic reservations, journals and idempotency are reused.
Financial POSTs are not blindly retried. A failed canonical capture GET after POST
is ambiguous and retains the reservation. Terminal records and consumed history
remain immutable.

The separate glass/theme-based interface displays all requested fields and treats
approval/cancel URLs as hints only. No autonomous agent payment tool was added.

## Security/regression results

- PayPal mock coverage: **167 passed**, including **34 new auth/checkout cases**.
- Real PostgreSQL: **10 passed** in disposable owner/OID-checked schemas; includes
  two new concurrent fixed-campaign/restart/cancellation cases. Persistent demo
  records are never test cleanup targets.
- Full database-enabled regression: Solidity **176 passed**, web **349 passed**;
  an inherited Anvil receipt wait timed out once in the agent suite. The unmodified
  entire agent suite passed **140** on a sequential retry, with no weakened
  assertions/timeouts.
- A subsequent Host-normalization regression case passed in the full PayPal
  focused rerun. Across the full run and targeted reruns, latest distinct workspace
  coverage is **667 passed**: 176 Solidity + 140 agent + 340 ordinary web + 10 real
  PostgreSQL + 1 real OAuth.
- Real OAuth positive check passed again (HTTP 200 grant/refresh); credential
  failures remain mocked. Adding **25 ancillary script cases** to that workspace
  total gives **692 distinct passing cases** overall. Five legacy Monad
  PostgreSQL cases were intentionally not connected/run. The database profile's
  sixth skip was OAuth, exercised separately, not counted twice.
- Agent/web/API TypeScript, strict operational-script TypeScript, Biome warnings-as-
  errors, Foundry formatting, production build and complete formatting passed.
- New mocked checkout browser smoke passed login, fixed amounts, untrusted return,
  approval gate, pending/recovery, $4 projection and mobile layout; screenshots
  are explicitly watermarked **MOCKED UI TEST ONLY — NOT PAYMENT EVIDENCE**.
- Read-only existing application smoke passed eight routes including `/paypal-test`.
- Actual local owner UI read-only check showed AWAITING_APPROVAL, $0 captured,
  $6 held, no horizontal mobile overflow and no browser errors. No PayPal approval
  or capture control was clicked.
- Source/browser credential scans include actual PayPal credentials, encoded Basic
  pair and generated test login/session secrets; zero matches. Browser-variable
  boundary passed for **47 production chunks**. Private env/auth files remain ignored.
- Dependency audit: zero vulnerabilities. Original HEAD/refs/status/diff and **305
  hashes** still match.

Initial strict CSS-module typing and two lint warnings were fixed without weakening
settings. Local startup originally stopped before order creation because Next.js
normalized its URL authority; the corrected exact Host + Origin/CSRF guard passed
unit and actual HTTP checks. Initial actual-UI inspection failed with sanitized
output; a safe staged rerun passed. No initial startup attempt created an order.
No test failure was hidden. Inherited Solidity compiler notices remain unchanged.

## File changes

- Added `web/src/server/paypal/test-config.ts`, `test-auth.ts`, `test-checkout.ts`,
  `test-runtime.ts`, `test-http.ts` for isolated settings/auth/workflow/HTTP handling.
- Added `web/src/app/paypal-test/page.tsx`,
  `web/src/app/api/paypal/test/route.ts` and `[action]/route.ts`.
- Added `web/src/components/paypal-test.tsx` and `paypal-test.module.css`.
- Updated `web/src/server/paypal/config.ts`, `client.ts`, `postgres.ts` for strict
  no-webhook manual checkout, credential-owned seller/return URLs, consistent reads.
- Added `scripts/paypal-test-serve.ts`, `paypal-test-create.ts`,
  `paypal-test-status.ts`, `paypal-test-ui.mjs`; updated `package.json` commands.
- Added `web/test/fixtures/paypal-checkout.ts`, `web/test/paypal-test-auth.test.ts`,
  `web/test/paypal-test-checkout.test.ts`; extended
  `web/test/paypal-database.integration.test.ts`.
- Updated `scripts/preview-smoke.mjs`, `scripts/paypal-secret-check.ts` and
  `scripts/check-web-boundary.mjs` for the route and local auth secret boundaries.
- Updated `web/src/app/layout.tsx` copy/metadata, `AGENTS.md`, `README.md`,
  `.env.example`, `docs/paypal-backend.md`, `docs/paypal-integration.md` and
  `HANDOFF-PAYPAL.md`; added this report.
- Ignored local auth/server/order/status JSON, startup log, actual-awaiting and
  watermarked mocked-UI screenshots were generated in `.tools/`; no credentials
  or buyer data are in source/reports. Local credential values were not edited.

## Commands and next milestone

```powershell
# Already running locally. Restart with the same ignored owner identity if needed:
npm run paypal:test:serve

# Read-only actual Neon + PayPal evidence, never a payment operation:
npm run paypal:test:status

# Verification tools:
npm run paypal:test:ui
npm run paypal:test:db:all
npm run paypal:secrets:check
```

Do not restart a second server while port 3030 is occupied, delete the owner file,
create a new identity or new intent to retry uncertainty. Preserve journals and
use recovery. First-time seller confirmation is explicit (`--confirm-merchant`)
and bound to the configured app/merchant fingerprint, never an invented ID.

Next milestone: **human approval, canonical actual capture confirmation, and
persisted $6 spending/$4 available evidence to finish Task 03C**. Then consider
genuine webhook delivery, broader owner authentication and checkout deployment
in separately authorized tasks. No real-money payment, PayPal Live call,
deployment, original-resource modification, commit or push occurred.
