# Earmark PayPal integration architecture

## Current state

Task 02 adds an independently testable, server-only Sandbox foundation:
`web/src/server/paypal/` provides exact-money policy checks, an isolated PostgreSQL
ledger, OAuth/Orders transport, owner-invoked approval-gated capture, verified
webhooks and read-only recovery. Task 03A applied the exact approved migration to
the dedicated Sandbox database and verified eight real PostgreSQL accounting/
concurrency cases in disposable isolation. See [the database report](task-03a-database-report.md).
There are no public financial routes or Gemini payment tools, refund endpoint,
deployment or verified real Sandbox payment. Backend/network mutation switches
default to disabled. Task 03B subsequently verified real Sandbox OAuth, cache reuse
and simulated-expiry refresh (HTTP 200), without payment or database operations.
Task 03C adds an authenticated loopback-only fixed $10/$6 checkout. The configured
seller was operator-confirmed and matched PayPal's credential-owned order payee.
Real order `9N317079B4816951W` is PAYER_ACTION_REQUIRED; no capture is claimed.
See [the human checkout handoff](task-03c-checkout-report.md). Genuine webhook
subscription and broader production authentication remain future work; see
[the OAuth report](task-03b-oauth-report.md). See [the backend guide](paypal-backend.md) for details and
the remaining authenticated checkout integration.

The original dashboard, create/list mandates, signed launch flow, execution
console, payment lifecycle, payment resolution and activity are retained. Their
live implementation remains EVM-specific; bundled records preserve their original
local Anvil / Monad provenance. The global banner and footer identify that fact.

## Preserved boundaries

1. Gemini proposes schema-validated tools; deterministic code owns authorization.
2. The owner defines task, cumulative cap, approved provider and expiry.
3. Provider quotes bind recipient, amount, task and delivery commitment.
4. Reservation plus settled spending cannot exceed the owner's cap.
5. Intent identity and durable journal writes precede financial side effects.
6. Uncertain outcomes reconcile against stable external IDs; never use a fresh
   purchase ID to blindly retry an uncertain payment.
7. Delivery inspection and owner review remain explicit, separate authority.

Existing `AgentTools.ToolChain` includes EVM signatures, hashes, vault addresses,
RPC receipts and contract events. It is a useful behavioral reference, not yet a
provider-neutral payment interface. Avoid pretending that a PayPal client can be
substituted for `VaultChain` without redesigning these types and authority checks.

## Recommended next steps

### 1. Complete the owner-authenticated checkout boundary

The new policy engine is provider-neutral; the legacy EVM adapter and tests are
preserved. Next, wire verified owner authentication and consent for
the PayPal flow; EIP-712 wallet signatures are not PayPal customer approval.
Use a server-enforced authorization ledger: PayPal does not enforce the original
Solidity task cap/provider allowlist on Earmark's behalf.

Represent currency explicitly (initially USD), store integer minor units, and
convert to PayPal decimal strings at the API boundary. Existing mock-USDC values
use six decimals and must never be reinterpreted as cents. Record immutable
approved recipient, currency, quote, purchase intent and authorization references.

### 2. Maintain the separate Neon environment and migration boundary

Retain the `pg` connection/transaction/advisory-lock infrastructure where useful,
with the new `earmark_paypal` schema and Sandbox environment binding. The legacy
`earmark_environment` CHECK constraints enforce `earmark-testnet` / chain 10143;
`bindTestnetDatabase` pins the original project. Do not run that binding or
`scripts/migrate-database.ts` against either the original database or a new PayPal
database as part of setup.

`database/paypal/001_sandbox.sql` defines mandates, merchants, exact reserved and
consumed counters, immutable attempts/order/capture IDs, idempotency records,
verified webhook inbox and append-only audit. Mandate row locks, CHECK constraints
and deferred ledger checks protect reservations. The initial migration is applied
on the approved dedicated Sandbox database; future migrations need separate
approval. Owner identity comes from a future verified
authentication adapter; this milestone does not create customer sessions.

### 3. Validate the implemented Sandbox transport with actual credentials

The client pins `https://api-m.sandbox.paypal.com`, caches/coalesces OAuth, uses
bounded timeouts and safe-read retries, sanitizes errors and sends separate durable
`PayPal-Request-Id` values for create/capture. Financial POSTs are not automatically
retried; ambiguous outcomes retain reservations. Mock tests cover these paths.
Task 03B verified app authentication against the real Sandbox token endpoint.
Next, validate seller identity, buyer checkout and actual payment responses before
claiming payment integration success. Models/browsers cannot choose origins,
policies or credentials.

Local OAuth credentials are configured server-side and verified against Sandbox;
the configured merchant was verified for the controlled order. Webhook ID remains
unset and no fake ID is supplied. Templates retain placeholders only.
No credential is needed to build or render the disconnected project UI.

### 4. Map the lifecycle explicitly

| Existing concept              | PayPal integration design work                                              |
| ----------------------------- | --------------------------------------------------------------------------- |
| Immutable task mandate        | Server-side owner-authorized policy and atomic budget ledger                |
| Owner vault funding           | Define buyer approval/consent and supported funding product                 |
| FUNDED reservation            | Distinguish local budget reservation from PayPal order/authorization        |
| SUBMITTED / ACCEPTED delivery | Keep Earmark artifact inspection and review evidence                        |
| Challenge-period escrow       | Validate product capability; do not call an uncaptured authorization escrow |
| COMPLETED settlement          | Confirm capture and reconcile webhook/API results before success            |
| REJECTED / EXPIRED            | Distinguish void, expiration, released reservation and actual refund        |
| Onchain receipt               | Durable PayPal external ID, response state and verified webhook event       |

Authorization validity, capture timing, seller routing, refunds and buyer/seller
disputes depend on the selected PayPal product/account capabilities. They are not
equivalent to TaskVault's unilateral owner dispute or permissionless settlement.
Document those choices before adapting the payment screens or enabling actions.

### 5. Verify webhooks and recovery, then exercise Sandbox

The webhook handler verifies via PayPal's documented signature endpoint with the
server-configured webhook ID, durably deduplicates events, and uses authenticated
capture/order reads. Retry/backoff and explicit read-only recovery are implemented.
Validate actual event shapes and delivery on an approved Sandbox endpoint, and
extend tests with selected product-specific cases before any checkout rollout.
Only after implementation, separately exercise approved Sandbox scenarios and
record actual evidence before claiming a working PayPal payment flow.

## Deployment preparation

Original architecture uses Vercel + fixed Render API + direct Neon PostgreSQL.
The migrated `render.yaml` is a non-executing, self-hosted Next.js preview blueprint,
with auto-deploy disabled and no legacy worker/signers configured. Its status
health check proves only preview availability. A future durable PayPal worker,
authenticated owners, new database migrations, verified webhook route, background
reconciliation and runtime configuration must be specified before deployment.

For Vercel, retain the original fixed-origin proxy restrictions and configure a
new worker; `apiOrigin` intentionally refuses an implicit local fallback in hosted
mode. The current preview does not establish hosted financial readiness.
