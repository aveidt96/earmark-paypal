# Earmark — Monad Metropolis demonstration

Every payment has a purpose.

## Reproduce on Windows PowerShell

From the repository root, using Node 22 and installed Foundry/Chromium:

```powershell
npm.cmd ci
npm.cmd run setup:contracts
node node_modules/@playwright/test/cli.js install chromium
npm.cmd run demo:setup-media
npm.cmd run demo:record
```

The media setup downloads a **free, portable, checksum-pinned** FFmpeg 9.0.2
essentials build linked by [FFmpeg's downloads](https://ffmpeg.org/download.html)
from [Gyan](https://www.gyan.dev/ffmpeg/builds/).
It stays in ignored .tools/stage-7; no system installation or paid service.
Its source archive SHA-256 is
60f467265b1e312373dbcd92200c2618a74850f98d3d078e94296bb3fa2047ba.
The npm setup command bypasses script execution policy for that process only;
it does not change the machine/user policy.
Alternatively set absolute FFMPEG_PATH and FFPROBE_PATH to existing binaries.

The recorder builds actual contracts, agent and production UI, verifies media tools,
starts a fresh loopback application and separate disposable Anvil fixture chain,
runs four scenarios, captures the real liquid-glass browser at 1920 × 1080,
adds captions/fades, assembles H.264/yuv420p MP4, probes metadata, decodes every
frame and checks actual Chromium playback. It aborts on any failed assertion.
No provider output supplies contract addresses, raw calldata or recipient overrides
to agent tools. The recorder creates no general-purpose web execution API.

Output: **demo/earmark-metropolis-demo.mp4**, kept locally and ignored by Git.
Public receipts/checks: demo/earmark-demo-evidence.json.
Media verification: demo/earmark-video-verification.json.
Raw captures, per-segment media and local worker state are ignored under
.tools/stage-7/recordings/<run-id>. Actual credentials are never in public evidence.

## Other commands

```powershell
npm.cmd run demo:scenarios       # a fresh local Anvil scenario suite
npm.cmd run demo:serve           # build, rerun fixtures, keep read-only viewer at localhost:3217/security
npm.cmd run demo:test:browser    # verify four browser outcomes against already-built production UI
npm.cmd run check
```

Each scenario has a separate owner-funded vault and immutable 10-USDC mandate.
Each recording/run gets fresh identities and receipts. The web workspace's normal
vault is separate from these explicitly labelled isolated demo vaults.
The UI buttons select scenarios; execution is controlled by the trusted local CLI.
There is deliberately no browser endpoint that mints tokens, creates authority,
impersonates agents or moves chain time. To rerun use the CLI, not an HTTP POST.

## Four scenarios

- **A:** owner fixture deposits 20 mock USDC; the existing deterministic model
  compares DataHub/WeatherCo, purchases DataHub at 6, inspects/accepts, and the
  observer settles after the entire 3,600-second owner challenge deadline.
  Final available balance 14. Repeating the purchase intent reconciles the
  original completed payment without another reservation.
- **B:** actual quote description instructs payment redirection. The unmodified
  mock policy ignores description instructions and purchases approved DataHub.
  A malformed quote with a recipient field is separately rejected by backend
  validation without broadcast. A separate authorized-agent test-chain probe
  actually broadcasts an unauthorized-provider request and obtains a reverted
  receipt. Its simulation error is ProviderNotApproved. No successful injection
  or live-Qwen resistance is claimed; the unauthorized wallet gets zero tokens.
- **C:** approved provider reserves 6 and submits the quoted commitment, but
  returns a different structured artifact. Offchain inspection refuses it.
  The owner then rejects SUBMITTED escrow within the review window, releasing
  reservations; provider gets zero, available funds return to 20.
  The contract did not independently inspect the artifact or semantic quality.
  No owner-trusted expected hash is configured in this fixture.
- **D:** three legitimate distinct intent IDs propose 4 USDC each. The first
  two fund. The third fails backend cumulative-cap validation. An independent
  third onchain probe confirms TaskCapExceeded in simulation and a reverted
  receipt. Snapshot: reserved 8, settled 0, available 12. Its two live escrow
  obligations remain fully backed in the disposable test-chain snapshot; the
  existing delivery timeout/refund path remains available before chain shutdown.

Onchain probe impersonation and time controls exist **only in the local test
harness**, never in model tools or the web API. Blockchain reverts, backend
rejections and deterministic decisions are distinct labelled observations.
Revert reasons are confirmed through contract simulation; receipts independently
confirm failure and transaction identity.

## Recording scope and manual fallback

The MP4 captures actual React screens driven by freshly verified fixture events,
receipt IDs and balances. The local CLI executes owner bootstrap operations; the
recording is not footage of a human accepting MetaMask/Rabby dialogs. Existing
browser regression tests separately exercise the owner flow through the Node-held
EIP-1193 test bridge. No private key appears in the browser, screenshots or video.

If Chromium recording/media encoding cannot run, keep the failed log and use:

1. Run demo:serve; open the printed loopback URL in Chrome.
2. Record at 1920 × 1080 with Windows Game Bar or OBS (free).
3. Show each of the four scenario buttons, provider response, agent events,
   backend verdict, contract verdict, confirmed hashes and final balances.
4. Include the local/mock and Anvil-clock disclosures visibly throughout.
5. Add the approved opening/end copy and verify the export with FFprobe.
6. Report that installed-wallet dialogs were not captured.

To film actual wallet interactions for A, use npm.cmd run web:local in another
session, import only the ignored local owner key into a development wallet while
recording is **stopped**, connect to the printed local chain, deposit 20, create
the prefilled 10-USDC weather mandate, then launch/sign and inspect real events.
Observe the full hour challenge period; any local clock advancement must be
performed by a separate trusted harness and disclosed, never exposed as an agent
or browser capability. Never record an import key, credentials or hidden reasoning.

## Trust limits

Deterministic mock decisions are simulation, not paid/live Qwen output.
No live Qwen call is made without separately confirmed free credentials and
explicit network enablement. Commitments bind structured bytes but do not certify
natural-language completion. An authorized agent can accept poor work; owner
dispute vigilance matters. Fresh distinct signing intents can consume the
mandate's remaining authority, but cannot exceed its immutable cumulative cap.
This is a local demonstration, not a public Monad deployment or external audit.
The video is caption-led without third-party music or paid narration.
