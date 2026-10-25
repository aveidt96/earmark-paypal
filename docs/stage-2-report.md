# Earmark — Stage 2 historical report

> Historical identity note: this stage was completed under the provisional Flint name. Earmark was approved in Stage 6.5; historical facts, repository references and technical identifiers below are retained.
> Original recorded stage/report commit: 80068616bea2f586b3130c611ab6bacdab850dda.

Date: 8 October 2026 (Africa/Lagos). Working branch: `dev`.
Foundation: `74efd98`; existing handoff commit `4aa7880` was preserved.
Status: Stage 2 complete. Implementation, local verification, and scope review passed. No deployment, push, or Stage 3 work.

## Files created or modified

Created:

- `contracts/src/TaskVault.sol`
- `contracts/test/TaskVault.t.sol`
- `contracts/test/TaskVaultTokenSafety.t.sol`
- `contracts/test/helpers/VaultTestBase.sol`
- `contracts/test/mocks/MockUSDC.sol`
- `contracts/test/mocks/AdversarialTokens.sol`
- `docs/stage-2-report.md`

Modified:

- `docs/architecture.md`: replaces gross-commitment/full-cap-allocation proposals
  with the user-approved reserved-plus-settled cap and shared liquidity model.
- `README.md`, `contracts/src/README.md`, `docs/development.md`: current contract
  scope, testing commands, architecture/report links, and Stage 3 boundary.
- `HANDOFF`: continuing per-action record, decisions, inspection, checks, and results.

No frontend, agent source, dependencies, lockfile, Foundry configuration, or CI
configuration changed. Existing toolchain and configuration tests are preserved.

## Contract API

| Function                                                                       | Behavior                                                                                                                                                                                  |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `constructor(initialOwner, approvedToken)`                                     | One immutable conventional ERC-20, initialized owner and zero global liabilities.                                                                                                         |
| `createMandate(taskHash, agent, token, cap, expiry, providers, terms)`         | Owner-only immutable snapshot; unique nonzero task hash, positive cap/durations, future expiry, valid distinct agent, supported token, nonempty unique providers. Does not reserve funds. |
| `revokeMandate(taskHash)`                                                      | Owner-only; deactivates future authorization without deleting historical terms or counters.                                                                                               |
| `deposit(token, amount)`                                                       | Owner-only SafeERC20 funding; positive exact incoming balance delta.                                                                                                                      |
| `withdraw(token, recipient, amount)`                                           | Owner-only withdrawal of unreserved funds; validates recipient, liquidity, and exact outgoing vault debit.                                                                                |
| `checkAuthorization(taskHash, provider, token, amount)`                        | Non-binding read-only check for the designated agent; no counters, funds, approvals, or payment records change.                                                                           |
| `_authorizePayment(...)`                                                       | Reusable internal view for future atomic funding; checks all nine required conditions.                                                                                                    |
| `getMandate`, `getDeliveryTerms`, `getApprovedProviders`, `isProviderApproved` | Read-only terms and immutable membership; historical data survives revocation.                                                                                                            |
| `availableBalance`, `totalReserved`, `paymentToken`                            | Approved-token balance less global live liabilities, liability total, and immutable token getter.                                                                                         |
| `transferOwnership`, `acceptOwnership`, `owner`, `pendingOwner`                | OpenZeppelin two-step ownership administration.                                                                                                                                           |
| `renounceOwnership`                                                            | Disabled to prevent orphaned owner-controlled funds.                                                                                                                                      |

Lifecycle events cover creation, immutable delivery terms, provider snapshots,
revocation, deposits, and withdrawals. Custom errors identify invalid conditions.

## Storage and accounting

The requested Mandate struct is used exactly: taskHash, agent, token, uint128 cap,
reserved, settled, uint64 expiry, and active. A unique task hash keys each mandate
and can never be reused after revocation or expiry. The task hash is an identifier
or commitment, not proof of natural-language task compliance.

Per-task delivery terms store nonzero delivery and owner-challenge durations plus
an optional trusted deliverable hash. Provider membership and enumeration are
copied once. No permission-term editing API exists. Revocation only changes active.
Future escrow lifecycle operations may change reserved/settled as accounting,
without changing permission terms.

For the single immutable token:

```text
mandate.reserved + mandate.settled <= mandate.cap
totalReserved = sum(all mandates' live reserved amounts)
totalReserved <= actualTokenBalance
availableBalance = actualTokenBalance - totalReserved
```

Production Stage 2 has no writer for live reservations or settled amounts;
all counters remain zero. Creating a mandate neither guarantees funding nor
reduces available liquidity. Multiple read-only checks can pass for the same
liquidity and cannot be treated as consumable payment approvals.

The user-approved future refund policy decreases reserved on both per-task and
global ledgers, leaves settled unchanged, and restores cap headroom/free liquidity.
Seeded accounting tests check these hypothetical states and cross-task liquidity;
they are not an escrow, refund, or settlement implementation. The state-seeding
and internal-check exposure functions exist only in the test subclass.

Compiled storage inspection confirms five slots per Mandate (160 bytes) and two
per DeliveryTerms. Cap/reserved share one slot; settled/expiry/active share another.
The uint256 token-global total is separate from per-task storage. The production
ABI has 17 functions and no reservation, settlement, refund, arbitrary-execution,
ERC20 transfer/approval, or test-harness writer. Runtime bytecode is 6,894 bytes.

## Security protections and trust

- OpenZeppelin 5.6.1 Ownable2Step, SafeERC20, and ReentrancyGuard; Solidity 0.8.28.
- Financial mutation entry points are owner-only and guarded, with the guard first.
  Financial views reject callbacks during guarded interactions.
- Exact incoming balance verification rejects detected fee-on-transfer funding;
  exact outgoing vault debit rejects excess-debit behavior. SafeERC20 rejects
  false return values and supports conventional no-return tokens.
- Checks precede token interactions; no premature internal deposit credit exists;
  reverts roll back movements. Withdrawals do not alter escrow liabilities.
- Immutable token, per-task provider membership, non-reusable task IDs, fixed
  agent/cap/expiry/delivery terms; no arbitrary call, unrestricted transfer,
  agent withdrawal, provider payment, or agent/provider ERC-20 approval API.
- Positive amounts, nonzero/valid addresses, exact expiry boundary, widened cap
  arithmetic, overflow-safe headroom checks, and insolvency fail-closed behavior.
- No proxies, upgrade administrator, signed requests, live keys, model/provider
  integration, real funds, broadcasts, or network deployment.

Two-step ownership reduces accidental transfers, but an accepted ownership
transfer deliberately grants full owner authority, including if the new owner
was previously an agent. Owner compromise remains a trust risk. Token vetting
is required; code presence and balance-delta checks cannot certify arbitrary
malicious, rebasing, upgradeable, fee-changing, or blacklisting tokens.

References: [OpenZeppelin ownership](https://docs.openzeppelin.com/contracts/5.x/access-control),
[SafeERC20](https://docs.openzeppelin.com/contracts/5.x/api/token/erc20),
[ReentrancyGuard](https://docs.openzeppelin.com/contracts/5.x/api/utils#ReentrancyGuard).

## Verification results

Pinned local Foundry 1.8.5 was used from `contracts/` with no fork or RPC:

| Command                        | Result                                                                                                     |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `forge build`                  | Passed, Solidity 0.8.28; initial compile 26 files.                                                         |
| `forge test -vvv`              | Initial implementation: 73 tests passed, zero failures/skips.                                              |
| `forge test -vvv --gas-report` | After review improvements: 77 tests passed, zero failures/skips.                                           |
| `forge fmt --check`            | Passed after formatting.                                                                                   |
| `npm run check`                | Passed: formatting, lint, agent/web types, all 85 tests, contracts/agent builds, and production web build. |

`FOUNDRY_PROFILE=ci forge test --match-test testFuzz -vvv` also passed all three
properties at 1,000 runs each with the configured fixed seed. The profile was
restored afterward. `forge inspect TaskVault storage-layout --json`, production
ABI review, and runtime bytecode inspection passed. The repository test total
is 85: 77 Solidity plus three agent and five web tests. The production Next.js
build prerendered `/` and `/_not-found` without frontend changes.

The 77 Solidity tests comprise 69 mandate/vault tests (including three fuzz
properties, 256 runs each), six adversarial-token safety tests, and the two
preserved compiler/dependency smoke tests. Tests cover every required acceptance
and rejection case plus exact boundaries, max-width arithmetic, ownership
transfer, direct token donations, zero approvals, no production reservation API,
immutable provider isolation, read-only repeated checks, global reservations,
refund snapshots, insolvency, and rollback of unsafe token transfers.

Forge emits four advisory warnings: two required timestamp comparisons and two
per-provider validation reverts recognized interprocedurally inside creation's
loop. Expiry necessarily uses block timestamps; provider invalidity must revert
atomically. Both are reviewed and documented, with no global warning suppression.
Earlier warnings for modifier order and uninitialized reserved state were fixed.

## Gas observations

The local Monad-configured Foundry report observed one two-provider production
mandate creation at **383,755 gas** and one successful production authorization
check at **77,982 gas**. A view check called via eth_call does not charge a
transaction fee. The test report's deployment-cost cell was zero and is not
usable as a deployment estimate. Gas attribution may include inherited test
harness methods; the production ABI is reviewed separately.

These are local scenario observations, not Monad Testnet measurements, fee
quotes, or an optimized/audited gas guarantee. Provider creation cost scales
with the owner-chosen list size; authorization membership lookup is constant-time.

## Known limitations

- No escrow exists. The view check cannot strand funds, reserve capacity, or
  guarantee later funding. Counters are only prepared storage until Stage 3.
- No signatures/meta-transactions, replay-protected payment IDs, delivery verifier,
  challenge/dispute execution, arbitration, partial payouts, or timeout refunds.
- Only one vetted conventional ERC-20 is supported per vault. Direct unsupported
  token transfers cannot be prevented and have no recovery API. No native deposits.
- A token charging recipients while debiting the vault exactly may escape the
  outgoing delta check; fee behavior is unsupported and must be vetted out.
- Public task hashes and byte commitments do not enforce semantic task correctness
  or delivery quality. Timing depends on consensus block timestamps.
- No contract deployment, independent security audit, network execution/gas check,
  or remote CI result is claimed. The frontend remains the existing Stage 1 page.
- Existing name/license and future deployment/arbitration decisions remain open.

## Exact work remaining for Stage 3

1. Approve unique payment IDs/nonces, replay semantics, immutable record fields,
   deadline boundaries/limits, evidence rules, verifier/arbitrator identities,
   challenge policy, timeout fallback, and partial outcome semantics.
2. Implement one guarded atomic funding transaction that calls internal
   authorization, checks global liquidity, increments mandate/global reserved
   together, and creates the payment record. Never rely on an earlier view result.
3. Implement settlement/refund exits in the same stage: settle decrements both
   reserved ledgers and increments settled; refund decrements both reserved
   ledgers and leaves settled unchanged. Transfer only to the recorded provider
   or release funds to the original vault, with exactly one finalization.
4. Preserve funded rights after expiry/revocation; implement authenticated delivery,
   optimistic challenge, bounded disputes/timeouts, and transfer-failure rollback.
5. If deferred claim credits are chosen, retain them as global liabilities excluded
   from available funds; the current reserved-only formula is insufficient for
   unpaid credits unless extended explicitly.
6. Add stateful invariants over live payment records and both ledgers, shared-fund
   concurrency, cap exhaustion/refunds, replay, deadline/revocation races,
   adversarial callbacks/tokens, and failed recipient transfers.
7. Review the complete escrow deployment/integration model and security before
   any separate deployment authorization. Stage 2 bytecode is not upgradeable.

Stage 3 is not started and requires explicit approval after this report.
The final local dev commit is identified by `git show --no-patch --format=%H 80068616bea2f586b3130c611ab6bacdab850dda`
and reported in the completion message; no self-referencing hash is embedded here.
