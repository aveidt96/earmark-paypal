# Task 08B — Hackathon deployment readiness

**2026-11-10 · READY WITH ACTIONS.** The local public build is suitable for a
Vercel Preview after the operator verifies the project settings and publishes
the reviewed source. No remote project settings or deployment were changed.

## Architecture

Vercel serves the Next.js site under `web` and its same-origin Node.js Route
Handlers. `@flint/web` compiles `@flint/agent` in `prebuild` and the site build
uses `next build --webpack`. The root npm lockfile, workspace manifests, agent
sources and Norway fonts must be included. There is no tracked `vercel.json`.
Use the website build rather than the root build, which also runs Foundry.

Public policy and recorded evidence run without an external API, worker,
database or provider credential. `api/src` and its Render-origin proxy belong
to the separate legacy Monad worker. Public demo guards return before that proxy
or the workspace database runtime is accessed. `render.yaml` describes an
alternative preview and omits the required public-demo flags. Leave it outside
this release. Neither profile here needs Neon. The local owner chat resolves
authentication, synthetic evaluation and discovery without opening the lazy
durable checkout repository. The separate `paypal:agent:serve` durable launcher
does perform an approved database preflight and is outside the chat-only demo.

## Monad isolation for the PayPal release (Task 08C)

Build both Vercel environments with `NEXT_PUBLIC_DEMO_ONLY=true` and keep
`EARMARK_PUBLIC_DEMO_ONLY=true` on the server. Keep
`EARMARK_ENABLE_TESTNET_EXECUTION=false`. No new release flag is needed.
The public layout does not mount the legacy workspace provider or wallet
navigation. Checkout, Mandates, Purchases, Activity and Policies use the
PayPal policy console or recorded Sandbox receipt in both themes. The public
build does not offer the old escrow resolver, mandate transaction form,
execution details, or recorded Monad security rail. `next.config.ts` replaces
the grouped legacy page entry during `next build --webpack`, so conditional
client references cannot ship legacy wallet chunks. Public workspace and local
evidence APIs respond before loading legacy runtime modules.

Legacy support remains in the repository. `web/src/lib/{network,local-chain,
wallet,payment-resolution}.ts` and the legacy workspace components use viem,
the injected wallet, Monad Testnet chain 10143, the pinned deployment manifest,
and transaction/explorer controls. `web/src/server/runtime.ts`, `api/src` and
the Render proxy are legacy execution paths. Workspace API guards run before
loading them. Solidity/Foundry, deployment manifests, legacy recordings and
the separate legacy worker are retained for non-public builds. The shared
agent npm package is still built, and the PayPal policy uses viem for digest
verification. Neither operation needs a blockchain connection.

Omit the entire legacy chain configuration in Preview and Production:
`MONAD_TESTNET_RPC_URL`, `NEXT_PUBLIC_CHAIN_ID`, `AGENT_CHAIN_ID`,
`AGENT_ENABLE_TESTNET`, `AGENT_RPC_URL`, `TASK_VAULT_ADDRESS`,
`AGENT_EXPECTED_VAULT_ADDRESS`, `AGENT_PAYMENT_TOKEN`,
`AGENT_VAULT_CODE_HASH`, `AGENT_TOKEN_CODE_HASH`, `AGENT_PRIVATE_KEY`,
`SIM_DATAHUB_PRIVATE_KEY`, `SIM_WEATHERCO_PRIVATE_KEY`,
`FLINT_DEPLOYMENT_BLOCK`, `FLINT_STATE_DIR`, `EARMARK_API_URL`,
`EARMARK_DEPLOYMENT`, `EARMARK_DATABASE_ENVIRONMENT`, and
`EARMARK_DEMO_STATE_PATH`. Keep legacy database connection values unset as
already specified. The legacy contract deployment scripts and their inputs
are outside the Vercel website build.

Task 08C verification passed with Monad values and service credentials blanked.
Chromium covered seven public pages, three legacy page `404` responses, both
themes, the four PayPal scenarios and deterministic Judge evaluation. It observed
zero external requests, workspace or local-evidence API calls, injected wallet
probes or runtime exceptions. The public build had 46 browser chunks with zero
legacy markers or pinned contract address matches. None of the 26 client
reference manifests referenced a legacy client module. All 321 focused tests,
formatting, zero-warning lint, typecheck and secret scans passed.

## Environment-variable matrix

Set the public configuration in **both Preview and Production** before building.
Keep the private column on the existing local loopback profile only. The local
owner configuration rejects Vercel and AWS/Lambda and the discovery capability
also excludes Render. There is no supported hosted private owner configuration
for this release.

| Variable                                                                                                                                                         | Classification and consumer                                                                        | Public Vercel                                                     | Private owner chat                                               |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------- |
| `NEXT_PUBLIC_DEMO_ONLY`                                                                                                                                          | Required public build flag. Next layout, navigation and Norway/Judge UI                            | `true` before build                                               | `false`                                                          |
| `EARMARK_PUBLIC_DEMO_ONLY`                                                                                                                                       | Required release server flag. `isPublicDemoOnly` and guarded APIs                                  | `true`                                                            | `false`                                                          |
| `AI_ENABLE_NETWORK`                                                                                                                                              | Server network gate. Gemini model and owner discovery                                              | `false`                                                           | `true`                                                           |
| `EARMARK_GEMINI_ENABLED`                                                                                                                                         | Server model feature gate. Agent and owner chat                                                    | `false`                                                           | `true`                                                           |
| `EARMARK_OFFER_DISCOVERY_ENABLED`                                                                                                                                | Server discovery gate. Owner checkout runtime, Judge and discovery service                         | `false`                                                           | `true`                                                           |
| `EARMARK_JUDGE_LOCAL_GEMINI`                                                                                                                                     | Local-only Judge live gate. `judge-http.ts`                                                        | `false`                                                           | `false`                                                          |
| `PAYPAL_BACKEND_ENABLED`                                                                                                                                         | Server PayPal integration gate. Sandbox config and local owner capability                          | `false`                                                           | `false`                                                          |
| `PAYPAL_PAYMENTS_ENABLED`                                                                                                                                        | Server financial execution gate. PayPal config and private-profile guards                          | `false`                                                           | `false`                                                          |
| `PAYPAL_AGENT_CHECKOUT_ENABLED`                                                                                                                                  | Local-only owner workflow gate. `agent-checkout-config.ts`                                         | `false`                                                           | `true` for the owner chat                                        |
| `PAYPAL_TEST_CHECKOUT_ENABLED`                                                                                                                                   | Sandbox-only `/paypal-test` workflow gate. `test-config.ts`                                        | `false`                                                           | `false`                                                          |
| `EARMARK_ENABLE_TESTNET_EXECUTION`                                                                                                                               | Legacy worker execution gate. Workspace runtime                                                    | `false`                                                           | `false`                                                          |
| `AGENT_MODEL_PROVIDER`                                                                                                                                           | Optional legacy model selector. `agent/src/models.ts`                                              | `mock` as defense in depth                                        | No change needed for Norway                                      |
| `AGENT_MODEL_MODE`                                                                                                                                               | Optional legacy fallback model selector. `agent/src/models.ts`                                     | `mock` as defense in depth                                        | No change needed for Norway                                      |
| `PAYPAL_ENVIRONMENT`                                                                                                                                             | Optional Sandbox environment label. PayPal status and config                                       | `sandbox` or unset, which defaults to Sandbox                     | `sandbox`                                                        |
| `FLINT_WEB_ORIGIN`                                                                                                                                               | Optional nonsecret server origin. Metadata in `layout.tsx` and legacy proxy origin check           | `https://<final-host>` or omit for Vercel production URL fallback | Unset for this flow                                              |
| `NEXT_PUBLIC_CHAIN_ID`                                                                                                                                           | Optional browser-visible legacy chain UI setting. Layout and navigation                            | Unset                                                             | Unset for this flow                                              |
| `EARMARK_DISCOVERY_VALIDATION_TRACE`                                                                                                                             | Optional local-only trace opt-in. Owner checkout HTTP                                              | `false` or unset                                                  | Unset for routine demos                                          |
| `GEMINI_API_KEY`                                                                                                                                                 | Required server-only private research secret. Gemini adapter and discovery collector               | Omit                                                              | Existing approved key                                            |
| `TAVILY_API_KEY`                                                                                                                                                 | Required server-only private research secret. Discovery search                                     | Omit                                                              | Existing approved key                                            |
| `GEMINI_MODEL`                                                                                                                                                   | Server-only model selection. Synthetic adapter and discovery fallback                              | Omit                                                              | Keep the verified local model                                    |
| `GEMINI_COLLECTOR_MODEL`                                                                                                                                         | Optional private Gemini discovery override. `offer-discovery.ts`                                   | Omit                                                              | Keep the verified model or inherit `GEMINI_MODEL`                |
| `AI_TIMEOUT_MS`                                                                                                                                                  | Optional private provider timeout. Model and discovery                                             | Omit                                                              | `60000` or use the existing default                              |
| `GEMINI_BASE_URL`                                                                                                                                                | Optional server model endpoint override for synthetic Gemini, outside the fixed discovery endpoint | Omit                                                              | Keep default                                                     |
| `GEMINI_HTTP_MAX_ATTEMPTS`                                                                                                                                       | Optional synthetic Gemini retry setting. Discovery extraction already hard-codes one attempt       | Omit                                                              | Keep existing local bounded settings                             |
| `PAYPAL_AGENT_ORIGIN`                                                                                                                                            | Required local-only owner origin. Agent checkout config and CSRF                                   | Omit                                                              | `http://127.0.0.1:3032`                                          |
| `PAYPAL_DATABASE_ENVIRONMENT`                                                                                                                                    | Local Sandbox profile marker. Checkout config and PayPal database guard                            | Omit                                                              | `sandbox`, with no database URL for chat                         |
| `PAYPAL_AGENT_CAMPAIGN`                                                                                                                                          | Optional local profile namespace. Agent checkout config                                            | Omit                                                              | Keep the existing verified namespace. No mandate is used by chat |
| `PAYPAL_CLIENT_ID`                                                                                                                                               | Local Sandbox app identifier. Owner-profile merchant binding                                       | Omit                                                              | Existing confirmed US Sandbox app ID, server only                |
| `PAYPAL_MERCHANT_ID`                                                                                                                                             | Local Sandbox seller identifier. Owner-profile merchant binding                                    | Omit                                                              | Existing confirmed US Sandbox seller, server only                |
| `PAYPAL_AGENT_MERCHANT_BINDING`                                                                                                                                  | Required local-only binding. Checkout config verifies app/seller association                       | Omit                                                              | Existing validated binding, server only                          |
| `PAYPAL_TEST_OWNER_ID`                                                                                                                                           | Required local-only owner identifier. Checkout config and owner session                            | Omit                                                              | Existing configured owner, server only                           |
| `PAYPAL_TEST_LOGIN_SECRET`                                                                                                                                       | Required server-only local owner login secret. `TestOwnerAuth`                                     | Omit                                                              | Existing protected secret                                        |
| `PAYPAL_TEST_SESSION_SECRET`                                                                                                                                     | Required server-only local session signing secret. `TestOwnerAuth`                                 | Omit                                                              | Existing protected secret                                        |
| `PAYPAL_TEST_SESSION_EPOCH`                                                                                                                                      | Required local session instance value. Agent checkout config                                       | Omit                                                              | Existing runner-generated epoch                                  |
| `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, `PAYPAL_BASE_URL`                                                                                                   | Server-only Sandbox OAuth/webhook settings. PayPal config/client                                   | Omit                                                              | Omit for chat-only demo                                          |
| `PAYPAL_DATABASE_URL`, `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `AGENT_DATABASE_URL`, `PAYPAL_TEST_DATABASE_URL`                                                 | Server-only database or test connection settings. PayPal PostgreSQL and legacy worker/runtime      | Omit                                                              | Omit for chat-only demo                                          |
| `EARMARK_JUDGE_LOGIN_SECRET`, `EARMARK_JUDGE_SESSION_SECRET`                                                                                                     | Server-only local Judge credentials. Judge route                                                   | Omit                                                              | Omit for owner-only demo                                         |
| `EARMARK_API_URL`, `EARMARK_DEPLOYMENT`, `EARMARK_DATABASE_ENVIRONMENT`, `FLINT_STATE_DIR`, `EARMARK_DEMO_STATE_PATH`                                            | Legacy proxy, database or local diagnostic settings                                                | Omit                                                              | Omit for chat-only demo                                          |
| `PAYPAL_AGENT_CHECKOUT_EXECUTION`, `PAYPAL_AGENT_CHECKOUT_MANDATE_ID`, `PAYPAL_AGENT_BUYER_SEPARATE`, `PAYPAL_TEST_US_ORDER_ONCE`, `PAYPAL_TEST_US_CAPTURE_ONCE` | Sandbox-only execution permissions or bindings. Agent payment and test checkout guards             | Omit                                                              | Omit for chat-only demo                                          |

Leave all original/alternate PayPal OAuth credentials, wallet tokens, legacy
`AI_API_KEY`, `AGENT_PRIVATE_KEY`, provider signing keys, chain/RPC config,
Sandbox integration test flags and private state outside both demo builds.
Payment tokens have no public setting and must stay server-side. Vercel's
`VERCEL` and `VERCEL_PROJECT_PRODUCTION_URL` are platform-provided. Set the
runtime to Node 22.x and use the repository's supported npm version.

## Routes, data and hostname

| Surface                                                                                                                   | Expected public result                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `/`, `/mandates`, `/activity`, `/payments`, `/security`                                                                   | `200` with demo UI. Judge evaluation and historical evidence are separately labeled                                        |
| `/agent-checkout`, `/paypal-test`                                                                                         | `200` read-only/disabled UI shells. No owner or payment API capability                                                     |
| `/api/judge-sandbox`                                                                                                      | `200` capability metadata and same-origin `mode=policy` evaluation. `403` for live Gemini, discovery and local Judge login |
| `/api/paypal/agent`                                                                                                       | `200` deterministic synthetic policy. `403` for Gemini mode                                                                |
| `/api/integrations/paypal`, `/api/workspace`                                                                              | `200` with disabled Sandbox metadata or `PUBLIC_DEMO_READ_ONLY` workspace snapshot                                         |
| `/api/paypal/agent-checkout[/<action>]`, `/api/paypal/test[/<action>]`, `/api/paypal/webhooks`, `/api/workspace/<action>` | Supported privileged methods return `403` in public mode. Unsupported routes or methods can return `404` or `405`          |
| `/resolve`, `/mandates/new`, `/executions/<id>`                                                                           | `404` in the public build. No links to the legacy transaction routes                                                       |
| `/api/security-demos`                                                                                                     | `404` in public mode. Local fixture evidence stays loopback-only                                                           |
| `.tools`, `.env*`, `.vercel`, ignored local auth and traces, deployment and diagnostic runners                            | Keep private. They must never be served as public assets                                                                   |

The final HTTPS domain needs no CORS allowlist, PayPal callback, webhook,
Neon allowlist or OAuth registration for this public demo. All active demo APIs
are same-origin. Set `FLINT_WEB_ORIGIN=https://<final-host>` if explicit canonical
metadata is wanted. Judge POST checks the request `Origin` against its own
origin. Owner mutations additionally use the pinned loopback origin, signed
`HttpOnly` and `SameSite=Lax` cookies, and CSRF. `Secure` is conditional on an
HTTPS configured origin, while the authorized loopback profile uses HTTP. Do
not replace loopback with the public hostname. Existing test PayPal return and
cancel URLs point to `/paypal-test?paypal_return=approved` and `cancelled` on the
configured loopback origin. The old agent flow returns to loopback
`/agent-checkout`. Leave provider-side settings unchanged. Merchant source
links use HTTPS, `noopener noreferrer` and `no-referrer`.

Public demo state is deterministic synthetic policy plus static historical
Sandbox receipt and accounting. The receipt contains the recorded Sandbox
order/capture references, timestamp and amounts, with no buyer credentials or
payment token. Confirm those historical references are intended for publication.
Live research exists only in authenticated local Norway. Manual approval is
ephemeral browser state and remains `not paid`. Public endpoint guards,
disabled flags, absent storage and provider credentials, and existing
execution/expiry checks prevent historical campaigns from becoming executable.
Autonomous saved-Wallet payment remains unresolved and disabled.

## Local release evidence

- 225 focused tests across 12 suites passed with external fetch blocked.
  Repository lint passed with zero warnings. Agent and web typechecks and
  targeted formatting passed. A full formatting check still flags the existing
  long-form handoff, which was already flagged before this task's entry.
- A credential-blank runtime passed 35 public route and access checks. The
  first expanded artifact scan found a literal local owner-auth filename in
  two client chunks. Two help strings were updated and the existing browser
  boundary check was extended. The new check reproduced the failure on the
  old bundle before the final rebuild.
- The credential-blank public production build passed. The final scans found
  zero credential matches across 339 tracked files, 421 publication candidates
  and 54 browser JavaScript chunks. The extended scan found zero local paths,
  private trace markers or provider endpoint strings in 56 browser assets.
  None of the 26 Next.js route trace manifests referenced a private artifact.
- Chromium smoke passed across nine routes with no runtime exceptions and no
  external requests. The smoke exercised public deterministic policy, the
  live/owner denials, disabled payments and responsive Norway layouts.
- No remote deployment settings, provider state or financial records were
  touched. A preview from the final committed publication set remains a
  manual release check.

## Manual checklist

1. Confirm the existing `earmark-paypal` Vercel project, repository connection,
   Preview and Production targets, Production branch, auto-deploy settings,
   ignored-build behavior and any existing environment overrides. The repository
   establishes the intended architecture. Dashboard values remain unverified.
2. Configure the public column for Preview and Production. Omit all private
   settings and credentials. Use the Next.js preset, Root Directory `web`, Node
   `22.x`, source outside the root enabled, and Next-managed output. Preserve a
   known-good workspace-aware install command. From the repo root the reference
   install/build is `npm ci --include=dev` then
   `npm run build --workspace @flint/web`. The Vercel build from `web` is
   `npm run build`, which runs the agent prebuild. Keep the root npm lockfile and
   all required workspace sources in the build.
3. Review the current Git publication set and staged credential/whitespace
   checks before separate authorization to publish. The local worktree contains
   required untracked UI/agent sources and `.vercelignore`. Do not publish local
   environment files, credentials, `.tools`, diagnostic artifacts, or local
   linkage. Git-connected pushes can trigger deployment, so verify settings first.
4. With separate deployment authorization, use the Vercel dashboard to create a
   Preview from the reviewed, published branch or commit. After it passes, use
   the approved Production deployment/promotion workflow. Configure the final
   HTTPS domain in Vercel and the optional canonical origin before building the
   final deployment. No provider callback changes are needed.
5. Smoke the final URL on desktop and mobile. Verify deterministic Judge
   evaluation, distinct historical receipt, no assisted checkout in Judge,
   disabled payment controls, 403 on live/owner/payment APIs, 404 on diagnostic
   artifacts and no private data or credentials in the browser.
6. If the private live demo fails, stop the owner runner or set
   `EARMARK_OFFER_DISCOVERY_ENABLED=false` and `AI_ENABLE_NETWORK=false` and
   restart it. Switch the presentation to deterministic Judge mode. For a public
   deployment regression, restore a verified read-only Vercel deployment, or
   rebuild the last reviewed release with both demo flags. A rollback restores
   the older build and its associated settings, so smoke the restored URL.

Official platform references: [monorepo source inclusion](https://vercel.com/docs/monorepos/monorepo-faq),
[Git deployment triggers](https://vercel.com/docs/git),
[build settings](https://vercel.com/docs/builds/configure-a-build),
and [rollback behavior](https://vercel.com/docs/instant-rollback).
