# Earmark PayPal — active handoff and change log

Last updated: **2026-10-25**

This is the active handoff for Earmark PayPal. The inherited root `HANDOFF` file
contains original Monad project history. All future changes must be recorded
here, as required by the user and the root [AGENTS.md](AGENTS.md).

## Current project state

- **Application:** Earmark PayPal, an independent adaptation for the PayPal AI
  Hackathon. Original Earmark presentation and authorization infrastructure are
  preserved, with explicit PayPal preparation / legacy EVM labels.
- **Working directory:**
  `C:\Users\USER\Documents\project-prometheus\project-earmarkpaypal`.
- **Destination remote:** `https://github.com/aveidt96/earmark-paypal.git`.
- **Git:** fresh local repository on `main`; no commits or pushes have been made.
  Migration files are currently untracked. GitHub authentication was unavailable,
  so remote contents/default branch and publication remain unverified.
- **Original source:** sibling `../project-flint`, remote
  `https://github.com/aveidt96/Flint.git`, commit
  `cc20daa06392c588a42925d3844311abac1a067f`.
- **Source integrity:** the last migration verification matched original HEAD,
  refs, working status, diff and 305 file hashes, including ignored environment
  files and pre-existing user changes. Do not modify that repository.
- **PayPal:** Sandbox configuration placeholders and read-only preparation status
  only. OAuth, orders, payment authorization/capture/refund and webhooks are not
  implemented. No PayPal payment flow has been tested or claimed to work.
- **Deployment:** none performed for this repository. The Render blueprint has
  automatic deployment disabled.
- **Database:** Neon adapters are retained, but the existing SQL migration and
  hosted-worker binding remain pinned to the original Monad testnet environment.
  PayPal needs a separate database/schema. Do not run legacy `db:migrate` for it.
- **Latest completed implementation validation:** production build, TypeScript,
  lint, formatting, dependency audit, local authorization/security tests, and
  read-only production browser smoke passed. See the dated record below.

## Architecture and operating notes

- npm workspaces: `contracts`, `agent`, `web`; separate Node worker in `api/src`.
- Next.js **16.4.3**, React **19.3.0**, TypeScript **5.9.3**, Tailwind **4.3.3**,
  Vitest **5.0.3**, Zod **4.6.7**, `viem` **2.57.3**, `pg` **8.23.1**.
- Solidity **0.8.28**, OpenZeppelin **5.6.1**, pinned Foundry **1.8.5**.
- `web/`: dashboard, earmark creation/listing, execution console, payment/activity
  screens, resolution, themes, recorded demos, owner wallet integration and routes.
- `agent/`: server-only Gemini/Qwen/Mock models, eight validated tools, provider
  quote/delivery inspection, trusted purchase identities and durable journals.
- `api/`: preserved legacy hosted worker, exclusive database locks and receipt-only
  recovery. It is not a PayPal worker.
- `contracts/`: original TaskVault mandate, budget, provider, escrow, deadline and
  dispute rules, with unit/fuzz/invariant tests.
- Neon tables include `earmark_schema`, `earmark_environment`,
  `earmark_workspaces`, `earmark_intents`, `earmark_launch_nonces`, `earmark_runs`,
  `earmark_events` and `earmark_provider_calls`. Session advisory locks require
  direct/unpooled connections. Existing binding is not reusable as a PayPal binding.
- Stable `@flint/*` package names, `Flint Owner Launch` EIP-712 domain, identity
  namespaces, `FLINT_*` settings and durable storage keys are intentionally retained.
- Models propose actions; deterministic code validates authority, providers,
  amounts, deadlines, commitments and idempotency. Keys stay server-side.

### Local commands

Use Node 22.14+ within 22.x and npm 10/11. Dependencies are already installed locally.

```powershell
# Credential-free frontend / recorded demonstrations:
npm run dev

# Production frontend build and serving:
npm run build --workspace @flint/web
npm start

# Preserved disposable local EVM workspace:
npm run setup:contracts
npm run web:local

# Full verification (requires pinned Foundry for contract/local-chain coverage):
npm run typecheck
npm test
npm run build
npm run format:check
npm run lint
npm audit --audit-level=high
node --test scripts/deployment-recovery.test.mjs scripts/testnet-funding.test.mjs
node node_modules/vitest/vitest.mjs run scripts/gemini-readonly-fixture.test.mjs
node scripts/check-web-boundary.mjs
node scripts/preview-smoke.mjs
```

Next.js loads `web/.env.local`, not the root `.env.example`. Templates contain only
placeholders. Gemini/network inference is disabled by default. PayPal settings are
`PAYPAL_ENVIRONMENT=sandbox` and `PAYPAL_PAYMENTS_ENABLED=false`; credential names
are `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` and `PAYPAL_WEBHOOK_ID`.

`GET /api/integrations/paypal` always reports unimplemented/disabled payments for
valid preparation configuration. Live mode or enabling payments returns 503.

## 2026-10-25 — Task 01: independent migration and PayPal preparation

### Request and repository inspection

The user requested an independent, buildable copy of Earmark in the new PayPal
repository, retaining the original application and security demonstrations,
documenting legacy dependencies before changes, preparing Sandbox configuration,
and leaving the original repository untouched. Deployment and real/Sandbox payments
were prohibited.

The destination directory was empty and initially inherited an unrelated ancestor
Git context. A local original checkout was found at `../project-flint`. Its
existing modified `HANDOFF` and untracked demo media were recorded and excluded
from migration inputs. GitHub remote inspection timed out/required authentication;
`gh` was not installed. The local committed source was used without claiming its
remote HEAD or the destination remote contents were verified.

### Migration and change inventory

1. **Pre-change documentation and integrity tools**
   - Added `docs/migration/legacy-dependencies.md` before application changes:
     architecture, package versions, database tables, model/tool logic, financial
     authority, hosting and exact Monad/Solidity/Foundry/wallet coupling.
   - Added `scripts/source-integrity.mjs`: capture/compare original Git state and
     SHA-256 file hashes without storing contents. Baseline is ignored at
     `.tools/source-integrity.json`.
   - Created a temporary minimal `.gitignore` and ignored `.tools/.gitkeep` to
     prepare baseline storage; the source export subsequently supplied the final
     original ignore rules. Neither is a standing source-repository dependency.
2. **Independent source import**
   - Exported all 260 tracked files from committed revision `cc20daa` using
     `git archive`, then initialized fresh destination Git metadata and configured
     the requested `origin`. Original `.git` history was not copied.
   - Imported `agent/`, `api/`, `contracts/`, `web/`, tests, assets, `scripts/`,
     configuration, historical `docs/`, `demo/` evidence and deployment manifests.
   - Excluded ignored credentials/environment files, `.neon`, dependencies, build
     outputs, caches, generated tools and uncommitted source work.
   - Installed destination dependencies independently. No original `node_modules`
     or generated Foundry binaries/artifacts were reused.
3. **Package manifests and verified patch dependencies**
   - Modified `package.json`: public root package name `earmark-paypal` and root
     `start` script for the web workspace.
   - Modified `web/package.json`: Next.js 16.4.0 → 16.4.3 and Zod 4.6.5 → 4.6.7.
   - Modified `agent/package.json`: Zod 4.6.5 → 4.6.7.
   - Updated `package-lock.json` for naming and these patch releases. Internal
     `@flint/*` workspace identities were preserved.
4. **Environment, CI and preview configuration**
   - Modified `.env.example` and `web/.env.example`: server-only Sandbox/Gemini/
     dedicated-Neon placeholders, disabled payment defaults, loading instructions
     and explicit separation from legacy EVM configuration.
   - Modified `.env.stage8a.example`: marked it as legacy Monad reference only.
   - Modified `.github/workflows/ci.yml`: Earmark PayPal identity, `main`/`dev`
     coverage and dependency installation with lifecycle scripts disabled.
   - Replaced `render.yaml` with a new-repository Next.js preview blueprint,
     disabled financial/network defaults, read-only preparation health route and
     `autoDeploy: false`. No hosting service was created.
5. **Application branding and honest integration status**
   - Modified `web/src/components/glass.tsx` and
     `web/src/components/navigation.tsx`: Earmark PayPal wordmark/accessibility.
   - Modified `web/src/app/layout.tsx`: product metadata, global preparation banner
     and footer explaining retained legacy EVM records/actions.
   - Modified `web/src/app/opengraph-image.tsx`: PayPal name and preparation copy.
   - Updated page titles in `web/src/app/page.tsx`,
     `web/src/app/activity/page.tsx`, `web/src/app/executions/[id]/page.tsx`,
     `web/src/app/mandates/new/page.tsx`, `web/src/app/mandates/page.tsx`,
     `web/src/app/payments/page.tsx` and `web/src/app/security/page.tsx`.
   - Kept original crystal assets, styling, routes, wallet behavior, authorization
     logic, financial lifecycle and recorded receipt provenance.
6. **Preparation-only PayPal boundary**
   - Added `web/src/server/paypal-config.ts`: server-only Sandbox/disabled-payment
     status validation, with no network client or secret values in output.
   - Added `web/src/app/api/integrations/paypal/route.ts`: read-only, uncached GET
     preparation status; invalid configuration returns a sanitized 503.
   - Added `web/test/paypal-config.test.ts`: rejects live/enabled configuration and
     checks that status cannot expose supplied credentials.
   - Modified `scripts/check-web-boundary.mjs`: include PayPal server credential
     names in the compiled browser chunk boundary check.
7. **Verification tooling and inherited failure fixes**
   - Modified `scripts/setup-foundry.mjs`: longer network timeout and optional
     `FOUNDRY_ARCHIVE_PATH`, retaining the original pinned checksum verification.
   - Modified `web/test/security-recordings.test.ts`: resolve evidence with
     `import.meta.url` instead of a workspace-dependent working-directory path.
   - Added `scripts/migration-audit.mjs`: compare original committed blob hashes
     with destination files and scan candidate source for secret patterns and
     non-template environment files; report paths/counts, not secret contents.
   - Added `scripts/preview-smoke.mjs`: local production server, seven route checks,
     four scenario controls, preparation endpoint, desktop/mobile screenshots and
     browser-error/overflow assertions. Blocks external requests and mutations.
8. **Project documentation**
   - Preserved the original README at `docs/migration/original-readme.md` with an
     explicit historical-provenance heading; rewrote root `README.md` for the new
     app, setup, configuration, checks and documentation links.
   - Added `docs/paypal-integration.md`: future provider-neutral policy boundary,
     consent, ledger/schema, currency conversion, Sandbox transport, webhook,
     idempotency and recovery sequence; payment lifecycle semantic differences.
   - Added `docs/migration/implementation-report.md`: migration scope, exact
     verification outcomes, limitations and recommended next steps.
   - Modified `docs/architecture.md`, `docs/branding.md`, `agent/README.md` and
     `web/README.md` to distinguish current PayPal identity from legacy material.

At migration completion, 232 of the original 260 files were byte-identical and
all original tracked paths remained present. The audit scanned 270 candidate
files with no credential-pattern findings. These are historical migration counts;
new documentation and subsequent work will change destination totals.

### Validation, failures and their resolution

- Initial `npm ci` exceeded the tool timeout; retry with scripts disabled and
  longer timeout succeeded. Patch updates were installed with scripts disabled.
- Initial Foundry download timed out. Downloaded the official 1.8.5 archive to
  ignored local storage and installed only after matching the pinned SHA-256.
  Solidity compilation then succeeded; existing compiler lint notices remained.
- Initial tests failed because Anvil/compiled artifacts were absent, plus the
  evidence-path bug noted above. Installing/building Foundry and fixing the path
  resolved those failures.
- The inherited Next.js build compiled pages but exited with a security error.
  `npm audit` identified Next.js/Zod advisories. The patch upgrades resolved the
  build failure and the final audit reported zero vulnerabilities.
- A concurrent build/test run exceeded three inherited five-second Gemini-session
  timeouts. The isolated web suite, then final full `npm test`, passed without
  weakening assertions or timeouts.
- A generic Node invocation initially included a Vitest-only script test; the
  final checks used the appropriate Node and Vitest runners separately.
- An initial preview-smoke selector omitted scenario letter prefixes; corrected
  the verification selector and all four controls passed. Application controls
  themselves were preserved.
- Formatter issues in added documentation/scripts were corrected. Final complete
  formatting and lint checks passed.

**Final recorded results:**

- `npm run typecheck`: passed (agent, web, API).
- `npm test`: passed — 176 Solidity + 140 agent + 175 web cases; five PostgreSQL
  integration cases skipped because no dedicated test database was supplied.
- Additional script checks: 21 Node tests and four Vitest cases passed.
- `npm run build`: passed across contracts, agent and Next.js production build.
- `npm run lint` and `npm run format:check`: passed; informational legacy style
  suggestions do not represent a failed lint run.
- `npm audit --audit-level=high`: passed, zero vulnerabilities at that time.
- Browser boundary: passed for 42 compiled JS chunks.
- Read-only production browser smoke: seven routes and four recorded scenario
  controls passed; 390px mobile layout had no horizontal overflow; no browser
  exceptions. Screenshots are ignored at `.tools/paypal-preview-desktop.png` and
  `.tools/paypal-preview-mobile.png`.
- Original integrity: HEAD, refs, status, diff and 305 hashes matched the baseline.
- No deployment, public-chain payment, PayPal Sandbox payment, live Gemini
  inference or real Neon connectivity verification was performed. Full inherited
  Playwright E2E was retained but not executed.

### Preserved security demonstration meaning

- **A — Normal Purchase:** provider comparison, permitted local mock payment,
  inspection, acceptance and settlement after the full challenge period.
- **B — Prompt Injection:** actual deterministic mock policy ignores a redirect;
  a separate unauthorized-provider probe reverts. No live-model robustness claim.
- **C — Invalid Delivery:** deterministic inspection blocks acceptance; owner
  rejection restores available budget/headroom.
- **D — Budget Exhaustion:** two distinct four-USDC reservations succeed; a third
  exceeds the ten-USDC cumulative cap. The first reservations remain obligations.

Local Anvil evidence, historical Monad records and PayPal integration status must
continue to be labelled separately.

## 2026-10-25 — Create the active handoff and continuous documentation rule

**User request:** create a new handoff documenting all completed work and always
document every subsequent change.

**Changes:**

- Added `HANDOFF-PAYPAL.md`: active status, architecture, operating commands,
  complete migration change inventory, verification history, known limitations,
  next steps and this documentation change record.
- Added root `AGENTS.md`: persistent instruction to read this handoff and log
  every future code/dependency/configuration/test/script/documentation change,
  affected paths, rationale, actual checks, blockers and follow-up work.
- Updated `README.md`: direct links to the active handoff and repository
  documentation requirement.

**Fresh verification for this documentation request:**

- `node node_modules/prettier/bin/prettier.cjs --check AGENTS.md HANDOFF-PAYPAL.md README.md`:
  passed for all three files.
- `node scripts/migration-audit.mjs`: passed; 272 candidate files scanned, no
  credential-pattern findings or missing original tracked paths; 232 original
  files remain byte-identical.
- `git diff --check`: passed; repository files remain untracked, so this command
  does not replace the explicit formatting check above.
- Reviewed current Git status and remote configuration. No commit, push or
  deployment was performed. No blocker to using the new handoff.
- Application tests/build were not rerun for this documentation-only request.
  Earlier migration results above remain historical results, not fresh runtime
  verification. Future changes must append their own dated records here.

## Outstanding work and recommended continuation

1. Authenticate destination GitHub access, inspect its existing contents/default
   branch and publish only when requested. Local files are not yet committed.
2. Define owner authentication and PayPal approval/consent. EIP-712 signatures do
   not substitute for PayPal customer approval.
3. Extract provider-neutral authorization/payment types while retaining existing
   validation, spending-cap, allowlist, delivery and recovery regression coverage.
4. Provision a new Neon project/branch and PayPal-specific schema/binding. Preserve
   transactional reservations, immutable external IDs, consumed nonces and events.
5. Define explicit currency/minor-unit accounting. Six-decimal mock-USDC integers
   must not be reinterpreted as fiat cents.
6. Implement Sandbox-only server transport and the selected PayPal lifecycle,
   stable idempotency keys, verified/deduplicated webhooks and uncertain-outcome
   reconciliation. PayPal authorization is not automatically TaskVault escrow.
7. Validate mocked policy/transport and all four scenarios before separately
   exercising approved Sandbox flows and recording real integration evidence.
8. Keep this handoff current for every change, including documentation updates.

### Supporting records

- [Migration implementation report](docs/migration/implementation-report.md)
- [Pre-change legacy dependency inventory](docs/migration/legacy-dependencies.md)
- [PayPal integration architecture](docs/paypal-integration.md)
- [Preserved legacy architecture](docs/architecture.md)
- [Original README provenance](docs/migration/original-readme.md)
- [Current setup guide](README.md)
