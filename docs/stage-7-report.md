# Earmark — Stage 7 security demonstrations and hackathon video

Date: 9 October 2026 (Africa/Lagos). Branch: dev.
Starting commit: d8f4a97adf95ccbcde23c82e00b79cb16d25c94f.
Status: Stage 7 complete.

## Implementation and trust boundaries

Four isolated local scenarios reuse real TaskVault/MockUSDC artifacts, the existing
MockModel, AgentTools, VaultChain and durable IntentStore. A compact Workspace
section links to a liquid-glass Security Demos page with actual provider text,
agent decisions, backend checks, financial ledgers, payment IDs and receipts.

The trusted CLI controls execution. Frontend buttons select observations; the
opt-in loopback GET API reads a bounded, strict, server-configured public snapshot.
It cannot sign, create authority, impersonate an agent or advance time. Failed
polling retains the last verified snapshot; refresh cannot resend a payment.

Owner bootstrap, observer settlement, adversarial authorized-agent impersonation
and Anvil clock advancement are explicitly test-harness operations outside agent
tools and web endpoints. Each scenario uses its own vault/mandate; the usual
Workspace vault is separate. TaskVault financial logic, ABI/storage, original
runtime/tools/journal security and signed-owner launch authorization are unchanged.

## Four actual outcomes

| Scenario             | Confirmed observation                                                                                                                                                                                    | Final available / reserved / settled               |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| A: Normal Purchase   | Deposit 20, cap 10, compare DataHub 6 versus WeatherCo 8; inspect/accept DataHub, reach the full 3,600-second challenge, settle COMPLETED                                                                | 14 / 0 / 6 USDC                                    |
| B: Prompt Injection  | Actual mock policy ignores the redirect instruction; separate malformed recipient field fails backend validation without broadcast; independent unauthorized-provider transaction has a reverted receipt | 14 / 0 / 6 USDC; unauthorized wallet receives zero |
| C: Invalid Delivery  | Approved provider reserves 6 but returns changed artifact bytes; inspection fails and agent does not accept; owner rejects SUBMITTED escrow on time                                                      | 20 / 0 / 0 USDC; provider receives zero            |
| D: Budget Exhaustion | Distinct 4+4 intents fund; third 4 fails backend cap checks; independent third onchain probe reverts with TaskCapExceeded in simulation                                                                  | 12 / 8 / 0 USDC                                    |

D ends with two fully backed FUNDED obligations in a disposable-chain snapshot,
not completed/refunded payments. Existing timeout paths remain available.
Revert names are obtained through contract simulation; actual receipts separately
prove failure and transaction identity. Backend blocks are distinct from reverts.

C has no owner-trusted expected hash. Trusted quote/artifact byte binding is
checked offchain, followed by timely owner rejection. Neither a provider-selected
commitment nor a correct byte hash proves semantic service quality.

## Verification

| Command                                                   | Result                                                                              |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| npm run check                                             | Passed formatting, lint, strict TypeScript, all 353 tests and all production builds |
| forge build / forge test through pinned workspace wrapper | Passed; 176 Solidity tests, including existing fuzz/invariant suites                |
| Agent Vitest                                              | 98 passed                                                                           |
| Frontend/server Vitest                                    | 79 passed                                                                           |
| Original Playwright owner-browser suite                   | 3 passed                                                                            |
| npm run demo:test:browser                                 | 4 scenario checks passed, including refresh and connection recovery                 |
| npm run demo:record                                       | 4 fresh scenario checks plus MP4 encoding/verification passed                       |
| npm run demo:setup-media                                  | Windows PowerShell archive/executable checks and both versions passed               |
| node scripts/check-web-boundary.mjs                       | 40 compiled browser chunks passed                                                   |

Eight added real-contract tests run all scenarios twice with fresh identities,
checking ledgers, reverted receipts, unique events and durable purchase
reconciliation. Sixteen added web/server/media tests cover evidence shape/size,
loopback/server-path restrictions, atomic Windows sharing-violation recovery,
unrelated disk errors, H.264/dimensions/duration checks and loading-preroll trimming.

All three preserved owner-browser scenarios passed: real browser purchase/full
challenge/settlement/refresh/mobile, wallet account/chain/signature/replay/revocation,
and owner rejection plus permissionless timeout refund. Their financial assertions
were not changed. Four new browser scenarios passed, including API mutation
rejection, rendered real receipts/payment IDs, event persistence, temporary
connection failure/recovery and scenario selection. The recorder repeats all four
against fresh fixtures and validates actual browser output.

Corrections driven by failures: acquire the unchanged journal lock in D; narrow
broad ABI return types; fix new test callback typing; add bounded filesystem-only
rename retries; remove a redundant hero button causing mobile overflow. The local
launcher now mines one-second blocks below the unchanged provider timeout.
Delivery/review/challenge durations and the full dispute window remain unchanged.
The portable setup uses built-in .NET hashing/extraction for Windows PowerShell compatibility; both binaries are checked against the pinned archive. A test cleanup guard was moved before try to avoid masking failures in finally. No financial assertion or global lint/security rule was weakened.

## Verified video

- Local path: C:/Users/USER/Documents/project-prometheus/project-flint/demo/earmark-metropolis-demo.mp4.
- Duration: 146 seconds (2 minutes 26 seconds).
- Resolution/encoding: 1920 x 1080, 30 fps, H.264 MP4, yuv420p.
- File size: 6,627,799 bytes (6.63 MB).
- FFprobe metadata, full FFmpeg decode and actual Chromium playback: passed.
- Evidence and video verification run ID: c0811df1-381e-4b30-aa6c-05ceaf10db91.
- MP4 SHA-256: 69aae24782703a13bf8aa7b8457d1c32191948b426ccee3a0fcd557f37665310.
- Verification sidecar: demo/earmark-video-verification.json; actual public receipts: demo/earmark-demo-evidence.json.

The approved crystal-blue PNG is byte-identical to Stage 6.5. An optional image-size
hint gives enlarged opening/end cards sufficient resolution while preserving the
default navbar hint. Actual React screens, receipts and ledgers are recorded.
Only browser-loading lead-in is trimmed; no transaction result is synthesized.
Captions and restrained fades identify local Anvil, mock USDC, simulated services,
deterministic mock decisions and test-only full-deadline advancement.

The MP4 is caption-led with no third-party music/paid narration. The owner fixture
performs setup; installed MetaMask/Rabby dialog interactions are not filmed.
Owner-wallet browser flows are separately tested through an EIP-1193 bridge.
A precise manual wallet-recording fallback is in demo/README.md.

Portable FFmpeg/FFprobe 9.0.2 are free local tools from the supplier linked by
[FFmpeg](https://ffmpeg.org/download.html), verified against the
[published archive checksum](https://www.gyan.dev/ffmpeg/builds/packages/ffmpeg-9.0.2-essentials_build.zip.sha256):
60f467265b1e312373dbcd92200c2618a74850f98d3d078e94296bb3fa2047ba.
Binaries, raw captures, worker state and MP4 are Git-ignored; no dependency versions changed.

## Live Qwen and limitations

No free Qwen credentials/network inference enablement were available. No live Qwen
call was made. Mock resistance is deterministic policy behavior, not evidence of
live-model prompt-injection robustness; no successful injection is fabricated.

A compromised signing key can create fresh intents within its cap. Application
idempotency prevents accidental retries, not independent malicious signing.
An agent can accept poor work; an owner missing the challenge deadline risks payout.
Production finality/reorg handling, monitoring, durable distributed operations,
privacy/rate limits and independent review remain future work.

After fixture shutdown the viewer displays confirmed local snapshots, not live
public-chain history. No public Monad transaction, external audit/certification,
real funds, paid services, main push, deployment or Stage 8 work occurred.

## Changed files and reproduction

- Root: .gitignore, package.json, README.md, HANDOFF.
- Agent: README.md, package.json, src/security-demo-schema.ts, src/local/security-demo.ts, test/security-demo.test.ts.
- Frontend: README.md, .env.example, src/app/globals.css, src/components/dashboard.tsx, src/components/glass.tsx, src/components/security-demos.tsx, src/app/security/page.tsx, src/app/api/security-demos/route.ts, src/server/security-demos.ts, test/security-demos.test.ts.
- Scripts: start-workspace.mjs, run-security-demos.mjs, record-demo.mjs, demo-tools.mjs, setup-demo-media.ps1.
- Demo: README.md, earmark-demo-evidence.json, earmark-video-verification.json.
- Documentation: architecture.md, branding.md, this report, stage-6-evidence.json and refreshed Stage 6/Stage 7 screenshot evidence.
- e2e/workspace.spec.mjs: informational explanation assertion updated only.

The original user web/next-env.d.ts edit is preserved byte-for-byte and excluded.
HANDOFF records actions, failures, fixes and verification.

[Normal purchase](screenshots/stage-7-A.png),
[prompt injection](screenshots/stage-7-B.png),
[invalid delivery](screenshots/stage-7-C.png),
[budget exhaustion](screenshots/stage-7-D.png).

[PowerShell commands and manual fallback](../demo/README.md).
Use npm.cmd run demo:record to recreate the full workflow; demo:serve keeps the
read-only local viewer open after fresh fixture verification.

## Commit identity

The exact completed source commit is supplied in the completion response.
Resolve it locally with:

    git log -1 --format=%H -- docs/stage-7-report.md

A commit cannot contain its own hash. Only dev is committed locally; no push.
