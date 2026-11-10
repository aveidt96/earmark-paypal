import "server-only";
import type { Pool, PoolClient } from "@flint/agent/server";
import type { AgentCheckoutConfig } from "./agent-checkout-config";
import {
  agentCheckoutMandateId,
  agentCampaignId,
  agentCheckoutCatalog,
  AGENT_OFFER_ID,
  agentIntentSchema,
  intentIdentity,
  checkAgentMandate,
  validatePendingAgentIntent,
  type AgentCheckoutRepository,
  type AgentPreparationSnapshot,
} from "./agent-checkout";
import type { AgentCheckoutIntent } from "../../lib/agent-checkout";
import {
  mandateSchema,
  parse,
  PaymentError,
  type Mandate,
  type Principal,
} from "./domain";
import { createMandate, requireOwner } from "./policy";
import { PostgresPaymentRepository } from "./postgres";

/** Durable preparation metadata uses the existing append-only audit table, never a financial attempt. */
export class PostgresAgentCheckoutRepository implements AgentCheckoutRepository {
  private readonly mandateId: string;
  private readonly prefix: "AGENT05A" | "AGENT05C" | "AGENT05D";
  private readonly namespace: string;
  constructor(
    readonly pool: Pool,
    readonly config: AgentCheckoutConfig,
  ) {
    this.mandateId = agentCheckoutMandateId(config);
    this.prefix =
      config.campaign === "agent-05d-v1"
        ? "AGENT05D"
        : config.campaign === "agent-05c-v1"
          ? "AGENT05C"
          : "AGENT05A";
    this.namespace = config.campaign.replace("agent-", "agent");
  }
  private owner(actor: Principal) {
    requireOwner(actor, this.config.ownerId);
  }
  private async load(db: Pool | PoolClient): Promise<Mandate | null> {
    const result = await db.query<Record<string, unknown>>(
      `SELECT m.*,ARRAY(SELECT merchant_id FROM earmark_paypal.approved_merchants WHERE mandate_id=m.id ORDER BY merchant_id) AS merchants
      FROM earmark_paypal.mandates m WHERE m.id=$1 AND m.owner_id=$2`,
      [this.mandateId, this.config.ownerId],
    );
    const row = result.rows[0];
    if (!row) return null;
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
  private async events(db: Pool | PoolClient) {
    return (
      await db.query<{ action: string; detail: string | null }>(
        "SELECT action,detail FROM earmark_paypal.audit WHERE mandate_id=$1 AND action IN ($2,$3,$4) ORDER BY id",
        [
          this.mandateId,
          `${this.prefix}_EVALUATION_STARTED`,
          `${this.prefix}_EVALUATION_FAILED`,
          `${this.prefix}_CHECKOUT_PENDING`,
        ],
      )
    ).rows;
  }
  private async snapshot(
    db: Pool | PoolClient,
  ): Promise<AgentPreparationSnapshot> {
    const m = await this.load(db);
    if (!m)
      return { mandate: null, intent: null, evaluationState: "NOT_STARTED" };
    const events = await this.events(db),
      prepared = events.find(
        (e) => e.action === `${this.prefix}_CHECKOUT_PENDING`,
      );
    if (prepared?.detail) {
      const parsed = agentIntentSchema.safeParse(JSON.parse(prepared.detail));
      if (!parsed.success)
        throw new PaymentError("INVALID_STORED_AGENT_INTENT");
      const offer = agentCheckoutCatalog(this.config.merchantId).find(
        (o) => o.offerId === AGENT_OFFER_ID,
      );
      if (!offer) throw new PaymentError("AGENT_CATALOG_UNAVAILABLE");
      const identity = intentIdentity(m, offer),
        intent = parsed.data;
      if (
        intent.id !== identity.id ||
        intent.idempotencyKey !== identity.idempotencyKey ||
        intent.mandateId !== m.id ||
        intent.offerId !== offer.offerId ||
        intent.merchantId !== offer.merchantId ||
        intent.deliveryCommitment !== offer.deliveryCommitment ||
        intent.expiresAt !== m.expiresAt
      )
        throw new PaymentError("STORED_AGENT_INTENT_BINDING_MISMATCH");
      return { mandate: m, intent, evaluationState: "PREPARED" };
    }
    const failed = events.find(
      (e) => e.action === `${this.prefix}_EVALUATION_FAILED`,
    );
    return {
      mandate: m,
      intent: null,
      evaluationState: failed
        ? "FAILED"
        : events.length
          ? "RUNNING_OR_INTERRUPTED"
          : "NOT_STARTED",
      ...(failed?.detail
        ? {
            errorCode: /^[A-Z0-9_]+$/.test(failed.detail)
              ? failed.detail
              : "AGENT_EVALUATION_FAILED",
          }
        : {}),
    };
  }
  async read() {
    const db = await this.pool.connect();
    try {
      await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      return await this.snapshot(db);
    } finally {
      await db.query("ROLLBACK").catch(() => {});
      db.release();
    }
  }
  async initialize(actor: Principal) {
    this.owner(actor);
    if (this.config.campaign !== "agent-05a") {
      const db = await this.pool.connect();
      try {
        await db.query("BEGIN");
        await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
          `${this.namespace}:create:${this.mandateId}`,
        ]);
        let m = await this.load(db);
        if (!m) {
          const now = (
            await db.query<{ now: Date }>("SELECT clock_timestamp() AS now")
          ).rows[0]?.now;
          if (!now) throw new PaymentError("DATABASE_CLOCK_REQUIRED");
          const createdAt = new Date(now.getTime()).toISOString();
          m = createMandate(
            actor,
            {
              agentId: this.config.agentId,
              currency: "USD",
              capMinor: "1000",
              perTransactionMinor: "600",
              merchants: [this.config.merchantId],
              expiresAt: new Date(now.getTime() + 86400000).toISOString(),
            },
            now.getTime(),
          );
          m.id = this.mandateId;
          m.createdAt = createdAt;
          await db.query(
            `INSERT INTO earmark_paypal.mandates (id,owner_id,agent_id,currency,cap_minor,per_transaction_minor,reserved_minor,consumed_minor,status,expires_at,created_at) VALUES($1,$2,$3,$4,$5,$6,0,0,$7,$8,$9)`,
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
          await db.query(
            "INSERT INTO earmark_paypal.approved_merchants(mandate_id,merchant_id) VALUES($1,$2)",
            [m.id, this.config.merchantId],
          );
          await db.query(
            "INSERT INTO earmark_paypal.audit(mandate_id,action,detail) VALUES($1,'MANDATE_CREATED',$2)",
            [
              m.id,
              JSON.stringify({
                campaignId: agentCampaignId(this.config),
                version: this.config.campaign,
                catalog: "synthetic-agent-05a-v1",
                creationKey: `${this.namespace}:create:${this.mandateId}`,
              }),
            ],
          );
        }
        const entries = await db.query<{ detail: string | null }>(
          "SELECT detail FROM earmark_paypal.audit WHERE mandate_id=$1 AND action='MANDATE_CREATED' ORDER BY id",
          [m.id],
        );
        const expected = JSON.stringify({
          campaignId: agentCampaignId(this.config),
          version: this.config.campaign,
          catalog: "synthetic-agent-05a-v1",
          creationKey: `${this.namespace}:create:${this.mandateId}`,
        });
        if (
          entries.rows.length !== 1 ||
          entries.rows[0]?.detail !== expected ||
          Date.parse(m.expiresAt) - Date.parse(m.createdAt) !== 86400000
        )
          throw new PaymentError("AGENT_CAMPAIGN_CREATION_BINDING_MISMATCH");
        checkAgentMandate(this.config, m, Date.now());
        await db.query("COMMIT");
      } catch (error) {
        await db.query("ROLLBACK").catch(() => {});
        throw error;
      } finally {
        db.release();
      }
      return this.read();
    }
    let m = await this.load(this.pool);
    if (!m) {
      const candidate = createMandate(
        actor,
        {
          agentId: this.config.agentId,
          currency: "USD",
          capMinor: "1000",
          perTransactionMinor: "600",
          merchants: [this.config.merchantId],
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
        },
        Date.now(),
      );
      candidate.id = this.mandateId;
      try {
        await new PostgresPaymentRepository(this.pool).insertMandate(candidate);
      } catch (error) {
        if (!(await this.load(this.pool))) throw error;
      }
      m = await this.load(this.pool);
    }
    if (!m) throw new PaymentError("AGENT_MANDATE_REQUIRED");
    checkAgentMandate(this.config, m, Date.now());
    return this.read();
  }
  async evaluateOnce(
    actor: Principal,
    produce: (m: Mandate) => Promise<AgentCheckoutIntent>,
  ): Promise<AgentCheckoutIntent> {
    this.owner(actor);
    const db = await this.pool.connect();
    let locked = false,
      started = false;
    try {
      const claim = await db.query<{ locked: boolean }>(
        "SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS locked",
        [`${this.namespace}:${this.mandateId}`],
      );
      if (claim.rows[0]?.locked !== true)
        throw new PaymentError("AGENT_EVALUATION_IN_PROGRESS");
      locked = true;
      const saved = await this.snapshot(db),
        m = saved.mandate;
      if (!m) throw new PaymentError("AGENT_MANDATE_REQUIRED");
      checkAgentMandate(this.config, m, Date.now());
      if (saved.intent)
        return validatePendingAgentIntent(
          this.config,
          m,
          saved.intent,
          Date.now(),
        );
      if (saved.evaluationState !== "NOT_STARTED")
        throw new PaymentError(
          saved.errorCode ?? "AGENT_EVALUATION_INTERRUPTED_REVIEW_REQUIRED",
        );
      await db.query(
        "INSERT INTO earmark_paypal.audit(mandate_id,action,detail) VALUES($1,$2,'OWNER_AUTHENTICATED_NO_RESERVATION')",
        [m.id, `${this.prefix}_EVALUATION_STARTED`],
      );
      started = true;
      const candidate = await produce(structuredClone(m));
      await db.query("BEGIN");
      await db.query(
        "SELECT id FROM earmark_paypal.mandates WHERE id=$1 FOR UPDATE",
        [m.id],
      );
      const fresh = await this.load(db),
        clock = (
          await db.query<{ now: Date }>("SELECT clock_timestamp() AS now")
        ).rows[0]?.now;
      if (!fresh || !clock) throw new PaymentError("AGENT_MANDATE_REQUIRED");
      this.owner(actor);
      const intent = validatePendingAgentIntent(
        this.config,
        fresh,
        candidate,
        clock.getTime(),
      );
      await db.query(
        "INSERT INTO earmark_paypal.audit(mandate_id,action,detail) VALUES($1,$2,$3)",
        [m.id, `${this.prefix}_CHECKOUT_PENDING`, JSON.stringify(intent)],
      );
      await db.query("COMMIT");
      return intent;
    } catch (error) {
      await db.query("ROLLBACK").catch(() => {});
      if (started) {
        const code =
          error instanceof Error && /^[A-Z0-9_]+$/.test(error.message)
            ? error.message
            : "AGENT_EVALUATION_FAILED";
        await db
          .query(
            "INSERT INTO earmark_paypal.audit(mandate_id,action,detail) SELECT $1,$2,$3 WHERE NOT EXISTS(SELECT 1 FROM earmark_paypal.audit WHERE mandate_id=$1 AND action=$4)",
            [
              this.mandateId,
              `${this.prefix}_EVALUATION_FAILED`,
              code,
              `${this.prefix}_CHECKOUT_PENDING`,
            ],
          )
          .catch(() => {});
      }
      throw error;
    } finally {
      if (locked)
        await db
          .query("SELECT pg_advisory_unlock(hashtextextended($1,0))", [
            `${this.namespace}:${this.mandateId}`,
          ])
          .catch(() => {});
      db.release();
    }
  }
}
