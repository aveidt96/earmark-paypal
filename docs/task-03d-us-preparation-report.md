# Task 03D — US Sandbox migration and checkout preparation

Session: **2026-10-27**. **Preparation complete; stopped before order creation.**
API seller-identity and receiving-eligibility verification remain limited as
described below. No payment success is claimed.

**Historical preparation stop point:** Task03E subsequently created exactly one
US order `72936380818559054`, now awaiting human approval. See the
[Task03E order report](task-03e-us-order-report.md) for current evidence and the
consumed permission; this report preserves the earlier preparation results.

## New merchant connectivity and binding

- Real Sandbox OAuth: **HTTP 200**, using existing server-only `PayPalClient`.
  Latest confirmation preflight: `2026-10-27T00:28:28.782Z`, OAuth debug ID
  `f320516e77d45`. Credentials/tokens were not printed or changed by this task.
- Read-only Identity userinfo: **HTTP 200**, debug ID `f32051653b502`, but only opaque
  `user_id`/`sub` fields were returned. Neither is treated as a Merchant ID. No
  account-type, country or receiving-capability claim was returned.
- The configured new Merchant ID differs from the original attempt's immutable
  merchant. Hash comparison against the original saved client-ID/merchant binding
  also confirms the current client ID differs; the original client ID is not
  printed, reconstructed or overwritten.
- **Human Dashboard confirmation:** in this session, the user explicitly checked
  that **Earmark US Test** is linked to a **US Sandbox Business account** whose
  Merchant ID exactly matches local `PAYPAL_MERCHANT_ID`. This is the seller-binding
  evidence used for preparation, separate from API identity evidence.
- **Receiving eligibility remains unverified.** Client-credentials OAuth proves app
  authentication, not the seller's ability to receive this buyer's USD payment.
  Userinfo supplied no eligibility fields, and no partner merchant-status
  integration/partner credentials are configured. The preflight's exact selected
  generic payment/orders scope checks were false; this does not establish that all
  payment scopes/capabilities are absent or that the account is ineligible. No
  financial request was used to probe capabilities.

The server profile pins the confirmed app/merchant pair. A changed pair needs a new
explicit confirmation; it cannot silently reuse the preserved legacy binding.
Future actual order creation must still check the API-returned credential-owned
default payee before presenting buyer approval. That independent order-payee check
cannot be executed in this task because new orders are prohibited.

## Preserved original obligation

| Original record                                | Preserved value                                                                         |
| ---------------------------------------------- | --------------------------------------------------------------------------------------- |
| Mandate                                        | `8fb8ada6-ad12-5bc8-ac4c-90e6a07ed064`                                                  |
| PayPal order                                   | `9N317079B4816951W`                                                                     |
| Accounting                                     | USD $10 cap / $6 held / $0 recorded captured / $4 available                             |
| Local state                                    | `AWAITING_APPROVAL` / `RESERVED`                                                        |
| Actual remote disposition                      | **Unresolved**; prior original-credential GET 404 is not non-capture/cancellation proof |
| Owner, merchant, request IDs and prior history | Preserved                                                                               |

Original credentials were not configured in supported `PAYPAL_ORIGINAL_*` or
`PAYPAL_OLD_*` settings, and no original credential backup was found in the local
repository environment/artifact inventory. No original-order request was made
with the new US credentials. If originals remain securely available elsewhere,
they can be supplied through the optional server-only original credential names;
the preflight checks the saved original app/merchant binding before using them.

### Audited operator intervention

The verified local owner invoked `hold-original` through real password/session,
Origin and CSRF authentication. This appended exactly one
`OPERATOR_RESERVATION_HELD` entry with `RETAIN_UNRESOLVED_OBLIGATION`, the immutable
merchant/order/amount bindings and `releaseAuthorized=false`. It records a
decision to retain the reservation; it is not a refund, cancellation or declaration
that capture did not happen.

The repository locks the original mandate/attempt and appends only to `audit`.
It does **not UPDATE** original mandate, attempt, merchant, idempotency or existing
audit rows. Concurrent/repeated hold requests append the same decision only once.
Actual before/after snapshots matched all original financial rows and preserved
all four existing audit entries. Replay added zero audit entries.

No risk-based write-off/release mechanism is exposed. A future release requires
trusted evidence or separate explicit approval of a documented risk decision,
implemented and audited as a distinct operation. Obtain PayPal support's
disposition or original-credential authoritative evidence first.

## New isolated preparation

| US preparation     | Actual persisted value                             |
| ------------------ | -------------------------------------------------- |
| Interface          | **http://127.0.0.1:3031/paypal-test**              |
| Campaign           | `us-v1`, preparation only                          |
| Mandate            | **`889b9c4a-b875-5de9-a354-18a037d41f52`**         |
| Attempt            | **`422ae62d-cd25-425f-9fdb-ce50ad6f0ffa`**         |
| Accounting         | USD $10 cap / $6 held / $0 captured / $4 available |
| State              | `RESERVED` / `RESERVED`                            |
| Order / capture ID | **None / none**                                    |
| Payment execution  | **Disabled**                                       |

The authenticated existing owner was reused without modifying
`.tools/paypal-test-auth.json`. New mandate identity incorporates the owner,
merchant and US campaign; purchase key is `paypal-test-us-6usd-v1`. Both durable
create/capture request IDs differ from the original attempt. This is a separately
authorized $10 mandate, not a reset or transfer of the original cap: **$12 total is
currently reserved across the two mandates, with $0 recorded captured**.

- US server uses a separate epoch/cookie and exact port3031 Host/Origin checks.
  The profile requires human seller confirmation and rejects payment-enabled
  configuration. Ordinary/hosted profiles remain disabled.
- HTTP and service boundaries allow only mandate/reservation preparation and the
  audit-only original hold; order/capture/approval/recovery/cancel actions are
  blocked. Low-level client settings also keep financial dispatch disabled.
- Runtime payment services are bound to one configured merchant. Direct
  cross-merchant capture/reconcile/revoke calls fail before PayPal reads or writes;
  recovery sweeps skip other merchants without changing their records.
- Legacy status/diagnostic scripts now reject mismatched current credentials
  before contacting PayPal. `paypal:test:status` returned the expected
  `MATCHING_MERCHANT_CREDENTIALS_REQUIRED` under US settings.
- Actual preparation used only authenticated local `hold-original`, `mandate`,
  `reserve`. No PayPal request was made by the preparation script. Replaying it
  kept the same IDs and accounting. Fresh `paypal:us:status` independently read
  the persisted preparation without contacting PayPal.

## Verification actually performed

- PayPal mocked suite: **178 passed**, including **11 new migration/security cases**.
- Full web suite: **351 passed**, 18 skipped. Twelve PayPal DB cases were then
  exercised in the explicit real-Neon profile; five original Monad DB cases and
  the optional OAuth Vitest case remained skipped. Real US OAuth was verified by
  the preflight API calls, not counted as a Vitest test.
- Real PostgreSQL suite: **12 passed**, using generated owner/OID-checked disposable
  schemas. Two new cases verify concurrent US preparation and concurrent,
  append-only, unauthorized-owner-rejecting original holds. PayPal responses in
  database tests are mocks. **363 distinct test cases passed** across web/DB runs;
  focused reruns are not counted again. Agent/Solidity suites were not rerun.
- Root agent/web/API TypeScript passed. Strict standalone TypeScript for changed
  operator scripts passed. Biome warnings-as-errors and Foundry formatting passed;
  inherited informational style suggestions remain.
- Production web build (including agent dependency) passed with local server env.
  Mocked checkout UI smoke passed. Actual US UI check allowed only local login and
  reads, blocked external requests, showed `RESERVED` and all payment controls
  disabled, with no mobile overflow or browser errors. It did not click a payment
  or PayPal approval control.
- Final credential-value scan passed for **272 tracked files, 331 candidate files
  and 47 browser chunks**; zero matches, local env ignored. Browser variable
  boundary, full formatting and whitespace checks passed. Final strict script
  TypeScript and Biome checks also passed after reporting/credential-guard changes.
- Independent schema/catalog verification passed: unchanged approved SQL checksum,
  no remaining disposable schemas/unrelated user tables. Persistent ledger now has
  two mandates, two merchants, two attempts, four idempotency records, seven audit
  entries, zero webhook events and the original two environment/history rows.
- Original source integrity matched HEAD/refs/status/diff and **305 file hashes**.

Observed failures and fixes: the initial new DB hold test omitted a required
timestamp, causing a TypeScript error and one test failure; corrected and all 12
DB cases passed. Strict script checking identified an existing duplicate `status`
field in launcher failure logging; renamed the event label and passed. An initial
build invocation failed in the tool harness with `ChildProcess.kill`; a separate
full build passed. The first source-integrity invocation omitted required CLI
arguments; the correct invocation passed. No checks were weakened.

## Commands and exact next approvals

```powershell
# Safe read-only checks:
npm run paypal:us:preflight
npm run paypal:us:status

# Server is running; restart only if stopped, preserving the saved owner/profile:
npm run paypal:us:serve
```

First-time Dashboard confirmation was recorded with
`node --conditions=react-server --import tsx scripts/paypal-us-preflight.ts --confirm-us-seller`.
This creates a binding-specific ignored profile with exclusive file creation; do
not overwrite it to rotate merchants casually. `paypal:us:prepare` is an
authenticated, idempotent local preparation command, not an order-creation command.

1. Inspect the US Business account's USD receiving preferences, verification,
   limitations and actual buyer-country compatibility. Ask PayPal Developer
   Support if capability evidence is unavailable; successful OAuth is insufficient.
2. **Explicitly authorize a future US $6 Sandbox order** against the existing new
   mandate/attempt. This task provides no promotion switch: order/capture remain
   blocked until a separately authorized change. Revalidate mandate expiry and
   current bindings then; do not reset the campaign if authority has expired.
3. After a future order is created and its actual payee is independently matched,
   a human must approve it with the separate Sandbox Personal buyer. Capture needs
   explicit authorization and fresh server-side approval validation. No approval
   was simulated here.
4. Resolve the original obligation independently using matching original
   credentials/PayPal support. Any risk-based release requires specific user
   approval; authorizing a US order does not release the original reservation.

No new order, capture, refund, payout, Live call, deployment, original-repository
modification, commit or push occurred.
