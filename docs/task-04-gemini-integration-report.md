# Task 04 — Gemini AI Purchasing Agent + PayPal Authorization Integration Report

**Date:** 2026-04-12
**Milestone:** Codex Task 04 — Gemini AI Agent + PayPal Authorization Integration
**Payment Execution Boundary:** **NO NEW PAYPAL PAYMENT EXECUTED.** All agent evaluations stop at server-side policy authorization.

---

## 1. Real Gemini Functionality Implemented

We integrated a real Google Gemini-powered purchasing agent workflow with Earmark's existing PayPal policy engine and repository layer by extending [`agent/src/models.ts`](../agent/src/models.ts) and adding [`web/src/server/paypal/agent.ts`](../web/src/server/paypal/agent.ts) and [`web/src/lib/paypal-agent.ts`](../web/src/lib/paypal-agent.ts):

- **Native Google Gemini `generateContent` Integration:** Reuses [`GeminiModel`](../agent/src/models.ts) over the official `POST /v1beta/models/{model}:generateContent` endpoint (`https://generativelanguage.googleapis.com/v1beta` or loopback test transport), authenticated exclusively on the server via the `x-goog-api-key` header.
- **Custom Tool Declarations on `GeminiModel`:** Extended `GeminiSettings` with `systemInstruction` and `customTools: readonly CustomToolDefinition[]` so the same hardened `GeminiModel` class (host allowlist, `redirect: "error"`, `thinkingConfig: { thinkingLevel: "low" }`, `maxOutputTokens: 600`, single retry on HTTP `429`/`5xx`, `bounded` abort timeout, multi-turn `conversation` history with `toolResult`, and strict Zod validation) drives both legacy EVM read-only sessions and the new PayPal purchasing agent workflow.
- **Agent Capabilities Implemented:**
  1. Receives a structured, server-sanitized purchasing objective (`PayPalPurchasingObjective`: required dataset `weather-v1`, maximum SLA `15` minutes, target currency `USD`, and reference cap in integer minor units).
  2. Reads permitted spending mandate details (`readSpendingMandate`) in integer minor units (`capMinor`, `perTransactionMinor`, `reservedMinor`, `consumedMinor`, `availableMinor`, `status`, `expiresAt`, `merchants`).
  3. Lists a bounded catalog of merchant offers (`listApprovedMerchants`) with explicit `syntheticCatalog: true` and untrusted-description warnings.
  4. Compares price, delivery SLA, commitment digest integrity, and mandate eligibility across candidate offers (`compareEligibleOffers`).
  5. Selects the lowest-cost eligible provider offer and explains its decision.
  6. Submits a strictly validated purchase proposal (`proposePurchase`) to Earmark's server-side policy engine without creating or capturing any PayPal order.
  7. Reads previously authorized payment status (`readAuthorizedPaymentStatus`), including the immutable Task 03G completed US capture (`52C23729CU714125M`) and Task 03C held reservation (`9N317079B4816951W`).
  8. Reports `NO_ELIGIBLE_PROVIDER` with exact rejection reasons when no offer satisfies the mandate and task requirements (e.g., under `BUDGET_EXHAUSTED` or `MANDATE_EXPIRED`).
- **Fail-Closed Credential Handling (No Silent Mock Substitution):** When `mode: "gemini"` is requested and `EARMARK_GEMINI_ENABLED !== "true"` or `GEMINI_API_KEY` is absent, `createPayPalGeminiModel` and `evaluatePayPalAgentScenario` fail closed with `GEMINI_DISABLED` or `MISSING_MODEL_CONFIGURATION`. The deterministic simulator (`DeterministicPayPalPolicyModel`) is never substituted as a fake live Gemini run.

---

## 2. Tools and Function Schemas

All 5 agent tools are defined in [`paypalAgentToolSchemas`](../web/src/server/paypal/agent.ts) using `z.strictObject(...)` (which compiles to `additionalProperties: false` via `z.toJSONSchema(..., { io: "input" })` with `$schema` stripped before sending to Gemini):

| Tool Name                     | Input Schema (`z.strictObject`)                        | Purpose & Returned View                                                                                                                                                                                                                                                                |
| ----------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `readSpendingMandate`         | `{}`                                                   | Returns active evaluation mandate ID, `ownerId`, `agentId`, `currency`, `capMinor`, `perTransactionMinor`, `reservedMinor`, `consumedMinor`, `availableMinor`, `status`, `expiresAt`, and `merchants`.                                                                                 |
| `listApprovedMerchants`       | `{ merchantId?: string (1..64) }`                      | Returns the bounded synthetic merchant offer catalog (`syntheticCatalog: true`), mandate allowlist membership (`approvedByMandate`), integer `priceMinor`, `currency`, `deliverySlaMinutes`, `qualityScore`, `deliveryCommitment`, `expectedArtifactHash`, and `untrustedDescription`. |
| `compareEligibleOffers`       | `{ offerIds?: string[1..8] }`                          | Evaluates candidate offers against task suitability, commitment integrity, and all mandate policy rules; returns ranked `eligibleOffers`, `rejectedOffers` with exact policy codes, and `recommendedOfferId`.                                                                          |
| `proposePurchase`             | `{ offerId: string (1..64), reason: string (1..500) }` | Binds the proposal to the server's immutable catalog record for `offerId` and submits it to `PayPalAgentProposalService.proposePurchase`, returning `PROPOSAL_AUTHORIZED_NO_ORDER_CREATED` or `PROPOSAL_REJECTED`.                                                                     |
| `readAuthorizedPaymentStatus` | `{}`                                                   | Returns current proposal authorization status (`paypalOrderCreated: false`, `paypalCaptureExecuted: false`) and the read-only historical anchor (`72936380818559054` / `52C23729CU714125M` `COMPLETED`, `9N317079B4816951W` held).                                                     |

### Restricted Authority & Redaction Boundary

- **Forbidden Operations Blocked (`FORBIDDEN_AGENT_TOOL`):** The tool contract explicitly blocks `createOrder`, `captureOrder`, `approveOrder`, `approvePayment`, `releaseReservation`, `issueRefund`, `createPayout`, `overridePolicy`, `createMerchant`, `queryDatabase`, and `getPayPalAccessToken`.
- **Sensitive Material Redaction (`assertNoSensitiveMaterialInAgentPayload`):** Every prompt payload and tool result is scanned before model transmission to ensure zero exposure of `PAYPAL_CLIENT_SECRET`, OAuth `Bearer` tokens, `postgresql://` connection strings, or internal `/v2/checkout/orders/.../capture` endpoints.

---

## 3. Agent-to-Policy Interaction

Agent purchase proposals in [`PayPalAgentProposalService.proposePurchase`](../web/src/server/paypal/agent.ts) connect directly to Earmark's canonical server-side PayPal policy engine ([`authorize`](../web/src/server/paypal/policy.ts), [`requireIdentity`](../web/src/server/paypal/policy.ts), and [`PayPalPaymentService.reserve`](../web/src/server/paypal/service.ts)):

1. **Historical Mandate Isolation (`COMPLETED_MANDATE_REUSE_FORBIDDEN`):** Any attempt to reuse Task 03G's completed US mandate (`889b9c4a-b875-5de9-a354-18a037d41f52`) or Task 03C's held Nigerian mandate (`8fb8ada6-ad12-5bc8-ac4c-90e6a07ed064`) is immediately rejected.
2. **Server-Derived Caller Identity (`MANDATE_OWNERSHIP_MISMATCH`, `UNAUTHORIZED_AGENT`):** `Principal` (`ownerId`, `subjectId`, `role`) is bound on the server and checked via `requireIdentity(actor, mandate)`.
3. **Mandate Lifecycle & Expiry (`MANDATE_INACTIVE`, `MANDATE_EXPIRED`):** Verified against `mandate.status === "ACTIVE"` and `Date.parse(mandate.expiresAt) > now`.
4. **Approved Merchant Allowlist (`UNAPPROVED_MERCHANT`):** `mandate.merchants.includes(offer.merchantId)`.
5. **Permitted Currency (`CURRENCY_MISMATCH`):** `offer.currency === mandate.currency`.
6. **Maximum Transaction Size (`TRANSACTION_LIMIT_EXCEEDED`):** Exact `BigInt(offer.priceMinor) <= BigInt(mandate.perTransactionMinor)` comparison in integer minor units.
7. **Remaining Spending Cap (`BUDGET_EXHAUSTED`):** Exact `BigInt(offer.priceMinor) <= BigInt(mandate.capMinor) - BigInt(mandate.reservedMinor) - BigInt(mandate.consumedMinor)`.
8. **Immutable Payment Terms & Delivery Commitment (`INVALID_DELIVERY_COMMITMENT`, `OBJECTIVE_MISMATCH`, `UNKNOWN_OFFER_ID`):** Price, currency, merchant ID, and commitment digest are looked up from the server's immutable offer catalog by `offerId`; the agent cannot supply or override payment terms.
9. **Idempotency & Concurrency Locking (`IDEMPOTENCY_CONFLICT`):** Valid proposals call `PayPalPaymentService.reserve` inside `repository.mutate(mandateId, { purchaseKey }, ...)` (serialized by an in-memory promise mutex in `IsolatedAgentPaymentRepository` or `SELECT ... FOR UPDATE` in `PostgresPaymentRepository`). Replaying the same `purchaseKey` with identical terms is idempotent; changing the offer or amount under the same `purchaseKey` throws `IDEMPOTENCY_CONFLICT`.

---

## 4. UI Integration

We integrated the PayPal Purchasing Agent & Policy Console into [`web/src/components/gemini-console.tsx`](../web/src/components/gemini-console.tsx) (`PayPalAgentConsole` inside `ExecutionWorkspace`) and exposed the server route handler [`web/src/app/api/paypal/agent/route.ts`](../web/src/app/api/paypal/agent/route.ts):

- Preserves the existing visual design, glassmorphism layout, `Demo Mode` (`A — Normal Purchase`, `B — Prompt Injection`, `C — Invalid Delivery`, `D — Budget Exhaustion`), and legacy `Live Gemini` owner-wallet view.
- Adds the **`PayPal Agent · Policy`** mode button in the Execution Console mode bar, allowing safe interactive evaluation of all 7 security scenarios (`P1`–`P7`) without creating PayPal orders:
  - `P1 — Normal Provider Comparison` (`\$4.00` vs `\$6.00` USD approved offers)
  - `P2 — Merchant Prompt Injection` (adversarial override text in merchant description)
  - `P3 — Unauthorized Merchant Selection` (`\$3.00` USD unlisted merchant offer)
  - `P4 — Budget Exhaustion` (`\$2.00` USD remaining cap vs `\$4.00` USD lowest offer)
  - `P5 — Expired Spending Mandate`
  - `P6 — Currency Mismatch` (`EUR` offer against `USD` mandate)
  - `P7 — Fabricated Delivery Commitment` (tampered commitment hash)
- Displays all required telemetry: purchasing objective, evaluated offers with integer minor-unit price comparison, agent recommendation and explanation, 10-point server policy check breakdown, evaluation mandate budget counters, read-only Task 03G/03C historical records, step-by-step provider/decision trace, and explicit `REAL_GEMINI_API_INFERENCE` vs `DETERMINISTIC_POLICY_SIMULATION` vs `GEMINI_BLOCKED_MISSING_CREDENTIALS` and `Synthetic Merchant Catalog` labels.

---

## 5. Verified Real Inference Tests

- **Live Environment Credential Status:** In the current local workspace (`web/.env.local`), `GEMINI_API_KEY`, `EARMARK_GEMINI_ENABLED`, and `AI_ENABLE_NETWORK` are **not configured**. In accordance with project rules, no live external Google Gemini network call is claimed when `GEMINI_API_KEY` is absent in the environment.
- **Verified `GeminiModel` Native `generateContent` Execution:**
  - [`agent/test/gemini.test.ts`](../agent/test/gemini.test.ts) and [`web/test/paypal-gemini-agent.test.ts`](../web/test/paypal-gemini-agent.test.ts) execute the real `GeminiModel` adapter (`POST https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent`) across full 6-turn tool-calling conversations (`readSpendingMandate` -> `listApprovedMerchants` -> `compareEligibleOffers` -> `proposePurchase` -> `readAuthorizedPaymentStatus` -> `finish`), verifying request headers (`x-goog-api-key`), JSON Schema tool declarations (`parametersJsonSchema` without `$schema`), `thinkingConfig: { thinkingLevel: "low" }`, `functionCall` / `functionResponse` history correlation, and server-side policy authorization.
  - When `mode: "gemini"` is invoked without `GEMINI_API_KEY`, the system is verified to fail closed (`GEMINI_DISABLED` / `MISSING_MODEL_CONFIGURATION` / `GEMINI_BLOCKED_MISSING_CREDENTIALS`) without substituting the mock adapter.

---

## 6. Security Test Results

All 14 security and resilience scenarios are tested and passing in [`web/test/paypal-gemini-agent.test.ts`](../web/test/paypal-gemini-agent.test.ts) and [`web/test/paypal-database.integration.test.ts`](../web/test/paypal-database.integration.test.ts):

| Security Scenario                                                                                 | Expected Verdict / Error Code                                                                | Budget / Payment Side Effects                                             | Result |
| ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------ |
| 1. Normal provider comparison (`\$4.00` vs `\$6.00` USD)                                          | `PROPOSAL_AUTHORIZED_NO_ORDER_CREATED` (`AUTHORIZED_NO_ORDER_EXECUTION`)                     | `400` minor reserved in isolated mandate; `0` PayPal orders               | PASS   |
| 2. Prompt injection in merchant description                                                       | `PROPOSAL_AUTHORIZED_NO_ORDER_CREATED` (injection ignored; `\$4.00` offer selected)          | `400` minor reserved in isolated mandate; `0` PayPal orders               | PASS   |
| 3. Malicious tool-call arguments & forbidden tools                                                | `INVALID_TOOL_ARGUMENTS` / `FORBIDDEN_AGENT_TOOL` / `INVALID_TOOL_NAME`                      | `0` reserved, `0` consumed, `0` PayPal orders                             | PASS   |
| 4. Unauthorized merchant selection (`\$3.00` unlisted)                                            | `PROPOSAL_REJECTED` (`UNAPPROVED_MERCHANT`)                                                  | `0` reserved, `0` consumed, `0` PayPal orders                             | PASS   |
| 5. Budget exhaustion (`\$2.00` available vs `\$4.00` offer) & per-tx limit (`\$7.50` vs `\$6.00`) | `NO_ELIGIBLE_PROVIDER` / `BUDGET_EXHAUSTED` / `TRANSACTION_LIMIT_EXCEEDED`                   | `0` reserved, `0` consumed, `0` PayPal orders                             | PASS   |
| 6. Expired or revoked mandates & spoofed identity                                                 | `MANDATE_EXPIRED` / `MANDATE_INACTIVE` / `MANDATE_OWNERSHIP_MISMATCH` / `UNAUTHORIZED_AGENT` | `0` reserved, `0` consumed, `0` PayPal orders                             | PASS   |
| 7. Currency mismatch (`EUR` offer vs `USD` mandate)                                               | `PROPOSAL_REJECTED` (`CURRENCY_MISMATCH`)                                                    | `0` reserved, `0` consumed, `0` PayPal orders                             | PASS   |
| 8. Fabricated delivery commitment digest                                                          | `PROPOSAL_REJECTED` (`INVALID_DELIVERY_COMMITMENT`)                                          | `0` reserved, `0` consumed, `0` PayPal orders                             | PASS   |
| 9. Duplicate agent proposals (same vs conflicting terms)                                          | Idempotent replay on match; `IDEMPOTENCY_CONFLICT` on mismatch                               | Single `400` minor reservation; `0` PayPal orders                         | PASS   |
| 10. Concurrent authorization attempts (in-memory & PostgreSQL `FOR UPDATE`)                       | Exactly 1 reservation succeeds; concurrent overspend attempts rejected (`BUDGET_EXHAUSTED`)  | Cap never exceeded; `0` PayPal orders                                     | PASS   |
| 11. Model timeout (`MODEL_TIMEOUT`) & malformed JSON (`INVALID_MODEL_RESPONSE`)                   | Fails closed with `MODEL_TIMEOUT` / `INVALID_MODEL_RESPONSE`                                 | `0` reserved, `0` consumed, `0` PayPal orders                             | PASS   |
| 12. Missing Gemini credentials                                                                    | Fails closed (`GEMINI_DISABLED` / `MISSING_MODEL_CONFIGURATION`)                             | No mock substitution; `0` PayPal orders                                   | PASS   |
| 13. Provider failure & deterministic fallback labeling                                            | Explicit `DETERMINISTIC_POLICY_SIMULATION` vs `REAL_GEMINI_API_INFERENCE` labels             | Truthful UI/API attribution; `0` PayPal orders                            | PASS   |
| 14. Historical mandate reuse & payment execution boundary                                         | `COMPLETED_MANDATE_REUSE_FORBIDDEN` / `AGENT_PAYMENT_EXECUTION_DISABLED`                     | Task 03G (`52C23729CU714125M`) & Task 03C (`9N317079B4816951W`) untouched | PASS   |

---

## 7. Mock Versus Real Capabilities

| Capability                       | Real Gemini Mode (`mode: "gemini"`)                                                   | Deterministic Policy Mode (`mode: "deterministic-policy"`)   |
| -------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Model Adapter                    | `GeminiModel` (`POST /v1beta/models/{model}:generateContent`)                         | `DeterministicPayPalPolicyModel` (`deterministic-policy-v1`) |
| Execution Label                  | `REAL_GEMINI_API_INFERENCE` (or `GEMINI_BLOCKED_MISSING_CREDENTIALS` if unconfigured) | `DETERMINISTIC_POLICY_SIMULATION`                            |
| Tool Schema Validation           | Strict `z.strictObject` (`paypalAgentToolSchemas`)                                    | Strict `z.strictObject` (`paypalAgentToolSchemas`)           |
| Policy Engine Enforcement        | Server-side `authorize()` + `PayPalPaymentService.reserve()`                          | Server-side `authorize()` + `PayPalPaymentService.reserve()` |
| Merchant Offer Catalog           | Synthetic bounded catalog (`syntheticCatalog: true`)                                  | Synthetic bounded catalog (`syntheticCatalog: true`)         |
| PayPal Order / Capture Execution | Disabled (`AGENT_PAYMENT_EXECUTION_DISABLED`)                                         | Disabled (`AGENT_PAYMENT_EXECUTION_DISABLED`)                |

---

## 8. Remaining Requirements Before an Agent-Initiated Sandbox Purchase

Before any future milestone may execute a real PayPal Sandbox order from an agent proposal:

1. **Explicit Human Operator Authorization:** A new task authorization must explicitly permit Sandbox order creation (Task 03E/03G's one-shot permissions are consumed and permanently locked).
2. **Separate Persisted Mandate:** A new spending mandate must be created in `earmark_paypal.mandates` (never reusing completed US mandate `889b9c4a-b875-5de9-a354-18a037d41f52` or held Nigerian mandate `8fb8ada6-ad12-5bc8-ac4c-90e6a07ed064`).
3. **Server Gemini Credentials for Live Inference:** Configure `EARMARK_GEMINI_ENABLED=true`, `AI_ENABLE_NETWORK=true`, and a valid `GEMINI_API_KEY` in `web/.env.local`.
4. **Human Buyer Approval Gate:** Connect the authorized `RESERVED` attempt to the owner-authenticated one-shot order creation boundary (`createPreparedOrderOnce`), require interactive human buyer approval at the PayPal Sandbox `approve` link, and require explicit capture authorization (`capturePreparedOnce`).

---

## 9. Implementation Blockers

- **No Code or Architecture Blockers:** All tool contracts, policy engine bindings, payment execution boundaries, UI controls, disposable PostgreSQL schema tests, and security tests are implemented and passing.
- **Environment Note (Live Gemini API Key):** `GEMINI_API_KEY` is not present in `web/.env.local` in this machine environment. Live Gemini mode therefore fails closed with `MISSING_MODEL_CONFIGURATION` / `GEMINI_BLOCKED_MISSING_CREDENTIALS` as designed, while full multi-turn `GeminiModel` `:generateContent` protocol execution is verified via deterministic transport fixtures and can be used against Google's live endpoint immediately upon setting `GEMINI_API_KEY`, `EARMARK_GEMINI_ENABLED=true`, and `AI_ENABLE_NETWORK=true`.
