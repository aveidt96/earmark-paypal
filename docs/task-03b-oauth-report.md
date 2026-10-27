# Task 03B — real PayPal Sandbox OAuth connectivity

Session: **2026-10-26**. Outcome: **complete — actual OAuth authentication succeeded**.

## Actual API evidence

The existing `PayPalClient.accessToken()` authenticated with the user's server-side
credentials loaded from ignored `web/.env.local`. The only real API endpoint used:

```text
POST https://api-m.sandbox.paypal.com/v1/oauth2/token
```

The positive integration test's transport rejects every other URL/method and
requires redirects disabled. No order, capture, refund, payout, merchant-discovery
or Live request occurred. No database connection/write was made by this milestone.

Sanitized results from the final full regression run:

- Initial OAuth grant: **HTTP 200**.
- Authentication refresh: **HTTP 200**.
- Parsed token type: **Bearer**.
- Returned remaining `expires_in`: **31,685 seconds**.
- Effective reusable cache lifetime: **31,625 seconds**, applying the existing
  **60-second safety margin** and seconds-to-milliseconds conversion.
- Cached token reuse: passed, with no extra HTTP request.
- One millisecond before cache expiry: reused, with no extra request.
- At cache expiry: marked non-reusable and performed one successful refresh grant.
- Token/credential output or persistence: none. Only selected primitive/boolean
  metadata is written to ignored `.tools/paypal-oauth-result.json`.

The earlier focused positive run also returned HTTP 200 twice, with `expires_in`
32,400 seconds. PayPal may return a still-valid app token with its remaining
lifetime; expiry is parsed dynamically, not hardcoded. Refresh is not required to
return a different token value. Each positive test run made two OAuth requests;
the focused and full regression runs made **four successful token-endpoint POSTs
in total, zero payment requests**.

Expiry was exercised using the existing injectable **client clock**. Nine actual
hours were not waited, the system clock was not changed, and no claim that PayPal
rejected an actually expired token is made. Negative credential/expiry/error cases
used synthetic credentials and mocked responses only.

## Configuration and implementation

The credential inspection confirmed presence without printing values, accepted
only the official Sandbox origin/environment and found no public credential
variables or disabled TLS verification. Local env files are ignored and untracked.
Backend and payment execution flags remain disabled; local secret values were not
edited. Opaque credentials are validated against Sandbox by the successful OAuth
request; no Live endpoint was contacted to inspect them.

OAuth requires **client ID and client secret only**. Merchant identity and a
webhook subscription are not prerequisites for this grant. The old full-backend
parser incorrectly made those checkout requirements prerequisites for testing
OAuth; it is now separated without adding another authentication implementation:

- `paypalOAuthSettings()` validates only the existing Sandbox restriction and app
  credentials and returns no merchant, webhook or payment-enabled fields.
- Full `paypalSettings()` reuses that credential parsing while retaining backend,
  real merchant-ID and webhook-ID requirements.
- `PayPalClient` uses the same Basic authentication, grant request, response schema,
  coalescing/cache and bounded retry implementation. No authentication code was
  duplicated.
- New `oauthCacheStatus()` exposes only safe metadata. Bearer tokens remain private
  in memory; whitespace token responses are rejected.
- OAuth-only clients cannot create/capture or invoke signature verification.
- The positive real test compares booleans, not raw token strings in assertion
  diffs. Its failure path prints only fixed error codes and HTTP status.

## Tests and validation

`npm run paypal:test:oauth` ran the initial positive connectivity check alongside
PayPal unit tests: **106 passed, 8 database cases skipped**, before adding the new
negative/boundary coverage.

The final `npm run paypal:test:oauth:all` executes the root test command with real
OAuth opted in, financial/backend execution off and database suites disabled:

- Solidity: **176 passed**.
- Agent: **140 passed**.
- Web: **307 passed, 13 skipped**.
- **Workspace total: 623 passed, 13 skipped**.
- PayPal coverage includes **133 mocked cases plus 1 real OAuth case**.
- New dedicated OAuth unit coverage: **28 mocked cases** covering restricted
  environments, missing/blank credentials, strict checkout configuration, absent
  capabilities, malformed token/type/expiry, short lifetime, exact cache boundary,
  bounded retries and safely sanitized HTTP 400/401/403 credential failures.
- Additional Node recovery/funding fixtures: **21 passed**; separate read-only
  Gemini fixture cases: **4 passed**.
- **Combined distinct total: 648 passed, 13 skipped**. Repeated runs are not counted
  twice. Skips are the eight PayPal PostgreSQL and five inherited Monad PostgreSQL
  cases, deliberately disabled to avoid database record changes. Task 03A's real
  database results remain historical evidence and were not rerun here.
- Agent/web/API TypeScript and strict standalone OAuth-launcher/secret-check script
  checks passed. Biome, Prettier, Foundry formatting and root production build passed.
- Dependency audit reported **zero vulnerabilities**.
- Read-only browser smoke passed seven routes, four original scenarios and mobile
  layout, with external services/browser mutations blocked.
- Original checkout HEAD, refs, status, diff and **305 file hashes** still match
  the baseline.

The first short configuration probe and the first combined typecheck/test command
hit terminal timeouts. Retried configuration inspection, full TypeScript and
separate/full OAuth test commands all passed. No real authentication failure was
observed; mocked negative failures are expected test inputs. Inherited Solidity
compiler notices remain unchanged.

## Secret boundary verification

`scripts/paypal-secret-check.ts` loads secrets only in the server CLI and checks
actual configured client ID, client secret and Base64 Basic credential-pair bytes
against tracked files, all nonignored candidate files and production browser JS.
It reports counts/booleans only and verifies local env exclusion. The existing
browser checker also rejects server credential variable names/private-key material.
All scans passed with **zero credential matches** across **272 tracked files,
306 nonignored candidate files and 43 compiled browser chunks**. No bearer token is ever written to any
source, report or environment variable, so it is not a build input.

## Merchant identity and first checkout requirements

`PAYPAL_MERCHANT_ID` and `PAYPAL_WEBHOOK_ID` remain **unset**. No values were invented
and no account-identity lookup was performed.

For the configured single-seller checkout integration, obtain the **actual
13-character PayPal Merchant ID of the Sandbox Business seller account associated
with this REST app**. Find its PayPal Merchant ID in the corresponding Sandbox
Business account's account/business-information settings. Do not use the REST
client ID, OAuth `app_id`, buyer account ID, email address or a generated identifier.
OAuth success alone does not establish seller identity/payment capability.

Before a first separately authorized Sandbox checkout:

1. Configure that seller ID and validate its relationship/capability with the app.
2. Register the app's webhook subscription against an approved HTTPS endpoint and
   configure its actual webhook ID. No hosting/tunnel/deployment was created here.
3. Provide verified server-side owner/agent identity, approved mandate/merchant,
   exact currency/budget and immutable purchase intent; financial HTTP routes remain
   unwired.
4. Implement buyer approval/return/cancel UX using an appropriate Sandbox buyer
   account, followed by the existing policy-checked owner-invoked capture path.
   Standard Orders checkout requires payer approval; unattended payments are not
   supported by this milestone.
5. Obtain explicit payment-operation authorization before enabling/exercising the
   relevant execution flags. No actual payment flow is verified by OAuth alone.

**No OAuth connectivity blocker remains.** Merchant/webhook configuration and
authenticated approved checkout integration remain blockers to the first payment.

## Changed files and commands

- Updated `web/src/server/paypal/config.ts` and `client.ts`: shared OAuth-only
  settings, retained strict checkout capabilities, safe cache metadata and token
  parsing hardening.
- Updated `web/test/paypal-sandbox.integration.test.ts`: real grant/cache/refresh
  check with token-endpoint-only transport and sanitized reporting.
- Added `web/test/paypal-oauth.test.ts`: synthetic negative/boundary cases.
- Added `scripts/paypal-oauth-test.ts` and `scripts/paypal-secret-check.ts`;
  updated `package.json` with explicit opt-in OAuth/regression and secret-check commands.
- Updated `README.md`, `docs/paypal-backend.md`, `docs/paypal-integration.md` and
  `HANDOFF-PAYPAL.md`; added this report. Temporary ignored configuration/result
  artifacts contain no credential or token values.

```powershell
# Explicitly opts into real OAuth; never a payment endpoint:
npm run paypal:test:oauth
npm run paypal:test:oauth:all

# Local source/browser credential-value scan, no API call:
npm run paypal:secrets:check
```

The opt-in flag is scoped to the test child process; ordinary tests remain
real-network-disabled. No dependencies were added. No credential file, migration,
production database record, UI, original repository, deployment, commit or push
was changed by this task.
