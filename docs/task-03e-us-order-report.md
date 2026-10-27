# Task 03E — one US Sandbox order; human approval handoff

Session: **2026-10-27**. **Order creation and verification complete. Stopped before
buyer approval and capture.**

**Historical stop point:** Task03F subsequently verified buyer approval, and
Task03G completed capture `52C23729CU714125M` for this same order. See the
[Task03G capture report](task-03g-capture-report.md) for current authoritative
PayPal/Neon evidence. The order-only observations below remain historical.

## Actual order evidence

| Evidence                                        | Verified result                                                                                    |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| US mandate                                      | `889b9c4a-b875-5de9-a354-18a037d41f52`                                                             |
| Existing US attempt                             | `422ae62d-cd25-425f-9fdb-ce50ad6f0ffa`                                                             |
| **Actual PayPal Sandbox order**                 | **`72936380818559054`**                                                                            |
| Creation completed at runtime UTC               | `2026-10-27T01:35:03.983Z`                                                                         |
| Create response                                 | **HTTP 200**, debug ID **`f150642d8f8fe`**                                                         |
| Canonical and independent Orders v2 GET         | **`PAYER_ACTION_REQUIRED`**                                                                        |
| Purchase unit                                   | **USD 6.00**, immutable attempt reference/custom ID match                                          |
| Merchant/payee                                  | Actual credential-owned default seller **matches `PAYPAL_MERCHANT_ID`**                            |
| Approval                                        | Official Sandbox `/checkoutnow` link, token matches this order; accessible after local owner login |
| Capture ID/status                               | **None / none**                                                                                    |
| Durable creation claims / observed create POSTs | **One / one**                                                                                      |
| Buyer approval automated                        | **No**                                                                                             |
| Capture authorized                              | **No**                                                                                             |

The initial real POST was followed by a canonical GET before approval was exposed.
An independent `npm run paypal:us:status` then read PayPal and Neon again and
confirmed the amount, seller, status, approval link and absent capture. Successful
order creation/payee matching does **not** prove receiving eligibility, buyer
approval or a completed payment.

## Preflight and exact permission

Read repository instructions, active handoff, Task03D report, backend/authentication
and installed Next.js Route Handler guidance. The user separately confirmed that
the intended US Sandbox Personal buyer and US Business seller are different
accounts. No buyer credentials were requested or stored.

Fresh real OAuth returned HTTP200. Real Neon preflight confirmed the existing
active/unexpired US mandate, immutable configured merchant/owner, reservation of
600 USD minor units ($6.00),
both request IDs still RESERVED, no order/capture/remote error, no creation audit
history and no original/new request-identity collision. The dedicated Sandbox DB
target/TLS and Sandbox API origin remained pinned. The saved Dashboard seller
confirmation matched the current app/merchant pair.

Permission is operator-enabled with `--us-order-once`, requires the preserved owner,
confirmed separate buyer and app/merchant-bound preflight baseline, and works only
at `http://127.0.0.1:3031`. It is bound to the exact mandate/attempt above, owner,
merchant, USD600, US purchase key and existing create request ID. No policy or
idempotency override is accepted from the browser.

- Ordinary `PAYPAL_PAYMENTS_ENABLED` remains **false** in this profile and default
  environment. Only the private, exact-scoped creation client has create permission;
  its capture method explicitly rejects even when called directly.
- HTTP permits authenticated/CSRF-protected `order-once` only for this permission;
  other US financial/preparation/recovery/hold mutations are rejected before
  database initialization. Login/logout and saved-state reads remain available.
- The service uses the already-reserved attempt directly, **without calling
  reserve or creating another attempt**. Under the existing mandate/attempt row
  locks, it verifies both untouched idempotency rows and absence of prior dispatch
  audit, revalidates policy/expiry, then commits authorization and CREATE_PREPARED
  audit/state **before** contacting PayPal.
- That durable claim cannot be replayed after refresh, concurrency, process
  restart, timeout or a lost response. The existing financial client never blindly
  retries POST. Every one-shot failure parks the attempt with reservation retained,
  including definitive HTTP rejection; no failure branch cancels/releases funds.
- A returned order reference is retained if the following GET fails, but approval
  is withheld until canonical amount/merchant/reference/link validation succeeds.
  Unexpected completed/captured/voided responses are held for review rather than
  consuming or releasing accounting under this order-only authorization.

The one-shot permission is **spent**. Keeping or restarting the same server cannot
create another order for this attempt. Do not remove its audit/state, rotate the
owner or introduce an alternate attempt to retry uncertainty.

## Neon accounting and original preservation

| Ledger                    | Authorized | Reserved  | Recorded captured | Available |
| ------------------------- | ---------- | --------- | ----------------- | --------- |
| Existing US mandate       | $10.00     | **$6.00** | **$0.00**         | **$4.00** |
| Original Nigerian mandate | $10.00     | **$6.00** | **$0.00**         | **$4.00** |

US state is **AWAITING_APPROVAL / RESERVED**. The $4 available is reservation
accounting, not payment success. The original Nigerian order
`9N317079B4816951W` remains unresolved; no inference was made from its prior 404.
Both mandates together still reserve **$12**, with $0 recorded captured.

Before/after full original-row/audit hashes match the saved preflight baseline:
original mandate, attempts, merchant policy, idempotency and **all original audit
history are unchanged** in Task03E. Owner-auth file and US request IDs are preserved.
No original-provider request was made. No second reservation or alternate attempt
was created. The US order added four audit entries (authorization, dispatch claim,
returned reference and validated remote observation); catalog totals are now two
mandates, two merchants, two attempts, four idempotency rows, eleven audit entries
and zero webhook events. Original environment/migration seed rows are intact; no
disposable test schemas or unrelated user tables remain.

## Exact human approval steps

1. Open **http://127.0.0.1:3031/paypal-test**.
2. Read `loginSecret` locally from ignored **`.tools/paypal-test-auth.json`** and
   sign in. Keep that file private and preserve it across server restarts.
3. Confirm order **`72936380818559054`**, $6 USD, $6 held/$0 captured. Click
   **Approve with PayPal Sandbox** yourself.
4. On PayPal's official Sandbox page, sign in with the **US Sandbox Personal
   buyer**, not the Business seller or a Live account. Complete buyer approval
   manually only if the displayed merchant/amount are correct.
5. Return to the local page and report the outcome. **Do not capture.** Capture and
   the in-app approval/recovery mutation buttons remain disabled. A return URL is
   not proof of approval; a subsequent read-only status check must establish it.
6. Capture requires a **separate explicit authorization** and fresh authority/
   approval validation. If PayPal rejects approval, stop with the existing order;
   do not create a replacement, cancel or release either reservation.

The actual UI check logged in/read saved state only, blocked external requests and
all non-login mutations, confirmed the correct official link/token and disabled
capture/other controls. It never followed the approval link or clicked a PayPal
control. Server remains running with the consumed exact-order permission.

```powershell
# Read-only evidence:
npm run paypal:us:status
npm run paypal:us:order:verify

# Only if the owned server is stopped; same owner and spent durable permission:
node --conditions=react-server --import tsx scripts/paypal-test-serve.ts --us-order-once --detach
```

Do **not** rerun `paypal:us:order:create` or alter the original baseline to force a
retry. The preflight/history checks will reject the already-used attempt.

## Checks, failures and remaining limits

- **200 mocked PayPal cases passed**, including **22 new one-shot tests**.
- Full web regression: **373 passed**, twenty skipped (14 PayPal DB, five original
  Monad DB, one optional OAuth Vitest case). The **14 real PostgreSQL cases passed**
  separately in disposable isolated schemas, with mocked PayPal responses.
  **387 distinct web/DB tests passed**; focused runs are not counted twice.
- Root agent/web/API TypeScript, strict changed-script TypeScript, Biome warnings-
  as-errors, Foundry formatting, full Prettier/whitespace checks and production web
  build including its agent dependency passed. Agent/Solidity test suites were not
  rerun; no legacy database connection was used. Real OAuth was verified by the
  preflight, not counted as an extra Vitest case.
- Mocked checkout browser smoke and actual read-only US order UI passed, including
  mobile overflow/browser error checks and disabled payment controls.
- No test, build, typecheck or lint failed. One non-failing Vite warning reported a
  temporarily incomplete generated source map while parallel commands rebuilt the
  agent; the subsequent production build passed. No checks were weakened.
- Final actual credential scans covered **272 tracked files, 335 candidate files
  and 47 browser chunks**, zero matches; local environment remained ignored and
  untracked. Full formatting, whitespace and browser-variable checks passed after
  the documentation/current-state updates.
- Read-only database structure/accounting verification passed at the unchanged SQL
  checksum. Original repository integrity matched HEAD/refs/status/diff and all
  **305 file hashes**.

Remaining blockers to payment completion: human buyer approval, separate capture
authorization and actual capture/settlement evidence. Receiving eligibility is not
claimed from order creation. Genuine webhook delivery remains unconfigured and
unverified. The original Nigerian obligation still requires independent resolution.

No buyer approval, capture, cancellation, release, refund, payout, Live operation,
deployment, original-repository modification, commit or push occurred.
