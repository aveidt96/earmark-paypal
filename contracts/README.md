# Earmark TaskVault contracts

Local Solidity 0.8.28 / OpenZeppelin 5.6.1 mandate and delivery-conditional escrow.
No deployment, real funds, arbitrary executor, wallet or AI integration.

## Owner API

- `createMandate`: immutable task terms, provider list and cap; no allocation.
- `revokeMandate`: stops new requests, preserving existing payment resolution.
- `deposit` / `withdraw`: approved conventional token only; withdrawals exclude escrow and verify exact vault debit and recipient credit.
- `rejectPayment`: trusted owner final rejection before the state-specific cutoff;
  emits a public reason (1–256 bytes) and releases funds into vault liquidity.
- Two-step ownership transfer remains available; renunciation is disabled.

## Agent and provider API

- `checkAuthorization(taskHash, provider, token, amount)`: read-only preflight.
- `requestPayment(taskHash, requestId, provider, token, amount)`: agent atomically
  reserves and snapshots a payment; requestId is nonzero and permanently single-use
  within its chain/vault/task/agent domain. Reuse a stable purchase ID for retries; fresh IDs intentionally permit repeated purchases within the cap. Returns the deterministic payment ID.
- `submitDelivery(paymentId, deliverableHash)`: exact designated provider, nonzero
  commitment, optional trusted expected-hash match, strictly before delivery cutoff.
- `acceptDelivery(paymentId)`: original agent, after submission and before review
  cutoff; starts the full snapshotted owner challenge duration.

## Permissionless resolution and views

- `settlePayment`: ACCEPTED only, at/after challenge cutoff, exact provider payout.
- `refundExpired`: FUNDED delivery timeout or SUBMITTED review timeout only.
  ACCEPTED cannot timeout-refund. No token transfer occurs on rejection/refund.
- `getPayment`, `computePaymentId`, `getMandate`, `getDeliveryTerms`,
  `getApprovedProviders`, `isProviderApproved`, `availableBalance`, `totalReserved`
  and `globalReserved(approvedToken)` expose records, authority and accounting.

The review deadline is funding time + delivery window + 2 days. Delivery and
challenge durations are each 1 hour–30 days. Action cutoffs are strict `<`;
permissionless resolution begins at `>=`. Early acceptance can end review before
its maximum deadline; the full challenge period still follows actual acceptance.

Hashes identify byte commitments; they do not prove useful or correct delivery.
Owner rejection is unilateral trusted MVP adjudication, without independent appeal.
See [architecture](../docs/architecture.md) for states, trust and token limitations.

## Local verification

From repository root, use the platform-selecting wrapper:

```sh
node scripts/forge.mjs build
node scripts/forge.mjs test -vvv --gas-report
node scripts/forge.mjs fmt --check
npm run check
```

For CI-strength fuzz/invariant execution:

```powershell
$env:FOUNDRY_PROFILE = 'ci'
node scripts/forge.mjs test -vvv
Remove-Item Env:FOUNDRY_PROFILE
```

POSIX equivalent: `FOUNDRY_PROFILE=ci node scripts/forge.mjs test -vvv`.
CI runs 1,000 cases per fuzz property and two 256-run, 128-depth campaigns, each checking
three invariant properties together (65,536 generated handler calls total). Unexpected handler reverts fail.
The stateful handler uses production APIs; the older Stage 2 subclass is only a
historical accounting-snapshot test fixture, never a deployment target.

Do not deploy test mocks, fund with real tokens, broadcast transactions, or begin
Stage 5 without separate authorization. See the [Stage 4 security report](../docs/stage-4-security-report.md).
