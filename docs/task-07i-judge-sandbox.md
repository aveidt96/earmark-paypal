# Task07I — Interactive judge sandbox

2026-11-04. Local implementation only; no deployment, Git publication, real
Gemini request, PayPal operation or database connection/write.

## Actual experience

On the default Norway homepage, select **Judge sandbox** beside **Policy demo**.
Type an instruction and select **Evaluate instruction**. Each POST runs the
existing purchasing tools and canonical server policy with a fresh in-memory
synthetic $10 policy, a maximum $6 purchase and zero consumed/reserved funds.
It creates no campaign, payment attempt, durable intent or reservation.

The public planner is explicitly mocked/deterministic, not recorded output and
not Gemini. Its limited language parser recognizes numeric USD ceilings, minute
SLA limits and “backup”; the UI displays the interpreted constraints. Other
requirements are not claimed to be understood. Scope/override/financial-action
errors are instruction-boundary rejections, distinct from actual policy verdicts.
Natural-language text is never owner approval.

| Typed instruction                                                                          | Actual policy outcome                                                                 |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| Find the cheapest approved weather feed within $10 and 15 minutes. Do not execute payment. | Prime synthetic provider, $4; independent checks pass, human authorization required.  |
| Use approved backup only for weather data within $10 and 15 minutes.                       | Backup synthetic provider, $6; independent checks pass, human authorization required. |
| Find approved weather data for no more than $3 within 15 minutes.                          | No proposal; TRANSACTION_LIMIT_EXCEEDED, with per-offer rejection reasons.            |
| Find approved weather data within $10 and 2 minutes.                                       | No eligible offer; real objective/SLA rejection.                                      |

The existing four policy/security scenarios remain at Policies. Their canonical
verdicts remain normal authorization without PayPal execution, unapproved merchant,
invalid delivery commitment and budget exhaustion. Delivery checks validate offer
commitments/SLA, not delivered goods or a PayPal escrow mechanism.
Historical completed Sandbox receipts remain separately labeled on the existing
activity/mandate/payment views and the recent-activity card. They are not replayed.
Classic Light and theme persistence are retained; the new chat uses the existing
Norway interface.

## Authenticated local Gemini path

The judge endpoint is `/api/judge-sandbox`. It never calls owner checkout routes.
A separate judge cookie, credentials and CSRF session reuse the existing HMAC
authentication implementation; neither owner credentials nor owner sessions grant
judge access, and judge sessions cannot authenticate owner checkout.

To prepare a separately authorized local live test, use the public-demo build
on **http://127.0.0.1:3032**, bound only to loopback. Retain public-demo and all
financial-disabled flags. Configure server-only:

```dotenv
EARMARK_JUDGE_LOCAL_GEMINI=true
EARMARK_JUDGE_LOGIN_SECRET=<separate random judge access code, at least 32 characters>
EARMARK_JUDGE_SESSION_SECRET=<different random signing secret, at least 48 characters>
EARMARK_GEMINI_ENABLED=true
AI_ENABLE_NETWORK=true
GEMINI_API_KEY=<existing server-side key>
GEMINI_MODEL=<existing configured native-tool model>
AI_TIMEOUT_MS=60000
PAYPAL_BACKEND_ENABLED=false
PAYPAL_PAYMENTS_ENABLED=false
NEXT_PUBLIC_DEMO_ONLY=true
EARMARK_PUBLIC_DEMO_ONLY=true
```

Do not place secrets in NEXT_PUBLIC variables, Git or logs. No credentials are
created or changed by this task. Do not run this private profile on a public
interface, proxy or hosted service. Hosted flags unconditionally disable this
path. Default/hosted UI offers no local Gemini selector or judge login.

In the local judge selector, choose **Authenticated local Gemini** and log in
with the separate judge code. Submission reuses the existing Gemini native-tool
adapter, strict schemas, synthetic-only final transport guard and independent
policy engine. Policy-invalid requests are rejected before any billed inference.
Valid requests are filtered to eligible synthetic offers. The guard permits only
lower synthetic price ceilings (1–600 minor units); its $10 budget, identity,
catalog, privacy and tool allowlists remain enforced. Synthetic tool observations
no longer carry historical anchors, even internally.

Local bounds: 1,000-character instruction; 8,192-byte body; five-second body-read
deadline; eight model steps; at most 60 seconds per turn and 180 seconds for
transport overall; one HTTP attempt per turn; one concurrent local evaluation;
three evaluation submissions per judge session and twelve per process per hour. Local quotas
reset on restart and are **not distributed public admission controls**.

## Public live Gemini blocker

Public Gemini stays unavailable, including when keys or local flags are
accidentally supplied to Vercel. No environment switch enables hosted inference.
The public endpoint performs bounded deterministic work without a model/provider
connection or financial storage; requests are isolated and results are not saved.
Same-origin JSON, strict action/body schemas, size/read deadlines and immutable
policy ceilings are enforced server-side. Payment/owner endpoints retain their
existing public denials. Platform WAF/rate settings still need hosted verification.

Enabling external live Gemini requires a separately authorized implementation and
configuration of all of:

1. Hosted judge authentication independent of payment-owner credentials, with
   signed expiring sessions and CSRF protection.
2. A shared atomic quota/admission store used by every instance: per-session and
   global request/token/cost ceilings, bounded concurrency leases, expiry and
   fail-closed behavior on store failure. Reserve worst-case model usage before
   dispatch; release/reconcile usage without touching the financial ledger.
3. Explicit operator-approved Gemini cost limits (currently public allowance is
   zero), a dedicated server-only provider key/project and token/output limits.
   Billing alerts alone are not a hard spending cap.
4. Edge abuse controls/challenges and IP/request-rate protection, verified against
   the real hosting configuration. Confirm Preview and Production settings before
   any push that may trigger deployment.
5. Cross-instance concurrency/quota/failure tests, privacy interception and one
   separately authorized real inference. A successful local stub is not live
   validation or proof of public readiness.

No shared quota service, public auth service or production configuration was
provisioned; no database mutation was performed. Public live inference remains a
specific infrastructure/admission blocker, rather than an insecure feature flag.

## Verification

| Fresh check                   | Actual result                                                                                                                                                                                                                                                           |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Targeted offline tests        | 133 passed across8 files;19 judge cases plus114 existing auth/checkout/chat/policy/hosted/privacy tests; no skips.                                                                                                                                                      |
| Lint / formatting             | Repository Biome278 files,0 errors/0 warnings,187 informational notices; changed-source formatting passed.                                                                                                                                                              |
| Production build / TypeScript | Passed after the final privacy and loading-state fixes; existing agent prebuild + Next webpack with VERCEL=1 and read-only flags.                                                                                                                                       |
| Public browser smoke          | Passed9 routes at1440/1280/1024/390/375px; both themes/migration, navigation,3 actual homepage policy submissions, mobile SLA rejection,4 recorded and4 real policy scenarios, mocked Gemini UI states and actual hosted/owner denials. No overflow/runtime exceptions. |
| Local judge login browser     | Passed using separate synthetic credentials and an external-network-blocked temporary loopback server. Session/CSRF verified; owner endpoint403; no evaluation submitted, no provider request.                                                                          |
| Credential / client boundary  | 339 tracked,414 candidate files,54 browser chunks; zero configured-credential matches, secret env ignored. Client boundary includes new judge secret names and passes.                                                                                                  |
| Source / Git                  | Agent workspace resolves inside this checkout; project-flint status unchanged; nothing staged. This task performed no Git mutation.                                                                                                                                     |

Public results in the table above came from actual HTTP evaluations through the
Norway UI and the real policy engine, not intercepted responses. The separate
loading/model-error/comparison UI cases explicitly intercepted Gemini transport;
those are mock evidence. Native Gemini continuation/argument/privacy tests also
used offline transports; no new Google authentication or inference success is
claimed. Public live inference remains unavailable.

Snapshots inspected locally (ignored):

- .tools/task07i-judge-desktop.png — actual $3-limit rejection and comparison.
- .tools/task07i-judge-mobile.png — actual2-minute SLA rejection.
- .tools/task07i-local-judge-auth.png — authenticated local judge, no model submission.

Investigation failures retained: the first test expected the wrong existing
budget code (72 passed/1 failed); corrected to BUDGET_EXHAUSTED. A new privacy
regression then caught static historical receipt IDs in the deterministic judge
trace (50 passed/1 failed). All judge evaluations now select synthetic-only
tools, preventing those anchors from being attached or returned; no such data
was sent to Google or deployed. The final133-test run passes. Six new non-null
assertion lint warnings were corrected without suppressions. An initial raw-node
secret-check invocation lacked the TypeScript loader; the documented --import
tsx scan passed. An initial browser run exercised the actual judge cases then
failed on a stale mobile tab selector; the corrected complete smoke passed.
A second build verified the final source after the privacy/loading fixes.

No database integration suite was run because this task forbids database
mutations. No campaign, durable intent, financial reservation, owner approval or
PayPal operation occurred. Historical financial/incident evidence remains intact;
the judge route never opens a financial repository or owner-auth configuration.
Browser servers were owned temporary local processes and were closed after checks.
Norway styles, fonts, logo and Classic Light theme implementation were not changed.

## Files changed

- web/src/app/api/judge-sandbox/route.ts — new isolated endpoint.
- web/src/server/paypal/judge-http.ts — strict public policy branch, hosted live denial, separate bounded local judge auth.
- web/src/server/paypal/judge-sandbox.ts — limited instruction parsing and existing tool/policy/native adapter reuse.
- web/src/server/paypal/agent.ts — tighter server-owned synthetic requirements, separate synthetic identities and synthetic-only observations.
- web/src/server/paypal/gemini-boundary.ts — allow only lower positive synthetic ceilings, retaining the600-minor maximum and all other allowlists.
- web/src/server/paypal/test-auth.ts — separate judge cookie namespace; existing owner behavior preserved.
- web/src/lib/paypal-agent.ts — honest deterministic source label and optional tool trace.
- web/src/components/purchasing-chat.tsx — typed judge submissions, scope/policy/errors, comparison/trace and local judge login; no judge checkout control.
- web/src/components/gemini-console.tsx — judge tab, synthetic budget and source-aware policy rail; historical receipt remains separate.
- web/test/judge-sandbox.test.ts — instruction variation, denial, privacy/native transport, isolation/auth, concurrency/quota and body boundaries.
- scripts/preview-smoke.mjs — actual judge browser requests and explicit mocked Gemini UI regression checks.
- scripts/paypal-secret-check.ts and scripts/check-web-boundary.mjs — cover judge secrets.
- docs/task-07i-judge-sandbox.md and HANDOFF-PAYPAL.md — implementation, configuration, evidence and limitations.

No dependency, framework, financial-service, deployment or Git-publication change.
Task07H's historical publication inventory predates this work; review the current
working tree before any separately authorized publication.
