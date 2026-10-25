# Earmark Stage 8A deployment instructions

This environment is exclusively Monad Testnet (10143). The Neon database branch
named `production` belongs to `earmark-testnet`; it does not authorize mainnet,
paid hosting or real funds. No public deployment is complete yet.

## Database

Reuse Neon project `square-glade-65269089`, branch `production`.
`neon.ts` remains the approved empty policy. Never reset the database or replace
managed environment values to retry a payment.

```powershell
npm.cmd ci
npm.cmd run api:build
npm.cmd run db:migrate
npm.cmd run db:test
```

Migration loads ignored root `.env.local` and uses `DATABASE_URL_UNPOOLED`.
It validates the existing `.neon` project/production context and approved endpoint.
DDL is additive, transactional and guarded by a migration advisory lock. The
immutable environment binding identifies Earmark testnet, chain 10143 and project.
Schema tables hold intents, provider attempts, workspaces, runs, events and launch
nonces. No signer configuration or private key belongs in these records.

`db:test` uses the separate ignored `.tools/stage-8a/validation.env` containing
`EARMARK_TEST_DB_URL`. It runs against the existing isolated validation branch,
never production. The branch expires; if expired, obtain a fresh explicitly
approved test connection before running tests. Test cleanup deletes only each
suite's randomly named scopes in that isolated database.

The direct connection is deliberate: PostgreSQL session advisory locks require
session affinity. Keep the existing pooled URL intact. The persistent worker
uses a certificate-verified direct pool capped at four connections.

Purchase hashes and nonces are committed before broadcast. Restart reconciliation
only reads receipts and updates durable records. An unresolved hash is preserved;
it is never automatically signed again, replaced or rebroadcast. A signed owner
resume may continue the same purchase after authoritative reconciliation.
Prepared-but-never-broadcast attempts can require operator review; do not erase
journal rows to work around uncertainty. Local Anvil files remain preserved and
are not imported as Monad history: their chain/genesis/payment identities differ.

## Owner-signed contract deployment

```powershell
npm.cmd run deploy:testnet:owner
```

Open `http://127.0.0.1:3344` in the browser containing MetaMask or Rabby.
Connect only `0x9Db22De53242B5376fC4B87B523a0a91aDD0b09A` on Monad
Testnet, chain 10143. The helper is loopback-only and cannot sign transactions.

First click **Switch to Monad Testnet** and approve the wallet network prompt.
The helper checks the connected wallet reports 10143 afterward; this action does
not deploy or send funds. Adding a custom network alone does not select it for
this site. A mismatch displays the actual wallet chain ID. With multiple wallet
extensions, use the extension connected to this page. No chain guard is bypassed.

1. Review and approve **Deploy / reconcile Mock USDC** (six decimals).
2. After two confirmations, review and approve **Deploy / reconcile TaskVault**.
   Constructor owner is the approved address; token is the confirmed first contract.
3. Click **Verify and save manifest**. The Node verifier independently checks
   network, two confirmations, deployment sender, exact tested bytecode/constructor
   input, deployed owner/token and decimals. It saves public addresses, receipts
   and code hashes to `deployments/monad-testnet.json` without overwriting another
   deployment manifest.

Transaction hashes persist in browser local storage as soon as the wallet returns
them. After timeouts, use the same buttons to reconcile; never clear storage or
approve a duplicate deployment to hide an uncertain result. Wallet signing itself
is interactive and has not been demonstrated by the rejection-only browser test.

### Recover an uncertain wallet result

Never clear storage or approve a replacement deployment after an uncertain result.
Share only its public transaction hash. A confirmed token can be recorded in
deployments/monad-testnet-token.json after independently checking chain, owner,
constructor input, runtime bytecode, six decimals and two confirmations.
The helper revalidates this public record on startup and exposes only its
confirmed hash. After owner/network checks, the browser restores that hash and
clears only its token pending marker. A conflicting saved token hash blocks
further work without overwriting either record. No recovery action broadcasts.

The verified Mock USDC transaction is
0x2eb29c7c76ea501d9f3e001432509774978114f98b2b96ebb6719b0a649a83eb,
token 0x8f4660ed18a3ba5ba9dbe64e18f06ef4a43c0136 on Monad Testnet.
Run the isolated recovery checks with npm.cmd run deploy:testnet:test.

## Render Free backend — preparation

Use root `render.yaml`, service `earmark-api-testnet`, branch `dev`, Free plan.
Build: `npm ci --include=dev && npm run api:build`. Start: `npm run api:start`.
The service binds Render's `PORT`, checks database and deployed chain/code before
serving, reconciles existing attempts, and enforces one worker per vault.
On singleton database-lock loss it exits, stopping asynchronous signing jobs.
Graceful SIGTERM drains jobs; hard termination leaves committed attempts recoverable.

Enter secrets only in Render's secure environment UI, using `.env.stage8a.example`
as the variable-name reference. Agent and both mock-provider signers must be
separate from the owner and each other. Use dedicated testnet-only burners.
Never paste keys/database URLs into chat, commits or Vercel public variables.

Set exact final `FLINT_WEB_ORIGIN`. Keep `EARMARK_ENABLE_TESTNET_EXECUTION=false`
until configuration, persistence and wallet setup have been verified.
`/health`, `/ready` and GET `/api/workspace` are read-only. POST routes are only
register/challenge/launch; owner-verified single-use signatures protect launch.
No execute, generic RPC, withdrawal or administrative endpoint is provided.

Render Free may suspend; it is not a continuous settlement keeper. No startup
routine declares completion or resends a transaction. Funding/delivery/acceptance
need explicit authorized recovery when interrupted. Permissionless owner/browser
settlement must be verified separately after deployment, including backend outage.

## Vercel Hobby frontend — preparation

The owner confirmed personal noncommercial hackathon use. Project name `earmark`,
Git production branch `dev`, Next.js root `web`, include files outside root for the
agent workspace. Use existing Next build and npm workspace installation; no Foundry
compilation is needed on Vercel. Server variables: `EARMARK_API_URL` (exact Render
HTTPS origin), `EARMARK_DEPLOYMENT=monad-testnet`, matching `FLINT_WEB_ORIGIN`.
Public variable: `NEXT_PUBLIC_CHAIN_ID=10143`. No secret `NEXT_PUBLIC_` variables.

Hosted routes refuse absent/invalid backend configuration, never fall back to
localhost, and forward only fixed endpoints. Upstream cold-start HTML becomes a
bounded wake-up/unavailable response; refresh never resubmits a payment.

See [Render's Free limits](https://render.com/docs/free),
[Blueprint specification](https://render.com/docs/blueprint-spec),
[Vercel monorepo setup](https://vercel.com/docs/monorepos) and
[Vercel Hobby rules](https://vercel.com/docs/plans/hobby).

## Remaining live verification

Reuse the confirmed contracts, complete any pending explorer import and configure dedicated signer funding,
publish validated dev, connect Render/Vercel accounts and environments, then
perform owner deposit/mandate/signed launch and a real testnet purchase. Wait the
actual full challenge period (at least one hour); no Anvil advancement on testnet.
Verify terminal receipt, public read-only evidence, cap/provider/revocation
failures, replay, backend restart, frontend reconnect and cold start. Free live
Qwen is optional; otherwise display deterministic mock honestly.

## Existing confirmed contracts — do not redeploy

Use deployments/monad-testnet.json and the independent verification evidence.
Mock USDC: 0x8f4660ed18a3ba5ba9dbe64e18f06ef4a43c0136.
TaskVault: 0x37c026c7207de8f202a06726eb02e6233ed06160.
Owner: 0x9Db22De53242B5376fC4B87B523a0a91aDD0b09A.
Both Sourcify source-verification jobs matched; MonadScan import remains pending.
The deployment instructions above describe historical creation, not a request
for new deployment signatures. Use these confirmed addresses for hosting.

The prepared local .tools/stage-8a/render.env contains private Render settings
from existing secure configuration. It is ignored; never commit, send through
chat, import into Vercel or show in a screenshot. The owner must enter secrets
in Render's secure environment UI. Replace its readiness-only FLINT_WEB_ORIGIN
with the exact approved final Vercel production origin before launching the
hosted service. Keep execution disabled until hosted checks and wallet setup pass.
Set NODE_VERSION=22.23.3 on Render as specified by the blueprint.

Frontend root is web. Explicit install: cd .. && npm ci --include=dev.
Explicit build: cd .. && npm run build --workspace @flint/web.
Include shared files outside the root; do not deploy the agent as a Vercel service.
Use only nonsecret frontend settings, with the actual fixed backend URL. Metadata
uses FLINT_WEB_ORIGIN or Vercel's supplied VERCEL_PROJECT_PRODUCTION_URL.

Open /resolve to inspect a saved payment ID directly on Monad Testnet without
backend availability. It verifies deployed code and token, checks actual chain
time, then permits eligible settlement or timeout refund. Review the wallet's
exact vault address and function before signing. If wallet output is uncertain,
check wallet activity and reconcile only the saved transaction hash; do not retry
signing. The route never refunds an ACCEPTED payment after challenge expiry.

Current frontend readiness origin: https://earmark-omega-virid.vercel.app
(Vercel Hobby, tested source c9e316a3a79fa11fbe69253a0ef5f1cb6c3cd41b).
Pin the Vercel project Node.js Version to 22.x; a web-root import otherwise
selected Node 24 and correctly failed the repository engine check. The current
frontend returns an explicit backend-unavailable state until Render is configured.
The prepared Render origin now matches this exact frontend URL. Owner handoff:
Add from .env > Choose a file > select the ignored render.env > Add variables.
Keep execution false and wait for deployment/readiness verification before signing
a launch. Never show the imported values in screenshots or chat.

### Render rolling-restart health

The configured `/health` endpoint is liveness, returning `starting` while the
replacement waits for the old worker's exclusive PostgreSQL session to end.
Application routes return `WORKER_STARTING` with HTTP 503 during that interval.
Require `/ready` 200 and a confirmed workspace snapshot before declaring recovery
or enabling execution. The four-minute contention timeout fails closed. Never
remove the worker lock, kill a database session, reset records or rebroadcast a
purchase to make a deployment succeed. Render's Live badge alone does not prove
financial readiness. The actual backend origin is
https://earmark-api-testnet.onrender.com; Vercel Production has this fixed origin
and the exact approved frontend origin. Initial credentials import is completed;
redeploy only validated source and verify readiness after restart.

## Owner mock-token setup (existing contracts only)

After the deployed contracts and hosted backend are verified, run:

```powershell
npm.cmd run contracts:build
npm.cmd run testnet:fund
```

Open `http://127.0.0.1:3345` in the browser containing Rabby or MetaMask.
Use only the approved owner wallet on Monad Testnet (10143). The loopback page
checks deployed bytecode, owner and payment-token configuration. It can request
only `mint(owner, 20000000)` on the existing six-decimal MockUSDC: 20 mock tokens.
It cannot deploy, deposit, withdraw, choose a recipient or run an agent payment.
The Node service has no signer and rejects every POST. The owner must approve
in the wallet, and two actual testnet confirmations are required.

The page writes a pending marker before requesting the wallet transaction and
saves its hash when returned. A timeout never causes a resend. Preserve browser
storage; use the public hash to reconcile uncertain results. Reconciliation
checks chain, sender, destination, exact calldata, zero native value, successful
receipt and two confirmations. An unrelated deployment receipt is rejected.
A saved confirmed hash is reconciled again instead of sending another mint.
The mock token's unrestricted mint is a test fixture, not a production USDC claim.

After mint confirmation, use the public workspace to deposit 20 mock USDC and
create a 10-USDC weather mandate for the configured agent and both registered
providers. Mandate creation does not reserve its cap. Keep execution disabled
until live configuration and these owner setup transactions are verified.
Launch only through the existing short-lived single-use owner signature flow.
Wait the actual minimum one-hour challenge period; never advance Monad time.

```powershell
npm.cmd run testnet:fund:test
node node_modules/@playwright/test/cli.js test e2e/funding.spec.mjs e2e/resolution.spec.mjs
```

The helper browser suite starts its own server if necessary, reuses a correctly
configured existing owner server, and closes only a server it created. Synthetic
wallet tests cannot broadcast. Real wallet minting remains an owner handoff.

## Verified public purchase checkpoint

The existing owner has completed minting, depositing 20 mock USDC, creating a
10-USDC mandate, launching the deterministic agent and revoking future authority.
A real 6-USDC DataHub payment is COMPLETED after the full challenge period; accepted-payment Render restart retained
its journal and confirmed hashes. See the Stage 8A report for public evidence.

Inspect the completed payment in execution details or at /resolve:

```text
0x003be982f4f5ec1eceb497862bdeb8ac65c0d9a9f4e452324e9dc883af72c98e
```

The owner settled it at 16:02:47 Africa/Lagos, 130 seconds after the full challenge
cutoff. The receipt and final 14 actual / 14 available / 0 reserved accounting are
verified; Stage 8A is complete for the free-tier testnet demonstration. This payment
is terminal: do not settle it again, create a replacement task or redeploy contracts.
For future authorized escrows, permissionless settlement remains subject to the
actual contract deadline and exact original provider. Reconcile an uncertain wallet
result by public transaction hash rather than signing again. Never advance public
Monad time. See the Stage 8A report for source versions and remaining limitations.
