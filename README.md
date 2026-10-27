# Earmark PayPal

**Every payment has a purpose.**

An independent adaptation of [Earmark / Flint](https://github.com/aveidt96/Flint)
for the PayPal AI Hackathon, migrated from commit
`cc20daa06392c588a42925d3844311abac1a067f` into
[`aveidt96/earmark-paypal`](https://github.com/aveidt96/earmark-paypal).

The original liquid-glass UI, spending mandates, agent tools, payment/activity
screens, Gemini integration, Neon adapters and four security demonstrations are
preserved. **The server-only PayPal Sandbox backend has an applied, real-PostgreSQL-tested
database, real OAuth, human buyer approval and one authoritatively COMPLETED $6 US
Sandbox capture with matching Neon accounting. No further payment is authorized.** Existing wallet actions and recorded receipts are
the legacy EVM experience and are labelled accordingly.

## Run the application

Node **22.14+ within 22.x**, npm **10 or 11**:

```powershell
npm ci --ignore-scripts
npm run dev
```

Open `http://localhost:3000`. No credentials or blockchain tooling are required to
view the dashboard, bundled payment replay, activity and security records. Live
legacy operations require a separately configured local workspace; otherwise the
UI reports the workspace as unconfigured and financial operations stay unavailable.

Build and serve only the Next.js application (also builds its agent dependency):

```powershell
npm run build --workspace @flint/web
npm start
```

### Preserved local authorization demonstration

```powershell
npm run setup:contracts
npm run web:local
```

This starts a disposable loopback Anvil chain with mock assets and separate local
owner/agent/provider identities. Follow [the legacy browser guide](web/README.md)
for wallet setup. This is not a PayPal flow. `npm run demo:scenarios` reproduces
autonomous purchase, prompt injection, invalid delivery and budget exhaustion
using the same local contract/agent boundaries.

## Configuration

The root [`.env.example`](.env.example) has **placeholder-only** PayPal Sandbox,
Gemini and Neon settings plus retained local EVM configuration. Next.js loads
`web/.env.local`, not the root template; copy only the settings needed there.
The local legacy launcher supplies its own process environment.

- `PAYPAL_ENVIRONMENT=sandbox`, `PAYPAL_BASE_URL=https://api-m.sandbox.paypal.com`,
  `PAYPAL_BACKEND_ENABLED=false`, `PAYPAL_PAYMENTS_ENABLED=false`.
- `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`: server-only
  settings; `PAYPAL_MERCHANT_ID` identifies the Sandbox seller belonging to the
  API credentials. No network request occurs just by building or rendering.
- Gemini defaults to Mock and network-disabled; an API key alone does not enable it.
- Neon must use a **new, separate project/branch** via `PAYPAL_DATABASE_URL`
  (direct/unpooled) and `PAYPAL_DATABASE_ENVIRONMENT=sandbox`. The isolated
  `database/paypal/001_sandbox.sql` migration is applied and verified on the dedicated
  Sandbox database (Task 03A). `db:migrate`
  and `api:start` remain legacy Monad tools.
- Next.js and the PayPal CLI tools load server settings from `web/.env.local`.
  If your direct URL is stored as `PAYPAL_DATABASE_DIRECT_URL`, the non-secret
  alias `PAYPAL_DATABASE_URL=$PAYPAL_DATABASE_DIRECT_URL` is supported through
  Next.js environment expansion. Local env files stay ignored by Git.
- `GET /api/integrations/paypal` reports backend-foundation status without checking
  connectivity. Existing `paymentsImplemented` / `paymentsEnabled` fields remain
  false for the unwired UI/agent payment paths; `backendImplemented` is true and
  `sandboxVerified` is false.
- `POST /api/paypal/webhooks` verifies signatures with PayPal, deduplicates durable
  events and reconciles trusted order/capture reads. It is disabled by default
  through `PAYPAL_BACKEND_ENABLED` and requires a genuine webhook ID. General
  financial/agent routes remain unwired; only the allowlisted local test flow below
  exposes fixed checkout actions.

### Sandbox backend foundation

Provider-neutral policy checks and atomic PostgreSQL reservations live in
`web/src/server/paypal/`. Owner-authenticated server integrations can call the
payment service after supplying a trusted principal from their authentication
adapter. Gemini output never supplies that principal or mandate policy.

Standard Orders checkout requires **buyer approval**. The service verifies it
through a fresh authenticated API read before an owner-invoked capture. A timeout
retains the budget and request identity; reconciliation never issues another
capture. This is not unattended payment or TaskVault-equivalent escrow.

```powershell
npm run paypal:test
npm run paypal:db:plan
npm run paypal:db:inspect
npm run paypal:recover
```

The database/recovery commands above are offline by default. For an explicit,
read-only Neon readiness check, use
`node --import tsx scripts/paypal-db-inspect.ts --connect`. See
[the Task 02 backend guide](docs/paypal-backend.md) for migration application,
read-only recovery, optional integration checks and remaining authentication/UI
work. Task03A applied and tested the migration; Task03G separately verified the
controlled US Sandbox capture below. No deployment has been performed. See
[the database report](docs/task-03a-database-report.md).

Applied database checks and explicit isolated PostgreSQL regression:

```powershell
npm run paypal:db:verify
npm run paypal:test:db
npm run paypal:test:db:all
```

The database tests create and remove only a generated, session-owned test schema,
leaving persistent demonstration data untouched. They use mock PayPal responses.

Task 03B verified real Sandbox OAuth (HTTP 200, Bearer parsing, cache reuse and
simulated-expiry refresh) without creating orders or making payments. OAuth-only
configuration requires the client ID/secret, not a merchant or webhook ID. Full
checkout retains those requirements; do not invent identifiers to enable it.

```powershell
# Real OAuth only, with payment operations and database tests disabled:
npm run paypal:test:oauth
npm run paypal:test:oauth:all
npm run paypal:secrets:check
```

See [the OAuth connectivity report](docs/task-03b-oauth-report.md) for sanitized
results, merchant identity requirements and first-checkout blockers. Normal tests
do not opt into real OAuth automatically. Normal backend/payment execution stays disabled.

### US Sandbox payment — Task03G completed capture

The original order **`9N317079B4816951W`** encountered a merchant rejection and
subsequent GET 404. Its payment disposition is unresolved, so its original mandate
still holds **$6 reserved / $0 recorded captured / $4 available**. A 404 is not
evidence permitting release. Original-order tools reject the new US credentials.

The separate US interface is **http://127.0.0.1:3031/paypal-test**.
It reuses the preserved verified local owner but has a merchant-scoped mandate,
purchase key, request IDs and session cookie. Task03E created exactly one actual
US Sandbox order **72936380818559054**. Task03G subsequently captured exactly
**$6.00 USD**, capture **52C23729CU714125M**. Independent authenticated order and
capture GETs verify **COMPLETED**, matching merchant and immutable purchase terms.
Neon records **$10 cap / $6 consumed / $0 reserved / $4 available**. The original
Nigerian $6 reservation remains unchanged; both exact one-shot permissions are spent.

This is verified controlled US Sandbox payment evidence, not a Live or autonomous
payment-readiness claim.
Sign in with the existing `loginSecret` from ignored `.tools/paypal-test-auth.json`
to inspect the saved receipt. General payment controls remain disabled; no further
payment is authorized. Do not rotate the saved owner, reset journals or create a
replacement attempt to repeat the demonstration.

```powershell
# Read-only US order/accounting evidence:
npm run paypal:us:status
npm run paypal:us:capture:verify

# Restart only if stopped (same identity and spent exact-capture permission):
node --conditions=react-server --import tsx scripts/paypal-test-serve.ts --us-capture-once --detach
```

This local-only profile uses server-verified allowlisted-owner HMAC sessions,
Origin/Host/CSRF checks and fixed server policies. It is disabled in normal/hosted
profiles and requires no fabricated webhook ID. See the
[Task03G report](docs/task-03g-capture-report.md) for the actual capture receipt,
accounting and checks. The [Task03E report](docs/task-03e-us-order-report.md) and
[Task03D report](docs/task-03d-us-preparation-report.md) preserve order/preparation
history and the append-only original-reservation hold.
The [Task 03C report](docs/task-03c-checkout-report.md) is historical checkout
evidence; its original approval handoff has been superseded.

## Verification

```powershell
npm run setup:contracts
npm run typecheck
npm test
npm run build
node --test scripts/deployment-recovery.test.mjs scripts/testnet-funding.test.mjs
node node_modules/vitest/vitest.mjs run scripts/gemini-readonly-fixture.test.mjs
node scripts/check-web-boundary.mjs
node scripts/preview-smoke.mjs
```

Full workspace tests/build retain Solidity/Anvil coverage and require the pinned
Foundry tools. PostgreSQL integration tests require a separate explicitly supplied
test database; they skip when it is absent. Browser end-to-end tests require
Playwright Chromium and the local fixture: see `npm run web:test:e2e`.

If the Foundry download is slow, download the official asset listed in
`scripts/foundry-release.json`, set `FOUNDRY_ARCHIVE_PATH` to that archive and rerun
`npm run setup:contracts`. The pinned SHA-256 check still applies.

## Architecture and next integration boundary

```text
web/          Next.js / React / Tailwind UI, routes, legacy owner-wallet experience
agent/        Server-only Gemini / Qwen / Mock adapters, validated tools, journals
api/          Preserved legacy durable Node worker and receipt recovery
contracts/    Preserved TaskVault authorization reference and Foundry test suites
database/     Isolated version-controlled PayPal PostgreSQL migrations
scripts/      Development, schema, local security demonstrations and checks
docs/         Source architecture, historical evidence and migration documentation
```

- [Pre-change dependency inventory](docs/migration/legacy-dependencies.md)
- [PayPal integration architecture and recommended next steps](docs/paypal-integration.md)
- [Task 02 backend architecture, schema, operations and verification](docs/paypal-backend.md)
- [Task 03A applied migration and real PostgreSQL results](docs/task-03a-database-report.md)
- [Task 03B actual Sandbox OAuth connectivity](docs/task-03b-oauth-report.md)
- [Task 03C controlled checkout and pending human approval](docs/task-03c-checkout-report.md)
- [Task03G actual completed US capture and accounting](docs/task-03g-capture-report.md)
- [Migration implementation report and verification results](docs/migration/implementation-report.md)
- [Active handoff and continuous change log](HANDOFF-PAYPAL.md)
- [Repository instructions, including required change documentation](AGENTS.md)
- [Original architecture, including exact authorization rules](docs/architecture.md)
- [Original README (historical Monad deployment information)](docs/migration/original-readme.md)

Stable `@flint/*` workspace names, signature/hash domains, `FLINT_*` settings and
durable identity keys are preserved. Public application branding is **Earmark
PayPal**. Historical deployment manifests and reports describe the original
application only. The preview Render blueprint points at this repository with
auto-deploy off; no deployment has been performed as part of this migration.
