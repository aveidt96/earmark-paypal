import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { readGeminiBody } from "@flint/agent/server";
import type {
  AgentCheckoutIntent,
  AgentCheckoutView,
  AgentInferenceEvidence,
} from "../../lib/agent-checkout";
import type { AgentCheckoutConfig } from "./agent-checkout-config";
import { PaymentError, type Mandate, type Principal } from "./domain";
import { requireOwner } from "./policy";
import type { BoundaryEvidence } from "./gemini-boundary";
import type {
  AgentCheckoutPaymentService,
  AgentPaymentAction,
} from "./agent-checkout-payment";
import {
  IsolatedAgentPaymentRepository,
  PayPalAgentProposalService,
  PayPalAgentTools,
  computeOfferArtifactCommitment,
  evaluateCatalogOffer,
  createPayPalGeminiModel,
  runPayPalPurchasingAgent,
  assertNoSensitiveMaterialInAgentPayload,
  paypalAgentToolNames,
  TASK_03G_US_MANDATE_ID,
  TASK_03G_US_ATTEMPT_ID,
  TASK_03G_US_ORDER_ID,
  TASK_03G_US_CAPTURE_ID,
  TASK_03C_ORIGINAL_MANDATE_ID,
  TASK_03C_ORIGINAL_ORDER_ID,
  type PayPalMerchantCatalogOffer,
  type PayPalPurchasingObjective,
} from "./agent";

export const AGENT_CATALOG_VERSION = "synthetic-agent-05a-v1" as const;
export const AGENT_OFFER_ID = "synthetic-us-weather-600";
const digest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
function uuid(text: string) {
  const b = createHash("sha1")
    .update(`earmark-agent-checkout-05a:${text}`)
    .digest()
    .subarray(0, 16);
  b[6] = ((b[6] ?? 0) & 15) | 80;
  b[8] = ((b[8] ?? 0) & 63) | 128;
  const h = b.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
export function agentCheckoutMandateId(
  config: Pick<AgentCheckoutConfig, "ownerId" | "merchantId"> &
    Partial<Pick<AgentCheckoutConfig, "campaign">>,
) {
  return uuid(
    `${config.campaign && config.campaign !== "agent-05a" ? `${config.campaign}:` : ""}${config.ownerId}:${config.merchantId}:mandate`,
  );
}
export function agentCampaignId(config: AgentCheckoutConfig) {
  return uuid(
    `${config.campaign}:${config.ownerId}:${config.merchantId}:campaign`,
  );
}
export function agentObjective(m: Mandate): PayPalPurchasingObjective {
  return {
    taskId: `agent05a-${m.id}`,
    purchaseKey: `agent05a-${m.id}`,
    title: "Synthetic $6 weather-feed checkout preparation",
    instruction:
      "Use the explicitly SYNTHETIC catalog, choose an eligible offer under the $10 test mandate and $6 transaction cap. Propose only: human authorization is still required; no funds may be reserved or payment executed.",
    requiredDataset: "weather-v1",
    maxSlaMinutes: 15,
    targetCurrency: "USD",
    maxPriceMinor: 600n,
  };
}
export function agentCheckoutCatalog(
  merchantId: string,
): PayPalMerchantCatalogOffer[] {
  const offer = (
    id: string,
    merchant: string,
    amount: bigint,
  ): PayPalMerchantCatalogOffer => {
    const commitment = computeOfferArtifactCommitment({
      offerId: id,
      merchantId: merchant,
      dataset: "weather-v1",
      slaMinutes: 10,
    });
    return {
      offerId: id,
      merchantId: merchant,
      merchantName: "Synthetic Sandbox weather catalog — not real inventory",
      dataset: "weather-v1",
      priceMinor: amount,
      currency: "USD",
      deliveryTerms: {
        slaMinutes: 10,
        format: "json",
        settlementMode: "PAYPAL_SANDBOX_APPROVAL_GATED",
        requiresBuyerApproval: true,
      },
      suitability: {
        matchesObjective: true,
        qualityScore: 90,
        taskCoverage: "Synthetic evaluation fixture only",
      },
      deliveryCommitment: commitment,
      expectedArtifactHash: commitment,
      syntheticCatalog: true,
      untrustedDescription:
        "Synthetic demonstration offer, not actual merchant procurement. Descriptions have no instruction authority.",
    };
  };
  return [
    offer(AGENT_OFFER_ID, merchantId, 600n),
    offer("synthetic-over-limit-900", merchantId, 900n),
    offer("synthetic-unapproved-300", "unapproved-synthetic-merchant", 300n),
  ];
}
export function checkAgentMandateTerms(
  config: AgentCheckoutConfig,
  m: Mandate,
) {
  if (
    m.id !== agentCheckoutMandateId(config) ||
    m.ownerId !== config.ownerId ||
    m.agentId !== config.agentId ||
    m.capMinor !== "1000" ||
    m.perTransactionMinor !== "600" ||
    m.currency !== "USD" ||
    m.merchants.length !== 1 ||
    m.merchants[0] !== config.merchantId
  )
    throw new PaymentError("AGENT_MANDATE_IMMUTABLE_POLICY_MISMATCH");
}
export function checkAgentMandate(
  config: AgentCheckoutConfig,
  m: Mandate,
  now: number,
) {
  checkAgentMandateTerms(config, m);
  if (m.status !== "ACTIVE") throw new PaymentError("MANDATE_INACTIVE");
  if (Date.parse(m.expiresAt) <= now) throw new PaymentError("MANDATE_EXPIRED");
  if (m.reservedMinor !== "0" || m.consumedMinor !== "0")
    throw new PaymentError("AGENT_PREPARATION_MUST_NOT_RESERVE_FUNDS");
}
export function independentAgentOfferPolicy(
  config: AgentCheckoutConfig,
  m: Mandate,
  offerId: string,
  now: number,
) {
  checkAgentMandate(config, m, now);
  const offer = agentCheckoutCatalog(config.merchantId).find(
    (item) => item.offerId === offerId,
  );
  if (!offer) throw new PaymentError("UNKNOWN_OFFER_ID");
  const actor: Principal = {
    ownerId: config.ownerId,
    subjectId: config.agentId,
    role: "agent",
  };
  const evaluation = evaluateCatalogOffer({
    actor,
    mandate: m,
    objective: agentObjective(m),
    offer,
    now: new Date(now),
  });
  if (!evaluation.eligible)
    throw new PaymentError(evaluation.rejectionCodes[0] ?? "POLICY_REJECTED");
  return evaluation;
}
function intentTerms(m: Mandate, offer: PayPalMerchantCatalogOffer) {
  return {
    catalogVersion: AGENT_CATALOG_VERSION,
    mandateId: m.id,
    offerId: offer.offerId,
    merchantId: offer.merchantId,
    amountMinor: offer.priceMinor.toString(),
    currency: offer.currency,
    deliveryCommitment: offer.deliveryCommitment,
  };
}
export function intentIdentity(m: Mandate, offer: PayPalMerchantCatalogOffer) {
  const hash = digest(intentTerms(m, offer));
  const namespace = m.agentId.startsWith("agent05d-v1-")
    ? "agent05d-v1"
    : m.agentId.startsWith("agent05c-v1-")
      ? "agent05c-v1"
      : "agent05a";
  return {
    id: uuid(
      `${namespace === "agent05a" ? "" : `${namespace}:`}intent:${hash}`,
    ),
    idempotencyKey: `${namespace}:${hash}`,
  };
}

const checkSchema = z
  .strictObject({
    id: z.string().max(100),
    label: z.string().max(200),
    passed: z.boolean(),
    detail: z.string().max(3000),
    code: z.string().min(1).max(120).optional(),
  })
  .transform(({ code, ...item }) => ({ ...item, ...(code ? { code } : {}) }));
const traceSchema = z
  .strictObject({
    step: z.number().int().min(1),
    actor: z.enum([
      "gemini-model",
      "deterministic-simulator",
      "policy-engine",
      "tool-contract",
    ]),
    toolName: z.string().min(1).max(120).optional(),
    summary: z.string().max(1000),
    outcome: z.enum(["ok", "rejected", "blocked", "finish"]),
    detail: z.string().max(3000),
  })
  .transform(({ toolName, ...item }) => ({
    ...item,
    ...(toolName ? { toolName } : {}),
  }));
const evidenceSchema = z.strictObject({
  kind: z.enum(["LIVE_GOOGLE_API", "MOCKED_TRANSPORT_TEST"]),
  model: z.string().min(1).max(100),
  requests: z
    .array(
      z.strictObject({
        httpStatus: z.number().int(),
        responseId: z.string().max(200).nullable(),
        modelVersion: z.string().max(200).nullable(),
        toolNames: z.array(z.string().max(100)).max(8),
      }),
    )
    .min(1)
    .max(16),
});
export const agentIntentSchema = z.strictObject({
  version: z.literal(1),
  id: z.string().uuid(),
  mandateId: z.string().uuid(),
  idempotencyKey: z
    .string()
    .regex(/^(?:agent05a|agent05c-v1|agent05d-v1):[a-f0-9]{64}$/),
  catalogVersion: z.literal(AGENT_CATALOG_VERSION),
  state: z.literal("HUMAN_AUTHORIZATION_REQUIRED"),
  syntheticCatalog: z.literal(true),
  offerId: z.string().max(64),
  merchantId: z.string().max(120),
  amountMinor: z.literal("600"),
  currency: z.literal("USD"),
  deliveryCommitment: z.string().regex(/^0x[a-f0-9]{64}$/i),
  ownerAuthorized: z.literal(false),
  fundsReserved: z.literal(false),
  paypalOrderId: z.null(),
  paypalCaptureId: z.null(),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  reason: z.string().max(500),
  modelSummary: z.string().max(500),
  evidence: evidenceSchema,
  policyChecks: z.array(checkSchema).max(20),
  trace: z.array(traceSchema).max(24),
});
/** Immutable journal binding also applies after a reservation/capture changes accounting. */
export function validateAgentIntentBinding(
  config: AgentCheckoutConfig,
  m: Mandate,
  raw: unknown,
): AgentCheckoutIntent {
  checkAgentMandateTerms(config, m);
  const result = agentIntentSchema.safeParse(raw);
  if (!result.success) throw new PaymentError("INVALID_AGENT_CHECKOUT_INTENT");
  const intent = result.data,
    offer = agentCheckoutCatalog(config.merchantId).find(
      (o) => o.offerId === intent.offerId,
    );
  if (!offer) throw new PaymentError("UNKNOWN_OFFER_ID");
  const identity = intentIdentity(m, offer);
  if (
    intent.id !== identity.id ||
    intent.idempotencyKey !== identity.idempotencyKey ||
    intent.mandateId !== m.id ||
    intent.merchantId !== offer.merchantId ||
    intent.amountMinor !== offer.priceMinor.toString() ||
    intent.currency !== offer.currency ||
    intent.deliveryCommitment !== offer.deliveryCommitment ||
    intent.expiresAt !== m.expiresAt
  )
    throw new PaymentError("AGENT_CHECKOUT_IMMUTABLE_TERMS_MISMATCH");
  assertNoSensitiveMaterialInAgentPayload(intent);
  return intent;
}
export function validatePendingAgentIntent(
  config: AgentCheckoutConfig,
  m: Mandate,
  raw: unknown,
  now: number,
): AgentCheckoutIntent {
  const intent = validateAgentIntentBinding(config, m, raw);
  const evaluation = independentAgentOfferPolicy(
    config,
    m,
    intent.offerId,
    now,
  );
  return { ...intent, policyChecks: evaluation.checks };
}
export type AgentPreparationSnapshot = {
  mandate: Mandate | null;
  intent: AgentCheckoutIntent | null;
  evaluationState: AgentCheckoutView["evaluationState"];
  errorCode?: string;
};
export interface AgentCheckoutRepository {
  read(): Promise<AgentPreparationSnapshot>;
  initialize(actor: Principal): Promise<AgentPreparationSnapshot>;
  evaluateOnce(
    actor: Principal,
    produce: (m: Mandate) => Promise<AgentCheckoutIntent>,
  ): Promise<AgentCheckoutIntent>;
}
export function liveAgentConfigured(env: Record<string, string | undefined>) {
  return (
    env.EARMARK_GEMINI_ENABLED === "true" &&
    env.AI_ENABLE_NETWORK === "true" &&
    !!env.GEMINI_API_KEY
  );
}
export function liveAgentBlocker(env: Record<string, string | undefined>) {
  return !env.GEMINI_API_KEY
    ? "MISSING_MODEL_CONFIGURATION"
    : !liveAgentConfigured(env)
      ? "GEMINI_DISABLED"
      : null;
}
export async function inferPendingAgentIntent(
  config: AgentCheckoutConfig,
  m: Mandate,
  env: Record<string, string | undefined>,
  fetcher: typeof fetch = fetch,
  kind: AgentInferenceEvidence["kind"] = "LIVE_GOOGLE_API",
  now: () => number = Date.now,
  boundaryEvidence?: BoundaryEvidence,
): Promise<AgentCheckoutIntent> {
  checkAgentMandate(config, m, now());
  const blocker = liveAgentBlocker(env);
  if (blocker) throw new PaymentError(blocker);
  if (
    (env.GEMINI_BASE_URL ??
      "https://generativelanguage.googleapis.com/v1beta") !==
    "https://generativelanguage.googleapis.com/v1beta"
  )
    throw new PaymentError("OFFICIAL_GEMINI_ENDPOINT_REQUIRED");
  const forbidden = [
    config.loginSecret,
    config.sessionSecret,
    ...[
      "GEMINI_API_KEY",
      "PAYPAL_CLIENT_ID",
      "PAYPAL_CLIENT_SECRET",
      "PAYPAL_DATABASE_URL",
      "PAYPAL_DATABASE_DIRECT_URL",
      "PAYPAL_ORIGINAL_CLIENT_SECRET",
      "PAYPAL_OLD_CLIENT_SECRET",
    ].map((key) => env[key] ?? ""),
  ];
  const modelForbidden = [
    ...forbidden,
    TASK_03G_US_MANDATE_ID,
    TASK_03G_US_ATTEMPT_ID,
    TASK_03G_US_ORDER_ID,
    TASK_03G_US_CAPTURE_ID,
    TASK_03C_ORIGINAL_MANDATE_ID,
    TASK_03C_ORIGINAL_ORDER_ID,
    ...[config.ownerId, config.agentId, config.merchantId, m.id].filter(
      (v) => v !== "SYNTHETICDIAG1",
    ),
  ];
  const evidence: AgentInferenceEvidence = {
    kind,
    model: env.GEMINI_MODEL || "gemini-3.8-flash",
    requests: [],
  };
  const modelConfig: AgentCheckoutConfig = {
    ...config,
    // The new durable campaign reuses the already-allowlisted fictional model fixture.
    campaign:
      config.campaign === "agent-05d-v1" ? "agent-05c-v1" : config.campaign,
    ownerId: "paypal-test-owner-synthetic-model",
    agentId:
      config.campaign !== "agent-05a"
        ? "agent05c-v1-synthetic-model"
        : "agent05a-synthetic-model",
    merchantId: "SYNTHETICDIAG1",
  };
  const modelNow = now();
  const modelMandate: Mandate = {
    ...m,
    id: agentCheckoutMandateId(modelConfig),
    ownerId: modelConfig.ownerId,
    agentId: modelConfig.agentId,
    merchants: [modelConfig.merchantId],
    createdAt: new Date(modelNow).toISOString(),
    expiresAt: new Date(modelNow + 3600000).toISOString(),
  };
  const catalog = agentCheckoutCatalog(modelConfig.merchantId),
    objective = agentObjective(modelMandate);
  const safeString = (value: unknown) =>
    typeof value === "string" && /^[A-Za-z0-9._:/-]{1,200}$/.test(value)
      ? value
      : null;
  const model = createPayPalGeminiModel(
    env,
    async (input, init) => {
      const url = new URL(String(input));
      if (
        url.origin !== "https://generativelanguage.googleapis.com" ||
        !/^\/v1beta\/models\/[A-Za-z0-9._%-]+:generateContent$/.test(
          url.pathname,
        ) ||
        url.search ||
        url.hash ||
        init?.method !== "POST"
      )
        throw new PaymentError("GEMINI_ONLY_TRANSPORT_REQUIRED");
      assertNoSensitiveMaterialInAgentPayload(
        JSON.parse(String(init.body)),
        modelForbidden,
      );
      const response = await fetcher(input, init);
      if (!response.ok) {
        evidence.requests.push({
          httpStatus: response.status,
          responseId: null,
          modelVersion: null,
          toolNames: [],
        });
        return response;
      }
      const text = await readGeminiBody(response, init?.signal);
      if (text.length > 1000000)
        throw new PaymentError("INVALID_MODEL_RESPONSE");
      let metadata: unknown;
      try {
        metadata = JSON.parse(text);
      } catch {
        metadata = {};
      }
      const raw = metadata as {
        responseId?: unknown;
        modelVersion?: unknown;
        candidates?: Array<{
          content?: { parts?: Array<{ functionCall?: { name?: unknown } }> };
        }>;
      };
      evidence.requests.push({
        httpStatus: response.status,
        responseId: safeString(raw.responseId),
        modelVersion: safeString(raw.modelVersion),
        toolNames: (raw.candidates?.[0]?.content?.parts ?? []).flatMap(
          (part) =>
            typeof part.functionCall?.name === "string"
              ? [part.functionCall.name]
              : [],
        ),
      });
      return response;
    },
    { mandate: modelMandate, objective, catalog, forbidden: modelForbidden },
    boundaryEvidence,
  );
  // The model only sees this synthetic fixture. Real policy is checked locally.
  const memory = new IsolatedAgentPaymentRepository(now);
  await memory.insertMandate(structuredClone(modelMandate));
  const actor: Principal = {
    ownerId: modelConfig.ownerId,
    subjectId: modelConfig.agentId,
    role: "agent",
  };
  const service = new PayPalAgentProposalService({
    repository: memory,
    actor,
    mandateId: modelMandate.id,
    objective,
    catalog,
    reserveOnProposal: false,
    now: () => new Date(now()),
  });
  const tools = new PayPalAgentTools(
    service,
    objective,
    catalog,
    () => new Date(now()),
    modelForbidden,
    true,
  );
  const result = await runPayPalPurchasingAgent({ model, tools, maxSteps: 8 }),
    proposal = tools.lastProposalDecision;
  if (
    !proposal?.allowed ||
    !proposal.offer ||
    !tools.observations.comparisonObserved ||
    !tools.observations.paymentStatusObserved
  )
    throw new PaymentError("AGENT_VALIDATED_PROPOSAL_REQUIRED");
  if (
    !evidence.requests.some(
      (r) => r.httpStatus === 200 && r.toolNames.includes("proposePurchase"),
    ) ||
    evidence.requests.some((r) =>
      r.toolNames.some(
        (name) => !(paypalAgentToolNames as string[]).includes(name),
      ),
    )
  )
    throw new PaymentError("GENUINE_MODEL_TOOL_EVIDENCE_REQUIRED");
  const independent = independentAgentOfferPolicy(
      config,
      m,
      proposal.offer.offerId,
      now(),
    ),
    offer = independent.offer;
  if (
    memory.attempts.size !== 0 ||
    [...memory.mandates.values()].some(
      (row) => row.reservedMinor !== "0" || row.consumedMinor !== "0",
    )
  )
    throw new PaymentError("MODEL_RESERVATION_FORBIDDEN");
  const intent = {
    version: 1,
    ...intentIdentity(m, offer),
    ...intentTerms(m, offer),
    state: "HUMAN_AUTHORIZATION_REQUIRED",
    syntheticCatalog: true,
    ownerAuthorized: false,
    fundsReserved: false,
    paypalOrderId: null,
    paypalCaptureId: null,
    createdAt: new Date(now()).toISOString(),
    expiresAt: m.expiresAt,
    reason: proposal.reason,
    modelSummary: result.finishSummary,
    evidence,
    policyChecks: independent.checks,
    trace: result.trace,
  };
  assertNoSensitiveMaterialInAgentPayload(intent, forbidden);
  return validatePendingAgentIntent(config, m, intent, now());
}
export class AgentCheckoutPreparationService {
  constructor(
    readonly config: AgentCheckoutConfig,
    readonly repository: AgentCheckoutRepository,
    private readonly env: Record<string, string | undefined> = process.env,
    private readonly infer = (m: Mandate) =>
      inferPendingAgentIntent(config, m, env),
    private readonly now: () => number = Date.now,
    private readonly payments?: AgentCheckoutPaymentService,
  ) {}
  private owner(actor: Principal) {
    requireOwner(actor, this.config.ownerId);
  }
  async view(actor: Principal): Promise<AgentCheckoutView> {
    this.owner(actor);
    const saved = await this.repository.read(),
      m = saved.mandate;
    return {
      authenticated: true,
      campaign: {
        id: agentCampaignId(this.config),
        version: this.config.campaign,
        ownerId: this.config.ownerId,
        agentId: this.config.agentId,
      },
      localTestOwnerOnly: true,
      productionAuthentication: false,
      liveGeminiConfigured: liveAgentConfigured(this.env),
      blocker: saved.errorCode ?? liveAgentBlocker(this.env),
      mandate: m
        ? {
            id: m.id,
            status: m.status,
            expired: Date.parse(m.expiresAt) <= this.now(),
            expiresAt: m.expiresAt,
            capMinor: m.capMinor,
            reservedMinor: m.reservedMinor,
            consumedMinor: m.consumedMinor,
            availableMinor: (
              BigInt(m.capMinor) -
              BigInt(m.reservedMinor) -
              BigInt(m.consumedMinor)
            ).toString(),
          }
        : null,
      intent: saved.intent,
      evaluationState: saved.evaluationState,
      orderCreationEnabled: this.payments?.enabled ?? false,
      captureEnabled: this.payments?.enabled ?? false,
      persistentReservationEnabled: this.payments?.enabled ?? false,
      ...(this.payments ? { payment: await this.payments.view(actor) } : {}),
    };
  }
  async initialize(actor: Principal) {
    this.owner(actor);
    await this.repository.initialize(actor);
    return this.view(actor);
  }
  async evaluate(actor: Principal) {
    this.owner(actor);
    const blocker = liveAgentBlocker(this.env);
    if (blocker) throw new PaymentError(blocker);
    await this.repository.evaluateOnce(actor, this.infer);
    return this.view(actor);
  }
  async paymentAction(actor: Principal, action: AgentPaymentAction) {
    this.owner(actor);
    if (!this.payments)
      throw new PaymentError("AGENT_PAYMENT_EXECUTION_DISABLED");
    await this.payments.action(actor, action);
    return this.view(actor);
  }
}
