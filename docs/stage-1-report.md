# Earmark — Stage 1 historical report

> Historical identity note: this stage was completed under the provisional Flint name. Earmark was approved in Stage 6.5; historical facts, repository references and technical identifiers below are retained.
> Original recorded stage/report commit: 74efd984d0bfd64deb3f4265e652236149ee13d3.

Work started 7 October 2026 and continued 8 October 2026 (Africa/Lagos).
Status: Stage 1 complete. Work is committed locally on `dev` only.

## Repository inspection and branch

The supplied local workspace was empty. The remote inspection and
fetch succeeded and returned no commits or branch references. There was no
existing code, configuration, branch history, or local work to overwrite.
The interrupted sandbox clone was recovered, and an initial `dev` branch was
created. No `main` branch was modified or created. No branch has been pushed.

The checkout uses the existing user's Git identity. The repository remains Flint;
no GitHub repository settings or public names were changed.

## Repository structure

```text
.github/
  workflows/ci.yml
  dependabot.yml
contracts/
  foundry.toml
  package.json
  src/README.md
  script/README.md
  test/Toolchain.t.sol
agent/
  src/ai/types.ts
  src/config.ts
  src/index.ts
  test/config.test.ts
  package.json, tsconfig*.json, .env.example, README.md
web/
  src/app/{layout.tsx,page.tsx,globals.css}
  src/lib/network.ts
  test/network.test.ts
  package.json, tsconfig.json, next.config.ts, next-env.d.ts
  postcss.config.mjs, .env.example, README.md
docs/
  architecture.md
  ai-architecture.md
  development.md
  naming-review.md
  stage-1-report.md
scripts/
  foundry-release.json
  foundry-paths.mjs
  setup-foundry.mjs
  forge.mjs
```

Root files: `README.md`, `package.json`, `package-lock.json`, `tsconfig.base.json`,
`biome.json`, `.gitignore`, `.gitattributes`, `.editorconfig`, `.npmrc`,
`.nvmrc`, `.prettierrc.json`, `.prettierignore`, and `.env.example`.
All files listed above are new; the remote had no existing tracked files.
Generated outputs, downloaded tools, dependencies, and local environment files
are excluded from Git.

## Dependencies installed

| Area                | Exact versions                                                                                 |
| ------------------- | ---------------------------------------------------------------------------------------------- |
| Contracts           | Foundry 1.8.5 (official release + SHA-256 manifest), solc 0.8.28, OpenZeppelin Contracts 5.6.1 |
| Web runtime         | Next.js 16.4.0, React / React DOM 19.3.0, viem 2.57.3                                          |
| Web styling         | Tailwind CSS / Tailwind PostCSS 4.3.3, PostCSS 8.5.29                                          |
| Agent configuration | Zod 4.6.5                                                                                      |
| Shared tooling      | TypeScript 5.9.3, Biome 2.5.15, Prettier 3.9.9, Vitest 5.0.3                                   |
| Type declarations   | Node 22.20.5, React / React DOM 19.3.0                                                         |

Host verification uses Node.js 22.14.0 and npm CLI 10.9.2. Exact package versions
and registry integrity hashes are committed in the root lockfile. Native Foundry
archives have separately pinned release hashes. No AI-provider SDK or wallet connector is
installed.

## Verification

Verification passed again after a real clean install on Windows with Node.js
22.14.0 and npm 10.9.2. Commands ran from the repository root.

| Command                               | Result                                                                                                       |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `npm install`                         | Passed; dependencies and lockfile installed.                                                                 |
| `npm ci --prefer-offline --no-fund`   | Passed; 96 packages installed, zero vulnerabilities.                                                         |
| `npm run setup:contracts`             | Passed; official Foundry 1.8.5 archive hash verified, executable version verified, repeated setup succeeded. |
| `npm run check`                       | Passed; Prettier, Biome, Forge formatting, both TypeScript projects, tests, and all workspace builds.        |
| `npm audit --audit-level=high`        | Passed; zero vulnerabilities.                                                                                |
| Temporary local production HTTP check | Passed; HTTP 200 with chain ID 10143 and provisional-name content. Server stopped afterward.                 |

All 10 tests passed: two Solidity toolchain tests, three agent configuration
tests, and five network configuration cases. Contract and agent compilation
passed. The Next.js production build succeeded and prerendered the home page
and not-found route as static content. Formatting and Git scope/secret reviews
were also completed before the local commit.

The initial contract compilation compiled 15 Solidity source/dependency files with
solc 0.8.28. The first run emitted a harmless missing global signature-cache warning;
subsequent tests passed without it. No test contacted an RPC or AI provider.

## Five candidate project names

Mandatide, Covenrail, Escrowisp, Spendweft, and Pactquill. No relevant exact-name
AI-agent, crypto, or payments conflict surfaced in the searches performed.
The broader screen found adjacent-name risks for Mandatide (Mandate), Covenrail
(Covenant), and Pactquill (Pact). Escrowisp and Spendweft had lower observed overlap.
This is a preliminary screen, not trademark or domain clearance. Flint itself has
nearby conflicts in agent authorization, agent marketplaces, and payments.
See [the dated naming review and primary sources](naming-review.md). No rename.

## Problems and unresolved decisions

- Sandbox networking and Node filesystem restrictions initially blocked setup.
  Authorized external execution recovered Git and enabled package/tool downloads.
  The normal file patcher rejected the workspace's reparse point, so files were
  written through PowerShell inside the authorized workspace.
- Downloads and Windows tool startup were slow; setup was allowed to finish.
- The initial standard ESLint dependency chain had five high-severity audit
  findings from one unpatched braces advisory. It was removed in favor of Biome;
  the subsequent install reported zero vulnerabilities. No force downgrade or
  advisory suppression was used. CI now audits for high-severity findings.
- After a successful real clean install, npm 10.9.2 still labels
  `@emnapi/runtime` and `@img/sharp-wasm32` as extraneous optional WASM helpers.
  Dependency validation exits successfully and audit reports zero vulnerabilities.
  They reside only in ignored `node_modules`; no helper binaries are committed.
- CI is configured on Windows and Linux but has not run remotely because no push
  is requested. macOS/Linux tool installation is configured, not locally verified.
- Asset support, gross versus net cumulative budget policy, dispute arbitration,
  challenge durations, timeout fallback, ownership recovery, and deployment model
  remain design decisions before Stage 2. See the architecture document.
- Qwen region/model availability and data-handling policy remain unselected. No
  SDK or live provider adapter is installed. No wallet integration is present.
- Public name and project license remain unapproved. Packages are private.

## Stage boundary

There is no smart-contract business logic, live wallet or AI-provider integration,
deployment script, transaction broadcaster, or network deployment. Solidity code
is restricted to a test-only toolchain/dependency smoke harness. Local EVM tests
are not network deployments or security audits.

Stage 2 is not started and requires explicit approval.
