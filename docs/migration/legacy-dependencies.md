# Legacy dependency inventory — recorded before migration changes

Source: `https://github.com/aveidt96/Flint.git`, committed revision
`cc20daa06392c588a42925d3844311abac1a067f`. The local source checkout has existing
`HANDOFF` changes and untracked demo media; these are not migration inputs.

## Architecture and dependencies

- npm workspaces: `contracts`, `agent`, `web`; separate `api/src` Node HTTP worker.
- Next.js 16.4.0 App Router (webpack), React/React DOM 19.3.0, TypeScript 5.9.3,
  Tailwind CSS/PostCSS 4.3.3, Vitest 5.0.3, Playwright 1.64.0, Zod 4.6.5.
- Gemini uses the server-side Google REST adapter in `agent/src/models.ts` and
  read-only session tools; Qwen and deterministic Mock adapters are also retained.
- Neon PostgreSQL uses `pg` 8.23.1 and `@neon/config` / `@neon/env` tooling.
- UI: dashboard, mandate creation/list, execution console, payments, activity,
  independent payment resolution, themes, bundled replay and four security demos.

## Monad / Solidity / Foundry / wallet coupling

| Dependency / location                                                                               | Existing responsibility                                                                                     | Migration treatment                                 |
| --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `viem` 2.57.3 in agent and web                                                                      | EVM addresses, hashing, ABI encoding, RPC, typed signatures, signing                                        | Retain; policy and identity logic depend on it      |
| `@openzeppelin/contracts` 5.6.1                                                                     | Ownable2Step, SafeERC20, ReentrancyGuard                                                                    | Retain with original Solidity and tests             |
| Solidity 0.8.28, `contracts/src/TaskVault.sol`                                                      | Immutable mandates, allowlists, atomic reservations, deadlines, dispute/refund/settlement                   | Preserve as legacy authorization reference          |
| `contracts/foundry.toml`, `scripts/{forge,foundry-paths,setup-foundry}.mjs`, `foundry-release.json` | Pinned Forge/Anvil, compiler, fuzz/invariant tests                                                          | Preserve; separate local tool setup required        |
| `agent/src/{chain,config,runtime-config,abi}.ts`                                                    | Loopback Anvil 31337 and opt-in Monad Testnet 10143 execution; code/address pins                            | Preserve; no testnet execution enabled by migration |
| `agent/src/{tools,store,domain,task-identity}.ts`                                                   | Trusted quote binding, exact-unit budgets, deterministic IDs, pre-broadcast journal, receipt reconciliation | Preserve rather than replace with payment stubs     |
| `web/src/lib/{wallet,wallet-types,abi,network,local-chain,payment-resolution}.ts`                   | EIP-1193 / EIP-6963 wallets, ERC-20 approval/deposit, EIP-712 owner launch, contract reads/writes           | Retain and label as legacy wallet experience        |
| `web/src/server/{service,runtime}.ts`, `api/src/{runtime,recovery}.ts`                              | Current-owner verification, expiring single-use signed nonces, worker locks and recovery                    | Preserve existing authority boundary                |
| `web/src/lib/demo/*.json`, `deployments/*.json`                                                     | Historical local and Monad public receipt/address evidence                                                  | Preserve provenance; not PayPal evidence            |
| `scripts/*testnet*`, `scripts/deploy-testnet.mjs`                                                   | Legacy deployment, funding and receipt recovery                                                             | Retain for reference; not executed in migration     |
| `e2e/`, `agent/test/integration.test.ts`, security demo runner                                      | Actual disposable local EVM fixtures and wallet bridge                                                      | Preserve; local mock assets only                    |

Stable internal `@flint/*` package names, `Flint Owner Launch` signature domain,
hash namespaces, `FLINT_*` settings and storage keys remain unchanged to avoid
invalidating authorization or replay identities. Public branding changes separately.

## Database schema and original environment binding

`agent/src/postgres.ts:migrateDatabase` creates `earmark_schema` (v1),
`earmark_environment`, `earmark_workspaces`, `earmark_intents`,
`earmark_launch_nonces`, `earmark_runs`, `earmark_events`, and
`earmark_provider_calls`. Records are scoped, with JSONB workspace/run/event data,
integer base-unit amounts, immutable intent/payment identities and consumed nonces.
Direct (unpooled) Neon connections are required for session advisory locks.

**The original schema and `bindTestnetDatabase` are pinned to Monad 10143 and the
original Neon project/production branch. They must not be used as a PayPal schema
or run against the original database.** A new PayPal database binding, currency
model, authorization ledger and migration are outstanding integration work.

## Agent and authorization

The model proposes one of eight schema-validated tools. Deterministic code binds
task, provider, quote, token, amount, budget, deadlines and delivery commitments.
Only request/accept calls are signed by the agent; owner approval, mandate
creation, withdrawal and dispute authority remain separate. Signed launches use
short-lived, single-use EIP-712 challenges verified against the current owner.
Purchase journals persist identities and transaction hashes before broadcast;
uncertain receipts reconcile without blind replacement or a new purchase ID.

Four original demonstrations: autonomous purchase, provider prompt injection,
invalid delivery, and cumulative budget exhaustion. Deterministic model behavior,
backend blocks and actual local contract reverts are distinct evidence classes.

## Deployment configuration

Original hosting: Next.js on Vercel, fixed-origin proxy to a Render Node worker,
Neon durable state and Monad Testnet RPC/contracts. `render.yaml` points at the
old repository and testnet worker; CI builds/tests on Linux and Windows and sets
up pinned Foundry. Migration will replace the active Render blueprint with a
non-executing PayPal preview configuration while preserving this architecture in
documentation. No deployment is part of this task.
