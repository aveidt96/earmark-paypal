import "server-only";
import { createHash } from "node:crypto";
import {
  type Attempt,
  type Mandate,
  type Principal,
  PaymentError,
} from "./domain";
import { createMandate, requireOwner } from "./policy";
import type { PaymentRepository } from "./repository";
import { PayPalPaymentService, type PayPalGateway } from "./service";
import type { TestCheckoutConfig } from "./test-config";
import { type PayPalClient, type PayPalOrder, PayPalError } from "./client";

export interface TestCheckoutRepository extends PaymentRepository {
  recordOriginalHold?(actor: Principal): Promise<void>;
  readCheckout(
    id: string,
    key: string,
  ): Promise<{ mandate: Mandate | undefined; attempt: Attempt | undefined }>;
  readMandate(id: string): Promise<Mandate | undefined>;
  findPurchase(mandateId: string, key: string): Promise<Attempt | undefined>;
}
const purchaseKey = "paypal-test-6usd-v1";
export function testMandateId(ownerId: string, merchantScope?: string) {
  const bytes = createHash("sha1")
    .update(Buffer.from("c90750d9f85341c29eb117b678140161", "hex"))
    .update(
      merchantScope
        ? `earmark-paypal-test-us-v1:${ownerId}:${merchantScope}`
        : `earmark-paypal-test-v1:${ownerId}`,
    )
    .digest()
    .subarray(0, 16);
  bytes[6] = ((bytes[6] ?? 0) & 15) | 80;
  bytes[8] = ((bytes[8] ?? 0) & 63) | 128;
  const h = bytes.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
/** Canonical capture GET must validate before the policy service consumes a reservation. */
export function testCheckoutGateway(client: PayPalClient): PayPalGateway {
  const canonical = async (order: PayPalOrder) => {
    const cap = order.purchase_units[0]?.payments?.captures?.[0];
    if (cap) {
      const actual = await client.getCapture(cap.id);
      if (
        actual.id !== cap.id ||
        (actual.supplementary_data?.related_ids.order_id &&
          actual.supplementary_data.related_ids.order_id !== order.id)
      )
        throw new PaymentError("PAYPAL_CAPTURE_BINDING_MISMATCH");
      const unit = order.purchase_units[0];
      if (!unit) throw new PaymentError("PAYPAL_CAPTURE_BINDING_MISMATCH");
      unit.payments = { captures: [actual] };
    }
    return order;
  };
  return {
    createOrder: (a) => client.createOrder(a),
    getOrder: async (id) => canonical(await client.getOrder(id)),
    captureOrder: async (a) => {
      const order = await client.captureOrder(a);
      try {
        return await canonical(order);
      } catch {
        throw new PayPalError("PAYPAL_CAPTURE_RECONCILIATION_REQUIRED", true);
      }
    },
    getCapture: (id) => client.getCapture(id),
    verifyWebhook: (headers, event) => client.verifyWebhook(headers, event),
  };
}
export class TestCheckoutService {
  readonly payments: PayPalPaymentService;
  constructor(
    readonly config: TestCheckoutConfig,
    readonly repository: TestCheckoutRepository,
    gateway: PayPalGateway,
    private readonly now = Date.now,
    private readonly orderOnce?: (
      actor: Principal,
      a: Attempt,
    ) => Promise<Attempt>,
    private readonly captureOnce?: (
      actor: Principal,
      a: Attempt,
    ) => Promise<Attempt>,
  ) {
    this.payments = new PayPalPaymentService(
      repository,
      gateway,
      now,
      config.merchantId,
    );
  }
  private mandateId(ownerId: string) {
    return testMandateId(
      ownerId,
      this.config.campaign === "us-v1" ? this.config.merchantId : undefined,
    );
  }
  private get purchaseKey() {
    return this.config.campaign === "us-v1"
      ? "paypal-test-us-6usd-v1"
      : purchaseKey;
  }
  private owner(actor: Principal) {
    requireOwner(actor, this.config.ownerId);
  }
  private terms(m: Mandate) {
    if (
      m.id !== this.mandateId(this.config.ownerId) ||
      m.ownerId !== this.config.ownerId ||
      m.agentId !== this.config.agentId ||
      m.capMinor !== "1000" ||
      m.perTransactionMinor !== "600" ||
      m.currency !== "USD" ||
      m.merchants.length !== 1 ||
      m.merchants[0] !== this.config.merchantId
    )
      throw new PaymentError("TEST_MANDATE_POLICY_MISMATCH");
  }
  async mandate(actor: Principal) {
    this.owner(actor);
    const id = this.mandateId(actor.ownerId);
    let existing = await this.repository.readMandate(id);
    if (!existing) {
      const candidate = createMandate(
        actor,
        {
          agentId: this.config.agentId,
          currency: "USD",
          capMinor: "1000",
          perTransactionMinor: "600",
          merchants: [this.config.merchantId],
          expiresAt: new Date(this.now() + 86400000).toISOString(),
        },
        this.now(),
      );
      candidate.id = id; // Trusted server campaign identity, never a frontend-supplied ID.
      try {
        await this.repository.insertMandate(candidate);
      } catch (error) {
        // A concurrent request/uncertain commit may already have inserted this exact identity.
        existing = await this.repository.readMandate(id);
        if (!existing) throw error;
      }
      existing ??= await this.repository.readMandate(id);
    }
    if (!existing) throw new PaymentError("PAYPAL_DATABASE_UNAVAILABLE");
    this.terms(existing);
    return this.snapshot(actor);
  }
  private async context(actor: Principal) {
    this.owner(actor);
    const m = await this.repository.readMandate(this.mandateId(actor.ownerId));
    if (!m) throw new PaymentError("TEST_MANDATE_REQUIRED");
    this.terms(m);
    return {
      m,
      input: {
        mandateId: m.id,
        purchaseKey: this.purchaseKey,
        merchantId: this.config.merchantId,
        amountMinor: "600",
        currency: "USD",
      },
    };
  }
  async snapshot(actor: Principal) {
    this.owner(actor);
    const { mandate: m, attempt: a } = await this.repository.readCheckout(
      this.mandateId(actor.ownerId),
      this.purchaseKey,
    );
    if (m) this.terms(m);
    if (
      a &&
      (a.ownerId !== actor.ownerId ||
        a.amountMinor !== "600" ||
        a.currency !== "USD" ||
        a.merchantId !== this.config.merchantId)
    )
      throw new PaymentError("TEST_ATTEMPT_BINDING_MISMATCH");
    const available =
      BigInt(m?.capMinor ?? "1000") -
      BigInt(m?.reservedMinor ?? "0") -
      BigInt(m?.consumedMinor ?? "0");
    return {
      authenticated: true,
      campaign: this.config.campaign,
      preparationOnly: this.config.preparationOnly,
      orderOnlyAuthorization: this.config.usOrderOnce,
      captureOnlyAuthorization: this.config.usCaptureOnce,
      ownerLabel: "Verified local Sandbox test owner",
      environment: "sandbox",
      merchantId: this.config.merchantId,
      authorizedMinor: "1000",
      requestedMinor: "600",
      currency: "USD",
      availableMinor: available.toString(),
      reservedMinor: m?.reservedMinor ?? "0",
      capturedMinor: m?.consumedMinor ?? "0",
      unspentMinor: (1000n - BigInt(m?.consumedMinor ?? "0")).toString(),
      mandate: m
        ? {
            id: m.id,
            status: m.status,
            expiresAt: m.expiresAt,
            expired: Date.parse(m.expiresAt) <= this.now(),
          }
        : null,
      attempt: a
        ? {
            id: a.id,
            state: a.state,
            budgetState: a.budgetState,
            orderId: a.orderId ?? null,
            captureId: a.captureId ?? null,
            approvalUrl:
              a.state === "AWAITING_APPROVAL" &&
              m?.status === "ACTIVE" &&
              Date.parse(m.expiresAt) > this.now()
                ? (a.approvalUrl ?? null)
                : null,
            lastRemoteState: a.lastRemoteState ?? null,
            errorCode: a.errorCode ?? null,
          }
        : null,
      authorizationDecision: !m
        ? "MANDATE_NOT_CREATED"
        : m.status !== "ACTIVE" || Date.parse(m.expiresAt) <= this.now()
          ? "NEW_SPENDING_BLOCKED"
          : a?.budgetState === "CONSUMED"
            ? "CAPTURE_CONFIRMED"
            : a?.budgetState === "RESERVED"
              ? "AUTHORIZED_BUDGET_RESERVED"
              : "OWNER_AUTHORIZED_FIXED_TEST",
      paymentConfirmed:
        a?.state === "SUCCEEDED" && a.budgetState === "CONSUMED",
      webhookConfigured: false,
      executionEnabled: this.config.settings.paymentsEnabled,
    };
  }
  async action(actor: Principal, action: string, orderHint?: string) {
    this.owner(actor);
    if (action === "capture-once") {
      if (!this.config.usCaptureOnce || !this.captureOnce)
        throw new PaymentError("US_ONE_SHOT_CAPTURE_NOT_AUTHORIZED");
      const { m } = await this.context(actor);
      const a = await this.repository.findPurchase(m.id, this.purchaseKey);
      if (!a) throw new PaymentError("EXISTING_US_RESERVATION_REQUIRED");
      await this.captureOnce(actor, a);
      return this.snapshot(actor);
    }
    if (this.config.usCaptureOnce)
      throw new PaymentError("US_CAPTURE_ONLY_NO_OTHER_MUTATIONS");
    if (action === "order-once") {
      if (!this.config.usOrderOnce || !this.orderOnce)
        throw new PaymentError("US_ONE_SHOT_ORDER_NOT_AUTHORIZED");
      const { m } = await this.context(actor);
      const a = await this.repository.findPurchase(m.id, this.purchaseKey);
      if (!a) throw new PaymentError("EXISTING_US_RESERVATION_REQUIRED");
      await this.orderOnce(actor, a);
      return this.snapshot(actor);
    }
    if (this.config.usOrderOnce)
      throw new PaymentError("US_ORDER_ONLY_NO_OTHER_MUTATIONS");
    if (
      this.config.preparationOnly &&
      !["reserve", "hold-original"].includes(action)
    )
      throw new PaymentError("PREPARATION_ONLY_NO_PAYMENT_ACTIONS");
    if (action === "hold-original") {
      if (!this.config.preparationOnly || !this.repository.recordOriginalHold)
        throw new PaymentError("ORIGINAL_HOLD_UNAVAILABLE");
      await this.repository.recordOriginalHold(actor);
      return this.snapshot(actor);
    }
    if (
      ["order", "capture"].includes(action) &&
      !this.config.settings.paymentsEnabled
    )
      throw new PaymentError("PAYPAL_PAYMENTS_DISABLED");
    const { m, input } = await this.context(actor);
    if (action === "reserve") await this.payments.reserve(actor, input);
    else if (action === "order") await this.payments.createOrder(actor, input);
    else {
      const a = await this.repository.findPurchase(m.id, this.purchaseKey);
      if (!a) throw new PaymentError("TEST_RESERVATION_REQUIRED");
      if (action === "capture") await this.payments.capture(actor, a.id);
      else if (action === "approval" || action === "recover") {
        if (orderHint)
          await this.payments.reconcileWithOrderId(actor, a.id, orderHint);
        else await this.payments.reconcile(a.id);
      } else if (action === "cancel") {
        if (a.state === "RESERVED")
          await this.payments.cancelReservation(actor, a.id);
        else if (a.budgetState === "RESERVED") {
          await this.payments.revokeMandate(actor, m.id);
          if (a.orderId) await this.payments.reconcile(a.id);
        }
      } else throw new PaymentError("UNKNOWN_TEST_CHECKOUT_ACTION");
    }
    return this.snapshot(actor);
  }
}
export type TestCheckoutSnapshot = Awaited<
  ReturnType<TestCheckoutService["snapshot"]>
>;
