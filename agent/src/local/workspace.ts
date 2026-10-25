import {
  generatePrivateKey,
  privateKeyToAccount,
  type PrivateKeyAccount,
} from "viem/accounts";
import {
  createWalletClient,
  http,
  keccak256,
  type Hex,
  type Address,
  type WalletClient,
  type HttpTransport,
  type TransactionReceipt,
} from "viem";
import { anvil } from "viem/chains";
import { startAnvil, readLocalArtifact, type LocalNode } from "./harness.js";
/** Fresh local chain: no vault deposit or mandate is performed by the fixture. */
export interface LocalWorkspace {
  node: LocalNode;
  ownerWallet: WalletClient<HttpTransport, typeof anvil, PrivateKeyAccount>;
  ownerKey: Hex | undefined;
  agentAddress: Address;
  providers: { id: string; name: string; address: Address }[];
  token: Address;
  vault: Address;
  serverEnv: Record<string, string | undefined>;
  wait: (hash: Hex) => Promise<TransactionReceipt>;
  close: () => Promise<void>;
}
export async function startLocalWorkspace(): Promise<LocalWorkspace> {
  const node = await startAnvil();
  try {
    const keys = Array.from({ length: 4 }, () => generatePrivateKey());
    const accounts = keys.map((key) => privateKeyToAccount(key));
    const [owner, agent, datahub, weatherco] = accounts;
    if (!owner || !agent || !datahub || !weatherco)
      throw new Error("LOCAL_ROLE_MISSING");
    for (const account of accounts)
      await node.testClient.setBalance({
        address: account.address,
        value: 10n ** 20n,
      });
    const ownerWallet = createWalletClient({
      chain: anvil,
      transport: http(node.rpcUrl, { retryCount: 0 }),
      account: owner,
    });
    const wait = async (hash: Hex) => {
      const r = await node.publicClient.waitForTransactionReceipt({
        hash,
        timeout: 10000,
        pollingInterval: 20,
      });
      if (r.status !== "success") throw new Error("LOCAL_BOOTSTRAP_REVERTED");
      return r;
    };
    const tokenArtifact = readLocalArtifact("MockUSDC"),
      vaultArtifact = readLocalArtifact("TaskVault");
    const token = (
      await wait(
        await ownerWallet.deployContract({
          abi: tokenArtifact.abi,
          bytecode: tokenArtifact.bytecode.object,
        }),
      )
    ).contractAddress;
    if (!token) throw new Error("LOCAL_TOKEN_MISSING");
    const deployment = await wait(
      await ownerWallet.deployContract({
        abi: vaultArtifact.abi,
        bytecode: vaultArtifact.bytecode.object,
        args: [owner.address, token],
      }),
    );
    const vault = deployment.contractAddress;
    if (!vault) throw new Error("LOCAL_VAULT_MISSING");
    await wait(
      await ownerWallet.writeContract({
        address: token,
        abi: tokenArtifact.abi,
        functionName: "mint",
        args: [owner.address, 100_000_000n],
      }),
    );
    const code = await node.publicClient.getCode({ address: vault });
    if (!code) throw new Error("LOCAL_CODE_MISSING");
    const serverEnv = {
      AGENT_CHAIN_ID: "31337",
      AGENT_RPC_URL: node.rpcUrl,
      TASK_VAULT_ADDRESS: vault,
      AGENT_EXPECTED_VAULT_ADDRESS: vault,
      AGENT_PAYMENT_TOKEN: token,
      AGENT_VAULT_CODE_HASH: keccak256(code),
      AGENT_PRIVATE_KEY: keys[1],
      SIM_DATAHUB_PRIVATE_KEY: keys[2],
      SIM_WEATHERCO_PRIVATE_KEY: keys[3],
      AGENT_MODEL_MODE: "mock",
      AI_ENABLE_NETWORK: "false",
      FLINT_DEPLOYMENT_BLOCK: String(deployment.blockNumber),
    };
    await node.testClient.setIntervalMining({ interval: 5 });
    return {
      node,
      ownerWallet,
      ownerKey: keys[0],
      agentAddress: agent.address,
      providers: [
        { id: "datahub", name: "DataHub", address: datahub.address },
        { id: "weatherco", name: "WeatherCo", address: weatherco.address },
      ],
      token,
      vault,
      serverEnv,
      wait,
      close: node.close,
    };
  } catch (e) {
    await node.close();
    throw e;
  }
}
