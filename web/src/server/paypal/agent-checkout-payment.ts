import "server-only";
import type { AgentCheckoutView } from "../../lib/agent-checkout";
import type { AgentCheckoutConfig } from "./agent-checkout-config";
import {
  agentCheckoutMandateId,
  checkAgentMandateTerms,
  validateAgentIntentBinding,
  validatePendingAgentIntent,
  type AgentCheckoutRepository,
} from "./agent-checkout";
import { PaymentError, fingerprint, type Principal } from "./domain";
import { requireOwner } from "./policy";
import { paypalOAuthSettings } from "./config";
import { PayPalClient } from "./client";
import {
  testCheckoutGateway,
  type TestCheckoutRepository,
} from "./test-checkout";
import { PayPalPaymentService, type PayPalGateway } from "./service";

export type AgentPaymentAction = "authorize-order" | "capture" | "reconcile";

export function isAgentPaymentCampaign(config: AgentCheckoutConfig) {
  return (
    config.campaign === "agent-05d-v1" || config.campaign === "agent-09-v1"
  );
}

/** Explicit future opt-in, scoped to one NEW campaign. Never read from model/browser JSON. */
export function agentPaymentEnabled(
  config: AgentCheckoutConfig,
  env: Record<string, string | undefined>,
) {
  return (
    ((config.campaign === "agent-05d-v1" &&
      env.PAYPAL_AGENT_CHECKOUT_EXECUTION ===
        "task05d-one-synthetic-checkout") ||
      (config.campaign === "agent-09-v1" &&
        env.PAYPAL_AGENT_CHECKOUT_EXECUTION ===
          "task09-one-sandbox-checkout")) &&
    env.PAYPAL_AGENT_CHECKOUT_MANDATE_ID === agentCheckoutMandateId(config) &&
    env.PAYPAL_AGENT_BUYER_SEPARATE === "true"
  );
}

/** This owner-only adapter is not a Gemini tool. The existing service owns every financial transition. */
export class AgentCheckoutPaymentService {
  readonly enabled: boolean;
  readonly captureEnabled: boolean;
  constructor(
    private readonly config: AgentCheckoutConfig,
    private readonly prepared: AgentCheckoutRepository,
    private readonly repository: TestCheckoutRepository,
    env: Record<string, string | undefined>,
    private readonly now = Date.now,
    private readonly gateway: () => PayPalGateway = () =>
      testCheckoutGateway(
        new PayPalClient({
          ...paypalOAuthSettings(env),
          merchantId: config.merchantId,
          paymentsEnabled: true,
          credentialSellerOnly: true,
          maxRetries: 0,
          returnUrl: `${config.origin}/agent-checkout`,
          cancelUrl: `${config.origin}/agent-checkout`,
        }),
      ),
  ) {
    this.enabled = agentPaymentEnabled(config, env);
    this.captureEnabled =
      this.enabled &&
      (config.campaign !== "agent-09-v1" ||
        env.PAYPAL_AGENT_CAPTURE_MANDATE_ID === agentCheckoutMandateId(config));
  }
  private async context(actor: Principal) {
    requireOwner(actor, this.config.ownerId);
    const saved = await this.prepared.read();
    if (!saved.mandate || !saved.intent || saved.evaluationState !== "PREPARED")
      throw new PaymentError("AGENT_VALIDATED_PROPOSAL_REQUIRED");
    const current = await this.repository.readCheckout(
      saved.mandate.id,
      saved.intent.idempotencyKey,
    );
    const m = current.mandate;
    if (!m) throw new PaymentError("AGENT_MANDATE_REQUIRED");
    checkAgentMandateTerms(this.config, m);
    const intent = validateAgentIntentBinding(this.config, m, saved.intent);
    const input = {
      mandateId: m.id,
      purchaseKey: intent.idempotencyKey,
      merchantId: intent.merchantId,
      amountMinor: intent.amountMinor,
      currency: intent.currency,
    };
    const a = current.attempt;
    if (
      a &&
      (a.fingerprint !== fingerprint(input) ||
        a.mandateId !== m.id ||
        a.ownerId !== m.ownerId ||
        a.agentId !== m.agentId ||
        a.merchantId !== input.merchantId ||
        a.purchaseKey !== input.purchaseKey ||
        a.amountMinor !== input.amountMinor ||
        a.currency !== input.currency)
    )
      throw new PaymentError("AGENT_PAYMENT_BINDING_MISMATCH");
    return { m, intent, input, a };
  }
  async view(
    actor: Principal,
  ): Promise<NonNullable<AgentCheckoutView["payment"]>> {
    requireOwner(actor, this.config.ownerId);
    const saved = await this.prepared.read();
    if (!saved.intent) return { executionEnabled: this.enabled, attempt: null };
    const { a } = await this.context(actor);
    return {
      executionEnabled: this.enabled,
      attempt: a
        ? {
            id: a.id,
            state: a.state,
            budgetState: a.budgetState,
            orderId: a.orderId ?? null,
            captureId: a.captureId ?? null,
            approvalUrl: a.approvalUrl ?? null,
          }
        : null,
    };
  }
  async action(actor: Principal, action: AgentPaymentAction) {
    requireOwner(actor, this.config.ownerId);
    if (!["authorize-order", "capture", "reconcile"].includes(action))
      throw new PaymentError("AGENT_PAYMENT_EXECUTION_DISABLED");
    if (!this.enabled || (action === "capture" && !this.captureEnabled))
      throw new PaymentError("AGENT_PAYMENT_EXECUTION_DISABLED");
    const { m, intent, input, a } = await this.context(actor);
    if (intent.evidence.kind !== "LIVE_GOOGLE_API")
      throw new PaymentError("AGENT_LIVE_PROPOSAL_REQUIRED");
    if (action !== "reconcile") {
      if (m.status !== "ACTIVE") throw new PaymentError("MANDATE_INACTIVE");
      if (Date.parse(m.expiresAt) <= this.now())
        throw new PaymentError("MANDATE_EXPIRED");
    }
    if (action === "authorize-order" && !a)
      validatePendingAgentIntent(this.config, m, intent, this.now());
    if (action !== "authorize-order" && !a)
      throw new PaymentError("PAYMENT_ATTEMPT_NOT_FOUND");
    const payments = new PayPalPaymentService(
      this.repository,
      this.gateway(),
      this.now,
      this.config.merchantId,
    );
    if (action === "authorize-order") {
      // A saved/restarted order is replayed through the same mandate/key and durable claims.
      return payments.createOrder(actor, input);
    }
    if (!a) throw new PaymentError("PAYMENT_ATTEMPT_NOT_FOUND");
    // A callback/URL never asserts approval. capture() performs a fresh canonical GET.
    return action === "capture"
      ? payments.capture(actor, a.id)
      : payments.reconcile(a.id);
  }
}
