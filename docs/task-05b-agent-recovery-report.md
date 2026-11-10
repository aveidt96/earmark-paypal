# Task05B — Local Gemini restoration and safe campaign recovery

Session: **2026-10-28**. **COMPLETE within the authorized scope:** the corrected
real Gemini adapter is available through the authenticated local application,
one real synthetic proposal was independently policy-validated, and the old
campaign/history were inspected and preserved. No durable recovery or payment
authority was created.

## Running application and verified live result

- URL: **http://127.0.0.1:3032/agent-checkout**.
- Owned listener changed from **PID 7072 to PID 5400**, pinned to 127.0.0.1.
  The new process reports runtime **task05b-fenced-finish-v1**; its saved build ID
  equals the completed production build. Unauthenticated API GET returns 401,
  and the protected page is accessible (HTTP200) with the preserved local owner
  credential. Restart rotates the agent session epoch: sign in again with the
  same credential. The credential file hash is unchanged.
- Gemini key/model are present in web/.env.local and loaded by the existing
  Next.js-compatible environment loader. Neither value was printed or changed.
  Only this constrained child profile enables Gemini/network inference;
  PayPal backend/payment/test execution flags and legacy financial execution
  remain disabled. No production service or unrelated Node project was restarted.
- At **2026-10-28T03:05:31.092Z** (**4:05 a.m. Lagos**), the browser used the actual
  sign-in form and **Verify live Gemini with synthetic offers** button.
  One real inference made **six Google generateContent requests**, all HTTP200,
  one candidate each, STOP, no API/block error. It returned:
  readSpendingMandate, listApprovedMerchants, compareEligibleOffers, proposePurchase,
  readAuthorizedPaymentStatus, then VALID_FINISH. Every function-call argument
  schema was valid; all **ten independent policy checks** passed for the canonical
  synthetic **600 USD minor units ($6.00)** offer under a synthetic $10 policy.
- The source is **LIVE_GOOGLE_API**; catalog, merchant and mandate data are
  **synthetic fixtures**, not real procurement or the persisted owner campaign.
  The server sends no real owner/merchant/database observations to Google.
  It uses the same native adapter, strict proposal schemas, canonical policy and
  intent-validation path as durable preparation, with reserveOnProposal=false.
  Native call IDs and original thought-signature parts remain preserved.
- The result explicitly says persisted=false, ownerAuthorized=false,
  fundsReserved=false and null PayPal order/capture IDs. It is displayed separately
  from the FAILED saved campaign. No pending intent was fabricated or persisted.
- The diagnostic promise is cached for the owned server process. Repeated clicks
  return that same verification; they do not automatically run another model.
  The browser's replay matched the exact result. Restart clears this memory-only
  verification; it never clears durable failures.
- Real browser checks: unauthenticated diagnosis 401; authenticated missing-CSRF 403;
  legacy evaluation stays disabled; desktop and 390px mobile screenshots passed,
  no browser exceptions or horizontal overflow. External browser requests and
  all checkout/payment POSTs were blocked by the verification helper.

## Previous campaign: fresh PostgreSQL findings

Inspection used verified TLS, the dedicated Sandbox target and enforced
REPEATABLE READ READ ONLY transactions. The final comparison was at
**2026-10-28T03:06:31.901Z**.

| Field                           | Verified value                                          |
| ------------------------------- | ------------------------------------------------------- |
| Task05A mandate                 | 598f50eb-325a-5df3-af67-9c629973bafb                    |
| Mandate policy status           | ACTIVE                                                  |
| Cap / per-transaction limit     | 1000 / 600 USD minor units                              |
| Reserved / consumed / available | 0 / 0 / 1000 USD minor units                            |
| Immutable expiry                | 2026-10-28T19:40:23.661Z, **8:40:23 p.m. Lagos**        |
| Expired at inspection           | No                                                      |
| Evaluation records              | AGENT05A_EVALUATION_STARTED, AGENT05A_EVALUATION_FAILED |
| Failure code                    | INVALID_MODEL_RESPONSE                                  |
| Pending checkout record         | None                                                    |

All rows in **all eight earmark_paypal tables**, including every audit/financial/
idempotency row, matched their pre-change SHA-256 fingerprints. Counts remain:
three mandates/merchants, two attempts, four idempotency rows, **18 audit rows**,
one environment/migration row each, zero webhook rows. Earlier handoffs recorded
16 audits before the user's failed live attempt; the two later start/failure rows
are now freshly observed and were not created by this task.

The original Nigerian mandate remains **600 reserved / 0 consumed**, even though
its expiry has passed. Expiry does not authorize releasing that obligation.
The completed US mandate remains **600 consumed / 0 reserved / 400 available**;
its mandate expiry has also passed. Neither is reusable. No PayPal API read or
mutation occurred; provider completion evidence remains the historical receipt.

## Resume decision and proposed recovery

**The old failed campaign cannot resume under the current implementation.**
PostgresAgentCheckoutRepository.evaluateOnce explicitly refuses any non-NOT_STARTED
campaign without an existing valid intent. Restarting or fixing the parser does
not remove that durable replay guard. After expiry, checkAgentMandate additionally
rejects the immutable authority. A model API success against a separate fixture
does not override either condition.

**Recommendation: a fresh, separately authorized isolated campaign.** An audited
retry extension could be designed later, but is not currently implemented; a new
versioned campaign keeps the failed run immutable and makes its authority clear.

Concrete proposed plan, **not executed or enabled**:

1. Obtain explicit owner authorization for new preparation authority only:
   USD10 cap, USD6 per transaction, approved configured Sandbox seller, zero
   reserved/consumed balance and a newly agreed expiry. This is not authorization
   for PayPal orders, capture or settlement.
2. Add a distinct campaign namespace (proposed **agent-05b-v1**) and a new
   owner-approved campaign nonce generated once. Derive/bind a new mandate UUID,
   agent/purchase identity and metadata journal to that namespace/nonce and the
   verified owner/seller. Assert inequality with all three existing mandates.
   Use separate campaign cookie, audit-marker and advisory-lock namespaces.
   The current agent-05a code cannot create this version; implement and test its
   identity/configuration support in that separately approved task.
3. Derive the new intent ID and stable **agent05b:<terms-hash>** idempotency key
   from the new mandate plus immutable canonical offer terms and expiry.
   Never reuse agent05a identities, old run markers, old payment request IDs,
   or Task03E/03G's spent permissions. Persist the approved nonce once, so a
   restart/replay cannot silently create more campaigns or model runs.
4. Preserve old rows and errors. After approval, optionally append a review/link
   event identifying the original failed campaign and the new authority.
   Do not delete/overwrite failure records, extend old expiry, change old caps,
   release reservations or claim the old run completed.
5. Initialize only the new authorized campaign, run its one controlled
   owner/CSRF-protected preparation, and independently revalidate against the
   locked new mandate and database clock before appending a pending intent.
   Keep ownerAuthorized=false, fundsReserved=false and PayPal IDs null.
6. Verify before/after historical hashes and zero new financial attempts or
   reservations. Separate explicit financial consent/implementation, then separate
   order/buyer/capture authorizations, would still be required in a future task.

**User approval required:** implementation/creation of the fresh persistent
campaign and any append-only recovery audit action. No such approval was assumed.
The read-only review, local restart and synthetic application verification were
already authorized by Task05B and are complete.

## Restart safety and resolved issues

The existing launcher used process.kill(SIGTERM), which does not provide a
graceful Windows signal. The new Windows console helper verifies saved epoch,
listener PID and isolated console membership before Ctrl+C. Actual inspection
found **no attachable console** and it refused without sending a signal.
An initial PowerShell listener inspection missed the live process; the commentary
claim that it had stopped was explicitly corrected after native netstat showed 7072
still listening. The first restart consequently refused AGENT_PORT_IN_USE.

For a console-less process, the guarded fallback activates Node's local inspector
only after checking the owned listener/epoch and that port 9229 is unused. Before
invoking anything, it verifies the debug target's exact PID, this repository's web
directory and an installed SIGTERM handler. It then invokes only Next's existing
SIGTERM cleanup and disconnects; no environment/secret/application data is
evaluated. Next closes the server and exits. The owned process stopped and the
new PID 5400 listener passed runtime/build checks. There was no force-kill or
unrelated-process target. Initial fallback wiring discarded the helper's stderr;
capturing it privately fixed classification of the no-console condition.

References: installed Next.js start-server cleanup code,
[Microsoft console signal scope](https://learn.microsoft.com/en-us/windows/console/generateconsolectrlevent),
[console process membership](https://learn.microsoft.com/en-us/windows/console/getconsoleprocesslist)
and [Node PID attachment](https://nodejs.org/api/debugger.html).
The inspector is not an application endpoint or a persistent server feature.

## Change inventory

- **Added** web/src/server/paypal/agent-diagnostic.ts: synthetic fixture, shared
  strict inference/policy path, sanitized metadata, no DB/PayPal transport.
- **Modified** agent/src/server.ts: server-only parser export for metadata reuse.
- **Modified** web/src/server/paypal/agent-checkout-http.ts: authenticated/CSRF/
  Origin/Host/empty-body/rate-limited diagnose action, process-local result sharing,
  version header; diagnosis does not initialize/read/write the checkout repository.
- **Modified** web/src/lib/agent-checkout.ts and
  web/src/components/agent-checkout.tsx: explicit source/result types, separate
  live synthetic panel, honest saved failure/recovery guidance; legacy financial
  controls and disabled authorization remain preserved.
- **Modified** scripts/paypal-agent-serve.ts; **added**
  scripts/paypal-agent-stop.ts and scripts/stop-owned-agent.ps1: owned graceful
  shutdown paths, fresh runtime readiness and saved build identity.
- **Added** scripts/paypal-agent-inspect.ts: TLS/identity-checked read-only
  campaign/accounting inspection, all-table fingerprints and owner-file comparison.
- **Added** scripts/paypal-agent-ui.mjs: actual protected browser interaction,
  explicit live flag, one UI model run, cached replay, auth/CSRF, screenshots and
  saved-campaign preservation checks. It never prints the login secret.
- **Added** web/test/paypal-agent-recovery.test.ts: five mocked schema/data/auth
  and PostgreSQL query-transport regressions for failed/expired no-write guards.
- **Modified** AGENTS.md and HANDOFF-PAYPAL.md; **added** this report: current
  live/synthetic/durable distinction, every change, results, corrections and plan.

Ignored evidence: .tools/task05b-database-baseline.json (hashes only),
.tools/task05b-inspection.json, .tools/task05b-stop.json,
.tools/task05b-application-live.json, .tools/task05b-live-desktop.png,
.tools/task05b-live-mobile.png; .tools/paypal-agent-server.json and
.tools/paypal-agent-server.log refreshed. Owner auth and US profile files were
not modified. Normal build/typecheck artifacts were refreshed only here in
agent/dist/, web/.next/ and web/tsconfig.tsbuildinfo.

## Checks actually run

- Focused Gemini tests: **65 passed**.
- PayPal/security suite: **264 passed, 20 optional integration cases skipped**.
  The focused 21 preparation/recovery cases are included, not additive.
- Root TypeScript, strict inspector/launcher/stop script TypeScript and
  PowerShell parser validation passed.
- Root production build passed (contracts, agent, Next.js); inherited Solidity
  informational/lint notices remain.
- Full lint passed; initial error-level Biome scan checked 252 files before adding
  the final stop module. Final full lint passed 253 files plus Foundry formatting;
  full formatting and whitespace checks passed. Actual-value secret scan passed
  339 tracked/369 candidate files and 52 browser chunks with zero matches; ignored
  environment remains untracked. Final PowerShell syntax parse also passed.
- Actual read-only PostgreSQL schema/checksum/constraints/triggers/accounting
  verification passed; all-table final fingerprints and owner credentials match.
  Writable disposable DB/OAuth suites were deliberately not run under this
  task's no-financial-mutation scope.
- Browser credential boundary passed for 52 compiled chunks. Actual UI live,
  authenticated gates, immutable saved failure and mobile layout checks passed.
- Initial formatting checks found only helper/handoff layout issues; those are
  corrected before final checks. A nested PowerShell here-string edit initially
  failed to parse before any writes and was safely reapplied; the route read's
  duplicate-argument mistake was corrected. None weakened an application check.

No environment credential, dependency/lockfile, schema migration, original Earmark
source, production deployment, commit or push was changed. No PayPal request,
financial reservation/settlement, new persistent financial record, audit insertion
or old failure reset occurred.
