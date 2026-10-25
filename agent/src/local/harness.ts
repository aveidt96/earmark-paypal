import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  createPublicClient,
  createTestClient,
  createWalletClient,
  http,
  keccak256,
  zeroHash,
  type Abi,
  type Hex,
  type Address,
  type PublicClient,
  type TestClient,
  type WalletClient,
  type HttpTransport,
  type TransactionReceipt,
} from "viem";
import {
  generatePrivateKey,
  privateKeyToAccount,
  type PrivateKeyAccount,
} from "viem/accounts";
import { anvil } from "viem/chains";
import {
  EventStream,
  identity,
  type AgentModel,
  type AssignedTask,
  type PaymentView,
  type ProviderInfo,
} from "../domain.js";
import { AgentError } from "../errors.js";
import { parseRuntimeConfig } from "../runtime-config.js";
import { VaultChain } from "../chain.js";
import { MockModel } from "../models.js";
import { AgentTools } from "../tools.js";
import { runAgent } from "../runner.js";
import { SimulatedProvider, type ServiceProvider } from "../providers.js";
import { IntentStore } from "../store.js";
const root = fileURLToPath(new URL("../../../", import.meta.url));
function artifact(name: string) {
  const value = JSON.parse(
    readFileSync(
      join(root, "contracts", "out", `${name}.sol`, `${name}.json`),
      "utf8",
    ),
  ) as { abi: Abi; bytecode: { object: Hex } };
  if (!value.bytecode.object.startsWith("0x"))
    throw new AgentError("MISSING_COMPILED_CONTRACT");
  return value;
}
async function freePort() {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new AgentError("LOCAL_PORT_FAILURE");
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return address.port;
}
export interface LocalNode {
  rpcUrl: string;
  publicClient: PublicClient<HttpTransport, typeof anvil>;
  testClient: TestClient<"anvil", HttpTransport, typeof anvil>;
  close: () => Promise<void>;
}
type LocalWallet = WalletClient<HttpTransport, typeof anvil, PrivateKeyAccount>;
interface ContractArtifact {
  abi: Abi;
  bytecode: { object: Hex };
}
export interface LocalFixture {
  task: AssignedTask;
  chain: VaultChain;
  makeTools: (providers?: ServiceProvider[], task?: AssignedTask) => AgentTools;
  run: (
    model?: AgentModel,
    providers?: ServiceProvider[],
    task?: AssignedTask,
  ) => ReturnType<typeof runAgent>;
  settle: (id: Hex) => Promise<{ hash: Hex; payment: PaymentView }>;
  storePath: string;
  events: EventStream;
  providers: SimulatedProvider[];
  infos: ProviderInfo[];
  ownerWallet: LocalWallet;
  observerWallet: LocalWallet;
  token: Address;
  vault: Address;
  tokenArtifact: ContractArtifact;
  vaultArtifact: ContractArtifact;
  wait: (hash: Hex) => Promise<TransactionReceipt>;
  submit: (id: Hex, commitment: Hex, providerId: string) => Promise<void>;
}
export async function startAnvil(): Promise<LocalNode> {
  const port = await freePort();
  const release = JSON.parse(
    readFileSync(join(root, "scripts/foundry-release.json"), "utf8"),
  ) as { version: string };
  const executable = join(
    root,
    ".tools",
    `foundry-${release.version}-${process.platform}-${process.arch}`,
    process.platform === "win32" ? "anvil.exe" : "anvil",
  );
  const child = spawn(
    executable,
    [
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--chain-id",
      "31337",
      "--hardfork",
      "cancun",
      "--accounts",
      "0",
      "--silent",
    ],
    { stdio: "ignore", windowsHide: true },
  );
  let failed = false;
  child.on("error", () => {
    failed = true;
  });
  child.on("exit", () => {
    failed = true;
  });
  const rpcUrl = `http://127.0.0.1:${port}`;
  const transport = http(rpcUrl, { retryCount: 0, timeout: 500 });
  const publicClient = createPublicClient({ chain: anvil, transport });
  const testClient = createTestClient({
    chain: anvil,
    transport,
    mode: "anvil",
  });
  const close = async () => {
    if (!failed) {
      await new Promise<void>((resolve) => {
        child.once("exit", () => resolve());
        child.kill();
      });
    }
  };
  try {
    const deadline = Date.now() + 20000;
    for (;;) {
      if (failed || Date.now() > deadline)
        throw new AgentError("ANVIL_START_FAILED");
      try {
        if ((await publicClient.getChainId()) === 31337 && !failed) break;
      } catch {
        /* bounded loopback readiness only */
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  } catch (error) {
    await close();
    throw error;
  }
  return { rpcUrl, publicClient, testClient, close };
}

export interface FixtureOptions {
  cap?: bigint;
  deposit?: bigint;
  expirySeconds?: number;
  revoked?: boolean;
  approved?: string[];
  events?: EventStream;
  storePath?: string;
}
/** Test/demo owner and provider actors. Never passed into model context or model tools. */
export async function createFixture(
  node: LocalNode,
  options: FixtureOptions = {},
): Promise<LocalFixture> {
  const events = options.events ?? new EventStream();
  const owner = privateKeyToAccount(generatePrivateKey());
  const agentKey = generatePrivateKey();
  const agent = privateKeyToAccount(agentKey);
  const providerAccounts = [
    privateKeyToAccount(generatePrivateKey()),
    privateKeyToAccount(generatePrivateKey()),
  ];
  const observer = privateKeyToAccount(generatePrivateKey());
  for (const account of [owner, agent, ...providerAccounts, observer])
    await node.testClient.setBalance({
      address: account.address,
      value: 10n ** 20n,
    });
  const wallet = (account: PrivateKeyAccount): LocalWallet =>
    createWalletClient({
      chain: anvil,
      transport: http(node.rpcUrl, { retryCount: 0, timeout: 10000 }),
      account,
    });
  const ownerWallet = wallet(owner);
  const observerWallet = wallet(observer);
  const providerWallets = providerAccounts.map(wallet);
  const tokenArtifact = artifact("MockUSDC");
  const vaultArtifact = artifact("TaskVault");
  const wait = async (hash: Hex) => {
    const receipt = await node.publicClient.waitForTransactionReceipt({
      hash,
      timeout: 10000,
      pollingInterval: 20,
    });
    if (receipt.status !== "success")
      throw new AgentError("LOCAL_FIXTURE_TRANSACTION_REVERTED");
    return receipt;
  };
  const tokenReceipt = await wait(
    await ownerWallet.deployContract({
      abi: tokenArtifact.abi,
      bytecode: tokenArtifact.bytecode.object,
    }),
  );
  const token = tokenReceipt.contractAddress;
  if (!token) throw new AgentError("LOCAL_TOKEN_MISSING");
  const vaultReceipt = await wait(
    await ownerWallet.deployContract({
      abi: vaultArtifact.abi,
      bytecode: vaultArtifact.bytecode.object,
      args: [owner.address, token],
    }),
  );
  const vault = vaultReceipt.contractAddress;
  if (!vault) throw new AgentError("LOCAL_VAULT_MISSING");
  const code = await node.publicClient.getCode({ address: vault });
  if (!code) throw new AgentError("LOCAL_VAULT_MISSING");
  const config = parseRuntimeConfig({
    AGENT_CHAIN_ID: "31337",
    AGENT_RPC_URL: node.rpcUrl,
    TASK_VAULT_ADDRESS: vault,
    AGENT_EXPECTED_VAULT_ADDRESS: vault,
    AGENT_PAYMENT_TOKEN: token,
    AGENT_VAULT_CODE_HASH: keccak256(code),
    AGENT_PRIVATE_KEY: agentKey,
  });
  const chain = new VaultChain(config);
  const now = await chain.now();
  const task: AssignedTask = {
    taskHash: identity("owner-weather-task", vault),
    purchaseKey: "weather-purchase-001",
    instruction:
      "Purchase a weather dataset from an approved provider for no more than 10 USDC.",
    budget: "10000000",
  };
  const infos = [
    { id: "datahub", name: "DataHub", address: providerAccounts[0]?.address },
    {
      id: "weatherco",
      name: "WeatherCo",
      address: providerAccounts[1]?.address,
    },
  ].map((info) => {
    if (!info.address) throw new AgentError("LOCAL_PROVIDER_MISSING");
    return { ...info, address: info.address as Address };
  });
  await wait(
    await ownerWallet.writeContract({
      address: token,
      abi: tokenArtifact.abi,
      functionName: "mint",
      args: [owner.address, 100n * 10n ** 6n],
    }),
  );
  await wait(
    await ownerWallet.writeContract({
      address: token,
      abi: tokenArtifact.abi,
      functionName: "approve",
      args: [vault, 100n * 10n ** 6n],
    }),
  );
  const deposit = options.deposit ?? 20_000_000n;
  if (deposit > 0n)
    await wait(
      await ownerWallet.writeContract({
        address: vault,
        abi: vaultArtifact.abi,
        functionName: "deposit",
        args: [token, deposit],
      }),
    );
  await wait(
    await ownerWallet.writeContract({
      address: vault,
      abi: vaultArtifact.abi,
      functionName: "createMandate",
      args: [
        task.taskHash,
        agent.address,
        token,
        options.cap ?? 10_000_000n,
        BigInt(now + (options.expirySeconds ?? 86400)),
        infos
          .filter(
            (info) => !options.approved || options.approved.includes(info.id),
          )
          .map((info) => info.address),
        {
          deliveryWindow: 3600n,
          challengeWindow: 3600n,
          trustedDeliverableHash: zeroHash,
        },
      ],
    }),
  );
  if (options.revoked)
    await wait(
      await ownerWallet.writeContract({
        address: vault,
        abi: vaultArtifact.abi,
        functionName: "revokeMandate",
        args: [task.taskHash],
      }),
    );
  const submit = async (
    paymentId: Hex,
    commitment: Hex,
    providerId: string,
  ) => {
    const index = infos.findIndex((info) => info.id === providerId);
    const provider = providerWallets[index];
    if (!provider) throw new AgentError("LOCAL_PROVIDER_MISSING");
    const payment = await chain.payment(paymentId);
    if (
      !payment ||
      payment.provider.toLowerCase() !== provider.account.address.toLowerCase()
    )
      throw new AgentError("PROVIDER_PAYMENT_MISMATCH");
    if (payment.status === "SUBMITTED" && payment.deliveredHash === commitment)
      return;
    const hash = await provider.writeContract({
      address: vault,
      abi: vaultArtifact.abi,
      functionName: "submitDelivery",
      args: [paymentId, commitment],
    });
    await wait(hash);
    events.emit("provider.delivery.submitted", "onchain", {
      paymentId,
      transactionHash: hash,
      providerId,
    });
  };
  const providers = infos.map(
    (info, i) =>
      new SimulatedProvider(info, i === 0 ? "6000000" : "8000000", (id, hash) =>
        submit(id, hash, info.id),
      ),
  );
  const storePath =
    options.storePath ??
    join(root, ".tools", "stage-5-state", `${randomUUID()}.json`);
  const makeTools = (
    providerList: ServiceProvider[] = providers,
    assigned: AssignedTask = task,
  ) =>
    new AgentTools(
      assigned,
      chain,
      new IntentStore(storePath),
      providerList,
      events,
    );
  const run = (
    model: AgentModel = new MockModel(),
    providerList: ServiceProvider[] = providers,
    assigned: AssignedTask = task,
  ) => runAgent(model, makeTools(providerList, assigned), chain);
  const settle = async (id: Hex) => {
    const p = await chain.payment(id);
    if (p?.status !== "ACCEPTED") throw new AgentError("LOCAL_NOT_ACCEPTED");
    await node.testClient.setNextBlockTimestamp({
      timestamp: BigInt(p.challengeDeadline),
    });
    await node.testClient.mine({ blocks: 1 });
    events.emit("simulation.time.advanced", "application", {
      seconds: 3600,
      reason:
        "Local harness reaches the full configured challenge deadline; agent has no clock control.",
    });
    const hash = await observerWallet.writeContract({
      address: vault,
      abi: vaultArtifact.abi,
      functionName: "settlePayment",
      args: [id],
    });
    await wait(hash);
    events.emit("observer.settlement.confirmed", "onchain", {
      paymentId: id,
      transactionHash: hash,
    });
    const final = await chain.payment(id);
    if (!final) throw new AgentError("LOCAL_PAYMENT_MISSING");
    makeTools().observe(final);
    return { hash, payment: final };
  };
  return {
    task,
    chain,
    makeTools,
    run,
    settle,
    storePath,
    events,
    providers,
    infos,
    ownerWallet,
    observerWallet,
    token,
    vault,
    tokenArtifact,
    vaultArtifact,
    wait,
    submit,
  };
}

export { artifact as readLocalArtifact };
