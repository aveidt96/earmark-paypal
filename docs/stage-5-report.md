# Earmark — Stage 5 historical report

> Historical identity note: this stage was completed under the provisional Flint name. Earmark was approved in Stage 6.5; historical facts, repository references and technical identifiers below are retained.
> Original recorded stage/report commit: 12c72761918e83158182b9c02e335869a9edec4a.

Date: 8 October 2026 (Africa/Lagos). Repository: `samuelid22/Flint`, branch `dev`.
Starting commit: `57909095bb8993b2ca3b6d1b70d1d6412e36766b`.
Status: **Stage 5 complete. Required checks and local CI-profile regressions passed; commit identity is recorded by Git.**

No external deployment, push, paid inference, real funds, public rename or Stage 6
work. Local compiled-contract instantiation on disposable Anvil is the requested
test fixture. Solidity source, original tests, Foundry profiles and frontend code
are preserved. This is not an external audit or formal compliance certification.

## Files and dependencies

| Area              | Created or modified                                                                                                                                                                       |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime           | New `agent/src/domain.ts`, `errors.ts`, `abi.ts`, `models.ts`, `runtime-config.ts`, `providers.ts`, `chain.ts`, `store.ts`, `tools.ts`, `runner.ts`; updated `agent/src/index.ts` exports |
| Local actors/demo | New `agent/src/local/harness.ts`, `agent/src/local/demo.ts`, `scripts/agent-demo.mjs`                                                                                                     |
| Tests             | New `agent/test/models.test.ts`, `policy.test.ts`, `integration.test.ts`; original configuration and all Solidity/web tests unchanged                                                     |
| Tooling           | Updated root/agent `package.json`, `package-lock.json`, `.gitignore`, `.prettierignore`, `biome.json`, `scripts/forge.mjs`                                                                |
| Documentation     | Updated `README.md`, `agent/README.md`, root/agent `.env.example`, `docs/architecture.md`, `docs/ai-architecture.md`, `docs/development.md`, `HANDOFF`; created this report               |

Added exact `viem@2.57.3` to the agent workspace (already used by web). Reused
`zod@4.6.5`, `vitest@5.0.3`, TypeScript 5.9.3, Foundry 1.8.5, Solidity 0.8.28 and
OpenZeppelin 5.6.1. No model SDK, paid service or new token abstraction. Dependency
installation with ignored scripts succeeded; npm audited 100 packages with zero
vulnerabilities in that install. Tool artifacts, journals and evidence are ignored.

## Architecture and model/tools

`AgentModel.decide(AgentContext): Promise<AgentDecision>` separates proposals from
permission. `MockModel` is explicit deterministic offline mode; `QwenModel` uses
Qwen-compatible function calling with strict Zod-derived input schemas, one tool
per call, bounded time/output and no dependence on hidden reasoning. Missing API
configuration, malformed responses and transport errors fail closed, without
substituting mock decisions. Qwen tests inject HTTP responses; **no live Qwen
inference or real-model prompt-injection resistance was verified**.

The complete model-visible capability list is `getMandate`,
`listApprovedProviders`, `getProviderQuote`, `getVaultBalance`, `getPaymentStatus`,
`requestMandatePayment`, `inspectDelivery`, `acceptDelivery`. Every tool uses
strict runtime argument validation. The model selects a received quote ID and
supplies a concise reason. It cannot supply a destination, amount, token,
contract address, ABI selector, calldata, RPC method or key. The transaction
adapter encodes only the actual existing `requestPayment(bytes32,bytes32,address,
address,uint256)` and `acceptDelivery(bytes32)` calls at the configured vault.

The bounded execution loop clones public observations before giving them to a
model and emits structured source-tagged decisions and observed facts. Receipt
hashes are derived from the signed transaction before broadcast, confirmed by
actual receipts and checked against the expected sender/vault/payment event.
Payment records must match task/request/agent/provider/token/amount before use.
A model-generated transaction claim is never accepted as chain evidence.

## Wallet and configuration protections

Owner, agent, two providers and observer use distinct random in-memory local
burners. Only the agent account is in the narrow signer; model context and tools
contain no owner/provider/observer wallet. Private keys are never logged,
persisted, passed to the model or exposed to the frontend. Invalid key errors are
sanitized. The owner actor alone funds and creates/revokes the mandate.

Runtime requires local chain 31337, loopback HTTP RPC, matching configured and
expected vault address, owner-trusted runtime bytecode hash and payment-token pin.
Actual chain/code/token/current-owner separation are checked at startup and before
signing. The fixture derives pins from its trusted local owner setup; independently
operated instances require an owner-trusted manifest. Credentials stay in private
server configuration. Redirects and credential-bearing URLs are rejected.
Monad Testnet 10143 remains configured as future target metadata; the Stage 5
signer refuses that chain and has no external deployment command.

Default model mode is `mock`, with network disabled. Live Qwen requires explicit
configuration/network opt-in and separate approval for any paid endpoint. The
adapter supports configured official Alibaba host patterns or a loopback
compatible server. Availability, billing, regional behavior and data retention
must be reviewed before an authorized live run. No secrets are in examples.

## Providers, delivery and autonomy

DataHub offers a deterministic `weather-v1` dataset for 6,000,000 mock-USDC units;
WeatherCo offers an equivalent one for 8,000,000. Both exact addresses are approved
in the owner's 10,000,000-unit mandate. Quotes bind provider ID, task, token,
integer price, quote ID, expiration and deliverable commitment. Destinations come
from the trusted registry and actual mandate membership, never quote prose.

The agent loads its mandate, authorization and available liquidity, gets both
quotes, compares suitability/price, selects DataHub in the mock policy, requests
real escrow, observes its receipt and payment ID, obtains simulated delivery,
checks structure/identifiers/commitments against actual provider submission, then
accepts through the real agent account. It reports the mandatory challenge status.
The separate observer can settle only after the full configured window. The demo
checks early settlement failure and explicitly identifies local clock advancement
as a harness operation unavailable to the model.

Inspection requires a bounded weather schema, matching selected task/quote/provider
and actual payment ID, and keccak256 of schema-normalized JSON matching the quote,
onchain commitment and any nonzero owner-trusted hash. This proves configured
byte/structure checks, **not semantic truth or usefulness**. Offchain quote policy
and expiration are not independently enforced by TaskVault. The contract does
not attest to natural-language task correctness.

A malicious provider-description fixture asks for key export, withdrawal and
recipient substitution. The actual deterministic mock policy ignores the text
and completes a permitted purchase; the test records that observed behavior.
The Qwen unit test verifies system/data separation with synthetic responses; it
does not invent a live Qwen refusal. Full model attacks remain Stage 7 work.

## Idempotency and reliability

An owner-trusted stable purchaseKey identifies the logical intent. Its key hashes
version, chain, vault, normalized task hash, agent and purchaseKey. Request ID
additionally binds the selected quote. One journal stores immutable intent/quote,
genesis and payment IDs, and signed transaction hashes/nonces/receipt states.
Different quote retries conflict; legitimate new purchases need a distinct trusted
purchaseKey. The journal is exclusively locked, fsynced and atomically replaced;
no raw signed transaction or private key is stored.

Transport retries are disabled. The signed transaction's hash/nonce are durably
recorded **before** broadcast. A timeout or uncertain response never triggers an
automatic resend or fresh ID. Restart reconciles request and acceptance receipts
and exact escrow state. Already accepted/completed/refunded records are observed
without another payment. Unresolved or reverted attempts stop for operator review.
Lost response after an actual send, receipt-query timeout, pre-broadcast failure,
acceptance response loss and real transaction reversion are tested separately.

Final review found and fixed an application casing defect: deriving the intent
from the unnormalized original task hash allowed equivalent uppercase input to
create another payment under a larger mandate. A real-Anvil regression reproduced
two distinct payments before the fix and verifies the same ID/zero rebroadcasts
after normalization. This was not a contract-cap bypass. The review also corrected
the Forge wrapper's cwd so root commands consistently load the existing Foundry
configuration; no compiler workaround or test weakening was used.

Idempotency is local application reliability, **not a defense against a compromised
signing key** creating fresh requests within the mandate cap. Different journal
files/external signers, state loss/tampering, stale locks, filesystem failures,
nonce replacement and reorgs need operational reconciliation. Windows ACLs are
operator-managed; file modes are not a secret-storage guarantee. One local
confirmation is used, not a production finality policy. Never delete a journal
or change purchaseKey to resolve an uncertain financial attempt blindly.

## Onchain demonstration evidence

One successful mock-mode run on disposable Anvil 31337:

| Fact                        | Actual local value                                                            |
| --------------------------- | ----------------------------------------------------------------------------- |
| Vault                       | `0x49ae883bfe86d9cb2f147170212386edbd74c636`                                  |
| MockUSDC                    | `0x698fd5728a9adf3903e8d1a2c00288c856ee10b8`                                  |
| Owner                       | `0x9d02F59fd2ad40fCe291b58Cb5e4A9C40A55bb98`                                  |
| Dedicated agent             | `0xd03fF1286c66BE231A77fF1260D9C045332eA437`                                  |
| Selected offer              | DataHub; 6,000,000 base units = 6 mock USDC                                   |
| Payment ID                  | `0xbab31e5c3ea2840056fd4b063a12f87010c914ce57a2872430f6870a3bcccba8`          |
| requestPayment receipt      | `0x22c4f024290e286cd06ebf280b10178ef7e04093bd9dd7881210f280d77f369f`, block 7 |
| Provider submission receipt | `0x52161880878e763cbf968e281ffbbe06c96dbf06cf04c1fbcaa6bda29c6f9c55`          |
| acceptDelivery receipt      | `0xef1c4fea971ca882df5e2de1c99ca18086f6cdca757fc5c5c16677e88687a84f`, block 9 |
| Settlement receipt          | `0x42c24d64322c5ab88bcef9c3fea04d3fc52a77bba6adaf915ef867b765a51cc2`          |
| Final status                | COMPLETED; early settlement rejected                                          |
| Authorization failure       | Revoked mandate: MANDATE_INACTIVE_OR_EXPIRED before signing                   |

These are actual local receipts, not fabricated model output or public network
transactions. The disposable chain has stopped, so no public explorer evidence
exists. The ignored `.tools/stage-5-demo-evidence.json` and JSON-line log record
this run; rerunning creates new addresses/hashes. Integration assertions verify
no provider payout before settlement, available liquidity 14 USDC while 6 is
reserved, then mandate reserved 0/settled 6 and provider credit 6 after settlement.

## Verification

| Command                                           | Observed result                                                                                           |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `npm install --ignore-scripts --cache .npm-cache` | Passed; 100 audited packages, zero reported vulnerabilities                                               |
| `npm run agent:demo`                              | Passed; actual local reservation/submission/acceptance/full-window settlement and revoked-mandate failure |
| `npm run typecheck --workspace @flint/agent`      | Passed                                                                                                    |
| `npm run test --workspace @flint/agent`           | Initial 84 then expanded 89 passed; final root suite has 90                                               |
| Focused canonical-intent regression               | Reproduced failure before normalization; passed afterward                                                 |
| `node scripts/forge.mjs build`                    | Passed through corrected wrapper; existing lint warnings unchanged                                        |
| `node scripts/forge.mjs test`                     | 176 passed; zero failed/skipped; 11 suites, 38.31s                                                        |
| `node scripts/forge.mjs fmt --check`              | Passed                                                                                                    |
| `npm run check`                                   | Passed formatting, lint, types, all tests and all production builds                                       |
| CI-profile `node scripts/forge.mjs test`          | 176 passed; zero failed/skipped; 484.46s                                                                  |

Final root suite: **271 results passed**: 176 Solidity, 90 agent (29 actual-Anvil
integration + 58 new policy/model/journal unit cases + 3 preserved configuration
cases), and 5 preserved web cases. Agent suite finished in 30.25s; root Solidity
run finished in 66.79s under concurrent local checks. No tests were skipped or
weakened in the final full suites. Contract/agent declaration/web production builds
passed. Biome checked 41 files with no warnings; Prettier and Forge formatting
passed. Existing contract timestamp/provider-loop warnings are documented Stage 4
findings, with no suppressions added.

Default Solidity fuzzing: nine properties × 256 = 2,304 cases. Two stateful
campaigns: 64 × 64 each = 8,192 generated calls total, zero handler reverts/invariant
failures. These are bounded regression results, not formal proofs. CI profile also passed:
nine properties x 1,000 = 9,000 fuzz cases (seed 0x10143); two campaigns x 256 runs
x 128 calls = 65,536 generated calls, zero invariant failures, unexpected handler
reverts or discards. Deterministic successful-transition/attack coverage assertions
passed. No remote GitHub workflow result is claimed.

Root Forge initially failed because the wrapper inherited the wrong cwd and missed
the optimizer/configuration; it passed after canonical cwd correction. Earlier
TypeScript compatibility/declaration errors and lint warnings were fixed without
weakening assertions or changing compiler settings. See HANDOFF for attempts and
rerun evidence. No extra successful test totals are fabricated from skipped cases
in the intentionally focused before/after regression commands.

Required scope includes normal purchase and both valid offers; missing/expired/
revoked/wrong-agent/provider authority; cap/liquidity failures; invalid/timeout model
and provider; strict tools and malicious quote content; uncertain/reverted RPC
outcomes and receipt recovery; duplicate/completed/conflicting intents; trusted new
purchases; incorrect delivery and permissionless timeout refund; bytecode startup
pin; post-revocation existing escrow. Existing Solidity tests remain unchanged.

## Remaining risks and next-stage boundary

The owner remains trusted dispute authority and must monitor the full challenge
window. Bad agent acceptance with no timely owner dispute can pay for inadequate
work. A compromised agent key can spend up to the immutable cap via fresh IDs.
The conventional approved-token assumptions, freezing/rebasing risks and all Stage 4
limitations persist. Provider simulations are in-process fixtures, not authenticated
remote services. No production keeper, distributed journal, hardware/managed key
storage, owner monitor, reorg policy or service authentication is implemented.

No live Qwen or Monad execution was verified. Local Cancun integration is separate
from Foundry's MonadNine-configured contract suite and does not prove network parity.
The frontend is unchanged. Stage 6 requires separate approval. Any future work must
preserve the eight-tool boundary and existing onchain security model, design the
owner monitoring/operational wallet boundary, and validate deployment/finality and
provider authenticity before real-value use. No claim of production readiness.

## Run and commit identity

See [agent README](../agent/README.md) for complete Windows PowerShell instructions.
From root after setup, run `npm.cmd run agent:demo` (explicit mock mode),
`npm.cmd run agent:test:integration`, and `npm.cmd run check`.

The final commit must be local on `dev`. A commit cannot contain its own hash;
resolve this report's commit with:

```powershell
git show --no-patch --format=%H 12c72761918e83158182b9c02e335869a9edec4a
```

The completion response records the exact resulting hash. Do not push, deploy,
change main or begin Stage 6.
