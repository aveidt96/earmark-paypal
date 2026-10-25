import { monadTestnet } from "viem/chains";

export const protocolChain = monadTestnet;

export function validateChainId(value: string | undefined): number {
  if (value !== undefined && value !== String(protocolChain.id)) {
    throw new Error("Earmark supports Monad Testnet (10143) only.");
  }
  return protocolChain.id;
}
