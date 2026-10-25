import {
  createPublicClient,
  BaseError,
  UserRejectedRequestError,
  SwitchChainError,
  createWalletClient,
  custom,
  http,
  formatEther,
  type EIP1193Provider,
  type Abi,
  type Hex,
  type Address,
} from "viem";
import { monadTestnet } from "viem/chains";
declare global {
  interface Window {
    ethereum?: EIP1193Provider;
  }
}
interface Config {
  owner: Address;
  contracts: Record<string, { abi: Abi; bytecode: Hex }>;
  sourceCommit: string;
  confirmedTokenTransaction?: Hex;
}
const output = document.querySelector("pre");
if (!output) throw Error("DEPLOYMENT_VIEW_MISSING");
const show = (value: unknown) => {
  output.textContent =
    typeof value === "string" ? value : JSON.stringify(value, null, 2);
};
const client = createPublicClient({
  chain: monadTestnet,
  transport: http("https://testnet-rpc.monad.xyz", {
    retryCount: 0,
    timeout: 15000,
  }),
});
const key = "earmark-testnet-deployment-v1";
interface DeploymentState {
  token?: Hex;
  vault?: Hex;
  tokenPending?: boolean;
  vaultPending?: boolean;
}
function saved(): DeploymentState {
  return JSON.parse(localStorage.getItem(key) ?? "{}");
}
async function run(name: "token" | "vault" | "verify" | "network") {
  const config = (await (await fetch("/config")).json()) as Config;
  if (!window.ethereum)
    throw Error("Open this page in a browser with MetaMask or Rabby.");
  const wallet = createWalletClient({
    chain: monadTestnet,
    transport: custom(window.ethereum, { retryCount: 0 }),
  });
  const [account] = await wallet.requestAddresses();
  if (account?.toLowerCase() !== config.owner.toLowerCase())
    throw Error("Connect only the approved owner wallet: " + config.owner);
  if ((await client.getChainId()) !== 10143)
    throw Error("Official RPC network mismatch. Deployment blocked.");
  if (name === "network") {
    show(
      "Approve the network switch in the connected wallet. No deployment transaction is requested.",
    );
    try {
      await wallet.switchChain({ id: 10143 });
    } catch (error) {
      if (
        error instanceof BaseError &&
        error.walk((e) => e instanceof SwitchChainError) instanceof
          SwitchChainError
      ) {
        await wallet.addChain({
          chain: {
            ...monadTestnet,
            rpcUrls: { default: { http: ["https://testnet-rpc.monad.xyz"] } },
          },
        });
        await wallet.switchChain({ id: 10143 });
      } else {
        throw Error(
          "Network switch was not approved or supported. Select Monad Testnet for this site in the connected wallet, then retry.",
        );
      }
    }
  }
  const walletChain = await wallet.getChainId();
  if (walletChain !== 10143)
    throw Error(
      "Switch your wallet to Monad Testnet, chain 10143. This page's connected wallet reports chain " +
        walletChain +
        " (0x" +
        walletChain.toString(16) +
        "). Click Switch to Monad Testnet and approve it in that wallet. If multiple wallet extensions are enabled, use the one connected to this page.",
    );
  if (name === "network") {
    show({
      status: "Wallet network verified",
      walletChainId: walletChain,
      rpcChainId: 10143,
      owner: account,
    });
    return;
  }
  const state = saved();
  if (config.confirmedTokenTransaction) {
    if (!/^0x[0-9a-fA-F]{64}$/.test(config.confirmedTokenTransaction))
      throw Error("Invalid server-confirmed token hash. Deployment blocked.");
    if (
      state.token &&
      state.token.toLowerCase() !==
        config.confirmedTokenTransaction.toLowerCase()
    )
      throw Error(
        "Saved token transaction conflicts with verified recovery. Both records preserved; review required.",
      );
    state.token = config.confirmedTokenTransaction;
    state.tokenPending = false;
    localStorage.setItem(key, JSON.stringify(state));
  }
  if (name !== "verify") {
    const artifact =
      config.contracts[name === "token" ? "MockUSDC" : "TaskVault"];
    if (!artifact) throw Error("Missing tested artifact");
    let args: readonly unknown[] = [];
    if (name === "vault") {
      if (!state.token) throw Error("Deploy and confirm Mock USDC first.");
      const tokenReceipt = await client.waitForTransactionReceipt({
        hash: state.token,
        confirmations: 2,
        timeout: 120000,
      });
      if (tokenReceipt.status !== "success" || !tokenReceipt.contractAddress)
        throw Error("Token deployment is not confirmed.");
      args = [config.owner, tokenReceipt.contractAddress];
    }
    const pendingKey = name === "token" ? "tokenPending" : "vaultPending";
    if (!state[name] && state[pendingKey])
      throw Error(
        "Wallet result is uncertain. Check wallet activity and share only the public transaction hash for reconciliation. Do not approve another deployment.",
      );
    if (!state[name]) {
      state[pendingKey] = true;
      localStorage.setItem(key, JSON.stringify(state));
      show(
        "Awaiting owner wallet approval. Testnet MON only. If this page times out, reconnect and reconcile the saved transaction; do not redeploy.",
      );
      let hash: Hex;
      try {
        hash = await wallet.deployContract({
          chain: monadTestnet,
          type: "eip1559",
          account,
          abi: artifact.abi,
          bytecode: artifact.bytecode,
          args,
        });
      } catch (error) {
        if (
          error instanceof BaseError &&
          error.walk((e) => e instanceof UserRejectedRequestError) instanceof
            UserRejectedRequestError
        ) {
          state[pendingKey] = false;
          localStorage.setItem(key, JSON.stringify(state));
          throw Error(
            "Wallet approval rejected. No transaction was submitted.",
          );
        }
        throw Error(
          "Wallet result is uncertain. Check wallet activity and share only the public transaction hash for reconciliation. Do not approve another deployment.",
        );
      }
      state[name] = hash;
      state[pendingKey] = false;
      localStorage.setItem(key, JSON.stringify(state));
    }
    const hash = state[name];
    if (!hash) throw Error("Missing submitted transaction");
    show({ status: "Submitted; awaiting two confirmations", hash });
    const receipt = await client.waitForTransactionReceipt({
      hash,
      confirmations: 2,
      timeout: 120000,
    });
    show({
      status: receipt.status,
      hash,
      address: receipt.contractAddress,
      owner: config.owner,
      chainId: 10143,
    });
  } else {
    if (!state.token || !state.vault)
      throw Error("Both deployment transactions must be confirmed first.");
    const response = await fetch("/manifest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state),
    });
    const result = await response.json();
    if (!response.ok)
      throw Error(result.error ?? "Manifest verification failed");
    show(result);
  }
}
let interacted = false;
for (const button of document.querySelectorAll<HTMLButtonElement>(
  "button[data-action]",
))
  button.onclick = async () => {
    interacted = true;
    const buttons = document.querySelectorAll<HTMLButtonElement>("button");
    buttons.forEach((b) => {
      b.disabled = true;
    });
    try {
      await run(
        button.dataset.action as "token" | "vault" | "verify" | "network",
      );
    } catch (error) {
      show(
        error instanceof Error
          ? error.message
          : "Operation failed. Reconcile before retrying.",
      );
    } finally {
      buttons.forEach((b) => {
        b.disabled = false;
      });
    }
  };
void client
  .getBalance({ address: "0x9Db22De53242B5376fC4B87B523a0a91aDD0b09A" })
  .then((b) => {
    if (!interacted)
      show({
        network: "Monad Testnet",
        chainId: 10143,
        ownerMON: formatEther(b),
        savedTransactions: saved(),
        mode: "Owner-signed deployments only; no private key requested.",
      });
  })
  .catch(() => {
    if (!interacted)
      show(
        "Public balance temporarily unavailable. Wallet operations still require verified chain 10143.",
      );
  });
