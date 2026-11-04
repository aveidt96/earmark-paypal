import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { randomUUID } from "node:crypto";
import type { Pool } from "@flint/agent/server";
vi.mock("server-only", () => ({}));
import {
  PostgresPaymentRepository,
  assertPayPalDatabase,
} from "../src/server/paypal/postgres";
import { PayPalPaymentService } from "../src/server/paypal/service";
import { PayPalError, type PayPalOrder } from "../src/server/paypal/client";
import { PaymentError, type Attempt } from "../src/server/paypal/domain";
import {
  agent,
  fixture,
  mandateInput,
  orderFor,
  owner,
} from "./fixtures/paypal";
import { isolatedPayPalDatabase } from "./fixtures/paypal-database";
import { TestCheckoutService } from "../src/server/paypal/test-checkout";
import { testCheckoutConfig } from "../src/server/paypal/test-config";
import { testEnv, usEnv } from "./fixtures/paypal-checkout";
import { createMandate } from "../src/server/paypal/policy";
import { US_PURCHASE_KEY } from "../src/server/paypal/us-order";
import {
  ORIGINAL_MANDATE_ID,
  ORIGINAL_ORDER_ID,
} from "../src/server/paypal/operator-hold";
import {
  PayPalAgentProposalService,
  buildPayPalScenarioFixture,
  evaluatePayPalAgentScenario,
} from "../src/server/paypal/agent";
import { PostgresAgentCheckoutRepository } from "../src/server/paypal/agent-checkout-postgres";
import {
  agentModelEnv,
  agentPreparationFixture,
} from "./fixtures/agent-checkout";
import { agentCheckoutConfig } from "../src/server/paypal/agent-checkout-config";
import { inferPendingAgentIntent } from "../src/server/paypal/agent-checkout";

// Only an explicit operator invocation may supply credentials/opt-in flags.
const enabled =
  process.env.PAYPAL_RUN_DATABASE_TESTS === "true" &&
  !!process.env.PAYPAL_TEST_DATABASE_URL;
const suite = enabled ? describe : describe.skip;
let pool: Pool | undefined, cleanup: (() => Promise<void>) | undefined;
let captureDiagnostics: ((active: boolean) => void) | undefined;
suite("isolated real PostgreSQL PayPal schema and concurrency", () => {
  beforeAll(async () => {
    const raw = process.env.PAYPAL_TEST_DATABASE_URL;
    if (!raw) throw new Error("PAYPAL_TEST_DATABASE_REQUIRED");
    const isolated = await isolatedPayPalDatabase(
      raw,
      process.env.PAYPAL_RUN_NEON_DATABASE_TESTS === "true",
    );
    pool = isolated.pool;
    cleanup = isolated.close;
    captureDiagnostics = isolated.captureDiagnostics;
    await assertPayPalDatabase(pool);
  }, 60000);
  afterAll(async () => {
    await cleanup?.();
  }, 60000);
  afterEach(() => captureDiagnostics?.(false));

  async function databaseFixture() {
    if (!pool) throw new Error("TEST_DATABASE_NOT_READY");
    const t = await fixture();
    let current: PayPalOrder | undefined;
    const remote = (
      a: Attempt,
      status: PayPalOrder["status"],
      capture?: "COMPLETED" | "PENDING" | "DECLINED",
    ) => {
      const o = orderFor(a, status, capture);
      o.id = `O${a.id.replaceAll("-", "").toUpperCase()}`;
      for (const unit of o.purchase_units)
        for (const c of unit.payments?.captures ?? [])
          c.id = `C${a.id.replaceAll("-", "").toUpperCase()}`;
      o.links = [
        {
          rel: "approve",
          href: `https://www.sandbox.paypal.com/checkoutnow?token=${o.id}`,
        },
      ];
      return o;
    };
    t.gateway.createOrder.mockImplementation(async (a) => {
      current = remote(a, "CREATED");
      return structuredClone(current);
    });
    t.gateway.getOrder.mockImplementation(async () => {
      if (!current) throw new Error("TEST_ORDER_NOT_READY");
      return structuredClone(current);
    });
    t.gateway.captureOrder.mockImplementation(async (a) => {
      current = remote(a, "COMPLETED", "COMPLETED");
      return structuredClone(current);
    });
    const repository = new PostgresPaymentRepository(pool);
    const service = new PayPalPaymentService(repository, t.gateway);
    const m = await service.createMandate(owner, {
      ...mandateInput,
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    });
    return {
      ...t,
      repository,
      service,
      mandate: m,
      input: { ...t.input, mandateId: m.id },
      remote,
      approve: (a: Attempt) => {
        current = remote(a, "APPROVED");
      },
      observe: (
        a: Attempt,
        status: PayPalOrder["status"],
        capture?: "COMPLETED" | "PENDING" | "DECLINED",
      ) => {
        current = remote(a, status, capture);
      },
    };
  }
  async function budget(id: string) {
    const row = await pool?.query(
      "SELECT reserved_minor::text,consumed_minor::text,status FROM earmark_paypal.mandates WHERE id=$1",
      [id],
    );
    return row?.rows[0];
  }
  async function controlledFixture() {
    const t = await databaseFixture();
    const config = testCheckoutConfig({
      ...testEnv,
      PAYPAL_TEST_OWNER_ID: `paypal-test-owner-${randomUUID().replaceAll("-", "")}`,
    });
    const controlled = new TestCheckoutService(config, t.repository, t.gateway);
    const actor = {
      ownerId: config.ownerId,
      subjectId: config.ownerId,
      role: "owner" as const,
    };
    return { ...t, config, controlled, actor };
  }
  it("Task05C creates one isolated campaign under concurrency and restart without payment attempts", async () => {
    if (!pool) throw new Error("TEST_DATABASE_REQUIRED");
    const t = agentPreparationFixture();
    const old = new PostgresAgentCheckoutRepository(pool, t.config);
    const before = await old.initialize(t.actor);
    const config = agentCheckoutConfig({
      ...t.env,
      PAYPAL_AGENT_CAMPAIGN: "agent-05c-v1",
    });
    const repo = new PostgresAgentCheckoutRepository(pool, config);
    await expect(
      repo.initialize({ ...t.actor, subjectId: "unauthorized" }),
    ).rejects.toThrow("MANDATE_OWNER_REQUIRED");
    const results = await Promise.all(
      Array.from({ length: 4 }, () => repo.initialize(t.actor)),
    );
    const m = results[0]?.mandate;
    if (!m || !before.mandate) throw new Error("MANDATE_REQUIRED");
    expect(m.id).not.toBe(before.mandate.id);
    expect(config.agentId).not.toBe(t.config.agentId);
    expect(
      new Date(m.expiresAt).getTime() - new Date(m.createdAt).getTime(),
    ).toBe(86400000);
    expect(results.every((r) => r.mandate?.id === m.id)).toBe(true);
    expect(
      (
        await new PostgresAgentCheckoutRepository(pool, config).initialize(
          t.actor,
        )
      ).mandate?.id,
    ).toBe(m.id);
    const rows = await pool.query(
      `SELECT m.reserved_minor::text,m.consumed_minor::text,
      (SELECT count(*)::int FROM earmark_paypal.attempts WHERE mandate_id=m.id) attempts,
      (SELECT count(*)::int FROM earmark_paypal.audit WHERE mandate_id=m.id AND action='MANDATE_CREATED') creations
      FROM earmark_paypal.mandates m WHERE m.id=$1`,
      [m.id],
    );
    expect(rows.rows[0]).toMatchObject({
      reserved_minor: "0",
      consumed_minor: "0",
      attempts: 0,
      creations: 1,
    });
    expect((await old.read()).mandate).toEqual(before.mandate);
    const candidate = await inferPendingAgentIntent(
      config,
      m,
      agentModelEnv,
      t.fetcher,
      "MOCKED_TRANSPORT_TEST",
      () => t.now,
    );
    for (const [, init] of t.fetcher.mock.calls) {
      for (const privateValue of [
        config.ownerId,
        config.agentId,
        config.merchantId,
        m.id,
      ])
        expect(String(init?.body)).not.toContain(privateValue);
    }
    const saved = await repo.evaluateOnce(t.actor, async () => candidate);
    expect(saved).toMatchObject({
      fundsReserved: false,
      ownerAuthorized: false,
      paypalOrderId: null,
      paypalCaptureId: null,
    });
    const replay = await new PostgresAgentCheckoutRepository(
      pool,
      config,
    ).evaluateOnce(t.actor, async () => {
      throw new Error("NO_REPEAT");
    });
    expect(replay.id).toBe(saved.id);
    expect(
      (
        await pool.query(
          "SELECT count(*)::int AS n FROM earmark_paypal.audit WHERE mandate_id=$1 AND action='AGENT05C_CHECKOUT_PENDING'",
          [m.id],
        )
      ).rows[0]?.n,
    ).toBe(1);
    expect((await old.read()).mandate).toEqual(before.mandate);
  }, 90000);
  it("Task05A concurrent owner preparation persists one pending intent and no financial reservation, including restart replay", async () => {
    if (!pool) throw new Error("TEST_DATABASE_REQUIRED");
    const t = agentPreparationFixture(),
      repo = new PostgresAgentCheckoutRepository(pool, t.config);
    await Promise.all(
      Array.from({ length: 4 }, () => repo.initialize(t.actor)),
    );
    const initialized = await repo.read();
    if (!initialized.mandate) throw new Error("MANDATE_REQUIRED");
    const candidate = await t.infer(initialized.mandate);
    let entered = () => {},
      finish = () => {};
    const started = new Promise<void>((resolve) => {
        entered = resolve;
      }),
      gate = new Promise<void>((resolve) => {
        finish = resolve;
      });
    let calls = 0;
    const produce = async () => {
      calls++;
      entered();
      await gate;
      return candidate;
    };
    const first = repo.evaluateOnce(t.actor, produce);
    await started;
    try {
      await expect(
        new PostgresAgentCheckoutRepository(pool, t.config).evaluateOnce(
          t.actor,
          produce,
        ),
      ).rejects.toThrow("AGENT_EVALUATION_IN_PROGRESS");
    } finally {
      finish();
    }
    const intent = await first;
    expect(intent).toMatchObject({
      state: "HUMAN_AUTHORIZATION_REQUIRED",
      fundsReserved: false,
      ownerAuthorized: false,
      paypalOrderId: null,
      evidence: { kind: "MOCKED_TRANSPORT_TEST" },
    });
    const replay = await new PostgresAgentCheckoutRepository(
      pool,
      t.config,
    ).evaluateOnce(t.actor, produce);
    expect(replay.id).toBe(intent.id);
    expect(calls).toBe(1);
    const counts = (
      await pool.query(
        `SELECT m.reserved_minor::text,m.consumed_minor::text,
      (SELECT count(*)::int FROM earmark_paypal.attempts WHERE mandate_id=m.id) AS attempts,
      (SELECT count(*)::int FROM earmark_paypal.audit WHERE mandate_id=m.id AND action='AGENT05A_CHECKOUT_PENDING') AS intents,
      (SELECT count(*)::int FROM earmark_paypal.audit WHERE mandate_id=m.id AND action='MANDATE_CREATED') AS creations
      FROM earmark_paypal.mandates m WHERE m.id=$1`,
        [initialized.mandate.id],
      )
    ).rows[0];
    expect(counts).toMatchObject({
      reserved_minor: "0",
      consumed_minor: "0",
      attempts: 0,
      intents: 1,
      creations: 1,
    });
  }, 90000);
  it("Task05A commit revalidates forged terms and owner authority, leaving zero reserved funds and no pending intent", async () => {
    if (!pool) throw new Error("TEST_DATABASE_REQUIRED");
    const t = agentPreparationFixture(),
      repo = new PostgresAgentCheckoutRepository(pool, t.config);
    await expect(
      repo.initialize({ ...t.actor, subjectId: "forged" }),
    ).rejects.toThrow("MANDATE_OWNER_REQUIRED");
    const initialized = await repo.initialize(t.actor);
    if (!initialized.mandate) throw new Error("MANDATE_REQUIRED");
    const candidate = await t.infer(initialized.mandate),
      produce = async () =>
        ({ ...candidate, amountMinor: "1" }) as unknown as typeof candidate;
    await expect(repo.evaluateOnce(t.actor, produce)).rejects.toThrow(
      "INVALID_AGENT_CHECKOUT_INTENT",
    );
    const saved = await repo.read();
    expect(saved).toMatchObject({
      intent: null,
      evaluationState: "FAILED",
      mandate: { reservedMinor: "0", consumedMinor: "0" },
    });
    await expect(
      repo.evaluateOnce(t.actor, async () => candidate),
    ).rejects.toThrow("INVALID_AGENT_CHECKOUT_INTENT");
    expect(
      (
        await pool.query(
          "SELECT count(*)::int AS count FROM earmark_paypal.attempts WHERE mandate_id=$1",
          [initialized.mandate.id],
        )
      ).rows[0]?.count,
    ).toBe(0);
  }, 90000);
  it("capture-once commits one locked claim, canonical settlement and one consumption across concurrent callers/restart", async () => {
    captureDiagnostics?.(true);
    const t = await databaseFixture(),
      a = await t.service.createOrder(owner, {
        ...t.input,
        purchaseKey: US_PURCHASE_KEY,
      });
    t.approve(a);
    const scope = {
      attemptId: a.id,
      mandateId: a.mandateId,
      ownerId: a.ownerId,
      merchantId: a.merchantId,
      orderId: a.orderId ?? "MISSING",
      captureRequestId: a.captureRequestId,
    };
    t.gateway.getCapture.mockImplementation(async () => {
      const order = await t.gateway.getOrder(),
        cap = order.purchase_units[0]?.payments?.captures?.[0];
      if (!cap) throw new Error("TEST_CAPTURE_REQUIRED");
      return {
        ...cap,
        supplementary_data: { related_ids: { order_id: order.id } },
      };
    });
    const results = await Promise.allSettled(
      Array.from({ length: 4 }, () =>
        t.service.capturePreparedOnce(owner, scope),
      ),
    );
    if (results.every((r) => r.status === "rejected"))
      console.error(
        JSON.stringify({
          event: "DISPOSABLE_CAPTURE_CONCURRENCY_FAILED",
          categories: results.map((r) =>
            r.status === "rejected" && r.reason instanceof PaymentError
              ? r.reason.code
              : r.status === "rejected" &&
                  r.reason instanceof Error &&
                  r.reason.message === "POSTGRES_TRANSPORT_OR_TIMEOUT"
                ? "POSTGRES_TRANSPORT_OR_TIMEOUT"
                : "UNCLASSIFIED_TEST_FAILURE",
          ),
        }),
      );
    expect(results.some((r) => r.status === "fulfilled")).toBe(true);
    expect(t.gateway.captureOrder).toHaveBeenCalledTimes(1);
    expect(await budget(a.mandateId)).toMatchObject({
      reserved_minor: "0",
      consumed_minor: "600",
    });
    const saved = await t.repository.findAttempt(a.id);
    expect(saved).toMatchObject({
      state: "SUCCEEDED",
      budgetState: "CONSUMED",
    });
    const before = (
      await pool?.query(
        "SELECT to_jsonb(a) AS record FROM earmark_paypal.attempts a WHERE id=$1",
        [a.id],
      )
    )?.rows;
    const restarted = new PayPalPaymentService(t.repository, t.gateway);
    await restarted.capturePreparedOnce(owner, scope);
    expect(
      (
        await pool?.query(
          "SELECT to_jsonb(a) AS record FROM earmark_paypal.attempts a WHERE id=$1",
          [a.id],
        )
      )?.rows,
    ).toEqual(before);
    expect(t.gateway.captureOrder).toHaveBeenCalledTimes(1);
    const audit =
      (
        await pool?.query(
          "SELECT action,detail FROM earmark_paypal.audit WHERE attempt_id=$1",
          [a.id],
        )
      )?.rows ?? [];
    expect(audit.filter((e) => e.action === "CAPTURE_PREPARED")).toHaveLength(
      1,
    );
    expect(
      audit.filter(
        (e) =>
          e.action === "PAYPAL_STATE_RECONCILED" && e.detail === "COMPLETED",
      ),
    ).toHaveLength(1);
  }, 90000);
  it("capture-once uncertain POST keeps all $6 held and its durable capture identity cannot be reissued", async () => {
    const t = await databaseFixture(),
      a = await t.service.createOrder(owner, {
        ...t.input,
        purchaseKey: US_PURCHASE_KEY,
      });
    t.approve(a);
    const scope = {
      attemptId: a.id,
      mandateId: a.mandateId,
      ownerId: a.ownerId,
      merchantId: a.merchantId,
      orderId: a.orderId ?? "MISSING",
      captureRequestId: a.captureRequestId,
    };
    t.gateway.captureOrder.mockRejectedValueOnce(
      new PayPalError("PAYPAL_RESPONSE_UNCERTAIN", true),
    );
    await expect(t.service.capturePreparedOnce(owner, scope)).rejects.toThrow(
      "CAPTURE_STOP_RECONCILIATION_REQUIRED",
    );
    expect(await t.repository.findAttempt(a.id)).toMatchObject({
      state: "CAPTURE_UNCERTAIN",
      budgetState: "RESERVED",
      captureRequestId: a.captureRequestId,
    });
    expect(await budget(a.mandateId)).toMatchObject({
      reserved_minor: "600",
      consumed_minor: "0",
    });
    const restarted = new PayPalPaymentService(t.repository, t.gateway);
    await expect(restarted.capturePreparedOnce(owner, scope)).rejects.toThrow(
      "CAPTURE_ALREADY_CLAIMED_OR_UNCERTAIN_STOP",
    );
    expect(t.gateway.captureOrder).toHaveBeenCalledTimes(1);
  }, 90000);
  it("one-shot dispatch commits one durable claim under concurrency and cannot be replayed after restart", async () => {
    const t = await databaseFixture();
    const a = await t.service.reserve(owner, {
      ...t.input,
      purchaseKey: US_PURCHASE_KEY,
    });
    const scope = {
      attemptId: a.id,
      mandateId: a.mandateId,
      ownerId: a.ownerId,
      merchantId: a.merchantId,
      createRequestId: a.createRequestId,
    };
    const results = await Promise.allSettled(
      Array.from({ length: 4 }, () =>
        t.service.createPreparedOrderOnce(owner, scope),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(t.gateway.createOrder).toHaveBeenCalledTimes(1);
    expect(t.gateway.captureOrder).not.toHaveBeenCalled();
    expect(await budget(a.mandateId)).toMatchObject({
      reserved_minor: "600",
      consumed_minor: "0",
    });
    const restarted = new PayPalPaymentService(t.repository, t.gateway);
    await expect(
      restarted.createPreparedOrderOnce(owner, scope),
    ).rejects.toThrow("ONE_SHOT_ALREADY_ATTEMPTED_STOP");
    const events = await pool?.query(
      "SELECT action FROM earmark_paypal.audit WHERE attempt_id=$1",
      [a.id],
    );
    expect(
      events?.rows.filter((r) => r.action === "CREATE_PREPARED"),
    ).toHaveLength(1);
    expect(
      events?.rows.filter((r) => r.action === "BUDGET_RESERVED"),
    ).toHaveLength(1);
  }, 90000);
  it("one-shot rejection retains the existing reservation and prevents a second POST durably", async () => {
    const t = await databaseFixture();
    const a = await t.service.reserve(owner, {
      ...t.input,
      purchaseKey: US_PURCHASE_KEY,
    });
    const scope = {
      attemptId: a.id,
      mandateId: a.mandateId,
      ownerId: a.ownerId,
      merchantId: a.merchantId,
      createRequestId: a.createRequestId,
    };
    t.gateway.createOrder.mockRejectedValueOnce(
      new PayPalError("PAYPAL_REQUEST_REJECTED", false, 422),
    );
    await expect(
      t.service.createPreparedOrderOnce(owner, scope),
    ).rejects.toThrow("ONE_SHOT_STOP_RECONCILIATION_REQUIRED");
    expect(await t.repository.findAttempt(a.id)).toMatchObject({
      state: "CREATE_UNCERTAIN",
      budgetState: "RESERVED",
    });
    expect(await budget(a.mandateId)).toMatchObject({
      reserved_minor: "600",
      consumed_minor: "0",
    });
    await expect(
      t.service.createPreparedOrderOnce(owner, scope),
    ).rejects.toThrow("ONE_SHOT_ALREADY_ATTEMPTED_STOP");
    expect(t.gateway.createOrder).toHaveBeenCalledTimes(1);
  }, 90000);
  it("US preparation uses a separate cap and durable intent under concurrent requests without touching the old merchant", async () => {
    const t = await controlledFixture();
    await t.controlled.mandate(t.actor);
    await t.controlled.action(t.actor, "order");
    const old = await t.controlled.snapshot(t.actor);
    const oldAttempt = await t.repository.findAttempt(old.attempt?.id ?? "");
    const usConfig = testCheckoutConfig({
      ...testEnv,
      ...usEnv,
      PAYPAL_TEST_OWNER_ID: t.actor.ownerId,
    });
    const us = new TestCheckoutService(usConfig, t.repository, t.gateway);
    await Promise.all(Array.from({ length: 4 }, () => us.mandate(t.actor)));
    await Promise.all(
      Array.from({ length: 4 }, () => us.action(t.actor, "reserve")),
    );
    const saved = await us.snapshot(t.actor);
    expect(saved).toMatchObject({
      preparationOnly: true,
      executionEnabled: false,
      reservedMinor: "600",
      capturedMinor: "0",
      availableMinor: "400",
      attempt: { state: "RESERVED", orderId: null },
    });
    const a = await t.repository.findAttempt(saved.attempt?.id ?? "");
    expect(a?.createRequestId).not.toBe(oldAttempt?.createRequestId);
    expect(a?.captureRequestId).not.toBe(oldAttempt?.captureRequestId);
    expect(a?.merchantId).not.toBe(oldAttempt?.merchantId);
    expect(await t.controlled.snapshot(t.actor)).toEqual(old);
    await expect(us.action(t.actor, "order")).rejects.toThrow(
      "PREPARATION_ONLY_NO_PAYMENT_ACTIONS",
    );
    expect(t.gateway.createOrder).toHaveBeenCalledTimes(1);
    expect(t.gateway.captureOrder).not.toHaveBeenCalled();
  }, 90000);
  it("original hold is append-only, owner-authorized and concurrency-idempotent without changing payment rows", async () => {
    const t = await controlledFixture();
    const mandate = createMandate(
      t.actor,
      {
        ...mandateInput,
        agentId: t.config.agentId,
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      },
      Date.now(),
    );
    mandate.id = ORIGINAL_MANDATE_ID;
    await t.repository.insertMandate(mandate);
    t.gateway.createOrder.mockImplementation(async (a) => ({
      ...t.remote(a, "CREATED"),
      id: ORIGINAL_ORDER_ID,
    }));
    const a = await t.service.createOrder(t.actor, {
      ...t.input,
      mandateId: mandate.id,
    });
    const snapshot = async () =>
      (
        await pool?.query(
          `SELECT to_jsonb(m) AS mandate,to_jsonb(a) AS attempt FROM earmark_paypal.mandates m JOIN earmark_paypal.attempts a ON a.mandate_id=m.id WHERE m.id=$1`,
          [mandate.id],
        )
      )?.rows;
    const before = await snapshot();
    const auditBefore =
      (
        await pool?.query(
          "SELECT * FROM earmark_paypal.audit WHERE mandate_id=$1 ORDER BY id",
          [mandate.id],
        )
      )?.rows ?? [];
    await expect(
      t.repository.recordOriginalHold({ ...t.actor, subjectId: "forged" }),
    ).rejects.toThrow("MANDATE_OWNER_REQUIRED");
    await Promise.all(
      Array.from({ length: 5 }, () => t.repository.recordOriginalHold(t.actor)),
    );
    expect(await snapshot()).toEqual(before);
    const auditAfter =
      (
        await pool?.query(
          "SELECT * FROM earmark_paypal.audit WHERE mandate_id=$1 ORDER BY id",
          [mandate.id],
        )
      )?.rows ?? [];
    expect(auditAfter.slice(0, auditBefore.length)).toEqual(auditBefore);
    expect(auditAfter.length).toBe(auditBefore.length + 1);
    expect(auditAfter.at(-1)).toMatchObject({
      action: "OPERATOR_RESERVATION_HELD",
      attempt_id: a.id,
    });
    expect(JSON.parse(String(auditAfter.at(-1)?.detail))).toMatchObject({
      releaseAuthorized: false,
      decision: "RETAIN_UNRESOLVED_OBLIGATION",
    });
  }, 90000);
  it("fixed checkout survives concurrent mandate/order calls and preserves exact $10/$6/$4 accounting", async () => {
    const t = await controlledFixture();
    const created = await Promise.all(
      Array.from({ length: 4 }, () => t.controlled.mandate(t.actor)),
    );
    expect(new Set(created.map((s) => s.mandate?.id)).size).toBe(1);
    await Promise.all(
      Array.from({ length: 4 }, () => t.controlled.action(t.actor, "order")),
    );
    expect(t.gateway.createOrder).toHaveBeenCalledTimes(1);
    const saved = await t.controlled.snapshot(t.actor);
    expect(saved).toMatchObject({
      authorizedMinor: "1000",
      reservedMinor: "600",
      capturedMinor: "0",
      availableMinor: "400",
    });
    await expect(t.controlled.action(t.actor, "capture")).rejects.toThrow(
      "BUYER_APPROVAL_REQUIRED",
    );
    const a = saved.attempt
      ? await t.repository.findAttempt(saved.attempt.id)
      : undefined;
    if (!a) throw new Error("TEST_ATTEMPT_REQUIRED");
    t.approve(a);
    expect(await t.controlled.action(t.actor, "capture")).toMatchObject({
      capturedMinor: "600",
      reservedMinor: "0",
      availableMinor: "400",
      paymentConfirmed: true,
    });
    await t.controlled.action(t.actor, "capture");
    expect(t.gateway.captureOrder).toHaveBeenCalledTimes(1);
  }, 90000);
  it("restarted fixed checkout cannot reset its budget and cancelled ambiguous work remains held", async () => {
    const t = await controlledFixture();
    await t.controlled.mandate(t.actor);
    await t.controlled.action(t.actor, "order");
    const s = await t.controlled.snapshot(t.actor),
      a = s.attempt ? await t.repository.findAttempt(s.attempt.id) : undefined;
    if (!a) throw new Error("TEST_ATTEMPT_REQUIRED");
    t.approve(a);
    t.gateway.captureOrder.mockRejectedValueOnce(
      new PayPalError("PAYPAL_RESPONSE_UNCERTAIN", true),
    );
    expect((await t.controlled.action(t.actor, "capture")).attempt?.state).toBe(
      "CAPTURE_UNCERTAIN",
    );
    const restarted = new TestCheckoutService(
      t.config,
      t.repository,
      t.gateway,
    );
    expect((await restarted.mandate(t.actor)).mandate?.id).toBe(s.mandate?.id);
    await restarted.action(t.actor, "capture");
    expect(t.gateway.captureOrder).toHaveBeenCalledTimes(1);
    expect(await restarted.action(t.actor, "cancel")).toMatchObject({
      mandate: { status: "REVOKED" },
      reservedMinor: "600",
      capturedMinor: "0",
      availableMinor: "400",
      paymentConfirmed: false,
    });
  }, 90000);
  it("prevents concurrent overspending using real independent database transactions", async () => {
    const t = await databaseFixture();
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, (_, i) =>
        t.service.reserve(agent, {
          ...t.input,
          purchaseKey: `concurrent-${i}`,
        }),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    for (const result of results)
      if (result.status === "rejected")
        expect(String(result.reason)).toContain("BUDGET_EXHAUSTED");
    expect(await budget(t.mandate.id)).toMatchObject({
      reserved_minor: "600",
      consumed_minor: "0",
    });
    const rows = await pool?.query(
      "SELECT count(*)::integer AS count FROM earmark_paypal.attempts WHERE mandate_id=$1",
      [t.mandate.id],
    );
    expect(rows?.rows[0]?.count).toBe(1);
  }, 60000);
  it("rejects raw counter/cap violations and rolls back the real transaction", async () => {
    const t = await databaseFixture();
    await expect(
      pool?.query(
        "UPDATE earmark_paypal.mandates SET reserved_minor=1 WHERE id=$1",
        [t.mandate.id],
      ),
    ).rejects.toThrow("BUDGET_LEDGER_MISMATCH");
    await expect(
      pool?.query(
        "UPDATE earmark_paypal.mandates SET reserved_minor=1001 WHERE id=$1",
        [t.mandate.id],
      ),
    ).rejects.toMatchObject({ code: "23514" });
    expect(await budget(t.mandate.id)).toMatchObject({
      reserved_minor: "0",
      consumed_minor: "0",
    });
  }, 60000);
  it("deduplicates concurrent intents across repository instances, cancels and consumes exactly once", async () => {
    const t = await databaseFixture();
    if (!pool) throw new Error("TEST_DATABASE_NOT_READY");
    const other = new PayPalPaymentService(
      new PostgresPaymentRepository(pool),
      t.gateway,
    );
    const [first, again] = await Promise.all([
      t.service.reserve(agent, t.input),
      other.reserve(agent, t.input),
    ]);
    if (!first || !again) throw new Error("TEST_RESERVATION_MISSING");
    expect(again.id).toBe(first.id);
    expect(await budget(t.mandate.id)).toMatchObject({ reserved_minor: "600" });
    await t.service.cancelReservation(owner, first.id);
    expect((await t.repository.findAttempt(first.id))?.budgetState).toBe(
      "RELEASED",
    );
    const ordered = await t.service.createOrder(owner, {
      ...t.input,
      purchaseKey: "approved-capture",
    });
    t.approve(ordered);
    expect((await other.capture(owner, ordered.id)).state).toBe("SUCCEEDED");
    expect(await budget(t.mandate.id)).toMatchObject({
      reserved_minor: "0",
      consumed_minor: "600",
    });
    await t.service.capture(owner, ordered.id);
    expect(t.gateway.captureOrder).toHaveBeenCalledTimes(1);
    const ids = await pool.query(
      "SELECT count(*)::integer AS count FROM earmark_paypal.idempotency WHERE attempt_id=$1",
      [ordered.id],
    );
    expect(ids.rows[0]?.count).toBe(2);
    const audit = await pool.query(
      "SELECT count(*)::integer AS count FROM earmark_paypal.audit WHERE mandate_id=$1",
      [t.mandate.id],
    );
    expect(audit.rows[0]?.count).toBeGreaterThan(3);
  }, 60000);
  it("database triggers protect policy, request identity and append-only audit history", async () => {
    const t = await databaseFixture(),
      a = await t.service.reserve(agent, t.input);
    await expect(
      pool?.query(
        "UPDATE earmark_paypal.mandates SET cap_minor=9999 WHERE id=$1",
        [t.mandate.id],
      ),
    ).rejects.toThrow("MANDATE_POLICY_IMMUTABLE");
    await expect(
      pool?.query(
        "UPDATE earmark_paypal.attempts SET create_request_id=gen_random_uuid() WHERE id=$1",
        [a.id],
      ),
    ).rejects.toThrow("PAYMENT_TERMS_IMMUTABLE");
    await expect(
      pool?.query("DELETE FROM earmark_paypal.audit WHERE mandate_id=$1", [
        t.mandate.id,
      ]),
    ).rejects.toThrow("AUDIT_APPEND_ONLY");
  }, 60000);
  it("revocation rejects new authority but preserves in-flight accounting and trusted resolution", async () => {
    const t = await databaseFixture(),
      a = await t.service.createOrder(owner, t.input);
    t.approve(a);
    await t.service.revokeMandate(owner, t.mandate.id);
    await expect(
      t.service.reserve(agent, { ...t.input, purchaseKey: "after-revoke" }),
    ).rejects.toThrow("MANDATE_INACTIVE");
    await expect(t.service.capture(owner, a.id)).rejects.toThrow(
      "MANDATE_INACTIVE",
    );
    expect(await budget(t.mandate.id)).toMatchObject({
      status: "REVOKED",
      reserved_minor: "600",
      consumed_minor: "0",
    });
    t.observe(a, "COMPLETED", "COMPLETED");
    await t.service.reconcile(a.id);
    expect(await budget(t.mandate.id)).toMatchObject({
      status: "REVOKED",
      reserved_minor: "0",
      consumed_minor: "600",
    });
    await expect(
      pool?.query(
        "UPDATE earmark_paypal.mandates SET status='ACTIVE' WHERE id=$1",
        [t.mandate.id],
      ),
    ).rejects.toThrow("MANDATE_POLICY_IMMUTABLE");
  }, 60000);
  it("ambiguous create/capture and pending outcomes hold budgets until a confirmed terminal read", async () => {
    const first = await databaseFixture();
    first.gateway.createOrder.mockRejectedValueOnce(
      new PayPalError("PAYPAL_RESPONSE_UNCERTAIN", true),
    );
    const unknown = await first.service.createOrder(owner, first.input);
    expect(unknown.state).toBe("CREATE_UNCERTAIN");
    await first.service.createOrder(owner, first.input);
    expect(first.gateway.createOrder).toHaveBeenCalledTimes(1);
    expect(await budget(first.mandate.id)).toMatchObject({
      reserved_minor: "600",
      consumed_minor: "0",
    });
    await expect(
      first.service.cancelReservation(owner, unknown.id),
    ).rejects.toThrow("RECONCILIATION_REQUIRED");
    const t = await databaseFixture(),
      a = await t.service.createOrder(owner, t.input);
    t.approve(a);
    t.gateway.captureOrder.mockRejectedValueOnce(
      new PayPalError("PAYPAL_RESPONSE_UNCERTAIN", true),
    );
    expect((await t.service.capture(owner, a.id)).state).toBe(
      "CAPTURE_UNCERTAIN",
    );
    await t.service.capture(owner, a.id);
    expect(t.gateway.captureOrder).toHaveBeenCalledTimes(1);
    t.observe(a, "COMPLETED", "PENDING");
    expect((await t.service.reconcile(a.id)).state).toBe("PENDING");
    expect(await budget(t.mandate.id)).toMatchObject({
      reserved_minor: "600",
      consumed_minor: "0",
    });
    t.observe(a, "COMPLETED", "COMPLETED");
    await t.service.reconcile(a.id);
    await t.service.reconcile(a.id);
    expect(await budget(t.mandate.id)).toMatchObject({
      reserved_minor: "0",
      consumed_minor: "600",
    });
  }, 60000);
  it("concurrent capture callers share a durable claim and cannot submit a second capture", async () => {
    const t = await databaseFixture(),
      a = await t.service.createOrder(owner, t.input);
    t.approve(a);
    let finish = () => {},
      entered = () => {};
    const gate = new Promise<void>((resolve) => {
        finish = resolve;
      }),
      started = new Promise<void>((resolve) => {
        entered = resolve;
      });
    t.gateway.captureOrder.mockImplementation(async (bound) => {
      entered();
      await gate;
      return t.remote(bound, "COMPLETED", "COMPLETED");
    });
    const first = t.service.capture(owner, a.id);
    try {
      await started;
      await t.service.capture(owner, a.id);
    } finally {
      finish();
    }
    await first;
    expect(t.gateway.captureOrder).toHaveBeenCalledTimes(1);
    expect(await budget(t.mandate.id)).toMatchObject({
      reserved_minor: "0",
      consumed_minor: "600",
    });
  }, 60000);
  it("confirmed rejection releases once and terminal financial records cannot be resurrected", async () => {
    const t = await databaseFixture(),
      a = await t.service.createOrder(owner, t.input);
    t.observe(a, "COMPLETED", "DECLINED");
    await t.service.reconcile(a.id);
    await t.service.reconcile(a.id);
    expect(await budget(t.mandate.id)).toMatchObject({
      reserved_minor: "0",
      consumed_minor: "0",
    });
    await expect(
      pool?.query(
        "UPDATE earmark_paypal.attempts SET state='APPROVED' WHERE id=$1",
        [a.id],
      ),
    ).rejects.toThrow("PAYMENT_TERMS_IMMUTABLE");
    expect((await t.repository.findAttempt(a.id))?.state).toBe("FAILED");
  }, 60000);
  it("authorizes Gemini agent purchase proposals in disposable PostgreSQL schema with row locking and zero PayPal orders", async () => {
    if (!pool) throw new Error("TEST_DATABASE_NOT_READY");
    const repo = new PostgresPaymentRepository(pool);
    const evalResult = await evaluatePayPalAgentScenario({
      scenarioId: "normal",
      mode: "deterministic-policy",
      repository: repo,
    });
    expect(evalResult.proposalState).toBe(
      "PROPOSAL_AUTHORIZED_NO_ORDER_CREATED",
    );
    expect(evalResult.proposal?.offerId).toBe("offer-us-weather-fast-400");
    expect(await budget(evalResult.mandate.id)).toMatchObject({
      reserved_minor: "400",
      consumed_minor: "0",
      status: "ACTIVE",
    });

    // Now test concurrent $6.00 (600 minor) agent proposals on the remaining $6.00 (600 minor) available cap in Postgres
    const fixture = buildPayPalScenarioFixture("normal");
    const service = new PayPalAgentProposalService({
      repository: repo,
      actor: fixture.actor,
      mandateId: evalResult.mandate.id,
      objective: fixture.objective,
      catalog: fixture.catalog,
      now: () => fixture.now,
    });
    const concurrent = await Promise.all(
      Array.from({ length: 4 }, (_, i) =>
        service.proposePurchase({
          offerId: "offer-us-weather-std-600",
          reason: `Concurrent Postgres agent proposal ${i}`,
          purchaseKey: `pk-pg-concurrent-${i}`,
        }),
      ),
    );
    expect(concurrent.filter((d) => d.allowed)).toHaveLength(1);
    expect(concurrent.filter((d) => !d.allowed)).toHaveLength(3);
    for (const rejected of concurrent.filter((d) => !d.allowed)) {
      expect(rejected.verdictCode).toBe("BUDGET_EXHAUSTED");
    }
    expect(await budget(evalResult.mandate.id)).toMatchObject({
      reserved_minor: "1000",
      consumed_minor: "0",
    });
  }, 60000);
});
