import "server-only";
import { isAbsolute, join } from "node:path";
import { z } from "zod";
import { createPublicClient, createWalletClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { localAnvil as anvil } from "../lib/local-chain";
import {
  parseRuntimeConfig,
  VaultChain,
  createModel,
  isGeminiEnabled,
  SimulatedProvider,
} from "@flint/agent/server";
import { ownerAbi } from "../lib/abi";
import { WorkspaceService } from "./service";
import type { WorkspaceSnapshot } from "../lib/model";
const globalService = globalThis as typeof globalThis & {
  flintWorkspace?: WorkspaceService;
};
export function getService() {
  if (globalService.flintWorkspace) return globalService.flintWorkspace;
  if (!process.env.TASK_VAULT_ADDRESS)
    throw new Error("WORKSPACE_NOT_CONFIGURED");
  const config = parseRuntimeConfig(process.env);
  const chain = new VaultChain(config);
  const key = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
  const providerAccounts = [
    "SIM_DATAHUB_PRIVATE_KEY",
    "SIM_WEATHERCO_PRIVATE_KEY",
  ].map((name) => {
    try {
      return privateKeyToAccount(key.parse(process.env[name]) as Hex);
    } catch {
      throw new Error("INVALID_PROVIDER_CONFIGURATION");
    }
  });
  const infos = providerAccounts.map((a, i) => ({
    id: i === 0 ? "datahub" : "weatherco",
    name: i === 0 ? "DataHub" : "WeatherCo",
    address: a.address,
  }));
  if (
    new Set([
      chain.agent.toLowerCase(),
      ...infos.map((i) => i.address.toLowerCase()),
    ]).size !== 3
  )
    throw new Error("DEVELOPMENT_ROLES_MUST_DIFFER");
  const client = createPublicClient({
    chain: anvil,
    transport: http(config.AGENT_RPC_URL, { retryCount: 0, timeout: 10000 }),
  });
  const providers = infos.map(
    (info, i) =>
      new SimulatedProvider(
        info,
        i === 0 ? "6000000" : "8000000",
        async (id, hash) => {
          const account = providerAccounts[i];
          if (!account) throw new Error("INVALID_PROVIDER_CONFIGURATION");
          const p = await chain.payment(id);
          if (!p || p.provider.toLowerCase() !== info.address.toLowerCase())
            throw new Error("PROVIDER_PAYMENT_MISMATCH");
          if (p.status === "SUBMITTED" && p.deliveredHash === hash) return;
          const wallet = createWalletClient({
            chain: anvil,
            transport: http(config.AGENT_RPC_URL, {
              retryCount: 0,
              timeout: 10000,
            }),
            account,
          });
          const tx = await wallet.writeContract({
            address: chain.vault,
            abi: ownerAbi,
            functionName: "submitDelivery",
            args: [id, hash],
          });
          const receipt = await client.waitForTransactionReceipt({
            hash: tx,
            timeout: 10000,
          });
          if (receipt.status !== "success")
            throw new Error("PROVIDER_SUBMISSION_REVERTED");
        },
      ),
  );
  const stateDir = process.env.FLINT_STATE_DIR;
  if (!stateDir || !isAbsolute(stateDir))
    throw new Error("ABSOLUTE_STATE_DIRECTORY_REQUIRED");
  const fromBlock = z
    .string()
    .regex(/^[0-9]+$/)
    .parse(process.env.FLINT_DEPLOYMENT_BLOCK ?? "0");
  const model = createModel(process.env);
  globalService.flintWorkspace = new WorkspaceService({
    gemini: { env: process.env },
    config: {
      chainId: 31337,
      network: "Local Anvil",
      rpcUrl: config.AGENT_RPC_URL,
      vault: chain.vault,
      token: chain.token,
      agent: chain.agent,
      providers: infos,
    },
    chain,
    model,
    providers,
    statePath: join(stateDir, "workspace.json"),
    journalPath: join(stateDir, "purchases.json"),
    fromBlock: BigInt(fromBlock),
    providerTimeoutMs: 30000,
  });
  return globalService.flintWorkspace;
}
/** Snapshot model identity mirrors the authoritative provider selection. */
function snapshotModel(
  env: Record<string, string | undefined>,
): "mock" | "qwen" | "gemini" {
  const provider = env.AGENT_MODEL_PROVIDER || env.AGENT_MODEL_MODE || "mock";
  if (provider === "gemini" && isGeminiEnabled(env)) return "gemini";
  if (provider === "qwen") return "qwen";
  return "mock";
}
export async function getSnapshot(): Promise<WorkspaceSnapshot> {
  try {
    return await getService().snapshot();
  } catch (error) {
    const code =
      error instanceof Error && /^[A-Z0-9_]+$/.test(error.message)
        ? error.message
        : "RPC_UNAVAILABLE";
    return {
      configured: false,
      chainTime: 0,
      model: snapshotModel(process.env),
      geminiAvailable: false,
      mandates: [],
      payments: [],
      runs: [],
      events: [],
      error: code,
    };
  }
}
export function assertOrigin(request: Request) {
  const expected = process.env.FLINT_WEB_ORIGIN ?? "http://127.0.0.1:3000";
  if (request.headers.get("origin") !== expected)
    throw new Error("UNTRUSTED_REQUEST_ORIGIN");
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new Error("JSON_REQUIRED");
}
export async function readBody(request: Request) {
  assertOrigin(request);
  if (Number(request.headers.get("content-length") ?? 0) > 16000)
    throw new Error("REQUEST_TOO_LARGE");
  const body = await request.text();
  if (body.length > 16000) throw new Error("REQUEST_TOO_LARGE");
  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new Error("INVALID_REQUEST_JSON");
  }
}
