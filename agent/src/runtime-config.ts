import { z } from "zod";
import type { Chain } from "viem";
import { addressSchema, hashSchema } from "./domain.js";
import { AgentError } from "./errors.js";
import { anvil, monadTestnet } from "viem/chains";
export function runtimeChain(id: 31337 | 10143): Chain {
  return id === 10143 ? monadTestnet : anvil;
}
const schema = z.object({
  AGENT_CHAIN_ID: z.enum(["31337", "10143"]),
  AGENT_ENABLE_TESTNET: z.literal("true").optional(),
  AGENT_RPC_URL: z.url(),
  TASK_VAULT_ADDRESS: addressSchema,
  AGENT_EXPECTED_VAULT_ADDRESS: addressSchema,
  AGENT_PAYMENT_TOKEN: addressSchema,
  AGENT_VAULT_CODE_HASH: hashSchema,
  AGENT_TOKEN_CODE_HASH: hashSchema.optional(),
  AGENT_PRIVATE_KEY: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
});
/** Server only: mainnet forbidden; testnet requires explicit opt-in and pinned token/vault code. */
export function parseRuntimeConfig(env: Record<string, string | undefined>) {
  const result = schema.safeParse(env);
  if (!result.success) throw new AgentError("INVALID_RUNTIME_CONFIGURATION");
  const c = result.data,
    u = new URL(c.AGENT_RPC_URL);
  const common =
    !u.username && !u.password && !u.search && !u.hash && u.pathname === "/";
  const allowed =
    c.AGENT_CHAIN_ID === "31337"
      ? u.protocol === "http:" &&
        ["127.0.0.1", "localhost", "[::1]"].includes(u.hostname)
      : c.AGENT_ENABLE_TESTNET === "true" &&
        !!c.AGENT_TOKEN_CODE_HASH &&
        u.protocol === "https:" &&
        u.hostname === "testnet-rpc.monad.xyz" &&
        !u.port;
  if (!common || !allowed)
    throw new AgentError("INVALID_RUNTIME_CONFIGURATION");
  if (c.TASK_VAULT_ADDRESS !== c.AGENT_EXPECTED_VAULT_ADDRESS)
    throw new AgentError("UNEXPECTED_VAULT_ADDRESS");
  return c;
}
export type RuntimeConfig = ReturnType<typeof parseRuntimeConfig>;
