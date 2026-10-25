import { z } from "zod";
import { isAddress, parseUnits, zeroAddress, zeroHash } from "viem";
import { mandateTaskHash, taskDescriptionSchema } from "@flint/agent/task";
export const creationSchema = z.strictObject({
  description: taskDescriptionSchema,
  salt: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  agent: z.string().refine(isAddress),
  token: z.string().refine(isAddress),
  cap: z.string().regex(/^[0-9]+(\.[0-9]+)?$/),
  providers: z.array(z.string().refine(isAddress)).min(1).max(10),
  expiry: z.number().int().safe(),
  deliveryWindow: z.number().int().min(3600).max(2592000),
  challengeWindow: z.number().int().min(3600).max(2592000),
  trustedHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
});
export type CreationInput = z.infer<typeof creationSchema>;
export function validateCreation(
  input: unknown,
  config: {
    vault: string;
    agent: string;
    token: string;
    owner: string;
    decimals: number;
    providers: string[];
    now: number;
  },
) {
  const p = creationSchema.parse(input);
  const cap = parseUnits(p.cap, config.decimals);
  if (
    cap <= 0n ||
    cap > 2n ** 128n - 1n ||
    (p.cap.split(".")[1]?.length ?? 0) > config.decimals
  )
    throw new Error("Enter a positive budget in exact token units.");
  if (
    p.agent.toLowerCase() !== config.agent.toLowerCase() ||
    p.agent.toLowerCase() === config.owner.toLowerCase() ||
    p.agent === zeroAddress ||
    p.token.toLowerCase() !== config.token.toLowerCase()
  )
    throw new Error(
      "The designated agent and approved token must match this vault.",
    );
  if (p.expiry <= config.now || p.expiry > config.now + 365 * 86400)
    throw new Error("Choose an expiry within the next year.");
  const providers = p.providers.map((p) => p.toLowerCase());
  if (
    new Set(providers).size !== providers.length ||
    providers.some(
      (p) =>
        p === zeroAddress ||
        p === config.vault.toLowerCase() ||
        !config.providers.some((a) => a.toLowerCase() === p),
    )
  )
    throw new Error("Select distinct registered providers.");
  return {
    ...p,
    capUnits: cap,
    taskHash: mandateTaskHash(config.vault, p.description, p.salt),
  };
}
export const emptyTrustedHash = zeroHash;
