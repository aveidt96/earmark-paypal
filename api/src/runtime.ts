import {
  createPublicClient,
  createWalletClient,
  http,
  encodeFunctionData,
  keccak256,
  type Hex,
  TransactionReceiptNotFoundError,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { z } from "zod";
import {
  parseRuntimeConfig,
  runtimeChain,
  VaultChain,
  createModel,
  SimulatedProvider,
  createDatabase,
  migrateDatabase,
  bindTestnetDatabase,
  PostgresIntentStore,
  type Pool,
} from "@flint/agent/server";
import { WorkspaceService } from "../../web/src/server/service";
import { PostgresWorkspaceStore } from "../../web/src/server/postgres-store";
import { ownerAbi } from "../../web/src/lib/abi";

/** No signing configuration is ever returned to the browser. */
export async function createHostedService(
  env: Record<string, string | undefined>,
) {
  const config = parseRuntimeConfig(env);
  if (config.AGENT_CHAIN_ID !== "10143")
    throw new Error("HOSTED_SERVICE_REQUIRES_MONAD_TESTNET");
  const origin = z.url().parse(env.FLINT_WEB_ORIGIN);
  const u = new URL(origin);
  if (
    u.protocol !== "https:" ||
    u.origin !== origin ||
    !u.hostname.endsWith(".vercel.app")
  )
    throw new Error("EXACT_FRONTEND_ORIGIN_REQUIRED");
  const fromBlock = z
    .string()
    .regex(/^[0-9]+$/)
    .parse(env.FLINT_DEPLOYMENT_BLOCK);
  if (env.EARMARK_DATABASE_ENVIRONMENT !== "earmark-testnet")
    throw new Error("TESTNET_DATABASE_ENVIRONMENT_REQUIRED");
  const databaseUrl = env.DATABASE_URL_UNPOOLED ?? env.DATABASE_URL;
  if (
    !databaseUrl ||
    new URL(databaseUrl).hostname !==
      "ep-restless-leaf-babqdcr8.c-8.eu-central-1.aws.neon.tech"
  )
    throw new Error("APPROVED_PRODUCTION_DATABASE_REQUIRED");
  const pool = createDatabase(
    z
      .string()
      .min(1)
      .parse(env.DATABASE_URL_UNPOOLED ?? env.DATABASE_URL),
  );
  const chain = new VaultChain(config, 60000);
  const scope = "10143:" + chain.vault.toLowerCase();
  try {
    await migrateDatabase(pool);
    await bindTestnetDatabase(pool);
    await chain.verify();
    const network = runtimeChain(10143);
    const client = createPublicClient({
      chain: network,
      transport: http(config.AGENT_RPC_URL, {
        retryCount: 0,
        timeout: 15000,
        fetchOptions: { redirect: "error" },
      }),
    });
    const keys = ["SIM_DATAHUB_PRIVATE_KEY", "SIM_WEATHERCO_PRIVATE_KEY"].map(
      (name) =>
        privateKeyToAccount(
          z
            .string()
            .regex(/^0x[0-9a-fA-F]{64}$/)
            .parse(env[name]) as Hex,
        ),
    );
    const infos = keys.map((a, i) => ({
      id: i === 0 ? "datahub" : "weatherco",
      name: i === 0 ? "DataHub" : "WeatherCo",
      address: a.address,
    }));
    const owner = await client.readContract({
      address: chain.vault,
      abi: ownerAbi,
      functionName: "owner",
    });
    if (
      new Set(
        [owner, chain.agent, ...infos.map((p) => p.address)].map((a) =>
          a.toLowerCase(),
        ),
      ).size !== 4
    )
      throw new Error("SIGNER_ROLES_MUST_DIFFER");
    const providers = infos.map(
      (info, i) =>
        new SimulatedProvider(
          info,
          i === 0 ? "6000000" : "8000000",
          async (paymentId, commitment) => {
            const account = keys[i];
            if (!account) throw new Error("INVALID_PROVIDER_CONFIGURATION");
            const payment = await chain.payment(paymentId);
            if (
              !payment ||
              payment.provider.toLowerCase() !== info.address.toLowerCase()
            )
              throw new Error("PROVIDER_PAYMENT_MISMATCH");
            if (payment.status !== "FUNDED") {
              if (
                ["SUBMITTED", "ACCEPTED", "COMPLETED"].includes(
                  payment.status,
                ) &&
                payment.deliveredHash === commitment
              )
                return;
              throw new Error("PROVIDER_PAYMENT_STATE_MISMATCH");
            }
            const prior = await pool.query<{
              tx_hash: Hex;
              commitment: Hex;
              recipient: string;
            }>(
              "SELECT tx_hash,commitment,recipient FROM earmark_provider_calls WHERE scope=$1 AND payment_id=$2",
              [scope, paymentId],
            );
            const saved = prior.rows[0];
            let hash: Hex;
            if (saved) {
              if (
                saved.commitment !== commitment ||
                saved.recipient !== info.address.toLowerCase()
              )
                throw new Error("PROVIDER_SUBMISSION_TERMS_IMMUTABLE");
              hash = saved.tx_hash;
            } else {
              await client.simulateContract({
                address: chain.vault,
                abi: ownerAbi,
                functionName: "submitDelivery",
                args: [paymentId, commitment],
                account,
              });
              const wallet = createWalletClient({
                chain: network,
                account,
                transport: http(config.AGENT_RPC_URL, {
                  retryCount: 0,
                  timeout: 15000,
                }),
              });
              const prepared = await wallet.prepareTransactionRequest({
                to: chain.vault,
                data: encodeFunctionData({
                  abi: ownerAbi,
                  functionName: "submitDelivery",
                  args: [paymentId, commitment],
                }),
              });
              const serialized = await wallet.signTransaction(prepared);
              hash = keccak256(serialized);
              // Immutable transaction identity committed BEFORE sending to an external RPC.
              await pool.query(
                "INSERT INTO earmark_provider_calls(scope,payment_id,commitment,recipient,tx_hash,nonce,state) VALUES($1,$2,$3,$4,$5,$6,'prepared')",
                [
                  scope,
                  paymentId,
                  commitment,
                  info.address.toLowerCase(),
                  hash,
                  prepared.nonce,
                ],
              );
              try {
                const sent = await client.sendRawTransaction({
                  serializedTransaction: serialized,
                });
                if (sent !== hash)
                  throw new Error("UNEXPECTED_RPC_TRANSACTION_HASH");
                await pool.query(
                  "UPDATE earmark_provider_calls SET state='submitted',updated_at=now() WHERE scope=$1 AND payment_id=$2",
                  [scope, paymentId],
                );
              } catch {
                await pool.query(
                  "UPDATE earmark_provider_calls SET state='uncertain',updated_at=now() WHERE scope=$1 AND payment_id=$2",
                  [scope, paymentId],
                );
                throw new Error("UNCERTAIN_PROVIDER_TRANSACTION");
              }
            }
            try {
              const receipt = saved
                ? await client.getTransactionReceipt({ hash })
                : await client.waitForTransactionReceipt({
                    hash,
                    confirmations: 2,
                    timeout: 45000,
                    pollingInterval: 1000,
                  });
              if (
                receipt.to?.toLowerCase() !== chain.vault.toLowerCase() ||
                receipt.from.toLowerCase() !== info.address.toLowerCase()
              )
                throw new Error("PROVIDER_RECEIPT_MISMATCH");
              await pool.query(
                "UPDATE earmark_provider_calls SET state=$3,updated_at=now() WHERE scope=$1 AND payment_id=$2",
                [
                  scope,
                  paymentId,
                  receipt.status === "success" ? "confirmed" : "reverted",
                ],
              );
              if (receipt.status !== "success")
                throw new Error("PROVIDER_SUBMISSION_REVERTED");
              const delivered = await chain.payment(paymentId);
              if (
                delivered?.deliveredHash !== commitment ||
                delivered.status !== "SUBMITTED"
              )
                throw new Error("PROVIDER_DELIVERY_NOT_CONFIRMED");
            } catch (error) {
              if (error instanceof TransactionReceiptNotFoundError)
                throw new Error("UNCERTAIN_PROVIDER_TRANSACTION");
              throw error;
            }
          },
        ),
    );
    const service = new WorkspaceService({
      gemini: { env },
      config: {
        chainId: 10143,
        network: "Monad Testnet",
        rpcUrl: config.AGENT_RPC_URL,
        vault: chain.vault,
        token: chain.token,
        agent: chain.agent,
        providers: infos,
      },
      chain,
      model: createModel(env),
      providers,
      statePath: "unused-postgres",
      journalPath: "unused-postgres",
      fromBlock: BigInt(fromBlock),
      providerTimeoutMs: 60000,
      storeFactory: (initial) =>
        new PostgresWorkspaceStore(pool, scope, initial),
      geminiStoreFactory: (initial) =>
        new PostgresWorkspaceStore(pool, scope + ":gemini-readonly", initial),
      journalFactory: (runId, mandateId) =>
        new PostgresIntentStore(pool, scope + ":" + chain.agent.toLowerCase(), {
          runId,
          mandateId,
          providers: infos,
        }),
    });
    return { service, pool, origin };
  } catch {
    await pool.end();
    throw new Error("HOSTED_CONFIGURATION_OR_READINESS_FAILED");
  }
}
export type HostedService = Awaited<ReturnType<typeof createHostedService>>;
export async function databaseReady(pool: Pool) {
  await pool.query("SELECT 1");
}
