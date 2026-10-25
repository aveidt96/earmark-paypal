import {
  createPublicClient,
  http,
  keccak256,
  encodeFunctionData,
  type Address,
  type Hex,
} from "viem";
import { z } from "zod";
import manifest from "../../../deployments/monad-testnet.json";
import { ownerAbi } from "./abi";
import { workspaceChain } from "./local-chain";

export const deployment = manifest;
export const paymentIdSchema = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
export const resolverClient = () =>
  createPublicClient({
    chain: workspaceChain(10143),
    transport: http(manifest.rpcUrl, { retryCount: 0, timeout: 15000 }),
  });
export type Resolution = "settlePayment" | "refundExpired";
export function eligibleResolution(
  p: {
    status: number;
    deliveryDeadline: bigint;
    reviewDeadline: bigint;
    challengeDeadline: bigint;
  },
  now: bigint,
): Resolution | null {
  if (p.status === 3 && now >= p.challengeDeadline) return "settlePayment";
  if (
    (p.status === 1 && now >= p.deliveryDeadline) ||
    (p.status === 2 && now >= p.reviewDeadline)
  )
    return "refundExpired";
  return null;
}
export const pendingResolutionSchema = z
  .object({
    paymentId: paymentIdSchema,
    action: z.enum(["settlePayment", "refundExpired"]),
    account: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
    hash: paymentIdSchema.optional(),
  })
  .strict();
export type PendingResolution = z.infer<typeof pendingResolutionSchema>;
export const resolutionStorageKey =
  "earmark-resolution:10143:" + manifest.vault.address;
export function matchingResolutionTransaction(
  p: PendingResolution,
  tx: {
    chainId?: number | undefined;
    to: Address | null;
    from: Address;
    input: Hex;
    value: bigint;
  },
) {
  return (
    tx.chainId === 10143 &&
    tx.to?.toLowerCase() === manifest.vault.address &&
    tx.from.toLowerCase() === p.account.toLowerCase() &&
    tx.value === 0n &&
    tx.input ===
      encodeFunctionData({
        abi: ownerAbi,
        functionName: p.action,
        args: [p.paymentId as Hex],
      })
  );
}
/** Independent public RPC path: requires no backend, credentials or signer keys. */
export async function verifiedResolverClient() {
  const client = resolverClient();
  if ((await client.getChainId()) !== 10143) throw Error("Wrong RPC network.");
  const [vaultCode, tokenCode, token] = await Promise.all([
    client.getCode({ address: manifest.vault.address as Address }),
    client.getCode({ address: manifest.token.address as Address }),
    client.readContract({
      address: manifest.vault.address as Address,
      abi: ownerAbi,
      functionName: "paymentToken",
    }),
  ]);
  if (
    !vaultCode ||
    !tokenCode ||
    keccak256(vaultCode) !== manifest.vault.codeHash ||
    keccak256(tokenCode) !== manifest.token.codeHash ||
    token.toLowerCase() !== manifest.token.address
  )
    throw Error("Deployed contract verification failed.");
  return client;
}
