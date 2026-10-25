# Earmark — Stage 4 historical report

> Historical identity note: this stage was completed under the provisional Flint name. Earmark was approved in Stage 6.5; historical facts, repository references and technical identifiers below are retained.
> Original recorded stage/report commit: 57909095bb8993b2ca3b6d1b70d1d6412e36766b.

Date: 8 October 2026 (Africa/Lagos). Repository: `samuelid22/Flint`, branch `dev`.
Starting commit: `5558a356617e3c69754b96d09835e1163d6916f0`.
Status: **Stage 4 complete. Required local verification passed; commit identity is recorded by Git.**

This is a source-level adversarial review and bounded local testing by the project
engineering agent. It is not a professional third-party audit, formal proof,
security certification or formal ERC-8183 compliance assessment. No deployment,
real funds, push, model/frontend integration or Stage 5 work occurred.

## Findings and decision

One confirmed Low defect was reproduced and fixed. No confirmed Critical or High
vulnerability was identified in the reviewed scope. That statement is an outcome
of this review, not a guarantee of absence. Deliberate trust limitations remain.

| ID     | Severity                          | Finding                                                                                                                                                     | Disposition                                                                                                                                                           |
| ------ | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S4-L01 | Low                               | Owner withdrawal accepted recipient-fee shortpayment while emitting the nominal withdrawn amount.                                                           | Fixed; exact recipient-credit check and regression test.                                                                                                              |
| S4-I01 | Informational                     | Fresh request IDs permit identical provider/amount purchases within a mandate. Request-ID idempotency does not identify semantic duplicates.                | Intentional multiple-payment authorization; documented stable purchase-ID requirement and residual agent discretion; tests added.                                     |
| S4-I02 | Informational                     | Previous stateful coverage did not vary agent/provider identities or ownership, and generated call totals alone did not establish successful-path coverage. | Added independent production-API handler, successful-transition counters, deterministic coverage test and varied stateful/fuzz sequences; original campaign retained. |
| S4-I03 | Informational                     | Raw storage getters remain callable during token interactions, although guarded financial views and state transitions reject reentrancy.                    | No current fund-moving consumer bypass found; future composable contracts must not treat combined raw reads as an atomic liquidity certificate.                       |
| S4-R01 | Medium (design risk)              | Bad delivery can settle if the authorized agent accepts and the owner misses the challenge deadline.                                                        | Explicit optimistic trust model; executable negative-delivery demonstration; remains an operational risk.                                                             |
| S4-R02 | Medium (external dependency risk) | A freezing, rebasing or dishonest approved token can break payout liveness or backing outside vault control.                                                | Fail-closed/delta tests expanded; conventional vetted-token assumption retained; no unsafe accepted-payment refund bypass.                                            |

There are no unresolved confirmed Critical/High defects from this review. The
Medium entries are retained trust/dependency risks, not newly found permission or
accounting bypasses. They prevent a blanket production-readiness recommendation.

### S4-L01 reproduction and fix

Start with 100,000,000 token base units and a live 40,000,000 reservation. Change
the test token's outgoing behavior to debit 60,000,000 but credit the owner's
recipient only 59,999,999, burning one unit. Stage 3 `withdraw` returned successfully
and emitted 60,000,000. The new regression failed on the unmodified implementation
with `next call did not revert as expected`; the trace confirmed the short credit.
The remaining 40,000,000 escrow stayed backed. Only the owner could invoke this
operation, so the issue was not an agent drain or theft of locked funds.

`withdraw` now snapshots recipient balance, preserves the original exact-vault-debit
check, and requires recipient credit equal to the requested amount. Detected short
or extra credit reverts the whole transaction, including the token transfer and
its event. This reuses `UnexpectedRecipientBalanceChange`; ABI, storage, ownership,
mandate permissions and payment transitions are unchanged. No unusual token is
newly supported. The original PoC now passes, with both escrow and recipient balances
unchanged after rejection. Positive-credit and true-return-no-op regressions also pass.

### S4-I01 replay and task-scoped idempotency

The existing Stage 3 mechanism is already task-scoped idempotency:

```text
paymentId = keccak256(abi.encode(chainId, vaultAddress, taskHash, agent, requestId))
```

The same nonzero request ID in that domain cannot be reused with changed amount or
provider, or after COMPLETED, REJECTED or EXPIRED. A failed funding attempt creates
no record. Task IDs cannot be recreated to erase history. Another mandate requires
its own designated agent/provider and budget checks; it does not inherit authority.

Different request IDs intentionally authorize separate payments, even with equal
provider and amount. Tests reserve 40 + 40 + 20 against cap 100 and reject one more
base unit. No signed quote, owner-approved unique invoice or on-chain purchase
identity exists. Deduplicating `(provider, amount)` would reject valid repeated
purchases and would not stop an adversarial agent changing amounts. Another redundant
mapping over the same request ID would add no protection.

Future clients must derive one stable `requestId` per intended purchase/quote and
reuse it after uncertain receipts, reconciling the deterministic record first.
A malicious authorized agent can choose fresh IDs within its cap; once-only quote
semantics would require explicit owner-authorized quote identity/terms in a future
reviewed design. This contract guarantees bounded spending, not semantic uniqueness.
No new idempotency API was needed or claimed in Stage 4.

## Threat model and scope

Reviewed production `TaskVault.sol`, every existing Solidity suite/fixture/mock,
Foundry profiles, architecture and Stage 3 report. Assumed hostile agents, providers,
permissionless callers, owner-transfer candidates and token callbacks. Examined
accidental duplicate client requests, malicious outputs, deadline races, finite
integer bounds, direct donations and multiple simultaneous mandates.

The accepted owner is trusted to configure authority, maintain keys and decide
unilateral disputes. The conventional payment token must report honest balances,
transfer exact amounts and preserve them between transactions. Owner compromise,
owner/agent/provider collusion, token issuer actions, chain censorship/reorganizations,
RPC deception, unavailable deliverables and economic service quality are not solved
by a local accounting contract. There are no signatures/relayers, upgrades,
arbitrary executor, agent withdrawals, external models or frontend in scope.

Authorization checks were traced across creation, preflight, funding and every
lifecycle operation. New requests require active unexpired mandate, original agent,
that mandate's exact approved provider, approved token, positive amount, cumulative
headroom and actual shared liquidity. Existing escrow deliberately survives
mandate expiry/revocation. Destination, amount and verification terms stay snapshotted.
The owner cannot change them; rejection releases the whole reservation instead.

## Accounting and lifecycle evidence

The new handler creates genuine production payments; it never writes accounting
storage. It tracks independent token flows, provider receipts, immutable terms and
terminal snapshots. After each generated action the combined campaign checks:

```text
mandate.reserved = sum(live payments for that mandate)
mandate.settled  = sum(COMPLETED payments for that mandate)
mandate.reserved + mandate.settled <= mandate.cap

totalReserved = globalReserved(approvedToken) = sum(all live payment amounts)
totalReserved <= actual approved-token balance
availableBalance = actual balance - totalReserved
actual balance = deposits + donations - withdrawals - completed payouts
```

Live means FUNDED, SUBMITTED or ACCEPTED. Refund/rejection decreases mandate and
global reserved only, restoring liquidity and headroom. Settlement decreases both
reservations and increases historical settled authority before exact transfer.
The handler checks actual credits to all three providers and the withdrawal treasury,
zero agent/provider approvals, ownership/pending-owner ghosts and terminal immutability.
Its completion hook resolves every remaining live payment using public APIs and
requires zero liabilities and one terminal result per payment.

A deterministic three-mandate test interleaves 180 reserved against 200 liquidity,
free withdrawal, owner rejection and re-reservation, another agent's delivery and
settlement, delivery timeout, withdrawal and submitted-review timeout. Other tests
cover non-binding preflight, cumulative refill behavior, external donations and
revocation without stranded escrow. Original Stage 2 accounting-seeding tests
remain historical fixtures only; new tests use the production vault.

The 105-scenario matrix covers seven states x five lifecycle operations x three
cutoff phases. Invalid actions must preserve complete record/financial digests.
Terminal scenarios remain terminal even if their original cutoff is already past.
Original tests and the new matrix jointly exercise exact/before/after boundaries:

| Boundary       | Before                                                   | At / after                                                          |
| -------------- | -------------------------------------------------------- | ------------------------------------------------------------------- |
| Mandate expiry | New valid funding permitted.                             | New funding denied; existing escrow unaffected.                     |
| Delivery       | Designated provider may submit; owner may reject FUNDED. | Submission/rejection denied; anyone may expire FUNDED.              |
| Review         | Original agent may accept SUBMITTED; owner may reject.   | Acceptance/rejection denied; anyone may expire SUBMITTED.           |
| Challenge      | Owner may reject ACCEPTED; settlement denied.            | Rejection denied; anyone may settle; timeout refund remains denied. |

Acceptance starts the full snapshotted challenge period. A pending owner has no
authority; after two-step acceptance the new owner immediately controls existing
disputes without resetting deadlines. Cancellation does not confer authority.
Renunciation stays disabled. Deliberately promoting an agent to owner combines
roles with owner consent; the tests document that trust decision.

Checked casts/uint256 arithmetic were inspected. Tests reach uint128 maximum
reservation/settlement, reject excessive cap arithmetic, reject uint64 deadline
overflow atomically and resolve the last safely representable challenge deadline.
Block timestamps are consensus inputs with inclusion/ordering limits, not exact
wall-clock promises. All resolutions still need a transaction.

## Token, external-call and delivery review

SafeERC20, ReentrancyGuard and financial checks precede/guard interactions.
Settlement effects precede transfer and roll back if transfer fails or either
observed delta is wrong. Withdrawals cannot spend global reservations and now
check both debit and credit. Balance reads use static calls. Unsupported tokens
cannot back approved-token liabilities; unsupported direct transfers remain stuck
because there is no recovery API. Direct approved-token donations add liquidity
without adding mandate authority.

Preserved tests cover false/no-return tokens, fee funding, sender/recipient payout
fees, token freezes, lost backing, same/cross-payment settlement callbacks, refund
callbacks, guarded financial views, genuinely authorized owner withdrawal and
agent request callbacks. New mocks additionally cover successful-return no-ops
and inflated recipient credit on deposit, withdrawal and settlement. Detected
failures revert records/ledgers and remain retryable if conventional behavior returns.
A malicious token can lie about every balance; delta checks cannot certify it.
Guarded financial views are `checkAuthorization`, `availableBalance`,
`globalReserved` and `getPayment`. Raw `totalReserved`/`getMandate` remain readable
inside a token callback and can expose effects before transfer completion. No
current contract consumes those observations to move funds; guarded mutations
block reentry. Future composable consumers must review this boundary explicitly.
Negative rebases/issuer freezes may permanently prevent ACCEPTED settlement.
No administrator timeout-refund path is introduced to change accepted obligations.

A provider commitment is only a byte identifier. An owner-trusted expected hash
requires equality but does not certify availability or useful service. Agent
acceptance is a separate authorization step. Owner rejection is trusted, unilateral
and final before the applicable cutoff. Actual semantic correctness is external.
A targeted test submits a deliberately bad untrusted claim, accepts it as the
agent and demonstrates settlement when no timely owner dispute occurs. Wrong
trusted hashes remain rejected. Providers also face the owner's ability to reject
honest delivery without independent appeal.

## Tests and verification

Toolchain unchanged: Solidity 0.8.28, OpenZeppelin 5.6.1, Foundry 1.8.5,
optimizer 200, legacy pipeline (`via_ir=false`), Cancun bytecode, local
`monad:MonadNine`, chain ID 10143. No network fork or real funds.

| Command / check                                 | Result                                                                                                    |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `forge build --sizes` (includes required build) | PASS; TaskVault runtime 12,968 B, initcode 13,519 B.                                                      |
| `forge test -vvv --gas-report`                  | PASS; 176 results in 11 suites, zero failures/skips.                                                      |
| `forge fmt --check`                             | PASS.                                                                                                     |
| `FOUNDRY_PROFILE=ci forge test -vvv`            | PASS; 176 results, 9,000 fuzz cases, 65,536 generated invariant calls.                                    |
| `npm run check`                                 | PASS; formatting, lint, TypeScript, 176 Solidity + 8 offline tests, contract/agent/web production builds. |
| Free Slither 0.11.3                             | Analysis successful; 11 contracts, 100 detectors, 28 raw findings, all triaged below.                     |

All 148 previous results and original test source remain intact. Stage 4 adds 28
results: 16 SecurityReview (one fuzz), one withdrawal regression, eight token cases,
one combined invariant campaign (three checked properties), one handler coverage
test and one interleaving fuzz property. Nine fuzz properties total run 256 cases
each by default (2,304 cases), 1,000 each in CI (9,000 cases).

Default full gas run: each of two invariant campaigns completed 64 runs x 64 calls
= 4,096; total 128 campaign-runs / 8,192 generated calls, zero invariant failures,
unexpected handler reverts or discards. All 12 old and all 12 new selectors were
exercised. Deliberately rejected inner adversarial calls are checked/caught and
counted separately; they are not unexpected handler reverts.

CI completed with seed `0x10143`: each campaign ran 256 x 128 = 32,768 calls;
combined **512 campaign-runs / 65,536 calls**, zero invariant failures, unexpected
handler reverts or discards. The original campaign took 347.51s and the expanded
suite 438.35s (includes its tests); complete command 438.46s. These are local
observations, not performance guarantees. The 12 selectors in each campaign were
all exercised:

| Original handler action |   CI calls | Expanded handler action |   CI calls |
| ----------------------- | ---------: | ----------------------- | ---------: |
| accept                  |      2,787 | attack                  |      2,706 |
| advanceTime             |      2,748 | create                  |      2,715 |
| create                  |      2,729 | cycle                   |      2,712 |
| deposit                 |      2,727 | deposit                 |      2,729 |
| donate                  |      2,703 | donate                  |      2,772 |
| refund                  |      2,689 | elapse                  |      2,741 |
| reject                  |      2,756 | fund                    |      2,761 |
| request                 |      2,778 | ownership               |      2,714 |
| revoke                  |      2,726 | progress                |      2,753 |
| settle                  |      2,712 | reject                  |      2,698 |
| submit                  |      2,633 | revoke                  |      2,728 |
| withdraw                |      2,780 | withdraw                |      2,739 |
| **Total**               | **32,768** | **Total**               | **32,768** |

All listed selector reverts/discards were zero. An `attack` action succeeds only
when the inner hostile call reverts with the expected selector and the complete
tracked digest remains unchanged.

New generated actions vary three agents, three providers, three possible owners,
amounts, optional trusted hashes, delivery/challenge durations, mandate expiry,
new/revoked tasks, donations and all lifecycle operations. State is bounded to
12 mandates / 256 payments per sequence; these limits belong only to the test
handler. Guarded selections can skip when no eligible action exists. A separate
deterministic coverage assertion reaches requests, submission, acceptance, each
terminal path, ownership acceptance/cancellation and all eight attack categories.
It fails if those paths silently become unreachable.

`generated.*` logs are observed counter snapshots before cleanup, not aggregate
campaign totals. The default full gas run printed 13 requests, 7 submissions,
6 acceptances, 6 settlements, 5 rejections, 4 refunds, 2 ownership acceptances and
8 guarded skips in its final observed handler state. Other sequences differ;
selector totals alone are not successful-transition counts. CI's final observed pre-cleanup snapshot showed 129 counted actions, 20 skips,
21 requests, 11 submissions, 7 acceptances, 5 settlements, 6 rejections, 12 refunds,
10 expected adversarial reverts, 5 ownership nominations, 2 acceptances and 4
cancellations, 11 deposits, 15 withdrawals, 12 donations, 5 revocations,
8 creations and 4 time advances; cleanup resolved 2 remaining escrows. These raw
snapshot counters are not claimed to equal the campaign's 32,768 calls or depth;
use Forge's selector table for campaign totals. Cleanup resolutions are separate.

Raw local logs/JSON remain ignored under `.tools/stage-4-*`; results are recorded
here for durable review. The [development guide](development.md) reproduces commands.
Remote GitHub CI and live Monad execution were not run or represented as verified.

## Static-analysis dispositions

Slither 0.11.3 / crytic-compile 0.3.11 (local Python 3.13.0rc2) ran in ignored `.tools/security-venv`;
no application dependencies changed. Its `solc-select` cache was directed into that
venv using supported `VIRTUAL_ENV` after an initial global-cache permission error.
Forge build-info/output/cache were isolated in `.tools/security-{out,cache}`.
Tests/scripts were excluded by the analyzer's normal Foundry compilation; no
detector/dependency warning was suppressed. The findings exit status was nonzero,
while JSON `success=true`; this is not an analyzer failure or a warning-free pass.

| Detector            | Raw severity / count | Reviewed disposition                                                                                                                                                                                                                                                     |
| ------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| uninitialized-local | Medium / 2           | `rejectPayment.deadline` and `refundExpired.deadline`: every permitted state assigns the applicable deadline; every other state reverts. No successful uninitialized read. Matrix tests include absent/terminal states.                                                  |
| unused-return       | Medium / 1           | Funding's final SafeCast intentionally checks the latest possible challenge bound; only its revert side effect is needed. Original overflow-rejection and new last-safe-boundary tests verify this.                                                                      |
| missing-zero-check  | Low / 1              | OZ Ownable2Step intentionally permits zero to cancel nomination. Current owner remains, pending address cannot accept; renunciation disabled. Cancellation/unauthorized-acceptance tests verify it.                                                                      |
| timestamp           | Low / 7              | Mandate creation/authorization, submission, acceptance, rejection, settlement and refund intentionally compare deadlines. Strict `<` actions and `>=` resolutions are complementary; minimum durations 1h. Timestamp/inclusion risk remains documented.                  |
| assembly            | Informational / 13   | OZ StorageSlot overloads (9), SafeERC20 transfer/transferFrom/approve helpers (3), SafeCast bool helper (1). Reviewed dependency code; not arbitrary executor access. Some library functions are unreachable from TaskVault. Tokens remain untrusted external contracts. |
| pragma              | Informational / 1    | Dependency compatibility ranges differ, but one pinned compiler compiles the complete graph. No mixed compiled artifact versions.                                                                                                                                        |
| solc-version        | Informational / 3    | Broad OZ/interface pragmas allow historical versions; actual build is pinned 0.8.28. Historical bugs listed by these warnings are fixed in that compiler; current known conditions reviewed separately below.                                                            |

Forge's build warnings about timestamps have the same disposition. Its provider-loop
`require-revert-in-loop` warnings concern deliberate invalid/duplicate rejection
inside owner-only mandate creation, with no external interaction or payment-resolution
loop. Large owner-supplied lists can exceed transaction gas and revert atomically;
resolution work does not depend on list length. A new test-only cross-`vm.warp`
timestamp observation warning was corrected with `getBlockTimestamp`, preserving
all matrix expectations; no warning suppression was added.

### Pinned compiler applicability

The [official per-version metadata](https://raw.githubusercontent.com/ethereum/solidity/develop/docs/bugs_by_version.json)
lists six known bugs for 0.8.28. Their
[documented trigger conditions](https://docs.soliditylang.org/en/latest/bugs.html)
were checked against actual configuration and production/imported source:

| Known condition                                    | Applicability to this build                                                                                                                         |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| MisorderedNamedParametersInRequireWithCustomErrors | IR-only; `via_ir=false`.                                                                                                                            |
| SpillSlotCollisionAcrossMutualRecursion            | IR-only; disabled.                                                                                                                                  |
| UnsoundSpillInMutualRecursion                      | IR-only; disabled.                                                                                                                                  |
| TransientStorageClearingHelperCollision            | IR-only; disabled; guard uses persistent storage.                                                                                                   |
| MemoryByteArrayElementDeleteClearsWholeWord        | No production/imported `delete` of memory-byte elements; reviewed deletion clears pending-owner address.                                            |
| LostStorageArrayWriteOnSlotOverflow                | No custom end-of-storage array layout; owner lists use standard hashed storage. Triggering wraparound placement is computationally infeasible here. |

The compiler pin was preserved as requested. No reachable instance was identified;
future compiler/pipeline/source changes must repeat this applicability check.
This is not a claim that 0.8.28 is free of known bugs.

## Gas impact

The same isolated conventional-token test funds 100, reserves 40, then withdraws
60 to a fresh recipient, using identical pinned compiler/VM settings before/after.
Observed `withdraw` gas: **106,779 -> 108,765**, increase **1,986 (~1.86%)**.
Two extra token balance reads and delta checks add that cost. The fixture test
itself changed 767,614 -> 769,600 gas. Mixed full-suite reports include failing,
callback, warmed-state and snapshot scenarios; their medians are not clean successful
transaction benchmarks or network fees. No production settlement/funding logic changed.

`forge build --sizes`: runtime **12,604 -> 12,968 B** (+364), initcode
**13,141 -> 13,519 B** (+378). The after build remains below conventional EVM
code-size limits as well as the configured local chain limits. Gas-report deployment
size/cost fields are not used as deployment benchmarks. No deployment occurred.

## Files and reproducibility

Modified:

- `contracts/src/TaskVault.sol`: exact owner-withdrawal recipient credit and NatSpec.
- `docs/architecture.md`: corrected transfer guarantee, purchase-ID semantics and review evidence.
- `docs/development.md`: both campaigns, coverage interpretation and free analyzer commands.
- `README.md`, `contracts/README.md`, `contracts/src/README.md`: current scope/API guidance and Stage 5 boundary.
- `HANDOFF`: every inspection, action, failure/recovery, design decision and verification.

Created:

- `contracts/test/SecurityReview.t.sol`: matrix, replay, roles, boundaries, max integers and interleaved accounting.
- `contracts/test/WithdrawalSecurity.t.sol`: reproduced-before/passing-after regression.
- `contracts/test/TokenReview.t.sol`, `contracts/test/mocks/ReviewToken.sol`: hostile exact-delta and donation cases.
- `contracts/test/helpers/SecurityHandler.sol`: real API, varied roles/terms, independent flows and coverage counters.
- `contracts/test/SecurityInvariant.t.sol`: combined properties, deterministic handler coverage and fuzz interleaving.
- `docs/stage-4-security-report.md`: this report.

No original Solidity test/fixture/mock, dependency/lockfile, Foundry profile, application,
environment example or CI workflow was changed. Production declaration/diff and preserved-source checks passed. Exactly the 14 listed source/test/documentation files are eligible for the local commit; tooling, artifacts, logs and dependencies remain ignored. Commit identity is resolved from Git:

```sh
git show --no-patch --format=%H 57909095bb8993b2ca3b6d1b70d1d6412e36766b
```

A commit cannot embed its own final hash. The completion message will give the exact
local commit and verify its parent is the specified starting commit.

## Remaining risks and deployment assessment

**Not recommended for production or real-value deployment from this review alone.**
All required checks passed. Local development can continue with separate approval
for Stage 5. No deployment is authorized or performed.

Before any deployment: independently review the finished contract, verify the exact
chosen token/issuer/upgrade/freezing assumptions, validate bytecode and transaction
behavior on the intended chain, define key custody/ownership handover and continuous
owner challenge monitoring, and review stable-ID/receipt-reconciliation behavior.
No token address, real USDC support, external audit or operational keeper is certified.

Residual risks include trusted unilateral owner disputes, accepted bad output with
an offline owner, compromised agents consuming remaining capped authority with fresh
IDs, repeated refunded reservations causing time/gas grief, frozen/lying/rebasing
tokens, unrecoverable unsupported donations, public delivery/rejection metadata,
consensus timestamp/transaction inclusion limits and chain/RPC/reorganization behavior.
Bounded fuzzing and mocks cannot enumerate all sequences, token implementations,
compiler faults or economics. No formal verification, symbolic proof, mainnet fork,
remote CI pass, live network benchmark or third-party audit was performed. Stage 5
requires explicit approval and has not begun.
