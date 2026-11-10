# Task05A — Gemini INVALID_MODEL_RESPONSE diagnosis

Session: **2026-10-28**. The parser defect is fixed. Real Google authentication,
native multi-turn function calling and independent policy validation of a
**synthetic $6 proposal** passed. No actual-owner authorization, durable pending
intent, database write, financial reservation or PayPal request occurred.

## Confirmed root cause and error path

The ordinary command follows:

`scripts/paypal-agent-prepare.ts --evaluate` → authenticated local
`agent-checkout/evaluate` → `inferPendingAgentIntent` →
`runPayPalPurchasingAgent` → `GeminiModel.decide`.

The CLI reports the server's sanitized error code. In the original adapter,
successful HTTP responses entered a broad parsing catch. After five valid native
tool calls, Gemini returned a single candidate with **STOP** and a **Markdown
JSON-fenced finish object**. The enclosed object passed the existing strict finish
schema after removing only the fence; its summary length was 240. The original
`JSON.parse(content)` rejected the backticks and the catch converted that syntax
error to `INVALID_MODEL_RESPONSE`. The failure was in final-answer parsing, after
a valid proposal, not in API authentication, tool argument validation or payment
policy. This synthetic reproduction establishes a concrete cause matching the
reported error; the user's original raw response was not retained or inspected.

## Environment and actual API evidence

The existing Next.js-compatible loader loaded **web/.env.local**.
Presence/equality checks confirmed both `GEMINI_API_KEY` and `GEMINI_MODEL`
matched the parsed local file. Neither value was printed or changed. The
configured model's authenticated metadata GET returned **200** and advertised
`generateContent`. Actual native tool calls demonstrate the required custom
JSON-schema function-calling features; no configured-model substitution occurred.

Automatic approval review initially rejected a diagnostic containing real
mandate observations. The user selected **synthetic diagnostic data only**.
The revised script has no database, auth-file, merchant-profile or PayPal
transport imports. It uses explicit synthetic owner, merchant, mandate and catalog
fixtures, keeping the existing credential solely in Google's authentication header.
The rejected command sent no request.

Three controlled stages actually ran:

| Stage                                        | Google metadata GET | generateContent POSTs | Actual result                                          |
| -------------------------------------------- | ------------------- | --------------------- | ------------------------------------------------------ |
| Initial one-call capability probe            | 1 × 200             | 1 × 200               | readSpendingMandate; native schema valid               |
| Full synthetic reproduction before fence fix | 1 × 200             | 6 × 200               | Five valid calls; INVALID_FINISH_JSON at fenced finish |
| Single final synthetic run after fence fix   | 1 × 200             | 6 × 200               | LIVE_SYNTHETIC_PROPOSAL_POLICY_VALIDATED               |

Total: **3 metadata GETs and 13 generation POSTs**, no retry, API/quota/auth error,
safety block or truncation observed. Each generation returned **one candidate**
and **finishReason STOP**; error category and block reason were null.

Both full runs returned, in order:

1. `readSpendingMandate` — arguments valid.
2. `listApprovedMerchants` — arguments valid.
3. `compareEligibleOffers` — arguments valid.
4. `proposePurchase` — arguments valid against strict offerId/reason schema.
5. `readAuthorizedPaymentStatus` — arguments valid.
6. Finish — initial wrapper rejected, final response strictly valid (206-character
   summary, no fence in the final run).

The final live model proposed the canonical synthetic 600-minor-unit USD offer.
Independent canonical policy, identity, allowlist, budget, currency, commitment,
suitability and immutable-intent checks all passed. The returned in-memory intent
had ownerAuthorized=false, fundsReserved=false and null PayPal IDs. This is
**real inference over synthetic fixtures**, not real merchant procurement or
authorization under the persisted owner campaign.

Only sanitized status/classification/count/name/boolean/length metadata is saved
to ignored `.tools/paypal-agent-diagnostic-probe.json`,
`.tools/paypal-agent-diagnostic-reproduction.json` and
`.tools/paypal-agent-diagnostic-verify.json`. No raw prompts, response text,
arguments, signatures, credentials or authentication headers are saved or printed.

## Implementation and strictness

- `agent/src/gemini-response.ts`: new bounded parser and sanitized
  `GeminiResponseError.diagnostic`. Distinguishes malformed JSON, invalid envelope,
  safety blocks, MAX_TOKENS truncation, malformed function calls, unsupported finish
  reasons, multiple/unknown calls, invalid tool arguments, missing output and
  invalid finish JSON/schema. Existing public INVALID_MODEL_RESPONSE code remains.
  Accepts only raw finish JSON or one complete json/unlabelled Markdown fence
  around a strict finish object. It does not repair JSON, accept surrounding prose,
  allow extra fields or accept text-encoded purchase/tool calls.
- `agent/src/models.ts`: uses the parser; pending conversation state is installed
  only after tool/schema validation. HTTP/auth/rate-limit/transport errors retain
  their separate existing codes and bounded retry/timeout behavior.
- `agent/src/server.ts`: exports sanitized diagnostic error/type.
- `web/src/server/paypal/agent.ts`: asks for one tool per response and raw finish
  JSON without Markdown; all canonical purchase/policy schemas remain unchanged.
- `scripts/paypal-agent-diagnose.ts`: explicit environment/probe/verify modes,
  official Google endpoint only, synthetic fixture only, bounded inference and
  sanitized reports. It deliberately bypasses no owner financial authorization:
  it has no real purchasing authority and cannot persist or execute a purchase.
- `agent/test/gemini-response.test.ts` and
  `web/test/paypal-agent-checkout.test.ts`: regressions for the reproduced wrapper,
  strict malicious/invalid variants, protocol and zero-reservation policy flow.
- `HANDOFF-PAYPAL.md` and this report record actual results and limitations.

The adapter already preserved the raw model content and call IDs. Regressions now
assert exact part order, opaque thoughtSignature retention and matching
functionResponse.id in the next request. No signatures are fabricated, decoded,
logged or omitted. The live sequential tool conversation also completed.

Google references consulted:
[Native function calling](https://ai.google.dev/gemini-api/docs/generate-content/function-calling.md)
and [thought signatures](https://ai.google.dev/gemini-api/docs/generate-content/thought-signatures).
For manually managed REST history, keep original signed parts and match call IDs.

## Checks and remaining operational limits

Focused Gemini tests: **65 passed**. PayPal web tests: **259 passed, 20 skipped**
(opt-in database/OAuth suites). Root workspace TypeScript and strict standalone
diagnostic-script TypeScript passed. Root production build, full lint (Biome 248
files and Foundry fmt), full format check and git diff --check passed. Additional
shared Gemini web tests passed 30 cases (14 overlap PayPal). Isolated Anvil retry
passed 29/29. Actual-value secret scan passed 339 tracked/362 candidate files and 51
browser chunks, zero matches; browser credential-boundary scan also passed 51 chunks.

An earlier broader agent run passed 134 cases but its 29 local EVM integration
cases were skipped when Anvil startup exceeded its 30-second beforeAll timeout;
the suite therefore failed. This was not a Gemini or PayPal failure. Initial lint
found an untyped diagnostic variable; the explicit sanitized diagnostic type fixed
it and the subsequent Biome error-level check passed. No tests, schemas or timeout
assertions were weakened.

The ordinary `paypal:agent:live` command was **not rerun**: it calls initialize and
durable evaluation markers, contrary to this session's no-database-mutation
restriction. No local server was restarted; its already-running build may still
contain the old parser. A later authorized operational task must review the
persisted campaign's immutable expiry and any FAILED/RUNNING marker from the
user's attempt, without deleting journals or resetting the mandate. Task05A's
durable actual-owner live intent remains unverified here.

Use these explicit synthetic-only diagnostics when authorized:

```powershell
node --conditions=react-server --import tsx scripts/paypal-agent-diagnose.ts --environment
node --conditions=react-server --import tsx scripts/paypal-agent-diagnose.ts --probe
node --conditions=react-server --import tsx scripts/paypal-agent-diagnose.ts --verify
```

No credential/dependency/lockfile, original-source, deployment, commit or push was
changed. Persistent financial rows were neither read nor written in this session;
previous historical ledger results remain historical, not newly verified.
