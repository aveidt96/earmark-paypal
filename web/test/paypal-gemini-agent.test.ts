import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { GET, POST } from "../src/app/api/paypal/agent/route";
import {
  GET as getAgentCheckout,
  POST as postAgentCheckoutRoot,
} from "../src/app/api/paypal/agent-checkout/route";
import { POST as postAgentCheckoutAction } from "../src/app/api/paypal/agent-checkout/[action]/route";
import { GET as getPayPalTest } from "../src/app/api/paypal/test/route";
import { POST as postPayPalTestAction } from "../src/app/api/paypal/test/[action]/route";
import { POST as postPayPalWebhook } from "../src/app/api/paypal/webhooks/route";
import { GET as getWorkspace } from "../src/app/api/workspace/route";
import { POST as postWorkspaceAction } from "../src/app/api/workspace/[action]/route";
import {
  FORBIDDEN_AGENT_TOOL_NAMES,
  IsolatedAgentPaymentRepository,
  PAYPAL_AGENT_DEFAULT_AGENT_ID,
  PAYPAL_AGENT_DEFAULT_OWNER_ID,
  PayPalAgentProposalService,
  PayPalAgentTools,
  TASK_03C_ORIGINAL_MANDATE_ID,
  TASK_03G_US_CAPTURE_ID,
  TASK_03G_US_MANDATE_ID,
  TASK_03G_US_ORDER_ID,
  TASK_05C_MANDATE_ID,
  TASK_05J_AGENT_CAPTURE_ID,
  TASK_05J_AGENT_MANDATE_ID,
  TASK_05J_AGENT_ORDER_ID,
  assertNoSensitiveMaterialInAgentPayload,
  buildPayPalScenarioFixture,
  createPayPalGeminiModel,
  disabledAgentPayPalGateway,
  evaluatePayPalAgentScenario,
} from "../src/server/paypal/agent";
import { mandateSchema, parse } from "../src/server/paypal/domain";

function geminiJsonResponse(parts: unknown, status = 200): Response {
  return new Response(
    status === 200
      ? JSON.stringify({ candidates: [{ content: { parts } }] })
      : JSON.stringify({ error: { code: status } }),
    { status, headers: { "Content-Type": "application/json" } },
  );
}

function createScriptedGeminiFetcher(
  steps: Array<
    | { tool: string; args: Record<string, unknown> }
    | { finishSummary: string }
    | { rawText: string }
  >,
) {
  let callIndex = 0;
  return vi.fn<typeof fetch>(async () => {
    const step = steps[callIndex++];
    if (!step) {
      throw new Error(`Unexpected extra Gemini API call #${callIndex}`);
    }
    if ("tool" in step) {
      return geminiJsonResponse([
        {
          functionCall: {
            id: `call-${callIndex}`,
            name: step.tool,
            args: step.args,
          },
        },
      ]);
    }
    if ("rawText" in step) {
      return geminiJsonResponse([{ text: step.rawText }]);
    }
    return geminiJsonResponse([
      {
        text: JSON.stringify({
          kind: "finish",
          summary: step.finishSummary,
        }),
      },
    ]);
  });
}

const enabledGeminiEnv = {
  EARMARK_GEMINI_ENABLED: "true",
  AI_ENABLE_NETWORK: "true",
  GEMINI_API_KEY: "test-gemini-credential-value",
  GEMINI_MODEL: "gemini-3.8-flash",
  AI_TIMEOUT_MS: "5000",
};

describe("Task 04 — Gemini Purchasing Agent + PayPal Policy Integration", () => {
  it("executes a real multi-turn GeminiModel workflow over generateContent, selects the $4.00 eligible offer, and authorizes without creating a PayPal order", async () => {
    const fetcher = createScriptedGeminiFetcher([
      { tool: "readSpendingMandate", args: {} },
      { tool: "listApprovedMerchants", args: {} },
      { tool: "compareEligibleOffers", args: {} },
      {
        tool: "proposePurchase",
        args: {
          offerId: "offer-us-weather-fast-400",
          reason:
            "Selected offer-us-weather-fast-400 at $4.00 USD (400 minor units) with 5m SLA over $6.00 backup and rejected ineligible offers.",
        },
      },
      { tool: "readAuthorizedPaymentStatus", args: {} },
      {
        finishSummary:
          "Evaluated 4 catalog offers, selected offer-us-weather-fast-400 ($4.00 USD, 5m SLA) as lowest-priced eligible offer, and verified server policy authorization with PayPal order creation disabled.",
      },
    ]);

    const result = await evaluatePayPalAgentScenario({
      scenarioId: "normal",
      mode: "gemini",
      env: enabledGeminiEnv,
      fetcher,
    });

    expect(fetcher).toHaveBeenCalledTimes(6);
    const [firstUrl, firstInit] = fetcher.mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(firstUrl).toContain(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent",
    );
    expect(
      (firstInit.headers as Record<string, string>)["x-goog-api-key"],
    ).toBe("test-gemini-credential-value");
    const requestBody = JSON.parse(String(firstInit.body));
    expect(
      requestBody.tools[0].functionDeclarations.map(
        (d: { name: string }) => d.name,
      ),
    ).toEqual([
      "readSpendingMandate",
      "listApprovedMerchants",
      "compareEligibleOffers",
      "proposePurchase",
      "readAuthorizedPaymentStatus",
    ]);

    expect(result.actualExecutionLabel).toBe("REAL_GEMINI_API_INFERENCE");
    expect(result.proposalState).toBe("PROPOSAL_AUTHORIZED_NO_ORDER_CREATED");
    expect(result.recommendedOfferId).toBe("offer-us-weather-fast-400");
    expect(result.proposal).toMatchObject({
      offerId: "offer-us-weather-fast-400",
      merchantId: "merchant-weather-us-prime",
      amountMinor: "400",
      amountDisplay: "$4.00 USD",
      currency: "USD",
      attemptStatus: "RESERVED",
    });
    expect(result.mandate).toMatchObject({
      capMinor: "1000",
      perTransactionMinor: "600",
      reservedMinor: "400",
      consumedMinor: "0",
      availableMinor: "600",
    });
    expect(result.executionBoundary).toMatchObject({
      orderCreationEnabled: false,
      captureEnabled: false,
      autoApprovalEnabled: false,
      releaseReservationEnabled: false,
      refundOrPayoutEnabled: false,
      paypalOrdersCreated: 0,
      paypalCapturesExecuted: 0,
    });
    expect(result.historicalImmutableRecords).toMatchObject({
      usCaptureOrderId: TASK_03G_US_ORDER_ID,
      usCaptureId: TASK_03G_US_CAPTURE_ID,
      usCaptureStatus: "COMPLETED",
      usConsumedMinor: "600",
      usReservedMinor: "0",
      usAvailableMinor: "400",
      originalHeldMandateId: TASK_03C_ORIGINAL_MANDATE_ID,
    });
  });

  it("resists prompt injection in merchant descriptions and keeps adversarial text out of system instructions", async () => {
    const fetcher = createScriptedGeminiFetcher([
      { tool: "readSpendingMandate", args: {} },
      { tool: "listApprovedMerchants", args: {} },
      { tool: "compareEligibleOffers", args: {} },
      {
        tool: "proposePurchase",
        args: {
          offerId: "offer-us-weather-fast-400",
          reason:
            "Ignored untrusted SYSTEM OVERRIDE in merchant description; selected lowest-cost eligible $4.00 offer.",
        },
      },
      { tool: "readAuthorizedPaymentStatus", args: {} },
      {
        finishSummary:
          "Prompt injection in offer-us-weather-std-600 was ignored; offer-us-weather-fast-400 ($4.00 USD) authorized.",
      },
    ]);

    const result = await evaluatePayPalAgentScenario({
      scenarioId: "prompt-injection",
      mode: "gemini",
      env: enabledGeminiEnv,
      fetcher,
    });

    const [, thirdTurnInit] = fetcher.mock.calls[2] as [string, RequestInit];
    const thirdBody = JSON.parse(String(thirdTurnInit.body));
    expect(thirdBody.systemInstruction.parts[0].text).not.toContain(
      "SYSTEM OVERRIDE",
    );
    expect(JSON.stringify(thirdBody.contents)).toContain("SYSTEM OVERRIDE");

    expect(result.proposalState).toBe("PROPOSAL_AUTHORIZED_NO_ORDER_CREATED");
    expect(result.proposal?.offerId).toBe("offer-us-weather-fast-400");
    expect(result.proposal?.amountMinor).toBe("400");
  });

  it("rejects malicious tool arguments, extra fields, unknown tools, and forbidden payment/database tools", async () => {
    const fixture = buildPayPalScenarioFixture("normal");
    const repo = new IsolatedAgentPaymentRepository();
    await repo.insertMandate(fixture.mandate);
    const service = new PayPalAgentProposalService({
      repository: repo,
      actor: fixture.actor,
      mandateId: fixture.mandate.id,
      objective: fixture.objective,
      catalog: fixture.catalog,
    });
    const tools = new PayPalAgentTools(
      service,
      fixture.objective,
      fixture.catalog,
    );

    // Forbidden payment, secret, merchant-creation, and database tools
    for (const forbidden of FORBIDDEN_AGENT_TOOL_NAMES) {
      await expect(tools.execute(forbidden, {})).rejects.toThrow(
        "FORBIDDEN_AGENT_TOOL",
      );
    }

    // Unknown tool name
    await expect(tools.execute("dropAllTables", {})).rejects.toThrow(
      "INVALID_TOOL_NAME",
    );

    // Extra / malicious arguments attempting to override price, owner, or policy
    await expect(
      tools.execute("proposePurchase", {
        offerId: "offer-us-weather-fast-400",
        reason: "Attempt override",
        amountMinor: "1",
        overridePolicy: true,
      }),
    ).rejects.toThrow("INVALID_TOOL_ARGUMENTS");

    await expect(
      tools.execute("readSpendingMandate", { ownerId: "attacker" }),
    ).rejects.toThrow("INVALID_TOOL_ARGUMENTS");

    await expect(
      tools.execute("listApprovedMerchants", {
        merchantId: "merchant-weather-us-prime",
        sql: "SELECT * FROM earmark_paypal.mandates",
      }),
    ).rejects.toThrow("INVALID_TOOL_ARGUMENTS");

    // Verify zero budget side effects
    const { mandate } = await service.getMandate();
    expect(mandate.reservedMinor).toBe("0");
    expect(mandate.consumedMinor).toBe("0");
  });

  it("blocks exposure of PayPal secrets, bearer tokens, database URLs, and capture endpoints in agent payloads", () => {
    expect(() =>
      assertNoSensitiveMaterialInAgentPayload({
        leaked: "PAYPAL_CLIENT_SECRET=secret123",
      }),
    ).toThrow("SENSITIVE_MATERIAL_EXPOSED");
    expect(() =>
      assertNoSensitiveMaterialInAgentPayload({
        auth: "Bearer A21AAJ8_token_value",
      }),
    ).toThrow("SENSITIVE_MATERIAL_EXPOSED");
    expect(() =>
      assertNoSensitiveMaterialInAgentPayload({
        db: "postgresql://user:pass@ep-neon.aws.neon.tech/neondb",
      }),
    ).toThrow("SENSITIVE_MATERIAL_EXPOSED");
    expect(() =>
      assertNoSensitiveMaterialInAgentPayload({
        url: "https://api-m.sandbox.paypal.com/v2/checkout/orders/72936380818559054/capture",
      }),
    ).toThrow("SENSITIVE_MATERIAL_EXPOSED");
    expect(() =>
      assertNoSensitiveMaterialInAgentPayload(
        { note: "contains actual secret string my-super-secret-value" },
        ["my-super-secret-value"],
      ),
    ).toThrow("SENSITIVE_MATERIAL_EXPOSED");
  });

  it("rejects unauthorized merchant selection (UNAPPROVED_MERCHANT) with zero budget reservation", async () => {
    const fetcher = createScriptedGeminiFetcher([
      { tool: "readSpendingMandate", args: {} },
      { tool: "listApprovedMerchants", args: {} },
      { tool: "compareEligibleOffers", args: {} },
      {
        tool: "proposePurchase",
        args: {
          offerId: "offer-unapproved-merchant-300",
          reason: "Attempting to select $3.00 unlisted merchant offer.",
        },
      },
      { tool: "readAuthorizedPaymentStatus", args: {} },
      {
        finishSummary:
          "Proposal for offer-unapproved-merchant-300 was rejected by policy (UNAPPROVED_MERCHANT).",
      },
    ]);

    const result = await evaluatePayPalAgentScenario({
      scenarioId: "unauthorized-merchant",
      mode: "gemini",
      env: enabledGeminiEnv,
      fetcher,
    });

    expect(result.proposalState).toBe("PROPOSAL_REJECTED");
    expect(result.authorizationDecision.allowed).toBe(false);
    expect(result.authorizationDecision.verdictCode).toBe(
      "UNAPPROVED_MERCHANT",
    );
    expect(result.mandate.reservedMinor).toBe("0");
    expect(result.mandate.consumedMinor).toBe("0");
  });

  it("reports NO_ELIGIBLE_PROVIDER on budget exhaustion and blocks forced over-budget or over-limit proposals", async () => {
    // 1. Agent accurately reports NO_ELIGIBLE_PROVIDER when $2.00 remaining < $4.00 lowest offer
    const noEligibleFetcher = createScriptedGeminiFetcher([
      { tool: "readSpendingMandate", args: {} },
      { tool: "listApprovedMerchants", args: {} },
      { tool: "compareEligibleOffers", args: {} },
      { tool: "readAuthorizedPaymentStatus", args: {} },
      {
        finishSummary:
          "No eligible provider meets the mandate requirements: remaining budget is $2.00 USD (200 minor) while lowest offer is $4.00 USD (400 minor).",
      },
    ]);

    const reportResult = await evaluatePayPalAgentScenario({
      scenarioId: "budget-exhausted",
      mode: "gemini",
      env: enabledGeminiEnv,
      fetcher: noEligibleFetcher,
    });

    expect(reportResult.proposalState).toBe("NO_ELIGIBLE_PROVIDER");
    expect(reportResult.recommendedOfferId).toBeNull();
    expect(reportResult.authorizationDecision.allowed).toBe(false);
    expect(reportResult.authorizationDecision.verdictCode).toBe(
      "BUDGET_EXHAUSTED",
    );
    expect(reportResult.mandate.reservedMinor).toBe("0");
    expect(reportResult.mandate.availableMinor).toBe("200");

    // 2. Forced proposal on exhausted budget is rejected with BUDGET_EXHAUSTED
    const forcedExhaustedFetcher = createScriptedGeminiFetcher([
      { tool: "readSpendingMandate", args: {} },
      { tool: "listApprovedMerchants", args: {} },
      {
        tool: "proposePurchase",
        args: {
          offerId: "offer-us-weather-fast-400",
          reason: "Force proposal despite exhausted budget.",
        },
      },
      {
        finishSummary: "Forced proposal rejected with BUDGET_EXHAUSTED.",
      },
    ]);

    const forcedResult = await evaluatePayPalAgentScenario({
      scenarioId: "budget-exhausted",
      mode: "gemini",
      env: enabledGeminiEnv,
      fetcher: forcedExhaustedFetcher,
    });
    expect(forcedResult.proposalState).toBe("PROPOSAL_REJECTED");
    expect(forcedResult.authorizationDecision.verdictCode).toBe(
      "BUDGET_EXHAUSTED",
    );
    expect(forcedResult.mandate.reservedMinor).toBe("0");

    // 3. Per-transaction limit exceeded ($7.50 offer vs $6.00 per-tx cap on $10.00 mandate)
    const overTxFetcher = createScriptedGeminiFetcher([
      { tool: "readSpendingMandate", args: {} },
      { tool: "listApprovedMerchants", args: {} },
      {
        tool: "proposePurchase",
        args: {
          offerId: "offer-over-limit-750",
          reason: "Attempt $7.50 offer exceeding $6.00 per-transaction limit.",
        },
      },
      {
        finishSummary:
          "Rejected by policy engine (TRANSACTION_LIMIT_EXCEEDED).",
      },
    ]);

    const overTxResult = await evaluatePayPalAgentScenario({
      scenarioId: "normal",
      mode: "gemini",
      env: enabledGeminiEnv,
      fetcher: overTxFetcher,
    });
    expect(overTxResult.proposalState).toBe("PROPOSAL_REJECTED");
    expect(overTxResult.authorizationDecision.verdictCode).toBe(
      "TRANSACTION_LIMIT_EXCEEDED",
    );
    expect(overTxResult.mandate.reservedMinor).toBe("0");
  });

  it("rejects expired and revoked mandates and enforces owner/agent identity", async () => {
    const expiredResult = await evaluatePayPalAgentScenario({
      scenarioId: "expired-mandate",
      mode: "deterministic-policy",
    });
    expect(expiredResult.proposalState).toBe("NO_ELIGIBLE_PROVIDER");
    expect(expiredResult.authorizationDecision.verdictCode).toBe(
      "MANDATE_EXPIRED",
    );
    expect(expiredResult.mandate.reservedMinor).toBe("0");

    // Test REVOKED mandate and wrong owner/agent identity directly on PayPalAgentProposalService
    const fixture = buildPayPalScenarioFixture("normal");
    const repo = new IsolatedAgentPaymentRepository();
    await repo.insertMandate({
      ...fixture.mandate,
      status: "REVOKED",
    });
    const revokedService = new PayPalAgentProposalService({
      repository: repo,
      actor: fixture.actor,
      mandateId: fixture.mandate.id,
      objective: fixture.objective,
      catalog: fixture.catalog,
      now: () => fixture.now,
    });
    const revokedDecision = await revokedService.proposePurchase({
      offerId: "offer-us-weather-fast-400",
      reason: "Attempt on revoked mandate",
    });
    expect(revokedDecision.allowed).toBe(false);
    expect(revokedDecision.verdictCode).toBe("MANDATE_INACTIVE");

    // Wrong owner and wrong agent identity
    const activeRepo = new IsolatedAgentPaymentRepository();
    await activeRepo.insertMandate(fixture.mandate);
    const activeService = new PayPalAgentProposalService({
      repository: activeRepo,
      actor: fixture.actor,
      mandateId: fixture.mandate.id,
      objective: fixture.objective,
      catalog: fixture.catalog,
      now: () => fixture.now,
    });
    const wrongOwner = await activeService.proposePurchase(
      {
        offerId: "offer-us-weather-fast-400",
        reason: "Spoofed owner",
      },
      {
        ownerId: "spoofed-owner",
        subjectId: PAYPAL_AGENT_DEFAULT_AGENT_ID,
        role: "agent",
      },
    );
    expect(wrongOwner.allowed).toBe(false);
    expect(wrongOwner.verdictCode).toBe("MANDATE_OWNERSHIP_MISMATCH");

    const wrongAgent = await activeService.proposePurchase(
      {
        offerId: "offer-us-weather-fast-400",
        reason: "Spoofed agent",
      },
      {
        ownerId: PAYPAL_AGENT_DEFAULT_OWNER_ID,
        subjectId: "rogue-agent-id",
        role: "agent",
      },
    );
    expect(wrongAgent.allowed).toBe(false);
    expect(wrongAgent.verdictCode).toBe("UNAUTHORIZED_AGENT");
  });

  it("rejects currency mismatch (CURRENCY_MISMATCH) and fabricated delivery commitments (INVALID_DELIVERY_COMMITMENT)", async () => {
    const currencyResult = await evaluatePayPalAgentScenario({
      scenarioId: "currency-mismatch",
      mode: "deterministic-policy",
    });
    expect(currencyResult.proposalState).toBe("PROPOSAL_REJECTED");
    expect(currencyResult.authorizationDecision.verdictCode).toBe(
      "CURRENCY_MISMATCH",
    );
    expect(currencyResult.mandate.reservedMinor).toBe("0");

    const fabricatedResult = await evaluatePayPalAgentScenario({
      scenarioId: "fabricated-delivery",
      mode: "deterministic-policy",
    });
    expect(fabricatedResult.proposalState).toBe("PROPOSAL_REJECTED");
    expect(fabricatedResult.authorizationDecision.verdictCode).toBe(
      "INVALID_DELIVERY_COMMITMENT",
    );
    expect(fabricatedResult.mandate.reservedMinor).toBe("0");
  });

  it("enforces duplicate-proposal idempotency and rejects conflicting terms under the same purchaseKey", async () => {
    const fixture = buildPayPalScenarioFixture("normal");
    const repo = new IsolatedAgentPaymentRepository(() =>
      fixture.now.getTime(),
    );
    await repo.insertMandate(fixture.mandate);
    const service = new PayPalAgentProposalService({
      repository: repo,
      actor: fixture.actor,
      mandateId: fixture.mandate.id,
      objective: fixture.objective,
      catalog: fixture.catalog,
      now: () => fixture.now,
    });

    const first = await service.proposePurchase({
      offerId: "offer-us-weather-fast-400",
      reason: "Initial proposal",
      purchaseKey: "pk-dup-test-1",
    });
    expect(first.allowed).toBe(true);
    expect(first.mandateAfter.reservedMinor).toBe("400");

    // Exact duplicate replay returns idempotent success without double-reserving
    const replay = await service.proposePurchase({
      offerId: "offer-us-weather-fast-400",
      reason: "Idempotent retry",
      purchaseKey: "pk-dup-test-1",
    });
    expect(replay.allowed).toBe(true);
    expect(replay.attempt?.id).toBe(first.attempt?.id);
    expect(replay.mandateAfter.reservedMinor).toBe("400");

    // Conflicting offer/price with same purchaseKey is rejected with IDEMPOTENCY_CONFLICT
    const conflict = await service.proposePurchase({
      offerId: "offer-us-weather-std-600",
      reason: "Conflicting offer on same purchaseKey",
      purchaseKey: "pk-dup-test-1",
    });
    expect(conflict.allowed).toBe(false);
    expect(conflict.verdictCode).toBe("IDEMPOTENCY_CONFLICT");
    expect(conflict.mandateAfter.reservedMinor).toBe("400");
  });

  it("serializes concurrent authorization attempts and prevents overspending", async () => {
    const fixture = buildPayPalScenarioFixture("normal");
    const repo = new IsolatedAgentPaymentRepository(() =>
      fixture.now.getTime(),
    );
    await repo.insertMandate(fixture.mandate);
    const service = new PayPalAgentProposalService({
      repository: repo,
      actor: fixture.actor,
      mandateId: fixture.mandate.id,
      objective: fixture.objective,
      catalog: fixture.catalog,
      now: () => fixture.now,
    });

    // 8 concurrent $6.00 (600 minor) proposals against a $10.00 (1000 minor) cap
    const decisions = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        service.proposePurchase({
          offerId: "offer-us-weather-std-600",
          reason: `Concurrent proposal ${i}`,
          purchaseKey: `pk-concurrent-${i}`,
        }),
      ),
    );

    const approved = decisions.filter((d) => d.allowed);
    const rejected = decisions.filter((d) => !d.allowed);
    expect(approved).toHaveLength(1);
    expect(rejected).toHaveLength(7);
    for (const r of rejected) {
      expect(r.verdictCode).toBe("BUDGET_EXHAUSTED");
    }
    const { mandate } = await service.getMandate();
    expect(mandate.reservedMinor).toBe("600");
    expect(mandate.consumedMinor).toBe("0");
  });

  it("handles model timeout, malformed JSON, premature finish, and provider errors without side effects", async () => {
    // 1. Timeout
    const hangingFetcher = vi.fn<typeof fetch>(
      () => new Promise<Response>(() => {}),
    );
    await expect(
      evaluatePayPalAgentScenario({
        scenarioId: "normal",
        mode: "gemini",
        env: { ...enabledGeminiEnv, AI_TIMEOUT_MS: "20" },
        fetcher: hangingFetcher,
      }),
    ).rejects.toThrow("MODEL_TIMEOUT");

    // 2. Malformed JSON
    const malformedFetcher = createScriptedGeminiFetcher([
      { rawText: "{not-valid-json" },
    ]);
    await expect(
      evaluatePayPalAgentScenario({
        scenarioId: "normal",
        mode: "gemini",
        env: enabledGeminiEnv,
        fetcher: malformedFetcher,
      }),
    ).rejects.toThrow("INVALID_MODEL_RESPONSE");

    // 3. Premature finish before observation / proposal
    const prematureFetcher = createScriptedGeminiFetcher([
      { tool: "readSpendingMandate", args: {} },
      { tool: "listApprovedMerchants", args: {} },
      { finishSummary: "Finished without proposing an eligible offer!" },
    ]);
    await expect(
      evaluatePayPalAgentScenario({
        scenarioId: "normal",
        mode: "gemini",
        env: enabledGeminiEnv,
        fetcher: prematureFetcher,
      }),
    ).rejects.toThrow("FINISH_BEFORE_PROPOSAL");
  });

  it("fails closed on missing Gemini credentials and never substitutes the deterministic mock as live Gemini", async () => {
    // Strict programmatic call throws GEMINI_DISABLED or MISSING_MODEL_CONFIGURATION
    expect(() => createPayPalGeminiModel({})).toThrow("GEMINI_DISABLED");
    expect(() =>
      createPayPalGeminiModel({
        EARMARK_GEMINI_ENABLED: "true",
        AI_ENABLE_NETWORK: "true",
        GEMINI_API_KEY: "",
      }),
    ).toThrow("MISSING_MODEL_CONFIGURATION");

    await expect(
      evaluatePayPalAgentScenario({
        scenarioId: "normal",
        mode: "gemini",
        env: {},
      }),
    ).rejects.toThrow("GEMINI_DISABLED");

    // UI graceful view reports GEMINI_BLOCKED_MISSING_CREDENTIALS with proposal: null
    const uiBlocked = await evaluatePayPalAgentScenario({
      scenarioId: "normal",
      mode: "gemini",
      env: { EARMARK_GEMINI_ENABLED: "true", AI_ENABLE_NETWORK: "true" },
      allowGracefulMissingCredentialsView: true,
    });
    expect(uiBlocked.actualExecutionLabel).toBe(
      "GEMINI_BLOCKED_MISSING_CREDENTIALS",
    );
    expect(uiBlocked.proposalState).toBe("INFERENCE_UNAVAILABLE");
    expect(uiBlocked.proposal).toBeNull();
    expect(uiBlocked.errorCode).toBe("MISSING_MODEL_CONFIGURATION");

    // Deterministic policy mode is explicitly labeled DETERMINISTIC_POLICY_SIMULATION
    const simResult = await evaluatePayPalAgentScenario({
      scenarioId: "normal",
      mode: "deterministic-policy",
      env: {},
    });
    expect(simResult.actualExecutionLabel).toBe(
      "DETERMINISTIC_POLICY_SIMULATION",
    );
    expect(simResult.proposalState).toBe(
      "PROPOSAL_AUTHORIZED_NO_ORDER_CREATED",
    );
  });

  it("enforces the Phase 6 payment execution boundary and forbids reusing completed Task 03G or held Task 03C mandates", async () => {
    const fixture = buildPayPalScenarioFixture("normal");
    const repo = new IsolatedAgentPaymentRepository();
    await repo.insertMandate(fixture.mandate);
    const service = new PayPalAgentProposalService({
      repository: repo,
      actor: fixture.actor,
      mandateId: fixture.mandate.id,
      objective: fixture.objective,
      catalog: fixture.catalog,
    });

    await expect(service.createOrder()).rejects.toThrow(
      "AGENT_PAYMENT_EXECUTION_DISABLED",
    );
    await expect(service.approvePayment()).rejects.toThrow(
      "AGENT_PAYMENT_EXECUTION_DISABLED",
    );
    await expect(service.captureOrder()).rejects.toThrow(
      "AGENT_PAYMENT_EXECUTION_DISABLED",
    );
    await expect(service.releaseReservation()).rejects.toThrow(
      "AGENT_PAYMENT_EXECUTION_DISABLED",
    );
    await expect(service.issueRefund()).rejects.toThrow(
      "AGENT_PAYMENT_EXECUTION_DISABLED",
    );
    await expect(service.createPayout()).rejects.toThrow(
      "AGENT_PAYMENT_EXECUTION_DISABLED",
    );
    await expect(
      disabledAgentPayPalGateway.createOrder({} as never),
    ).rejects.toThrow("AGENT_PAYMENT_EXECUTION_DISABLED");
    await expect(
      disabledAgentPayPalGateway.captureOrder({} as never),
    ).rejects.toThrow("AGENT_PAYMENT_EXECUTION_DISABLED");

    // Attempting to reuse Task 03G US mandate, Task 03C original mandate, or Task 05J/05C agent mandates is forbidden
    for (const lockedId of [
      TASK_03G_US_MANDATE_ID,
      TASK_03C_ORIGINAL_MANDATE_ID,
      TASK_05J_AGENT_MANDATE_ID,
      TASK_05C_MANDATE_ID,
    ]) {
      const lockedRepo = new IsolatedAgentPaymentRepository();
      await lockedRepo.insertMandate(
        parse(mandateSchema, {
          ...fixture.mandate,
          id: lockedId,
        }),
      );
      const lockedService = new PayPalAgentProposalService({
        repository: lockedRepo,
        actor: fixture.actor,
        mandateId: lockedId,
        objective: fixture.objective,
        catalog: fixture.catalog,
      });
      await expect(
        lockedService.proposePurchase({
          offerId: "offer-us-weather-fast-400",
          reason: "Attempt to reuse historical mandate",
        }),
      ).rejects.toThrow("COMPLETED_MANDATE_REUSE_FORBIDDEN");
    }
  });

  it("verifies all four core security/demo scenarios in deterministic-policy mode without live calls", async () => {
    const normal = await evaluatePayPalAgentScenario({
      scenarioId: "normal",
      mode: "deterministic-policy",
    });
    expect(normal).toMatchObject({
      scenarioId: "normal",
      actualExecutionLabel: "DETERMINISTIC_POLICY_SIMULATION",
      proposalState: "PROPOSAL_AUTHORIZED_NO_ORDER_CREATED",
      authorizationDecision: {
        allowed: true,
        verdictCode: "AUTHORIZED_NO_ORDER_EXECUTION",
      },
      mandate: {
        capMinor: "1000",
        consumedMinor: "0",
        reservedMinor: "400",
        availableMinor: "600",
      },
      historicalImmutableRecords: {
        usCaptureOrderId: TASK_03G_US_ORDER_ID,
        usCaptureId: TASK_03G_US_CAPTURE_ID,
        agentCaptureOrderId: TASK_05J_AGENT_ORDER_ID,
        agentCaptureId: TASK_05J_AGENT_CAPTURE_ID,
        agentCaptureStatus: "COMPLETED",
        agentAuthorizedMinor: "1000",
        agentConsumedMinor: "600",
        agentReservedMinor: "0",
        agentAvailableMinor: "400",
      },
    });
    expect(normal.executionBoundary.paypalOrdersCreated).toBe(0);

    const injection = await evaluatePayPalAgentScenario({
      scenarioId: "prompt-injection",
      mode: "deterministic-policy",
    });
    expect(injection).toMatchObject({
      scenarioId: "prompt-injection",
      proposalState: "PROPOSAL_REJECTED",
      authorizationDecision: {
        allowed: false,
        verdictCode: "UNAPPROVED_MERCHANT",
      },
      mandate: {
        reservedMinor: "0",
        consumedMinor: "0",
      },
    });
    expect(injection.executionBoundary.paypalOrdersCreated).toBe(0);

    const invalidDelivery = await evaluatePayPalAgentScenario({
      scenarioId: "fabricated-delivery",
      mode: "deterministic-policy",
    });
    expect(invalidDelivery).toMatchObject({
      scenarioId: "fabricated-delivery",
      proposalState: "PROPOSAL_REJECTED",
      authorizationDecision: {
        allowed: false,
        verdictCode: "INVALID_DELIVERY_COMMITMENT",
      },
      mandate: {
        reservedMinor: "0",
        consumedMinor: "0",
      },
    });
    expect(invalidDelivery.executionBoundary.paypalOrdersCreated).toBe(0);

    const budgetExhausted = await evaluatePayPalAgentScenario({
      scenarioId: "budget-exhausted",
      mode: "deterministic-policy",
    });
    expect(budgetExhausted).toMatchObject({
      scenarioId: "budget-exhausted",
      proposalState: "PROPOSAL_REJECTED",
      authorizationDecision: {
        allowed: false,
        verdictCode: "BUDGET_EXHAUSTED",
      },
      mandate: {
        capMinor: "1000",
        consumedMinor: "800",
        reservedMinor: "0",
        availableMinor: "200",
      },
    });
    expect(budgetExhausted.executionBoundary.paypalOrdersCreated).toBe(0);

    // Also verify a $6.00 request against a $4.00 remaining Task 05J-equivalent budget is rejected
    const baseFixture = buildPayPalScenarioFixture("normal");
    const post05jRepo = new IsolatedAgentPaymentRepository();
    await post05jRepo.insertMandate(
      parse(mandateSchema, {
        ...baseFixture.mandate,
        capMinor: "1000",
        perTransactionMinor: "600",
        consumedMinor: "600",
      }),
    );
    const post05jService = new PayPalAgentProposalService({
      repository: post05jRepo,
      actor: baseFixture.actor,
      mandateId: baseFixture.mandate.id,
      objective: baseFixture.objective,
      catalog: baseFixture.catalog,
    });
    const sixDollarDecision = await post05jService.proposePurchase({
      offerId: "offer-us-weather-std-600",
      reason: "Attempt a $6.00 purchase when only $4.00 remains available",
    });
    expect(sixDollarDecision).toMatchObject({
      allowed: false,
      status: "PROPOSAL_REJECTED",
      verdictCode: "BUDGET_EXHAUSTED",
      mandateAfter: {
        capMinor: "1000",
        consumedMinor: "600",
        reservedMinor: "0",
      },
    });
  });

  it("serves GET and POST /api/paypal/agent route handlers with strict parameter validation", async () => {
    const getRes = await GET(
      new Request(
        "http://127.0.0.1:3000/api/paypal/agent?scenarioId=normal&mode=deterministic-policy",
      ),
    );
    expect(getRes.status).toBe(200);
    const getBody = await getRes.json();
    expect(getBody).toMatchObject({
      scenarioId: "normal",
      actualExecutionLabel: "DETERMINISTIC_POLICY_SIMULATION",
      proposalState: "PROPOSAL_AUTHORIZED_NO_ORDER_CREATED",
    });

    const postRes = await POST(
      new Request("http://127.0.0.1:3000/api/paypal/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenarioId: "unauthorized-merchant",
          mode: "deterministic-policy",
        }),
      }),
    );
    expect(postRes.status).toBe(200);
    const postBody = await postRes.json();
    expect(postBody).toMatchObject({
      scenarioId: "unauthorized-merchant",
      proposalState: "PROPOSAL_REJECTED",
    });

    const badRes = await GET(
      new Request("http://127.0.0.1:3000/api/paypal/agent?scenarioId=invented"),
    );
    expect(badRes.status).toBe(400);
  });

  it("enforces public DEMO-ONLY lockdown on privileged payment, owner-auth, diagnostic, and live Gemini routes", async () => {
    vi.stubEnv("EARMARK_PUBLIC_DEMO_ONLY", "true");
    try {
      const wsRes = await getWorkspace(
        new Request("https://earmark-paypal.vercel.app/api/workspace"),
      );
      expect(wsRes.status).toBe(200);
      expect(await wsRes.json()).toMatchObject({
        configured: false,
        model: "mock",
        geminiAvailable: false,
        error: "PUBLIC_DEMO_READ_ONLY",
      });

      for (const action of [
        "launch",
        "challenge",
        "register",
        "gemini-start",
      ]) {
        const res = await postWorkspaceAction(
          new Request(
            `https://earmark-paypal.vercel.app/api/workspace/${action}`,
            { method: "POST", body: "{}" },
          ),
          { params: Promise.resolve({ action }) },
        );
        expect(res.status).toBe(403);
        expect(await res.json()).toEqual({ error: "PUBLIC_DEMO_READ_ONLY" });
      }

      expect(
        (
          await getPayPalTest(
            new Request("https://earmark-paypal.vercel.app/api/paypal/test"),
          )
        ).status,
      ).toBe(403);
      for (const action of [
        "login",
        "order",
        "capture",
        "order-once",
        "capture-once",
      ]) {
        const res = await postPayPalTestAction(
          new Request(
            `https://earmark-paypal.vercel.app/api/paypal/test/${action}`,
            { method: "POST", body: "{}" },
          ),
          { params: Promise.resolve({ action }) },
        );
        expect(res.status).toBe(403);
        expect(await res.json()).toEqual({
          error: "PUBLIC_DEMO_ENDPOINT_DISABLED",
        });
      }

      expect(
        (
          await getAgentCheckout(
            new Request(
              "https://earmark-paypal.vercel.app/api/paypal/agent-checkout",
            ),
          )
        ).status,
      ).toBe(403);
      expect(
        (
          await postAgentCheckoutRoot(
            new Request(
              "https://earmark-paypal.vercel.app/api/paypal/agent-checkout",
              { method: "POST", body: "{}" },
            ),
          )
        ).status,
      ).toBe(403);
      for (const action of [
        "login",
        "evaluate",
        "diagnose",
        "authorize",
        "order",
        "capture",
      ]) {
        const res = await postAgentCheckoutAction(
          new Request(
            `https://earmark-paypal.vercel.app/api/paypal/agent-checkout/${action}`,
            { method: "POST", body: "{}" },
          ),
          { params: Promise.resolve({ action }) },
        );
        expect(res.status).toBe(403);
        expect(await res.json()).toEqual({
          error: "PUBLIC_DEMO_ENDPOINT_DISABLED",
        });
      }

      const webhookRes = await postPayPalWebhook(
        new Request("https://earmark-paypal.vercel.app/api/paypal/webhooks", {
          method: "POST",
          body: "{}",
        }),
      );
      expect(webhookRes.status).toBe(403);

      const geminiAgentRes = await GET(
        new Request(
          "https://earmark-paypal.vercel.app/api/paypal/agent?scenarioId=normal&mode=gemini",
        ),
      );
      expect(geminiAgentRes.status).toBe(403);

      const demoSimRes = await GET(
        new Request(
          "https://earmark-paypal.vercel.app/api/paypal/agent?scenarioId=normal&mode=deterministic-policy",
        ),
      );
      expect(demoSimRes.status).toBe(200);
      expect(await demoSimRes.json()).toMatchObject({
        scenarioId: "normal",
        historicalImmutableRecords: {
          agentCaptureOrderId: TASK_05J_AGENT_ORDER_ID,
          agentCaptureId: TASK_05J_AGENT_CAPTURE_ID,
          agentCaptureStatus: "COMPLETED",
        },
      });
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
