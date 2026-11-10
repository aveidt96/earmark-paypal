import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import type { Pool } from "@flint/agent/server";
import {
  agentPreparationFixture,
  agentModelEnv,
} from "./fixtures/agent-checkout";
import {
  AGENT_RUNTIME_VERSION,
  runSyntheticAgentDiagnostic,
  syntheticAgentFixture,
} from "../src/server/paypal/agent-diagnostic";
import { handleAgentCheckout } from "../src/server/paypal/agent-checkout-http";
import { PostgresAgentCheckoutRepository } from "../src/server/paypal/agent-checkout-postgres";
import { TestOwnerAuth } from "../src/server/paypal/test-auth";
import {
  TASK_03G_US_MANDATE_ID,
  TASK_03G_US_ATTEMPT_ID,
  TASK_03G_US_ORDER_ID,
  TASK_03G_US_CAPTURE_ID,
  TASK_03C_ORIGINAL_MANDATE_ID,
  TASK_03C_ORIGINAL_ORDER_ID,
} from "../src/server/paypal/agent";

describe("Task05B synthetic application validation", () => {
  it("runs the exact Gemini adapter/policy path without real owner data or durable checkout authority", async () => {
    const t = agentPreparationFixture();
    const finish = t.responses[5] as { text: string };
    t.responses[5] = { text: "```json\n" + finish.text + "\n```" };
    const result = await runSyntheticAgentDiagnostic(
      {
        ...agentModelEnv,
        PAYPAL_TEST_OWNER_ID: t.config.ownerId,
        PAYPAL_MERCHANT_ID: t.config.merchantId,
        PAYPAL_CLIENT_SECRET: "synthetic-forbidden-payment-secret",
      },
      t.fetcher,
      "MOCKED_TRANSPORT_TEST",
      () => t.now,
    );
    expect(result).toMatchObject({
      runtimeVersion: AGENT_RUNTIME_VERSION,
      source: "MOCKED_TRANSPORT_TEST",
      policyValidated: true,
      proposal: {
        offerId: "synthetic-us-weather-600",
        amountMinor: "600",
        currency: "USD",
      },
      persisted: false,
      ownerAuthorized: false,
      fundsReserved: false,
      paypalOrderId: null,
      paypalCaptureId: null,
    });
    expect(result.policyChecks.every((c) => c.passed)).toBe(true);
    expect(result.requests.flatMap((r) => r.toolNames)).toEqual([
      "readSpendingMandate",
      "listApprovedMerchants",
      "compareEligibleOffers",
      "proposePurchase",
      "readAuthorizedPaymentStatus",
    ]);
    expect(result.requests.at(-1)?.category).toBe("VALID_FINISH");
    for (const [, init] of t.fetcher.mock.calls) {
      const body = String(init?.body);
      for (const forbidden of [
        t.config.ownerId,
        t.config.merchantId,
        t.config.loginSecret,
        agentModelEnv.GEMINI_API_KEY,
        "synthetic-forbidden-payment-secret",
        TASK_03G_US_MANDATE_ID,
        TASK_03G_US_ATTEMPT_ID,
        TASK_03G_US_ORDER_ID,
        TASK_03G_US_CAPTURE_ID,
        TASK_03C_ORIGINAL_MANDATE_ID,
        TASK_03C_ORIGINAL_ORDER_ID,
      ])
        expect(body).not.toContain(forbidden);
    }
    const synthetic = syntheticAgentFixture(t.now);
    expect(synthetic.mandate.id).not.toBe(t.mandate.id);
    expect(synthetic.mandate.reservedMinor).toBe("0");
    expect(JSON.stringify(result)).not.toContain("modelSummary");
  });
  it("rejects extra proposal arguments and missing credentials without a fallback", async () => {
    const t = agentPreparationFixture();
    await expect(runSyntheticAgentDiagnostic({}, t.fetcher)).rejects.toThrow(
      "MISSING_MODEL_CONFIGURATION",
    );
    expect(t.fetcher).not.toHaveBeenCalled();
    t.responses[3] = {
      functionCall: {
        name: "proposePurchase",
        args: {
          offerId: "synthetic-us-weather-600",
          reason: "x",
          amountMinor: "1",
        },
      },
    };
    await expect(
      runSyntheticAgentDiagnostic(
        agentModelEnv,
        t.fetcher,
        "MOCKED_TRANSPORT_TEST",
        () => t.now,
      ),
    ).rejects.toThrow("INVALID_MODEL_RESPONSE");
  });
  it("requires owner/Host/Origin/CSRF and empty body before invoking diagnosis, and never initializes checkout", async () => {
    const t = agentPreparationFixture(),
      auth = new TestOwnerAuth(t.config, () => t.now);
    const req = (
      cookie = "",
      csrf = "",
      origin = t.config.origin,
      host = "127.0.0.1:3032",
      body: unknown = {},
    ) =>
      new Request(t.config.origin + "/api/paypal/agent-checkout/diagnose", {
        method: "POST",
        headers: {
          Cookie: cookie,
          "X-Earmark-CSRF": csrf,
          Origin: origin,
          Host: host,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
    const login = auth.login(req(), { password: t.config.loginSecret });
    const cookie = login.cookie.split(";")[0] ?? "";
    const diagnose = vi.fn(async () => ({ syntheticCatalog: true }) as never),
      checkout = vi.fn();
    const runtime = () => ({ auth, checkout, diagnose });
    for (const [request, status] of [
      [req(), 401],
      [req(cookie), 403],
      [req(cookie, login.session.csrf, "https://evil.invalid"), 403],
      [req(cookie, login.session.csrf, t.config.origin, "evil.invalid"), 403],
      [
        req(cookie, login.session.csrf, t.config.origin, "127.0.0.1:3032", {
          mandateId: t.mandate.id,
        }),
        400,
      ],
    ] as const)
      expect(
        (await handleAgentCheckout(request, "diagnose", runtime)).status,
      ).toBe(status);
    expect(diagnose).not.toHaveBeenCalled();
    const response = await handleAgentCheckout(
      req(cookie, login.session.csrf),
      "diagnose",
      runtime,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("x-earmark-agent-runtime")).toBe(
      AGENT_RUNTIME_VERSION,
    );
    expect(diagnose).toHaveBeenCalledTimes(1);
    expect(checkout).not.toHaveBeenCalled();
  });
});

describe("Task05B PostgreSQL recovery guard (mocked query transport)", () => {
  it.each(["failed", "expired"] as const)(
    "preserves %s campaign and never starts inference or writes audit/financial records",
    async (state) => {
      const t = agentPreparationFixture();
      const m = t.mandate;
      const query = vi.fn(async (sql: string) => {
        if (sql.includes("pg_try_advisory_lock"))
          return { rows: [{ locked: true }] };
        if (sql.includes("FROM earmark_paypal.mandates"))
          return {
            rows: [
              {
                id: m.id,
                owner_id: m.ownerId,
                agent_id: m.agentId,
                currency: m.currency,
                cap_minor: m.capMinor,
                per_transaction_minor: m.perTransactionMinor,
                reserved_minor: "0",
                consumed_minor: "0",
                status: "ACTIVE",
                expires_at: new Date(
                  state === "expired" ? Date.now() - 1000 : m.expiresAt,
                ),
                created_at: new Date(m.createdAt),
                merchants: m.merchants,
              },
            ],
          };
        if (sql.includes("FROM earmark_paypal.audit"))
          return {
            rows: [
              {
                action: "AGENT05A_EVALUATION_STARTED",
                detail: "OWNER_AUTHENTICATED_NO_RESERVATION",
              },
              {
                action: "AGENT05A_EVALUATION_FAILED",
                detail: "INVALID_MODEL_RESPONSE",
              },
            ],
          };
        return { rows: [] };
      });
      const release = vi.fn();
      const pool = {
        connect: async () => ({ query, release }),
      } as unknown as Pool;
      const repo = new PostgresAgentCheckoutRepository(pool, t.config),
        produce = vi.fn();
      const snapshot = await repo.read();
      expect(snapshot.evaluationState).toBe("FAILED");
      expect(snapshot.intent).toBeNull();
      await expect(repo.evaluateOnce(t.actor, produce)).rejects.toThrow(
        state === "expired" ? "MANDATE_EXPIRED" : "INVALID_MODEL_RESPONSE",
      );
      expect(produce).not.toHaveBeenCalled();
      expect(
        query.mock.calls
          .map(([sql]) => sql)
          .some((sql) =>
            /\b(?:INSERT|UPDATE|DELETE|TRUNCATE|ALTER)\b/.test(sql),
          ),
      ).toBe(false);
      expect(
        query.mock.calls.some(([sql]) =>
          sql.includes("REPEATABLE READ READ ONLY"),
        ),
      ).toBe(true);
    },
  );
});
