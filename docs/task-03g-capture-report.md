# Task03G — one authorized US Sandbox capture

Session: **2026-10-27**. **SUCCESS — actual PayPal COMPLETED capture and matching
persisted Neon accounting independently verified.** This is a controlled Sandbox
result, not a Live payment or production/autonomous-payment readiness claim.

## Actual payment and response evidence

| Evidence                                | Authoritative result                                            |
| --------------------------------------- | --------------------------------------------------------------- |
| Order                                   | **`72936380818559054`**                                         |
| Mandate                                 | `889b9c4a-b875-5de9-a354-18a037d41f52`                          |
| Existing attempt                        | `422ae62d-cd25-425f-9fdb-ce50ad6f0ffa`                          |
| **Capture ID**                          | **`52C23729CU714125M`**                                         |
| PayPal order status                     | **COMPLETED**                                                   |
| PayPal capture status                   | **COMPLETED**, final capture true                               |
| Amount/currency                         | **6.00 USD**                                                    |
| Seller                                  | Canonical credential-owned payee matches configured US merchant |
| Actual capture POST                     | **One**, HTTP **201**                                           |
| Capture `PayPal-Debug-Id`               | **`ca50e501abb92`**                                             |
| Operator completion at runtime UTC      | `2026-10-27T02:36:33.225Z`                                      |
| Independent verification at runtime UTC | `2026-10-27T02:37:08.804Z`                                      |
| Independent order GET                   | HTTP200, debug `ca50e512aafa0`                                  |
| Independent capture GET                 | HTTP200, debug `ca50e512e49cc`                                  |

The service did not infer settlement from the POST status: it fetched the
canonical order and capture, checked capture membership/order relationship,
seller, immutable attempt references, exact money/currency and final status before
using the existing atomic budget-consumption operation. A separate operator
verification then repeated actual authenticated API GETs and read Neon in fresh
read-only transactions. `paypal:us:status` independently confirmed the same result
with `objectiveComplete=true`.

## Final Neon accounting

| US mandate accounting         | Verified value                                   |
| ----------------------------- | ------------------------------------------------ |
| Authorized cap                | **$10.00 / 1000 USD minor units**                |
| Consumed spending             | **$6.00 / 600**                                  |
| Reserved spending             | **$0.00 / 0**                                    |
| Available budget              | **$4.00 / 400**                                  |
| Attempt / budget state        | **SUCCEEDED / CONSUMED**                         |
| Accepted capture identity     | **`52C23729CU714125M`**, one immutable reference |
| Capture-prepared claims       | **One**                                          |
| Completed ledger observations | **One**                                          |

The original Nigerian mandate/order are financially unchanged: original cap1000,
held600, recorded consumed0, available400. Its unresolved $6 reservation was not
released or reinterpreted from the prior order GET404. Full original financial
rows **and all original audit history** match the saved Task03E baseline. Owner
authentication file and both existing US request identities are preserved.

Post-capture catalog verification confirms two mandates/merchants/attempts, four
idempotency records, **15 append-only audit entries**, zero webhook events and
the two original environment/history seed rows. No disposable test schema or
unrelated user table remains. No migration SQL or database reset was used.

## Preflight and narrowly scoped permission

Read root/web instructions, active handoff including Task03F (no standalone 03F
report exists), Task03E report, current client/service/ledger/authentication and
installed Next.js Route Handler guide. The user's authorization permits only the
existing $6 Sandbox capture; it grants no new order or other payment operation.

Initial and final preflights used real Sandbox OAuth and order GET plus dedicated
Neon/TLS/identity checks. They required APPROVED, no capture, matching US app/seller,
USD600 minor-unit purchase, saved verified owner, active/unexpired mandate,
per-transaction limit600, held600/consumed0 and no prior or ambiguous capture claim.
The mandate's immutable expiry is `2026-10-28T00:41:39.301Z`. Final preflight order
GET was HTTP200, debug `ca50e4cd0b8b6`. The server re-read approval immediately
before its locked claim and revalidated policy using post-lock database time.

- `--us-capture-once` is a separate operator-controlled, port3031-only profile
  requiring the owner/app/merchant/exact-order/attempt/amount/currency/capture-key
  baseline. Order-only and capture-only permissions cannot be combined.
- The existing real owner password, signed session, exact Host/Origin and CSRF
  checks are preserved. Client input cannot choose scope or payment identities.
  Other mutation routes are rejected before database initialization.
- Ordinary/hosted/default `PAYPAL_PAYMENTS_ENABLED` stays false. Only the private
  capture-scoped client may call this exact existing order's capture endpoint;
  new-order creation and other financial endpoints are refused. The transport
  allowlists only Sandbox OAuth, this capture POST and authoritative order/capture
  reads. No environment credential values were changed.
- PostgreSQL locks the existing mandate/attempt, checks capture history and both
  immutable idempotency rows, reconciles fresh approval into the claim, then
  commits `TASK03G_CAPTURE_AUTHORIZED` and `CAPTURE_PREPARED` **before dispatch**.
  The existing stable capture `PayPal-Request-Id` was reused.
- Financial POSTs have zero automatic retries. Pending/ambiguous claims cannot
  reissue a POST after concurrency, refresh or restart. Canonical GET failure,
  decline or other non-completed outcomes retain held/review accounting; this
  permission never releases the user's reservation as a failure shortcut.
- A matching canonical COMPLETED capture consumes the reservation through existing
  atomic accounting. Replaying a terminal successful result returns the saved
  outcome without another POST, audit entry, record update or second consumption.

The actual accepted capture and durable claim are recorded **once**. Concurrent
and restart replay checks were exercised only in isolated tests, not by submitting
another live-demonstration capture. No second capture POST was sent.

## Validation actually performed

- Focused PayPal suite: **229 mocked cases passed**, including **29 new capture
  cases** covering exact scope, owner/Origin/CSRF, fresh approval/expiry, wrong
  merchant/money, concurrency/restart, pending/uncertain/rejected captures, canonical
  GET failure and no automatic POST retry/release.
- Full web regression: **402 passed**, 22 skipped. Explicit real PostgreSQL suite:
  **16 passed**, including two new durable capture concurrency/one-consumption and
  ambiguous POST retention/restart cases. All DB test writes/cleanup were confined
  to generated owner/OID-checked schemas with mocked PayPal responses, never the
  persistent demonstration attempt.
- **418 distinct web/DB tests passed**; focused reruns are not double-counted.
  Five original Monad DB and one optional OAuth Vitest case remained unrun; real
  OAuth was verified independently through preflight. Agent/Solidity test suites
  were not rerun for these PayPal changes.
- Root agent/web/API TypeScript, strict capture-script/launcher TypeScript, Biome
  warnings-as-errors, full Prettier/whitespace and Foundry formatting passed.
- Production web build including agent dependency passed. The initial build
  exceeded its 300-second tool limit during trace collection after successful
  compile/typecheck/static generation; a separate full build succeeded. No code or
  assertion was weakened to obtain that result. No tests/typechecks/lint failed.
- Mocked checkout browser smoke passed. Actual post-capture UI inspection allowed
  only local owner login and GETs, blocked all external requests/other mutations,
  showed SUCCEEDED/$6 spent/$0 held/$4 available and the exact capture ID, with all
  payment controls disabled, no mobile overflow and no browser errors.
- Final actual secret scans covered **272 tracked files, 339 candidates and 47
  browser chunks**, zero matches, local env ignored/untracked; browser-variable
  boundary passed. Full formatting/whitespace checks passed after the receipt and
  current-state documentation updates.
- Read-only schema/accounting/catalog verification passed at unchanged migration
  checksum. Original repository integrity matched HEAD/refs/status/diff and all
  **305 file hashes**.

## Operational handoff and limitations

The one authorized capture is **complete and spent**. No additional order,
capture, refund, payout, cancellation or release is authorized. The loopback UI at
**http://127.0.0.1:3031/paypal-test** remains available for authenticated receipt
inspection using the preserved `loginSecret` in ignored
`.tools/paypal-test-auth.json`. Do not rotate owner/profile or delete journals to
reset the spent authority. No second payment is needed to demonstrate success.

```powershell
# Read-only actual PayPal + fresh Neon verification:
npm run paypal:us:status
npm run paypal:us:capture:verify

# Only if the owned server is stopped; preserves exact spent capture identity:
node --conditions=react-server --import tsx scripts/paypal-test-serve.ts --us-capture-once --detach
```

Do not rerun the execute command. Older Task03E/03F preparation verifiers expect
held/no-capture state and are historical; use the post-capture commands above.
Generic integration-readiness fields remain conservative and are not the receipt
for this scoped Sandbox transaction.

No payment-completion blocker remains for **this** authorized capture. Remaining
project limitations are independent resolution of the original Nigerian hold,
genuine webhook delivery, broader production authentication/deployment and
refund/dispute/reversal handling. This result proves the one controlled US
Sandbox flow, not every merchant/country configuration, Live processing or
autonomous agent payments. No buyer approval was automated; no new order, unrelated
release, refund/payout, Live call, original-project change, deployment, commit or
push occurred.
