# Task 01 — Earmark PayPal migration implementation report

Date: **2026-10-25**

## Outcome

An independently installable and production-buildable application is present in
`project-earmarkpaypal`, with a **new local Git repository** on `main` and origin
`https://github.com/aveidt96/earmark-paypal.git`. The original checkout was verified
unchanged. PayPal integration preparation is complete; PayPal payments are not
implemented or verified.

**GitHub publication remains outstanding.** Unauthenticated remote inspection
failed because GitHub required credentials; the environment has no usable GitHub
CLI authentication. No commit or push was performed. Files are local, uncommitted
migration inputs, ready for review and an explicitly requested authenticated
commit/push. The remote repository contents and default branch could not be
verified, so this report does not claim the GitHub repository has been populated.

## Source and migration method

- Original remote: `https://github.com/aveidt96/Flint.git`.
- Local source: sibling `project-flint` checkout.
- Source revision: `cc20daa06392c588a42925d3844311abac1a067f`.
- Exported all **260 committed source files** through `git archive`, preserving
  source, assets, tests, lockfile, configuration and historical evidence.
- The original `.git`, ignored environment/credential files, `.neon` local
  binding, `node_modules`, caches, build outputs and generated local tools were
  not imported. Destination dependencies and tools were installed independently.
- Original working changes in `HANDOFF` and untracked demo media were excluded.
- The source README is preserved in `docs/migration/original-readme.md`, with a
  provenance heading; the root README now describes this application.
- The migration audit confirms **232 of the original 260 files are byte-identical**
  and no original tracked path is missing. Changes are limited to manifests,
  documentation, branding, templates, CI/preview configuration, checks and one
  inherited test-path fix. All Solidity, agent runtime, authorization, wallet,
  database adapter, policy and payment-lifecycle implementations are preserved.

## Migrated features

1. Next.js App Router, React, TypeScript, Tailwind/PostCSS, Vitest and Playwright.
2. Crystal branding asset, liquid-glass UI, dark/light/system themes and responsive
   navigation, now identified as **Earmark PayPal**.
3. Dashboard, create/list earmarks, payment history, activity, execution console,
   payment detail/lifecycle and independent legacy resolution screen.
4. Original wallet discovery, owner funding, immutable mandate creation/revocation,
   EIP-712 launch authorization, expiring consumed nonces and owner dispute flow.
5. Server-only Gemini, Qwen and deterministic Mock adapters, strict model/tool
   validation, quote/provider binding, delivery inspection and durable journals.
6. Neon PostgreSQL adapters, SQL schema, scoped records, advisory locks, durable
   intent/nonce/run/event state, worker handover and receipt-only recovery.
7. TaskVault Solidity and OpenZeppelin safeguards, unit/fuzz/invariant suites.
8. Four original security demonstrations and their historical evidence:
   - **A — Normal Purchase:** approved provider, delivery acceptance, full challenge
     period and confirmed local mock settlement.
   - **B — Prompt Injection:** deterministic mock ignores redirect; independent
     unauthorized-provider probe reverts.
   - **C — Invalid Delivery:** deterministic inspection blocks acceptance; owner
     rejection restores headroom.
   - **D — Budget Exhaustion:** two distinct four-USDC reservations succeed; a
     third exceeds cumulative ten-USDC authority.

These demonstrations were reproduced in disposable local Anvil tests. Historical
Monad receipts remain labelled as source evidence. None is PayPal payment evidence.

## PayPal preparation and configuration

- Root and web `.env.example` templates have PayPal Sandbox, Gemini and dedicated
  Neon placeholders. Secrets have no `NEXT_PUBLIC_` exposure.
- PayPal defaults to `sandbox`, with payments disabled. Live configuration or an
  attempt to enable payments fails the preparation status check.
- `GET /api/integrations/paypal` is read-only and returns preparation-only status;
  it never exchanges OAuth tokens or makes payment requests.
- Added tests verify disabled-only Sandbox configuration and credential omission
  from status output. Browser bundle checking includes PayPal secret variable names.
- Global branding/status copy distinguishes the retained EVM workspace from the
  future PayPal implementation.
- Render blueprint now points at the new repository and serves a Next.js preview,
  with automatic deployment off. CI covers `main` and `dev` with the retained
  Linux/Windows toolchain. Nothing was deployed.

## Changes required to complete validation

- Fixed `web/test/security-recordings.test.ts` to locate source evidence relative
  to `import.meta.url`; the inherited path failed under npm workspace execution.
- Foundry's original short download timeout expired on this network. Downloaded
  the official 1.8.5 archive independently and verified its original pinned SHA-256.
  The setup script now supports a checksummed `FOUNDRY_ARCHIVE_PATH` and a longer
  network timeout. No source-repository tools were copied.
- The inherited Next.js 16.4.0 build failed on known security advisories. Applied
  patch updates **Next.js 16.4.3** and **Zod 4.6.7** in this repository and refreshed
  the lockfile. React, Tailwind, TypeScript, Gemini, Neon and Vitest infrastructure
  remain intact. The final audit reports zero vulnerabilities.
- A run concurrent with the production build exceeded three inherited five-second
  Gemini-session test timeouts. The web suite and then the entire root test command
  passed when rerun without the competing build; no assertions/timeouts were weakened.

## Verification results

- **Dependency installation:** passed, `npm ci --ignore-scripts`; patch dependency
  update installed with scripts disabled and updated `package-lock.json`.
- **TypeScript:** `npm run typecheck` passed for agent, web and API.
- **Solidity:** 176 tests passed, including fuzz and both stateful invariant suites.
- **Agent Vitest:** 140 tests passed, including real local contract integration and
  all four repeated security fixtures.
- **Web Vitest:** 175 tests passed; five PostgreSQL integration tests skipped
  because no dedicated test database was supplied. Final `npm test` passed.
- **Recovery scripts:** 21 Node test cases passed.
- **Read-only Gemini fixture script:** four additional Vitest cases passed.
- **Production build:** final `npm run build` passed for all three workspaces;
  Next.js 16.4.3 generated all pages and API routes successfully.
- **Lint:** `npm run lint` passed; inherited informational style suggestions remain.
- **Formatting:** `npm run format:check` passed.
- **Dependency audit:** `npm audit --audit-level=high` passed, zero vulnerabilities.
- **Browser/server credential boundary:** passed for 42 compiled browser JS chunks.
- **Production browser smoke:** seven routes returned 200; navigation/main content,
  all four recorded scenario controls, read-only Sandbox status, and a 390px mobile
  layout passed, with no browser exceptions. External requests and mutation
  requests were blocked. Local screenshots are ignored under `.tools/`.
- **Source scan:** migration audit found no missing original tracked files, no
  non-template environment files among candidate Git files, and no credential
  pattern findings. This is a targeted scan, not an external security audit.
- **Original integrity:** HEAD, refs, working status, diff and **305 file hashes**
  match the pre-migration baseline, including original working changes and ignored
  environment files. The manifest contains hashes only and stays ignored locally.

Full historical Playwright E2E was retained but not executed; several suites target
legacy deployment/funding helpers or public hosting. The new production smoke is
explicitly read-only. Live Gemini inference and real Neon connectivity were not
exercised. No real-chain or PayPal Sandbox payments were executed.

## Outstanding dependencies and recommended next steps

1. Authenticate access to the destination GitHub repository, inspect its contents
   and default branch, then review and publish the local migration when requested.
2. Define owner authentication/PayPal consent and a provider-neutral authorization
   interface while keeping existing policy and EVM tests as regression references.
3. Provision a **new Neon project/branch** and design a PayPal-specific migration.
   The preserved schema/binding/migration command is hard-coded to original Monad
   testnet 10143 and must not be used for PayPal setup.
4. Define explicit USD minor-unit accounting; six-decimal mock-USDC amounts are not
   fiat cents. Add atomic cumulative-budget reservations and immutable recipient,
   quote, intent and external payment identities.
5. Implement server-only Sandbox OAuth and the chosen order/authorization/capture
   lifecycle, idempotency, verified webhooks and uncertain-outcome recovery.
6. Map delivery review, challenge timing, void/refund and disputes to actual PayPal
   product semantics. PayPal approval/authorization is not automatically equivalent
   to the original TaskVault escrow and owner-dispute model.
7. Validate mocked transport and all four security scenarios, then separately test
   approved Sandbox flows and record actual evidence before claiming payment success.

See [the pre-change inventory](legacy-dependencies.md) and
[PayPal integration architecture](../paypal-integration.md) for code locations,
schema details, authority boundaries and the proposed integration sequence.

## Reproduce the local-only checks

```powershell
npm run typecheck
npm test
npm run build
npm run format:check
npm run lint
npm audit --audit-level=high
node --test scripts/deployment-recovery.test.mjs scripts/testnet-funding.test.mjs
node node_modules/vitest/vitest.mjs run scripts/gemini-readonly-fixture.test.mjs
node scripts/check-web-boundary.mjs
node scripts/preview-smoke.mjs
node scripts/migration-audit.mjs ../project-flint
node scripts/source-integrity.mjs verify ../project-flint .tools/source-integrity.json
```
