import { z } from "zod";

const configSchema = z.object({
  MONAD_TESTNET_RPC_URL: z.url().default("https://testnet-rpc.monad.xyz"),
  AI_BASE_URL: z.url().optional(),
  AI_MODEL: z.string().trim().min(1).default("qwen-plus"),
  GEMINI_MODEL: z.string().trim().min(1).default("gemini-3.8-flash"),
  EARMARK_GEMINI_ENABLED: z.enum(["true", "false"]).default("false"),
});

/** Validate non-secret settings explicitly; no environment reads or I/O at import time. */
export function parseAgentConfig(env: Record<string, string | undefined>) {
  const result = configSchema.safeParse({
    MONAD_TESTNET_RPC_URL: env.MONAD_TESTNET_RPC_URL,
    AI_BASE_URL: env.AI_BASE_URL || undefined,
    AI_MODEL: env.AI_MODEL,
    GEMINI_MODEL: env.GEMINI_MODEL,
    EARMARK_GEMINI_ENABLED: env.EARMARK_GEMINI_ENABLED,
  });

  if (!result.success) {
    const fields = result.error.issues.map((issue) => issue.path.join("."));
    throw new Error(`Invalid agent configuration fields: ${fields.join(", ")}`);
  }

  return result.data;
}
