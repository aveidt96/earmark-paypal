# Task07G — Norway public website readiness

Local audit: 2026-11-03. No deployment or Git publication is authorized by this
report. Task07F-R's one real Gemini evaluation is historical evidence and must
not be repeated for this audit.

## Visitor flow

- `/`: Norway default, real Earmark logo, synthetic deterministic purchasing
  conversation, independent policy proposal and human-authorization explanation.
  The displayed $4 historical unused authority is not a new spending mandate.
- `/security`: select **PayPal Agent · Policy** for the synthetic offer comparison
  and four deterministic scenarios: normal purchase, prompt injection, invalid
  delivery commitment, budget exhaustion. **Demo Mode** retains the separately
  labeled recorded legacy EVM walkthroughs.
- `/mandates`, `/payments`, `/activity`: recorded completed PayPal Sandbox evidence
  and accounting, explicitly historical; no replay or current authority.
- **Live Gemini chat** explains that public live access is disabled. Typed live
  responses require the separate authenticated local profile. The public policy
  simulation is not a replay of Task07F-R and is not presented as live inference.
- Classic Light remains available. No checkout approval, capture, wallet action
  or other decorative control grants payment authority.

The PayPal invalid-delivery scenario validates immutable offer commitments and
SLA/checkout terms; it does not claim inspection of delivered goods or
delivery-conditional PayPal escrow.

## Local validation

**PASS for local public-demo functionality and protection. Publication/deployment
is on hold pending Git review/authorization and Vercel dashboard confirmation.**
No critical runtime/security blocker was found; no application code was changed.

| Check                               | Actual result                                                                                             |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Targeted offline tests              | 58 passed across4 files; no skips/failures                                                                |
| Production build / TypeScript       | Passed from `web` with `VERCEL=1` and demo flags                                                          |
| Browser smoke                       | 9 routes,5 widths, both themes/migration,4 recorded and4 PayPal scenarios; no overflow/runtime exceptions |
| Chat loading/rejection/error states | Passed with explicitly mocked browser interception; public live chat stays disabled                       |
| Public access probes                | 11 privileged/live/mutation probes403;5 secret/local-file probes404                                       |
| Credential/source/browser scans     | 339 tracked,408 candidate files,53 browser chunks; zero credential matches and no secret env tracked      |
| Git isolation                       | Agent resolves inside this checkout; project-flint status unchanged                                       |
| Scoped lint                         | **FAIL:**46 existing CSS style warnings and29 informational notes, no reported errors                     |

Lint's `--error-on-warnings` gate is not clean; no unrelated styling refactor was
authorized. This remains a release-quality issue even though the production build
and functional/security checks pass. Vercel's website build above does not invoke
lint. Current `main` has48 modified tracked paths and55 untracked entries, nothing
staged; required new application/security/assets are not yet published.

The actual public checks used no chat interception: synthetic/simulation labels,
comparison on Policies, historical receipt, owner-approval explanation, public
Send disabled and no owner-login input all passed. Mocked chat states in the
separate smoke are test evidence, not public live capabilities. No real Gemini,
PayPal operation, database access/write, reservation or campaign creation occurred.

Local preview: `http://127.0.0.1:3032`, PID10524, build
`NlpOWH-OSouO48j7T3nxi`, with public read-only flags and hosted mode simulated.
Screenshots (ignored local files): `.tools/task07g-checkout.png`,
`.tools/task07g-mandates.png`, `.tools/task07g-activity.png`,
`.tools/task07g-security.png`, `.tools/task07g-mobile.png`. Full check results are
in `.tools/task07g-public-audit.json` and `.tools/task07g-git-verification.json`.

## Vercel WEBSITE checklist

1. Review the intended diff and all required untracked files, especially Norway
   fonts/styles, agent/parser/privacy modules, public route guards and
   `.vercelignore`. Run the credential scan. Do not publish `.tools`, `.env*`,
   local owner credentials, database URLs, private keys or incident evidence.
   Obtain separate authorization before committing/pushing. A connected Git push
   can trigger deployment; configure settings before permitting publication.
2. Confirm the target Vercel project is **earmark-paypal**, using this repository,
   not project-flint. The ignored local link names that project, but remote
   dashboard settings/environment have not been inspected. There is no tracked
   `vercel.json`; this is compatible with Next.js framework detection.
3. Select **Next.js**, Root Directory **web**, Node **22.x** (repository supports
   Node22/npm10), and include source files outside the Root Directory so the
   `agent` workspace and root lockfile are available. Set Install Command
   `npm ci --prefix ..`; Build Command `npm run build` from `web` (its prebuild
   compiles `@flint/agent`). Keep the framework's automatic output handling;
   do not use the root build that also requires Foundry. The exact Vercel install
   environment remains to be confirmed by a separately authorized preview build.
4. Set the nonsecret flags below for **both Preview and Production before build**.
   `NEXT_PUBLIC_DEMO_ONLY` is compiled into the client; runtime changes alone do
   not change an existing deployment. An optional `FLINT_WEB_ORIGIN` can name the
   final HTTPS website for metadata; otherwise Vercel's production URL is used.
5. Do not add Gemini/PayPal keys, local owner/session secrets, database connection
   strings, signer/provider keys, hosted API origins or financial one-shot
   permissions. This website needs no database, worker, PayPal credentials,
   Gemini key, webhook subscription or blockchain deployment.
6. After separate deployment authorization, make a Preview website deployment.
   Check `/`, `/mandates`, `/activity`, `/payments`, `/security`, theme persistence
   and mobile layouts. Confirm `/api/workspace` reports PUBLIC_DEMO_READ_ONLY;
   private agent login/chat/initialize/capture, PayPal test/webhook and workspace
   mutation paths remain403; direct Gemini-mode requests are403. Inspect browser
   assets for secrets and local paths. Repeat for Production before sharing the
   judging URL; no live inference or payment is required for that verification.

```dotenv
NEXT_PUBLIC_DEMO_ONLY=true
EARMARK_PUBLIC_DEMO_ONLY=true
PAYPAL_BACKEND_ENABLED=false
PAYPAL_PAYMENTS_ENABLED=false
PAYPAL_AGENT_CHECKOUT_ENABLED=false
PAYPAL_TEST_CHECKOUT_ENABLED=false
EARMARK_GEMINI_ENABLED=false
AI_ENABLE_NETWORK=false
AGENT_MODEL_PROVIDER=mock
AGENT_MODEL_MODE=mock
EARMARK_ENABLE_TESTNET_EXECUTION=false
```

Preserve `.vercelignore` and Next's tracing exclusions for local secrets/state.
Do not follow the legacy database migration, contract deployment or private
checkout launch instructions in `docs/deployment.md` for this read-only website.

Official references checked for this checklist:
[monorepo source inclusion](https://vercel.com/docs/monorepos/monorepo-faq),
[build settings](https://vercel.com/docs/builds/configure-a-build),
[Node versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions),
[build-time public variables](https://vercel.com/academy/nextjs-foundations/env-and-security).
