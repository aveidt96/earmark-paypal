# Earmark PayPal

**Every payment has a purpose.**

An independent adaptation of [Earmark / Flint](https://github.com/aveidt96/Flint)
for the PayPal AI Hackathon, migrated from commit
`cc20daa06392c588a42925d3844311abac1a067f` into
[`aveidt96/earmark-paypal`](https://github.com/aveidt96/earmark-paypal).

The original liquid-glass UI, spending mandates, agent tools, payment/activity
screens, Gemini integration, Neon adapters and four security demonstrations are
preserved. **PayPal Sandbox integration is in preparation: no PayPal payment flow
is implemented or verified.** Existing wallet actions and recorded receipts are
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

- `PAYPAL_ENVIRONMENT=sandbox`, `PAYPAL_PAYMENTS_ENABLED=false`.
- `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`: server-only
  placeholders for future integration. No OAuth requests are made.
- Gemini defaults to Mock and network-disabled; an API key alone does not enable it.
- Neon must use a **new, separate project/branch**. PayPal database migrations are
  pending. `db:migrate` and the hosted `api:start` are legacy Monad tooling, pinned
  to the original testnet environment; do not use them for PayPal setup.
- `GET /api/integrations/paypal` returns read-only preparation status, always with
  `paymentsImplemented: false` and `paymentsEnabled: false`. Invalid live/enabled
  settings return 503. It is not payment readiness or payment verification.

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
scripts/      Development, schema, local security demonstrations and checks
docs/         Source architecture, historical evidence and migration documentation
```

- [Pre-change dependency inventory](docs/migration/legacy-dependencies.md)
- [PayPal integration architecture and recommended next steps](docs/paypal-integration.md)
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
