import "server-only";
import {
  type Attempt,
  type Principal,
  externalIdSchema,
  fingerprint,
  fromDecimal,
  newAttempt,
  parse,
  paymentInputSchema,
  PaymentError,
} from "./domain";
import { type PayPalClient, type PayPalOrder, PayPalError } from "./client";
import type { OrderOnlyPermission, CaptureOnlyPermission } from "./config";
import { assertOrderScope } from "./us-order";
import { assertCaptureScope } from "./us-capture";
import {
  authorize,
  createMandate,
  requireIdentity,
  requireOwner,
} from "./policy";
import {
  type Mutation,
  type PaymentRepository,
  resolveBudget,
} from "./repository";

export type PayPalGateway = Pick<
  PayPalClient,
  "createOrder" | "getOrder" | "captureOrder" | "getCapture" | "verifyWebhook"
>;
function attempt(tx: Mutation): Attempt {
  if (!tx.attempt) throw new PaymentError("PAYMENT_ATTEMPT_NOT_FOUND");
  return tx.attempt;
}
function timestamp(tx: Mutation) {
  attempt(tx).updatedAt = new Date(tx.now).toISOString();
}

/** No methods here are registered as agent tools or unauthenticated financial routes. */
export class PayPalPaymentService {
  constructor(
    readonly repository: PaymentRepository,
    readonly gateway: PayPalGateway,
    private readonly now = Date.now,
    private readonly boundMerchantId?: string,
  ) {}
  private merchant(merchantId: string) {
    if (this.boundMerchantId && merchantId !== this.boundMerchantId)
      throw new PaymentError("PAYPAL_CREDENTIAL_MERCHANT_MISMATCH");
  }
  async createMandate(actor: Principal, raw: unknown) {
    const m = createMandate(actor, raw, this.now());
    for (const merchant of m.merchants) this.merchant(merchant);
    await this.repository.insertMandate(m);
    return m;
  }
  async revokeMandate(actor: Principal, mandateId: string) {
    return this.repository.mutate(mandateId, undefined, (tx) => {
      requireOwner(actor, tx.mandate.ownerId);
      for (const merchant of tx.mandate.merchants) this.merchant(merchant);
      if (tx.mandate.status === "ACTIVE") {
        tx.mandate.status = "REVOKED";
        tx.audit.push({ action: "MANDATE_REVOKED" });
      }
      // In-flight operations are not recalled. Keep reservations until trusted reconciliation.
      return tx.mandate;
    });
  }
  async reserve(actor: Principal, raw: unknown) {
    const input = parse(paymentInputSchema, raw);
    this.merchant(input.merchantId);
    return this.repository.mutate(
      input.mandateId,
      { purchaseKey: input.purchaseKey },
      (tx) => {
        requireIdentity(actor, tx.mandate);
        if (tx.attempt) {
          if (tx.attempt.fingerprint !== fingerprint(input))
            throw new PaymentError("IDEMPOTENCY_CONFLICT");
          return tx.attempt; // Replay reads do not resurrect expired/revoked/terminal authority.
        }
        authorize(actor, tx.mandate, input, tx.now);
        tx.attempt = newAttempt(input, tx.mandate, tx.now);
        tx.mandate.reservedMinor = (
          BigInt(tx.mandate.reservedMinor) + BigInt(input.amountMinor)
        ).toString();
        tx.audit.push({ action: "BUDGET_RESERVED", attemptId: tx.attempt.id });
        return tx.attempt;
      },
    );
  }
  private async owned(actor: Principal, id: string) {
    const a = await this.repository.findAttempt(id);
    if (!a) throw new PaymentError("PAYMENT_ATTEMPT_NOT_FOUND");
    requireOwner(actor, a.ownerId);
    this.merchant(a.merchantId);
    return a;
  }
  async createOrder(actor: Principal, raw: unknown): Promise<Attempt> {
    requireOwner(actor, actor.ownerId);
    const saved = await this.reserve(actor, raw);
    const claim = await this.repository.mutate(
      saved.mandateId,
      { id: saved.id },
      (tx) => {
        requireOwner(actor, tx.mandate.ownerId);
        const a = attempt(tx);
        if (a.state !== "RESERVED") return undefined;
        authorize(actor, tx.mandate, a, tx.now, a);
        a.state = "CREATING";
        timestamp(tx);
        tx.audit.push({ action: "CREATE_PREPARED", attemptId: a.id });
        return a;
      },
    );
    if (!claim) return (await this.repository.findAttempt(saved.id)) ?? saved;
    let order: PayPalOrder;
    try {
      order = await this.gateway.createOrder(claim);
    } catch (error) {
      return this.failedRequest(claim, "CREATE", error);
    }
    return this.observe(claim, order);
  }
  /** Existing reservation only. Durable pre-dispatch claim is never reset/retried. */
  async createPreparedOrderOnce(
    actor: Principal,
    scope: OrderOnlyPermission,
  ): Promise<Attempt> {
    requireOwner(actor, scope.ownerId);
    this.merchant(scope.merchantId);
    const claim = await this.repository.mutate(
      scope.mandateId,
      { id: scope.attemptId, requireUnsentCreate: true },
      (tx) => {
        requireOwner(actor, tx.mandate.ownerId);
        const a = attempt(tx);
        assertOrderScope(a, scope);
        if (
          a.state !== "RESERVED" ||
          a.budgetState !== "RESERVED" ||
          a.orderId ||
          a.captureId ||
          a.errorCode ||
          a.lastRemoteState
        )
          throw new PaymentError("ONE_SHOT_ALREADY_ATTEMPTED_STOP");
        if (
          tx.mandate.capMinor !== "1000" ||
          tx.mandate.reservedMinor !== "600" ||
          tx.mandate.consumedMinor !== "0"
        )
          throw new PaymentError("ONE_SHOT_BUDGET_MISMATCH");
        authorize(actor, tx.mandate, a, tx.now, a);
        a.state = "CREATING";
        timestamp(tx);
        tx.audit.push(
          {
            action:
              scope.purchaseKey === undefined
                ? "TASK03E_ONE_ORDER_AUTHORIZED"
                : "PREPARED_ORDER_AUTHORIZED",
            attemptId: a.id,
            detail: JSON.stringify({
              amountMinor: "600",
              currency: "USD",
              merchantId: a.merchantId,
              createRequestId: a.createRequestId,
              captureAuthorized: false,
            }),
          },
          { action: "CREATE_PREPARED", attemptId: a.id },
        );
        return a;
      },
    );
    let reference: string | undefined;
    try {
      const posted = await this.gateway.createOrder(claim);
      reference = posted.id;
      // Preserve a returned reference if subsequent GET fails, without exposing approval.
      await this.repository.mutate(claim.mandateId, { id: claim.id }, (tx) => {
        attempt(tx).orderId = posted.id;
        tx.audit.push({
          action: "ORDER_REFERENCE_OBSERVED",
          attemptId: claim.id,
        });
        timestamp(tx);
      });
      const canonical = await this.gateway.getOrder(posted.id);
      if (
        canonical.id !== posted.id ||
        !["CREATED", "PAYER_ACTION_REQUIRED"].includes(canonical.status) ||
        canonical.purchase_units.some(
          (u) => (u.payments?.captures?.length ?? 0) !== 0,
        )
      )
        throw new PaymentError("ONE_SHOT_ORDER_REVIEW_REQUIRED");
      // Existing validation/observation preserves held accounting for these states.
      const saved = await this.observe(claim, canonical);
      if (!saved.approvalUrl)
        throw new PaymentError("ONE_SHOT_APPROVAL_LINK_REQUIRED");
      return saved;
    } catch (error) {
      // Even a definitive rejection cannot release this user's reservation here.
      await this.repository.mutate(claim.mandateId, { id: claim.id }, (tx) => {
        const a = attempt(tx);
        if (a.budgetState !== "RESERVED")
          throw new PaymentError("ONE_SHOT_ACCOUNTING_REVIEW_REQUIRED");
        if (a.state !== "REVIEW_REQUIRED") a.state = "CREATE_UNCERTAIN";
        if (reference) a.orderId = reference;
        delete a.approvalUrl;
        a.errorCode =
          error instanceof PaymentError
            ? error.code
            : "PAYPAL_RESPONSE_UNCERTAIN";
        timestamp(tx);
        tx.audit.push({
          action: "ONE_SHOT_STOP_RECONCILIATION_REQUIRED",
          attemptId: a.id,
          detail: a.errorCode,
        });
      });
      throw new PaymentError("ONE_SHOT_STOP_RECONCILIATION_REQUIRED");
    }
  }
  /** Exact-order capture: no new reservation, no automatic retry or budget release. */
  async capturePreparedOnce(
    actor: Principal,
    scope: CaptureOnlyPermission,
  ): Promise<Attempt> {
    const saved = await this.owned(actor, scope.attemptId);
    assertCaptureScope(saved, scope);
    if (saved.state === "SUCCEEDED" && saved.budgetState === "CONSUMED")
      return saved;
    if (
      !["AWAITING_APPROVAL", "APPROVED"].includes(saved.state) ||
      saved.budgetState !== "RESERVED" ||
      saved.captureId ||
      saved.errorCode
    )
      throw new PaymentError("CAPTURE_ALREADY_CLAIMED_OR_UNCERTAIN_STOP");
    const approval = await this.gateway.getOrder(scope.orderId);
    this.validateOrder(saved, approval);
    if (
      approval.status !== "APPROVED" ||
      approval.purchase_units.some(
        (u) => (u.payments?.captures?.length ?? 0) !== 0,
      )
    )
      throw new PaymentError("FRESH_APPROVAL_WITHOUT_CAPTURE_REQUIRED");
    const claim = await this.repository.mutate(
      scope.mandateId,
      { id: scope.attemptId, requireUnsentCapture: true },
      (tx) => {
        requireOwner(actor, tx.mandate.ownerId);
        const a = attempt(tx);
        assertCaptureScope(a, scope);
        if (
          !["AWAITING_APPROVAL", "APPROVED"].includes(a.state) ||
          a.budgetState !== "RESERVED" ||
          a.captureId ||
          a.errorCode
        )
          throw new PaymentError("CAPTURE_ALREADY_CLAIMED_OR_UNCERTAIN_STOP");
        if (
          tx.mandate.capMinor !== "1000" ||
          tx.mandate.reservedMinor !== "600" ||
          tx.mandate.consumedMinor !== "0"
        )
          throw new PaymentError("ONE_SHOT_CAPTURE_BUDGET_MISMATCH");
        a.state = "APPROVED";
        authorize(actor, tx.mandate, a, tx.now, a);
        a.lastRemoteState = "APPROVED";
        a.state = "CAPTURING";
        timestamp(tx);
        delete a.approvalUrl;
        tx.audit.push(
          {
            action: "TASK03G_CAPTURE_AUTHORIZED",
            attemptId: a.id,
            detail: JSON.stringify({
              orderId: a.orderId,
              merchantId: a.merchantId,
              amountMinor: "600",
              currency: "USD",
              captureRequestId: a.captureRequestId,
            }),
          },
          { action: "CAPTURE_PREPARED", attemptId: a.id },
        );
        return a;
      },
    );
    try {
      // Existing Orders v2 CAPTURE transport: financial requests have zero retries.
      await this.gateway.captureOrder(claim);
      const canonical = await this.gateway.getOrder(scope.orderId);
      const unit = this.validateOrder(claim, canonical).unit;
      const member = unit.payments?.captures?.[0];
      if (!member) throw new PaymentError("CAPTURE_REFERENCE_REQUIRED");
      const actual = await this.gateway.getCapture(member.id);
      if (
        actual.id !== member.id ||
        actual.amount.currency_code !== "USD" ||
        fromDecimal(actual.amount.value, "USD") !== "600" ||
        (actual.supplementary_data?.related_ids.order_id &&
          actual.supplementary_data.related_ids.order_id !== scope.orderId)
      )
        throw new PaymentError("PAYPAL_CAPTURE_BINDING_MISMATCH");
      unit.payments = { captures: [actual] };
      this.validateOrder(claim, canonical);
      await this.repository.mutate(claim.mandateId, { id: claim.id }, (tx) => {
        const a = attempt(tx);
        if (a.budgetState !== "RESERVED")
          throw new PaymentError("CAPTURE_ACCOUNTING_REVIEW_REQUIRED");
        a.captureId = actual.id;
        timestamp(tx);
        tx.audit.push({
          action: "CAPTURE_REFERENCE_VERIFIED",
          attemptId: a.id,
          detail: JSON.stringify({
            captureId: actual.id,
            status: actual.status,
          }),
        });
      });
      if (!["COMPLETED", "PENDING"].includes(actual.status))
        throw new PaymentError("CAPTURE_TERMINAL_REVIEW_REQUIRED");
      // Existing atomic accounting consumes only a matching canonical COMPLETED capture.
      return await this.observe(claim, canonical);
    } catch (error) {
      const latest = await this.repository.findAttempt(claim.id);
      if (latest?.state === "SUCCEEDED" && latest.budgetState === "CONSUMED")
        return latest;
      await this.repository.mutate(claim.mandateId, { id: claim.id }, (tx) => {
        const a = attempt(tx);
        if (a.budgetState !== "RESERVED")
          throw new PaymentError("CAPTURE_ACCOUNTING_REVIEW_REQUIRED");
        a.errorCode =
          error instanceof PaymentError
            ? error.code
            : "PAYPAL_RESPONSE_UNCERTAIN";
        a.state =
          a.errorCode === "CAPTURE_TERMINAL_REVIEW_REQUIRED"
            ? "REVIEW_REQUIRED"
            : "CAPTURE_UNCERTAIN";
        timestamp(tx);
        tx.audit.push({
          action: "TASK03G_CAPTURE_STOP_RECONCILIATION_REQUIRED",
          attemptId: a.id,
          detail: a.errorCode,
        });
      });
      throw new PaymentError("CAPTURE_STOP_RECONCILIATION_REQUIRED");
    }
  }
  async capture(actor: Principal, id: string): Promise<Attempt> {
    let saved = await this.owned(actor, id);
    if (saved.budgetState !== "RESERVED") return saved;
    if (!saved.orderId) throw new PaymentError("BUYER_APPROVAL_REQUIRED");
    // Fresh server-side API read; callback/frontend approval claims are never accepted.
    saved = await this.reconcile(saved.id);
    if (
      saved.budgetState !== "RESERVED" ||
      ["CAPTURING", "CAPTURE_UNCERTAIN", "PENDING", "REVIEW_REQUIRED"].includes(
        saved.state,
      )
    )
      return saved;
    const claim = await this.repository.mutate(
      saved.mandateId,
      { id },
      (tx) => {
        requireOwner(actor, tx.mandate.ownerId);
        const a = attempt(tx);
        if (
          ["CAPTURING", "CAPTURE_UNCERTAIN", "PENDING"].includes(a.state) ||
          a.budgetState !== "RESERVED"
        )
          return undefined;
        if (a.state !== "APPROVED")
          throw new PaymentError("BUYER_APPROVAL_REQUIRED");
        authorize(actor, tx.mandate, a, tx.now, a);
        a.state = "CAPTURING";
        timestamp(tx);
        tx.audit.push({ action: "CAPTURE_PREPARED", attemptId: a.id });
        return a;
      },
    );
    if (!claim) return (await this.repository.findAttempt(id)) ?? saved;
    let order: PayPalOrder;
    try {
      order = await this.gateway.captureOrder(claim);
    } catch (error) {
      return this.failedRequest(claim, "CAPTURE", error);
    }
    return this.observe(claim, order);
  }
  private async failedRequest(
    saved: Attempt,
    operation: "CREATE" | "CAPTURE",
    error: unknown,
  ) {
    return this.repository.mutate(saved.mandateId, { id: saved.id }, (tx) => {
      const a = attempt(tx);
      // A concurrent verified webhook may already have resolved the same operation.
      if (a.budgetState !== "RESERVED" || a.state === "REVIEW_REQUIRED")
        return a;
      a.errorCode =
        error instanceof PayPalError ? error.code : "PAYPAL_RESPONSE_UNCERTAIN";
      if (operation === "CREATE" && a.orderId) return a;
      if (
        operation === "CREATE" &&
        error instanceof PayPalError &&
        !error.ambiguous
      ) {
        a.state = "FAILED";
        resolveBudget(tx, "RELEASED");
      } else
        a.state =
          operation === "CREATE" ? "CREATE_UNCERTAIN" : "CAPTURE_UNCERTAIN";
      timestamp(tx);
      tx.audit.push({ action: a.state, attemptId: a.id, detail: a.errorCode });
      return a;
    });
  }
  async cancelReservation(actor: Principal, id: string) {
    const saved = await this.owned(actor, id);
    return this.repository.mutate(saved.mandateId, { id }, (tx) => {
      const a = attempt(tx);
      if (a.state !== "RESERVED")
        throw new PaymentError("RECONCILIATION_REQUIRED");
      a.state = "CANCELLED";
      resolveBudget(tx, "RELEASED");
      timestamp(tx);
      tx.audit.push({ action: "RESERVATION_CANCELLED", attemptId: id });
      return a;
    });
  }
  private validateOrder(a: Attempt, order: PayPalOrder) {
    const unit = order.purchase_units[0];
    if (
      !unit ||
      (a.orderId && order.id !== a.orderId) ||
      order.intent !== "CAPTURE" ||
      unit.reference_id !== a.id ||
      unit.custom_id !== a.id ||
      unit.payee.merchant_id !== a.merchantId ||
      unit.amount.currency_code !== a.currency ||
      fromDecimal(unit.amount.value, a.currency) !== a.amountMinor
    )
      throw new PaymentError("PAYPAL_ORDER_BINDING_MISMATCH");
    const captures = unit.payments?.captures ?? [];
    if (captures.length > 1)
      throw new PaymentError("PAYPAL_CAPTURE_BINDING_MISMATCH");
    for (const c of captures)
      if (
        (a.captureId && c.id !== a.captureId) ||
        c.amount.currency_code !== a.currency ||
        fromDecimal(c.amount.value, a.currency) !== a.amountMinor ||
        (c.status === "COMPLETED" &&
          (c.final_capture !== true || order.status !== "COMPLETED"))
      )
        throw new PaymentError("PAYPAL_CAPTURE_BINDING_MISMATCH");
    return { unit, capture: captures[0] };
  }
  private async observe(saved: Attempt, order: PayPalOrder): Promise<Attempt> {
    try {
      this.validateOrder(saved, order);
    } catch {
      await this.repository.mutate(saved.mandateId, { id: saved.id }, (tx) => {
        const a = attempt(tx);
        if (a.budgetState === "RESERVED") a.state = "REVIEW_REQUIRED";
        a.errorCode = "PAYPAL_ORDER_BINDING_MISMATCH";
        timestamp(tx);
        tx.audit.push({ action: "PAYPAL_BINDING_REJECTED", attemptId: a.id });
      });
      throw new PaymentError("PAYPAL_ORDER_BINDING_MISMATCH");
    }
    return this.repository.mutate(saved.mandateId, { id: saved.id }, (tx) => {
      const a = attempt(tx);
      const { capture: c } = this.validateOrder(a, order);
      if (a.budgetState !== "RESERVED") return a; // Never downgrade terminal ledger entries.
      if (a.state === "REVIEW_REQUIRED") return a; // Manual review cannot be cleared by retries.
      a.orderId = order.id;
      if (c) a.captureId = c.id;
      const remoteState = c?.status ?? order.status;
      const changed = a.lastRemoteState !== remoteState;
      a.lastRemoteState = remoteState;
      delete a.errorCode;
      if (c?.status === "COMPLETED") {
        a.state = "SUCCEEDED";
        resolveBudget(tx, "CONSUMED");
      } else if (c?.status === "PENDING") a.state = "PENDING";
      else if (c && ["DECLINED", "DENIED", "FAILED"].includes(c.status)) {
        a.state = "FAILED";
        resolveBudget(tx, "RELEASED");
      } else if (!c && order.status === "VOIDED") {
        a.state = "VOIDED";
        resolveBudget(tx, "RELEASED");
      } else if (
        c ||
        order.status === "COMPLETED" ||
        order.status === "VOIDED"
      ) {
        a.state = "REVIEW_REQUIRED";
        a.errorCode = "PAYPAL_RECONCILIATION_REVIEW_REQUIRED";
      } else if (
        ["CAPTURING", "CAPTURE_UNCERTAIN", "PENDING"].includes(a.state)
      ) {
        if (a.state !== "PENDING") a.state = "CAPTURE_UNCERTAIN";
        // An older APPROVED read must never reopen a pending/uncertain capture.
      } else {
        a.state =
          order.status === "APPROVED" ? "APPROVED" : "AWAITING_APPROVAL";
        const approval = order.links?.find(
          (l) => l.rel === "approve" || l.rel === "payer-action",
        );
        if (approval) {
          const url = new URL(approval.href);
          if (
            url.origin === "https://www.sandbox.paypal.com" &&
            !url.username &&
            !url.password &&
            url.searchParams.get("token") === a.orderId
          )
            a.approvalUrl = url.toString();
        }
      }
      timestamp(tx);
      if (changed)
        tx.audit.push({
          action: "PAYPAL_STATE_RECONCILED",
          attemptId: a.id,
          detail: remoteState,
        });
      return a;
    });
  }
  /** Read-only recovery: no create/capture POST, even if APPROVED is observed. */
  async reconcile(id: string) {
    const a = await this.repository.findAttempt(id);
    if (!a) throw new PaymentError("PAYMENT_ATTEMPT_NOT_FOUND");
    this.merchant(a.merchantId);
    if (!a.orderId) return a; // Cannot look up an order using PayPal-Request-Id.
    return this.observe(a, await this.gateway.getOrder(a.orderId));
  }
  /** Explicit operator-supplied reference is accepted only after trusted GET + full binding. */
  async reconcileWithOrderId(actor: Principal, id: string, orderId: string) {
    const a = await this.owned(actor, id);
    parse(externalIdSchema, orderId);
    if (a.orderId && a.orderId !== orderId)
      throw new PaymentError("PAYPAL_ORDER_BINDING_MISMATCH");
    if (a.budgetState !== "RESERVED") return a;
    const order = await this.gateway.getOrder(orderId);
    if (order.id !== orderId)
      throw new PaymentError("PAYPAL_ORDER_BINDING_MISMATCH");
    return this.observe(a, order);
  }
  /** Internal verified-webhook recovery. The reference is only a hint until authenticated GET validation. */
  async reconcileProviderReference(
    id: string,
    orderId: string,
    captureId?: string,
  ) {
    const a = await this.repository.findAttempt(id);
    if (!a) throw new PaymentError("PAYMENT_ATTEMPT_NOT_FOUND");
    this.merchant(a.merchantId);
    parse(externalIdSchema, orderId);
    if (a.orderId && a.orderId !== orderId)
      throw new PaymentError("PAYPAL_ORDER_BINDING_MISMATCH");
    const order = await this.gateway.getOrder(orderId);
    if (order.id !== orderId)
      throw new PaymentError("PAYPAL_ORDER_BINDING_MISMATCH");
    if (
      captureId &&
      !order.purchase_units[0]?.payments?.captures?.some(
        (c) => c.id === captureId,
      )
    )
      throw new PaymentError("PAYPAL_CAPTURE_BINDING_MISMATCH");
    if (captureId) {
      const c = await this.gateway.getCapture(captureId);
      if (
        c.id !== captureId ||
        (c.supplementary_data?.related_ids.order_id &&
          c.supplementary_data.related_ids.order_id !== order.id)
      )
        throw new PaymentError("PAYPAL_CAPTURE_BINDING_MISMATCH");
      const unit = order.purchase_units[0];
      if (!unit) throw new PaymentError("PAYPAL_CAPTURE_BINDING_MISMATCH");
      unit.payments = { captures: [c] };
    }
    return this.observe(a, order);
  }
  async recover(limit = 50) {
    const results: { id: string; state: string }[] = [];
    for (const a of await this.repository.recoverable(limit)) {
      if (this.boundMerchantId && a.merchantId !== this.boundMerchantId) {
        results.push({ id: a.id, state: "SKIPPED_DIFFERENT_MERCHANT" });
        continue;
      }
      try {
        if (!a.orderId) {
          await this.repository.mutate(a.mandateId, { id: a.id }, (tx) => {
            const current = attempt(tx);
            if (current.state === "CREATING")
              current.state = "CREATE_UNCERTAIN";
            if (current.budgetState === "RESERVED")
              current.errorCode = "ORDER_REFERENCE_REQUIRED";
            timestamp(tx);
            tx.audit.push({
              action: "RECONCILIATION_REFERENCE_REQUIRED",
              attemptId: a.id,
            });
          });
        }
        results.push({ id: a.id, state: (await this.reconcile(a.id)).state });
      } catch (error) {
        // Durable diagnostics and queue rotation; the budget remains held.
        await this.repository.mutate(a.mandateId, { id: a.id }, (tx) => {
          const current = attempt(tx);
          current.errorCode =
            error instanceof PaymentError
              ? error.code
              : "RECONCILIATION_REQUIRED";
          timestamp(tx);
          tx.audit.push({
            action: "RECONCILIATION_FAILED",
            attemptId: a.id,
            detail: current.errorCode,
          });
        });
        results.push({ id: a.id, state: "RECONCILIATION_REQUIRED" });
      }
    }
    return results;
  }
}
