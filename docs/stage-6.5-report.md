# Earmark — Stage 6.5 rebrand report

Date: 9 October 2026 (Africa/Lagos). Branch: dev.
Starting commit: 2abeaad9a0876ded195171420591c9806068a2b5.

Status: Stage 6.5 complete. All required checks and fresh-fixture browser scenarios passed.

## Scope and public surfaces

Applied the approved Earmark identity and official copy while preserving the
light-blue liquid-glass layout. Updated navbar/home link, hero/tagline/actions,
explanation and features, trust-boundary statement, authorization/escrow labels,
Workspace/Mandates/Agent Activity/Payments/Live Activity terminology, footer,
browser titles, Open Graph/Twitter metadata, local launcher label and current
documentation. Historical reports are marked historical and retain original
facts, external research and original stage commit identities.

The complete feature descriptions live in the existing How It Works dialog to
keep the workspace spacious. Explore Security Demos explains existing test
coverage and explicitly says Stage 7 showcases/video have not been produced.
No new attack demo, MP4, contract workflow or backend capability was introduced.

## Approved assets

User upload: Faceted Blue Crystal Arch Emblem.png.
Repository original: web/public/brand/earmark-crystal.png.

The PNG is copied byte-for-byte, with source SHA-256 recorded in
[branding guide](branding.md). No AI redraw, recoloring or concept change.
Standard navbar/footer wordmark and compact accessible crystal usage share the
same original. Next image optimization serves the navbar. Native Next metadata
rendering creates 32-pixel favicon, 180-pixel Apple icon and 1200 × 630 social
preview with Earmark copy; only empty side margins are cropped for square icons.

## Functionality and compatibility

No changes to Solidity source/tests, ABI/storage, accounting, escrow lifecycle,
agent runtime/tools/model/journal, server launch verification, wallet separation
or backend trust boundaries. The wallet-network name and old network-helper error
prefix change only their public label.

Intentionally retained: samuelid22/Flint repository/path, flint/@flint package names,
Flint Owner Launch EIP-712 domain/version, FLINT_* variables, all task/purchase/
request hash namespaces, durable flint-* browser keys and internal singleton/test
bridge names. Changing these for branding could break receipt recovery,
idempotency or signed authorization compatibility. The signing prompt may show
the legacy domain; [branding guide](branding.md) and web README document it.

Pre-existing web/next-env.d.ts user/dev-generated changes are preserved and excluded
from this commit. No package/dependency or lockfile migration is needed.

## Verification

Passed npm run check: formatting, lint, strict TypeScript, 176 Solidity tests
(including existing fuzz/invariant coverage), 90 agent tests, 63 frontend/server
tests, and all contract/agent/production frontend builds. Total: 329 tests.
The browser credential-boundary scan passed 36 compiled JavaScript chunks.
Generated favicon, Apple icon and social preview were visually inspected.

The first campaign caught a missing branded page title and unsupported metadata
background rendering; explicit screen titles and native ImageResponse image
primitives fixed these presentation issues. Two narrowly scoped noImgElement
lint exceptions explain that these server-only primitives are rasterized into
PNGs, not sent as browser image tags. No global rule was disabled.

A subsequent campaign passed the brand/asset assertions but hit the existing
five-second simulated-provider timeout after onchain delivery submission. The UI
accurately showed failure and kept funds escrowed. No runtime timeout, backend
logic or financial assertion was changed. The unchanged fresh-fixture rerun passed all three scenarios in 2.4 minutes.
The existing complete browser scenario additionally checks real Earmark navigation,
hero, page title, Open Graph metadata, optimized logo loading, favicon/Apple/social
PNG dimensions and explanation controls. Financial and authorization assertions
remain intact. The renamed Payments heading selector follows the approved copy.

Browser results: complete owner deposit/mandate/agent purchase with DataHub at six
mock USDC, confirmed delivery/acceptance, blocked early settlement, full
3,600-second challenge interval (local harness time advancement), successful
settlement, unauthorized payment rejection, refresh recovery, 390-pixel mobile
layout and reduced-motion mode. The other two scenarios passed wallet account/
chain changes, rejected signatures, nonce replay, revocation, owner rejection and
permissionless timeout refund. No challenge period was shortened. These are real
local contract calls through the test wallet bridge, not installed-extension or
live-Qwen evidence. Zero page errors in the complete purchase scenario.

Commands: npm run check; node scripts/check-web-boundary.mjs;
node node_modules/@playwright/test/cli.js test. The root check includes forge build,
forge test, forge fmt --check, agent/web tests and production Next build. Final
document/artifact edits additionally receive formatting, lint and Git whitespace
checks. Existing Foundry timestamp/style notes and terminal color warnings remain
visible; no contract warning was suppressed for this branding pass.

## Screenshots and evidence

Production browser scenarios regenerate these from actual local state:

- [Workspace](screenshots/stage-6-dashboard.png)
- [Mandate review](screenshots/stage-6-mandate.png)
- [Agent Activity](screenshots/stage-6-execution.png)
- [Mobile workspace](screenshots/stage-6-mobile.png)
- [Generated social preview](screenshots/stage-6.5-social.png)

[Local transaction evidence](stage-6-evidence.json) retains its stable filename;
this pass regenerates hashes/state on a fresh local fixture. The parent commit
preserves the original Stage 6 images/evidence. No financial activity is fabricated.

## Limitations

The artwork has its approved white background; it is not newly vectorized or
redesigned. Local Anvil/mock USDC and simulated providers remain explicit. No
Monad deployment, paid inference or external service was introduced. EOA owner
authentication, single persistent local worker, trusted durable state, delivery
semantic-quality limits and missed-owner-dispute risk remain unchanged.
Existing simulated-provider timing can produce PROVIDER_TIMEOUT even after delivery submission; safe reconciliation/timeout handling remains necessary. This branding pass preserves the runtime.
Installed MetaMask/Rabby dialogs and live Qwen are outside the automated bridge
verification. Public sharing origin must be configured at build time before a
separately approved deployment. No public domain or production readiness is claimed.

## Files changed

```text
agent/README.md
contracts/README.md
docs/ai-architecture.md
docs/architecture.md
docs/branding.md
docs/development.md
docs/naming-review.md
docs/screenshots/stage-6-dashboard.png
docs/screenshots/stage-6-execution.png
docs/screenshots/stage-6-mandate.png
docs/screenshots/stage-6-mobile.png
docs/screenshots/stage-6.5-social.png
docs/stage-1-report.md
docs/stage-2-report.md
docs/stage-3-report.md
docs/stage-4-security-report.md
docs/stage-5-report.md
docs/stage-6-evidence.json
docs/stage-6-report.md
docs/stage-6.5-report.md
e2e/workspace.spec.mjs
HANDOFF
README.md
scripts/start-workspace.mjs
web/public/brand/earmark-crystal.png
web/README.md
web/src/app/activity/page.tsx
web/src/app/apple-icon.tsx
web/src/app/executions/[id]/page.tsx
web/src/app/globals.css
web/src/app/icon.tsx
web/src/app/layout.tsx
web/src/app/mandates/new/page.tsx
web/src/app/mandates/page.tsx
web/src/app/opengraph-image.tsx
web/src/app/page.tsx
web/src/app/payments/page.tsx
web/src/components/dashboard.tsx
web/src/components/detail-pages.tsx
web/src/components/glass.tsx
web/src/components/navigation.tsx
web/src/lib/brand-art.tsx
web/src/lib/network.ts
web/src/lib/wallet.ts
```

The four existing screenshots and local transaction evidence were refreshed from the passing production-browser fixture. The generated social preview is also included. The inventory is checked against the commit scope.

## Commit identity

A commit cannot contain its own hash. Resolve the exact local rebrand commit with:

```powershell
git log -1 --format=%H -- docs/stage-6.5-report.md
```

The completion response supplies that exact hash. HANDOFF records the action
history. No push, public deployment, Stage 7 work or hackathon MP4.
