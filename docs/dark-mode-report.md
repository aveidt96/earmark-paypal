# Earmark — Dark Mode implementation

Starting source: f58c91de4ebcaca818e535a2dd90ba914d48c759. Approved implementation: d9f1349de3a7375837141c48eacad6c86b1bba85. This report records the initial local implementation; its subsequent approved Dark-default publication is tracked in [production report](dark-mode-production.md).

## Features

- Light preserves the existing liquid-glass design, components and navigation. It was the initial local default; the approved production follow-up defaults new visitors to Dark while preserving explicit Light preferences.
- Dark uses charcoal/graphite panels, understated borders, sapphire accents and readable success/warning/error indicators. System follows OS appearance changes.
- The native accessible Appearance selector persists in earmark-theme, follows cross-tab changes and falls back to in-session selection if storage writes are blocked. Theme changes do not reload or remount wallet/workspace state.
- A static first-paint script applies the saved theme before paint. Its narrowly documented lint exception accepts only a fixed local constant with no request, provider or user text interpolation.
- The dark Execution Console appears on Workspace and Agent Activity. It shows the actual task, recorded quotes/selection/decision/tool result, confirmed request, immutable task cap and provider restrictions, checks confirmed at funding, current mandate status and prominent contract verdict.
- The existing receipt-backed lifecycle and financial actions are reused. An accepted payment becomes eligible only after the actual challenge deadline; eligibility is not reported as a transfer. Refund/rejection/settlement and unproven workflow failures have distinct wording.
- Shared routes, forms, wallet dialogs, notices and security-demo views receive dark styling. The desktop console has two panes; mobile stacks them and wraps the timeline. Existing reduced-motion support remains.

## Files

Frontend: web/src/app/globals.css, layout.tsx; components/navigation.tsx, dashboard.tsx, detail-pages.tsx, execution-console.tsx, theme-provider.tsx; lib/theme.ts, console-view.ts.
Tests: web/test/theme-console.test.ts and e2e/theme.spec.mjs.
Documentation: this report, web/README.md and HANDOFF. Four new screenshots are listed below. No dependency was added.

## Verification

- Frontend lint and typecheck passed.
- Production webpack build passed on the existing Next.js version.
- Frontend/server suite: 123 passed (105 preserved + 18 new appearance/verdict cases); five isolated Neon tests remain opt-in and were not run against production data.
- Final focused browser campaign: 2 passed in 1.0 minute after the specific visual corrections. It covered actual local wallet connection, deposit, mandate creation, six-USDC escrow, provider submission, acceptance, full challenge eligibility, settlement and refresh; theme changes preserved wallet and dialog values. System/OS changes, persistence across reload, cross-tab updates, blocked storage, six shared routes and desktop/tablet/mobile no-overflow checks passed. Final screenshot review confirms readable labels and an intact Light layout. These use fresh Anvil, mock USDC, deterministic providers and a test injected-wallet bridge, not public testnet transactions. Test-only time advancement occurs after acceptance and respects the full configured challenge.
- Contract, agent, hosted backend and deployment configuration are unchanged, so their independent suites were not redundantly rerun for this appearance-only change.

## Screenshots

Screenshots are generated from real local test escrow state, clearly identified as Local Anvil and Deterministic Mock. Desktop capture uses 1672 × 1050, tablet validation 820 × 1180, mobile 390 × 844; the console/mobile images frame the relevant component for readability:

- [Light](screenshots/dark-mode-light.png)
- [Dark Workspace](screenshots/dark-mode-workspace.png)
- [Dark Execution Console](screenshots/dark-mode-console.png)
- [Mobile Dark](screenshots/dark-mode-mobile.png)

Browser credential-boundary verification passed 42 compiled chunks. Actual configured-secret scanning passed 216 source paths and Git history with zero matches. The original user typing edit was restored after each build and excluded. No blocking implementation issue remains.

## Limits and review

No production deployment, public payment, backend restart or video production was requested or performed. Wallet smoke tests use the existing local signer bridge rather than interactive Rabby/MetaMask dialogs. Theme preference cannot persist across reload when the browser denies storage; in-session switching remains functional. Optional navigation rails and decorative effects were deferred. The original unrelated web/next-env.d.ts edit is preserved byte-for-byte and excluded from the commit.

The exact verified implementation commit is returned in the completion message and available from git rev-parse HEAD. Review locally with npm.cmd run web:local, then choose Appearance in the navigation. Public Earmark remains unchanged until deployment is approved.
