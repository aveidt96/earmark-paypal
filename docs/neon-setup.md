# Earmark Neon setup

Project: `earmark-testnet` (`square-glade-65269089`). Linked branch: `production`
(`br-noisy-frost-barbc8fi`). This setup does not deploy Earmark contracts or hosting.

The official [Neon skill](https://neon.com/.well-known/agent-skills/neon/SKILL.md)
was fetched and followed. Existing project/configuration was reused; no replacement
project, paid service, AI Gateway, Data API, Neon Auth or Function was enabled.

Changes made:

- Installed global Neon CLI 8.3.5 and completed owner-approved interactive login.
- Configured the global Codex Neon MCP entry scoped to this project; no duplicate
  entry was added during the subsequent installation check. Other existing agent
  configuration remains in place. Authentication is outside Git.
- Installed eight project skills for Codex only: neon, neon-postgres,
  neon-postgres-branches, neon-postgres-egress-optimizer, neon-auth,
  neon-functions, neon-object-storage and neon-ai-gateway. Verified the global
  Codex configuration was byte-identical before/after skill installation.
- Added generated `skills-lock.json`. Installed skill content is local tooling
  under `.agents/`, excluded from Git and formatting; no existing skill was removed.
- Linked the supplied production branch in ignored `.neon`.
- Initialized `neon.ts`, then set exactly the owner-specified `defineConfig({})`.
- Installed pinned root dependencies `@neon/config` 1.8.6 and `@neon/env` 1.5.3;
  updated the dependency lockfile.
- `neon config plan` and `neon deploy` both reported **No changes** and only
  Postgres utilized. Deploy pulled `DATABASE_URL`, `DATABASE_URL_UNPOOLED`,
  and `NEON_BRANCH` into ignored `.env.local`. No credentials are documented here.
- Logged setup steps and failures/fixes in HANDOFF.

The skills installer needs Node >=22.20. The existing system Node 22.14 was
preserved. A portable official Node 22.23.3 archive was verified against Node's
published SHA256 (`2b0ff57b049cda1bbcea2240eec20467018713c1efe1f7360c2681859b90ed71`)
and extracted under ignored `.tools/stage-8a`. For later skills updates in
PowerShell, prepend that folder to this shell's PATH before `neon skills update`.
Do not replace your global Node solely to run project tooling.

Neon MCP is configured once for the existing project. Its deferred tool namespace
is now available in this Codex session; no duplicate entry or reinstall is needed.
CLI authentication and project access were independently verified.

Stage 8A application persistence now uses the separately preserved direct URL,
a bounded direct TLS pool and additive schema v1 with an explicit Earmark
testnet/10143/project/production environment binding. The pooled URL remains
unchanged. Migration and repeated migration succeeded; no previous production
table/data was reset. Empty Neon infrastructure policy deployment alone does
not establish application persistence or public deployment.

For branch-first persistence validation, created `stage8a-validation` as an
isolated child of production with inherited Free defaults, a one-day expiry and
`--no-secrets`. Production remained linked; its environment was not checked out
or replaced. An initial request specifying a suspend interval was rejected by
Free-plan restrictions; it created no resource. Validation credentials are in
ignored tooling only. Five persistence tests passed against this child database and local Anvil across the four-test campaign and the separate full-process restart scenario. No public Monad deployment is implied.
