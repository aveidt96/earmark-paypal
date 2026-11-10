import type {
  PayPalAgentTraceStep,
  PayPalPolicyCheckView,
} from "./paypal-agent";

export type AgentInferenceEvidence = {
  kind: "LIVE_GOOGLE_API" | "MOCKED_TRANSPORT_TEST";
  model: string;
  requests: {
    httpStatus: number;
    responseId: string | null;
    modelVersion: string | null;
    toolNames: string[];
  }[];
};
export type AgentCheckoutIntent = {
  version: 1;
  id: string;
  mandateId: string;
  idempotencyKey: string;
  catalogVersion: "synthetic-agent-05a-v1";
  state: "HUMAN_AUTHORIZATION_REQUIRED";
  syntheticCatalog: true;
  offerId: string;
  merchantId: string;
  amountMinor: "600";
  currency: "USD";
  deliveryCommitment: string;
  ownerAuthorized: false;
  fundsReserved: false;
  paypalOrderId: null;
  paypalCaptureId: null;
  createdAt: string;
  expiresAt: string;
  reason: string;
  modelSummary: string;
  evidence: AgentInferenceEvidence;
  policyChecks: PayPalPolicyCheckView[];
  trace: PayPalAgentTraceStep[];
};
export type AgentCheckoutView = {
  authenticated: true;
  campaign?: { id: string; version: string; ownerId: string; agentId: string };
  localTestOwnerOnly: true;
  productionAuthentication: false;
  liveGeminiConfigured: boolean;
  blocker: string | null;
  mandate: null | {
    id: string;
    status: string;
    expired: boolean;
    expiresAt: string;
    capMinor: string;
    reservedMinor: string;
    consumedMinor: string;
    availableMinor: string;
  };
  intent: AgentCheckoutIntent | null;
  evaluationState:
    "NOT_STARTED" | "RUNNING_OR_INTERRUPTED" | "FAILED" | "PREPARED";
  orderCreationEnabled: boolean;
  captureEnabled: boolean;
  persistentReservationEnabled: boolean;
  payment?: {
    executionEnabled: boolean;
    attempt: null | {
      id: string;
      state: string;
      budgetState: string;
      orderId: string | null;
      captureId: string | null;
      approvalUrl: string | null;
    };
  };
};

/** A real model can validate synthetic test authority; this is never a saved checkout. */
export type AgentSyntheticDiagnostic = {
  outboundBoundary?: {
    version: "synthetic-payload-v1";
    accepted: number;
    rejected: number;
    toolResponsesValidated: number;
    canaryRejected: number;
  };
  runtimeVersion: "task05ct-transport-v1";
  source: "LIVE_GOOGLE_API" | "MOCKED_TRANSPORT_TEST";
  verifiedAt: string;
  syntheticCatalog: true;
  policyValidated: true;
  proposal: { offerId: string; amountMinor: "600"; currency: "USD" };
  policyChecks: { id: string; label: string; passed: boolean }[];
  requests: {
    step: number;
    httpStatus: number;
    category: string;
    candidateCount: number;
    finishReason: string | null;
    blockReason: string | null;
    toolNames: string[];
    argumentsValid: boolean[];
  }[];
  persisted: false;
  ownerAuthorized: false;
  fundsReserved: false;
  paypalOrderId: null;
  paypalCaptureId: null;
};
