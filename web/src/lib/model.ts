import type { Address, Hex } from "viem";
import type { AgentEvent, Quote, PaymentView } from "@flint/agent/schema";
export type RecordedEvent = AgentEvent & {
  id: number;
  observedAt: number;
  runId: string;
  chainTime?: number | undefined;
};
export interface MandateView {
  id: Hex;
  description: string;
  registered: boolean;
  agent: Address;
  token: Address;
  cap: string;
  reserved: string;
  settled: string;
  remaining: string;
  expiry: number;
  active: boolean;
  providers: Address[];
  deliveryWindow: number;
  reviewWindow: number;
  challengeWindow: number;
  trustedHash: Hex;
}
export interface PaymentRecord extends PaymentView {
  fundedAt: number;
  transactionHash: Hex;
  resolutionHash?: Hex;
}
export interface RunView {
  id: Hex;
  mandateId: Hex;
  mode: "mock" | "qwen" | "gemini";
  status:
    | "running"
    | "awaiting-challenge"
    | "completed"
    | "refunded"
    | "failed"
    | "interrupted";
  createdAt: number;
  quotes: Quote[];
  paymentId?: Hex | undefined;
  error?: string | undefined;
  inspected: boolean;
}
export interface WorkspaceConfig {
  chainId: 31337 | 10143;
  network: string;
  rpcUrl: string;
  vault: Address;
  token: Address;
  agent: Address;
  providers: { id: string; name: string; address: Address }[];
}
export interface WorkspaceSnapshot {
  configured: boolean;
  config?: WorkspaceConfig;
  owner?: Address;
  balance?: {
    actual: string;
    available: string;
    reserved: string;
    decimals: number;
    symbol: string;
  };
  chainTime: number;
  model: "mock" | "qwen" | "gemini";
  /**
   * Backend-authoritative Live Gemini availability. Absent only from snapshots
   * produced before this flag existed; the UI treats absent as unavailable.
   */
  geminiAvailable: boolean;
  mandates: MandateView[];
  payments: PaymentRecord[];
  runs: RunView[];
  events: RecordedEvent[];
  error?: string | undefined;
}
export interface LaunchChallenge {
  nonce: Hex;
  mandateId: Hex;
  purchaseKey: Hex;
  action: "launch" | "resume";
  owner: Address;
  expiresAt: number;
  chainId: 31337 | 10143;
  vault: Address;
}
export function launchTypedData(c: LaunchChallenge) {
  return {
    domain: {
      name: "Flint Owner Launch",
      version: "1",
      chainId: c.chainId,
      verifyingContract: c.vault,
    },
    types: {
      Launch: [
        { name: "action", type: "string" },
        { name: "mandateId", type: "bytes32" },
        { name: "purchaseKey", type: "bytes32" },
        { name: "nonce", type: "bytes32" },
        { name: "expiresAt", type: "uint64" },
      ],
    },
    primaryType: "Launch" as const,
    message: {
      action: c.action === "launch" ? "LaunchTask" : "ResumeTask",
      mandateId: c.mandateId,
      purchaseKey: c.purchaseKey,
      nonce: c.nonce,
      expiresAt: BigInt(c.expiresAt),
    },
  };
}
export function challengeRemaining(
  payment: Pick<PaymentView, "status" | "challengeDeadline">,
  chainTime: number,
) {
  return payment.status === "ACCEPTED"
    ? Math.max(0, payment.challengeDeadline - chainTime)
    : 0;
}
export function canReject(p: PaymentView, now: number) {
  return p.status === "FUNDED"
    ? now < p.deliveryDeadline
    : p.status === "SUBMITTED"
      ? now < p.reviewDeadline
      : p.status === "ACCEPTED"
        ? now < p.challengeDeadline
        : false;
}
export function canRefund(p: PaymentView, now: number) {
  return p.status === "FUNDED"
    ? now >= p.deliveryDeadline
    : p.status === "SUBMITTED"
      ? now >= p.reviewDeadline
      : false;
}
export function mergeEvents(
  previous: RecordedEvent[],
  incoming: RecordedEvent[],
) {
  return [
    ...new Map([...previous, ...incoming].map((e) => [e.id, e])).values(),
  ].sort((a, b) => a.id - b.id);
}
export function short(value: string | undefined) {
  return value ? `${value.slice(0, 6)}…${value.slice(-4)}` : "Not connected";
}

/**
 * Truthful model identity for run/snapshot modes. Unknown values never render
 * as a live provider: anything that is not an explicitly enabled live model
 * reads as the deterministic baseline. Live Gemini appears only when the
 * backend actually executed with it.
 */
export function modelLabel(mode: string | undefined): string {
  if (mode === "gemini") return "Gemini";
  if (mode === "qwen") return "Qwen";
  return "Deterministic Mock";
}

/** Shown when Live Gemini is unavailable so visitors are never left guessing. */
export const GEMINI_UNAVAILABLE_NOTE =
  "Live Gemini is temporarily unavailable. Demo Mode remains available.";
