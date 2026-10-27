# Earmark PayPal — active handoff and change log

Last updated: **2026-10-27**

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
- **Git:** local `main` and locally stored `origin/main` point at `aa69c9b`
  (Initial Earmark PayPal migration). The initial migration was committed
  between sessions; subsequent Task 02/03 changes are currently uncommitted. No remote fetch,
  publication or deployment was performed in this session.
- **Original source:** sibling `../project-flint`, remote
  `https://github.com/aveidt96/Flint.git`, commit
  `cc20daa06392c588a42925d3844311abac1a067f`.
- **Source integrity:** the last migration verification matched original HEAD,
  refs, working status, diff and 305 file hashes, including ignored environment
  files and pre-existing user changes. Do not modify that repository.
- **PayPal:** Sandbox-only foundation retains policy/reservations, OAuth/Orders,
  approval-gated capture, strict webhook verification and recovery. US profile is
  running at `http://127.0.0.1:3031/paypal-test`; Task03E/03G exact one-shot
  permissions are **spent**. Actual order **72936380818559054** and capture
  **52C23729CU714125M** are authoritatively **COMPLETED**, USD6.00, matching US
  seller/order/attempt terms. Exactly one capture POST/claim and one consumption
  verified. No further payment is authorized; ordinary payment flags remain false.
  No buyer approval was automated. Original order **9N317079B4816951W** is unresolved;
  its last original-credential GET was 404, not non-capture evidence. Original
  credentials are not locally configured for investigation; US credentials are
  rejected by original-order tooling. Webhook ID remains absent (no fake).
- **Human handoff:** Task03G succeeded: inspect the receipt through authenticated
  local UI or read-only `paypal:us:status` / `paypal:us:capture:verify`. Do not rerun
  execute, reapprove, create replacements, reset journals or spend the remaining
  $4 without a new explicit authorization. The exact capture permission is spent
  durably across restart; capture replay returns only the saved successful result.
  Resolve the old obligation separately. Preserve owner/both campaigns, do not
  reset expired authority or release reservations from 404. Current evidence and
  Current receipt/checks: `docs/task-03g-capture-report.md`. Earlier Task03E/03F
  preparation/approval results remain historical.
- **Deployment:** none performed for this repository. The Render blueprint has
  automatic deployment disabled.
- **Database:** `database/paypal/001_sandbox.sql` defines an isolated
  `earmark_paypal` schema; Task 03A applied its exact approved version and verified
  all actual objects plus eight real PostgreSQL accounting/concurrency cases.
  Runtime uses the dedicated
  `PAYPAL_DATABASE_URL` and Sandbox binding, never legacy `DATABASE_URL*` fallback.
  Existing Monad tables/migrations are preserved. Do not run legacy `db:migrate`
  for PayPal. Client TLS, identity and absence of legacy objects are verified.
  Task 03C wrote the authorized real Sandbox mandate/attempt: mandate
  **8fb8ada6-ad12-5bc8-ac4c-90e6a07ed064**, cap1000/request600/reserved600/
  consumed0/available400 USD minor units. Available $4 is held-budget accounting,
  not payment success. Disposable test schemas were removed, not persistent data.
  Task 03D additionally prepared US mandate **889b9c4a-b875-5de9-a354-18a037d41f52**,
  attempt **422ae62d-cd25-425f-9fdb-ce50ad6f0ffa**. Task03G now verifies US cap1000/
  consumed600/reserved0/available400 USD minor units, **SUCCEEDED/CONSUMED** and the
  single capture above. Task03D's original hold audit and every original financial/
  audit row remain unchanged versus Task03E baseline. Remaining reservation across
  both mandates is the **original $6**; US spent $6 with $4 available.
- **Latest validation (Task03G):** actual capture POST HTTP201 followed by canonical
  order/capture GET and independent API/fresh Neon reads confirms COMPLETED and
  matching accounting/preservation. **229 mocks**, full web **402 passed**, real
  disposable PostgreSQL **16 passed**: **418 distinct web/DB cases**, no test
  failures. Root/script TypeScript, lint/format/Foundry, production web build,
  mock/actual read-only UI, catalog, secret/browser and original source-integrity
  checks passed. First build timed out during traces; complete retry passed.
  Agent/Solidity suites were not rerun. See Task03G report/log for fresh details.

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

`GET /api/integrations/paypal` reports the backend foundation without network
readiness verification. Existing payment fields remain false for unwired UI/agent
entrypoints; `backendImplemented` is true and `sandboxVerified` is false. Live
origins/invalid flags are rejected. Backend and low-level payment dispatch switches
are separately disabled by default.

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

## 2026-10-25 — Task 02: PayPal Sandbox backend foundation

Request: implement isolated PayPal Sandbox database/policy/client/webhook/recovery
infrastructure with mocked tests; preserve UI, Gemini tools and legacy contracts;
no deployment or payment execution. Read the required four architecture documents,
this handoff, repository rules, database adapters, signed launch authorization,
agent tools/models, Vitest conventions and installed Next.js Route Handler guide.
Consulted official PayPal OAuth, Orders create/get/capture, idempotency and webhook
signature verification documentation. New backend will use a separate
`earmark_paypal` schema and server-only modules, with no public financial endpoints
or autonomous agent wiring. Exact amounts, transactionally locked budgets,
immutable attempt/request identities and read-only reconciliation are required.

Fresh Git inspection shows local `main` and local remote-tracking `origin/main`
at `aa69c9b` (Initial Earmark PayPal migration) with a clean worktree. This updates
the earlier current-state note about uncommitted migration files; that note was
accurate when written. No fetch/push was performed during this inspection.
Changed paths, implementation details and fresh checks will be appended as work
is completed below.

### Completed implementation and file inventory

- Added `database/paypal/001_sandbox.sql`: separate Sandbox schema/version history,
  mandates/merchants, exact ledger counters, immutable attempts and PayPal references,
  idempotency, verified webhook inbox and append-only audit; row/ledger/immutability
  constraints and deferred reconciliation triggers. No migration applied.
- Added `web/src/server/paypal/domain.ts`, `web/src/server/paypal/policy.ts`,
  `web/src/server/paypal/repository.ts` and `web/src/server/paypal/postgres.ts`:
  strict neutral policies and exact minor units, transactional
  reservations, durable pre-dispatch claims, terminal ledger invariants, isolated
  direct-Neon connection/binding and legacy-database refusal.
- Added `web/src/server/paypal/config.ts` and `web/src/server/paypal/client.ts`:
  pinned Sandbox origin,
  separate disabled-by-default backend/payment flags, server-only credentials,
  OAuth cache/coalescing, single-seller Orders transport, stable request IDs,
  bounded safe-read retries/timeouts and sanitized ambiguous financial failures.
- Added `web/src/server/paypal/service.ts`: owner-invoked creation/capture, fresh
  buyer-approval and policy revalidation, immutable response binding, no blind
  re-creation/recapture, revocation and exact budget resolution, read-only recovery.
- Added `web/src/server/paypal/webhooks.ts`, `web/src/server/paypal/runtime.ts`,
  `web/src/server/paypal/http.ts` and
  `web/src/app/api/paypal/webhooks/route.ts`: documented PayPal signature
  verification, full-event verification, bounded ingress, verified-only durable
  deduplication, trusted order/capture reconciliation, out-of-order handling and
  durable failure/backoff recovery. Public financial routes remain absent.
- Added `scripts/paypal-migrate.ts` and `scripts/paypal-recover.ts`; modified
  `package.json` with `paypal:db:plan`, `paypal:recover`, `paypal:test` commands.
  Both operational commands default to offline plans. No dependencies added.
- Added mocked test files `web/test/paypal-policy.test.ts`,
  `web/test/paypal-service.test.ts`, `web/test/paypal-client.test.ts`,
  `web/test/paypal-postgres.test.ts`, `web/test/paypal-webhooks.test.ts` and helper
  `web/test/fixtures/paypal.ts`. Added default-disabled
  `web/test/paypal-database.integration.test.ts` and
  `web/test/paypal-sandbox.integration.test.ts`; the latter is OAuth-only.
- Modified `web/src/server/paypal-config.ts` and `web/test/paypal-config.test.ts`
  for truthful backend-foundation status while retaining false UI/agent payment
  fields; added explicit backend/readiness/autonomy metadata.
- Modified `.env.example` and `web/.env.example` with Sandbox origin/flags/seller
  and dedicated database placeholders, plus opt-in integration-test settings.
- Modified `scripts/check-web-boundary.mjs` to also prohibit PayPal client-ID
  variables in browser chunks (alongside server secrets/database settings).
- Modified `AGENTS.md`, `README.md`, `docs/paypal-integration.md`; added
  `docs/paypal-backend.md` for the implemented architecture, schema, API behavior,
  operator commands, exact accounting, consent/revocation/recovery semantics,
  security limitations, official API references and remaining integration steps.
- Preserved original UI/agent tool execution/Solidity/Monad schema implementations.

### Implementation progress notes (superseded by final results below)

- Initial focused PayPal run: 97 passed, five optional integration checks skipped.
- TypeScript initially identified strict optional-property/test mock typing issues;
  fixed those without weakening compiler settings. Subsequent typecheck passed.
- `npm run paypal:db:plan`: passed offline, with `databaseContacted: false`.
- No PostgreSQL/Docker executable was available; real SQL transaction/constraint
  checks and Sandbox connectivity remain unexecuted. The unit-test concurrent
  repository mock is not evidence of real database concurrency verification.
- Review hardened pending-capture monotonicity, schema/record identity checks,
  replay guards and read-only recovery diagnostics. Final checks are pending.
- Full intermediate regression run passed: 176 Solidity, 140 agent and 273 web
  cases, ten optional/database cases skipped; build/typecheck/format/lint/audit
  passed. Source integrity still matched 305 original hashes. Subsequent final
  API review added canonical GET handling for partial financial responses and
  verified order-hint correlation when capture GET omits related IDs; their
  dedicated tests and final rerun are being completed.

### Final verification and outcomes

Final persistence review additionally corrected PostgreSQL trigger/upsert
interaction: existing attempts now use UPDATE, so a new-row-only INSERT guard is
not run on lifecycle updates. Added a regression case and extended the opt-in real
database case through approval/capture. Database time is refreshed after lock
acquisition and financial-claim triggers independently check activity/expiry.
The final web suite, TypeScript, production web build and offline migration plan
all passed after those persistence changes.

- `npm run typecheck`: passed for agent, web and API after the final API hardening.
- `npm test`: full root run passed — **176 Solidity + 140 agent + 277 web = 593
  cases**, before the last persistence-review fix and its additional regression.
  After that fix, `npm run test --workspace @flint/web` passed **278** cases.
  Latest suite totals are **176 + 140 + 278 = 594 passed**, including **105
  PayPal-specific mocked cases** (the updated two status tests are included).
  Ten cases skipped: five inherited PostgreSQL integration,
  four isolated PayPal PostgreSQL integration and one opt-in Sandbox OAuth check.
- All requested mocked scenarios are covered: authorization, unauthorized agent/
  merchant, expiry/revocation, per-transaction/cumulative/concurrent limits,
  currency, duplicate order/capture attempts, ambiguous timeouts, rollback,
  verification failures, duplicate/out-of-order webhooks and durable recovery.
- `npm run build`: passed for contracts, agent and Next.js, including the new
  `/api/paypal/webhooks` route. Existing Solidity compiler informational warnings
  remain; no contracts or legacy tests were changed by this task. The final web
  production build passed again after the persistence fix.
- Complete Prettier check passed. Biome lint with warnings-as-errors passed for
  191 files; Foundry `fmt --check` also passed. Two initial new-code lint warnings
  (optional chain/type-only import) were corrected before final checks.
- `npm audit --audit-level=high --fetch-retries=0 --fetch-timeout=30000`: passed,
  zero vulnerabilities. No dependencies or lockfile versions were changed.
- `npm run paypal:db:plan` and `npm run paypal:recover`: passed in offline plan
  mode. No database contacted/migration applied or provider payment requested.
- `node scripts/preview-smoke.mjs`: passed seven production routes, all four
  scenario controls, status endpoint, mobile layout and browser exception checks;
  external services and browser mutations blocked. Ignored outputs
  `.tools/paypal-preview-desktop.png` and `.tools/paypal-preview-mobile.png` were
  refreshed. Test/build commands also refreshed ignored `agent/dist/`,
  `contracts/out/`, `contracts/cache/`, `web/.next/` and TypeScript cache artifacts;
  no generated output was copied from or written into the original checkout.
- `node scripts/check-web-boundary.mjs`: passed for 43 compiled browser JS chunks.
- `node scripts/migration-audit.mjs`: passed, 295 candidate files scanned, no
  credential-pattern findings or missing original tracked files. The original
  source comparison still has 232 byte-identical files.
- `git diff --check`: passed. Source integrity verification passed: original HEAD,
  refs, status, diff and 305 file hashes still match the baseline, including its
  ignored environment files and pre-existing user work.
- The final post-persistence-change complete formatting check, Biome check and
  43-chunk browser boundary check passed again. The migration plan was rerun
  against the final SQL file in offline mode only.

Implementation review also corrected SQL block terminators before any application
and strengthened schema/JSON bindings, ledger checks and immutable request IDs.
Actual PostgreSQL execution remains unverified because the opt-in test database
was unavailable; the mocked concurrent test does not prove PostgreSQL locking.
The final transport tests cover partial successful POST responses requiring a
canonical GET and preserving ambiguity if that GET fails. Verified webhook hints
still require complete trusted order/capture membership checks before resolution.

No autonomous payment tool, public financial endpoint, real/Sandbox payment,
database application, AWS/other deployment, Git commit or push was performed.
Existing UI, legacy EVM/Solidity, original database tables and Gemini tools are
preserved. The isolated backend is ready for authenticated checkout/database/
Sandbox integration work, not a claimed verified payment flow. Operational limits
include single configured seller, no refund/dispute automation, manual escalation
for unknown order references and no scheduled worker. Details and operator commands
are in `docs/paypal-backend.md`.

## 2026-10-26 — Neon configuration and read-only migration readiness inspection

Request: identify expected variables/environment-file location, verify server-only
loading/Git exclusion, connect read-only to the newly configured Neon database,
check isolation from the original Earmark database and inspect migration safety.
No migration, deletion, payment, deployment or original-repository changes allowed.

Inspected the PayPal adapter/runtime, shared Neon pool, migration runner, SQL,
templates, Git exclusions and installed Next.js environment-loading guide. A
temporary ignored `.tools/paypal-env-summary.mjs` reported variable names and
configuration booleans only; no connection string, host, username or password was
printed. It found `web/.env.local` with pooled `DATABASE_URL` and direct
`PAYPAL_DATABASE_DIRECT_URL`, but the application expects direct
`PAYPAL_DATABASE_URL` and `PAYPAL_DATABASE_ENVIRONMENT=sandbox`; both were absent.
Both URLs classify as Neon, with the expected pooled/direct distinction and a
different endpoint from the pinned legacy source. Git confirms local env paths
are ignored and untracked. Read-only connection/isolation checks and final results
will be recorded below.

### Changes and fresh results

- Updated ignored `web/.env.local` by adding only non-secret
  `PAYPAL_DATABASE_URL=$PAYPAL_DATABASE_DIRECT_URL` and
  `PAYPAL_DATABASE_ENVIRONMENT=sandbox`. Existing pooled/direct credential values
  were preserved; the file was not read into tool output or staged in Git.
- Added `scripts/paypal-env.ts`: shared server/CLI Next.js environment loading from
  the `web/` workspace with expansion and sanitized loading errors. Modified
  `scripts/paypal-migrate.ts` and `scripts/paypal-recover.ts` to load those settings
  only when explicitly running their operations; default offline behavior remains.
- Added `scripts/paypal-db-inspect.ts` and `package.json` command
  `paypal:db:inspect`: redacted configuration/bundle checks, plus explicit
  `--connect` for bounded read-only TLS/catalog/privilege inspection. It refuses
  the pinned legacy endpoint and does not import or execute migration operations.
- Updated `README.md` and `docs/paypal-backend.md` with exact names, local alias,
  corrected CLI loading/commands, read-only inspection, SQL review and readiness.
- Temporary ignored `.tools/paypal-env-summary.mjs` assisted initial key-name-only
  inspection; it contains no configured credentials.
- Fresh connection succeeded. Client TLS and certificate authorization passed;
  transaction was READ ONLY and rolled back. Configured database identity matches,
  pooled/direct target matches, legacy endpoint differs, legacy tables are absent,
  user-table count is zero, and the PayPal schema is absent. Required schema-create,
  PL/pgSQL and advisory-lock execution privileges are available.
- PostgreSQL cannot prove the Neon console project display name. Isolation here
  means endpoint/configured-database matching plus absence of original markers,
  consistent with the user's newly created dedicated project.
- Initial diagnostic incorrectly used compute-side `pg_stat_ssl` alone for TLS.
  Corrected it to inspect the actual client TLS socket/certificate: Neon proxy
  termination explains the compute-side false result. TLS validation was not
  disabled or weakened.
- The first npm-forwarded `--connect` was interpreted by npm instead of reaching
  the script and stayed offline. The documented direct Node invocation then ran
  the read-only check successfully.
- No `NEXT_PUBLIC_` database configuration was present. Existing 43 compiled
  browser chunks had zero configured URL/password matches; this was an existing
  artifact scan, not a new production build.
- Git ignore checks matched `.gitignore` for `web/.env.local` and `.env.local`;
  neither is tracked (the initial `git ls-files --error-unmatch` nonzero exit was
  the expected confirmation of that fact).
- SQL reviewed unchanged at its existing checksum: only additive objects/seed
  INSERT in the new schema; protective trigger UPDATE/DELETE references do not
  execute deletion. No destructive DDL, data clearing or changes to original
  Monad tables were found. SQL execution remains untested because no migration
  application was authorized.
- Fresh verification: strict targeted TypeScript check passed for
  `scripts/paypal-env.ts`, `scripts/paypal-db-inspect.ts`,
  `scripts/paypal-migrate.ts` and `scripts/paypal-recover.ts`, using the existing
  ESNext/bundler conventions, exact optional properties and unchecked-index checks.
  The first invocation used an invalid `--esModule` option; corrected it to
  `--module` and reran successfully.
- Biome warnings-as-errors passed for 193 files. Targeted formatting passed.
  `paypal:db:inspect`, `paypal:db:plan` and `paypal:recover` all passed in their
  default offline modes after the shared-loader change. The unchanged migration
  checksum still matches the Task 02 SQL. `git diff --check` passed.
- Application tests, the production build and real database integration tests were
  not rerun: this request changed local non-secret mapping, diagnostic/CLI loading
  and documentation. Prior Task 02 test/build results remain historical; fresh
  Neon readiness evidence is limited to the explicit read-only checks above.

Readiness: **passed preflight for a separately approved migration**. It is not
runtime schema readiness or a working payment-flow claim. No migration, customer
data write/deletion, payment, original-repository change, deployment or Git
publication was performed.

## 2026-10-26 — Task 03A: authorized migration and real PostgreSQL tests

### Implementation progress (final outcomes follow)

The user explicitly authorized applying only `database/paypal/001_sandbox.sql` to
the verified dedicated PayPal Sandbox database, followed by catalog verification,
real PostgreSQL accounting/concurrency tests in disposable isolation, and full
regression checks. No PayPal API payments, Live APIs, deployment or Git publication
are authorized. Reviewed the exact SQL and existing tooling/tests. Fresh read-only
preflight loaded `web/.env.local`, confirmed Sandbox/direct alias/pooled-target
consistency, verified client TLS/certificate and database identity, found no legacy
objects, zero user tables and no `earmark_paypal` schema. Required privileges pass.
The exact approved SQL SHA-256 remains
`eaa2680ae6a842456989b3895b944b73d4e1fd551a5ee66161ed836c42ba21ad`.

The previous four real database tests only support an empty loopback database and
would drop a fixed schema. They must be adapted to a generated, session-owned test
schema before use on Neon. Persistent `earmark_paypal` data must never be included
in test writes or cleanup. Changed paths, migration evidence, failures and final
checks will be recorded below as work completes.

Migration execution: hardened `scripts/paypal-migrate.ts` using new
`scripts/paypal-db-safety.ts` to pin the reviewed checksum, check direct/alias/
pooled target consistency and reject the legacy endpoint, verify live client TLS,
database identity/legacy markers and fresh namespace on the same connection under
the migration lock. Applied with the existing runner's `--apply`: the exact
approved SQL and version/checksum history INSERT committed successfully in one
transaction. Added `scripts/paypal-db-verify.ts` for independent read-only catalog,
seed, checksum, ledger type/trigger and persistent-row verification. Catalog
results and real tests are pending; no payment APIs were invoked.

Independent catalog verification passed: eight tables, 16 valid indexes, eight
primary keys, six unique constraints, six foreign keys, 21 CHECK constraints, seven
enabled application triggers (two deferred ledger checks), and six PL/pgSQL
functions. Sandbox seed/version and migration checksum history match. Persistent
application row counts remain zero; only environment/history have one seed each.
No unrelated tables or disposable test schemas were present.

Added `web/test/fixtures/paypal-database.ts` for generated UUID-namespaced test-only
SQL routing and owner/OID-checked cleanup, updated
`web/test/paypal-database.integration.test.ts` to retain the original four cases
and add revocation, ambiguous/pending outcomes, concurrent capture claims and
terminal-state tests. Added `scripts/paypal-db-test.ts` and package commands for
explicit Neon-only/full regression execution. The launcher revalidates the
migrated target and disables Sandbox network tests, payment flags and legacy DB
test connections. All PayPal responses in these tests remain mocks; the database
transactions/constraints/concurrency are real PostgreSQL.

The first isolated Neon run passed all eight real database cases, including all
four previously skipped cases. Cleanup removed the generated schema. Test helper
checkout initially attached duplicate error listeners to reused pool clients,
causing MaxListeners warnings; fixed with one guard per client via WeakSet rather
than suppressing the warning or increasing listener limits. Persistent data and
post-cleanup catalog checks will be rechecked. Updated the existing redacted
`scripts/paypal-db-inspect.ts` to report installed Sandbox/checksum markers after
migration, instead of incorrectly continuing to label the migration unapplied.

### Final outcomes, changed paths and verification

- Applied `database/paypal/001_sandbox.sql` unchanged with the explicitly authorized
  migration runner. COMMIT succeeded; no migration failure/rollback was observed.
  The runner now pins the approved checksum, verifies direct/alias/pooled target
  consistency, rejects the original endpoint, rechecks actual TLS/database/legacy
  markers and fresh namespace under its lock, and rolls back on failure.
- Added `scripts/paypal-db-safety.ts`, `scripts/paypal-db-verify.ts`,
  `scripts/paypal-db-test.ts` and `web/test/fixtures/paypal-database.ts`; modified
  `scripts/paypal-migrate.ts`, `scripts/paypal-db-inspect.ts`,
  `web/test/paypal-database.integration.test.ts` and `package.json` for hardened
  operation guards, independent catalog verification, truthful installed status,
  explicit real-Neon launchers and session-owned disposable test isolation.
- Added `docs/task-03a-database-report.md`; updated `README.md`,
  `docs/paypal-integration.md` and `docs/paypal-backend.md` for the applied state,
  commands, evidence, isolation model and remaining Sandbox API prerequisites.
- Catalog checks passed before and after real tests: eight tables; 16 valid
  indexes; eight primary keys; six unique constraints; six foreign keys; 21 valid
  CHECK constraints; seven enabled triggers, including two deferred ledger checks;
  six PL/pgSQL functions; exact numeric accounting columns, mandate lifecycle,
  Sandbox seed, audit identity and version/checksum history all verified.
- Persistent `mandates`, `approved_merchants`, `attempts`, `idempotency`,
  `webhook_events` and `audit` remain empty. `environment`/`schema_migrations` have
  one row each. No disposable schemas remain; no unrelated user tables exist.
  Only the generated schemas created by each test invocation were dropped.
- `npm run paypal:test:db`: all eight real PostgreSQL cases passed, including the
  four previously skipped cases. The initial test-only listener warning was fixed
  with a WeakSet guard; the final full rerun had no listener warning.
- `npm run paypal:test:db:all`: 176 Solidity + 140 agent + 286 web = **602 passed,
  six skipped**. The eight real database cases cover concurrent caps, raw counter
  rollback, duplicate intents and consumption, immutable/audit protections,
  revocation, ambiguous/pending outcomes, duplicate capture claims and terminal
  transitions. All PayPal responses remain mocks; no payment API request occurred.
- Skips are five inherited Monad DB cases (legacy connections disabled) and the
  optional real Sandbox OAuth case (network tests disabled). No database test
  failed, and PayPal database cases are no longer skipped in the explicit launcher.
- Additional Node recovery/funding cases: 21 passed. Read-only Gemini fixture
  cases: four passed. **627 distinct total passing tests**, six skipped; duplicate
  executions are not counted twice.
- `npm run typecheck`, strict standalone operational-script TypeScript checks,
  Biome warnings-as-errors (197 files), Foundry formatting, and root production
  build passed. Existing Solidity timestamp/loop notices remain unchanged.
- Dependency audit passed with zero vulnerabilities. Read-only browser smoke
  passed seven routes, four scenarios and mobile layout; external/browser mutation
  paths blocked. Browser boundary and actual database credential-value scan passed
  for 43 chunks after building with local server env.
- Read-only post-test catalog verification and installed-status inspection passed.
  One combined catalog/inspection command timed out after successful catalog
  output; the standalone inspector rerun succeeded with
  `PAYPAL_DATABASE_ALREADY_MIGRATED`. No data write was involved in that retry.
- Original source integrity still matches HEAD, refs, status, diff and 305 hashes.
  No original checkout/environment/database was modified or connected for tests.
- No dependency versions, migration SQL, credential values, UI, agent tools or
  payment runtime logic changed. Ignored local build/test outputs and smoke
  screenshots were refreshed only in this checkout.
- Final complete Prettier check, Biome check and `git diff --check` passed after
  documentation updates. `web/.env.local` remains Git-ignored. Full results and
  reproducible commands are recorded in `docs/task-03a-database-report.md`.

The database layer is ready for controlled real Sandbox API testing. Presence-only
checks show client ID, client secret, webhook ID and merchant ID are not configured;
backend/payment flags remain disabled. Configure those server-side and integrate
verified owner identity/buyer approval before separately authorized payment work.
No PayPal API payment, PayPal Live access, deployment, commit or push occurred.

## 2026-10-26 — Task 03B: real Sandbox OAuth only

Request: use locally configured server credentials to prove real PayPal Sandbox
OAuth connectivity and token caching/expiry handling, enable the opt-in positive
OAuth integration check, run mocked negative/regression/build checks, and verify
secret boundaries. Orders, captures, refunds, payouts, Live APIs, deployment,
database record changes and Git publication are prohibited.

Read this handoff, backend guide, Task 03A report, existing client/config/runtime,
OAuth integration test and environment loader. Ignored
`.tools/paypal-oauth-env.ts` performed presence/format/flag-only inspection. Both
OAuth credentials are present, Sandbox origin/environment checks pass, no public
credential variables or insecure TLS override were found, and backend/payment
flags remain disabled. Merchant/webhook IDs are absent. The first configuration
probe exceeded its short tool timeout; retry completed without a network request.
Git confirms local environment files are ignored and untracked.

The current full-backend parser unnecessarily gates OAuth on merchant/webhook
configuration. Plan: extract shared OAuth-only settings, keep strict checkout
requirements, reuse the same PayPalClient authentication/cache code, expose only
non-secret cache metadata and run the real positive test with an exact token-URL
transport allowlist. Do not invent a merchant ID or enable financial operations.

Actual connectivity succeeded: the opt-in positive integration test invoked the
existing PayPalClient only at the official Sandbox token endpoint. Initial grant
and refresh both returned HTTP 200; the client validated Bearer and an expires_in
of 32,400 seconds. Cache reuse, one-millisecond-before-expiry reuse, rejection at
the simulated early cache deadline, and a second successful real OAuth grant all
passed. The 60-second safety margin gives 32,340 seconds usable cache lifetime.
Only the client clock was advanced; no claim that nine wall-clock hours elapsed.
No token, app ID, scopes or credentials were printed/persisted, and no payment
endpoint/database operation was used. The initial focused run passed 106 cases
with eight real-database cases deliberately skipped. A preceding combined
typecheck/test command exceeded its tool timeout before reaching OAuth; the
separate OAuth command then passed. Final negative/regression checks follow.

### Implementation and final results

- Modified `web/src/server/paypal/config.ts`: extracted shared OAuth-only settings
  parsing (Sandbox restrictions/client ID/secret only) and reused it for strict
  full checkout settings. No dummy merchant/webhook ID is used. Full backend
  startup still requires its existing execution flag, merchant and webhook IDs.
- Modified `web/src/server/paypal/client.ts`: retained the single existing Basic
  grant, parsing, retry and cache implementation; added safe metadata for lifetime/
  effective expiry and rejection of whitespace tokens. OAuth-only client settings
  cannot create/capture or verify webhooks. Tokens remain memory-only/server-side.
- Updated `web/test/paypal-sandbox.integration.test.ts` with the real positive
  grant/cache/boundary/refresh check and exact token-endpoint-only transport guard.
  Assertions use booleans, never token strings in diffs. Failures expose only fixed
  code/HTTP status; `.tools/paypal-oauth-result.json` stores selected safe metadata.
- Added `web/test/paypal-oauth.test.ts`: 28 synthetic negative/boundary cases for
  credential/type/expiry parsing, Live/origin rejection, absent capabilities,
  cache boundary/short lifetime, retry bounds and sanitized HTTP 400/401/403 errors.
  Actual local credentials were used only in the positive Sandbox OAuth case.
- Added `scripts/paypal-oauth-test.ts` and `scripts/paypal-secret-check.ts`; updated
  `package.json` with `paypal:test:oauth`, `paypal:test:oauth:all` and
  `paypal:secrets:check`. Opt-in is process-scoped; local credential files and
  persistent backend/payment flags were not changed. Profiles disable database/
  legacy DB tests and actual financial/backend execution; HTTP debug logging is off.
- Added `docs/task-03b-oauth-report.md`; updated `README.md`,
  `docs/paypal-backend.md` and `docs/paypal-integration.md` for actual OAuth evidence,
  commands, no-merchant prerequisite, secret boundaries and checkout blockers.
- Final real case again returned **HTTP 200 twice**, Bearer and a remaining lifetime
  of **31,685 seconds** (31,625 usable with the 60-second safety margin). The earlier
  run returned 32,400 seconds. Lifetimes are parsed dynamically; PayPal can return
  its existing valid app token with remaining expiry. Different token values are
  not assumed. Two runs made four successful OAuth POSTs total; zero payment calls.
- `npm run paypal:test:oauth:all`: **176 Solidity + 140 agent + 307 web = 623 passed,
  13 skipped**. Includes 133 PayPal mocked cases plus the real OAuth case. Skips
  are eight PayPal and five legacy PostgreSQL cases, intentionally disabled to
  avoid database writes during this milestone. No actual invalid-credential API
  requests were sent; all negative authentication checks used mocks.
- Additional Node recovery/funding fixtures: 21 passed. Read-only Gemini script
  cases: four passed. **648 distinct passing cases**, 13 skipped; repeat runs are
  not counted twice. No test or real authentication request failed.
- `npm run typecheck`, strict OAuth-launcher/secret-check TypeScript, Biome (200
  files), complete Prettier check, Foundry formatting and root production build
  passed. Initial short probe/typecheck tool timeouts were resolved by successful
  retries; no compiler assertion or auth error was hidden.
- Dependency audit passed with zero vulnerabilities. Browser smoke passed seven
  routes, four original scenarios, mobile layout and no exceptions, with external
  traffic/browser mutations blocked. The build loaded local server env.
- Secret-value scan passed for 272 tracked files, all nonignored candidates and
  43 production browser chunks; zero raw client-ID/secret/encoded-Basic matches.
  Browser server-variable boundary also passed. Local env files are ignored and
  untracked. No token, client ID, secret, app ID or scopes were printed or newly
  persisted in reports/source; existing local credential values were not edited.
- Original HEAD/refs/status/diff and 305 hashes still match. No original repository,
  production/database record, migration, dependency version, UI, deployment, commit
  or push was changed. Ignored build/test/screenshot artifacts were refreshed only
  in this checkout. Final documentation/source checks are recorded below.
- Final complete Prettier, Biome and `git diff --check` passed after documentation
  updates. Repeated value scan covered **272 tracked files, 306 nonignored candidate
  files and 43 browser chunks**, with zero matches. Both local environment paths
  remain ignored. The OAuth report records all command outcomes and the exact
  merchant-account information needed; credential/token values are not included.

Outcome: **real Sandbox app authentication verified; no OAuth blocker remains**.
Merchant and webhook identities still need the real account/app values. Obtain the
13-character Merchant ID from the corresponding Sandbox Business seller account's
business-information settings; never substitute client/app/buyer ID or email.
Verified owner identity, buyer approval/return/cancel flow and separately authorized
order/capture execution remain required for the first checkout. Standard Orders
API does not imply unattended payments; no payment-flow success is claimed.

## 2026-10-26 — Task 03C: PARTIAL — real order awaits human buyer approval

### Implementation checkpoint (later evidence follows)

Added server-only `web/src/server/paypal/test-config.ts`, `test-auth.ts`,
`test-checkout.ts`, `test-runtime.ts`, `test-http.ts`; authenticated
`web/src/app/api/paypal/test/route.ts` and `[action]/route.ts`; separate
`web/src/app/paypal-test/page.tsx`, `web/src/components/paypal-test.tsx` and
`paypal-test.module.css`. Added owner/campaign-stable mandate identity without a
new migration, read-only mandate/purchase lookup in `postgres.ts`, and existing
policy/service reuse. Updated `config.ts`/`client.ts` for genuine no-webhook manual
checkout settings, credential-owned default seller, and server-fixed return URLs.
Capture/order observations use canonical capture GETs before budget consumption.

Added `scripts/paypal-test-serve.ts` (loopback-only process, ignored random test
credentials, merchant binding and session epochs), `paypal-test-create.ts` (owner
login/mandate/reserve/order only, never approves/captures), `paypal-test-ui.mjs`
(synthetic browser verification with explicit screenshot watermark) and package
commands. Extended `scripts/paypal-secret-check.ts` and
`scripts/check-web-boundary.mjs` for local login/session secrets. Updated
`scripts/preview-smoke.mjs` for the separate route and `web/src/app/layout.tsx`
copy/metadata to identify the controlled test without changing the original UI.

Added `web/test/fixtures/paypal-checkout.ts`, `web/test/paypal-test-auth.test.ts`
and `web/test/paypal-test-checkout.test.ts`; extended the real PostgreSQL suite
with fixed-campaign concurrency/restart/cancellation cases. First PayPal mocked
run passed 166 cases (33 new), with nine external integration cases skipped.
Strict CSS-module optional typing initially failed, fixed with class fallback
without weakening compiler settings; subsequent typecheck passed. Initial lint
found an unused CLI variable/type-only import, both corrected. Full database,
browser and production validation plus actual order creation remain pending.

### Request, preflight and execution plan

The user authorized implementation and local execution of a fixed $10 USD mandate
and $6 Sandbox order/capture, only after human buyer approval. Read handoffs,
backend/API/policy/store/authentication patterns and installed Next.js guides.
Local presence-only inspection confirms OAuth credentials and a valid-format
merchant ID; webhook ID remains absent and no ID will be fabricated. The user
explicitly confirmed the merchant is the Sandbox Business seller associated with
the REST app. Canonical PayPal order payee will independently be checked using
credential-owned default-seller order creation. The initial combined DB preflight
timed out; standalone read-only verification passed: dedicated target/TLS/Sandbox
version/checksum and all objects valid; financial tables empty; no legacy objects.

Plan: loopback-only `/paypal-test` on port 3030, fixed allowlisted test owner with
server-verified password and HMAC HttpOnly session/CSRF, no client-supplied identity
or policies, one stable $10 mandate/$6 intent per owner/campaign, existing policy/
PostgreSQL/client reuse, canonical capture GET validation and explicit human
approval. New local test credentials will be generated only into ignored protected
files, not printed. Existing checkout defaults stay disabled; the operator launcher
enables only this constrained local process. No webhook prerequisite is needed for
manual API reconciliation, and the real webhook handler remains strict/disabled
until a genuine webhook ID is configured. No deployment or Git publication.

### Actual Sandbox order and human stop

The local operator profile authenticated the fixed test owner through its real
HTTP login, created the fixed $10 mandate and $6 reservation, then created exactly
one real Sandbox order. Actual order **9N317079B4816951W**, mandate
**8fb8ada6-ad12-5bc8-ac4c-90e6a07ed064**. No buyer approval was automated and no
capture was sent. The official Sandbox approval link is available only to the
authenticated local UI and the ignored order-result artifact.

`npm run paypal:test:status` independently read Neon in a READ ONLY transaction
and fetched the order using existing OAuth/client code: PayPal status
**PAYER_ACTION_REQUIRED**, 6.00 USD, correct immutable attempt references and
matching credential-owned merchant. Captured amount is zero and capture ID/status
are absent. Persisted state is AWAITING_APPROVAL/RESERVED, with cap1000/request600/
reserved600/consumed0/available400. `objectiveComplete=false`. The required
captured6/remaining4 result is not claimed. This is a genuine order creation/read,
not a mock result; all simulated captures below are test evidence only.

Checkout execution stopped at the required human step. The tester must open
**http://127.0.0.1:3030/paypal-test**, retrieve `loginSecret` locally from
`.tools/paypal-test-auth.json`, sign in, use **Approve with PayPal Sandbox** with a
Sandbox Personal buyer, return, select **Verify buyer approval** then explicitly
**Capture approved $6**. If pending/ambiguous, select recovery rather than a fresh
intent. The local server is intentionally left running. Its PID/origin/epoch are
in `.tools/paypal-test-server.json`; private startup log and local credentials
remain ignored. Sessions expire after 30 minutes; re-login preserves the same
owner/campaign/order. No PayPal buyer credentials are collected by Earmark.

### Final file inventory and behavior

- Added `web/src/server/paypal/test-config.ts`, `test-auth.ts`,
  `test-checkout.ts`, `test-runtime.ts`, `test-http.ts`: loopback/hosted gates,
  merchant/app confirmation binding, random allowlisted server owner, constant-
  time login, HMAC HttpOnly/Lax session, per-server epoch, expiry/logout/rate limit,
  exact Host/Origin/CSRF protection and strict JSON actions. No frontend identity,
  agent, merchant, amount, currency, mandate or purchase-key override is accepted.
- Added `web/src/app/api/paypal/test/route.ts`,
  `web/src/app/api/paypal/test/[action]/route.ts`, `web/src/app/paypal-test/page.tsx`,
  `web/src/components/paypal-test.tsx`, `web/src/components/paypal-test.module.css`.
  Separate themed interface displays authorization/amounts/merchant/order/capture/
  remaining state and manual approval/cancel/recovery. Query returns are hints.
- Modified `web/src/server/paypal/config.ts` and `client.ts` for real no-webhook
  manual checkout settings, default credential seller (no provided payee), and
  server-owned return/cancel URLs. Genuine webhook settings remain strict; no
  fake ID/registration occurred. Canonical capture GETs precede budget consumption.
- Modified `web/src/server/paypal/postgres.ts` with shared parsing/read-only
  mandate/purchase lookup and one-MVCC-statement checkout snapshots, preventing
  status/counter projections from crossing a capture commit. No migration changed.
- Added `scripts/paypal-test-serve.ts`, `scripts/paypal-test-create.ts`,
  `scripts/paypal-test-status.ts`, `scripts/paypal-test-ui.mjs`; updated
  `package.json` commands. Serve enables only the owned loopback process, never
  permanently edits credential/execution flags. Create never approves/captures;
  status uses only reads. Mocked UI screenshots carry an explicit watermark.
- Added `web/test/fixtures/paypal-checkout.ts`,
  `web/test/paypal-test-auth.test.ts`, `web/test/paypal-test-checkout.test.ts`;
  extended `web/test/paypal-database.integration.test.ts` with fixed-campaign
  concurrency and restart/cancellation accounting. Reused existing policy,
  journals, atomic reservations and payment service rather than reimplementing them.
- Modified `scripts/preview-smoke.mjs`, `scripts/paypal-secret-check.ts`,
  `scripts/check-web-boundary.mjs` for the new route and actual local test-secret
  boundaries. No actual credential value is in code or output.
- Modified `web/src/app/layout.tsx`, `.env.example`, `AGENTS.md`, `README.md`,
  `docs/paypal-backend.md`, `docs/paypal-integration.md`; added
  `docs/task-03c-checkout-report.md` with architecture, exact human steps, evidence,
  results, failures and local-auth limitations.
- Ignored `.tools/` artifacts: auth/server/order/status JSON and server log,
  `paypal-test-ui-actual.mjs` plus actual-awaiting desktop/mobile screenshots, and
  separately watermarked mocked UI screenshots. Actual UI inspection only logged
  in locally and read saved state; it blocked external browser requests and never
  clicked approval/capture. Build/test outputs stayed in this checkout.

### Validation and failures actually observed

- Full database-enabled run passed 176 Solidity, 349 web (including ten actual
  PostgreSQL cases); the agent suite initially passed139/failed1 on an inherited
  local Anvil receipt wait. The unmodified entire agent suite then passed140 with
  one worker; no assertion or timeout was weakened. Root initial exit was nonzero
  and is not described as one wholly green command.
- Added a Host-normalization regression after startup diagnostics; PayPal focused
  suite passed167 mocks, eleven integrations skipped. Full latest web rerun passed
  **340**, sixteen integrations skipped; the ten real DB and one real OAuth cases
  were executed successfully in their separate profiles. Real DB fixtures use
  session-owned/OID-checked disposable schemas; persistent test order data is not
  a cleanup target.
- Latest unique workspace coverage: 176 Solidity + 140 agent + 340 ordinary web +
  10 real PostgreSQL + 1 real OAuth = **667 passed**, five original DB cases not
  connected/run. Additional Node21/Gemini4 script cases passed: **692 distinct
  passing cases total**, five never-run legacy DB cases. Runs are not double-counted.
- TypeScript (agent/web/API and strict standalone operator scripts), Biome, full
  production build and read-only browser checks passed. Initial exact optional
  CSS typing and unused/type-only import lint issues were corrected.
- The first two local startup attempts stopped before order creation on an
  over-strict request.url origin comparison. Next normalizes its internal URL;
  incoming Host is now pinned to the configured loopback authority, with unchanged
  exact POST Origin/CSRF and owner verification. New regression and actual HTTP
  login/operation succeeded after rebuild. Only the failed owned children were killed.
- Mocked checkout UI smoke and eight-route existing app smoke passed; actual local
  owner UI shows AWAITING_APPROVAL, $0 captured/$6 held, no mobile overflow/errors.
  Initial actual-UI helper failed with sanitized output, staged standalone retry
  passed without an app behavior change. No approval was simulated in the real flow.
- Real OAuth positive again returned HTTP200/Bearer with cache/refresh checks;
  all negative credential cases remain mocks. Audit/Foundry/source integrity/final
  credential scans are recorded at session completion below. No Live or real-money
  operation, deployment, original-resource write, commit or push occurred.
- Final complete formatting and Biome warnings-as-errors checks passed (217 code
  files). Root production build and final web rebuild passed. Dependency audit
  reports zero vulnerabilities; Foundry formatting passed. Source integrity still
  matches the original HEAD/refs/status/diff and 305 hashes.
- Final value scan covered 272 tracked files, 324 nonignored candidates and 47
  browser chunks, including the generated test login/signing secrets: zero matches.
  Browser server-variable boundary passed and private env/auth artifacts stay ignored.
- Final read-only actual-status check still shows ACTIVE mandate,
  PAYER_ACTION_REQUIRED, AWAITING_APPROVAL/RESERVED, $10 cap/$6 requested/$6 held/
  $0 captured/$4 available, no capture ID, `objectiveComplete=false`. Independent
  catalog/data read confirms one mandate, one approved merchant, one attempt, two
  idempotency records and four audit events; two original seed/history rows intact,
  no disposable test schema or unrelated user table remains. No cap request was
  sent while collecting this read-only evidence.

## 2026-10-27 — Task 03C continuation and final handoff checks

Request: continue the remaining work from the prior session. Reviewed the active
handoff, current checkout report, package commands and read-only status script.

- Updated `docs/task-03c-checkout-report.md` to state the complete workspace total
  explicitly: 667 includes the separately executed OAuth case; adding 25 ancillary
  cases yields 692. The earlier 666 subtotal excluded OAuth, but the wording could
  be read as the complete workspace total. No test outcome or application behavior
  changed; these remain previously recorded results, not fresh test executions.
- Updated this handoff's date and recorded this documentation-only continuation.
- Added fresh continuation evidence to `docs/task-03c-checkout-report.md`:
  `npm run paypal:test:status` confirmed the same order, merchant match, ACTIVE
  mandate, PAYER_ACTION_REQUIRED, AWAITING_APPROVAL/RESERVED, cap1000/request600/
  reserved600/captured0/available400, no capture and `objectiveComplete=false`.
  Zero payment mutations; database transaction was read-only. The first invocation
  exceeded the 120-second tool limit; the standalone retry succeeded.
- Initial local HTTP probe timed out; a bounded curl retry confirmed port 3030 was
  unavailable. Restarted using the existing saved owner with
  `node --conditions=react-server --import tsx scripts/paypal-test-serve.ts --detach`.
  The launcher passed read-only database/checksum preflight and epoch-bound 401
  authentication readiness. A subsequent GET `/paypal-test` returned HTTP 200.
  No new owner, mandate, reservation or order was created. Restart invalidates old
  sessions; re-login uses the same saved secret and durable checkout identity.
- Refreshed ignored `.tools/paypal-test-authoritative-status.json`,
  `.tools/paypal-test-server.json` and `.tools/paypal-test-server.log`; preserved
  `.tools/paypal-test-auth.json` without printing credentials. No application,
  dependency, migration or configuration source changed.
- Targeted Prettier for both changed Markdown files and `git diff --check` passed
  again after the evidence updates. Application tests/build were not rerun for this
  documentation and existing-profile restart. Human Sandbox buyer approval and
  authoritative capture remain the blocker/next milestone. No capture, deployment,
  commit or push was performed.

## 2026-10-27 — Read-only merchant rejection diagnosis

Request: diagnose PayPal's human-facing merchant rejection for existing order
`9N317079B4816951W` without payment or financial-record mutations. The existing
`npm run paypal:test:status` failed with sanitized `PAYPAL_REQUEST_REJECTED`; its
previous successful local artifact must not be mistaken for fresh remote status.

- Added `scripts/paypal-merchant-diagnose.ts`: fixed-order diagnostic using the
  existing client with transport restricted to Sandbox OAuth and Orders v2 GET.
  Projects safe order/link metadata and API error/debug IDs, compares saved
  app/merchant binding, scans local logs without printing raw lines, and compares
  read-only financial snapshots/auth-file contents before and after. No financial
  service or mutation action is invoked.
- Added `docs/paypal-merchant-rejection-report.md`: fresh versus historical status,
  error/debug evidence, seller-binding limits, request/log review, account checks,
  root-cause uncertainty and safe next action. Updated
  `docs/task-03c-checkout-report.md` with a prominent superseding diagnostic notice;
  earlier successful observations are preserved as historical evidence. Updated
  this handoff's current state and continuation guidance accordingly.
- Diagnostic observation at runtime UTC `2026-10-26T23:43:22.462Z`: OAuth HTTP200;
  existing Orders v2 GET HTTP404, `RESOURCE_NOT_FOUND` / `INVALID_RESOURCE_ID`,
  `PayPal-Debug-Id=f341254500bcc`. No current order representation was returned;
  current purchase units/payee/links and approved/voided/completed status cannot be
  freshly confirmed. Prior PAYER_ACTION_REQUIRED/6.00USD/default-seller match is
  historical only. The local status artifact was not overwritten by the failed
  existing status command; no new ignored diagnostic output file was created.
- Saved client-ID/merchant binding and persisted merchant still match current
  configuration. The previous credential-owned default-seller reads established
  routing consistency; actual Dashboard Business type/country/receiving eligibility
  cannot be independently verified through OAuth/order reads. Merchant restrictions
  are suggested by the human message, not proven by an API merchant error code.
- Attempt creation is `2026-10-26T17:37:07.025592Z`, about six hours before the
  diagnostic. Official guidance describes a default three-hour order window;
  expiry is plausible, not an authoritative terminal-state finding or explanation
  of the earlier rejection. Local mandate remains ACTIVE/not time-expired at the
  diagnostic, expiring `2026-10-27T17:37:03.522Z`.
- Reviewed `client.ts`, `test-config.ts`, `test-checkout.ts`, `service.ts` and
  `config.ts` without changing application code: fixed USD6, CAPTURE, default
  credential seller/no payee override, standard wallet experience_context,
  NO_SHIPPING/PAY_NOW, fixed loopback callbacks and validated official token link.
  No buyer-country injection, card/vault/recurring/auto-capture instructions or
  incompatible setting identified. Actual account country/currency eligibility
  remains unknown. Missing webhook ID is unrelated to manual buyer approval.
- Sanitized local server log scan found no matching API error/debug tokens.
  Existing payment client discards non-2xx bodies/debug headers, so original hosted
  checkout error diagnostics cannot be reconstructed from those logs. Fresh GET
  debug ID is not asserted to identify the earlier browser rejection.
- Read-only before/after snapshots matched for mandate, attempt, merchant policy,
  both idempotency rows and all four audit rows; owner-auth file unchanged.
  Accounting remains cap1000/request600/reserved600/consumed0/available400 USD minor
  units, AWAITING_APPROVAL/RESERVED, no capture ID. Zero payment mutation requests.
- Consulted official Orders API/errors, Sandbox account management and standard
  Checkout flow guidance. Two obsolete optional buyer-country doc URLs returned
  404; no conclusion relies on them. Initial script lint found one non-null
  assertion; replaced it with an explicit row guard. Strict standalone TypeScript
  (including exact optional properties/unchecked indexes) and Biome warnings-as-
  errors then passed. Secret-value scan passed: 272 tracked files, 326 nonignored
  candidates and 47 existing browser chunks; zero credential matches, local env
  ignored/untracked. No application build or full regression was rerun for this
  diagnostic-only script/documentation change; browser scan used existing output.
- Targeted Prettier check passed for `scripts/paypal-merchant-diagnose.ts`,
  `docs/paypal-merchant-rejection-report.md`, `docs/task-03c-checkout-report.md` and
  `HANDOFF-PAYPAL.md`; `git diff --check` passed.

Blocker/next step: inspect the original app's linked Sandbox Business seller,
verification/restrictions, USD receiving/country rules and separate Personal buyer;
use Dashboard logs/PayPal Developer Support to confirm the missing order's
disposition before any separately authorized financial action. No credentials,
configuration, identity, financial records, migrations or dependencies changed;
no replacement order, capture, release, deployment, commit or push occurred.

## 2026-10-27 — Task 03D: US merchant migration and preparation

Request: validate the newly configured US Sandbox app, preserve the unresolved
original checkout, implement audited operator handling and prepare an isolated
$10/$6 mandate/attempt; stop before new order creation. No original reservation
release or inferred non-capture from 404 is authorized.

- Reviewed active handoff and backend/client, owner auth, fixed checkout, SQL,
  atomic repository, test fixtures and secret-boundary tooling. The only local
  non-template environment file found is ignored `web/.env.local`; `.tools/`
  contains saved owner/session data and prior sanitized artifacts, not a documented
  original credential backup. No credential values were read into tool output.
- Added `scripts/paypal-us-preflight.ts` for read-only DB merchant/owner comparison,
  real Sandbox OAuth, supported identity discovery and original-order investigation
  only when explicitly available original credential variables match the saved
  app/merchant binding. New credentials must never be used to inspect the old order.
  No financial POST is allowed. Results and remaining changes will follow.
- Fresh US OAuth succeeded (HTTP200). Identity userinfo GET succeeded but returned
  only opaque `user_id`/`sub`, not a merchant/account/country/capability attestation.
  Configured new merchant differs from the persisted original; original credential
  variables are absent, so no old-order request was made with the US credentials.
  User explicitly confirmed Dashboard `Earmark US Test` links a US Business account
  whose Merchant ID matches local configuration. This is human confirmation, not
  independently verified receiving capability or API seller-identity proof.
- Implementation in progress: merchant-scoped `us-v1` mandate/purchase identity,
  separate port3031/session cookie and forced preparation-only actions in
  `test-config.ts`, `test-checkout.ts`, `test-auth.ts`, `test-http.ts`; added
  `operator-hold.ts` and append-only `postgres.ts` intervention (no old-row UPDATE),
  merchant-bound `service.ts`/`runtime.ts` guards including skip-without-mutation
  recovery, and preparation banner/disabled controls in `paypal-test.tsx` (all under
  `web/src/server/paypal/` except `web/src/components/paypal-test.tsx`).
- Updated `scripts/paypal-test-serve.ts` for the isolated preparation profile;
  added `scripts/paypal-us-prepare.ts` for real owner-authenticated hold/mandate/
  reserve only and preservation checks. Added package commands in `package.json`.
  Extended `scripts/paypal-secret-check.ts`, `scripts/check-web-boundary.mjs` and
  `.env.example` for optional securely retained original credential names.
- Added `web/test/paypal-us-migration.test.ts`; extended
  `web/test/fixtures/paypal-checkout.ts` and
  `web/test/paypal-database.integration.test.ts` for identity separation, denied
  financial actions, cross-merchant isolation and actual concurrent append-only
  hold verification. Validation and persistent preparation have not run yet.

### Final outcomes and additional file inventory

- Added `docs/task-03d-us-preparation-report.md`; updated `README.md` to replace the
  stale original-order approval instructions with the US preparation handoff and
  read-only commands. Updated `AGENTS.md` to preserve both mandates, require matching
  original credentials and enforce the current preparation-only stop point.
- Updated `scripts/paypal-test-status.ts` with `--us` / `paypal:us:status` and a
  merchant check before any provider request. Updated
  `scripts/paypal-merchant-diagnose.ts` to require the original app/merchant binding
  before any original-order request. Under US credentials, the legacy status
  command now fails as expected with `MATCHING_MERCHANT_CREDENTIALS_REQUIRED`;
  it does not query the old order. Original investigation remains blocked by absent
  original credentials, not misclassified as cancellation/non-capture.
- First actual preparation at `2026-10-27T00:41:45.812Z` authenticated the saved
  owner over real local HTTP, appended the original hold once, created US mandate
  **889b9c4a-b875-5de9-a354-18a037d41f52** and reserved US attempt
  **422ae62d-cd25-425f-9fdb-ce50ad6f0ffa**. New accounting is cap1000/reserved600/
  consumed0/available400 USD minor units, state RESERVED, no order or capture ID.
  Distinct merchant, mandate, purchase key and both durable request IDs verified.
  No PayPal request was made by the preparation script.
- Before/after financial snapshots prove the original mandate/attempt/merchant/
  idempotency rows (including update timestamps) unchanged. Original four audit
  rows remain byte-equivalent as projected; one append-only authenticated
  OPERATOR_RESERVATION_HELD decision records retention, no release authority and
  the immutable original merchant/order/amount. Replaying preparation at
  `2026-10-27T00:46:29.372Z` preserved both IDs/counters and added zero audit rows.
  Shared owner-auth file is unchanged. Combined reserved1200/recorded captured0
  across separate mandates is verified, not a transfer/reset of old headroom.
- The new loopback server remains running on port3031 with payments forced false,
  separate campaign cookie/epoch and a Dashboard-confirmation-bound profile.
  No payment-promotion flag exists. Fresh `paypal:us:status` independently read the
  new ledger as ACTIVE/RESERVED, order/capture null and no provider requests.
- New ignored local artifacts: `.tools/paypal-us-preflight.json`,
  `.tools/paypal-us-profile.json`, `.tools/paypal-us-server.json`,
  `.tools/paypal-us-server.log`, `.tools/paypal-us-prepared.json`,
  `.tools/paypal-us-ui-readonly.mjs`, `.tools/paypal-us-prepared-desktop.png`.
  Existing `.tools/paypal-test-auth.json` and original-order/status artifacts were
  preserved. Mocked UI screenshots `.tools/paypal-test-ui-mocked-desktop.png` and
  `.tools/paypal-test-ui-mocked-mobile.png` were refreshed and remain watermarked.
  Build/test caches/output stayed in this checkout (`agent/dist`, `web/.next`,
  TypeScript caches and disposable database schemas). No environment credential
  values, migration SQL, dependencies or original repository files changed.

### Fresh checks, failures and limitations

- `npm run paypal:test`: **178 mocked cases passed**, including **11 new migration
  security cases**; thirteen optional integrations skipped in that focused run.
  `npm run test --workspace @flint/web`: **351 passed**, eighteen skipped (12 PayPal
  DB, five original Monad DB, one optional OAuth Vitest case). Real US OAuth was
  verified separately by actual preflight calls, not counted as a Vitest case.
- `npm run paypal:test:db`: final **12 real PostgreSQL cases passed**, including
  concurrent merchant-isolated preparation and concurrent append-only hold tests.
  Initial run passed eleven/failed the new hold test because its fixture omitted
  the mandatory `createMandate` timestamp. TypeScript also caught that omission;
  fixed it without weakening checks and the full 12-case rerun passed. All test
  writes/cleanup were confined to generated session-owned schemas, never real
  demonstration rows. **363 distinct passed web/DB tests**; focused runs are not
  double-counted. Original Monad DB connections remained disabled; agent/Solidity
  suites were not rerun for these PayPal changes.
- Root agent/web/API `npm run typecheck` passed after the fixture correction.
  Strict standalone operational-script TypeScript then found an existing duplicate
  `status` field in launcher failure logging; changed the event label to `event`
  (only sanitized diagnostic output affected), and the strict check passed for all
  changed US/launcher/status/diagnostic/secret scripts. Final script checks follow.
- `npm run lint` (Biome warnings-as-errors for 222 code files plus Foundry format)
  and full `npm run format:check` passed. Existing informational style suggestions
  remain. Production `npm run build --workspace @flint/web` including agent build
  passed. Initial build invocation failed at the tool harness with an uninformative
  `ChildProcess.kill`; a separate full build succeeded with no application fix.
- Mocked checkout browser smoke passed. Actual US UI helper allowed only local
  owner login and GETs, blocked external requests and all other mutations, verified
  RESERVED and disabled order/approval/capture/cancel/recovery controls, no mobile
  overflow and no browser errors. No PayPal approval was automated.
- Credential scan passed before the final report: 272 tracked/330 candidate files,
  47 browser chunks, zero actual new/optional-original/test-auth secret matches.
  Browser variable boundary passed. Final scans/format results are recorded below.
- `npm run paypal:db:verify` passed read-only TLS/identity/schema/checksum/catalog
  and ledger checks. Two mandates/merchants/attempts, four idempotency rows, seven
  audit entries, zero webhook rows, original environment/history seed rows intact;
  no disposable schema or unrelated user table remains. Default backend/payment
  flags are false; only the local preparation process enables its constrained API.
- Source integrity verification passed: original HEAD/refs/status/diff and 305 file
  hashes unchanged. First invocation omitted required CLI arguments and exited
  with usage; corrected command passed. No original-resource mutation occurred.
- Latest binding-confirmation preflight at `2026-10-27T00:28:28.782Z`: real US OAuth
  HTTP200 debug `f320516e77d45`; Identity GET HTTP200 debug `f32051653b502` but only
  opaque IDs. Exact generic payment/orders scope checks were false; no conclusion
  about complete permissions or receiving eligibility follows. Partner capability
  status is not configured. Human seller confirmation is explicit; an actual
  API-returned payee match remains deferred until a separately authorized order.
- Final strict operational-script TypeScript and Biome warnings-as-errors passed
  after the status/diagnostic credential guards and reporting refinements. Final
  complete Prettier check and `git diff --check` passed. Final secret scan covered
  **272 tracked files / 331 candidates / 47 browser chunks**, zero credential
  matches, environment ignored/untracked; browser variable boundary passed again.
  No additional provider or financial calls were needed for these final checks.

Stop point: **US mandate/attempt prepared; no new order, capture, refund or payout**.
Next actions require account receiving/verification checks and explicit future
order authorization, followed by human Sandbox buyer approval and separately
authorized capture. Revalidate expiry then; do not reset old/new campaigns. The
old reservation requires independent authoritative resolution or explicit approval
of a documented risk decision. No Live call, deployment, commit or push occurred.

## 2026-10-27 — Task 03E: exactly one US Sandbox order

Request: create exactly one $6 USD Sandbox order for existing US mandate
`889b9c4a-b875-5de9-a354-18a037d41f52` / attempt
`422ae62d-cd25-425f-9fdb-ce50ad6f0ffa`; no approval automation, capture, cancellation,
refund/payout, reservation release or original-record changes. Read the required
instructions/handoff/Task03D report and current backend plus installed Next.js route
guide. User explicitly confirmed the US Personal buyer and Business seller are
different accounts; no buyer credentials were requested.

- Fresh real US OAuth HTTP200 and read-only Neon status show ACTIVE US mandate,
  RESERVED attempt, no order/capture, cap1000/held600/consumed0/available400 USD.
  Seller remains Dashboard-confirmed; userinfo still supplies opaque IDs only.
  Original credentials are absent; no original-order provider request was made.
- Added `web/src/server/paypal/us-order.ts` for exact prepared scope; updated
  `config.ts`, `client.ts`, `repository.ts`, `postgres.ts`, `service.ts` for an
  existing-reservation-only durable claim, prior-creation history rejection,
  one-order client permission, canonical GET and retention on every failure.
  No failed one-shot branch releases budget or retries a financial POST.
- Updated `test-config.ts`, `test-checkout.ts`, `test-http.ts`, `test-runtime.ts`
  under `web/src/server/paypal/` for operator-enabled exact-attempt `order-once`;
  all other US mutations stay blocked. Updated
  `web/src/components/paypal-test.tsx` for manual approval handoff without capture.
  Updated `scripts/paypal-test-serve.ts` for explicit `--us-order-once`, matching
  saved baseline, preserved owner and separate buyer confirmation. Extended
  `web/test/fixtures/paypal.ts` to model durable creation-history rejection.
  Preflight history checks, execution helper, tests and actual order are pending.
- Added `scripts/paypal-us-order.ts` and order check/create commands in
  `package.json`: read-only preflight snapshots/pins original rows+audit, owner,
  app/merchant and exact US record/history; one authenticated local submission
  only on `--create`, with no retry and preservation verification. Fresh check
  passed: active/unexpired, no prior order/capture/creation audit, two RESERVED
  idempotency rows, no identity collision and $6 held. Saved ignored baseline
  `.tools/paypal-us-order-baseline.json`; no financial request sent.
- Added `web/test/paypal-us-order.test.ts`; extended
  `web/test/paypal-database.integration.test.ts` with concurrent durable claim and
  rejection-retention/restart cases. Test/build validation is now in progress.
- Pre-dispatch checks passed: 200 mocked PayPal cases (22 new), 14 real disposable
  PostgreSQL cases (two new), full web 373 passed/20 integrations skipped; DB cases
  ran separately and original Monad DB remained disconnected. Root TypeScript,
  strict changed-script checks, Biome warnings-as-errors (225 files), full format/
  whitespace checks and production web+agent build passed. One non-failing Vite
  source-map warning occurred while parallel agent builds regenerated output;
  final build succeeded. No tests failed and no assertions/timeouts were weakened.
- Added verification mode to `scripts/paypal-us-order.ts`, safe approval-link
  availability projection to `scripts/paypal-test-status.ts`, and epoch/PID-bound
  US-server stop support in `scripts/paypal-test-serve.ts`. Stopped only the owned
  US preparation server, rebuilt, then started the preserved-owner port3031 server
  with exact `--us-order-once` permission. Ordinary payment settings remain false;
  only the separate scoped client can dispatch the one prepared order. Capture,
  reserve, mandate, cancel, recovery and original-hold HTTP mutations are blocked.
- Before dispatch, actual-value scan passed: 272 tracked/334 candidate files and
  47 browser chunks, zero credential matches; browser boundary and mocked UI smoke
  passed. No original data mutation or PayPal financial POST has occurred yet.

### Actual one-order outcome

Authorized creation completed at runtime UTC `2026-10-27T01:35:03.983Z`:
**US order 72936380818559054**, actual create HTTP200,
`PayPal-Debug-Id=f150642d8f8fe`. Exactly one local order submission, one durable
CREATE_PREPARED claim and one observed provider CREATE_ONE_ORDER POST. Existing
attempt and create/capture request IDs were reused; no second reservation/attempt
was created. Canonical order GET verified USD6.00, expected merchant/payee and
immutable references, PAYER_ACTION_REQUIRED and official Sandbox token link before
approval was exposed.

Independent `paypal:us:status` then confirmed PAYER_ACTION_REQUIRED, merchant match,
valid approval availability, no capture ID/status and US cap1000/reserved600/
consumed0/available400, AWAITING_APPROVAL/RESERVED, `objectiveComplete=false`.
`paypal:us:order:verify` confirmed one create claim/POST and byte-equivalent
original financial rows **and all original audit rows**, owner-auth file and US
request identities preserved. No original-provider read or original audit append
occurred in Task03E. Buyer approval and capture remain pending/not authorized here.

Generated ignored `.tools/paypal-us-order-result.json`,
`.tools/paypal-us-order-verification.json`,
`.tools/paypal-us-authoritative-status.json`; refreshed the US server metadata/log
and read-only US preflight artifact. Added ignored
`.tools/paypal-us-order-ui-readonly.mjs` to inspect the actual local handoff with
all external browser requests/non-login mutations blocked; UI result follows.

The one-shot allowance is consumed durably; the loopback server stays available
for authenticated saved-state/official-link access. Its ordinary payment switch
remains false; capture and all other US mutations remain blocked. No automated
buyer approval, capture, cancellation, release, refund/payout or Live call occurred.

### Final handoff documentation and checks

- Added `docs/task-03e-us-order-report.md`: exact authorization/scope, actual
  order/status/merchant/link evidence, accounting/preservation, verification,
  pending human steps and limitations. Updated `README.md` and `AGENTS.md` for the
  consumed one-shot permission and no further order/capture authorization. Added
  a superseding historical note to `docs/task-03d-us-preparation-report.md` and
  updated this handoff's current state. No earlier test result was silently changed.
- Actual local UI read-only inspection passed: AWAITING_APPROVAL, correct official
  link/token, create/capture/approval-verification/cancel/recovery controls disabled,
  zero browser errors/mobile overflow; no PayPal link/control clicked. Generated
  ignored `.tools/paypal-us-order-awaiting-desktop.png`; mock screenshot artifacts
  were refreshed by their separate watermarked smoke test.
- Independent read-only catalog verification passed at unchanged migration checksum:
  two mandates, two merchants, two attempts, four idempotency records, eleven audit
  entries, no webhook events; original seed/history rows intact, no disposable
  schema or unrelated user table remains. Four new US audit entries document
  authorization, dispatch claim, returned reference and canonical observation.
- Original source HEAD/refs/status/diff and 305 hashes remain unchanged. Foundry
  formatting passed. Across full web plus explicit DB runs: **373+14=387 distinct
  passed**, not double-counting 200 focused mocks; five legacy DB and optional OAuth
  Vitest case were not run. Real OAuth was checked independently by preflight.
  No tests/build/typecheck/lint failures occurred. Final documentation/credential
  scans and final formatting are recorded below.
- Final full Prettier and `git diff --check` passed after the report/current-state
  updates. Final actual-value scan: **272 tracked files / 335 candidates / 47
  browser chunks**, zero credential matches, environment ignored/untracked;
  browser server-variable boundary passed. No additional financial operation,
  deployment, commit or push occurred during final documentation checks.

## 2026-10-27 — Task 03F: read-only US buyer approval verification

Request: verify the human-completed checkout for existing US order
`72936380818559054` using actual Sandbox order/capture GET and real Neon reads;
assess readiness for separate capture authorization without enabling/executing it
or modifying financial records. Read `AGENTS.md`, `web/AGENTS.md`, this handoff and
Task03E report; inspected existing status/verification tooling and policy checks.

- Fresh `npm run paypal:us:status` reports **APPROVED**, USD6.00, actual configured
  merchant/immutable attempt reference match, **no capture ID/status**, and
  `humanApprovalStillRequired=false`. This is PayPal API evidence, not a browser
  redirect inference. Neon is ACTIVE, cap1000/reserved600/consumed0/available400,
  AWAITING_APPROVAL/RESERVED. No reconciliation writes were invoked.
- `npm run paypal:us:order:verify` passed read-only: one durable creation claim/
  observed original creation POST, original rows and all audit history unchanged,
  owner-auth file and request keys preserved. Its `approvalAvailable=true` is only
  the historical saved local approval URL; fresh API `approvalAvailable=false`
  after APPROVED is not a failure or reason to reapprove.
- Added ignored `.tools/paypal-us-approval-readonly.ts` for bounded read-only
  expiry/policy/capture-history and original baseline comparison. It never contacts
  PayPal or invokes a financial/reconciliation service. Results will follow.
  Existing status tools refreshed ignored `.tools/paypal-us-authoritative-status.json`
  and `.tools/paypal-us-order-verification.json`; no application/configuration
  source or financial records have been changed.

### Verified policy, preservation and readiness

Ignored read-only helper completed at database UTC **2026-10-27T01:53:40.399Z**:

- US mandate **889b9c4a-b875-5de9-a354-18a037d41f52**, attempt
  **422ae62d-cd25-425f-9fdb-ce50ad6f0ffa**, order **72936380818559054** match the
  saved owner, configured merchant, USD600-minor-unit terms and immutable request
  identities/fingerprint. Approved merchant policy contains exactly that merchant;
  per-transaction limit is600, cap1000, held600, consumed0, available400 USD minor
  units. Mandate is ACTIVE and unexpired until **2026-10-28T00:41:39.301Z**.
- **Zero CAPTURE_PREPARED audit events**, no CAPTURING/CAPTURE_UNCERTAIN/PENDING
  attempt and no local capture ID or remote error. PayPal order GET returned
  APPROVED with no captures, so no capture-ID GET was needed. No capture POST,
  order creation, cancel/release, refund or payout was attempted.
- Current saved local state remains AWAITING_APPROVAL/RESERVED. It is an unchanged
  historical observation, not contrary evidence to the fresh PayPal APPROVED GET.
  No `/approval`, `/recover`, payment-service reconcile or other financial-record
  write was invoked to synchronize it under this read-only authorization.
- Complete US and original financial/audit snapshots matched before/after the
  verification; original rows/audit also match the Task03E baseline. Original
  Nigerian reservation remains600, consumed0; no original-provider read occurred.
  Preserved owner-auth file and request IDs were not rotated or changed.
- **Ready to request separate explicit authorization for one controlled $6 capture**
  of this existing approved US order: actual approval/terms, policy, held budget,
  preserved capture identity and no prior/ambiguous capture are verified. This is
  not capture enablement or a guarantee of settlement. The present profile still
  blocks capture. A future authorized capture must freshly re-read approval,
  revalidate expiry/accounting, reconcile the saved approval state, and atomically
  claim the existing capture intent before dispatch; no new reservation/attempt.
- Refreshed ignored `.tools/paypal-us-approval-readiness.json` with sanitized
  readiness/preservation evidence. Added helper and earlier refreshed artifacts
  are the only local operational files touched; `HANDOFF-PAYPAL.md` is the only
  repository source/documentation file modified in Task03F. No app/dependency/
  configuration source, credentials, server profile or financial records changed.

Fresh checks: existing authoritative status and order/preservation verification
commands passed, as did the read-only expiry/history helper. No check failed.
Application tests/build were not rerun for read-only verification and this handoff
update; Task03E's regression results remain historical. Final documentation checks
are recorded below. Capture awaits **separate explicit user authorization**; no
deployment, Git commit/push or original-repository change occurred.

- Final `node node_modules/prettier/bin/prettier.cjs --check HANDOFF-PAYPAL.md`
  and `git diff --check` passed. No test/build was required or executed, no
  credential value/private customer data was included in this handoff, and no
  capture permission was enabled during documentation completion.

## 2026-10-27 — Task03G: one authorized US Sandbox capture

User explicitly authorizes at most one USD6 capture POST for existing approved US
order/mandate/attempt, subject to fresh checks; no new order, approval automation,
refund/payout, cancellation/release, Live, original-project or Nigerian-record
changes. Read AGENTS/web instructions, active handoff (including Task03F, which has
no standalone report), Task03E documentation, client/service/auth/repository and
installed Next.js Route Handler guide.

- Fresh actual `paypal:us:status` confirms APPROVED, USD6.00, matching merchant and
  attempt references, no capture; real Neon helper at **2026-10-27T02:01:11.085Z**
  confirms active/unexpired mandate, held600/consumed0/available400, zero capture
  claims/ambiguity, preserved owner and original rows/audit matching Task03E baseline.
- Added `web/src/server/paypal/us-capture.ts`; updated `config.ts`/`client.ts` for
  capture-only permission, exact scope and new-order/other-operation refusal.
  Updated `repository.ts`/`postgres.ts` for locked, history/idempotency-checked
  capture claims; `service.ts` adds existing-reservation-only one-shot capture with
  fresh approval/policy verification, canonical order+capture GET, existing atomic
  consumption only for COMPLETED, and held/review accounting on failure.
- Updated `test-config.ts`, `test-checkout.ts`, `test-http.ts`, `test-runtime.ts`
  under `web/src/server/paypal/` for explicit exact-capture-only loopback dispatch
  with unchanged owner/Origin/Host/CSRF security. Extended
  `web/test/fixtures/paypal.ts` for capture-history guards. No capture has been
  enabled or dispatched yet; operational preflight/execution helper and tests follow.
- Added `scripts/paypal-us-capture.ts` with read-only fresh PayPal/Neon check,
  binding-specific exclusive baseline, exactly one authenticated local execution
  submission and separate authoritative post-capture verification. Updated
  `scripts/paypal-test-serve.ts` for mutually exclusive `--us-capture-once`, exact
  baseline/owner/buyer bindings and child-only permission; normal payment flags
  stay false. Added check/execute/verify commands in `package.json`. Updated
  `web/src/components/paypal-test.tsx` to distinguish actual capture success from
  the earlier approval handoff. No capture POST has been sent.
- `paypal:us:capture:check` passed actual OAuth/Orders GET HTTP200, APPROVED/no
  capture, exact $6 scope, active/unexpired mandate, intact reservation, no capture
  claim and preserved original history/owner. Saved ignored
  `.tools/paypal-us-capture-baseline.json` using exclusive creation. No financial
  request or record mutation was made.
- Added `web/test/paypal-us-capture.test.ts`; extended
  `web/test/paypal-database.integration.test.ts` with concurrent canonical capture/
  one-consumption/restart and ambiguous POST retention cases. Tests use mocked
  PayPal and only the existing disposable PostgreSQL fixture, never persistent
  demonstration attempts. Validation is in progress before any capture enablement.
- Pre-execution validation passed: **229 PayPal mocks** (29 new capture cases),
  full web **402 passed/22 skipped**, and explicit isolated PostgreSQL **16 passed**
  (two new capture concurrency/restart/uncertainty cases). No tests failed; five
  original Monad DB cases and optional OAuth Vitest remain unrun. Actual OAuth and
  order GET are verified separately, not counted as extra Vitest cases.
- Root agent/web/API TypeScript, strict new operator/launcher TypeScript, Biome
  warnings-as-errors (228 files), full Prettier/whitespace and Foundry formatting
  passed. First production web build reached successful compile/typecheck/static
  generation but timed out at 300 seconds during trace collection; a separate full
  build completed successfully. No checks were weakened or app change needed.
- Before execution, scans passed for **272 tracked/338 candidate files/47 browser
  chunks**, zero actual credential matches and no browser server-variable leakage.
  Mocked checkout browser smoke passed; original source integrity still matches
  HEAD/refs/status/diff and 305 hashes. Stopped only the epoch/PID-verified owned US
  server before rebuilding; original checkout/repository untouched.
- Fresh final read-only capture preflight again passed OAuth/Orders GET HTTP200,
  APPROVED, exact seller/USD6, active unexpired mandate, held600/consumed0, no prior
  capture claim and original history intact. Its order GET debug ID is
  `ca50e4cd0b8b6`. No capture POST sent yet; exact scoped server enablement follows.

### Actual authorized capture and independent verification

The loopback server started with mutually exclusive capture-only permission, normal
payment settings false, existing owner/session security and exact saved baseline.
One operator submission completed at runtime UTC **2026-10-27T02:36:33.225Z**:
order **72936380818559054**, capture **52C23729CU714125M**, local SUCCEEDED/CONSUMED,
held0/consumed600. No other payment/order was requested.

Independent `paypal:us:capture:verify` completed at **2026-10-27T02:37:08.804Z**:
PayPal order **COMPLETED**, capture **COMPLETED**, final capture true, USD6.00,
matching canonical seller/order/attempt/currency/amount. Actual capture POST was
**HTTP201**, `PayPal-Debug-Id=ca50e501abb92`. Fresh verification GET_ORDER HTTP200
debug `ca50e512aafa0`; GET_CAPTURE HTTP200 debug `ca50e512e49cc`.

Fresh read-only PostgreSQL transactions verify cap1000/consumed600/reserved0/
available400 USD minor units, exact capture ID accepted once, one CAPTURE_PREPARED
claim, one observed CAPTURE_ONE_ORDER POST and one completed ledger observation.
Original Nigerian rows **and all original audit history** match the Task03E
baseline; its unresolved reserved600 is unchanged. Preserved owner-auth file,
merchant/purchase identities and existing capture request ID are unchanged.

A second independent `paypal:us:status` confirms order/capture COMPLETED,
SUCCEEDED/CONSUMED, $6 spent/$0 held/$4 available and `objectiveComplete=true`.
These are actual API/database reads, not UI/HTTP-success-only claims. No second
capture submission was made to test duplication: isolated concurrency/restart/
terminal replay tests plus durable claim/reference/accounting reads prove the
duplicate guards without paying again. The exact capture allowance is spent.

Generated ignored `.tools/paypal-us-capture-result.json` and
`.tools/paypal-us-capture-verification.json`; refreshed the authoritative US status
artifact and US server metadata/log. Added ignored
`.tools/paypal-us-capture-ui-readonly.mjs` for saved-state-only UI inspection,
blocking external requests and every non-login mutation. UI/catalog results and
final report/documentation checks follow. No original-provider API call, capture
retry, new order, refund/payout, cancellation or unrelated release occurred.

### Final documentation, UI and database handoff

- Added `docs/task-03g-capture-report.md`: actual receipt/API debug evidence,
  policy/scope, final accounting, old-history preservation, replay behavior,
  verification results/build timeout and operational limitations. Updated
  `AGENTS.md` and `README.md` for consumed permissions and verified controlled
  Sandbox success, and `docs/task-03e-us-order-report.md` with a historical
  superseding note. Updated this handoff's current state; earlier results remain
  chronological rather than silently rewritten.
- Actual read-only capture UI check passed: SUCCEEDED, exact capture ID, $6 spent/
  $0 held/$4 available, all payment controls disabled, no mobile overflow/browser
  errors. Only local login/GETs were allowed; external requests and every other
  mutation were blocked. Generated ignored
  `.tools/paypal-us-capture-completed-desktop.png`. Mocked UI screenshots were
  refreshed separately and retain their mock-only watermark.
- Read-only database catalog/ledger verification passed after capture: unchanged
  approved migration checksum, two mandates, two merchants, two attempts, four
  idempotency rows, **15 audit entries**, no webhook events, original environment/
  history seeds intact, no disposable schemas/unrelated user tables. Four new US
  audit rows record capture authority, durable claim, verified capture reference
  and completed accounting observation; no old row/audit was overwritten.
- Changes used existing dependencies/schema and server credentials. No environment
  credential values, original auth file, migration SQL or dependencies changed.
  Ignored artifacts additionally include capture baseline/result/verification
  JSON and UI helper/screenshot; US server metadata/log and authoritative status,
  initial read-only approval-readiness artifact and normal local build/test caches
  were refreshed only in this checkout. No capture failure/retry occurred.
- Final report formatting/credential-boundary checks follow. There is no blocker
  to Task03G's completed-payment success criteria. Separate project limitations
  remain original Nigerian obligation resolution, real webhook delivery and future
  production/auth/refund/dispute work. No additional payment, Live operation,
  original-repository write, deployment, commit or push is authorized/performed.
- Final complete Prettier and `git diff --check` passed after receipt/current-state
  documentation. Final actual-value scan passed for **272 tracked files / 339
  candidates / 47 browser chunks**, zero raw/encoded credential matches, local env
  ignored/untracked; browser server-variable boundary passed. These final checks
  made no further provider financial request or financial-record mutation.

## Outstanding work and recommended continuation

1. US order **72936380818559054** / capture **52C23729CU714125M** are COMPLETED;
   preserve the receipt and one-consumption accounting. No further payment is
   authorized. Resolve the original Nigerian
   obligation through matching credentials/PayPal support; retain its reservation
   until trusted disposition or a specifically approved risk decision.
2. Broader production owner/agent authentication and consent remain future work;
   current test auth is local-only, not SSO. EIP-712 signatures are not PayPal approval.
3. Validate actual Sandbox account/single-seller routing, response shapes and real
   webhook delivery with approved credentials; no mocked test proves those work.
4. Add authenticated checkout UX and provider quote/delivery evidence integration
   while retaining original EVM regression coverage and explicit currency units.
5. Schedule/monitor read-only recovery in a later infrastructure task; define
   restricted runtime database roles, event retention and operator escalation.
6. Define refund/dispute/reversal behavior and selected PayPal product semantics
   before claiming TaskVault-like delivery escrow or unattended payments.
7. Review and publish Task 02 changes only when requested; no deployment is included.
8. Keep this handoff current for every change, including documentation updates.

### Supporting records

- [Migration implementation report](docs/migration/implementation-report.md)
- [Pre-change legacy dependency inventory](docs/migration/legacy-dependencies.md)
- [PayPal integration architecture](docs/paypal-integration.md)
- [Task 02 Sandbox backend guide](docs/paypal-backend.md)
- [Task 03A applied migration and real PostgreSQL report](docs/task-03a-database-report.md)
- [Task 03B real Sandbox OAuth report](docs/task-03b-oauth-report.md)
- [Task 03C controlled checkout and pending human action](docs/task-03c-checkout-report.md)
- [Task 03D US migration and preparation stop point](docs/task-03d-us-preparation-report.md)
- [Task 03E actual US order and human approval handoff](docs/task-03e-us-order-report.md)
- [Task03G completed US capture and verified accounting](docs/task-03g-capture-report.md)
- [Preserved legacy architecture](docs/architecture.md)
- [Original README provenance](docs/migration/original-readme.md)
- [Current setup guide](README.md)
