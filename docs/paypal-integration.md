# Earmark PayPal integration architecture

## Current state

Task 01 creates an independent application foundation. The new code adds only a
server-only preparation configuration check and read-only status endpoint. There
is no PayPal SDK/client, token exchange, order creation, authorization, capture,
refund, webhook processing or payment endpoint. Configuring credentials cannot
activate a payment path. No real or Sandbox PayPal payment has been executed.

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

### 1. Define authorization and payment contracts

Extract provider-neutral task/mandate/provider/quote/intent types while retaining
the existing EVM adapter and tests. Specify owner authentication and consent for
the PayPal flow; EIP-712 wallet signatures are not PayPal customer approval.
Use a server-enforced authorization ledger: PayPal does not enforce the original
Solidity task cap/provider allowlist on Earmark's behalf.

Represent currency explicitly (initially USD), store integer minor units, and
convert to PayPal decimal strings at the API boundary. Existing mock-USDC values
use six decimals and must never be reinterpreted as cents. Record immutable
approved recipient, currency, quote, purchase intent and authorization references.

### 2. Provision a separate Neon environment and schema

Retain the `pg` connection/transaction/advisory-lock infrastructure where useful,
but add a new schema version and PayPal environment binding. The legacy
`earmark_environment` CHECK constraints enforce `earmark-testnet` / chain 10143;
`bindTestnetDatabase` pins the original project. Do not run that binding or
`scripts/migrate-database.ts` against either the original database or a new PayPal
database as part of setup.

Design dedicated tables for owners, mandates, approved providers, reserved and
settled amounts, purchase intents, PayPal orders/authorizations/captures, webhook
receipts, consent/nonces and append-only events. Include uniqueness constraints
on external IDs and idempotency keys. Use transactionally locked cap reservations
and exact terminal reconciliation; retain immutable history after revocation.

### 3. Add server-only PayPal Sandbox transport

Use only `https://api-m.sandbox.paypal.com` initially. Implement OAuth token
handling with server-only credentials, bounded timeouts, sanitized errors and
stable `PayPal-Request-Id` values for supported requests. Add mocked transport
tests first. Never allow the model or browser to choose a payment API origin,
amount, currency, recipient or account credentials.

`PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID` are placeholders
only. No credential is needed to build or render the current project.

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

Verify webhook authenticity against the configured webhook ID. Persist/deduplicate
events before processing; handle replay, out-of-order events, partial failures,
expired authorization, denied capture and uncertain timeout responses. Reconcile
external state without double capture or double budget release. Validate the four
security scenarios at the backend policy boundary with mocked PayPal transport.
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
