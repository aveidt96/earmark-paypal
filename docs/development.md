# Earmark development guide

## Supported toolchain

- Node.js 22.14+ (22.x); npm 10 or 11. Use the pinned `.nvmrc` baseline.
- npm workspaces and the committed root lockfile; install from repository root.
- Solidity 0.8.28, Cancun bytecode target, optimizer enabled at 200 runs.
- Foundry 1.8.5 is installed locally from a checksum-verified official release.
- No global Foundry, Solidity, wallet, private key, or AI-provider setup is needed.

`npm ci` installs pinned JavaScript and OpenZeppelin dependencies. Run
`npm run setup:contracts` to install Foundry under ignored `.tools/` using the
release version and SHA-256 hashes in `scripts/foundry-release.json`.
First Forge compilation downloads the
selected native solc into Foundry's user cache. Package installation and that first
compiler download require network access. Tests use a local EVM without a fork.

## Commands

| Command (repository root) | Purpose                                                               |
| ------------------------- | --------------------------------------------------------------------- |
| `npm ci`                  | Reproducible package installation                                     |
| `npm run setup:contracts` | Install checksum-verified Foundry 1.8.5 locally                       |
| `npm run dev`             | Next.js development server                                            |
| `npm run build`           | Compile contracts, agent package, and production web app              |
| `npm run lint`            | Foundry formatting and Biome with no warnings                         |
| `npm run typecheck`       | Strict TypeScript checks                                              |
| `npm test`                | Contract, agent unit/Anvil integration and web tests                  |
| `npm run format`          | Prettier plus Solidity formatting                                     |
| `npm run format:check`    | Check formatting without edits                                        |
| `npm run check`           | Complete repository verification sequence                             |
| `npm run contracts:build` | Forge build only                                                      |
| `npm run contracts:test`  | Forge tests only                                                      |
| `npm audit`               | Registry advisory check; review findings without blind force upgrades |

The web app uses the App Router, system fonts (no build-time font downloads),
Tailwind's PostCSS plugin, and viem's Monad Testnet definition. No RPC or wallet
client is created. It rejects a configured public chain ID other than 10143.

Foundry uses `network = "monad"` and `hardfork = "monad:MonadNine"` for local
execution, separately from the compiler Cancun bytecode target. The Solidity
suite preserves the original mandate/token-safety tests and adds production escrow
lifecycle, deadline, replay, outgoing-token rollback, fuzz and stateful accounting
coverage. Stage 2's explicitly test-only subclass still checks accounting snapshots;
Stage 3 and Stage 4 use real production payment operations without seeded financial state. Stage 4 adds varied agents/providers/owners and terms, adversarial calls, direct donations, lifecycle matrices and exact-credit edge cases.

Default fuzz runs: 256 per property; CI: 1,000 (seed `0x10143`). Stateful invariants
run two combined campaigns checking global reserves, mandate caps/backing and immutable
records: each defaults to 64 runs × 64 calls; each CI campaign uses 256 × 128 (65,536 generated handler calls across both). Unexpected handler reverts fail.
Each campaign's completion hook resolves all outstanding escrows and reconciles
terminal records and zero liabilities. Generated action counts include guarded
no-op selections; successful resolution is separately checked by handler counters. The Stage 4 handler separately records skipped selections, successful transitions, expected adversarial reverts and ownership operations. Printed generated.* counters describe the last observed sequence before cleanup, not aggregate campaign totals; cleanup counts are separate. A deterministic coverage test requires successful coverage of every terminal path and all eight adversarial call types.

CI already sets `FOUNDRY_PROFILE=ci`. Run the same strength locally from root:

```powershell
$env:FOUNDRY_PROFILE = 'ci'
node scripts/forge.mjs test -vvv
Remove-Item Env:FOUNDRY_PROFILE
```

POSIX: `FOUNDRY_PROFILE=ci node scripts/forge.mjs test -vvv`.
For the complete Stage 4 verification also run `node scripts/forge.mjs build`,
`node scripts/forge.mjs test -vvv --gas-report`, `node scripts/forge.mjs fmt --check`
and `npm run check`. Gas reports are local configured-EVM observations.

From `contracts/`, run the equivalent pinned toolchain commands:

```sh
../.tools/foundry-1.8.5-linux-x64/forge build
../.tools/foundry-1.8.5-linux-x64/forge test -vvv
../.tools/foundry-1.8.5-linux-x64/forge fmt --check
```

On Windows the binary is `../.tools/foundry-1.8.5-win32-x64/forge.exe`.
Other platform directories follow `scripts/foundry-release.json`.
Alternatively, `node ../scripts/forge.mjs test -vvv` invokes the correct local
binary automatically. Optional `test --gas-report` gives local EVM observations,
not Monad network fee estimates.

## Environment variable boundaries

| Variable                                             | Scope and Stage 5 behavior                                      |
| ---------------------------------------------------- | --------------------------------------------------------------- |
| `MONAD_TESTNET_RPC_URL`                              | Future target / Foundry alias; not used by default local checks |
| `NEXT_PUBLIC_CHAIN_ID`                               | Public web metadata; accepted value 10143                       |
| `AGENT_MODEL_MODE`                                   | Server only; default explicit mock; qwen requires configuration |
| `AI_BASE_URL`, `AI_MODEL`, `AI_TIMEOUT_MS`           | Server model endpoint/name/bounded timeout                      |
| `AI_API_KEY`, `AI_ENABLE_NETWORK`                    | Server credential and explicit opt-in; no paid calls authorized |
| `AGENT_CHAIN_ID`, `AGENT_RPC_URL`                    | Server local signer accepts 31337 and loopback HTTP only        |
| `TASK_VAULT_ADDRESS`, `AGENT_EXPECTED_VAULT_ADDRESS` | Matching owner-trusted vault address pins                       |
| `AGENT_PAYMENT_TOKEN`, `AGENT_VAULT_CODE_HASH`       | Trusted token and exact runtime code pins                       |
| `AGENT_PRIVATE_KEY`                                  | Separate server-only agent burner; never frontend/model/logs    |

The root `.env.example` is documentation. Next.js loads files under `web/`.
No agent file is automatically loaded. Inject server variables explicitly;
`agent/.env.example` documents them. Never use `NEXT_PUBLIC_` for secrets or log
complete configuration/environment objects. Git ignores environment files, keys,
local journals, dependencies and generated output; sanitized examples are tracked.

## Local autonomous agent demo

From root in Windows PowerShell:

```powershell
$env:AGENT_MODEL_MODE = 'mock'
npm.cmd run agent:demo
npm.cmd run agent:test:integration
npm.cmd run check
```

After `npm ci` and `npm run setup:contracts`, the scripts use pinned local Anvil,
compiled MockUSDC/TaskVault, randomly generated separate burners and deterministic
providers. No pre-funded real wallet, API key or external chain is needed. Integration
tests instantiate actual contracts, including uncertain receipts and real reverts.
`npm test` includes these agent integration tests; root check builds contracts before
running agent tests through workspace order. The explicit integration command also
builds its Solidity artifacts before starting. Generated local journals and demo
JSON evidence live under ignored `.tools/`; a separately operated runtime may use
ignored `.agent-state/` with one journal per signing wallet.

The agent stops at the real accepted/challenge state. The separate demo harness
verifies early settlement rejection, advances only the disposable local clock to
the full deadline, and settles as an observer. This is no bypass and adds no agent
capability. Runtime defaults to explicit mock mode, with simulated provider data
and actual chain receipts. It does not silently replace unavailable Qwen output.
No live inference, external deployment or frontend integration is required.
See [agent README](../agent/README.md) for quote/delivery checks, all eight tools,
server pins, recovery procedures and remaining trust assumptions.

## Windows and CI

Use `npm.cmd` in PowerShell when execution policy blocks `npm.ps1`.
The repository uses LF line endings and avoids shell-specific environment
assignment inside npm scripts. A Node wrapper invokes the repository-local Forge
binary without relying on a global installation.

CI performs installation and `npm run check` on Linux and Windows, with read-only
repository permissions, no secrets, no deployments, and no pushes. It is a workflow
configuration until it has actually run in GitHub; local checks are reported
separately. Dependency updates target `dev`.

## Network references and limits

The requested target is Monad Testnet, chain ID 10143. See
[Monad network documentation](https://docs.monad.xyz/developer-essentials/testnet)
and [viem chain metadata](https://viem.sh/docs/chains/introduction).
The public RPC is a development default with no availability guarantee.

Review [Monad execution differences](https://docs.monad.xyz/developer-essentials/differences)
before implementing or deploying contracts; local compiler checks alone cannot
establish gas or opcode parity with the chain.

## Tooling choices and platform limits

Biome provides maintained JavaScript/TypeScript/React linting, with Prettier for
formatting and Foundry for Solidity formatting. Next.js documents Biome as a
supported linter. The initial standard ESLint configuration pulled in an unpatched
braces denial-of-service advisory; that dependency chain and the unsupported
ESLint 9 engine were removed, rather than downgrading the application framework.

Foundry release hashes cover Windows x64, Linux x64/arm64, and macOS x64/arm64.
The installer uses the system tar utility and only extracts a matching official
archive. Linux/macOS configurations are provided but are not locally verified
from this Windows session.

References: [Next.js linting options](https://nextjs.org/docs/app/getting-started/installation),
[Biome installation](https://biomejs.dev/installation/quick-start/),
[original braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).

## Optional local static analysis

Stage 4 used free Slither 0.11.3 / crytic-compile 0.3.11, installed in an ignored
Python virtual environment. It adds no application dependency. Run from the
repository root after installing the regular development dependencies:

```powershell
python -m venv .tools/security-venv
.tools/security-venv/Scripts/python.exe -m pip install slither-analyzer==0.11.3 crytic-compile==0.3.11
$env:VIRTUAL_ENV = (Resolve-Path .tools/security-venv).Path
$env:PATH = (Resolve-Path .tools/foundry-1.8.5-win32-x64).Path + [IO.Path]::PathSeparator + $env:PATH
$env:FOUNDRY_OUT = Join-Path $PWD .tools/security-out
$env:FOUNDRY_CACHE_PATH = Join-Path $PWD .tools/security-cache
$analysisJson = Join-Path $PWD .tools/stage-4-slither.json
Push-Location contracts
& ../.tools/security-venv/Scripts/slither.exe . --json $analysisJson
Pop-Location
```

Use a fresh shell for these process-local environment overrides. On POSIX use the
virtual environment's `bin/` executables and the matching Foundry platform folder.
Slither invokes Forge with build information and skips test/script sources; its
output/cache are isolated from normal artifacts. A findings exit code is expected;
check JSON `success` and review every detector result. An existing JSON output may
need a new filename for a rerun. No detectors or dependency warnings were suppressed.
The [Stage 4 report](stage-4-security-report.md) documents all raw warnings and
compiler-condition checks; the analyzer's result is not a security certification.

## Stage 6 workspace and browser verification

The functional web workspace and signed launch service are documented in
[web README](../web/README.md). Run `npm.cmd run web:local` for fresh local Anvil,
then connect/import the printed owner burner, deposit mock USDC and create a
mandate through the browser. The agent/provider keys remain server-only.

`npm.cmd run web:test:e2e` builds the contracts, agent and production frontend,
then drives Chromium through the real local escrow lifecycle. Install the free
browser first with `node node_modules/playwright/cli.js install chromium`.
The test injected-wallet bridge signs only in Node memory; live wallet extensions
need separate manual verification. Full deadline advancement occurs only in the
local test harness, never in application code. Evidence and screenshots live in
`docs/`; traces, server logs, burner import files and state stay ignored in `.tools/`.

`npm.cmd run test --workspace @flint/web` runs frontend boundary tests and actual
Anvil server integration tests. Preserve the existing agent and Solidity tests.
Repository `npm.cmd run check` also checks formatting, lint, strict TypeScript and
all production builds. Run browser tests separately; they are not part of `check`.

The web build uses Next's supported `--webpack` flag, with the existing server
agent and viem packages externalized. Browser code uses narrow local chain
metadata. Server state requires an absolute `FLINT_STATE_DIR`; no broad repository
filesystem discovery or secret public environment variables are needed.
