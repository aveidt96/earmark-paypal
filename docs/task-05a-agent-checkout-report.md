# Task05A — Gemini checkout preparation

Session: **2026-10-27**. **PARTIAL: implementation and non-live validation complete;
actual Gemini inference remains blocked by missing credentials, explicitly deferred
by the user. No new PayPal payment or persistent financial reservation occurred.**

## 1. Live Gemini evidence and current blocker

A presence-only check of the server environment loaded from ignored
`web/.env.local` found **no `GEMINI_API_KEY` or `GEMINI_MODEL`**, with Gemini/network
flags disabled. No credential values were printed. The user explicitly instructed
us to **continue without the live key, add it later, and include this in the summary**.

Accordingly:

- **Actual Google Gemini calls: zero.** No live response ID, model-generated live
  recommendation or live checkout intent is claimed.
- `npm run paypal:agent:live` returned the expected
  **`MISSING_MODEL_CONFIGURATION`** before model dispatch or a durable evaluation
  start marker. It did not substitute a mock model.
- Task04's native `GeminiModel` tests exercise real adapter/protocol code against
  scripted transport responses. They are not evidence of a Google API inference.
  Task05A's new fixtures explicitly record **`MOCKED_TRANSPORT_TEST`** and
  `mocked-response-*`, and pending-intent browser screenshots are watermarked
  **MOCKED UI ONLY — NO LIVE GEMINI OR PAYMENT EVIDENCE**.

The success criterion requiring an actual Gemini model to choose an eligible offer
**is not yet met**. A valid server-side key and supported native function-calling
model must be configured, followed by an actual authenticated evaluation. The
existing default model name is not live-validated by this task.

## 2. Actual isolated preparation state

The new local profile is running at:

**http://127.0.0.1:3032/agent-checkout**

Owner-authenticated initialization completed at runtime UTC
**2026-10-27T19:40:26.683Z**, using the existing preserved local test-owner identity:

| Field                                  | Actual persisted value                       |
| -------------------------------------- | -------------------------------------------- |
| New test mandate                       | **`598f50eb-325a-5df3-af67-9c629973bafb`**   |
| State                                  | ACTIVE, isolated `agent-05a` campaign        |
| Cap / per-transaction limit            | **$10.00 / $6.00 USD**                       |
| Reserved / consumed / available        | **$0.00 / $0.00 / $10.00**                   |
| Expiry                                 | **`2026-10-28T19:40:23.661Z`**               |
| Actual model proposal / pending intent | **None / none** — waiting for live inference |
| Evaluation state                       | `NOT_STARTED`                                |
| PayPal order / capture                 | **None / none**                              |
| Persistent reservation                 | **Not enabled**                              |

Initialization creates only the new canonical mandate, its approved Sandbox
merchant row and one `MANDATE_CREATED` audit entry. It creates **no attempt or
financial idempotency rows**. Repeated initialization reads the same mandate;
refresh/restart does not reset its cap or extend immutable expiry.

## 3. Proposal → policy → pending checkout design

The fixed catalog is explicitly **synthetic demonstration data, not real merchant
inventory or procurement**:

- `synthetic-us-weather-600`: approved configured US Sandbox seller, **600 USD minor
  units**, `weather-v1`, synthetic 10-minute SLA/commitment.
- An approved 900-minor-unit offer exceeds the $6 transaction limit.
- A cheaper 300-minor-unit offer belongs to an unapproved synthetic merchant.

The configured Sandbox account is a future checkout recipient, not a claim that it
actually sells or delivers these synthetic items.

The workflow reuses Task04's five strictly validated tools and native Gemini
adapter. In the **mocked protocol tests**, the adapter executes:

1. `readSpendingMandate({})`
2. `listApprovedMerchants({})`
3. `compareEligibleOffers({})`
4. `proposePurchase({offerId: "synthetic-us-weather-600", reason: ...})`
5. `readAuthorizedPaymentStatus({})`
6. Structured finish response.

Those transcripts are test evidence only. When a future genuine inference succeeds,
server-created evidence records the official HTTPS transport, HTTP statuses,
returned response/model identifiers where available and model-generated tool names.
No raw credential, request header, unrestricted database operation or capture
endpoint enters model prompts/tool observations. Output and request bodies are
bounded/scanned; there is no silent deterministic fallback.

### Independent authorization boundary

`reserveOnProposal: false` makes the new workflow **proposal-only**. The model can
select an `offerId` and explain it; it cannot set merchant, price, currency, owner,
mandate, request identity or execution permissions. Canonical catalog records are
detached from caller mutation.

The server independently validates historical mandate exclusion, identity,
merchant allowlist, exact canonical money/currency, active state/expiry,
per-transaction/cumulative policy, objective suitability and commitment integrity.
It revalidates the result against a fresh locked mandate and database time at
commit, rather than trusting model-supplied checks or explanations.

A valid result becomes an immutable **`HUMAN_AUTHORIZATION_REQUIRED`** intent with
server-derived UUID, terms hash and durable `agent05a:<hash>` idempotency identity.
It explicitly records:

- `ownerAuthorized: false`
- `fundsReserved: false`
- `paypalOrderId: null`
- `paypalCaptureId: null`

The existing append-only audit table stores the pending intent; **no schema
migration is needed**. A per-campaign PostgreSQL session advisory lock prevents
concurrent inference. Durable start/completion/failure markers avoid duplicate
calls or silent replay after restart/uncertainty. Identical completed requests
return the saved intent without another model call. Interrupted/failed runs require
review rather than automatic reruns or campaign resets.

## 4. UI and authentication

The new standalone page and existing **PayPal Agent · Policy → Live Gemini API
Inference** console mode share the same protected preparation component. It shows:

**Gemini evaluation → proposed purchase → independent policy decision → human
authorization required → PayPal checkout not yet executed.**

Actual UI currently shows the missing-key blocker, initialized zero-reservation
mandate and **no actual model proposal yet**. The mocked pending-intent UI verifies
the complete future lifecycle with its source explicitly labeled. Payment/
reservation authorization is not implemented or enabled in Task05A; its button is
disabled, not a simulated financial approval.

The profile reuses the existing constant-time local password, HMAC session,
HttpOnly/SameSite cookie, expiry/logout, exact Host/Origin and CSRF protections.
Agent cookies are separate from US payment cookies, including under identical
owner/signing material. Service initialization/model calls occur only after
authentication. Bodies are bounded and reject scope overrides. Live inference is
owner-POST-only, rate-limited and loopback-profile-only; hosted/ordinary profiles
remain disabled.

**This is local test-owner authentication, not production authentication or SSO.**
The preserved `.tools/paypal-test-auth.json` secret is never proposed as an
internet-facing production credential. Task04's public evaluation route now rejects
Gemini mode with `AUTHENTICATED_AGENT_WORKFLOW_REQUIRED`; deterministic public
scenarios remain available without model API costs or persistent funds.

The preparation configuration also uses the shared Sandbox origin/environment
validator: Live origins/environments and malformed payment flags are rejected even
though this profile has no payment transport.

## 5. Preservation and financial effects

Read-only before/after hashes cover complete historical mandates, attempts,
merchant policies, idempotency rows, audits and the owner-auth file. All match:

- Completed US order `72936380818559054` / capture `52C23729CU714125M` remains
  **COMPLETED**, **600 consumed / 0 reserved / 400 available USD minor units**.
  A fresh actual PayPal order/capture status read confirmed this; it was read-only.
- Original Nigerian mandate `8fb8ada6-ad12-5bc8-ac4c-90e6a07ed064` retains its
  unresolved **600 reserved / 0 recorded consumed**. No original-provider call,
  release, cancellation or reinterpretation of its old GET404 occurred.
- Catalog verification reports three mandates/merchant rows, the same two historic
  attempts/four idempotency records, **16 audit rows** (one new mandate entry), and
  no remaining disposable schemas or unrelated tables. Approved migration checksum
  and historical seed rows are unchanged.

No new PayPal order/capture/refund/payout/cancellation, automatic buyer approval,
model-triggered persistent reservation, dependency change, deployment, commit or
push occurred. Original `project-flint` HEAD/refs/status/diff and **305 hashes**
still match the integrity baseline.

## 6. Tests and checks actually run

- `npm test`: **176 Solidity + 142 agent + 431 web = 749 passed**, zero test failures.
  All **15 new preparation tests** passed, covering mocked native tool calls,
  malicious descriptions/arguments/tools, fabricated immutable prices/currency/
  merchant/commitment, overspending, expired/revoked/historical mandates,
  owner/Host/Origin/CSRF, cross-profile cookies and fail-closed missing credentials.
- `npm run paypal:test:db`: **19/19 real PostgreSQL cases passed**, including two new
  owner/commit-time revalidation and concurrent one-intent/restart/zero-reservation
  cases. Tests use generated owner/OID-checked disposable schemas and mocked Gemini/
  PayPal, never the persistent demonstration attempt.
- **768 distinct workspace/DB cases passed**; focused runs are not counted twice.
  The earlier focused PayPal run passed257 before adding the final cookie test;
  the full web run contains258 PayPal mocks. Five legacy DB and optional OAuth
  Vitest cases remained unrun; live Gemini was explicitly deferred.
- Root typecheck, strict new operational-script TypeScript, Biome warnings-as-errors
  and Foundry formatting passed. Root build passed, then a final web build passed
  after the mobile text-wrap fix. Inherited Solidity notices remain unchanged.
- Eight-route legacy preview smoke passed, plus actual blocked-state and
  watermarked mocked pending-intent browser checks. External services/non-login
  mutations were blocked; final checks showed zero browser errors/mobile overflow.
- Secret-value/browser-boundary scans passed for **339 tracked files, 358 candidates
  and 51 browser chunks** after adding this report. The scanner now includes any
  configured Gemini key as well as PayPal and local owner secrets. Final scan and
  documentation results are recorded in the active handoff.

Initial strict TypeScript found optional-field schema output incompatibilities;
absent fields were normalized without relaxing compiler settings. The initial
mocked pending UI exposed a long disabled button overflow; text wrapping was fixed
and the rebuilt UI checks passed. The missing-key live-command rejection is an
expected negative check, not successful live inference. No test was weakened.

## 7. Add the key later and perform the missing real validation

1. Add a valid **`GEMINI_API_KEY`** and a supported **`GEMINI_MODEL`** to ignored
   **`web/.env.local`**. Do not paste the key into chat, commit it or expose it as a
   `NEXT_PUBLIC_` variable. No credential file was modified by this task.
2. Restart only the owned agent profile, preserving the owner file and mandate:

   ```powershell
   node --conditions=react-server --import tsx scripts/paypal-agent-serve.ts --stop
   node --conditions=react-server --import tsx scripts/paypal-agent-serve.ts --detach
   npm run paypal:agent:live
   ```

   The launcher enables Gemini/network flags **only in its loopback child process
   when a key is present**, while all financial execution stays disabled. It does
   not permanently enable normal/hosted profiles.

3. Confirm actual Google HTTP/tool-call evidence, an eligible $6 recommendation,
   independent policy success and a persisted `HUMAN_AUTHORIZATION_REQUIRED` intent.
   Then inspect **http://127.0.0.1:3032/agent-checkout** after local owner login.
   Until this succeeds, Task05A remains **partial**.
4. Respect the immutable mandate expiry. Do not delete journals, overwrite bindings
   or reset the campaign to bypass an expired or interrupted run.

Before a separately authorized agent-driven Sandbox payment, a future task must
implement and authorize an **authenticated owner financial-consent step** against
this exact immutable intent, freshly revalidate policy and atomically reserve under
the distinct mandate with stable financial request IDs. It must then obtain
separate explicit order permission, verify the actual credential-owned seller,
require human Personal-buyer approval, and obtain separate capture permission.
Task03E/03G's spent permissions and historical mandates cannot be reused. A model
recommendation, policy pass or Gemini key is not authorization to spend funds.
