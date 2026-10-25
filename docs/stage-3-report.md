# Earmark — Stage 3 historical report

> Historical identity note: this stage was completed under the provisional Flint name. Earmark was approved in Stage 6.5; historical facts, repository references and technical identifiers below are retained.
> Original recorded stage/report commit: 5558a356617e3c69754b96d09835e1163d6916f0.

Date: 8 October 2026 (Africa/Lagos). Repository: `samuelid22/Flint`.
Working branch: `dev`. Starting commit: `8006861`.
Status: **Stage 3 complete.** Implementation, all required local verification and
scope review passed; local commit identity is recorded by Git. No push, deployment, real funds or
Stage 4 work. No external audit or formal ERC-8183 compliance is claimed.

## 1. Files changed

Modified:

- `contracts/src/TaskVault.sol`: payment records, lifecycle, deadlines, bounded
  immutable terms, shared reservation accounting, exact settlement transfer checks.
- `contracts/foundry.toml`: default and CI stateful invariant profiles.
- `docs/architecture.md`: implemented states, owner authority, timing, token risks.
- `docs/development.md`, `README.md`, `contracts/src/README.md`: current scope and checks.
- `HANDOFF`: continuing inspection, decisions, actions, failures and verification log.

Created:

- `contracts/test/Escrow.t.sol`: 55 lifecycle/authorization/boundary unit tests.
- `contracts/test/EscrowTokenSafety.t.sol`: 11 transfer/callback safety tests.
- `contracts/test/EscrowFuzz.t.sol`: four lifecycle/accounting fuzz properties.
- `contracts/test/EscrowInvariant.t.sol`: three properties in one combined stateful campaign.
- `contracts/test/helpers/EscrowTestBase.sol`: production-vault unit fixture.
- `contracts/test/helpers/EscrowHandler.sol`: bounded production lifecycle actor.
- `contracts/test/mocks/EscrowToken.sol`: adversarial local token, never deployable production code.
- `contracts/README.md`: contract API, trust boundaries and verification instructions.
- `docs/stage-3-report.md`: this report.

All 77 Stage 2 tests and their fixture source remain unchanged. No dependency,
lockfile, frontend, agent, environment, deployment script or CI workflow change.
OpenZeppelin remains 5.6.1; Solidity 0.8.28; Foundry 1.8.5; chain ID 10143.
Ignored local verification logs under `.tools/` are not committed.

## 2. Implemented functions

| Function                                                       | Behavior                                                                                                                                  |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `requestPayment(taskHash, requestId, provider, token, amount)` | Agent authorization, actual shared liquidity and task cap checks; atomically reserve and create immutable payment snapshots; no transfer. |
| `submitDelivery(paymentId, deliverableHash)`                   | Exact provider; FUNDED only; timely nonzero commitment; optional expected-hash match.                                                     |
| `acceptDelivery(paymentId)`                                    | Original agent; SUBMITTED only; timely acceptance; mandatory full challenge window.                                                       |
| `rejectPayment(paymentId, reason)`                             | Current owner; timely FUNDED/SUBMITTED/ACCEPTED rejection; public reason; release liabilities without increasing settled.                 |
| `settlePayment(paymentId)`                                     | Anyone; ACCEPTED after challenge; accounting/status before exact provider transfer; atomic rollback on failure.                           |
| `refundExpired(paymentId)`                                     | Anyone; missing FUNDED delivery or SUBMITTED acceptance after timeout; release liabilities, no transfer.                                  |
| `getPayment(paymentId)`                                        | Existing payment snapshot, with reentrant financial-view protection.                                                                      |
| `computePaymentId(taskHash, agent, requestId)`                 | Chain/vault/task/agent/request domain separation.                                                                                         |
| `globalReserved(token)`                                        | Approved-token view of the existing authoritative single-asset totalReserved ledger.                                                      |

Original owner funding, withdrawal, mandate creation/revocation, two-step ownership,
provider membership and read-only preflight remain. Creation now bounds delivery
and challenge durations to 1 hour–30 days. The DeliveryTerms tuple shape is preserved.

## 3. State transitions and deadlines

```text
NONE -> FUNDED -> SUBMITTED -> ACCEPTED -> COMPLETED
          |          |           |
          +----------+-----------+----> REJECTED (timely current-owner action)
          |          |
          +----------+----------------> EXPIRED (appropriate timeout)
```

COMPLETED, REJECTED and EXPIRED cannot change or resolve again. ACCEPTED has no
timeout refund. Existing escrow remains resolvable after mandate expiry/revocation.
Payment IDs and records cannot be replayed or overwritten after terminal resolution.

- New requests: strictly before mandate expiry.
- Delivery deadline: funding time + immutable delivery window.
- Review deadline: delivery deadline + fixed 2-day review grace.
- Challenge deadline: actual acceptance time + full immutable challenge window.
- Submit/accept/reject: `now <` applicable cutoff. Refund/settle: `now >=` cutoff.
- FUNDED rejection uses delivery cutoff; SUBMITTED uses review cutoff; ACCEPTED
  uses challenge cutoff. Early acceptance can finish the challenge before the
  unused maximum review time; it always receives the full challenge duration.
- Funding rejects uint64 deadline overflow, including latest possible challenge end.

## 4. Accounting invariants

```text
mandate.reserved + mandate.settled <= mandate.cap
globalReserved(approvedToken) = totalReserved
    = sum(mandate reservations) = sum(live payment amounts)
totalReserved <= actualTokenBalance
available = actualTokenBalance - totalReserved
```

Funding increments mandate/global reserved together. Settlement decrements both
and permanently increments mandate settled. Rejection/expiry decrements both and
leaves settled unchanged, restoring task headroom and free liquidity. Creation
never locks funds. Multiple mandates cannot reserve the same liquidity. Each record
resolves once; failed transfers roll back all ledgers/status and remain retryable.

## 5. Tests and verification

| Command                                         | Local result                                                                                       |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `forge build --sizes` (includes required build) | PASS; production runtime 12,604 B, initcode 13,141 B.                                              |
| `forge test -vvv --gas-report`                  | PASS; 148 results, zero failures/skips.                                                            |
| `forge fmt --check`                             | PASS.                                                                                              |
| `FOUNDRY_PROFILE=ci forge test -vvv`            | PASS; 148 results; seven 1,000-case fuzz properties; 32,768 invariant calls, zero reverts.         |
| `npm run check`                                 | PASS; formatting, lint, TypeScript, 148 contract + 3 agent + 5 web results; all production builds. |

Pinned local platform binary was used. Of 148 Foundry results, 77 are preserved
Stage 2 results and 71 are added. The total comprises 140 unit/smoke results,
seven fuzz properties and one combined stateful campaign checking three invariants.
Default: 256 cases per fuzz property, 64 invariant runs × 64 calls (4,096 actions),
zero handler reverts. Verified CI profile: 1,000 cases for each of seven fuzz properties and 256 × 128
invariant actions (32,768 total), zero reverts; all 148 results passed in 321.59 seconds.

The production handler reconciles every payment with task/global counters,
verifies backing and token conservation, freezes immutable/terminal snapshots,
and resolves all remaining payments at the campaign end. Bounded no-op selections
are included in action counts; these are generated tests, not formal verification.
No financial state is seeded in the Stage 3 suites. Remote GitHub CI has not been
run or inspected in this session. Existing workflow already selects the ci profile.

## 6. Gas observations

The required mixed gas run reported these local medians:

| Function       | Observed median gas |
| -------------- | ------------------: |
| requestPayment |             402,287 |
| submitDelivery |              99,412 |
| acceptDelivery |              65,980 |
| rejectPayment  |              95,809 |
| refundExpired  |              41,862 |
| settlePayment  |             171,264 |

These aggregate successful, reverting and adversarial scenarios; they are not
clean successful-call benchmarks, gas limits or Monad fee estimates. Warm/cold
storage, callbacks, test instrumentation and configured Monad execution affect
observations. Foundry's production-labeled table also misattributes a test-only
seedAccounting selector and prints zero deployment cost; neither represents the
production ABI or an actual deployment. The real compiled ABI was checked and
contains no accounting setter or arbitrary executor. Runtime/initcode sizes above
come from the separate build size check. No deployment cost claim is made.

## 7. Security findings and protections

- SafeERC20, ReentrancyGuard and effects-before-transfer protect all lifecycle
  operations. Exact outgoing vault debit and provider credit are checked.
- False/reverting transfers, recipient fees and extra sender debits revert the
  entire resolution. Externally lost backing fails closed; it does not erase debt.
- Authorized agent request/owner withdrawal callbacks and same/cross-payment
  settlement, refund and financial-view callbacks cannot reenter settlement.
- Exact recipient/agent/token/terms are bound at funding. Permanent domain-separated
  IDs, state gates and atomic effects prevent replay and double finalization.
- Timely owner rejection is terminal; after challenge cutoff the owner cannot
  reclaim ACCEPTED funds. Accepted escrow cannot be disguised as an expiry refund.
- Agent receives no ERC-20 approval, withdrawal or arbitrary execution authority.
- Deliberate timestamp and provider-validation-loop compiler advisories remain;
  boundary tests do not prove wall-clock inclusion guarantees.

No unresolved failure was found in the completed local checks; no tests were weakened or removed. This is an
implementation/test review, not an independent security audit or formal proof.

## 8. Known limitations

The current owner is a trusted unilateral dispute authority and can reject valid
delivery in time; there is no neutral appeal. Offline owners can miss disputes,
and agent/provider collusion can settle low-quality output. Hashes prove byte
commitment matching only. Token approval requires conventional behavior; rebases,
blacklisting, upgrades and dishonest balances cannot be universally detected or
made safe. Permanently blocked accepted payouts need token recovery to settle;
there is deliberately no owner bypass refund after a missed challenge.

No automated keeper, event indexer, rate limit, evidence availability service,
partial settlement, signed request, multiasset support, fee system, upgrade,
wallet/model integration, deployment or production monitoring exists. Refunds
restore headroom, so authorized actors can repeatedly use reservations within
those permissions. Local tests do not establish live Monad gas/finality parity.

## 9. Work remaining for Stage 4

Stage 4 scope needs explicit approval before implementation. The handoff work is
to define client/shared ABI types, deterministic-ID retry and confirmed-receipt
handling, chain/RPC validation, provider evidence handling and owner challenge
monitoring. Wallet/agent/Qwen integration and operational key management remain
unimplemented. Independent security review, vetted token/network configuration
and separate deployment authorization are needed before real-value operation.
Neutral arbitration, partial outcomes or multiple tokens require a new design.

## 10. Commit identity and stop boundary

Commit completed work locally to `dev` only. A commit cannot contain its own hash;
resolve the exact Stage 3 commit with:

```sh
git show --no-patch --format=%H 5558a356617e3c69754b96d09835e1163d6916f0
```

The final user-facing completion message supplies that exact hash after commit
verification. Do not push, deploy or begin Stage 4.
