# Task 05C — fresh agent campaign preflight

Session: **2026-10-28**. The first preflight was incomplete; the continuation
below created the campaign and records a privacy incident and subsequent fix.

The user authorized exactly one new $10 USD persistent Sandbox preparation
campaign, with a $6 per-purchase limit and no payment or reservation. That first
session performed preflight and restored the existing local profile, but did
not implement or create the new campaign. There is no Task 05C campaign ID,
mandate ID, expiry, proposal, or new policy result to report.

## First preflight observations

- A read-only PostgreSQL transaction authenticated over verified TLS to the
  configured direct Neon target. Its database name, Sandbox environment,
  approved migration checksum and absence of legacy database objects matched
  the project's safety checks. The configured local owner and confirmed US
  Sandbox merchant binding matched the old agent mandate.
- The eight PayPal table fingerprints matched the Task 05B baseline. The
  database contained three mandates, two payment attempts, four financial
  idempotency rows and 18 audit entries. The original mandate retained 600
  reserved / 0 consumed minor units; the completed US mandate retained 0
  reserved / 600 consumed. The agent-05a mandate retained 0 reserved / 0
  consumed and its STARTED and FAILED / INVALID_MODEL_RESPONSE entries.
  No Task 05C campaign has been added since the matching Task 05B baseline.
- The existing loopback profile was initially absent from port 3032. The
  existing guarded launcher started it as **PID 808** with execution and
  reservation disabled. Unauthenticated API access returned 401, local owner
  login returned 200, and the authenticated read-only view returned 200 and
  showed the old failed mandate. Its process epoch matched the launch record.
- Gemini key and model configuration were present. The fixed parser is present
  in source; the earlier Task 05B real Gemini evidence remains historical. No
  Gemini request was made during this session.

## Work identified at preflight

The active configuration, mandate identity, session cookie, audit markers,
advisory locks and proposal identities are currently tied to `agent-05a`.
The old campaign cannot be reused or reset. A new version requires independent,
durable and retry-safe campaign identity and initialization, with concurrency
tests before any persistent insertion. The existing durable inference path
sends campaign observations to Gemini; the user's earlier instruction limits
external diagnostics to synthetic data. A fresh workflow must preserve that
boundary while independently validating any proposal against the actual new
mandate locally. The checkout UI must then display the new campaign and its
non-financial status.

No application code was modified in this session. The requested Gemini,
PayPal/security, disposable PostgreSQL, typecheck, lint, formatting, build and
secret scans were not rerun. No order, capture, reservation, settlement,
refund, payout, cancellation, new mandate, or persistent campaign write was
performed. A future session must complete and test the implementation before
creating the authorized one campaign, then verify its accounting and unchanged
historical rows using fresh PostgreSQL reads.

`git diff --check` passed. A Markdown formatting check was interrupted after
it produced no output; formatting was not verified. The first read-only
database inspector was interrupted after a long wait; its subsequent retry
completed and verified the baseline successfully.

## Continuation: actual campaign and proposal

The authorized operation created exactly one `agent-05c-v1` campaign:

- Campaign: **556bce55-e74a-567f-8516-a80553b52c57**.
- Mandate: **065af6d7-98d7-5262-a6a1-7fb33c2a1ddc**.
- Created: **2026-10-28T19:15:34.339Z**; expires exactly 24 hours later at
  **2026-10-29T19:15:34.339Z**, or **20:15:34.339 on October 29 in Lagos**.
- The configured local owner, new agent and confirmed US Sandbox merchant match
  the stored bindings. The catalog is synthetic; it is not merchant inventory.
- An authenticated creation retry returned the same campaign, mandate and expiry.
  A fresh PostgreSQL read found one creation event, zero attempts, cap **1000**,
  reserved **0**, consumed **0**, and available **1000** USD minor units. All
  pre-existing table rows and the owner-auth file matched Task05B fingerprints.

Real Gemini inference, using a synthetic model mandate and catalog, returned six
HTTP 200 responses with five native tool calls and a structured finish. The
independent local policy checks all passed for the canonical synthetic **600
USD minor-unit** offer. The application persisted one non-financial intent
**570086fa-b2ae-5b50-85a2-107e2446ddc7**, in
`HUMAN_AUTHORIZATION_REQUIRED` state, with no financial authorization,
reservation, order or capture. A fresh database read verified one pending
intent and zero payment attempts.

### Privacy incident and correction

Although the model's mandate, owner, agent and merchant were synthetic, the
shared `readAuthorizedPaymentStatus` tool response also included the old Sandbox
mandate, order and capture identifiers and their accounting. That tool result
was included in the following Gemini request. This violated the user's explicit
synthetic-only restriction. The outbound guard excluded the local login/session
secrets and the new campaign's real owner, merchant, agent and mandate IDs.
The Gemini key was used for Google authentication. No payment action occurred.

The server was stopped after discovery. The synthetic-only tool response now
omits historical data, and the outgoing-request guard rejects all known
historical mandate, attempt, order and capture IDs. Tests inspect every request
for those IDs and real campaign identities. The earlier Task05B statement that no
real historical observations were sent needs qualification: it used the same
shared tool output, but raw prior request bodies were not retained. Do not erase
the append-only intent or change historical financial records to conceal this.

### Validation during continuation

- Targeted agent/privacy/protocol tests: **38 passed** after the correction.
- Full PayPal/security suite after the correction: **267 passed, 21 opt-in
  skipped**. The PostgreSQL cases were exercised separately as described below.
- Gemini adapter/parser: **65 passed**.
- Disposable PostgreSQL full run: **19 passed / 1 failed**; the existing
  financial trigger test returned `POSTGRES_UNKNOWN` instead of its expected
  immutable-terms error. Its focused retry passed unchanged. The new Task05C
  concurrent creation/restart test passed in the full run and focused reruns,
  including after the privacy fix. Cause of the initial failure is unknown.
- Corrected web production build, root typecheck, lint, formatting, verifier typecheck and
  authenticated browser smoke passed. The corrected server runs at
  `http://127.0.0.1:3032/agent-checkout`, PID **8564**, with payment disabled.
  The browser verified the saved live proposal and policy result. Credential
  scanning found zero matches across 339 tracked files, 374 candidate files and
  52 browser chunks; the browser credential-boundary scan also passed.
- Full workspace test command: Solidity **176 passed**; agent **165 passed, 8
  skipped** because the legacy security-demo suite failed its setup with
  `DEMO_ASSERTION_FAILED`; web **440 passed, 26 skipped**. The overall command
  failed. The unchanged legacy security-demo suite then passed **8/8** in a
  separate run; the cause of the first failure is unknown.
- No second live Gemini inference was performed after the privacy correction;
  the previously saved proposal remains append-only. The corrected request
  boundary is verified by mocked native transport tests, not a new live call.
- Read-only source-integrity verification passed for the original checkout's
  HEAD, refs, status, diff and 305 file hashes. Git printed a CRLF normalization
  notice for its historical HANDOFF; no original file was modified.
- No PayPal orders, captures, reservations, refunds, payouts, cancellations,
  deployments, commits or pushes occurred.

## Implementation inventory

The campaign's version, distinct cookie, mandate, agent, proposal identity and
journal were implemented in `web/src/server/paypal/agent-checkout-config.ts`,
`agent-checkout.ts`, `agent-checkout-postgres.ts`, `agent.ts`, `test-auth.ts`
and `agent-diagnostic.ts`, together with `web/src/lib/agent-checkout.ts` and
`web/src/components/agent-checkout.tsx`. The launcher and preparation tooling
were updated in `scripts/paypal-agent-serve.ts` and
`scripts/paypal-agent-prepare.ts`; `scripts/paypal-db-test.ts` gained focused
disposable-test selectors. New read-only verification, graceful-stop fallback
and browser tools are `scripts/paypal-agent-05c-verify.ts`,
`scripts/paypal-agent-stop-direct.ts` and `scripts/paypal-agent-05c-ui.mjs`.
Regressions were added or extended in `web/test/paypal-agent-campaign05c.test.ts`,
`web/test/paypal-agent-recovery.test.ts` and
`web/test/paypal-database.integration.test.ts`. `HANDOFF-PAYPAL.md` and this
report record the results and the privacy incident.

The campaign has no payment authority. Before any separately authorized Sandbox
purchase, implement and independently verify owner financial consent, reservation
and approved checkout flow, with separate buyer approval and capture authority.
Genuine webhook delivery and the intermittent test failures remain open checks.
