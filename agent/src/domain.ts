import {
  encodeAbiParameters,
  keccak256,
  stringToHex,
  type Address,
  type Hex,
} from "viem";
import { z } from "zod";
export const hashSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/)
  .transform((v) => v.toLowerCase() as Hex);
export const addressSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/)
  .transform((v) => v.toLowerCase() as Address);
export const unitsSchema = z.string().regex(/^(0|[1-9][0-9]{0,38})$/);
export const toolSchemas = {
  getMandate: z.strictObject({}),
  listApprovedProviders: z.strictObject({}),
  getProviderQuote: z.strictObject({ providerId: z.string().min(1).max(64) }),
  getVaultBalance: z.strictObject({}),
  getPaymentStatus: z.strictObject({}),
  requestMandatePayment: z.strictObject({
    quoteId: hashSchema,
    reason: z.string().min(1).max(500),
  }),
  inspectDelivery: z.strictObject({}),
  acceptDelivery: z.strictObject({}),
} as const;
export const toolNames = Object.keys(
  toolSchemas,
) as (keyof typeof toolSchemas)[];
export type ToolName = keyof typeof toolSchemas;
export const decisionSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("tool"),
    name: z.enum(toolNames),
    args: z.unknown(),
    summary: z.string().min(1).max(500),
  }),
  z.strictObject({
    kind: z.literal("finish"),
    summary: z.string().min(1).max(500),
  }),
]);
export type AgentDecision = z.infer<typeof decisionSchema>;
export const taskSchema = z.strictObject({
  taskHash: hashSchema,
  purchaseKey: z.string().min(1).max(100),
  instruction: z.string().min(1).max(1000),
  budget: unitsSchema.refine((v) => BigInt(v) > 0n),
});
export type AssignedTask = z.infer<typeof taskSchema>;
export const quoteSchema = z.strictObject({
  providerId: z.string().min(1).max(64),
  taskHash: hashSchema,
  token: addressSchema,
  price: unitsSchema.refine((v) => BigInt(v) > 0n),
  quoteId: hashSchema,
  expiresAt: z.number().int().safe().positive(),
  currency: z.literal("mock-USDC"),
  decimals: z.literal(6),
  commitment: hashSchema,
  description: z.string().max(2000),
});
export type Quote = z.infer<typeof quoteSchema>;
export const artifactSchema = z.strictObject({
  taskHash: hashSchema,
  quoteId: hashSchema,
  providerId: z.string().min(1).max(64),
  dataset: z.literal("weather-v1"),
  unit: z.literal("celsius"),
  rows: z
    .array(
      z.strictObject({
        city: z.string().min(1).max(100),
        temperature: z.number().finite().min(-100).max(100),
      }),
    )
    .min(2)
    .max(48),
});
export type Artifact = z.infer<typeof artifactSchema>;
export const deliverySchema = z.strictObject({
  paymentId: hashSchema,
  quoteId: hashSchema,
  artifact: artifactSchema,
});
export function artifactHash(artifact: Artifact): Hex {
  return keccak256(stringToHex(JSON.stringify(artifactSchema.parse(artifact))));
}
export function identity(...parts: string[]): Hex {
  return keccak256(stringToHex(JSON.stringify(parts)));
}
export function paymentIdentity(
  chainId: number,
  vault: Address,
  task: Hex,
  agent: Address,
  requestId: Hex,
): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "uint256" },
        { type: "address" },
        { type: "bytes32" },
        { type: "address" },
        { type: "bytes32" },
      ],
      [BigInt(chainId), vault, task, agent, requestId],
    ),
  );
}
export interface PublicMandate {
  taskHash: Hex;
  agent: Address;
  token: Address;
  cap: string;
  reserved: string;
  settled: string;
  expiry: string;
  active: boolean;
  trustedHash: Hex;
  now: number;
}
export interface ProviderInfo {
  id: string;
  name: string;
  address: Address;
}
export interface PaymentView {
  id: Hex;
  taskHash: Hex;
  requestId: Hex;
  agent: Address;
  provider: Address;
  token: Address;
  amount: string;
  status:
    "FUNDED" | "SUBMITTED" | "ACCEPTED" | "COMPLETED" | "REJECTED" | "EXPIRED";
  deliveryDeadline: number;
  reviewDeadline: number;
  challengeDeadline: number;
  expectedHash: Hex;
  deliveredHash: Hex;
}
export interface AgentContext {
  task: AssignedTask;
  observations: {
    mandate?: PublicMandate;
    providers?: ProviderInfo[];
    balance?: string;
    quotes: Quote[];
    payment?: PaymentView;
    inspected?: boolean;
    artifact?: Artifact;
    statusObserved?: boolean;
  };
}
export interface AgentModel {
  readonly mode: "mock" | "qwen" | "gemini";
  decide(context: AgentContext): Promise<AgentDecision>;
}
export type EventSource =
  "application" | "onchain" | "model" | "simulated-provider";
export interface AgentEvent {
  type: string;
  source: EventSource;
  data: Record<string, string | number | boolean>;
}
export class EventStream {
  readonly events: AgentEvent[] = [];
  private pending: Promise<void>[] = [];
  constructor(private readonly sink?: (event: AgentEvent) => unknown) {}
  async flush() {
    const writes = this.pending.splice(0);
    await Promise.all(writes);
  }
  emit(type: string, source: EventSource, data: AgentEvent["data"] = {}) {
    const event = { type, source, data };
    this.events.push(event);
    const result = this.sink?.(event);
    if (result instanceof Promise) {
      void result.catch(() => {});
      this.pending.push(result);
    }
  }
}
