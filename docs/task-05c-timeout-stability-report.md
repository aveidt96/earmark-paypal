# Task05C-T — Gemini timeout and concurrency stability

Latest configuration, Task05C-U (2026-10-30): Gemini's default is now **60,000ms
per model turn**. The 15,000ms measurements below are historical. Task05C-V now verifies one complete synthetic live evaluation; see its final
addendum. Earlier timeout measurements remain historical.

2026-10-29. Validation finished; the live Gemini response remains unverified after
the single permitted evaluation timed out. No financial execution or persistent
campaign/intent change occurred. Prior Task05C-S evidence and one-use claim are retained.

## Timeout investigation

Fresh preflight confirms the configured/default per-turn timeout is **15,000 ms**;
the key and model are present without exposing either credential. The deadline
covers the turn's transport and response processing, not an entire multi-turn
campaign. Native conversation is bounded at eight steps; normal proposal
evaluation has five tool calls and one finish. The old failure happened after
one dispatch, before any recorded continuation, so excessive conversation turns
do not explain that occurrence. Its exact failure phase was not retained.

Confirmed code defects/inefficiencies: three wrappers cloned/read the same body
before the adapter read it again, and wrappers awaited error bodies before HTTP
classification. A hanging HTTP error body could therefore hide a known 408/429/
5xx status behind MODEL_TIMEOUT. Regressions reproduce this class of masking.
Successful responses now share one byte-bounded read, failed HTTP bodies are
cancelled and classified from headers, and body failures/aborts retain safe
categories. The 15-second default is unchanged. This does not prove which defect
caused the historical timeout.

The newly authorized live evaluation made exactly **one** real Google dispatch
and stopped with MODEL_TIMEOUT. Its 3,866-byte request passed the final synthetic
guard; the connection opened in 557ms, request headers were sent at 574ms, and no
response headers arrived before local abort at 15,028ms (15,245ms evaluation).
Maximum event-loop delay was 137ms. Failure phase: **awaiting_headers**. There was
no HTTP status, response body, candidate, native tool call or policy decision.
Authentication and quota therefore remain unverified. This is a local deadline
expiry, not an observed HTTP408/429/5xx or schema/parser/safety rejection. No
further live attempt was made. The remote/intermediary reason for delayed response
is unknown; connection reuse and tool-turn count cannot explain a fresh first-turn
failure. The prior Task05C-S attempt's precise phase remains unknown.

The new harness permits one evaluation, one HTTP attempt per turn, at most eight
network requests, and no database writes or PayPal transport. It first requires
a matching source/build-digest offline proof over all complete native turns.
Restricted local output contains only durations, sizes, phase/status/category,
accepted tool names, schema flags, boundary counters and policy result. Raw
request/response bodies, auth headers, signatures and historical records are
never saved in its report. Node diagnostic events are projected to numeric
connection/header timings and allowlisted error categories only.

## Privacy verification

The existing final transport schema is still mandatory in every profile and on
every retry. Malformed policy values now fail before dispatch with a fixed
category. No historical payment data is added to live or offline fixture prompts.
Only the bounded synthetic mandate/catalog and current proposal state are eligible.
Interception and canary checks precede the real fetch, including all conversation
turns and native IDs/signatures. Latest focused checks: transport/parser84
(83 at the earlier checkpoint), privacy/proposal39 at the earlier checkpoint;
the final combined suite includes the added regressions. The complete offline
interception passed six requests and all five function-response turns, with 15
cumulative response validations and 33 rejected harmless local canary variants.
Payload sizes were 3,866/4,561/6,932/8,076/9,380/9,837 bytes. All ten independent
policy checks passed for a synthetic **600 USD minor-unit ($6.00)** proposal under **mocked transport**;
this is not live inference success. The source/build digest was
`1f5b9c8f13b322101eb2bad6e11a56073cc4ab025c9cbc584fae3d992aa65d93`.
The real first request separately recorded accepted1/rejected0/canaryRejected3;
it received no tool response to continue. Runtime protection was exercised before
the real fetch, but live multi-turn continuation remains unverified.

## Database investigation

The application pool remains four connections, connection timeout10s,
configured statement timeout10s, query timeout15s. No timeout or financial retry
was increased. Actual effective server settings were measured separately below.
All disposable tests retain UUID namespaces, original assertions, immutable SQL
checksum and ownership/OID cleanup. A separately tagged observer, capped at one
connection and two seconds, reads only aggregate activity/lock/blocker counts for
the fixture application tag. It never reads query text, parameters, accounts,
historical records or unrelated sessions into diagnostics. Samples are bounded
and only enabled for the capture-once concurrency case. Pool acquisition/high-water
counts, checkout cleanup, server timeout settings and event-loop delay are recorded.
The default-parallelism combined reproduction passed contracts176 +agent186
+web479 = **841 tests**, with six opt-in skips. All20 disposable PostgreSQL cases
ran. The previous capture/trigger/security-demo failures did not recur; a passing
reproduction does not establish their cause. Subsequent comparison results are
recorded below; no historical concurrency failure is claimed explained.

A standalone full disposable run passed20/20 (407.01s). A direct isolated capture
run passed2/2 (59.37s),18 nonselected; expected lock serialization reached three
blocked/waiting callers. Pool high-water four checked-out clients, acquisition
maximum1ms, queue high-water three, cleanup zero checked-out clients and schema
removed. No pool exhaustion or transaction leak was demonstrated.

**Confirmed database configuration defect:** although the named client startup
parameter requested10000ms, PostgreSQL reported statement_timeout0 (disabled).
The new read-only session probe reproduced before/in/after-transaction settings
of0/10000/0 using SET LOCAL and rollback. Passing the same limit through PostgreSQL
startup options produced10000/10000/10000. No table or persistent setting changed.
`agent/src/postgres.ts` now supplies `-c statement_timeout=10000`; the existing
client15s/connection10s limits remain. A no-network regression checks configuration,
and disposable integration setup now fails closed unless the actual server value
is10000ms. Its observer explicitly uses the shorter2000ms option. This fixes the
missing server deadline; the reason the named GUC was ineffective within the
endpoint path, and its relationship to the historical capture failure, are not
proven. PostgreSQL documents that zero disables this limit:
[statement_timeout](https://www.postgresql.org/docs/17/runtime-config-client.html).

The first single-worker comparison was already running when this new assertion
and connection fix were added. Its DB setup saw the old compiled connection
configuration with the new assertion and rejected effective0; this intermediate
source/build mismatch is not a stable final-source result. The final agent build
and focused connection/stream tests passed15/15. The subsequent frozen-source
results follow. The final-source isolated
capture run passed2/2 (49.11s),18 nonselected. Main effective server timeout was
10000ms; max checked-out4, max acquisition1ms, queue high-water3, cleanup0 checked-out,
schema removed, max event-loop delay112ms. Three samples showed bounded expected
row-lock waits. Their displayed statement_timeout2s belongs to the observer; the
main pool value is reported separately in the summary. No lock-timeout setting
was changed.

The intermediate failed comparison recorded contracts176/agent186/web459 passes,
one failed DB setup suite and26 web skips; none of its20 DB cases ran. A fresh
single-worker comparison on synchronized final source/build passed **842 tests**:
contracts176 +agent187 +web479, six opt-in skips. All20 disposable PostgreSQL cases
executed with the new real effective-deadline assertion. Web portion502.70s;
no concurrency, trigger or security-demo failure recurred. Final default-parallelism
comparison also passed **842 tests**, six opt-in skips, including all20 actual
disposable PostgreSQL cases; web387.06s. Historical intermittency remains unresolved despite
these passing observations; its missing causal explanation is not suppressed.

## Preservation and final checks

A fresh read-only TLS check before tests matched every persistent table and
owner-auth fingerprint against the Task05C-S baseline: merchants4, attempts2,
audit21, environment1, idempotency4, mandates4, migrations1, webhooks0.
Fresh semantic verification after the live timeout confirmed exactly one creation
event and one pending intent, zero campaign attempts, owner/agent/merchant binding,
ACTIVE/unexpired and cap1000/reserved0/consumed0/available1000. Historical rows and
owner auth matched their baseline. The existing campaign and intent are not used
as model authority for this task.
Their immutable expiry remains 2026-10-29T19:15:34.339Z (20:15:34.339 Lagos).

| Persisted item                              | Verified state                                                        |
| ------------------------------------------- | --------------------------------------------------------------------- |
| Campaign                                    | `556bce55-e74a-567f-8516-a80553b52c57`, `agent-05c-v1`, exactly one   |
| Mandate                                     | `065af6d7-98d7-5262-a6a1-7fb33c2a1ddc`, immutable 24-hour term        |
| Existing intent                             | `570086fa-b2ae-5b50-85a2-107e2446ddc7`, one, unchanged, non-financial |
| Currency/budget                             | USD, authorized 1000 minor units ($10.00)                             |
| Reserved / consumed / available             | 0 / 0 / 1000 minor units                                              |
| Campaign payment attempts                   | 0                                                                     |
| Earlier failed/completed/unresolved records | Baseline hashes unchanged                                             |

Final root TypeScript (agent/web/API), lint, Solidity formatting and repository
formatting passed. The connection/stream focused tests passed15/15 and diagnostic
scripts passed standalone TypeScript. Original-source comparison passed HEAD,
refs, status, diff and305 hashes. Final root production build passed; existing
unchanged Solidity timestamp/revert advisory warnings remain. No deployment occurred.

The owned PID2360 was verified by listener/epoch/cwd and gracefully stopped.
The rebuilt application was verified on October29 at
[local agent checkout](http://127.0.0.1:3032/agent-checkout), actual **PID17164**,
runtime **task05ct-transport-v1**. Its public owner gate/build/epoch were verified.
Credentials stayed unchanged; epoch rotation requires re-login. Authenticated
read-only browser smoke passed with zero browser errors, the existing pending
intent, zero reserved/consumed and payment execution disabled. Request interception
blocked evaluation/diagnostic/payment POSTs; the saved old proposal is not new
Task05C-T live evidence.

Post-build actual-value scanning found zero matches across339 tracked/384 candidate
files and52 browser chunks; environment files remain ignored. Compiled credential-name/
PEM boundary passed. Final transport-source/build digest still matches the exact
offline proof and live attempt; the final preflight made no model request.
After browser smoke, fresh TLS/read-only fingerprints again matched all eight
persistent tables and owner auth. Verification completed **2026-10-29T16:54:11Z**
(17:54:11 Lagos); the immutable campaign was still unexpired. No PayPal request,
persistent reservation, campaign/mandate/intent creation, accounting change,
historical reset, refund, payout or cancellation occurred.

Eight prior diagnostic/proposal/auth/Task05C-S evidence files were independently
fingerprinted without reading their contents into logs. The hash-only baseline
is create-new under the restricted Task05C-T directory. All eight files plus that
baseline have owner/SYSTEM-only access, zero unexpected rules; earlier evidence,
historical intent and previous live failure/claims remain unchanged.
The final post-reload fingerprint comparison matched all eight files. An initial
PowerShell verification failed because a one-item result became a scalar string
and indexing selected its first character; explicitly retaining an array corrected
that check. It was a diagnostic-script error, not evidence tampering. Read-only
ACL checks found zero unexpected access rules. No raw evidence content was logged.

| Final check                           | Actual result                                                        |
| ------------------------------------- | -------------------------------------------------------------------- |
| Full default parallelism              | 842 passed, 6 opt-in skipped, 0 failed                               |
| Full single worker                    | 842 passed, 6 opt-in skipped, 0 failed                               |
| Real PostgreSQL cases                 | All 20 ran in both full final runs; effective server limit asserted  |
| Isolated capture, final build         | 2 passed, 18 nonselected; cleanup verified                           |
| Complete synthetic interception       | 6 requests, 15 cumulative tool-response checks, 33 rejected canaries |
| One real Gemini evaluation            | 1 dispatch; MODEL_TIMEOUT awaiting response headers; no HTTP status  |
| Types/lint/format/build/browser/scans | Passed, subject to documented existing build advisories              |

The intermediate failed build-mismatch run is retained above and is not counted
as a pass. No tests were weakened, deadlines increased or failures automatically
retried. The one-use Google claim remains consumed. No commit or push occurred.

## Remaining gates before Task05D

Live Google authentication, model response, native multi-turn continuation and
independently validated proposal are still unverified after the synthetic-only
fix; the one authorized evaluation stopped at the first local deadline. A further
controlled live attempt needs separate authorization; existing failure/claim
artifacts must not be reset. Do not infer quota or model incompatibility from
the absence of HTTP headers.

Historical PostgreSQL/security-demo intermittency remains causally unresolved;
current successful runs must not be described as proof of universal stability.
All20 PayPal database cases are enabled; the six opt-in skips are five legacy
database cases and one genuine Sandbox OAuth test. Real PayPal webhook delivery
and capture are not established by mocked-provider database tests. Financial
execution requires separately implemented/verified owner consent and explicit
authorization, valid unexpired authority, buyer approval and capture permission.
This campaign's expiry must never be extended or bypassed. No Task05D financial
action is authorized by this report.

## Continuation — 2026-10-30

The previous final documentation formatter was not executed because automatic
approval review hit an account usage limit; the documentation patches had already
succeeded. On the user's continuation request, formatting ran successfully.
This continuation changes documentation only; the October29 full tests, build,
live timeout and privacy evidence above remain historical results.

Fresh TLS/read-only PostgreSQL reads confirmed exactly one campaign creation,
one unchanged intent, zero campaign payment attempts and1000/0/0/1000 USD minor-unit
accounting. All eight persistent table fingerprints and owner auth still match
their baseline. The immutable expiry has now passed: the stored status remains
ACTIVE but **unexpired=false**. The campaign cannot authorize a new purchase;
no expiry extension, reset or replacement was performed.

The existing launcher restored the same compiled runtime for historical viewing:
**PID6920**, loopback3032, **task05ct-transport-v1**, payment/reservation execution
disabled. Privileged OS verification matched the listener with saved metadata.
The initial sandboxed network inventory could not reliably establish listener
state; the launcher's free-port check and subsequent privileged verification are
the authoritative checks. Owner credentials remain unchanged; epoch rotated.
No additional Gemini request or PayPal mutation was made.

Fresh authenticated read-only browser smoke passed with zero browser errors and
the existing saved intent; evaluation/diagnostic/payment POSTs were blocked by
the smoke harness. Post-browser TLS/read-only fingerprints still matched all eight
persistent tables and owner auth. Fresh secret scanning found zero matches across
339 tracked/384 candidate files and52 browser chunks; the compiled browser boundary
also passed. Verification completed **2026-10-30T16:26:18Z** (17:26:18 Lagos).
Full regression tests and build were not repeated because application source was
unchanged. Their842-pass results above are specifically from October29.
Final documentation formatting and `git diff --check` passed.

The expired mandate is a current Task05D blocker in addition to the missing live
Gemini response proof and unresolved historical intermittency. The $10 available
accounting balance does not renew purchasing authority. Any future campaign or
financial execution requires separate explicit authorization; none was created
or enabled during this continuation. No deployment, commit or push occurred.

## Task05C-U — minimal timeout correction, 2026-10-30

Strongest diagnosis: the caller's15s deadline cancelled the first native REST
request while awaiting response headers. It was not an observed HTTP504, quota,
billing, safety or parsing error. Why the remote endpoint/intermediary did not
respond within15s remains unknown. The limit wraps each Gemini `decide` call,
including body reading and its bounded HTTP retry; it is refreshed for each of
at most8 tool turns, not applied once to the whole workflow. Built-in Node fetch
is used with AbortController; no custom connection agent or new client is needed.

The current server configuration loaded from `web/.env.local` selects
`gemini-3.5-flash-lite`, has no explicit AI_TIMEOUT_MS override, and uses the
official endpoint. Only model/timeout/key-presence metadata was inspected;
credentials were not printed. Google's [model documentation](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite)
lists it as available with function calling, structured outputs and thinking.
Google's [error reference](https://ai.google.dev/gemini-api/docs/generate-content/api-errors)
describes explicit billing/access/quota errors; none was received in the retained
attempt. Account billing, quota and key eligibility remain unverified; no AI
Studio account session or authenticated Gemini API call was used to check them.
The longer deadline is a bounded accommodation for possible latency, not proof
that billing is healthy or that latency is the only external issue.

Only three defaults changed from15000 to60000ms: Gemini's generic factory in
`agent/src/models.ts`, the PayPal factory in `web/src/server/paypal/agent.ts`,
and metadata in existing `scripts/paypal-timeout-stability.ts`. Qwen's15s default,
explicit overrides,10..60000ms validation range, abort handling, retry counts,
schemas, request content and synthetic-only final guard are unchanged. No
environment file, model choice, dependency, database schema or financial record
was changed. The maximum model waiting budget remains bounded by8 turns; with
the new default that is at most480s, apart from existing tool processing.

`web/test/paypal-gemini-boundary.test.ts` adds just three cases in the existing
Vitest suite: six20s synthetic responses complete a120s mocked conversation,
the default aborts a stalled request at60s, and an explicit15s override still
aborts at15s. The slow conversation still validates all10 policy checks, six
complete requests,15 cumulative function responses and33 rejected local canaries;
no intent is persisted. Existing interception/error/parser tests are reused.

First targeted run passed112 tests across five existing suites. Agent typecheck,
changed-file lint and formatting passed. Web typecheck initially caught the new
mock forwarding no required fetch arguments; this was corrected to forward
input/init. The corrected boundary suite passed20/20 and web typecheck passed.
The affected production web build (including agent prebuild) passed. No full
workspace or disposable PostgreSQL suite was rerun. The report and
`HANDOFF-PAYPAL.md` are the only documentation files changed; the other four
changed paths are the three source defaults and test file named above.

Only owned PID6920 was gracefully stopped; current local profile is **PID7404**
at loopback3032, with the new build ID verified. Read-only authenticated browser
smoke passed with zero errors; evaluation/diagnostic/payment POSTs were blocked.
Fresh secret scans found zero matches (339 tracked/384 candidates/52 chunks),
and browser credential-name/PEM checks passed. A fresh TLS/read-only comparison
matched every persistent table and owner-auth fingerprint against the retained
baseline. The existing expired campaign/intent and historical financial records
are unchanged. No database schema/configuration/financial mutation occurred.

No actual Gemini request is authorized or performed here. After checks/reload,
one separately authorized verification should use the existing owner/CSRF-gated,
memory-only synthetic diagnostic in the UI. Do not evaluate the expired campaign,
reset previous `.tools/task05ct` live claims, or overwrite incident evidence.
The old diagnostic CLI also uses its own60s timer per native fetch; that is not
an overall workflow deadline or the source of the retained15s abort. The UI is
the existing memory-only entry point recommended here. Billing/quota/authentication
and real response validity remain live verification gates; this change is not
claimed to solve the external timeout. No deployment, commit or push occurred.

## Task05C-V — 2026-10-30 — stopped before live dispatch

The user requested a stop and fresh-session restart while prerequisites were
stalled. Exactly zero live Gemini workflows or Google requests were made for
Task05C-V; its single authorization remains unused. No HTTP response, live
latency, native tool turn, final proposal or independent policy result exists
for this task. The corrected60s default and eight-turn bound remain in source.

The complete offline synthetic evaluator and read-only database fingerprint
checks were attempted but did not return a verification result. Restricted
Node loading reported local EPERM; other local command sessions stalled and
were cancelled. A basic Node/TypeScript loader check passed, which does not
prove evaluator readiness. The final guard was inspected in source: full
envelope validation and local canary rejection precede network transmission.
Runtime proof for this diagnostic remains pending. Incident evidence was not
changed; its restricted directory could not be inspected from the local runtime.

No source, timeout, environment, application process or financial/database
record was changed by this task. No payment/provider operation or campaign/intent
creation was invoked. Fresh database equality could not be established and must
be checked on restart. Only this report and HANDOFF-PAYPAL.md were updated; no
full suite, typecheck, lint or build was rerun for documentation-only changes.

Restart at offline full-request/canary verification and the approved read-only
PostgreSQL fingerprint check. After both pass, run the existing memory-only
synthetic evaluator once with the60s per-turn deadline and no HTTP retries,
then perform the after-check. Do not reset prior live claims, reuse the expired
campaign or interpret the earlier mocked checks as Task05C-V live success.

## Task05C-V — completed live verification, 2026-10-30

The earlier stop was resumed using its unused authorization. Exactly one genuine
synthetic purchasing-agent workflow completed at18:07:02.460Z (19:07:02.460
Lagos), starting18:06:55.722Z: **6738ms total**, six model turns, five native tool
calls. All six Google responses were **HTTP200**, one candidate each,
finishReason STOP, no safety block. API authentication succeeded. No retry,
timeout, local abort or second independent live diagnostic occurred.

| Turn | Validated response          | Headers ms | Body complete ms |
| ---- | --------------------------- | ---------: | ---------------: |
| 1    | readSpendingMandate         |       1595 |             1663 |
| 2    | listApprovedMerchants       |        624 |              627 |
| 3    | compareEligibleOffers       |        764 |              768 |
| 4    | proposePurchase             |       1442 |             1446 |
| 5    | readAuthorizedPaymentStatus |        812 |              815 |
| 6    | VALID_FINISH                |       1082 |             1084 |

All native argument schemas and strict finish output validated. Canonical
proposal: **synthetic-us-weather-600,600 USD minor units ($6)**, from a
disposable1000-minor-unit ($10) synthetic mandate/catalog; **10/10 independent
Earmark policy checks passed**. The expired persistent campaign was not used
as model or purchasing authority. This is real inference over synthetic offers,
with ownerAuthorized=false, fundsReserved=false and persisted=false.

Before network access, the existing offline evaluator passed all six complete
serialized envelopes and continuations:15 cumulative tool-response validations,
33 harmless canary rejections and10 policy checks. The actual live final boundary
then independently recorded accepted6/rejected0 requests,15 cumulative validated
function responses and33 rejected local canary copies. Each pre-dispatch wrapper
confirmed these guard counters before calling fetch. No mutated canary,
historical financial record, credential value in prompt/context or unapproved
database record was transmitted. API authentication remained in its required
header. Raw requests, authentication headers, native signatures and model
rationales were not logged. These are bounded schema/canary guarantees; the
earlier disclosure is not retroactively undone.

Configuration presence was confirmed without displaying key/model values. The
effective default was60000ms per model turn including body reading, with existing
cancellation and at most8 turns (480s of model waiting plus processing). This
one invocation used HTTP maxAttempts1 in memory; no environment file changed.
Local restricted Node attempts reported EPERM; original ESM-entry preflights
eventually succeeded, and the installed tsx/cjs entry was used for the live run.
No loader defect is established. No new client, architecture, dependency, source
patch, campaign or diagnostic framework was added. The successful response
validates this live path; the remote delay behind the old15s abort remains unknown.

Fresh before/after TLS/read-only PostgreSQL fingerprints match all eight PayPal
tables and owner auth, counts4/2/21/1/4/4/1/0. Fresh semantic checks confirm
exactly one Task05C campaign and one unchanged pending intent, zero attempts,
cap1000/reserved0/consumed0/available1000. Immutable expiry remains
2026-10-29T19:15:34.339Z (20:15:34.339 Lagos), now expired. Historical failure,
completed US capture and original unresolved reservation are unchanged. No
financial/provider or persistent database mutation occurred; no live intent or
proposal result was stored. Previous live claims/incident evidence were preserved.

Only this existing report and HANDOFF-PAYPAL.md changed. The existing offline
harness created/reused a sanitized mocked proof for source digest
c5549b98e519b5e042bd3a77b7d4446cccfeb55947016f9027584b2e70e18533.
No full tests, typecheck, lint, build or browser smoke were repeated because no
application source changed; this session ran the relevant offline evaluator and
read-only preservation checks. No application restart, project-flint modification,
deployment, commit or push occurred. The single live authorization is consumed.
Diagnostic success criteria are met. Durable checkout remains blocked by expired
authority and requires separately authorized future campaign/payment work.

Final documentation whitespace validation and `git diff --check` passed.
