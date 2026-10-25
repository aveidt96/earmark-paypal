# Original Earmark README — historical provenance

The content below describes the Monad source at `cc20daa`. Its deployment URLs,
status claims and operating instructions do not describe Earmark PayPal.

# Earmark

**Every payment has a purpose.**

Onchain financial authorization for autonomous AI agents. Empower agents to
purchase services and complete tasks within owner-controlled, task-specific
mandates and delivery-conditional escrow.

**AI makes decisions. Earmark enforces boundaries.**

The functional light-blue liquid-glass workspace supports owner funding, immutable
mandates, signed task launches, autonomous provider comparison, actual local escrow,
delivery inspection, disputes, refunds and settlement. Deterministic Mock mode and
simulated providers are explicit. Qwen remains replaceable and server-only; no
paid inference is enabled. Both Monad Testnet contracts and the public application are deployed. A real 6 mock-USDC purchase completed after delivery acceptance and the full challenge period; the vault retains 14 mock USDC. See docs/stage-8a-deployment-report.md for current deployment evidence.

## Run locally — Windows PowerShell

Use Node 22.14+ within 22.x and npm 10/11:

```powershell
npm.cmd ci --ignore-scripts
npm.cmd run setup:contracts
npm.cmd run web:local
```

Open the printed loopback browser URL. Import the printed ignored owner burner
file into a dedicated development wallet profile and configure the printed RPC
with chain 31337. Connect the owner, deposit mock USDC, create a mandate and launch
the task. Never use this local burner for real funds. The browser never receives
the agent or provider signing keys.

The launcher starts a fresh local Anvil chain, compiled MockUSDC/TaskVault and
Next.js. It mints mock USDC to the owner but does not deposit or create mandates.
See [frontend instructions](web/README.md) for the complete browser workflow,
full challenge-period handling and automated demonstration.

Both tested contracts are deployed on Monad Testnet (10143). Public application
readiness and a complete testnet purchase are still being verified.
Public workspace: https://earmark-omega-virid.vercel.app.
All hackathon demonstration payments use mock assets. The local demo identifies
Local Anvil; the hosted workspace identifies Monad Testnet and Deterministic Mock.
See [deployment progress](docs/stage-8a-deployment-report.md) for live verification status.

## Verify

```powershell
npm.cmd run check
node node_modules/playwright/cli.js install chromium
npm.cmd run web:test:e2e
```

The root check runs formatting, lint, TypeScript, Solidity/agent/web tests and all
production builds. The separate Chromium suite uses actual local contract calls
and a test-only injected-wallet bridge; installed extension dialogs require manual
verification. Test-only time advancement respects the full configured deadlines.

## Repository

```text
contracts/   TaskVault, token mocks, Foundry unit/fuzz/invariant tests
agent/       Server-only autonomous runtime, mock/Qwen adapters, purchase journal
web/         Liquid-glass Next.js workspace, owner wallet and launch integration
docs/        Architecture, development, branding, historical stage reports
scripts/     Local development and verification tools
.github/     CI and dependency configuration
```

## Documentation

- [Brand identity and approved terminology](docs/branding.md)
- [Architecture and security assumptions](docs/architecture.md)
- [Frontend and local browser workflow](web/README.md)
- [Agent runtime and tools](agent/README.md)
- [TaskVault API](contracts/README.md)
- [Development and Windows instructions](docs/development.md)
- [Qwen integration boundary](docs/ai-architecture.md)
- [Historical naming research](docs/naming-review.md)
- [Stage 6 implementation](docs/stage-6-report.md)
- [Stage 6.5 rebrand report](docs/stage-6.5-report.md)
- [Stage 7 security demonstrations](docs/stage-7-report.md)
- [Complete action record](HANDOFF)

The public name is Earmark. The repository URL samuelid22/Flint, private package
names, signature domain, hash namespaces, environment variables and durable state
keys intentionally retain their stable internal identifiers. They are not a second
public brand. Historical reports retain their original facts and provenance.

Work exclusively on dev. Do not push to main or deploy without approval.
Stage 7 provides local security demonstrations and recording. Stage 8 requires approval. No project license has been selected; publication is disabled.

## Security demonstrations and hackathon video

```powershell
npm.cmd run demo:setup-media
npm.cmd run demo:record
```

Four real local fixtures appear in the liquid-glass Security Demos viewer:
autonomous purchase, provider prompt injection, invalid delivery and budget
exhaustion. Mock policy behavior, backend blocks and onchain reverts are distinct.
No public-chain deployment or paid inference. The MP4 stays locally under
demo/earmark-metropolis-demo.mp4 and outside Git.
See [recording and manual fallback](demo/README.md).

## Testnet deployment progress

Stage 8A now has Neon-backed durable intents, nonces, runs/events and receipt-only
recovery. Public Monad/Render/Vercel deployment is still pending owner signing and
end-to-end verification. See [deployment instructions](docs/deployment.md) and
[progress report](docs/stage-8a-deployment-report.md). No mainnet or paid service.
