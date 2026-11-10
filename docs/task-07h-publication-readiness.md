# Task07H — Norway publication readiness

Audit: 2026-11-04. No staging, commit, push or deployment. No Gemini, PayPal or database operation.

## Disposition

Publication HOLD pending remote Vercel setting verification and separate Git/deployment authorization. Local source/credential/lint/build/browser checks pass; the remaining publication blockers are remote configuration confirmation and authorization.

## Exact publication inventory

At entry: 117 changed files: 48 tracked modifications and 69 untracked files, with no staged changes. Task07G counted collapsed untracked directories (55 entries), not individual files. Including this report, the reviewed change set contains **118 files: 48 modified and 70 untracked**. Publish these sources, tests, licensed assets, operational source scripts and sanitized audit documentation together after authorization; do not publish only the Norway CSS/components, because new agent/parser/privacy/route modules are required dependencies. No deleted or renamed files. This is an explicit review inventory, not a staging instruction.

### UI and repository configuration (24)

```text
.gitignore
.vercelignore
package.json
web/src/app/agent-checkout/page.tsx
web/src/app/layout.tsx
web/src/app/norway-fonts.css
web/src/app/norway.css
web/src/components/agent-checkout.tsx
web/src/components/create-mandate.tsx
web/src/components/dashboard.tsx
web/src/components/detail-pages.tsx
web/src/components/gemini-console.tsx
web/src/components/glass.tsx
web/src/components/navigation.tsx
web/src/components/paypal-test.tsx
web/src/components/purchasing-chat.tsx
web/src/components/recorded-demo.tsx
web/src/components/recorded-paypal-card.tsx
web/src/components/security-demos.tsx
web/src/components/theme-provider.tsx
web/src/components/workspace-provider.tsx
web/src/lib/agent-checkout.ts
web/src/lib/paypal-agent.ts
web/src/lib/theme.ts
```

### Server and security source (30)

```text
agent/src/gemini-body.ts
agent/src/gemini-response.ts
agent/src/index.ts
agent/src/local/security-demo.ts
agent/src/models.ts
agent/src/postgres.ts
agent/src/server.ts
api/src/server.ts
web/src/app/api/paypal/agent-checkout/[action]/route.ts
web/src/app/api/paypal/agent-checkout/route.ts
web/src/app/api/paypal/agent/route.ts
web/src/app/api/paypal/test/[action]/route.ts
web/src/app/api/paypal/test/route.ts
web/src/app/api/paypal/webhooks/route.ts
web/src/app/api/workspace/[action]/route.ts
web/src/app/api/workspace/route.ts
web/src/server/gemini-sessions.ts
web/src/server/paypal/agent-chat.ts
web/src/server/paypal/agent-checkout-config.ts
web/src/server/paypal/agent-checkout-http.ts
web/src/server/paypal/agent-checkout-payment.ts
web/src/server/paypal/agent-checkout-postgres.ts
web/src/server/paypal/agent-checkout.ts
web/src/server/paypal/agent-diagnostic.ts
web/src/server/paypal/agent.ts
web/src/server/paypal/config.ts
web/src/server/paypal/gemini-boundary.ts
web/src/server/paypal/service.ts
web/src/server/paypal/test-auth.ts
web/src/server/paypal/us-order.ts
```

### Regression tests (19)

```text
agent/test/gemini-body.test.ts
agent/test/gemini-read-only.test.ts
agent/test/gemini-response.test.ts
agent/test/gemini.test.ts
agent/test/testnet.test.ts
web/test/fixtures/agent-checkout.ts
web/test/fixtures/paypal-database.ts
web/test/gemini-sessions.test.ts
web/test/paypal-agent-campaign05c.test.ts
web/test/paypal-agent-chat.test.ts
web/test/paypal-agent-checkout.test.ts
web/test/paypal-agent-payment.test.ts
web/test/paypal-agent-recovery.test.ts
web/test/paypal-database.integration.test.ts
web/test/paypal-gemini-agent.test.ts
web/test/paypal-gemini-boundary.test.ts
web/test/paypal-us-order.test.ts
web/test/theme-console.test.ts
web/test/worker-handover.test.ts
```

### Documentation (12)

```text
AGENTS.md
HANDOFF-PAYPAL.md
README.md
docs/task-04-gemini-integration-report.md
docs/task-05a-agent-checkout-report.md
docs/task-05a-gemini-diagnosis.md
docs/task-05b-agent-recovery-report.md
docs/task-05c-fresh-agent-campaign-report.md
docs/task-05c-security-verification.md
docs/task-05c-timeout-stability-report.md
docs/task-07g-public-demo-readiness.md
docs/task-07h-publication-readiness.md
```

### Operator and verification tooling (19)

```text
scripts/gemini-model-probe.mjs
scripts/gemini-phase-b.ps1
scripts/paypal-agent-05c-ui.mjs
scripts/paypal-agent-05c-verify.ts
scripts/paypal-agent-diagnose.ts
scripts/paypal-agent-inspect.ts
scripts/paypal-agent-prepare.ts
scripts/paypal-agent-serve.ts
scripts/paypal-agent-stop-direct.ts
scripts/paypal-agent-stop.ts
scripts/paypal-agent-ui.mjs
scripts/paypal-database-timeout-probe.ts
scripts/paypal-db-test.ts
scripts/paypal-secret-check.ts
scripts/paypal-security-inspect.ts
scripts/paypal-security-live.ts
scripts/paypal-timeout-stability.ts
scripts/preview-smoke.mjs
scripts/stop-owned-agent.ps1
```

### Licensed Norway assets (14)

```text
web/public/fonts/norway/LICENSE.txt
web/public/fonts/norway/inter-tight-0.woff2
web/public/fonts/norway/inter-tight-1.woff2
web/public/fonts/norway/inter-tight-2.woff2
web/public/fonts/norway/inter-tight-3.woff2
web/public/fonts/norway/inter-tight-4.woff2
web/public/fonts/norway/inter-tight-5.woff2
web/public/fonts/norway/inter-tight-6.woff2
web/public/fonts/norway/jetbrains-mono-10.woff2
web/public/fonts/norway/jetbrains-mono-11.woff2
web/public/fonts/norway/jetbrains-mono-12.woff2
web/public/fonts/norway/jetbrains-mono-7.woff2
web/public/fonts/norway/jetbrains-mono-8.woff2
web/public/fonts/norway/jetbrains-mono-9.woff2
```

Root package-lock.json, .nvmrc, biome.json, agent/package.json, agent/tsconfig.json, agent/tsconfig.build.json, web/package.json, web/next.config.ts, web/tsconfig.json and contracts/package.json are already tracked and must remain in the repository. They are not new changes. The root lockfile did not change. The existing Earmark logo is already tracked at web/public/brand/earmark-crystal.png. Norway includes 13 WOFF2 assets plus both font licenses. Every font URL resolves to an included asset.

## Excluded / local only

- All .tools/**, including local owner/session credentials, process profiles, screenshots, traces, one-shot live-run markers, database fingerprints, diagnostic captures and restricted privacy-incident evidence. Preserve this evidence locally; do not upload it or change its access restrictions.
- .env and non-example .env.* at every workspace; private keys (*.pem, *.key), keystores, .agent-state/**, .neon and .agents/**. Tracked .env.example samples contain configuration names/placeholders and remain intentional source.
- .vercel/** local project/account linkage; .vercel/project.json is not publication configuration.
- node_modules/**, .next/**, agent/dist/**, coverage, \*.tsbuildinfo, logs, test-results/**, playwright-report/** and demo recordings.
- Foundry contracts/out, cache, broadcast and generated/dependency content. Existing tracked source migration database/paypal/001_sandbox.sql is schema DDL, not a database export.

No local auth JSON, raw diagnostic capture, export, secret environment file or unexpected binary appears in the 118-file candidate inventory. New binaries are only the licensed fonts. Existing legacy documentation screenshots are unchanged; no Task07F/G/H diagnostic screenshot is proposed for Git publication.

Git ignore rules were checked directly with git check-ignore --no-index. A static check of every candidate plus workspace build inputs found none excluded by the root .vercelignore. There is no overriding web/.vercelignore. The root .vercelignore deliberately excludes prebuilt agent/dist; web prebuild regenerates it. Next traces the agent workspace and excludes secrets/local state. Vercel CLI itself ignores .vercel by default; this is documented behavior, not a newly tested deployment archive. Git-based publication depends on reviewed committed files; .vercelignore is not a substitute for keeping secrets out of Git.

Credential evidence: configured PayPal (including original/old), Gemini and local owner/session credential scan: 339 tracked files / 408 candidate files / 53 browser chunks, zero matches. Generic private-key, Google-key and GitHub-token patterns: 333 text source/document candidates, zero matches. Database-URL/email-pattern hits were manually checked: synthetic rejection canaries, deliberately dummy test URLs and API endpoint strings, not real access credentials or customer contacts. No complete Git-history or remote dashboard secret audit is claimed. Final scan totals follow after report/build validation.

## Lint diagnosis and correction

Task07G's command failed because --error-on-warnings converts 46 warnings to failure: **31 noDescendingSpecificity and 15 noImportantStyles**, all in the new untracked web/src/app/norway.css. That file is absent at Git HEAD 723662b. biome.json and globals.css are unchanged from HEAD, and the unchanged globals.css passes with zero warnings. Thus these are new Norway warnings relative to HEAD, although present before Task07G. This explicitly corrects the possible interpretation of “existing” in that report.

Only norway.css is changed in application source: order general selectors before more specific selectors, replace !important overrides with sufficient component/state specificity, and preserve reduced-motion precedence with an explicit navigation selector. No lint rules, severities, suppressions, financial/agent logic or dependencies changed.

- Original scoped lint: 102 files, 46 warnings, 29 informational notices, exit1.
- Same scoped lint after correction: 102 files, zero errors/warnings, same29 informational notices, exit0.
- Repository-wide Biome lint . --error-on-warnings: 274 files, zero errors/warnings, 184 informational notices, exit0.
- Norway stylesheet Prettier check: passed.
- This verifies the Biome portion of root lint. Root npm run lint additionally calls Foundry formatting; the identical node scripts/forge.mjs fmt --check also passed (exit0), completing both components without rerunning Biome.

## Vercel: verified versus manual confirmation

| Setting                                      | Evidence / status                                                                                                                                                                                                                            |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local project link                           | Ignored .vercel/project.json names earmark-paypal; project/account IDs not logged.                                                                                                                                                           |
| Local Git source                             | main branch; GitHub origin repository basename earmark-paypal; project root is this checkout.                                                                                                                                                |
| Remote Git integration / repository / branch | **Unverified.** Local origin and link do not establish Vercel's connected repository.                                                                                                                                                        |
| Root directory / framework                   | **Remote unverified.** Source is a Next.js app under web; confirm actual project Root Directory and Next.js preset.                                                                                                                          |
| Node version                                 | Repository requires >=22.14 <23, .nvmrc=22.14.0; **remote Node22.x selection unverified**.                                                                                                                                                   |
| Install command                              | **Remote unverified.** Preserve an established successful command. Task07G's npm ci --prefix .. is a proposed monorepo fallback, not a verified remote setting or a reason to replace a working command.                                     |
| Build command                                | Local web npm run build calls its existing prebuild to compile @flint/agent, then next build --webpack. **Remote command unverified; unchanged.** Root npm run build also invokes Foundry and is a different workflow.                       |
| Monorepo source inclusion                    | Root workspaces/lockfile present; web depends on @flint/agent; tracing root/includes cover agent/dist. **Remote Include source files outside Root Directory unverified**; confirm root manifests and agent sources reach installation/build. |
| Output directory                             | Next-managed output locally; **remote override unverified**.                                                                                                                                                                                 |
| Preview / Production environment             | Required values below; **actual remote values, branch overrides and existing secrets unverified**.                                                                                                                                           |
| Deployment triggers                          | No tracked vercel.json, deploy hook or action changing defaults. **Remote production branch, auto-deploy controls, ignored-build command and custom environments unverified**.                                                               |

No Vercel connector, installed CLI or usable local CLI/token authentication was available. No dashboard session or project REST response was obtained. Do not treat local metadata or official platform documentation as proof of remote settings. No working remote command was changed.

Set/confirm both Preview and Production before any build:

```dotenv
NEXT_PUBLIC_DEMO_ONLY=true
EARMARK_PUBLIC_DEMO_ONLY=true
PAYPAL_BACKEND_ENABLED=false
PAYPAL_PAYMENTS_ENABLED=false
PAYPAL_AGENT_CHECKOUT_ENABLED=false
PAYPAL_TEST_CHECKOUT_ENABLED=false
EARMARK_GEMINI_ENABLED=false
AI_ENABLE_NETWORK=false
AGENT_MODEL_PROVIDER=mock
AGENT_MODEL_MODE=mock
EARMARK_ENABLE_TESTNET_EXECUTION=false
```

Keep payment execution/one-shot permissions unset. Public demo needs no database URL, PayPal or Gemini credential, local owner/session credential, signer or hosted API origin. Optional FLINT_WEB_ORIGIN may identify the final HTTPS website; otherwise metadata uses Vercel's production URL. NEXT_PUBLIC_DEMO_ONLY is a build-time client value: rebuild after setting it. Local owner checkout also refuses VERCEL regardless of the enable flag, and public route guards reject live/mutation paths before provider/storage access.

## Automatic deployment risk and exact next steps

1. In the existing earmark-paypal dashboard, inspect Settings → Git and Environments → Production branch tracking; confirm the actual repository, production branch, preview branch rules, auto-deployment controls and ignored-build command. Confirm build settings/source inclusion/Node/environment rows above against a previous successful website build. Preserve working install/build commands.
2. Confirm read-only flags in both environments and omit all private/live credentials. Do this before any push. Vercel normally deploys pushes automatically: production branch to Production, other tracked branches to Preview. Current local branch is main; it is **not verified** as the remote production branch. Treat any future push as deployment-capable until confirmed otherwise.
3. Obtain explicit authorization for Git staging/commit/push and for any resulting deployment. If Git publication must occur without deployment, the user must first arrange an appropriately authorized remote trigger configuration; this task did not alter it. Review/stage only the explicit 118-file set plus the already tracked workspace context. Run staged secret/diff checks before committing. Never force-add ignored local artifacts.
4. After separate deployment authorization, use the established website workflow for one Preview. Check install resolves root workspaces, agent prebuild runs, demo flags are baked in and no credential/database is required. No blockchain, database migration or private checkout launch is needed.
5. Verify hosted /, /mandates, /activity, /payments and /security, both themes/mobile, PUBLIC_DEMO_READ_ONLY workspace response, blocked privileged/live/payment endpoints and browser-source privacy. Promote only after those checks and separate Production authorization. No live Gemini/payment test is needed.

Official references checked read-only: [Git deployment triggers](https://vercel.com/docs/git), [build settings](https://vercel.com/docs/builds/configure-a-build), [monorepo ignore precedence](https://vercel.com/docs/deployments/vercel-ignore), [default CLI exclusions](https://vercel.com/docs/builds/build-features).

## Final focused verification

| Fresh check                              | Result                                                                                                                                                                                                                                                                   |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Production website build                 | PASS, existing web npm run build including agent prebuild, Next webpack and TypeScript; VERCEL=1 and explicit read-only flags. No build command changed.                                                                                                                 |
| Scoped Biome                             | PASS:102 files, zero errors/warnings,29 informational notices.                                                                                                                                                                                                           |
| Full Biome / Foundry lint components     | PASS:274 files, zero errors/warnings,184 informational notices; separate Forge fmt --check exit0. No rule suppression.                                                                                                                                                   |
| CSS preservation                         | PASS:8 Norway source-cascade comparisons across / and /mandates,1440/390px, normal/reduced motion;1368 visible elements, zero computed-style differences. Same rendered DOM with original versus corrected stylesheet, not a pixel-diff audit of every route.            |
| Production browser smoke                 | PASS:9 routes,1440/1280/1024/390/375px, Norway/Classic Light persistence/migration, navigation,4 recorded and4 PayPal scenarios, explicitly mocked chat comparison/proposal/rejection/error, public chat lockdown and disabled payments; no overflow/runtime exceptions. |
| Screenshot review                        | Fresh Norway and Classic Light desktop screenshots inspected; no new layout defect found. Screenshot artifacts remain ignored.                                                                                                                                           |
| Final source/browser credential boundary | PASS:339 tracked /409 candidate /53 browser chunks; zero configured-credential matches, no secret env tracked. Browser scan:53 chunks, no server secret variable names/private-key material.                                                                             |
| Git/source isolation                     | PASS:48 modified +70 untracked files, nothing staged; other115 reviewed source paths unchanged; project-flint status hash matches07G using the identical git status --short command.                                                                                     |
| Fonts                                    | PASS:40 declarations,13 present WOFF2 files with valid signatures; both font licenses included.                                                                                                                                                                          |

The optional comparison helper initially encountered local startup/navigation deadlines and a mistaken readiness check for a Norway-only proposal element in Classic Light. Eight Norway cases completed with zero differences. A separate Classic Light comparison extension did not complete because its temporary preview failed the30-second startup deadline; it is **not counted as a pass**. Classic Light was instead verified in the successfully completed existing production browser smoke and screenshot review. An initial stdin baseline probe and a one-line shell-quoting probe were unusable; direct lint on the HEAD-identical globals.css and native script execution supplied the actual evidence. No application/authentication/privacy guard was relaxed for these helper issues.

Only web/src/app/norway.css, this report and HANDOFF-PAYPAL.md were changed by07H outside ignored artifacts. No backend/financial source or workflow changed. Full regression/database suites and the complete CI npm run check pipeline were not repeated for this CSS-only correction;07G's58 targeted tests are prior evidence, not fresh07H results. No database connection, Gemini invocation, PayPal operation, financial mutation, staging, commit, push or deployment occurred. Port3032 had no listener at preflight; verification used owned temporary public preview processes. No hosted deployment or remote Git synchronization is claimed.
