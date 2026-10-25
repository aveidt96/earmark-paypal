import { defineChain, type Chain } from "viem";
import { monadTestnet } from "viem/chains";
/** Actual development network; Monad metadata remains in network.ts for later deployment. */
export const localAnvil = defineChain({
  id: 31337,
  name: "Local Anvil",
  nativeCurrency: { name: "Local gas", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } },
  testnet: true,
});

export function workspaceChain(id: 31337 | 10143): Chain {
  return id === 10143 ? monadTestnet : localAnvil;
}
