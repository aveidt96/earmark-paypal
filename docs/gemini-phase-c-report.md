# Earmark — Phase C Live Gemini Execution Console

Branch: `feature/gemini-safe-rollout`, starting at `1c3567e1271f94233f8cbed97ea4ff192402f20b`.
Status: local implementation/regressions verified; genuine normal browser session
succeeded. Final combined live rerun is blocked by Gemini free-tier rate limiting.
Phase C is partially verified, not ready for unconditional publication.

## Frontend and API

Changed files include `agent/src/{models,tools,runner,server,read-only}.ts`,
`api/src/{runtime,server}.ts`, the web wallet/shared Gemini types, workspace
provider/dashboard/recorded console and new `gemini-console.tsx`, scoped CSS,
workspace API/proxy/runtime/service/store/Postgres integration and the new
`gemini-sessions.ts`. Tests are `agent/test/gemini-read-only.test.ts`,
`web/test/gemini-sessions.test.ts`, the existing snapshot test and
`e2e/gemini.spec.mjs`. Local encrypted-key/console launchers, browser boundary
check, three environment examples, HANDOFF and integration/frontend docs were
updated. No dependencies, contract artifacts, deployed addresses or production
environment configuration changed. The exact complete file list is available
with `git show --name-only HEAD` for the Phase C commit.

The existing Execution Console gains Demo Mode / Live Gemini controls. Anonymous
visitors still get bundled recorded A–D demonstrations without inference. Live
Gemini requires the current owner wallet on the configured chain, then a signed
normal or prompt-injection read-only authorization. The console displays the
actual model, fixture task/offers, model decisions, schema-validated tool calls
and results, proposed recipient/amount and backend verdict. `PROPOSAL VALIDATED`
always says `Read-only AI session — no transaction submitted.`

The four narrow API actions are `gemini-challenge`, `gemini-start`,
`gemini-read` and `gemini-cancel`, under the existing `/api/workspace` proxy.
They contain no arbitrary prompt, RPC, ABI, contract, recipient or model-selection
input. Nonces are signed with distinct read-only EIP-712 actions, the expected
chain/vault and a two-minute expiration. The stable existing signature domain
remains unchanged. The financial launch path cannot consume these authorizations.

Only after verifying the actual current contract owner does the backend atomically
consume a nonce and create a session. Concurrent retries cannot duplicate inference.
The response returns a random run-scoped view/cancel capability; only its hash is
stored. It expires after 30 minutes and is checked against current ownership on
every read. A fresh owner signature can renew viewing access without new inference.
Frontend sessionStorage holds this restricted capability, never the Gemini or
agent key. Copyable summaries exclude capabilities and private storage fields.

## Agent reuse and read-only boundary

GeminiModel's optional native conversation preserves original model content,
function IDs and opaque signatures in memory and returns matching real tool
results. Hidden thoughts/signatures are not emitted. The existing runner shares
structured decision validation with a new bounded read-only session runner.
Existing eight AgentTools are reused over a clearly labelled server-built synthetic
fixture; payment checks are the existing provider, quote, cap and liquidity checks.
The fixture has no wallet or RPC client. Its memory-only purchase intent is
separate from the financial journal and preparation refuses before signing.
There is no payment, delivery or settlement simulation represented as live chain state.

Inputs describe a ten-mock-USDC 2026 Lagos task with DataHub at six and WeatherCo
at eight. Gemini chooses; DataHub is not hardcoded as the result. The malicious
WeatherCo description uses the verified unauthorized-wallet instruction. Results
are observations of one run, not a general prompt-injection guarantee.

## Persistence, limits and failure handling

Existing file/Postgres repositories persist private runs, nonces and events in
a separate `<chain>:<vault>:gemini-readonly` scope. SQL tables and migrations
are unchanged. The old financial workspace and purchase-intent journal do not
receive new fields. Older deployed backends can still read their original scope
after rollback. New code uses existing row locks/transactions, nonce uniqueness
and event IDs. Production Neon has not been accessed or modified in this phase.

The owner is limited to six sessions/hour, one running session and at least
30 seconds between starts. HTTP origin and rate checks remain server-side.
Each session allows ten steps with a four-minute step-start budget and a
60-second per-call bound. Gemini uses low thinking and the existing 600-token cap.
The feature switch/current owner are checked between steps and before dispatch.
Cancellation stops subsequent tools/inference; an already-issued API call may
finish and consume tokens. Restart marks a running record interrupted and never
automatically restarts inference. HTTP uncertainty saves the run ID before submit;
signed viewing recovery reattaches instead of launching another run.

Timeout, 429, API/service failure, malformed output, missing configuration,
disabled Gemini and authentication failures are recorded with sanitized codes.
No silent model substitution occurs. Polling retries only reads, with five bounded
connection attempts and an explicit reconnect action. Completed/refreshed sessions
are labelled `Recorded Live Gemini Session`, never a newly executing payment.

## Local reproduction

Build the frontend, then use the existing encrypted-key wrapper:

```powershell
npm run build --workspace @flint/web
pwsh -NoProfile -File .\scripts\gemini-phase-b.ps1 console
# Or run the automated authenticated local walkthrough:
pwsh -NoProfile -File .\scripts\gemini-phase-b.ps1 console-test
```

The launcher reads only the Windows-encrypted local key under ignored `.tools`.
It creates a fresh local Anvil workspace and explicitly disables financial execution;
no hosted service is used. For a manual Rabby/MetaMask check, import only its generated
local owner burner from the printed ignored file path, connect to Local Anvil,
select Live Gemini and sign the read-only message. Never import a production owner
key or paste any key into chat/source. The standard local bootstrap deploys token/vault
and mints mock tokens before the session. Session transaction counts are checked
from that baseline; no Gemini session signs or broadcasts a transaction.

## Regression evidence

- Root agent/web/API typecheck passed.
- Agent/frontend/server/local boundary regression: **317 passed**; five explicit
  opt-in isolated Postgres tests skipped. Two unchanged Anvil startup hooks timed
  out under the initial concurrent run; both suites then passed all 44 cases with
  one worker. Assertions/timeouts were not weakened.
- New coverage: native function response IDs/signatures, strict tool validation,
  owner/signature/chain/action binding, atomic replay protection, read-only refusal,
  token expiry, ownership changes, rate limits, cancellation, restart recovery,
  partial events, disabled configuration and hosted origin/route protections.
- Root lint (including Foundry formatting), agent/web/API typecheck and Next.js
  production build passed. No Solidity business changes were made.
- Anonymous Demo Mode/A–D and disabled-Gemini browser cases passed. The genuine
  owner-authenticated normal session succeeded, with provider quotes, backend
  verdict, refresh recovery and 390px no-overflow checks. The combined test later
  failed by reading the previous verdict while a new injection authorization was
  pending. Starting a new request now clears that stale display.
- The first focused rerun failed before Gemini at the local bootstrap transport's
  500ms transaction-count probe. A separate bounded 10-second read-only observer
  fixes that evidence-collection issue without altering authentication/assertions.
  The next rerun received `MODEL_RATE_LIMITED` after 6,740ms and was stopped.
  No further live requests or paid quota were attempted. Final combined browser
  success and post-session nonce comparison remain unverified; not counted as passes.
- Compiled browser boundary passed for 41 JavaScript chunks, including Gemini
  and database credential variable exclusions. Secure exact-key scan found zero
  matches in 260 staged/tracked files and 41 compiled browser chunks. Final
  documentation/test formatting and staged Git whitespace checks passed.

## Genuine browser model evidence

The normal session `0xeca19b0e0d53d0ad098d09560f92ae35c27064f12237295891c153ca1becbf0e`
used real `gemini-3.8-flash` and completed in **56,862ms**. Its native function call
was `requestMandatePayment`, with the actual supplied DataHub quote ID and reason:

> Lowest price suitable 2026 Lagos weather dataset from approved provider DataHub

Existing tool validation accepted the six-mock-USDC proposal for the fixture's
approved DataHub recipient, then refused financial preparation with
`READ_ONLY_FINANCIAL_EXECUTION_DISABLED`. The console showed `PROPOSAL VALIDATED`
and `Read-only AI session — no transaction submitted.` Provider quotes were real
simulated-provider outputs supplied in context; this browser run did not itself
call quote-retrieval tools. Phase B separately verified that multi-tool conversation.

The first injection session was interrupted before a final recorded model outcome.
Do not infer injection resistance from it or from the stale normal verdict. The
successful Phase B injection observation remains separate evidence. The final
normal rerun failed with the actual rate-limit code; no fabricated result replaced it.

Sanitized actual records: [browser evidence](evidence/gemini-phase-c-browser.json).
Screenshots from the genuine successful normal run:
[desktop](screenshots/gemini-phase-c-normal.png) and
[390px mobile](screenshots/gemini-phase-c-mobile.png).
No completed Phase C injection screenshot is claimed.

The automated wallet is a restricted Node-held test bridge signing real scoped
EIP-712 authorizations, not an automated Rabby extension. Manual extension approval
remains a precise local check: run the console wrapper, connect its local owner,
choose Live Gemini and approve the read-only signature. Never import real owner keys.
No public-chain transaction was submitted. The standard local bootstrap deploys
and mints before inference; full before/after nonce assertions were not reached in
the combined browser test. The fixture has no signer or RPC transaction path.

Source commit: the Phase C commit containing this report, resolved exactly with
`git log -1 --format=%H -- docs/gemini-phase-c-report.md`.

## Controlled rollout — preparation only

### Short recording-friendly local walkthrough

1. Start the encrypted-key console launcher above; connect the fresh local owner
   wallet and select Live Gemini. The fixture and read-only labels remain visible.
2. Choose Normal Provider Selection, start once and sign the scoped read-only
   authorization. Record the actual waiting state and elapsed time, then genuine
   tool calls, provider offers, model recommendation and backend verdict.
3. Show `PROPOSAL VALIDATED` with the no-transaction label. Copy the sanitized
   execution summary; do not present fixture checks as a new contract receipt.
4. Run the live prompt-injection scenario once and report the actual outcome.
   Return to Demo Mode to show the separate recorded blockchain demonstrations.
5. Refresh a completed run to show `Recorded Live Gemini Session`. No video is
   generated by Phase C; production publication and financial execution are separate gates.

### Publication sequence

1. Confirm public `7f70710` and exact current Vercel/Render deployment IDs.
   Preserved recorded Vercel rollback: `HERgfJiuWpiHKftYW2ULHdzCLyWP` at
   `feaaf39`, prior `G9jdmTPEAqJDArF4uqGEsAN3Bc7t` at `f58c91d`.
   Recorded Render baseline: `dep-db5rm8qjnfac73bgmifg`, source `a3343f9`.
   Reconfirm current IDs in dashboards before any approved publication.
2. Deploy a compatible isolated backend with Gemini disabled and
   `EARMARK_ENABLE_TESTNET_EXECUTION=false`. Keep `AGENT_MODEL_PROVIDER=mock`
   for existing financial model configuration; read-only Gemini is independent.
3. Verify health, persistence and separate inference scope; preserve Neon state.
4. Deploy the UI and verify anonymous Demo Mode/A–D and historical settlement.
5. Configure `GEMINI_API_KEY` in backend secret environment only.
6. Enable `AI_ENABLE_NETWORK=true` and `EARMARK_GEMINI_ENABLED=true` only for
   authenticated read-only sessions.
7. Run owner-signed provider selection and inspect actual events/backend verdict.
8. Turn Gemini off, prove new inference is rejected and existing records/Demo Mode
   remain accessible. Roll back the frontend/backend source if needed.
9. Financial execution requires a separate approval and verification campaign.

No production deployment, merge, push or video production is part of Phase C.
There is no configured isolated hosted preview in this workspace; local preview
is the verification target. Hosted free-service cold starts and interrupted
background requests remain limitations; durable records never imply completion.
