import { vi } from "vitest";
import type {
  Attempt,
  Mandate,
  Principal,
} from "../../src/server/paypal/domain";
import { PaymentError } from "../../src/server/paypal/domain";
import {
  type AuditEntry,
  type Mutation,
  type PaymentRepository,
  type Selector,
  type VerifiedEvent,
  validateMutation,
} from "../../src/server/paypal/repository";
import {
  type PayPalGateway,
  PayPalPaymentService,
} from "../../src/server/paypal/service";
import type {
  PayPalOrder,
  PayPalCapture,
} from "../../src/server/paypal/client";

/** Unit-test mock only. Its mutex models the repository contract, not PostgreSQL itself. */
export class MemoryPaymentRepository implements PaymentRepository {
  mandates = new Map<string, Mandate>();
  attempts = new Map<string, Attempt>();
  events = new Map<string, VerifiedEvent>();
  audit: AuditEntry[] = [];
  now = Date.parse("2026-10-25T12:00:00Z");
  private tails = new Map<string, Promise<void>>();
  async insertMandate(m: Mandate) {
    this.mandates.set(m.id, structuredClone(m));
  }
  async mutate<T>(
    id: string,
    selector: Selector | undefined,
    work: (tx: Mutation) => T,
  ): Promise<T> {
    const prior = this.tails.get(id) ?? Promise.resolve();
    let release = () => {};
    const tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.tails.set(id, tail);
    await prior;
    try {
      const m = this.mandates.get(id);
      if (!m) throw new PaymentError("MANDATE_NOT_FOUND");
      const a = [...this.attempts.values()].find(
        (a) =>
          a.mandateId === id &&
          selector &&
          ("id" in selector
            ? a.id === selector.id
            : a.purchaseKey === selector.purchaseKey),
      );
      if (
        selector &&
        "id" in selector &&
        selector.requireUnsentCreate &&
        this.audit.some(
          (e) => e.attemptId === selector.id && e.action !== "BUDGET_RESERVED",
        )
      )
        throw new PaymentError("ONE_SHOT_ALREADY_ATTEMPTED_STOP");
      if (
        selector &&
        "id" in selector &&
        selector.requireUnsentCapture &&
        this.audit.some(
          (e) =>
            e.attemptId === selector.id &&
            ["CAPTURE_PREPARED", "TASK03G_CAPTURE_AUTHORIZED"].includes(
              e.action,
            ),
        )
      )
        throw new PaymentError("CAPTURE_ALREADY_CLAIMED_STOP");
      const tx: Mutation = {
        mandate: structuredClone(m),
        now: this.now,
        audit: [],
        ...(a ? { attempt: structuredClone(a) } : {}),
      };
      const before = structuredClone(tx);
      const value = work(tx);
      if (value instanceof Promise)
        throw new PaymentError("ASYNC_DATABASE_MUTATION_FORBIDDEN");
      validateMutation(before, tx);
      if (tx.attempt) {
        for (const other of this.attempts.values())
          if (
            other.id !== tx.attempt.id &&
            ((other.orderId && other.orderId === tx.attempt.orderId) ||
              (other.captureId && other.captureId === tx.attempt.captureId))
          )
            throw new PaymentError("PAYPAL_REFERENCE_COLLISION");
        this.attempts.set(tx.attempt.id, structuredClone(tx.attempt));
      }
      this.mandates.set(id, structuredClone(tx.mandate));
      this.audit.push(...structuredClone(tx.audit));
      return structuredClone(value);
    } finally {
      release();
    }
  }
  async findAttempt(id: string) {
    const a = this.attempts.get(id);
    return a ? structuredClone(a) : undefined;
  }
  async findOrder(id: string) {
    const a = [...this.attempts.values()].find((a) => a.orderId === id);
    return a ? structuredClone(a) : undefined;
  }
  async findCapture(id: string) {
    const a = [...this.attempts.values()].find((a) => a.captureId === id);
    return a ? structuredClone(a) : undefined;
  }
  async recoverable(limit: number) {
    return [...this.attempts.values()]
      .filter(
        (a) =>
          a.budgetState === "RESERVED" &&
          !["RESERVED", "REVIEW_REQUIRED"].includes(a.state),
      )
      .slice(0, limit)
      .map((a) => structuredClone(a));
  }
  async saveVerifiedEvent(event: VerifiedEvent) {
    const old = this.events.get(event.id);
    if (old && old.digest !== event.digest)
      throw new PaymentError("WEBHOOK_ID_COLLISION");
    if (!old) this.events.set(event.id, structuredClone(event));
    return structuredClone(old ?? event);
  }
  async finishEvent(
    id: string,
    state: "PROCESSED" | "IGNORED" | "RETRY",
    code?: string,
  ) {
    const event = this.events.get(id);
    if (event && !["PROCESSED", "IGNORED"].includes(event.state)) {
      event.state = state;
      event.attempts++;
      event.nextRetryAt = new Date(this.now + 2000).toISOString();
      if (code) event.errorCode = code;
    }
  }
  async pendingEvents(limit: number) {
    return [...this.events.values()]
      .filter(
        (e) =>
          ["PENDING", "RETRY"].includes(e.state) &&
          Date.parse(e.nextRetryAt) <= this.now,
      )
      .slice(0, limit)
      .map((e) => structuredClone(e));
  }
}
export const owner: Principal = {
  ownerId: "owner-1",
  subjectId: "owner-1",
  role: "owner",
};
export const agent: Principal = {
  ownerId: "owner-1",
  subjectId: "agent-1",
  role: "agent",
};
export const merchant = "ABCDEFGHJKLMN";
export const mandateInput = {
  agentId: "agent-1",
  currency: "USD",
  capMinor: "1000",
  perTransactionMinor: "1000",
  expiresAt: "2026-10-26T12:00:00Z",
  merchants: [merchant],
};
export function orderFor(
  a: Attempt,
  status: PayPalOrder["status"] = "CREATED",
  captureStatus?: "COMPLETED" | "PENDING" | "DECLINED",
): PayPalOrder {
  return {
    id: "ORDER123",
    intent: "CAPTURE",
    status,
    purchase_units: [
      {
        reference_id: a.id,
        custom_id: a.id,
        payee: { merchant_id: a.merchantId },
        amount: {
          currency_code: a.currency,
          value:
            a.currency === "JPY"
              ? a.amountMinor
              : `${BigInt(a.amountMinor) / 100n}.${(BigInt(a.amountMinor) % 100n).toString().padStart(2, "0")}`,
        },
        ...(captureStatus
          ? {
              payments: {
                captures: [
                  {
                    id: "CAPTURE123",
                    status: captureStatus,
                    final_capture: true,
                    amount: { currency_code: a.currency, value: "6.00" },
                  },
                ],
              },
            }
          : {}),
      },
    ],
    links: [
      {
        rel: "approve",
        href: "https://www.sandbox.paypal.com/checkoutnow?token=ORDER123",
      },
    ],
  };
}
export async function fixture(overrides: Record<string, unknown> = {}) {
  const repository = new MemoryPaymentRepository();
  let current: PayPalOrder | undefined;
  const gateway = {
    createOrder: vi.fn(async (a: Attempt) => {
      current = orderFor(a);
      return structuredClone(current);
    }),
    getOrder: vi.fn(async () => {
      if (!current) throw new Error("NO_TEST_ORDER");
      return structuredClone(current);
    }),
    captureOrder: vi.fn(async (a: Attempt) => {
      current = orderFor(a, "COMPLETED", "COMPLETED");
      return structuredClone(current);
    }),
    getCapture: vi.fn(async (): Promise<PayPalCapture> => ({
      id: "CAPTURE123",
      status: "COMPLETED",
      amount: { currency_code: "USD", value: "6.00" },
      final_capture: true,
      supplementary_data: { related_ids: { order_id: "ORDER123" } },
    })),
    verifyWebhook: vi.fn(async () => {}),
  } satisfies PayPalGateway;
  const service = new PayPalPaymentService(
    repository,
    gateway,
    () => repository.now,
  );
  const mandate = await service.createMandate(owner, {
    ...mandateInput,
    ...overrides,
  });
  const input = {
    mandateId: mandate.id,
    purchaseKey: "purchase-1",
    merchantId: merchant,
    amountMinor: "600",
    currency: "USD",
  };
  return {
    repository,
    gateway,
    service,
    mandate,
    input,
    setOrder: (o: PayPalOrder) => {
      current = structuredClone(o);
    },
    approve: (a: Attempt) => {
      current = orderFor(a, "APPROVED");
    },
  };
}
