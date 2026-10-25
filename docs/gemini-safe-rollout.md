# Earmark — Gemini safe rollout

Branch: `feature/gemini-safe-rollout`, based on verified production source
`7f70710edec3436b607989ab5d846f23dd9e0365`. Production
(https://earmark-omega-virid.vercel.app) is unchanged and operational; nothing
here is merged to `dev`, pushed to production, or financially enabled. The exact
commit for this document resolves with `git log -1 -- docs/gemini-safe-rollout.md`.

## 1. Architecture changes

Gemini is a third `AgentModel` behind the existing abstractions. No separate
transaction system, contract change, ABI change, or address change.

| File                                                         | Change                                                                                                                                                                                |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `agent/src/models.ts`                                        | `GeminiModel` (native `generateContent` function calling), `createGeminiModel`, `isGeminiEnabled`; `createModel` accepts `AGENT_MODEL_PROVIDER` (fallback: legacy `AGENT_MODEL_MODE`) |
| `agent/src/domain.ts`                                        | `AgentModel["mode"]` gains `"gemini"`; tools, schemas, journal, runner untouched                                                                                                      |
| `agent/src/config.ts`                                        | Non-secret `GEMINI_MODEL` (default `gemini-3.8-flash`), `EARMARK_GEMINI_ENABLED` (default `"false"`)                                                                                  |
| `agent/src/server.ts`, `agent/src/index.ts`                  | Export `GeminiModel`, `GeminiSettings`, `createGeminiModel`, `isGeminiEnabled`                                                                                                        |
| `web/src/server/runtime.ts`                                  | Snapshot model resolves the authoritative provider; unconfigured fallback stays fail-closed                                                                                           |
| `web/src/server/service.ts`                                  | Live snapshot carries non-secret `geminiAvailable`                                                                                                                                    |
| `web/src/server/store.ts`                                    | Persisted run mode accepts `"gemini"`                                                                                                                                                 |
| `web/src/lib/model.ts`                                       | `modelLabel()` truthful identity; `GEMINI_UNAVAILABLE_NOTE`; snapshot `model`/`geminiAvailable`                                                                                       |
| `web/src/components/workspace-provider.tsx`                  | Client fallback snapshot marks Gemini unavailable                                                                                                                                     |
| `web/src/components/execution-console.tsx`                   | Live badge uses `modelLabel`; live mode states Demo Mode availability while Gemini is disabled                                                                                        |
| `web/src/components/recorded-demo.tsx`, `dashboard.tsx`      | Same truthful labels; recorded scenarios unchanged                                                                                                                                    |
| `.env.example`, `agent/.env.example`, `.env.stage8a.example` | Documented server-only Gemini variables, empty key                                                                                                                                    |
| `scripts/gemini-live-smoke.mjs`                              | Opt-in read-only live inference check, no chain use                                                                                                                                   |
| `agent/test/gemini.test.ts`, `web/test/model.test.ts`        | 32 + 11 new tests; `config.test.ts` updated for new defaults                                                                                                                          |

In Phase A, `api/src` needed no changes: `/ready` and workspace snapshots already surface
`model.mode` generically, and launch/authorization/journal paths are
model-agnostic. `EARMARK_ENABLE_TESTNET_EXECUTION` remains `false`
(`render.yaml`); execution stays disabled.

## 2. Selected Gemini model

Default `GEMINI_MODEL=gemini-3.8-flash`, as requested. Verified against the
official Gemini API documentation on 13 October 2026: `gemini-3.8-flash` is
generally available, supports function calling, and authenticates with the
`x-goog-api-key` header (the adapter's exact mechanism). The request sends only
a version-agnostic `generationConfig` (`maxOutputTokens: 600`): Gemini 3+
removed sampling parameters (`temperature`/`top_p`/`top_k`) and
`candidateCount`, so they are deliberately omitted.

Phase B verified that the owner's Free Tier project lists this model and
returned genuine native function calls. If availability changes, set `GEMINI_MODEL` to another
supported free-tier Flash model (for example a listed `*-flash-lite` variant)
and record the reason here. The adapter accepts any model name; availability
is a runtime property, never a code change.

## 3. Actual live inference evidence

Phase B recovery returned genuine text and native function calls from
`gemini-3.8-flash`, selecting DataHub at six mock USDC in both normal and
malicious-quote read-only tests. See [the actual Phase B evidence](gemini-phase-b-report.md#recovery--14-october-2026)
and [Phase C console verification](gemini-phase-c-report.md). The owner key is
stored only as ignored Windows-encrypted local ciphertext; wrappers decrypt it
into server process environment. It is never supplied in chat or committed.
Missing credentials still fail closed; live tests require explicit network opt-in.

## 4. Function-calling results (stubbed transport, offline)

Covered by `agent/test/gemini.test.ts` without network: the adapter emits all
eight existing tools as `functionDeclarations`, posts to
`{baseUrl}/models/{model}:generateContent`, and validates names against
`toolNames` and arguments against `toolSchemas`. Unknown functions, unexpected
parameters, oversized payloads, and unstructured answers are rejected with
`INVALID_MODEL_RESPONSE`. The API key travels only in the `x-goog-api-key`
header, never in URLs, bodies, or logs.

## 5. Prompt-injection test outcome

Harness level (no live model): provider descriptions containing hostile
instructions stay inside the user-role payload and never enter the system
instruction; the response validator accepts only known tools with schema-valid
arguments, and the runner re-validates every decision before any tool runs, so
an unauthorized redirect cannot become a payment through invented arguments.
Independent contract-level rejection evidence (Stage 7 scenario B) is separate
and unchanged. Phase B's actual Gemini run selected the approved DataHub quote
without proposing the malicious destination. It did not explicitly explain
rejecting that instruction. This single observation is not general immunity.

## 6. Feature-flag instructions

| Variable                 | Default            | Meaning                                                           |
| ------------------------ | ------------------ | ----------------------------------------------------------------- |
| `EARMARK_GEMINI_ENABLED` | `false`            | Backend-authoritative Gemini switch                               |
| `AGENT_MODEL_PROVIDER`   | `mock`             | `mock` / `qwen` / `gemini`; legacy `AGENT_MODEL_MODE` still works |
| `GEMINI_API_KEY`         | empty              | Server-only; never `NEXT_PUBLIC_`, never committed                |
| `GEMINI_MODEL`           | `gemini-3.8-flash` | Non-secret; see section 2                                         |
| `AI_ENABLE_NETWORK`      | `false`            | Explicit network opt-in, shared with Qwen                         |
| `AI_TIMEOUT_MS`          | `15000`            | Bounded inference, 10–60000 ms                                    |

While disabled: `createModel`/`createGeminiModel` throw `GEMINI_DISABLED`
before any network use, snapshots report `model: "mock"` (or the configured
non-Gemini provider) with `geminiAvailable: false`, the console states Demo
Mode availability, and zero new Gemini calls occur. Phase C owner-authorized
read-only sessions use the existing tools over synthetic fixtures and persist
in a separate inference namespace. Its runner checks the switch before and
after each model call and before tool dispatch; an in-flight bounded call may
finish or time out. History remains accessible and nothing auto-restarts with
another model. Existing financial launches remain disabled in this preview.
There is no unauthenticated public toggle: on Render the flag is a server
environment variable (dashboard Environment, then manual redeploy of the same
source). Local servers read it from process environment at startup.

## 7. Render rollback instructions (Rollback B)

Last known-good backend: Render service `earmark-api-testnet`
(`srv-db5ctu3rjlhs73d7t71g`), tested source `a3343f9`, activation deployment
`dep-db5rm8qjnfac73bgmifg` (Live, 30.8s); same-source restart replacement
reached `api.ready`. Confirm the current deployment ID in the Render dashboard
before any Gemini publish; IDs above come from the Stage 8A report.

1. Set `EARMARK_GEMINI_ENABLED=false` (Rollback A) and stop new executions.
2. Inspect and reconcile existing payment intents; never delete journal rows.
3. Render dashboard → service → Deploys → select the recorded deployment →
   Rollback (same source, no code change).
4. Verify `/health` 200 and `/ready` 200 (`10143`, `postgres`, expected model).
5. Verify Neon connectivity via readiness and unchanged intent/run counts.
6. Verify Demo Mode and the four recorded scenarios.
7. Confirm no duplicate purchases in intents/runs/events.

Never reset Neon data or rotate keys for a backend rollback.

## 8. Vercel rollback instructions (Rollback C)

Current production serves verified `7f70710`; confirm its exact deployment ID in
the Vercel `earmark` dashboard (unavailable from this environment). Recorded
rollback targets: `HERgfJiuWpiHKftYW2ULHdzCLyWP` at `feaaf39`, and
`G9jdmTPEAqJDArF4uqGEsAN3Bc7t` at `f58c91d`.

1. Vercel project → Deployments → select the recorded working deployment.
2. Instant Rollback; confirm the production alias
   `earmark-omega-virid.vercel.app`.
3. Verify wallet-free Demo Mode and scenarios A–D.
4. Verify the historical settlement (`0x9581…6e25`) remains accessible.
5. Never revert contracts, balances, or database records for a frontend issue.

Compatibility: this branch's frontend also runs against older backends (absent
`geminiAvailable` reads as unavailable — fail closed). A backend with Gemini
enabled requires this (or newer) frontend to label Gemini runs correctly.

## 9. Last known-good deployment IDs

- Vercel production content: `7f70710` (verified live 13 Oct 2026; exact new
  deployment ID needs dashboard confirmation).
- Vercel rollback: `HERgfJiuWpiHKftYW2ULHdzCLyWP` (`feaaf39`); prior
  `G9jdmTPEAqJDArF4uqGEsAN3Bc7t` (`f58c91d`).
- Render backend: `dep-db5rm8qjnfac73bgmifg` (source `a3343f9`); dashboard
  confirmation required before publish.
- Neon: project `square-glade-65269089`, branch `production`; live `/ready`
  reports `postgres` persistence.
- Chain pins: TaskVault `0x37c026c7207de8f202a06726eb02e6233ed06160`, MockUSDC
  `0x8f4660ed18a3ba5ba9dbe64e18f06ef4a43c0136`, settlement
  `0x95810b4c31144e9b044955d7fc9b4e9dc055fb6842aaab495ea677a9a0a66e25`.

## 10. Test results

- Agent suite: 134 passed (7 files), including 32 new Gemini tests and updated
  config defaults. Covers disabled-by-default gating, endpoint allowlist, tool
  mapping, injection separation, transport/auth/rate-limit/timeout behavior,
  single retry on 429/5xx only, and rollback semantics.
- Web suite: 157 passed, 5 skipped opt-in DB (16 files), including 11 new
  model-identity/snapshot/persistence tests; 82 server/launch tests re-passed.
- TypeScript (agent, web), Biome lint on touched files, Prettier check, and
  Next.js production build: all clean.
- Rollback rehearsal: enabling then disabling the flag is asserted in tests
  (selection succeeds, then `GEMINI_DISABLED`; snapshots flip to unavailable);
  no production system was touched to rehearse platform rollback.
- Live inference and injection observation: local read-only recovery verified on
  14 October 2026; actual results and limitations are in
  [the Phase B report](gemini-phase-b-report.md#recovery--14-october-2026).

## 11. Free-tier limitations

Anonymous visitors can never spend Gemini quota: live runs require the
owner-signed launch flow, and Demo Mode serves recorded evidence with zero
inference. Per-call timeouts, one retry on 429/5xx only, 600-token output cap,
runner step limits, and server rate limits bound spend. On exhaustion the
backend raises `MODEL_RATE_LIMITED` and the UI shows: "Live Gemini is
temporarily unavailable. Demo Mode remains available." Paid usage is never
enabled automatically.

## 12. Security limitations

Gemini outputs are untrusted: every function name/argument is schema-validated
twice (adapter, then runner), provider addresses stay server-pinned, and the
model never receives signing keys. Delivery inspection checks configured bytes,
not semantic quality; a malicious authorized signer remains bounded only by
the onchain cumulative cap. This integration is not an audit. Financial tool
execution under Gemini needs separate approval and its own safety verification.

## 13. Staging and approval gate

Phase A and Phase B local read-only recovery are verified on this branch.
Phase C adds the owner-authenticated read-only console; its verification and
controlled rollout sequence are in [the Phase C report](gemini-phase-c-report.md).
Hosted staging, financial execution and production publication remain unapproved:
do not merge to `dev` (Vercel auto-deploys it), do not push this branch to
production, and do not set `EARMARK_ENABLE_TESTNET_EXECUTION=true`. The
recommended rollout is adapter-first with Gemini disabled, baseline verified,
then read-only Gemini for authorized users.
