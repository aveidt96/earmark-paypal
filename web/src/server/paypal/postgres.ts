import "server-only";
import { createDatabase, type Pool } from "@flint/agent/server";
import {
  type Attempt,
  type Mandate,
  type Principal,
  attemptSchema,
  mandateSchema,
  parse,
  PaymentError,
} from "./domain";
import {
  type Mutation,
  type PaymentRepository,
  type Selector,
  type VerifiedEvent,
  validateMutation,
} from "./repository";
import {
  ORIGINAL_MANDATE_ID,
  ORIGINAL_ORDER_ID,
  originalReservationHold,
} from "./operator-hold";

/** Reuse the established TLS/direct-Neon pool, never the legacy schema/binding. */
export function paypalDatabase(
  env: Record<string, string | undefined> = process.env,
  localTest = false,
) {
  if (env.PAYPAL_DATABASE_ENVIRONMENT !== "sandbox" || !env.PAYPAL_DATABASE_URL)
    throw new PaymentError("PAYPAL_DATABASE_CONFIGURATION_REQUIRED");
  try {
    return createDatabase(env.PAYPAL_DATABASE_URL, localTest);
  } catch {
    throw new PaymentError("INVALID_PAYPAL_DATABASE_CONFIGURATION");
  }
}
export async function assertPayPalDatabase(pool: Pool) {
  const legacy = await pool.query<{ legacy: string | null }>(
    "SELECT to_regclass('public.earmark_environment')::text AS legacy",
  );
  if (legacy.rows[0]?.legacy)
    throw new PaymentError("LEGACY_DATABASE_FORBIDDEN");
  const binding = await pool.query<{ environment: string; version: number }>(
    "SELECT environment,version FROM earmark_paypal.environment WHERE singleton=true",
  );
  if (
    binding.rows[0]?.environment !== "sandbox" ||
    binding.rows[0]?.version !== 1
  )
    throw new PaymentError("PAYPAL_DATABASE_BINDING_MISMATCH");
}
function databaseError(error: unknown): never {
  if (error instanceof PaymentError) throw error;
  throw new PaymentError("PAYPAL_DATABASE_UNAVAILABLE");
}
function mandateRecord(row: Record<string, unknown>): Mandate {
  return parse(mandateSchema, {
    id: row.id,
    ownerId: row.owner_id,
    agentId: row.agent_id,
    currency: row.currency,
    capMinor: row.cap_minor,
    perTransactionMinor: row.per_transaction_minor,
    reservedMinor: row.reserved_minor,
    consumedMinor: row.consumed_minor,
    status: row.status,
    expiresAt: (row.expires_at as Date).toISOString(),
    createdAt: (row.created_at as Date).toISOString(),
    merchants: row.merchants,
  });
}
export class PostgresPaymentRepository implements PaymentRepository {
  constructor(readonly pool: Pool) {}

  async recordOriginalHold(actor: Principal): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const rows = await client.query<Record<string, unknown>>(
        `SELECT m.*,ARRAY(SELECT merchant_id FROM earmark_paypal.approved_merchants WHERE mandate_id=m.id ORDER BY merchant_id) AS merchants
         FROM earmark_paypal.mandates m WHERE m.id=$1 FOR UPDATE`,
        [ORIGINAL_MANDATE_ID],
      );
      const row = rows.rows[0];
      if (!row) throw new PaymentError("ORIGINAL_CHECKOUT_REQUIRED");
      const attempts = await client.query<{ record: unknown }>(
        "SELECT record FROM earmark_paypal.attempts WHERE mandate_id=$1 AND order_id=$2 FOR UPDATE",
        [ORIGINAL_MANDATE_ID, ORIGINAL_ORDER_ID],
      );
      const a = attempts.rows[0];
      if (!a || attempts.rows.length !== 1)
        throw new PaymentError("ORIGINAL_CHECKOUT_REQUIRED");
      const entry = originalReservationHold(
        actor,
        mandateRecord(row),
        parse(attemptSchema, a.record),
      );
      // Mandate lock serializes duplicate holds. Append only; do not UPDATE any old
      // mandate, attempt, request identity, accounting or existing audit record.
      await client.query(
        `INSERT INTO earmark_paypal.audit(mandate_id,attempt_id,action,detail)
        SELECT $1,$2,$3,$4 WHERE NOT EXISTS(SELECT 1 FROM earmark_paypal.audit
          WHERE mandate_id=$1 AND attempt_id=$2 AND action=$3 AND detail=$4)`,
        [ORIGINAL_MANDATE_ID, entry.attemptId, entry.action, entry.detail],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      databaseError(error);
    } finally {
      client.release();
    }
  }

  async readMandate(id: string): Promise<Mandate | undefined> {
    try {
      const result = await this.pool.query<Record<string, unknown>>(
        `SELECT m.*,
        ARRAY(SELECT merchant_id FROM earmark_paypal.approved_merchants WHERE mandate_id=m.id ORDER BY merchant_id) AS merchants
        FROM earmark_paypal.mandates m WHERE m.id=$1`,
        [id],
      );
      const row = result.rows[0];
      if (!row) return undefined;
      return mandateRecord(row);
    } catch (error) {
      databaseError(error);
    }
  }
  async readCheckout(
    id: string,
    purchaseKey: string,
  ): Promise<{ mandate: Mandate | undefined; attempt: Attempt | undefined }> {
    try {
      // One MVCC statement keeps the status and accounting projection from crossing a capture commit.
      const result = await this.pool.query<Record<string, unknown>>(
        `SELECT m.*,
        ARRAY(SELECT merchant_id FROM earmark_paypal.approved_merchants WHERE mandate_id=m.id ORDER BY merchant_id) AS merchants,
        (SELECT record FROM earmark_paypal.attempts WHERE mandate_id=m.id AND purchase_key=$2) AS attempt_record
        FROM earmark_paypal.mandates m WHERE m.id=$1`,
        [id, purchaseKey],
      );
      const row = result.rows[0];
      return {
        mandate: row ? mandateRecord(row) : undefined,
        attempt: row?.attempt_record
          ? parse(attemptSchema, row.attempt_record)
          : undefined,
      };
    } catch (error) {
      databaseError(error);
    }
  }
  async findPurchase(
    mandateId: string,
    purchaseKey: string,
  ): Promise<Attempt | undefined> {
    try {
      const result = await this.pool.query<{ record: unknown }>(
        "SELECT record FROM earmark_paypal.attempts WHERE mandate_id=$1 AND purchase_key=$2",
        [mandateId, purchaseKey],
      );
      return result.rows[0]
        ? parse(attemptSchema, result.rows[0].record)
        : undefined;
    } catch (error) {
      databaseError(error);
    }
  }

  async insertMandate(m: Mandate) {
    parse(mandateSchema, m);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO earmark_paypal.mandates
        (id,owner_id,agent_id,currency,cap_minor,per_transaction_minor,reserved_minor,consumed_minor,status,expires_at,created_at)
        VALUES($1,$2,$3,$4,$5,$6,0,0,$7,$8,$9)`,
        [
          m.id,
          m.ownerId,
          m.agentId,
          m.currency,
          m.capMinor,
          m.perTransactionMinor,
          m.status,
          m.expiresAt,
          m.createdAt,
        ],
      );
      for (const merchant of m.merchants)
        await client.query(
          "INSERT INTO earmark_paypal.approved_merchants VALUES($1,$2)",
          [m.id, merchant],
        );
      await client.query(
        "INSERT INTO earmark_paypal.audit(mandate_id,action) VALUES($1,'MANDATE_CREATED')",
        [m.id],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      databaseError(error);
    } finally {
      client.release();
    }
  }
  async mutate<T>(
    id: string,
    selector: Selector | undefined,
    work: (tx: Mutation) => T,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      // Every reserve, release, consume and revoke shares this row lock.
      const rows = await client.query<Record<string, unknown>>(
        "SELECT *,clock_timestamp() AS database_now FROM earmark_paypal.mandates WHERE id=$1 FOR UPDATE",
        [id],
      );
      const row = rows.rows[0];
      if (!row) throw new PaymentError("MANDATE_NOT_FOUND");
      const merchants = await client.query<{ merchant_id: string }>(
        "SELECT merchant_id FROM earmark_paypal.approved_merchants WHERE mandate_id=$1 ORDER BY merchant_id",
        [id],
      );
      const m = parse(mandateSchema, {
        id,
        ownerId: row.owner_id,
        agentId: row.agent_id,
        currency: row.currency,
        capMinor: row.cap_minor,
        perTransactionMinor: row.per_transaction_minor,
        reservedMinor: row.reserved_minor,
        consumedMinor: row.consumed_minor,
        status: row.status,
        expiresAt: (row.expires_at as Date).toISOString(),
        createdAt: (row.created_at as Date).toISOString(),
        merchants: merchants.rows.map((r) => r.merchant_id),
      });
      const found = selector
        ? await client.query<{ record: unknown }>(
            `SELECT record FROM earmark_paypal.attempts WHERE mandate_id=$1 AND ${"id" in selector ? "id" : "purchase_key"}=$2 FOR UPDATE`,
            [id, "id" in selector ? selector.id : selector.purchaseKey],
          )
        : undefined;
      if (selector && "id" in selector && selector.requireUnsentCreate) {
        const prior = await client.query<{ clean: boolean }>(
          `SELECT
          (SELECT count(*)=2 AND bool_and(i.state='RESERVED' AND i.fingerprint=a.record->>'fingerprint' AND
             ((i.operation='CREATE' AND i.request_id=a.create_request_id) OR (i.operation='CAPTURE' AND i.request_id=a.capture_request_id)))
           FROM earmark_paypal.idempotency i JOIN earmark_paypal.attempts a ON a.id=i.attempt_id WHERE i.attempt_id=$1)
          AND NOT EXISTS(SELECT 1 FROM earmark_paypal.audit WHERE attempt_id=$1 AND action<>'BUDGET_RESERVED') AS clean`,
          [selector.id],
        );
        if (prior.rows[0]?.clean !== true)
          throw new PaymentError("ONE_SHOT_ALREADY_ATTEMPTED_STOP");
      }
      if (selector && "id" in selector && selector.requireUnsentCapture) {
        const prior = await client.query<{ clean: boolean }>(
          `SELECT
          (SELECT count(*)=2 AND bool_and(i.state IN ('AWAITING_APPROVAL','APPROVED') AND i.fingerprint=a.record->>'fingerprint' AND
            ((i.operation='CREATE' AND i.request_id=a.create_request_id) OR (i.operation='CAPTURE' AND i.request_id=a.capture_request_id)))
           FROM earmark_paypal.idempotency i JOIN earmark_paypal.attempts a ON a.id=i.attempt_id WHERE i.attempt_id=$1)
          AND NOT EXISTS(SELECT 1 FROM earmark_paypal.audit WHERE attempt_id=$1 AND action IN ('CAPTURE_PREPARED','TASK03G_CAPTURE_AUTHORIZED')) AS clean`,
          [selector.id],
        );
        if (prior.rows[0]?.clean !== true)
          throw new PaymentError("CAPTURE_ALREADY_CLAIMED_STOP");
      }
      // Re-read time only after all row locks have been acquired; a lock wait may cross expiry.
      const clock = await client.query<{ database_now: Date }>(
        "SELECT clock_timestamp() AS database_now",
      );
      if (!clock.rows[0]) throw new PaymentError("PAYPAL_DATABASE_UNAVAILABLE");
      const tx: Mutation = {
        mandate: m,
        now: clock.rows[0].database_now.getTime(),
        audit: [],
        ...(found?.rows[0]
          ? { attempt: parse(attemptSchema, found.rows[0].record) }
          : {}),
      };
      const before = structuredClone(tx);
      const result = work(tx);
      if (result instanceof Promise)
        throw new PaymentError("ASYNC_DATABASE_MUTATION_FORBIDDEN");
      validateMutation(before, tx);
      await client.query(
        `UPDATE earmark_paypal.mandates SET reserved_minor=$2,consumed_minor=$3,status=$4 WHERE id=$1`,
        [id, m.reservedMinor, m.consumedMinor, m.status],
      );
      if (tx.attempt) {
        const a = tx.attempt;
        if (before.attempt) {
          const updated = await client.query(
            `UPDATE earmark_paypal.attempts SET state=$2,budget_state=$3,
            order_id=$4,capture_id=$5,record=$6,updated_at=clock_timestamp() WHERE id=$1 AND mandate_id=$7`,
            [
              a.id,
              a.state,
              a.budgetState,
              a.orderId ?? null,
              a.captureId ?? null,
              JSON.stringify(a),
              id,
            ],
          );
          if (!updated.rowCount)
            throw new PaymentError("PAYMENT_ATTEMPT_NOT_FOUND");
        } else
          await client.query(
            `INSERT INTO earmark_paypal.attempts
          (id,mandate_id,purchase_key,merchant_id,amount_minor,currency,state,budget_state,order_id,capture_id,create_request_id,capture_request_id,record)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
            [
              a.id,
              id,
              a.purchaseKey,
              a.merchantId,
              a.amountMinor,
              a.currency,
              a.state,
              a.budgetState,
              a.orderId ?? null,
              a.captureId ?? null,
              a.createRequestId,
              a.captureRequestId,
              JSON.stringify(a),
            ],
          );
        for (const operation of ["CREATE", "CAPTURE"] as const) {
          const requestId =
            operation === "CREATE" ? a.createRequestId : a.captureRequestId;
          const saved = await client.query(
            `INSERT INTO earmark_paypal.idempotency(request_id,attempt_id,operation,fingerprint,state)
            VALUES($1,$2,$3,$4,$5) ON CONFLICT(request_id) DO UPDATE SET state=EXCLUDED.state
            WHERE earmark_paypal.idempotency.attempt_id=EXCLUDED.attempt_id
            AND earmark_paypal.idempotency.operation=EXCLUDED.operation AND earmark_paypal.idempotency.fingerprint=EXCLUDED.fingerprint`,
            [requestId, a.id, operation, a.fingerprint, a.state],
          );
          if (!saved.rowCount) throw new PaymentError("IDEMPOTENCY_CONFLICT");
        }
      }
      for (const entry of tx.audit)
        await client.query(
          "INSERT INTO earmark_paypal.audit(mandate_id,attempt_id,action,detail) VALUES($1,$2,$3,$4)",
          [id, entry.attemptId ?? null, entry.action, entry.detail ?? null],
        );
      await client.query("COMMIT");
      return structuredClone(result);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      databaseError(error);
    } finally {
      client.release();
    }
  }
  private async find(
    column: "id" | "order_id" | "capture_id",
    value: string,
  ): Promise<Attempt | undefined> {
    try {
      const result = await this.pool.query<{ record: unknown }>(
        `SELECT record FROM earmark_paypal.attempts WHERE ${column}=$1`,
        [value],
      );
      return result.rows[0]
        ? parse(attemptSchema, result.rows[0].record)
        : undefined;
    } catch (error) {
      databaseError(error);
    }
  }
  findAttempt(id: string) {
    return this.find("id", id);
  }
  findOrder(id: string) {
    return this.find("order_id", id);
  }
  findCapture(id: string) {
    return this.find("capture_id", id);
  }
  async recoverable(limit: number) {
    const result = await this.pool.query<{ record: unknown }>(
      `SELECT record FROM earmark_paypal.attempts
      WHERE budget_state='RESERVED' AND state NOT IN ('RESERVED','REVIEW_REQUIRED') ORDER BY updated_at LIMIT $1`,
      [Math.min(100, Math.max(1, limit))],
    );
    return result.rows.map((r) => parse(attemptSchema, r.record));
  }
  async saveVerifiedEvent(event: VerifiedEvent) {
    const saved = await this.pool.query<{
      record: VerifiedEvent;
      state: VerifiedEvent["state"];
      attempts: number;
    }>(
      `INSERT INTO earmark_paypal.webhook_events(id,digest,record,state) VALUES($1,$2,$3,'PENDING')
      ON CONFLICT(id) DO UPDATE SET id=EXCLUDED.id WHERE earmark_paypal.webhook_events.digest=EXCLUDED.digest
      RETURNING record,state,attempts`,
      [event.id, event.digest, JSON.stringify(event)],
    );
    if (!saved.rows[0]) throw new PaymentError("WEBHOOK_ID_COLLISION");
    return {
      ...saved.rows[0].record,
      state: saved.rows[0].state,
      attempts: saved.rows[0].attempts,
    };
  }
  async finishEvent(
    id: string,
    state: "PROCESSED" | "IGNORED" | "RETRY",
    code?: string,
  ) {
    await this.pool.query(
      `UPDATE earmark_paypal.webhook_events SET state=$2,error_code=$3,attempts=attempts+1,
      next_retry_at=clock_timestamp() + LEAST(3600, power(2,LEAST(attempts+1,12))) * interval '1 second'
      WHERE id=$1 AND state NOT IN ('PROCESSED','IGNORED')`,
      [id, state, code ?? null],
    );
  }
  async pendingEvents(limit: number) {
    const events = await this.pool.query<{
      record: VerifiedEvent;
      state: VerifiedEvent["state"];
      attempts: number;
      next_retry_at: Date;
    }>(
      `SELECT record,state,attempts,next_retry_at FROM earmark_paypal.webhook_events
      WHERE state IN ('PENDING','RETRY') AND next_retry_at<=clock_timestamp() ORDER BY next_retry_at LIMIT $1`,
      [Math.min(100, Math.max(1, limit))],
    );
    return events.rows.map((r) => ({
      ...r.record,
      state: r.state,
      attempts: r.attempts,
      nextRetryAt: r.next_retry_at.toISOString(),
    }));
  }
}
