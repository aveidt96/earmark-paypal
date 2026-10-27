import { describe, expect, it, vi } from "vitest";
import type { Pool } from "@flint/agent/server";
vi.mock("server-only", () => ({}));
import {
  paypalDatabase,
  assertPayPalDatabase,
  PostgresPaymentRepository,
} from "../src/server/paypal/postgres";
import { agent, fixture } from "./fixtures/paypal";

describe("PostgreSQL repository transactional boundary (mock connection)", () => {
  async function connection() {
    const t = await fixture();
    const m = t.mandate;
    const query = vi.fn<
      (
        sql: string,
        args?: unknown[],
      ) => Promise<{ rows: Record<string, unknown>[]; rowCount: number }>
    >(async (sql, _args) => {
      if (sql.includes("database_now"))
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
              expires_at: new Date(m.expiresAt),
              created_at: new Date(m.createdAt),
              database_now: new Date(t.repository.now),
            },
          ],
          rowCount: 1,
        };
      if (sql.includes("SELECT merchant_id"))
        return {
          rows: m.merchants.map((merchant_id) => ({ merchant_id })),
          rowCount: 1,
        };
      return { rows: [], rowCount: 1 };
    });
    const client = { query, release: vi.fn() };
    const pool = { connect: vi.fn(async () => client) } as unknown as Pool;
    const repository = new PostgresPaymentRepository(pool);
    return { ...t, repository, query, client };
  }
  it("locks mandate before reservation and journals intent/audit before committing", async () => {
    const t = await connection();
    const { PayPalPaymentService } =
      await import("../src/server/paypal/service");
    await new PayPalPaymentService(t.repository, t.gateway).reserve(
      agent,
      t.input,
    );
    const sql = t.query.mock.calls.map(([s]) => s);
    expect(sql[0]).toBe("BEGIN");
    expect(sql[1]).toContain("FOR UPDATE");
    expect(
      sql.findIndex((s) => s === "SELECT clock_timestamp() AS database_now"),
    ).toBeGreaterThan(
      sql.findIndex(
        (s) => s.includes("SELECT record") && s.includes("FOR UPDATE"),
      ),
    );
    expect(sql.findIndex((s) => s.includes("FOR UPDATE"))).toBeLessThan(
      sql.findIndex((s) => s.includes("UPDATE earmark_paypal.mandates")),
    );
    expect(
      sql.filter((s) => s.includes("INSERT INTO earmark_paypal.idempotency")),
    ).toHaveLength(2);
    expect(
      sql.some((s) => s.includes("INSERT INTO earmark_paypal.audit")),
    ).toBe(true);
    expect(sql.at(-1)).toBe("COMMIT");
    expect(t.client.release).toHaveBeenCalledOnce();
    expect(t.gateway.createOrder).not.toHaveBeenCalled();
  });
  it("updates existing attempts directly without firing a new INSERT lifecycle trigger", async () => {
    const t = await connection();
    const a = await t.service.reserve(agent, t.input);
    const original = t.query.getMockImplementation();
    if (!original) throw new Error("MISSING_MOCK_QUERY");
    t.query.mockImplementation(async (sql, args) => {
      if (sql.includes("SELECT record"))
        return { rows: [{ record: a }], rowCount: 1 };
      const result = await original(sql, args);
      if (sql.includes("FROM earmark_paypal.mandates") && result.rows[0])
        result.rows[0].reserved_minor = "600";
      return result;
    });
    await t.repository.mutate(a.mandateId, { id: a.id }, (tx) => {
      if (tx.attempt) tx.attempt.state = "CREATING";
    });
    const statements = t.query.mock.calls.map(([sql]) => sql);
    expect(
      statements.some((sql) =>
        sql.startsWith("UPDATE earmark_paypal.attempts"),
      ),
    ).toBe(true);
    expect(
      statements.some((sql) =>
        sql.includes("INSERT INTO earmark_paypal.attempts"),
      ),
    ).toBe(false);
    expect(statements.at(-1)).toBe("COMMIT");
  });
  it("rolls back a rejected mutation and never commits partial accounting", async () => {
    const t = await connection();
    await expect(
      t.repository.mutate(t.mandate.id, undefined, (tx) => {
        tx.mandate.reservedMinor = "1";
      }),
    ).rejects.toThrow("BUDGET_LEDGER_MISMATCH");
    expect(t.query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
    expect(t.query.mock.calls.some(([s]) => s === "COMMIT")).toBe(false);
    expect(t.client.release).toHaveBeenCalledOnce();
  });
  it("sanitizes database failures and forbids asynchronous work under a budget lock", async () => {
    const t = await connection();
    await expect(
      t.repository.mutate(t.mandate.id, undefined, async () => {}),
    ).rejects.toThrow("ASYNC_DATABASE_MUTATION_FORBIDDEN");
    t.query.mockRejectedValueOnce(
      new Error("postgres connection with private data"),
    );
    await expect(
      t.repository.mutate(t.mandate.id, undefined, () => {}),
    ).rejects.toThrow("PAYPAL_DATABASE_UNAVAILABLE");
  });
  it("does not fall back to legacy database variables", () => {
    expect(() =>
      paypalDatabase({ DATABASE_URL: "not a PayPal connection" }),
    ).toThrow("PAYPAL_DATABASE_CONFIGURATION_REQUIRED");
    expect(() =>
      paypalDatabase({
        PAYPAL_DATABASE_ENVIRONMENT: "production",
        PAYPAL_DATABASE_URL: "invalid",
      }),
    ).toThrow("PAYPAL_DATABASE_CONFIGURATION_REQUIRED");
    expect(() =>
      paypalDatabase({
        PAYPAL_DATABASE_ENVIRONMENT: "sandbox",
        PAYPAL_DATABASE_URL: "invalid",
      }),
    ).toThrow("INVALID_PAYPAL_DATABASE_CONFIGURATION");
  });
  it("rejects an original Monad database and mismatched environment binding", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ legacy: "earmark_environment" }] });
    await expect(
      assertPayPalDatabase({ query } as unknown as Pool),
    ).rejects.toThrow("LEGACY_DATABASE_FORBIDDEN");
    query
      .mockResolvedValueOnce({ rows: [{ legacy: null }] })
      .mockResolvedValueOnce({ rows: [{ environment: "live", version: 1 }] });
    await expect(
      assertPayPalDatabase({ query } as unknown as Pool),
    ).rejects.toThrow("PAYPAL_DATABASE_BINDING_MISMATCH");
  });
});
