# Earmark — Final pre-submission UI/UX improvements

Date: 13 October 2026. Branch: dev. Production rollback: feaaf39cfabaaaa18dceb40b050dffb4cd295fc5 / Vercel HERgfJiuWpiHKftYW2ULHdzCLyWP. This work remains local until production approval; pushing dev automatically deploys the existing Vercel project.

## Original ten-line architecture summary

1. Next.js keeps Workspace, Earmarks, Payments, Activity, execution details and Security Demos on existing routes.
2. Shared glass components and graphite theme tokens provide the approved design.
3. Theme preferences persist locally; Dark loads before the first paint.
4. The workspace provider manages wallet connections, live snapshots and asynchronous backend polling.
5. viem wallet adapters retain owner, network and transaction-confirmation checks.
6. Owner-signed, single-use launch authorization connects the browser to the existing agent runtime.
7. Durable purchase intents reconcile uncertain transactions without blindly resending payments.
8. Stage 7 already records four real local-contract scenarios, including separate backend blocks and contract reverts.
9. The Execution Console currently repeats quotes, decisions and status information elsewhere on the page.
10. The existing testnet manifest and recorded receipts can supply a read-only demo without introducing another service.

## Implementation commits

| Item | Changes                                                                                                              | Local commit                             |
| ---- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| 1    | Bundled verified purchase, wallet-free initial rendering, read-only replay, historical balances                      | 3d8f582049b39f75f34832c3d76db52aef52e1aa |
| 2    | Primary A–D scenario controls, original local evidence, sequential checks, resistant model/backend/probe distinction | 689eb149b783141b232cd80daf4711f270191bf3 |
| 3    | One console, compact introduction, finance/actions then history; analytics and duplicate visual panels removed       | 7e765ae79d5a430f1d29783c72c03b7de90aeac1 |
| 4    | Exactly five stages, real acceptance-based challenge countdown, truthful terminal stops and receipt evidence         | ab7e16691e30cb6026709a5c9f81921bd4472e9a |
| 5    | Earmark/Run Agent/Vault product vocabulary; stable technical identifiers, routes and signature domain                | 9af4af0cd927ecd84b168e1852ce23f7099e96c2 |
| 6    | Threat Model disclosure, status colors/text, 44px logo, touch controls, Light/Dark/mobile consistency                | 20367abe35805932e656200042c796b74d7a1f7b |

## Data provenance and security

A uses a public-only projection of the stored successful Monad purchase after owner-authorized reconciliation, matched against the stored completed run and payment IDs. On 13 October, fresh read-only RPC checks confirmed successful settlement, the exact six-USDC Transfer/PaymentCompleted events, the original recipient, terminal state, zero reservations and 14-USDC available balance. Settlement occurred 130 seconds after the actual full challenge deadline. The initial uncertain/preparation failures are not falsely represented as a new uninterrupted transaction: the replay identifies itself as selected historical successful events following reconciliation. The original earmark is now revoked.

[Verified settlement](https://testnet.monadscan.com/tx/0x95810b4c31144e9b044955d7fc9b4e9dc055fb6842aaab495ea677a9a0a66e25).

B–D are the original Stage 7 local Anvil scenario records (run c0811df1-381e-4b30-aa6c-05ceaf10db91), not Monad transactions. Exact-provenance unit tests compare them with demo/earmark-demo-evidence.json. No local receipt is linked to a public explorer. Their original times and test-only Anvil clock disclosure remain intact.

| Scenario              | Honest classification                                                                                                                         | Financial outcome                                                                                                                                                                                   |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A — Normal Purchase   | Recorded, freshly reverified Monad Testnet enforcement; deterministic mock agent and simulated service                                        | DataHub 6 settled, original 20 funding, 14 available / 0 reserved                                                                                                                                   |
| B — Prompt Injection  | Actual deterministic policy resisted; malformed destination blocked offchain; separate independent local unauthorized-provider probe reverted | Forbidden destination received zero; legitimate approved purchase separately completed. BLOCKED verdict refers to the independent forbidden probe, not that legitimate payment. No live-Qwen claim. |
| C — Invalid Delivery  | Recorded local artifact/quote-byte validation failed; agent did not accept; owner rejected SUBMITTED payment on time                          | Six-USDC reservation released, 20 available / 0 reserved / 0 settled. No owner-trusted expected hash was configured and no semantic-quality proof is claimed.                                       |
| D — Budget Exhaustion | Recorded local distinct 4 + 4 requests funded; third refused by backend and independently reverted with TaskCapExceeded                       | 8 reserved / 0 settled under cap 10. Two earlier obligations remain FUNDED in the disposable snapshot; current third-request stepper stops at Requested.                                            |

The demo receives presentation props only. It never writes WorkspaceProvider state or calls financial endpoints, wallet signing, agent tools or generic RPC methods. Existing connected-owner funding, creation, launch nonce/signature verification, intent journal, revocation and settlement/refund handlers remain unchanged. No backend/contract/ABI/database/configuration changes. Async backend failure cannot remove bundled replay. Connected sessions retain financial-readiness notices and disabling gates.

## Validation

Tested final frontend source: **8d0f92bdaf3a024163cee9ee312161d5df9c6bd9**, including connection/evidence hardening commit **83bdbbf5340f11b8057365e05fe115682b5577a3**. The subsequent completion commit adds documentation and screenshots only. All commits are local on dev; main and public services are unchanged.

| Verification                                                                           | Result                                                                                                                        |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Frontend warning-level lint, strict TypeScript checks                                  | Passed; existing informational style suggestions only                                                                         |
| npm run build --workspace @flint/web                                                   | Passed at final source, including agent prebuild and Next.js TypeScript/static-generation checks                              |
| Full web/server Vitest coverage                                                        | 146 passed across the main run and isolated service rerun; 5 opt-in database tests intentionally skipped                      |
| Focused recorded-demo, original scenario provenance, lifecycle and theme/verdict units | 41 passed                                                                                                                     |
| Production-equivalent browser coverage                                                 | All 12 distinct cases verified, including the local owner financial workflow                                                  |
| Final affected browser repeat after intrinsic-logo fix                                 | 3/3 passed: first visit, exact evidence/hash copy, 390px Light/Dark/reduced-motion layout                                     |
| Offline/disconnected initial render                                                    | First contentful paint 1,076ms; driver round trip 1,868ms. Populated SSR console, wallet absent, backend snapshot returns 503 |
| Frontend credential boundary                                                           | Passed: 41 compiled JavaScript chunks                                                                                         |
| Actual configured-secret scan                                                          | Zero source/Git-history matches; private configuration stays ignored                                                          |
| Protected-source comparison                                                            | No changes to contracts, agent, API, deployment manifests, wallet/authentication model or workspace financial provider        |

The initial parallel Vitest run had a 30-second Anvil startup-hook timeout in service.test.ts; its unchanged fifteen cases passed when rerun alone. An earlier browser run had cold-start/driver timing failures, resolved by checking server/static readiness and measuring actual browser paint against the same strict two-second requirement. A complete twelve-case run then passed. The following frozen-source run passed eleven cases and detected the oversized w=3840 logo fallback; the installed Next image implementation was inspected, the intrinsic-size fix was rebuilt, and all three affected cases passed with the strict logo assertion retained. Financial assertions and timeouts were not weakened.

Browser coverage includes actual local owner connection, deposit of 20 mock USDC, immutable ten-USDC earmark creation, signed launch, six-USDC escrow, provider delivery, acceptance, full challenge-period Anvil time advancement, confirmed settlement and refresh. It also covers saved Light/Dark/System choices, wallet/form preservation, cross-tab synchronization, denied local storage, all four read-only scenarios, genuine explorer links, exact copied hashes, five stages, terminal failure stops, keyboard-accessible controls, reduced motion and 390px overflow/stacking. Replay tests reject financial POSTs. Native Rabby/MetaMask extension interaction was not automated; the existing explicit EIP-1193 local test bridge was used.

No Solidity or agent business source changed. Full Foundry and the independent agent unit suite were not repeated for this frontend-only release; the existing compiled real TaskVault and Stage 5 agent exercised the local browser transaction regression. No public testnet transaction or production deployment was initiated.

## Screenshots

These are actual production-equivalent browser captures. Demo screenshots replay existing evidence; connected-owner screenshots use fresh local Anvil, not public Monad. Owner captures show the accepted/challenge-pending state before the test legitimately advances the full interval and settles. The final logo request is 96px for the normal 44px mark, not 3840px.

- [Wallet-free desktop recorded purchase](screenshots/pre-submission-demo-desktop.png)
- [Prompt-injection verdict](screenshots/pre-submission-demo-injection.png)
- [390px wallet-free Dark replay](screenshots/pre-submission-demo-mobile.png)
- [Connected local owner Execution Console](screenshots/pre-submission-owner-console.png)
- [Connected local owner workspace](screenshots/pre-submission-owner-workspace.png)
- [Connected local owner mobile](screenshots/pre-submission-owner-mobile.png)
- [Preserved Light workspace](screenshots/pre-submission-owner-light.png)

## Files changed

Presentation: dashboard.tsx, execution-console.tsx, recorded-demo.tsx, payment-lifecycle.tsx, transaction-reference.tsx, detail-pages.tsx, security-demos.tsx, navigation.tsx, glass.tsx and create-mandate.tsx under web/src/components.

Shared projection/state display: web/src/lib/recorded-demo.ts, payment-progress.ts, console-view.ts and public-only demo/normal.json and demo/security.json. Routes/styles: web/src/app/globals.css, layout.tsx, mandates/page.tsx and mandates/new/page.tsx.

Tests: three new focused web/test files plus the existing e2e/theme.spec.mjs, workspace.spec.mjs and resolution.spec.mjs selectors. Documentation: HANDOFF, web/README.md, docs/architecture.md, this report and the seven new screenshot assets. No dependencies were introduced. The unrelated pre-existing web/next-env.d.ts edit is restored byte-for-byte and excluded from all commits.

## Reproduce on Windows PowerShell

Run npm run build --workspace @flint/web, then node node_modules/@playwright/test/cli.js test e2e/theme.spec.mjs. The existing harness starts a fresh isolated Anvil and production Next.js server. It verifies actual local owner funding, earmark creation, agent purchase, full challenge time advancement and settlement, plus wallet-free/offline replays. The test-only wallet bridge is explicitly a local browser protocol harness, not approval through a real extension. No public testnet payment is sent.

For unit/server regressions: node node_modules/vitest/vitest.mjs run web/test. Production credential-boundary check: node scripts/check-web-boundary.mjs.

## Limitations and rollback

Deterministic mock behavior does not demonstrate how live Qwen handles prompt injection. Delivery inspection checks configured bytes and structure, not all semantic quality. A malicious authorized signer remains bounded by the actual onchain cumulative cap, not by replay UI. Historical balances are not the visitor's current wallet balance. Local B–D receipts remain inspectable JSON evidence but have no public explorer. Replay compresses viewing time without altering original chain timestamps. Sticky verdict behavior is deferred to avoid obstructing mobile financial controls.

Production is unchanged. Before any approved release, keep current Ready deployment HERgfJiuWpiHKftYW2ULHdzCLyWP at feaaf39 available. Roll back using the existing Vercel project deployment menu for that exact deployment and restore its production alias; no contract/backend/database rollback is needed. Do not force-push or modify main. No motion/video/submission work was started.
