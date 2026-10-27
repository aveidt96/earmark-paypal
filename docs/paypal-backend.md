# Task 02 — PayPal Sandbox backend foundation

Backend implemented in Task 02: **2026-10-25**. That milestone used mocks and did
not apply the schema. **Task 03A applied the approved migration and passed eight
real PostgreSQL cases on 2026-10-26.** See
[the applied-database report](task-03a-database-report.md) for current evidence.
**Task 03B additionally verified real Sandbox OAuth app authentication, cache reuse
and simulated-expiry refresh (HTTP 200).** See
[the OAuth report](task-03b-oauth-report.md). No deployment or actual PayPal payment
has been performed. Mocked financial responses remain no proof of a real payment flow.

**Task 03C implemented and created the first controlled real Sandbox order at
`/paypal-test`; buyer approval/capture are pending human action.** Follow
[the partial checkout report](task-03c-checkout-report.md) before resuming the
existing $10/$6 intent. Order creation is not proof of capture success.

## Architecture

The existing Next.js UI, EVM authorization/escrow, Gemini adapters and tools are
preserved. New server-only modules under `web/src/server/paypal/` provide:

- `domain.ts`: strict proposal/mandate/attempt schemas, exact integer money and
  explicit decimal conversion. Supported currencies: USD/EUR/GBP/CAD/AUD (two
  decimal places) and JPY (zero). Values are canonical strings up to 18 digits;
  arithmetic uses `bigint`, never floating-point money.
- `policy.ts`: provider-neutral ownership, authenticated agent identity, active
  status, expiry, merchant allowlist, currency, per-transaction and cumulative
  spending checks. Mandates are owner-created; model proposals cannot override
  policy fields or supply authenticated caller context.
- `repository.ts`: transactional repository contract, immutable terms, ledger and
  terminal-state checks, reservation consumption/release semantics.
- `postgres.ts`: isolated persistent adapter, using the existing direct-Neon `pg`
  pool utility but never its legacy migration or environment binding.
- `config.ts` / `client.ts`: Sandbox-only OAuth/Orders/capture/signature transport.
- `service.ts`: durable pre-request journals, manual owner-invoked order/capture
  operations, trusted provider observation and read-only recovery.
- `webhooks.ts`: verified durable event inbox, deduplication and read-only
  reconciliation; `runtime.ts` lazily composes the configured services.
- `http.ts` and `web/src/app/api/paypal/webhooks/route.ts`: bounded JSON ingress,
  sanitized errors and a Node-only Next.js webhook route.

No new dependencies were added. The original agent runtime still has its original
tools; these methods are not exposed to Gemini, Qwen or model tool dispatch.

## Authentication and entrypoints

`Principal` is **trusted server context** `{ ownerId, subjectId, role }`, to be
constructed by a verified authentication adapter, not copied from browser/model
JSON. The loopback test route now supplies that context through an allowlisted
server-verified login/HMAC session; a general production identity adapter remains
future work. Proposal schemas reject additional identity/policy fields. Owner methods
require `subjectId === ownerId`; agent reservations require the exact designated
agent and owner scope. Existing EIP-712 launch signatures retain their original EVM
domain and are not silently repurposed as PayPal customer consent.

General/autonomous payment routes remain unwired. The isolated `/api/paypal/test`
actions are authenticated, origin/CSRF-protected and fixed to one $10/$6 campaign,
with normal/hosted profiles disabled. Other future integrations must authenticate
requests before calling:

- `createMandate(owner, policy)`, `revokeMandate(owner, mandateId)`.
- `reserve(principal, proposal)` (policy/budget reservation only).
- `createOrder(owner, proposal)`, `capture(owner, attemptId)`.
- `cancelReservation(owner, attemptId)` only before dispatch.
- `reconcileWithOrderId(owner, attemptId, orderId)` for explicitly located,
  previously ambiguous orders; full trusted GET binding checks still apply.

Webhook ingress is `POST /api/paypal/webhooks`. It requires PayPal's
verified signature, not a caller-provided owner identity. Anonymous preparation
status remains at `GET /api/integrations/paypal` and never checks credentials or
database connectivity. `backendImplemented` is true; `sandboxVerified` remains
false. Legacy `paymentsImplemented`/`paymentsEnabled` fields still describe the
unwired primary-workspace/agent financial paths and remain false; the separate
test checkout reports its own authenticated state.

## Isolated schema and atomic ledger

Version-controlled migration: `database/paypal/001_sandbox.sql`. Everything lives
in the **`earmark_paypal` schema**, with no alterations to original `public.earmark_*`
Monad tables:

- `schema_migrations`: applied version/checksum history.
- `environment`: immutable Sandbox/version binding.
- `mandates`: owner/agent, currency, cap/per-transaction limit, expiry, lifecycle,
  exact `numeric(20,0)` reserved and consumed counters.
- `approved_merchants`: per-mandate approved identifiers.
- `attempts`: immutable intent/merchant/amount/currency and stable create/capture
  request IDs; unique PayPal order/capture IDs, lifecycle and budget resolution.
- `idempotency`: operation-specific request identity, fingerprint and journal state.
- `webhook_events`: verified metadata/digest, processing state, attempts, bounded
  exponential retry timing and safe diagnostic code. Full payer payloads are not
  persisted here.
- `audit`: append-only mandate/payment transition records, without keys/tokens.

Every reservation, release, consumption and revocation first locks the same
mandate row using `SELECT ... FOR UPDATE`. The attempt and idempotency rows,
counters and audit entry commit together. No PayPal HTTP call runs under that
transaction lock. Numeric CHECK constraints enforce nonnegative balances and
`reserved + consumed <= cap`; deferred triggers also reconcile those counters to
the sum of attempt budget states at commit. Database triggers protect policy,
payment identities, terminal states and audit history. Runtime JSON records are
validated and tied to their normalized SQL columns.

Database time is refreshed after acquiring row locks so contention cannot make
expiry checks use a pre-lock timestamp. Financial-claim triggers independently
check activity/expiry. Existing attempts use UPDATE rather than INSERT/upsert so
the new-row lifecycle guard cannot accidentally block valid transitions.

Application operation claims (`CREATING` / `CAPTURING`) are committed **before**
external dispatch. Other processes observe those durable claims and cannot issue
a second financial operation. A crash does not grant a new request identity.

### Migration commands

```powershell
# Offline plan/checksum only; does not connect to a database:
npm run paypal:db:plan

# Verify the installed schema without changing data:
npm run paypal:db:verify
```

The script uses only `PAYPAL_DATABASE_URL` and `PAYPAL_DATABASE_ENVIRONMENT=sandbox`;
it does not fall back to legacy `DATABASE_URL*` or `.neon`. Both migration and
runtime binding checks refuse a database containing the legacy Monad environment
table. Migration application is transactional, advisory-locked and checksummed.
It is not run automatically by Next.js or CI. Task 03A applied the approved initial
migration using the runner's `--apply` mode. The runner pins the approved checksum,
revalidates identity/TLS on its connection and refuses an existing namespace;
do not reapply it. Future schema changes need new versioned migrations/approval.

### 2026-10-26 — local Neon readiness inspection

This is the historical pre-migration inspection. Task 03A subsequently applied
the schema and verified real PostgreSQL behavior; see the current database report
linked at the top of this guide.

Next.js correctly loads server variables from **`web/.env.local`**. The required
database variables are **`PAYPAL_DATABASE_URL`** (direct/unpooled Neon connection)
and **`PAYPAL_DATABASE_ENVIRONMENT=sandbox`**. The existing pooled `DATABASE_URL`
is not used by this PayPal backend. Both local env paths are ignored by Git and
untracked; never prefix database configuration with `NEXT_PUBLIC_`.

The configured direct connection was initially named `PAYPAL_DATABASE_DIRECT_URL`,
which the backend did not consume. Its credential value was preserved, and only
these non-secret lines were appended to the ignored local file:

```dotenv
PAYPAL_DATABASE_URL=$PAYPAL_DATABASE_DIRECT_URL
PAYPAL_DATABASE_ENVIRONMENT=sandbox
```

`scripts/paypal-env.ts` now gives the PayPal CLI tools the same `web/` environment
loading and `$VARIABLE` expansion as Next.js, using the already installed
`@next/env`. Normal process-environment precedence still applies. Use the commands
below without a separate Node `--env-file` option; Node's native env-file loader
does not perform Next.js variable expansion. Restart a running Next.js process
after changing local configuration.

```powershell
# Offline configuration/bundle checks, with redacted output:
npm run paypal:db:inspect

# Explicit read-only Neon connection and catalog/privilege inspection:
node --import tsx scripts/paypal-db-inspect.ts --connect
```

The read-only check succeeded with authenticated, certificate-verified TLS. It
confirmed the connected database matches the configured URL, the pooled/direct
URLs identify the same target, and the direct endpoint differs from the pinned
original Monad endpoint. Catalog inspection found **zero user tables**, no legacy
Earmark objects and no existing `earmark_paypal` schema. The role has the CREATE,
PL/pgSQL and advisory-lock function permissions needed by the migration. The
transaction was explicitly `READ ONLY` and ended with `ROLLBACK`; no application
data or schema was modified.

Neon can terminate client TLS at its proxy, so `pg_stat_ssl` on the compute server
can report false. The inspector checks the actual client TLS socket and verified
certificate rather than incorrectly treating that proxy detail as plaintext.

Isolation is verified against the configured endpoint/database and the known
original markers. PostgreSQL does not expose the Neon console project display
name, so control-plane project-name verification is not claimed.

Review of `001_sandbox.sql` found additive CREATE statements, one Sandbox
environment seed INSERT, and protective functions/triggers in `earmark_paypal`.
There are no destructive DROP/ALTER/TRUNCATE or DELETE-FROM statements, changes
to the original public tables, role/grant changes or data-clearing operations.
References to UPDATE/DELETE in trigger declarations guard future writes; they do
not delete or rewrite data during migration. The runner applies the migration
transactionally and checks its checksum, but it was **not run with `--apply`**.

**Preflight result: ready for a separately approved migration.** This does not
mean the schema is applied or the backend/payment flow is operational. The SQL
has not been executed to validate its runtime behavior. The existing 43 browser
chunks were checked against configured database URLs/passwords with zero matches;
no fresh production build was performed for this inspection.

## Orders, approval and immutable payment binding

The foundation supports **one explicitly configured Sandbox seller account**.
`PAYPAL_MERCHANT_ID` must belong to the API credentials. Merchant IDs in proposals
must first be approved by the mandate and must match the configured seller before
dispatch. Arbitrary multiparty routing requires a separate PayPal product/account
integration and is not implied by accepting a `payee.merchant_id` field.

Creation uses `intent: CAPTURE` with one purchase unit and no stored payment source,
vault token, arbitrary URL or model-supplied payment instruction. `reference_id`,
`custom_id` and `invoice_id` bind the durable attempt; merchant, exact amount and
currency are immutable. Returned approval links are accepted only on
`https://www.sandbox.paypal.com` with the expected order token.

Before manual capture, the backend obtains a fresh authenticated order read and
requires `APPROVED`. It then rechecks owner, mandate activity/expiry, merchant,
currency, per-transaction limit and reservation under the mandate lock before
claiming `CAPTURING`. Standard PayPal Orders API checkout **requires buyer
approval**; this is not an unattended payments implementation. A callback or
frontend boolean cannot mark an order approved or paid.

Trusted observations validate order/attempt references, seller, amount/currency,
and a single full capture. Only a validated `COMPLETED` capture can consume the
reservation and mark `SUCCEEDED`; order status alone is insufficient. `PENDING`
retains the reservation. Confirmed void/denial can release it once. Unknown,
partial, refunded-first or mismatched outcomes require review rather than an
invented terminal success or refund.

A partial create/capture HTTP response is followed by an authenticated canonical
order GET before ledger resolution. Failure of that follow-up read remains an
ambiguous financial outcome, even if the POST returned a success status. Verified
webhook order IDs may serve as correlation hints when capture details omit related
IDs; full order/attempt terms and capture membership must still match trusted reads.

## Idempotency, ambiguity and revocation

- Purchase keys are unique within a mandate. Reuse with changed terms fails.
- Separate UUID `PayPal-Request-Id` values and immutable fingerprints are durable
  before each create/capture dispatch, and the HTTP client sends those keys.
- OAuth requests are coalesced/cached with expiry skew. Safe reads and signature
  verification have bounded retries with exponential backoff and jitter.
- Financial POSTs are **not automatically retried**. Network errors, timeouts,
  throttling/server errors or malformed success responses are ambiguous.
- Ambiguous create becomes `CREATE_UNCERTAIN`; budget stays held. PayPal does not
  expose order lookup by request ID, so an unknown order requires a verified
  webhook or explicit operator-located reference. No fresh order is created just
  because a lookup is unavailable or an idempotency retention window may expire.
- Capture timeouts become `CAPTURE_UNCERTAIN`. Repeated calls only reconcile GETs,
  never another capture POST. Even an older `APPROVED` read cannot reopen a pending
  or uncertain capture. Confirmed completion consumes exactly once.
- Revocation blocks new reservations/operation claims, not reconciliation of
  already claimed in-flight work. It cannot retract a request already authorized
  by a committed claim; reservations remain until confirmed resolution.
- Expiry behaves similarly. Local wall-clock expiry is not proof an ambiguous
  provider-side operation failed. Unsent `RESERVED` attempts can be cancelled by
  the owner without network calls.
- Spent budget is not automatically reopened by refund/dispute observations.
  TaskVault challenge-window escrow, permissionless settlement, refund and dispute
  semantics are not implemented by standard Orders checkout.

## Webhooks and failure recovery

The handler bounds JSON payload size to 256 KiB and checks required transmission
headers. It sends the **complete original parsed event**, transmission headers
and server-configured webhook ID to PayPal's documented
`POST /v1/notifications/verify-webhook-signature`. Only `SUCCESS` is accepted.
Certificate URLs are restricted to PayPal Sandbox certificate paths and are never
downloaded by this application. Verification/network failure cannot produce a
verified stored event or a successful payment state.

After verification, canonical event hashes detect same-ID content collisions.
Duplicate events do not double-consume/release budgets. Supported event types:

- `CHECKOUT.ORDER.APPROVED`, `CHECKOUT.ORDER.COMPLETED`.
- `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.PENDING`, `PAYMENT.CAPTURE.DENIED`.

All outcomes come from authenticated order/capture GETs, not event status fields.
Out-of-order events cannot downgrade terminal ledger state. Capture webhooks
cross-check current capture details and their order membership. Verified but
unsupported events are retained as `IGNORED`; refund/dispute/reversal automation
is outside this milestone and does not restore budget.

Verified processing failures stay in a durable `RETRY` inbox with exponential
backoff (capped at one hour); ingress returns 503 so PayPal can redeliver. Unknown
attempt references are retained for later correlation. Terminal inbox states do
not regress under concurrent deliveries. Events are processed only after verified
storage; if the database is unavailable before storage, non-2xx asks PayPal to retry.

```powershell
# Offline recovery plan:
npm run paypal:recover

# Explicit operator-run read-only recovery; requires configured backend/database:
npm run paypal:recover -- --run
```

The worker processes bounded batches of known orders and due verified inbox rows.
It forces payment mutations off in its own process and issues no create/capture
request. It is not deployed or scheduled. Persisted unresolved/mismatched outcomes
need operator review; a worker scheduler and monitoring remain integration work.

## Environment and verification

Root and web `.env.example` templates document these server-only settings:

```dotenv
PAYPAL_ENVIRONMENT=sandbox
PAYPAL_BASE_URL=https://api-m.sandbox.paypal.com
PAYPAL_BACKEND_ENABLED=false
PAYPAL_PAYMENTS_ENABLED=false
PAYPAL_CLIENT_ID=
PAYPAL_CLIENT_SECRET=
PAYPAL_WEBHOOK_ID=
PAYPAL_MERCHANT_ID=
PAYPAL_DATABASE_ENVIRONMENT=sandbox
PAYPAL_DATABASE_URL=
```

Live/custom origins and invalid enable flags are rejected. Backend initialization
is lazy; builds and disconnected UI do not require credentials. `PAYPAL_BACKEND_ENABLED`
controls runtime initialization; `PAYPAL_PAYMENTS_ENABLED` additionally controls
low-level financial dispatch. No public payment endpoint exists when either flag
is enabled. Secrets never enter public status or compiled browser code.

Run mocked tests with `npm run paypal:test`. Those unit concurrency tests model
the repository contract. For real PostgreSQL coverage, `npm run paypal:test:db`
explicitly revalidates the configured migrated Sandbox Neon target and runs eight
cases in a generated, session-owned schema. `npm run paypal:test:db:all` runs the
whole root regression with that coverage. The launcher sets opt-in flags and
forwards credentials only in the child environment, disables PayPal/legacy DB
network activity, and never writes to or drops persistent demonstration tables.
Cleanup checks the generated name, owner and OID. Local test databases named
`earmark_paypal_test...` remain supported with explicit test credentials/flags.
Ordinary tests do not automatically connect to an external database.

### Real Sandbox OAuth only (Task 03B)

`paypalOAuthSettings()` requires only server-side client ID/secret plus valid
Sandbox origin/environment. It does not require a merchant ID, webhook ID or an
enabled backend/payment flag. Full checkout settings continue to require them.
The existing `PayPalClient` still owns the only grant/cache implementation;
`oauthCacheStatus()` returns safe metadata only, and OAuth-only settings have no
financial execution capability.

```powershell
# Explicit positive OAuth plus PayPal unit tests; no orders or database tests:
npm run paypal:test:oauth

# Full regression with real OAuth opted in, database/payment execution disabled:
npm run paypal:test:oauth:all

# Actual local credential/Basic-pair value scan, without API traffic:
npm run paypal:secrets:check
```

The launcher loads `web/.env.local` without printing values, scopes
`PAYPAL_RUN_SANDBOX_TESTS=true` to the child process and disables backend/payment,
database and legacy DB test activity. The real test allows only POST to the exact
official Sandbox token endpoint with redirects disabled. It never creates/captures
orders or looks up merchant identity. Grant/refresh return HTTP 200 and a validated
Bearer/expiry response; expiry handling uses an injected test clock, not a nine-hour
wall-clock wait. Error/credential failure cases use synthetic values and mocks only.
See the Task 03B report for exact observed lifetimes and current test totals.

At Task 03B merchant and webhook IDs were unset; Task 03C now uses an actual
operator-confirmed merchant and checks the credential-owned order's payee. Webhook
ID remains unset. OAuth does not need either ID; manual checkout does not fabricate
one. The seller must be the actual 13-character Merchant ID of the matching
Sandbox Business account, not client/app/buyer ID or email.
Public status remains a no-network preparation view; `sandboxVerified=false`
continues to mean no verified end-to-end payment flow, not an OAuth connectivity
test result. Ordinary tests leave real network checks disabled unless opted in.

### Historical Task 02 verification record

Initial focused run: **97 mocked PayPal tests passed; five optional integration
checks skipped**. The full root run passed **176 Solidity + 140 agent + 277 web =
593 cases**. After the final persistence fix and additional regression, the web
suite passed **278** cases; latest suite totals are **594 passed**, including
**105 PayPal-specific mocked cases**. Ten integration checks skipped (five legacy
PostgreSQL, four PayPal PostgreSQL and one Sandbox OAuth), so neither real database
concurrency nor a real Sandbox payment is claimed.

Final TypeScript, production build, formatting, Biome/Foundry lint, dependency audit
(zero vulnerabilities), offline migration/recovery plans and read-only production
browser smoke passed. The browser credential check passed for 43 chunks. The
migration audit scanned 295 candidate files with no secret-pattern findings, and
source integrity still matched the original checkout's 305 file hashes. See
[HANDOFF-PAYPAL.md](../HANDOFF-PAYPAL.md) for exact paths, failures/fixes, command
results and limitations. No schema was applied and no deployment was performed.

## Remaining integration steps and blockers

1. The database migration and real concurrency/constraint coverage are complete
   (Task 03A). Use the read-only verifier for ongoing checks and isolated database
   tests for regressions; future schema changes require versioned migrations.
2. Implement owner/agent authentication and authenticated checkout endpoints,
   nonce/CSRF/access-control integration and buyer approval UX. Do not trust JSON
   principal fields or expose the low-level client directly to agents.
3. OAuth and controlled real order creation are verified. Human approval and
   canonical capture confirmation are still required to finish Task 03C. Genuine
   webhook configuration/delivery remains untested; no fake ID is registered.
4. Schedule/monitor read-only recovery on durable infrastructure in a later task;
   define privacy/retention and restricted migration/runtime database roles.
5. Integrate provider quote/delivery evidence from the preserved validation logic,
   and decide actual PayPal review/capture/refund semantics before adapting the UI.
6. Extend supported webhook events and manual escalation for refund/dispute/reversal
   cases before production use. No AWS or other deployment is included.

## Official references consulted

- [OAuth authentication](https://developer.paypal.com/api/rest/authentication/)
- [Orders v2](https://developer.paypal.com/api/orders/v2/)
- [Create order](https://developer.paypal.com/api/orders/v2/orders-create)
- [Capture order, including buyer approval requirement](https://developer.paypal.com/api/orders/v2/orders-capture)
- [REST idempotency and retention caveats](https://developer.paypal.com/api/rest/reference/idempotency/)
- [Webhook signature verification fields and response](https://developer.paypal.com/api/webhooks/v1/verify-webhook-signature-post)
