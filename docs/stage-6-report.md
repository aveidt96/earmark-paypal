# Earmark — Stage 6 historical report

> Historical identity note: this stage was completed under the provisional Flint name. Earmark was approved in Stage 6.5; historical facts, repository references and technical identifiers below are retained.
> Original recorded stage/report commit: 2abeaad9a0876ded195171420591c9806068a2b5.

Date: 9 October 2026 (Africa/Lagos). Branch: `dev`.
Starting commit: `12c72761918e83158182b9c02e335869a9edec4a`.

Status: Stage 6 complete. All repository checks and production browser scenarios
passed. Work is committed locally to dev; resolve the exact commit as described
below. No public deployment, push or Stage 7 work was performed.

## Implemented application

Recreated the supplied light-blue liquid-glass reference with real React components,
CSS gradients/reflections, lightweight CSS/SVG agent/contract artwork and a floating
navigation bar. No reference image is used as a background. Shared panels, buttons,
badges, inputs, native focus-managed dialogs, notifications, tooltips and progress
controls support responsive layouts, keyboard operation and reduced motion.

Completed screens: workspace `/`, mandate list `/mandates`, immutable creation
`/mandates/new`, execution details `/executions/[id]`, payments `/payments`, and
persistent activity `/activity`. The workspace includes hero/help, task composer,
agent/contract trust boundary, actual vault balances, mandate management, execution
timeline, actual simulated-provider quotes, activity, payment history and lightweight
analytics. Empty histories stay empty. Authorization is green only after actual
funding confirmation. Rejected/expired payments show released reservations.

Owner wallet actions use injected EIP-1193/EIP-6963 with fixed viem calls for exact
approval/deposit, available-fund withdrawal, mandate creation/revocation and owner
rejection. Settlement/refund are permissionless when actual chain deadlines allow.
Confirmation checks receipt identity, destination and success; pending hashes
survive refresh and block blind resubmission. Six-decimal accounting uses bigint
and actual token metadata. Mandate cap/headroom and global liquidity are distinct.
The fixed 48-hour acceptance period is displayed, not made editable.
The local fixture mines empty blocks every five seconds so deadline controls
progress with real chain time while idle; configured windows are never shortened.

## Agent integration and authentication

The Node-only server composes Stage 5 AgentTools, runAgent, model adapters, simulated
providers, artifact inspection and purchase journal unchanged. Only additive exports,
shared versioned task identity and a fresh local fixture were added to the agent
package. Solidity, original agent business logic and original tests are unchanged.

Signed EIP-712 launches bind current owner, chain, vault, launch/resume action,
mandate, stable purchase intent, random single-use nonce and two-minute expiry.
The server rechecks actual ownership and mandate terms. Durable atomic nonce/run
updates prevent signature replay and duplicate logical purchases. Signed resume
reconciles the original journal, including existing escrow after revocation/expiry;
it does not restore permission to create a new payment. One logical purchase per
UI mandate is intentional in this MVP.

Bounded two-second polling reads durable events and actual receipts/payment state;
refresh never initiates a financial retry. Workspace journals use exclusive locks,
fsync and atomic replacement, validated schema and vault/genesis binding. Corrupt
state, persistence failure, observed reorg or excessive history fails closed.
Only challenge, launch and confirmed task-registration POST routes exist; there
is no arbitrary calldata, transaction, transfer or model-controlled destination API.
Origin, JSON type/size and all request shapes are checked. Keys stay server-only.
Compiled-browser boundary checking rejects server credential names/key PEM material.

## Verification

Final verification on the completed source:

| Command / check                          | Result                                                                                                                          |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| npm run check                            | Passed: formatting, lint, strict TypeScript, all tests and all builds                                                           |
| node scripts/forge.mjs build             | Passed through the pinned Forge wrapper, including the final repository build                                                   |
| node scripts/forge.mjs test              | 176 passed, zero failed/skipped; existing fuzz and stateful invariants preserved                                                |
| npm run test --workspace @flint/agent    | 90 passed, zero failed/skipped                                                                                                  |
| npm run test --workspace @flint/web      | 63 passed, zero failed/skipped, including 15 real-Anvil server cases, ABI parity, durable store and pending receipt regressions |
| npm run build --workspace @flint/web     | Production Next Webpack build passed, including strict TypeScript and all routes                                                |
| node scripts/forge.mjs fmt --check       | Passed in repository lint                                                                                                       |
| node scripts/check-web-boundary.mjs      | Passed for all 33 compiled JavaScript chunks                                                                                    |
| node node_modules/playwright/cli.js test | Three production Chromium scenarios passed in 2.6 minutes                                                                       |
| Local development launcher smoke         | Passed: root UI, configured local API and ignored owner import file; processes closed                                           |
| Isolated idle-clock probe                | Passed: one new empty block with five seconds of actual block-time progression                                                  |

The final root check ran 329 tests (176 Solidity + 90 agent + 63 web); the separate
browser campaign added three complete scenarios. No failed assertion was waived.
The documented npm run web:test:e2e command composes the contract/agent/production
builds and the same Playwright invocation; final verification executed those
components in sequence. Final formatting and whitespace checks were repeated after
evidence/report generation. Biome returned two informational template-style
suggestions in the evidence writer; existing Forge timestamp/style warnings and
the browser harness color-environment warning remain visible. No rules were
suppressed and no implementation error remains.

Browser verification uses real compiled TaskVault and MockUSDC on fresh local Anvil,
a dedicated agent burner and a test-only EIP-1193 owner bridge whose signer stays
in Node memory. It does not verify installed MetaMask/Rabby extension dialogs.
The production build is used, not a scripted visual mockup. Full challenge/delivery
deadline advancement occurs only in the separate Anvil harness; production UI and
agent have no clock-control capability.

Public evidence is generated in [stage-6-evidence.json](stage-6-evidence.json):
owner deposit, mandate creation, funding, unauthorized reverted request, settlement,
owner rejection and timeout refund transaction hashes plus actual accounting.
Normal flow deposits 20 mock USDC, authorizes cap 10, autonomously selects DataHub
at 6 versus WeatherCo at 8, reserves 6, validates delivery, accepts and settles
only after the full one-hour challenge deadline. Final first-purchase balance is
14, reserved zero, settled six, remaining task headroom four. Separate scenarios
check rejection after revocation and provider-failure timeout recovery without
increasing settled spending. Real transaction hashes are local evidence, not public
explorer links; a fresh reproduction generates different addresses and hashes.

Screenshots of actual browser state:

- [Desktop workspace](screenshots/stage-6-dashboard.png)
- [Mandate review](screenshots/stage-6-mandate.png)
- [Execution and settlement](screenshots/stage-6-execution.png)
- [Mobile workspace](screenshots/stage-6-mobile.png)

Reproduce with PowerShell instructions in [web README](../web/README.md) and
[development guide](development.md). The local launcher mints mock USDC to the owner
but performs no vault deposit or mandate creation; those are browser actions.

## Limitations and security findings

The review fixed mobile overflow, notification layout shifts, wallet listener and
callback lifecycle, exact receipt destination checks, terminal-state messaging,
resume inspection history, background persistence failure handling and the delayed-receipt race between ERC20 approval and deposit. Pending receipt effects now match hash/vault/chain before changing UI or storage. The initial
Turbopack setup failed with dynamic filesystem tracing/intermediate source errors;
the supported Next Webpack build, explicit absolute state path, server externals
and exclusions for generated/secret files produce a clean production build.
Original Forge timestamp/style warnings remain documented; no detector/test rules
were disabled. This is implementation verification, not an independent audit.

Local Anvil is the only executable network; Monad Testnet 10143 is labeled not
deployed. No live Qwen, paid inference, external service or real funds were used.
Qwen remains explicitly configured server-side with no silent mock fallback.
MetaMask/Rabby extension-specific behavior, Safari/Firefox and physical mobile
hardware need manual verification; Chromium covers injected protocol behavior,
responsive widths and reduced motion. Blur has a readable fallback.

The owner remains trusted dispute authority. Structured hashes/inspection do not
prove semantic accuracy; bad acceptance plus a missed dispute can pay for bad work.
Compromised agent keys can still issue fresh IDs within the onchain cumulative cap.
Application idempotency does not change that boundary. Uncertain wallet submissions
that fail before returning a hash require manual wallet history/nonce inspection.

The app requires one persistent local Node worker and trusted durable state. There
is no serverless job guarantee, distributed database, keeper, production finality/
reorg policy, EIP-1271 owner support, hosted authentication, request-rate protection
or multiuser activity privacy. Local visitors can read workspace history; signatures
protect launch authority. History is bounded to 20,000 blocks and 10,000 events;
limits/stale locks/reorgs require operator reconciliation. Provider simulations are
not authenticated live services. Deployment readiness is limited to local demos;
public or real-value deployment needs separate approval and security/operations work.

Stage 7 has not begun. No push or external deployment is authorized by this stage.

## Commit identity

A commit cannot contain its own hash. Resolve this report's exact final local `dev`
commit using `git show --no-patch --format=%H 2abeaad9a0876ded195171420591c9806068a2b5`. The completion
response records that exact resulting hash. HANDOFF contains the action history.

## Files changed

```text
.env.example
.gitignore
agent/package.json
agent/src/local/harness.ts
agent/src/local/workspace.ts
agent/src/server.ts
agent/src/task-identity.ts
docs/architecture.md
docs/development.md
docs/screenshots/stage-6-dashboard.png
docs/screenshots/stage-6-execution.png
docs/screenshots/stage-6-mandate.png
docs/screenshots/stage-6-mobile.png
docs/stage-6-evidence.json
docs/stage-6-report.md
e2e/workspace.spec.mjs
HANDOFF
package-lock.json
package.json
playwright.config.mjs
scripts/check-web-boundary.mjs
scripts/start-workspace.mjs
web/.env.example
web/AGENTS.md
web/next.config.ts
web/package.json
web/README.md
web/src/app/activity/page.tsx
web/src/app/api/workspace/[action]/route.ts
web/src/app/api/workspace/route.ts
web/src/app/executions/[id]/page.tsx
web/src/app/globals.css
web/src/app/layout.tsx
web/src/app/mandates/new/page.tsx
web/src/app/mandates/page.tsx
web/src/app/page.tsx
web/src/app/payments/page.tsx
web/src/components/create-mandate.tsx
web/src/components/dashboard.tsx
web/src/components/detail-pages.tsx
web/src/components/glass.tsx
web/src/components/navigation.tsx
web/src/components/workspace-provider.tsx
web/src/lib/abi.ts
web/src/lib/forms.ts
web/src/lib/local-chain.ts
web/src/lib/model.ts
web/src/lib/wallet-types.ts
web/src/lib/wallet.ts
web/src/server/runtime.ts
web/src/server/service.ts
web/src/server/store.ts
web/test/abi.test.ts
web/test/service.test.ts
web/test/store.test.ts
web/test/workspace.test.ts
```

Stage 6 dependencies: @playwright/test 1.64.0 (development only), server-only 0.0.1,
the existing Zod 4.6.5 and a workspace link to @flint/agent 0.1.0. Existing Next,
React, Tailwind and viem versions are preserved. Chromium is a free local test
installation, not an application or paid service dependency. Installation audit
reported zero vulnerabilities; this is not a security guarantee.
