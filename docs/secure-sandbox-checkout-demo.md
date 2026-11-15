# Secure Sandbox checkout demonstration

Audit date: 2026-11-14. Original audit baseline: `fc3b3e4`. Integration baseline: `6182306` on `origin/main`.
This is a reviewed operating procedure, not a deployed or transaction-tested change.
No runtime payment flags are changed by this document.

The private HTTPS profile below supersedes the earlier assessment that hosted
access was an unimplemented follow-up. Loopback remains the default.

## Loopback option (unchanged)

Use the existing `/paypal-test` UI in a **separate private checkout instance**,
listening only on `127.0.0.1:3030`. Authorized testers reach it through an
individually authenticated SSH tunnel and then the existing allowlisted-owner
login. Reuse an existing operator machine with Node 22 and SSH if available;
no worker, public checkout endpoint, new payment adapter or new hosting service
is needed. Run one process and one supervised owner campaign at a time.

This is an operator-supervised demonstration for approved testers, not a
multi-user payment service. SSH authenticates each tester; the application maps
sessions to one server-configured test owner. Separate owner identities,
per-user audit attribution, public SSO and durable distributed session revocation
are **not** implemented. Do not describe the local shared-owner login as hosted
production authentication. An SSH tunnel does not itself authorize a purchase.

Keep the existing public research deployment and its provider/quota configuration
unchanged. Do not add payment credentials or the private database to that project.
Public research remains anonymously accessible under its existing quotas and
abuse controls; “read-only” refers to commerce, not the quota bookkeeping.

## Existing implementation and enforced boundaries

| Area              | Existing source and behavior                                                                                                                                                                                                                               |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UI and actions    | `web/src/app/paypal-test/page.tsx`, `web/src/components/paypal-test.tsx`, `/api/paypal/test` and `/api/paypal/test/[action]`. Separate explicit mandate, reserve, order, approval verification, capture, recovery and cancellation controls.               |
| Authentication    | `test-auth.ts`: constant-time login check, 30-minute signed HttpOnly/SameSite session, exact Host, mutation Origin plus CSRF, allowlisted server-derived owner, process-local login limits and logout revocation, restart epoch. HTTPS origins add Secure. |
| Local-only config | `test-config.ts`: explicit enable flag, loopback origin, rejects Vercel/Lambda, seller/app binding, strong distinct login/signing secrets, Sandbox-only API settings, TLS verification.                                                                    |
| Payment policy    | `test-checkout.ts`, `policy.ts`, `service.ts`: fixed USD10 mandate, USD6 purchase, one allowlisted merchant, expiry, stable purchase identity, durable dispatch/idempotency and capture claims, owner authorization and atomic accounting.                 |
| Buyer approval    | PayPal-hosted human buyer approval; capture re-reads canonical order status. Return URL/query parameters never prove approval or payment. Canonical capture validation precedes consumption; uncertain outcomes keep budget reserved for recovery.         |
| Database          | `postgres.ts`: dedicated `PAYPAL_DATABASE_URL`, Sandbox schema binding, no legacy fallback, transactional repository and audit records. Launcher also checks direct Neon target, verified TLS and migration checksum.                                      |
| Public isolation  | Test, agent checkout and webhook route wrappers return 403/no-store when either public-demo flag is true. Public research independently rejects payment-enabled profiles. No checkout dispatch from public research.                                       |
| Transport         | `config.ts` pins `https://api-m.sandbox.paypal.com`; client/service validate merchant, amount, currency and attempt references.                                                                                                                            |

“Verified” financial results in the historical handoff are prior records. This
session does not establish current credentials, merchant eligibility, database
connectivity, deployed settings or live transaction success.

## Seller and transaction scope

The private demonstration is a purchase from the **explicitly approved Sandbox
seller**, with a distinct Sandbox personal buyer. The fixed demo is not checkout
for a weather API or other externally researched seller. Do not pass an external
offer to this workflow, relabel its seller, or silently substitute Earmark's seller.
Public offer cards remain manual merchant-site review, with uncertain payment
acceptance left unknown.

`credentialSellerOnly` intentionally omits a separate payee in the Orders request:
PayPal uses the app's seller. Therefore, before any future execution, an operator
must verify in the Sandbox dashboard that the app credentials belong to the exact
allowlisted `PAYPAL_MERCHANT_ID`. The local SHA256 client-ID/merchant binding
records that confirmation; it is not independent proof of seller ownership.
Returned payee mismatches are rejected by client/service validation, but that is
not a substitute for checking the seller before order creation.

Existing `us-v1` order/capture permissions refer to historical, consumed
transactions. They are not reusable test permissions. Old expired/FAILED or
uncertain campaigns must not be reset, their IDs reused, holds released, or
financial rows altered for this demonstration. No saved-wallet/autonomous mode.

## Dedicated configuration

Use a clean, separate checkout and build directory, separate `.tools` state,
and a newly approved isolated **Sandbox database/branch**. Never copy historical
owner files, campaign baselines, credentials, or financial records into it.
Provisioning/migration is a separately authorized financial database write.
Reuse `database/paypal/001_sandbox.sql` and the existing migration safety tooling;
do not run legacy `db:migrate`. Do not overwrite the established Sandbox ledger.

| Setting                                                          | Private demo                                                                        | Public research                                         |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `NEXT_PUBLIC_DEMO_ONLY`, `EARMARK_PUBLIC_DEMO_ONLY`              | `false` at build and runtime                                                        | Keep `true`                                             |
| `EARMARK_PUBLIC_RESEARCH_ENABLED`                                | `false`                                                                             | Keep current configuration                              |
| `PAYPAL_ENVIRONMENT`, `PAYPAL_DATABASE_ENVIRONMENT`              | `sandbox`                                                                           | No payment database needed                              |
| `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_MERCHANT_ID` | Approved app/seller only, server secret store                                       | Absent                                                  |
| `PAYPAL_DATABASE_URL`                                            | Dedicated direct Neon Sandbox database, verified TLS                                | Absent; retain separate `EARMARK_RESEARCH_DATABASE_URL` |
| `PAYPAL_BACKEND_ENABLED`, `PAYPAL_PAYMENTS_ENABLED`              | Default `false`; launcher enables child only after separate execution authorization | `false`                                                 |
| `EARMARK_ENABLE_TESTNET_EXECUTION`                               | `false`                                                                             | `false`                                                 |
| `AI_ENABLE_NETWORK`, `EARMARK_GEMINI_ENABLED`                    | `false` for fixed checkout                                                          | Preserve current research settings                      |
| `PAYPAL_TEST_*` secrets, owner, epoch, binding                   | Existing launcher creates/validates server-owned config                             | Absent                                                  |

Leave `DATABASE_URL`/legacy bindings absent in the private instance; do not copy
public research secrets. Do not use `NEXT_PUBLIC_` for secrets. Keep `.tools` and
`web/.env*` out of source, deployment artifacts and public serving; restrict them
to the operator OS account. Runtime database role needs only the existing
repository's schema/table operations; use a separate migration role for DDL and
verify grants with the operator. No access to research or legacy financial data.

`render.yaml` is a disabled-payment public preview blueprint, not a private
checkout deployment. Vercel and Lambda are explicitly rejected for this local
checkout. Do not bypass those checks, spoof cloud markers, or disable TLS verification.
Use only the explicit private HTTPS profile below for a hosted origin.

## Safe procedure — only after separate authorization

1. Review and pin the intended source revision. Use a separate working directory
   and secret store on the existing private operator machine. Install using the
   lockfile and required Node 22/npm 10–11; build the web workspace with both
   public-demo flags false. Rebuilding public research with those flags false is
   forbidden. The local private build includes legacy routes, so keep all legacy
   credentials and execution flags absent/disabled and the process unexposed.
2. Obtain explicit authorization for provisioning the dedicated database, its
   existing schema migration and any new campaign records. Verify no legacy
   objects, Sandbox environment/version and approved migration checksum using
   the existing tools. Do not change historical reservations or old owner files.
3. Verify the Sandbox business app/seller and distinct buyer; securely supply the
   dedicated private configuration. Review the launcher before running:
   `npm run paypal:test:serve -- --confirm-merchant` is **execution enablement**,
   not a harmless preview. It checks the DB read-only, generates fresh local
   owner credentials if absent, and launches the child with backend/payment
   flags true. Do not run this step under the current audit authorization.
   Do not use `--us-order-once`, `--us-capture-once`, or old campaign files.
4. Only after approval to enable that private process, launch it on loopback.
   Require host firewall protection and individually authorized SSH keys. From
   the tester's machine, use an explicit loopback tunnel, for example:
   `ssh -N -L 127.0.0.1:3030:127.0.0.1:3030 tester@operator-host`.
   Restrict server SSH forwarding to this destination and revoke access when
   done. Do not forward with `-g`, expose port3030, publish a tunnel URL, or use
   an unauthenticated reverse proxy. Open exactly
   `http://127.0.0.1:3030/paypal-test`; do not interchange localhost or ports.
   Host/Origin must remain pinned. The encrypted SSH connection protects the
   remote hop; the plain HTTP listener exists only on loopback at both ends.
5. Confirm unauthenticated APIs return 401, invalid Origin/CSRF fails without
   writes, public research is still accessible and public payment routes still
   return 403. Retrieve the owner login code through an approved private channel;
   never print signing keys, full auth files or database URLs to chat/logs.
   Restarting changes the session epoch. Logout/rate limits are process-local:
   do not run replicas or load-balance this demonstration.
6. Obtain a **separate, bounded transaction authorization** specifying seller,
   buyer, fresh campaign/owner, USD10 mandate and at most one USD6 order/capture.
   Login alone is not transaction authorization. Owner explicitly creates the
   mandate/order, buyer manually approves in PayPal Sandbox, and owner explicitly
   requests capture. No automated buyer login/approval. A redirect is not proof;
   use existing canonical approval/capture checks and display the ledger result.
7. For uncertainty use existing read/recovery mechanisms under the applicable
   authorization; do not retry with new request keys, reset rows, or free held
   budget based on missing/404 data. Do not add a webhook requirement to the
   manual workflow: it already supports canonical polling without a fabricated
   webhook ID. Any future webhook ingress needs its own review and genuine
   signature verification before ledger mutation.
8. Stop the private process and SSH access, revoke sessions by process restart/
   epoch rotation, and return payment flags to false. Preserve the database,
   transaction/audit records and local campaign identity. Do not delete them to
   make another demo possible. Verify public research configuration is unchanged.

## Private HTTPS profile (prepared locally, not deployed)

Use a separate single persistent Node22 process behind an identity access gateway
on one exact HTTPS hostname. No new payment service or dependency is introduced.
The gateway must protect the entire hostname (page, API, callbacks and assets),
allow only named testers, and be the only reachable path to the application.
Keep the app listener at `127.0.0.1:3030` and use a same-host trusted reverse proxy
or access connector. Do not expose a direct Node port or an alternate hostname.
Gateway identity is an additional perimeter, never an owner login substitute.

### Exact hosting configuration

Provide these variables during the **private build and runtime**, never on the
public project:

```text
PAYPAL_TEST_HOSTING_PROFILE=private-https
PAYPAL_TEST_ORIGIN=https://checkout.example.com
PAYPAL_TEST_GATEWAY_PROTECTED=true
NEXT_PUBLIC_DEMO_ONLY=false
EARMARK_PUBLIC_DEMO_ONLY=false
EARMARK_PUBLIC_RESEARCH_ENABLED=false
PAYPAL_ENVIRONMENT=sandbox
PAYPAL_DATABASE_ENVIRONMENT=sandbox
EARMARK_ENABLE_TESTNET_EXECUTION=false
```

Replace the example with the actual exact HTTPS origin: lowercase DNS hostname,
no trailing slash, path, query, fragment, credentials, wildcard or IP literal.
A nondefault explicit HTTPS port is allowed and must match Host and Origin.
`PAYPAL_TEST_GATEWAY_PROTECTED=true` is an operator acknowledgement, **not proof
of authentication**. The application does not accept client-supplied gateway
headers as credentials. The operator must demonstrate gateway coverage, tester
allowlist and direct-origin blocking before enabling checkout.

Use the same separate Sandbox database/seller/owner prerequisites described
above. Keep backend/payment flags false in build settings. Supply credentials
only to the server secret store. Do not pass PayPal credentials as build args or
`NEXT_PUBLIC_` values. No Gemini, Tavily, legacy or public research DB secrets
are needed here. Verify Sandbox app ownership against the configured seller.

Build with the normal web workspace build command under Node22. The build embeds
a nonsecret private-profile marker and excludes the legacy client graph. The
launcher rejects a build/profile mismatch; proxy requests fail closed if a
private build loses its runtime profile. Use a separate build directory: do not
reuse or overwrite the public research artifact. Vercel/Lambda remain rejected;
replicas, serverless invocations and rolling overlap are unsupported.

After separate authorization to enable this private instance, use the existing
launcher: `npm run paypal:test:serve -- --confirm-merchant`. It validates the
hosting profile and build marker before database access, checks the database
read-only, preserves/creates local owner state, generates a fresh session epoch,
and enables the fixed checkout **only in the child**. It still binds loopback;
readiness uses that listener with the exact external Host, not an unauthenticated
external gateway probe. The hosted origin supplies both PayPal return and cancel
URLs. Do not enable the consumed US one-shot flags; this profile rejects them.
Protect and persist `.tools/paypal-test-auth.json` so restarts retain the same
owner/campaign. Never reset state or duplicate the campaign to retry a payment.

### Request, session and route protections

- Gateway preserves the configured external Host and browser Origin. The app
  ignores Forwarded/X-Forwarded-Host and rejects wrong/missing Host for HTTPS.
  TLS must terminate at the trusted gateway/proxy; HTTP must redirect to HTTPS
  there. Never trust a request header as evidence that TLS/gateway auth occurred.
- Existing owner login, server-derived principal and CSRF checks remain.
  HTTPS cookies are Secure, HttpOnly, SameSite=Lax, host-only and 30 minutes.
  HTTPS signatures are bound to the origin as well as the restart epoch.
  Per-process login throttling/logout revocation require exactly one process.
  Restart invalidates sessions; reauthenticate rather than resetting a campaign.
- Only GET/HEAD `/paypal-test`, `/api/paypal/test`, Next static assets and the
  Norway font files are routed. Only existing named POST checkout actions are
  allowed. Homepage/research/Judge, agent execution, legacy APIs, webhooks,
  image optimizer and arbitrary files return 404. Wrong Host returns 403;
  invalid hosting settings return 503. POST to the page is blocked.
- The private layout excludes legacy providers/navigation, so page hydration
  does not call unrelated APIs. This is not a public research profile.
- Return/cancel callbacks are ordinary page GETs. They can show a hint and read
  authenticated saved state; they cannot grant approval, authorize an owner,
  mutate ledger state or trigger capture. PayPal token/PayerID/query strings
  are untrusted. Capture still requires a CSRF-protected owner POST and fresh
  canonical PayPal approval/capture checks. No webhook ingress is required.

### Required acceptance before a transaction

First verify HTTPS certificate, authenticated gateway coverage of every allowed
path, rejection of non-testers and direct listener/alternate-domain access,
exact Host preservation, unauthenticated checkout 401, invalid CSRF rejection,
logout/expiry/restart revocation, and that unrelated private routes return 404.
Confirm the public research deployment remains unchanged with payment routes
403 and no payment credentials. Test the browser's gateway and owner session
surviving or being safely re-established after a PayPal return. Do not exempt
callbacks from gateway protection. Configure HSTS and access-log query redaction
at the TLS gateway; do not retain PayPal return tokens in ordinary logs.

Only after separate bounded transaction authorization may the operator create
the fixed mandate/order, have the distinct buyer approve on PayPal Sandbox,
and explicitly capture. Follow the recovery/shutdown steps above. This local
implementation does not establish hosted session/callback behavior or live
payment success. No gateway, infrastructure, database, credentials or deployment
settings have been provisioned or changed by this work.

## Prior offline audit validation

Thirteen selected Vitest suites passed: 246 tests covering public isolation,
authentication/CSRF/Host, checkout, policy, service, client/config, mocked
PostgreSQL, capture, agent payments, webhooks, discovery and Judge. Agent
TypeScript compilation passed. No live integrations or financial databases were
used. A production build/browser artifact scan was not run for this
documentation/test-only change.

## HTTPS implementation validation (2026-11-14)

- 14 focused suites: **274 tests passed** (including 28 HTTPS-profile cases).
- Private and public production builds passed; agent compilation, Next web
  TypeScript and launcher strict standalone TypeScript passed.
- Local private production HTTP smoke passed with synthetic credentials, payments
  disabled and no database URL: callback page, route restrictions, Host spoofing,
  unauthenticated API, owner login cookie flags, CSRF and logout. A separate
  smoke proved a compiled private build returns 503 when runtime opt-in is lost.
- Local public production homepage returned 200; test/agent checkout returned 403. Both builds passed the compiled browser-secret boundary scan (46 chunks
  each). Changed-file formatting, Biome lint and whitespace checks passed; Biome
  emits informational template-literal suggestions, not warnings/errors.
- Private build restored locally under `web/.next`; public verification artifact
  retained only under ignored `.tools/public-profile-build`. No deployment
  configuration was applied and no actual gateway or PayPal flow was exercised.

Readiness: implementation and offline checks complete. Hosted readiness is
conditional on the gateway, exact-origin TLS, single-process/persistent-state,
dedicated database and seller prerequisites above. No live execution is enabled
by this source change.

## Integration validation (2026-11-15)

Integrated as a focused 13-file milestone onto origin/main `6182306`. Retained
upstream public-production defaults, research layout/metadata, official-provider
discovery, pricing, reliability, quota and public API guards. **318 tests passed
in 14 suites**, including three new production-default config cases. Private and
public production builds, agent/web/launcher typechecks, lint, formatting and
whitespace checks passed. Both compiled browser-secret scans passed (46 chunks
each). Local production HTTP checks verified private owner login/session/CSRF,
Host and route isolation, callback safety/profile-loss rejection, plus public
homepage access and checkout rejection. Only synthetic credentials were used,
with payments disabled and no financial database URL. No live provider/payment,
financial DB operation, deployment or production settings change occurred.
This validation does not replace the hosted gateway/merchant/database checks.
