import { z } from "zod";
import { addressSchema, hashSchema, unitsSchema } from "./domain.js";
export const scenarioIds = ["A", "B", "C", "D"] as const;
export const scenarioLabels = {
  A: "Normal Purchase",
  B: "Prompt Injection",
  C: "Invalid Delivery",
  D: "Budget Exhaustion",
} as const;
export const demoEventSchema = z.strictObject({
  id: z.number().int().positive(),
  observedAt: z.number().int().positive(),
  source: z.enum(["agent", "backend", "contract", "mock-provider", "fixture"]),
  name: z.string().max(120),
  text: z.string().max(4000),
});
export const demoReceiptSchema = z.strictObject({
  label: z.string().max(120),
  hash: hashSchema,
  status: z.enum(["success", "reverted"]),
  block: unitsSchema,
  timestamp: z.number().int().safe().positive(),
  reason: z.string().max(160).optional(),
});
export const demoPaymentSchema = z.strictObject({
  id: hashSchema,
  provider: addressSchema,
  amount: unitsSchema,
  status: z.enum([
    "FUNDED",
    "SUBMITTED",
    "ACCEPTED",
    "COMPLETED",
    "REJECTED",
    "EXPIRED",
  ]),
  commitment: hashSchema,
  challengeDeadline: z.number().int().safe().nonnegative(),
});
export const demoScenarioSchema = z.strictObject({
  id: z.enum(scenarioIds),
  label: z.string().max(60),
  status: z.enum(["pending", "running", "complete", "failed"]),
  task: z.string().max(1000),
  summary: z.string().max(2000),
  providerResponse: z.string().max(4000),
  backendVerdict: z.string().max(500),
  contractVerdict: z.string().max(500),
  vault: addressSchema.optional(),
  token: addressSchema.optional(),
  owner: addressSchema.optional(),
  agent: addressSchema.optional(),
  mandateId: hashSchema.optional(),
  cap: unitsSchema,
  reserved: unitsSchema,
  settled: unitsSchema,
  available: unitsSchema,
  actual: unitsSchema,
  active: z.boolean(),
  approvedProviders: z.array(addressSchema).max(8),
  payments: z.array(demoPaymentSchema).max(8),
  receipts: z.array(demoReceiptSchema).max(32),
  events: z.array(demoEventSchema).max(256),
  checks: z
    .array(
      z.strictObject({
        label: z.string().max(160),
        observed: z.string().max(300),
        passed: z.boolean(),
      }),
    )
    .max(32),
});
export const demoSuiteSchema = z.strictObject({
  version: z.literal(1),
  runId: z.string().uuid(),
  chainId: z.literal(31337),
  mode: z.literal("mock"),
  environment: z.literal("Local Anvil / mock USDC / simulated providers"),
  startedAt: z.number().int().positive(),
  updatedAt: z.number().int().positive(),
  status: z.enum(["running", "complete", "failed"]),
  genesisHash: hashSchema,
  clockDisclosure: z.string().max(1000),
  scenarios: z.array(demoScenarioSchema).length(4),
});
export type DemoScenario = z.infer<typeof demoScenarioSchema>;
export type DemoSuite = z.infer<typeof demoSuiteSchema>;
