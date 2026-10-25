# Earmark PayPal — frontend migration note

Use the [root README](../README.md) for credential-free preview setup and PayPal
integration status. The following guide is retained for the **legacy local EVM
workspace**. Its wallet, mock-USDC and contract operations are not PayPal payments.

## Original Earmark web workspace

Light-blue liquid-glass Next.js App Router application. Financial data comes from
TaskVault and recorded Stage 5 events. Simulated providers and Deterministic Mock
are labeled. The browser never receives the agent or provider private keys.

## Run locally (Windows PowerShell)

From the repository root, using Node 22 and the pinned Foundry installation:

```powershell
npm.cmd ci --ignore-scripts
npm.cmd run setup:contracts
npm.cmd run web:local
```

Open the printed `http://127.0.0.1:3000` address (use that exact origin).
The script starts a fresh loopback Anvil chain (31337), creates four separate
random development actors, deploys existing compiled MockUSDC and TaskVault
locally, and mints 100 mock USDC to the owner. It does **not** fund the vault or
create a mandate. No real funds or external deployment occur.

Import the owner burner from the printed ignored `.tools/.../local-owner.key`
file into a dedicated development MetaMask/Rabby profile. That key is local-only;
never reuse it or fund it on a public chain. The key value is never printed.
Add the printed RPC URL and chain 31337 to the wallet. Connect the owner, deposit
20 mock USDC, create a 10-USDC weather mandate with both providers and at least
one-hour delivery/challenge windows, and launch the task. Sign the short-lived
Earmark launch authorization; it is not an ERC20 approval.

DataHub should be selected for 6 mock USDC. Open execution details to inspect
actual funding, delivery, acceptance and the challenge deadline. Leave the owner
available to dispute. After the full challenge period elapses onchain, anyone
connected on the correct network can click Settle payment. The local fixture mines empty blocks every five seconds so actual block time progresses while idle. The UI never advances time.

The launcher shuts down both processes on Ctrl+C. Every invocation creates a new
chain, vault and journal. Import/connect the current owner; old vault state must
not be reused for another chain.

## Automated local demonstration

```powershell
node node_modules/playwright/cli.js install chromium
npm.cmd run web:test:e2e
```

The production Chromium suite drives deposit, creation, signature, agent purchase
and settlement through the actual interface. A test-only EIP-1193 bridge delegates
owner signing to Node memory; neither owner nor agent keys enter the page. This
verifies injected-wallet protocol behavior, not the installed MetaMask/Rabby
extension UI. The harness separately advances Anvil to the **full original**
challenge deadline, then clicks the enabled settlement control. No time-control
route exists in the application. Screenshots and public transaction evidence are
written under `docs/`; transient traces/logs live in ignored `.tools/`.

For manual fixture time advancement, use the printed RPC and an actual accepted
payment's challenge deadline with Anvil's `evm_setNextBlockTimestamp`, then
`evm_mine`. These are operator-only local RPC actions, not agent/frontend tools.
Never shorten configured contract windows or describe fixture time as wall time.

## Checks

```powershell
npm.cmd run check
npm.cmd run test --workspace @flint/web
npm.cmd run web:test:e2e
node scripts/forge.mjs build
node scripts/forge.mjs test
node scripts/check-web-boundary.mjs
```

Root typecheck builds the agent exports first. The web production build uses
Next's supported Webpack option for reliable Windows runtime package tracing.
Next remains the existing framework; no contract/runtime business logic changed.

## Security and deployment boundaries

The server re-reads the vault owner and verifies EIP-712 chain, vault, action,
mandate, stable purchase intent, nonce and two-minute expiry. Nonces are durably
consumed once. Launches need current active authority; signed resume reconciles
an existing failed/interrupted intent, including escrow after revocation/expiry.
The existing agent journal reconciles uncertain receipts without blind resends.
Owner transaction hashes survive refresh and block new submissions while pending.

One logical purchase is supported per UI-created mandate. Retries reuse its
intent; a legitimate new purchase needs a new mandate in this MVP. The onchain cap
remains the compromised-agent loss boundary. Terms are immutable, global liquidity
is separate from task headroom, refunds restore headroom, and settlement consumes
historical allowance. Existing escrow survives revocation.

Run the local Node server persistently; background agent jobs are unsuitable for
serverless request lifetimes. Keep `FLINT_STATE_DIR` on trusted durable local disk,
with a single worker. Locks fail closed, stale locks require operator review, and
reorg/history-range mismatches require reconciliation. There is no keeper,
production finality policy, multiuser data privacy or hosted authentication.
Current signatures support EOA owners. Local activity is visible to visitors on
the loopback server. The current executable integration deliberately refuses
non-local chains; Monad Testnet 10143 is identified as not deployed.

No paid inference is enabled by the launcher. Qwen requires explicit server-only
configuration and authorization for paid use; mock mode never silently replaces
Qwen failures. Live Gemini is likewise server-gated (`EARMARK_GEMINI_ENABLED`,
default off) on the isolated `feature/gemini-safe-rollout` branch: while
disabled the console states Demo Mode availability instead of implying live
model activity, and a Gemini run is labeled exactly "Gemini". Commitments and
deterministic structure checks do not prove factual
or semantic quality. An accepting agent plus an absent owner can pay for bad work.

## Public identity and compatibility

The public name is Earmark. The original approved crystal logo is reused in the navbar, compact mark, favicon, Apple icon and social preview. Signing dialogs intentionally retain the EIP-712 domain Flint Owner Launch; changing it would change the authorization protocol. Existing @flint packages, FLINT_* environment variables, flint-* storage keys and hash namespaces remain stable. See [branding](../docs/branding.md).

## Security Demos and recording

The Workspace includes compact links to four local scenarios at /security.
npm.cmd run demo:serve builds and runs a fresh isolated suite and opens a read-only
viewer at localhost:3217/security. UI controls select scenarios; trusted CLI
fixtures perform owner setup and independent adversarial probes outside model
tools. No scenario execution/signing/time-travel endpoint is exposed. Optional
EARMARK_DEMO_STATE_PATH is absolute, server-only and supplies bounded public
evidence. Without it the page has an honest empty state. Failed polling preserves
the last good snapshot and reports the interruption. Receipt hashes and actors
identify actual local records, not public Monad transactions.

See [demo instructions](../demo/README.md) for npm.cmd run demo:record, portable
free media tools, mock disclosures, exact recording outputs and manual fallback.

## Hosted testnet preparation

The server process can explicitly use Monad Testnet 10143 with pinned contracts
and PostgreSQL durability. Browser routes proxy only to the configured Render API;
hosted configuration never falls back to localhost. Owner signatures, stable
purchase identity, wallet separation and the Earmark interface remain in place.
Public hosting and real testnet funding, mandate, launch, delivery and acceptance
and terminal settlement after the full challenge period are verified. See
[deployment instructions](../docs/deployment.md). No server secret belongs in a
NEXT_PUBLIC variable or browser configuration.

Stage 8A confirmed testnet contracts are recorded in deployments/monad-testnet.json.
The direct /resolve page can inspect and resolve an existing escrow while the
backend is unavailable. It reads public Monad state, verifies code/token pins and
uses wallet signatures only for eligible settlePayment/refundExpired calls. Saved
uncertain attempts must be reconciled before further signing. No keys are embedded
in the frontend. Public hosting is verified; real terminal-payment verification passed;
see docs/stage-8a-deployment-report.md rather than assuming Neon setup publishes
this application.

## Public testnet workspace

Frontend: https://earmark-omega-virid.vercel.app
Backend: https://earmark-api-testnet.onrender.com (`/health`, `/ready`).

The public workspace uses existing Monad Testnet (10143) contracts and Neon
PostgreSQL history. It exposes read-only confirmed records without an owner
wallet. No completed purchase is claimed until a real testnet terminal receipt
is verified. Deterministic Mock and simulated providers remain explicit.

Render Free may wake or hand over between workers. History synchronization,
worker startup and backend unavailability have distinct messages; financial
actions stay disabled until a fresh snapshot is available. Automatic refresh
recovers state without submitting transactions. `/resolve` reads the contract
independently when the worker is unavailable and only settles/refunds eligible
payments after a wallet approval.

For owner-only mock-token setup and uncertain-mint reconciliation, follow
[deployment instructions](../docs/deployment.md). Signer keys and database
credentials belong only in the backend environment, never the browser.

The verified weather payment is COMPLETED after the full challenge period. Owner
revocation prevents new purchases while preserving historical settlement records.
DataHub received six mock USDC; the vault holds 14 available and zero reserved.
Public refresh recovers confirmed history without an owner wallet. Loading mandate
data is explicitly distinguished from a confirmed empty vault. The independent
resolver refuses settlement or refund of this terminal payment.

## Appearance

The navigation Appearance selector offers Light, Dark and System. New visitors
start in Dark; any explicitly saved choice takes precedence. Light retains
the original liquid-glass interface; Dark prioritizes a graphite two-pane Execution
Console on Workspace and Agent Activity. System follows the OS. Preferences persist
locally and theme changes preserve wallet, task and form state. The console uses
existing recorded events and confirmed escrow state; it does not run the supplied
HTML simulator or add financial permissions.

Review locally with `npm.cmd run web:local`. After a production build, run the focused
wallet/mandate/payment/theme/browser checks with:

```powershell
node node_modules/@playwright/test/cli.js test e2e/theme.spec.mjs
```

These tests use fresh Local Anvil, mock assets and the existing test wallet bridge.
See [dark-mode report](../docs/dark-mode-report.md) for screenshots and results.

The approved production publication and rollback point are documented in
[dark UI production report](../docs/dark-mode-production.md). Opt-in read-only
public verification blocks financial API calls and never signs transactions:

```powershell
$env:EARMARK_PRODUCTION_SMOKE = "1"
node node_modules/@playwright/test/cli.js test e2e/production-theme.spec.mjs
Remove-Item Env:EARMARK_PRODUCTION_SMOKE
```

## Owner-only Live Gemini preview

The isolated Gemini feature branch adds an owner-signed, read-only inference mode
beside the existing recorded console. Demo Mode remains the anonymous default.
Run `pwsh -NoProfile -File .\scripts\gemini-phase-b.ps1 console` from the repository
after building the web workspace. The wrapper uses the existing encrypted local
key and fixes financial execution to false. Follow [Phase C instructions](../docs/gemini-phase-c-report.md)
for authentication, actual-tool evidence, browser checks and controlled rollout.
The synthetic fixture and backend validation are explicitly distinguished from
new onchain payments. No production publication is included in this preview.

## Wallet-free judge experience

The default disconnected workspace displays a bundled, read-only historical Monad purchase immediately, without waiting for Render or RPC. Four primary scenario controls and Replay only change presentation. A is the confirmed six-USDC DataHub purchase; B–D are honestly labelled original local Anvil security records. Local receipts do not receive Monad explorer links. Connected users retain real owner-gated funding, earmark creation and Run Agent actions, and can return to their live execution after inspecting scenarios.

Execution uses exactly Requested → Earmarked → Delivered → Accepted → Settled. Accepted funds remain reserved through the actual contract challenge deadline. Deadline expiry alone is not a confirmed transfer. See docs/pre-submission-ui-report.md for provenance, limitations and validation. Dark remains the new-visitor default, with saved Light/Dark/System preferences preserved.
