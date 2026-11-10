# Task05C-S — Gemini privacy boundary and regression verification

Date: 2026-10-29. This task authorizes synthetic inference
and code/test changes, never payment execution or new persistent records.

## Incident scope

The Task05C live conversation sent the shared payment-status tool's historical
Sandbox mandate/order/capture identifiers and accounting to Google in the next
native function-response turn. Synthetic task/merchant projection alone did not
isolate that shared tool. The former outbound denylist omitted historical
constants. This was a privacy-boundary defect, separate from the earlier fenced
finish-JSON parsing defect. No payment action was caused by that disclosure.

The exposure is established by the recorded tool sequence, local tool result and
conversation implementation. Raw Google requests were not retained, so the exact
extent of earlier Task05B disclosure cannot be reconstructed. Do not infer that
Google received credentials: existing evidence identifies payment metadata;
the API key belonged in the authentication header. Do not claim provider-side
deletion or retroactive remediation. Earlier incident evidence and the original
append-only pending intent remain intact.

## Final outbound boundary

`web/src/server/paypal/gemini-boundary.ts` validates the complete native
generateContent envelope immediately before each HTTP attempt, including retries.
It requires the official endpoint, exact header names and authentication value,
trusted system/tool definitions, bounded generation settings, an approved
synthetic context and strict result DTOs for each of the five declared tools.
Unknown context/envelope/nested result fields fail closed. Context schemas admit
only the bounded fictional fixtures and synthetic catalog, never arbitrary
database projections. Real campaign and historical identifiers are rejection
values used locally; they are never appended to prompts.

Both durable campaign versions use synthetic model identities. Local independent
authorization still uses the real immutable mandate. Payment status sent to the
model contains only current proposal state and disabled execution flags.
Natural text is bounded and checked for forbidden values, encoded values,
credential/account/path/URL patterns and opaque identifier material. Native
function-call arguments remain schema-validated. Conversation continuation must
match content observed in the same model session, preserving native response IDs
and thought signatures; substituted history and mismatched responses are rejected.
HTTP errors produce fixed classifications; raw provider error bodies do not
become retry context or logs. Retry attempts pass the same final validation.

The generic adapter now requires an outbound policy in **every** profile. The
earlier profile-only requirement was tightened after final audit to close a
profile-off bypass. Production legacy EVM Gemini sessions have no approved DTO
policy and are unavailable until one exists; their authenticated historical
views remain compatible. Session/protocol tests explicitly inject mocked models
or mocked-transport policies. No permissive policy is installed in production.
Legacy model-probe/PowerShell generation is blocked in the PayPal profile;
outside it, their direct READY/count probes contain only fixed harmless text.
Legacy EVM smoke generation through the generic adapter now fails closed without
a policy. No legacy live tool was invoked in this session. This intentionally
changes legacy live-inference availability; PayPal synthetic inference retains
the strict factory policy regardless of profile flags.

The boundary executes harmless canary mutations against copies of each pending
request: unknown database fields, changed system text, contaminated initial
observations, and an extra historical-payment field on every function-response
turn. Rejected copies never reach the network. Counters distinguish these probes
from actual accepted/rejected requests. This proves specified rejection cases;
it does not claim universal detection of arbitrary encoded secrets or establish
a provider-side data-retention policy.

## Regression investigation

The two prior failures remain historical failures, not erased by reruns.

- PostgreSQL: the prior trigger test surfaced `POSTGRES_UNKNOWN` instead of the
  expected immutable-terms rejection. The complete disposable suite passed
  **20/20** while the root suite ran concurrently in this session. Tests use a
  UUID namespace, exact migration checksum, TLS/target checks and ownership/OID
  guarded cleanup. No shared persistent test namespace was found. Sanitized
  diagnostics now distinguish known client timeout/disconnection messages and
  report only operation class and elapsed time. The original failure was not
  reproduced; a transport timeout remains a hypothesis, not an established cause.
- Legacy security demo: two complete agent runs passed **173/173** each under
  overlapping PostgreSQL/web workload. Anvil processes use distinct ports,
  fresh accounts and unique journals. No concrete isolation defect was found.
  Failed synthetic scenario/check labels now accompany the former generic
  assertion error. Assertions, deadlines and test retries remain unchanged.
- The deliberate contention run produced a **different** failure: a legacy
  `gemini-sessions` persistence test exceeded its existing five-second test
  timeout (5.797 seconds). It uses unique filesystem state and durable synchronous
  writes/fsync. Resource contention is plausible but not established as the cause
  of either historical failure. The next root run passed contracts176 and agent174,
  then failed web423/32 failures/26 skips. Twenty-one failures came from an
  overstrict newly added text rule rejecting a valid long policy code; replacing
  it with an explicit permitted-code enum fixed that confirmed implementation
  defect. Remaining failures were persistence/RPC/worker-shutdown timeouts.
  The six affected boundary/campaign/session/handover suites subsequently passed
  60/60 together. No timeout was increased. Later complete-suite results appear below.
- A confirmed additional defect was found in graceful worker shutdown: a request
  active when `server.close()` started returned 503 but advertised keep-alive.
  Its socket could then delay close until the idle timer. A regression using an
  explicit keep-alive client and a 60-second idle timer failed immediately on
  `keep-alive` versus `close`, without increasing the test deadline. Responses
  during shutdown now set `Connection: close`; all five handover tests pass.
  The test also closes sockets in `finally`, preventing leaked test resources
  on assertion failure. This explains the observed handover timeout, not the
  historical PostgreSQL/security-demo errors.
- The database-enabled broad rerun also observed a sanitized client read timeout
  after 15,001 ms during an UPDATE in the disposable capture-once concurrency
  test. This is actual timeout evidence, not proof of a trigger defect or proof
  of the old failure's cause. Its PayPal gateway is mocked. That broad run's
  legacy Anvil setup also exceeded its existing 30-second hook deadline; 29
  cases did not execute. Test deadlines are unchanged.

That expanded run completed with contracts176 passed, agent145 passed/29 not
executed after the setup failure, and web474 passed/2 failed/6 opt-in skipped.
Web failures were the pre-fix handover test and capture-once concurrency: every
caller rejected after the observed timeout. No capture retry or claim bypass was
added. `scripts/paypal-db-test.ts --capture` now selects the two disposable
capture-once cases, and an all-rejected failure reports sanitized error categories
only. The final complete normal run, after the shutdown and unconditional boundary
fixes, passed contracts **176**, agent **176**, web **457**, with **26 opt-in
skips**. This is a green normal suite, not a claim that the earlier expanded
database run succeeded. The subsequent isolated capture run passed **2/2**
(18 nonselected cases). That confirms both concurrency/restart and uncertain-POST
handling passed independently; it does not establish why the earlier UPDATE
timed out. No transport retries, deadlines, claims or payment policy were weakened.
The original trigger test passed in both full disposable runs; the original
security-demo assertion failure did not reproduce. Their precise causes remain
unconfirmed.

## Evidence and preservation

Before changes, a read-only repeatable-read PostgreSQL inspection fingerprinted
all eight persistent tables and the local owner-auth file. Counts were merchants4,
attempts2, audit21, environment1, financial idempotency4, mandates4,
migrations1, webhook-events0. Fresh comparison matched every table fingerprint and
owner-auth hash. A separate semantic read verified exactly one creation event,
one pending intent, zero campaign attempts, ACTIVE/unexpired, cap1000/reserved0/
consumed0/available1000, and correct immutable owner/agent/merchant/expiry binding.
No production-schema migration is part of this task.

Existing local incident evidence and owner-auth files were restricted with Windows
ACLs to the current owner and SYSTEM. The earlier wording of 15 existing items
was imprecise: final ACL inspection checked 17 items including the directory
and new evidence, with zero unexpected access rules. File-content hashes matched
before/after permission changes. New
hash-only baseline and sanitized live verification artifacts live under ignored
`.tools/task05cs/` and inherit restricted access. Historical audit/intent content
was not rewritten or removed.

## Validation status

- Final normal root suite: **809 passed** (176 contracts +176 agent +457 web),
  **26 opt-in skipped**. Those skips are 20 PayPal PostgreSQL cases (separately
  exercised as above), five legacy PostgreSQL cases (not run against the forbidden
  original database), and one optional genuine Sandbox OAuth case. Genuine PayPal
  webhook delivery remains outside this verification; mocked gateway tests are
  never represented as actual payment capture or webhook delivery.
- Complete-envelope interception/canary regressions: **15/15 passed**, including
  six accepted complete synthetic requests, all five tool-response turns,
  15 cumulative response validations and 33 rejected local canary variants.
  System/schema/context/history/ID/signature tampering, encoded/sensitive prose,
  poisoned retry, missing boundary and retained failure metadata are covered.
- Final root TypeScript passed. Its preceding attempt failed only because the
  new no-policy test fixture explicitly assigned an optional property undefined;
  deleting that property fixed exactOptionalPropertyTypes compatibility. The
  corrected adapter file passed all 37 tests. Standalone safety/DB-selector script
  TypeScript also passed.
- Controlled live synthetic inference: **attempted once; MODEL_TIMEOUT**, with
  exactly one actual network dispatch and no recorded HTTP response. Authentication,
  candidate count, finish reason, native calls and policy decision therefore
  remain unverified in this run. Dispatch could only occur after the initial
  complete-envelope and three local canary checks returned successfully; this is
  a code-path deduction from the dispatch count, not a retained boundary-counter
  snapshot. No live tool-response continuation was reached or verified. The
  initial harness lost partial diagnostic counters when inference threw; it now
  retains typed progress counters/HTTP classifications on failure, with a new
  mocked regression. The saved failure artifact was preserved unchanged. The
  retained claim prevents another inference on replay, and no second run was
  attempted. No post-fix live inference success is claimed.
- Original-source integrity: passed for HEAD, refs, status, diff and 305 file
  hashes. Git emitted the existing CRLF normalization notice for historical HANDOFF.
- Root production build, final v2 web production build and repository formatting passed. Actual-value credential
  scan found zero matches across 339 tracked, 379 candidate files and 52 browser
  chunks; browser secret-name/PEM boundary also passed after the v2 build. Final
  root typecheck and warning-free lint passed; Solidity formatting also passed.
- Authenticated read-only browser smoke passed after one unsuccessful attempt:
  owner gate, saved campaign/proposal, zero accounting and disabled payments,
  with zero browser errors. That initial browser failure's raw output was
  suppressed because locator diagnostics can quote filled credentials; the
  smoke script now catches failures with a fixed safe category. No initialize,
  evaluate or diagnostic POST was allowed by its request interception.
  The final v2 smoke also passed with zero browser errors and the same saved
  campaign, disabled payments, zero reserved and zero consumed.
- Current local server: loopback3032, owned PID2360, runtime
  `task05cs-synthetic-v2`; previously reported PID8564/listener were absent.
  The intermediate v1 PID6668 was stopped using verified listener/epoch/cwd
  ownership before the final build reload.
  The launcher verified the new compiled marker and epoch against the owner gate.
  Auth credentials were preserved; session epoch rotated as designed.

Final post-reload read-only PostgreSQL hashes again matched the pre-task baseline
for all eight tables and owner authentication. The campaign/mandate/intent and
all historical rows are unchanged. No actual PayPal order/capture/refund/payout/
cancellation or reservation mutation occurred. Disposable test schemas used
mocked gateways and were cleaned up using the existing ownership/OID checks.

## Remaining limits

The requested full live remediation proof is **not complete**: the one permitted
synthetic Google attempt timed out, and authentication, actual native response
schema, continuation signatures and independent proposal policy could not be
confirmed live. The completed normal suite and mocked boundary proofs do not
replace that evidence. A further controlled inference requires a separately
authorized run, retaining the existing failure/claim artifacts.

The original two intermittent failures remain unexplained; the current run
adds concrete client-timeout evidence and a separately confirmed/fixed shutdown
defect. The passing isolated DB rerun does not resolve broad-run PostgreSQL
transport/timing stability. Legacy Anvil setup also timed out under the combined
workload. Do not represent these results as universal test stability or as
authorization for financial execution. No deployment, commit or push occurred.

The existing Task05C campaign and non-financial intent must remain unique. Its
expiry is immutable at 2026-10-29T19:15:34.339Z (20:15 Lagos). This verification
must never extend or bypass that expiry. The existing US completed payment,
original unresolved Nigerian reservation and failed agent05a journal must remain
unchanged. All financial execution remains disabled.
