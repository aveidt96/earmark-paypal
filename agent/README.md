# Earmark PayPal — preserved agent runtime

This guide documents the inherited EVM adapter and authorization behavior.
Gemini/Mock/Qwen infrastructure is preserved. See
[PayPal integration architecture](../docs/paypal-integration.md) for the upcoming
provider-neutral boundary; no PayPal payment client has been implemented.

## Original Earmark agent runtime

Stage 5 implements a server-side tool loop with a replaceable `AgentModel`, a
strict Qwen function-calling adapter and an explicit deterministic mock adapter.
A genuine Google Gemini function-calling adapter (`GeminiModel`, native
`generateContent`) is available on the isolated `feature/gemini-safe-rollout`
branch only: it is disabled by default behind the backend-authoritative
`EARMARK_GEMINI_ENABLED` switch, reuses the exact restricted tools and journal,
and has no live-inference evidence yet. Only mock mode has been exercised
against the local contracts. No paid inference or external deployment is
required or authorized by the demo.

## Run locally (Windows PowerShell)

From the repository root, use Node 22.x and npm 10/11:

```powershell
npm.cmd ci
npm.cmd run setup:contracts
$env:AGENT_MODEL_MODE = 'mock'
npm.cmd run agent:demo
npm.cmd run agent:test:integration
npm.cmd run check
```

`npm.cmd` avoids PowerShell's optional script execution-policy restriction. No
wallet extension, API subscription, environment file or real tokens are needed.
The script compiles the existing contracts, starts the pinned Anvil binary on a
random loopback port (31337, Cancun, no fork), creates random development burners
in memory, and instantiates compiled MockUSDC and TaskVault on that disposable
chain. The owner actor mints/deposits mock USDC and creates an immutable 10 USDC
mandate approving both provider addresses. The agent receives no owner authority.
Anvil stops in `finally`; each demo is a new chain, vault and trusted purchase.

The agent compares DataHub's 6 USDC and WeatherCo's 8 USDC deterministic weather
quotes, normally chooses DataHub, reserves through real `requestPayment`, observes
the receipt/escrow, inspects the provider's delivered artifact and real submission,
and calls real `acceptDelivery`. It reports the active one-hour challenge window.
The demo first verifies that early settlement fails. A separate local harness
advances Anvil time to the full deadline and an observer settles. Clock control,
owner setup, provider signing and settlement are **not agent tools**. The demo
also verifies a revoked-mandate authorization failure before signing.

JSON-line events identify `application`, `model`, `simulated-provider` and `onchain`
sources. `.tools/stage-5-demo-evidence.json` contains public receipt hashes and
payment identity; `.tools/stage-5-state/` holds ignored idempotency journals.
Random keys are never printed, saved or supplied to the model. Public hashes
refer to the disposable local chain and have no public explorer links.

## Runtime boundaries

```text
trusted task + pinned chain/vault/token + trusted provider registry
                          |
               AgentModel.decide(context)
                          |
                  strict Zod decision
                          |
                  eight validated tools
                          |
      quote / mandate / liquidity / delivery validation
                          |
       durable intent journal -> narrow viem signer
                          |
           existing TaskVault authorization/escrow
```

`domain.ts` exports `AgentModel.decide(AgentContext): Promise<AgentDecision>`.
Decisions are one tool call or a structured finish with a concise summary; no
hidden chain of thought is requested, used or logged. A bounded loop clones the
context before giving it to the model. `ai/types.ts` and `parseAgentConfig` retain
the Stage 1 compatibility surface; execution uses the new strict runtime types.

The complete model-visible capability list is:

- `getMandate({})`
- `listApprovedProviders({})`
- `getProviderQuote({ providerId })`
- `getVaultBalance({})`
- `getPaymentStatus({})`
- `requestMandatePayment({ quoteId, reason })`
- `inspectDelivery({})`
- `acceptDelivery({})`

Unknown keys and tools fail validation. The model cannot specify an address,
recipient, token, amount, ABI, calldata, RPC method or private key. Only a validated
cached quote ID selects an offer. The trusted registry resolves its exact
recipient and the actual mandate verifies membership. The chain adapter encodes
only `requestPayment(bytes32,bytes32,address,address,uint256)` and
`acceptDelivery(bytes32)` at the configured vault. Its client/account/signing
objects are private. Fixture owner/provider/observer wallets are outside the
agent runtime; they are not exported into model context or exposed through tools.

`parseRuntimeConfig` accepts server environment only. It pins chain 31337, a
loopback HTTP RPC with no credentials/query/redirects, matching configured and
expected vault addresses, expected runtime bytecode hash and approved token.
Startup and each signing operation verify actual chain/code/token and that the
agent differs from the current owner. Keys must be valid secp256k1 scalars; errors
are sanitized. The local fixture derives trusted pins from its owner-created
instance. An independently operated instance must get pins from a trusted owner
manifest, **not from model/provider text or an untrusted RPC alone**. There is no
network deployment or external-chain broadcasting entry point in Stage 5.
Monad Testnet metadata (10143) remains available for a separately authorized stage.

## Qwen and environment conventions

See `.env.example` for all server variable names. No agent environment file is
loaded automatically; inject variables through the server process or an explicitly
chosen server-only loader. Never copy secrets into `NEXT_PUBLIC_*` or web config.
Default `AGENT_MODEL_MODE=mock` is clearly logged and needs no API key.

`AGENT_MODEL_MODE=qwen` requires `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL` and explicit
`AI_ENABLE_NETWORK=true`. Enabling a paid endpoint requires separate budget
approval; no live inference was performed in this stage. The adapter supports
Alibaba compatibility endpoints or an explicitly configured loopback compatible
server. Remote hosts are restricted to listed DashScope/Model Studio host patterns;
redirects and credential-bearing URLs are rejected. Model availability, regional
configuration, billing, data retention and live tool compatibility are unverified.

The adapter sends one strictly validated function call at a time with eight JSON
schemas, disables thinking output and parallel calls, and bounds API/model time.
Malformed/extra/unknown calls, unstructured finishes, HTTP failures and timeouts
fail closed. A Qwen failure never silently switches to mock mode. Unit tests use
injected synthetic HTTP responses; they do not demonstrate actual Qwen behavior.

## Quotes and delivery

Simulated providers return strict structured task/token/price/quote/expiry/hash
fields. Prices use exact six-decimal integer base units. Validation checks budget,
provider/task/token/currency/expiry, nonzero commitment and optional owner-trusted
hash before signing. Quotes contain no payable recipient field. Provider text is
untrusted user data, separated from model system instructions. Providers have no
HTTP/URL execution capability in this MVP.

Delivery must contain the selected quote and actual payment IDs, matching task and
provider, and a `weather-v1` Celsius dataset with bounded numeric rows. The canonical
schema-normalized JSON's keccak256 must match the quote and actual onchain
submission, including an owner-trusted hash if configured. Acceptance requires a
successful deterministic inspection of that payment/commitment. Invalid output
leaves funds escrowed; existing permissionless timeout rules provide resolution.
Commitment matching and basic schema checks do not prove factual accuracy or
semantic usefulness. Quote signatures/expiration/price association are **offchain
checks**, not additional contract guarantees. `taskHash` is not semantic proof.

A malicious-description fixture asks for withdrawal/key export/recipient changes.
The integration test records the deterministic mock policy ignoring it and making
a valid purchase; that is actual mock behavior, not a claim of live Qwen prompt
injection resistance. Stage 7 records this limitation and independent backend/contract probes.

## Idempotency and recovery

One trusted owner-assigned `purchaseKey` identifies a logical purchase. The intent
key hashes version/chain/vault/task/agent/purchaseKey; request ID additionally binds
the selected quote ID. The journal persists immutable quote, request/payment IDs,
genesis hash, locally derived signed transaction hashes/nonces and receipt states.
Different quotes under the same intent conflict; a genuine new purchase requires
a distinct trusted purchaseKey. Retries never manufacture a new request ID.

The journal uses an exclusive lock, fsynced temporary file and atomic replacement.
Hash and nonce are persisted **before** broadcast; no private key or raw signed
transaction is saved. Transport retries are disabled. After an uncertain result,
restart with the same chain, wallet, task, purchaseKey and journal. The runtime
looks up the existing receipt and exact escrow binding before any further action.
It can continue after a mined request or acceptance, or report a completed/refunded
payment without sending again. Even a transaction that may never have reached the
node is not blindly resent. An unresolved or reverted attempt stops for operator
review. No automatic nonce replacement/cancellation/rebroadcast is implemented.

A stale lock after a crash fails closed: verify no process owns it and reconcile
known hashes/chain state before manual recovery. Do not delete journals to retry.
Use one journal per signing wallet across runners. Independent journal files,
external signers, lost/corrupt/tampered state, filesystem failure or reorgs need
operational reconciliation. File modes are best effort; Windows ACLs and protected
key storage are the operator's responsibility. One local confirmation is used and
is not a production finality policy. Journals are local files, not a distributed
transaction database. A compromised key can still submit fresh IDs within the
immutable mandate cap; application idempotency does not change that loss boundary.

The owner remains the trusted dispute authority and must monitor challenges. An
agent accepting bad delivery and an owner missing the deadline can lead to payout.
The agent cannot settle early, refund accepted payments, change terms or redirect
recipients. No production keeper, owner monitor, secret manager, durable hosted
service, frontend/wallet integration or deployment is included.

## Stage 7 security fixtures

The additive local/security-demo module is a test/recording harness, never an
agent tool or production endpoint. It reuses the unmodified model, tool set,
journal locks and chain adapter. Eight tests execute all scenarios twice and
verify reconciliation, exact receipt outcomes and ledgers. Prompt-injection text
is evaluated by the actual deterministic mock policy; no successful compromise
or live-Qwen behavior is fabricated. Independent impersonation probes belong
only to the disposable Anvil harness. See [demo](../demo/README.md).

## Hosted PostgreSQL adapter

Stage 8A adds IntentJournal-compatible PostgreSQL storage, preserving the eight
agent tools and local file adapter. Testnet runtime requires explicit opt-in,
official RPC and vault/token code pins. Direct TLS sessions hold signing locks;
pre-broadcast transaction hashes are autocommitted and startup recovery only reads
receipts. Never erase uncertain records or use the agent key in another signer.
Hosted deployment/live public E2E remains pending. See
[deployment instructions](../docs/deployment.md) for exact environment names,
Neon production scope, restart behavior and Free hosting limitations.
