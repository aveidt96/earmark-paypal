# Contract source boundary

`TaskVault.sol` implements Stage 2 immutable mandates and owner-controlled funding,
plus Stage 3 atomic escrow, provider delivery, agent acceptance, trusted owner
rejection, permissionless optimistic settlement and timeout refunds.

No arbitrary executor, agent withdrawal/approval, partial payout, neutral arbitration,
AI integration, upgrade mechanism or deployment exists. Hash commitments do not
prove semantic delivery correctness. See the [contract API](../README.md),
[architecture](../../docs/architecture.md) and [Stage 3 report](../../docs/stage-3-report.md).

Use pinned OpenZeppelin imports rather than copying dependency code.
The npm lockfile supplies OpenZeppelin 5.6.1; Foundry is pinned separately in
`scripts/foundry-release.json`. No Git submodules or forge-std dependency are needed.
Mocks, stateful handlers and the Stage 2 accounting-seeding subclass reside only in
`test/` and must never be deployed as the production vault. Mock USDC has six decimals.

Stage 4 hardens exact withdrawal recipient credit; the ABI, storage and escrow lifecycle are preserved. See the [security report](../../docs/stage-4-security-report.md). Stage 5 and any deployment require separate approval.
