import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  parseAbi,
  encodeFunctionData,
  keccak256,
  UserRejectedRequestError,
  BaseError,
  type EIP1193Provider,
  type Address,
  type Hex,
} from "viem";
import { monadTestnet } from "viem/chains";
import { verifyOwnerMint } from "./testnet-funding-recovery.mjs";
const output = document.querySelector("pre");
if (!output) throw Error("FUNDING_VIEW_MISSING");
const show = (text: string) => {
  output.textContent = text;
};
const client = createPublicClient({
  chain: monadTestnet,
  transport: http("https://testnet-rpc.monad.xyz", {
    retryCount: 0,
    timeout: 15000,
  }),
});
const abi = parseAbi([
  "function mint(address to,uint256 amount)",
  "function balanceOf(address) view returns(uint256)",
  "function owner() view returns(address)",
  "function paymentToken() view returns(address)",
]);
interface Config {
  chainId: number;
  owner: Address;
  token: Address;
  tokenCodeHash: Hex;
  vault: Address;
  vaultCodeHash: Hex;
  amount: string;
}
interface Attempt {
  pending: boolean;
  hash?: Hex;
  confirmed?: boolean;
}
const key =
  "earmark-owner-mint:10143:0x8f4660ed18a3ba5ba9dbe64e18f06ef4a43c0136";
function saved(): Attempt {
  const record = JSON.parse(localStorage.getItem(key) ?? "{}");
  if (typeof record !== "object" || record === null)
    throw Error("Saved mint state requires review.");
  return record;
}
function save(record: Attempt) {
  localStorage.setItem(key, JSON.stringify(record));
}
async function verified(config: Config) {
  if (
    config.chainId !== 10143 ||
    config.amount !== "20000000" ||
    (await client.getChainId()) !== 10143
  )
    throw Error("Unexpected funding configuration.");
  const [tokenCode, vaultCode, owner, token] = await Promise.all([
    client.getCode({ address: config.token }),
    client.getCode({ address: config.vault }),
    client.readContract({ address: config.vault, abi, functionName: "owner" }),
    client.readContract({
      address: config.vault,
      abi,
      functionName: "paymentToken",
    }),
  ]);
  if (
    !tokenCode ||
    !vaultCode ||
    keccak256(tokenCode) !== config.tokenCodeHash ||
    keccak256(vaultCode) !== config.vaultCodeHash ||
    owner.toLowerCase() !== config.owner.toLowerCase() ||
    token.toLowerCase() !== config.token.toLowerCase()
  )
    throw Error("Deployed owner/token/bytecode mismatch. Mint blocked.");
}
async function confirm(config: Config, hash: Hex) {
  const calldata = encodeFunctionData({
    abi,
    functionName: "mint",
    args: [config.owner, 20000000n],
  });
  try {
    await client.waitForTransactionReceipt({
      hash,
      confirmations: 2,
      timeout: 60000,
      pollingInterval: 1000,
    });
  } catch {
    throw Error(
      "Mint unconfirmed or RPC unavailable. Preserve state; do not resend.",
    );
  }
  await verifyOwnerMint(
    client,
    { owner: config.owner, token: config.token, calldata },
    hash,
  );
  save({ pending: false, hash, confirmed: true });
  show(
    `Confirmed owner mint: 20 mock USDC\nTransaction: ${hash}\nNow open Earmark and deposit 20 mock USDC through Vault Balance.`,
  );
}
async function run(action: string) {
  const config = (await (await fetch("/config")).json()) as Config;
  const state = saved();
  if (action === "reconcile") {
    const input = document
      .querySelector<HTMLInputElement>("#hash")
      ?.value.trim();
    if (!input || !/^0x[0-9a-fA-F]{64}$/.test(input))
      throw Error("Enter only a public transaction hash.");
    if (state.hash && state.hash.toLowerCase() !== input.toLowerCase())
      throw Error(
        "This hash differs from the saved mint. Preserve and review existing state.",
      );
    await verified(config);
    await confirm(config, input as Hex);
    return;
  }
  const provider = (window as Window & { ethereum?: EIP1193Provider }).ethereum;
  if (!provider)
    throw Error("Open this page in your browser with Rabby or MetaMask.");
  const wallet = createWalletClient({
    chain: monadTestnet,
    transport: custom(provider, { retryCount: 0 }),
  });
  const [account] = await wallet.requestAddresses();
  if (account?.toLowerCase() !== config.owner.toLowerCase())
    throw Error("Connect the approved owner wallet only.");
  if (action === "network") {
    await wallet.switchChain({ id: 10143 });
    if ((await wallet.getChainId()) !== 10143)
      throw Error("Wallet chain switch not confirmed.");
    show("Connected wallet is on Monad Testnet (10143). No mint sent.");
    return;
  }
  if (action !== "mint") throw Error("Unsupported funding action.");
  if ((await wallet.getChainId()) !== 10143)
    throw Error("Switch your wallet to Monad Testnet (10143) first.");
  if (state.pending && !state.hash)
    throw Error(
      "Wallet result is uncertain. Check wallet activity and reconcile only its public mint hash. Do not approve another mint.",
    );
  await verified(config);
  if (state.hash) {
    show(`Reconciling saved mint ${state.hash}. No resend.`);
    await confirm(config, state.hash);
    return;
  }
  if (state.pending)
    throw Error(
      "Wallet result is uncertain. Check wallet activity and reconcile only its public mint hash. Do not approve another mint.",
    );
  const balance = await client.readContract({
    address: config.token,
    abi,
    functionName: "balanceOf",
    args: [config.owner],
  });
  if (balance >= 20000000n) {
    show(
      "Owner already holds at least 20 mock USDC. No mint needed. Deposit through Earmark.",
    );
    return;
  }
  await client.simulateContract({
    account,
    address: config.token,
    abi,
    functionName: "mint",
    args: [config.owner, 20000000n],
  });
  save({ pending: true });
  let hash: Hex;
  try {
    hash = await wallet.writeContract({
      account,
      address: config.token,
      abi,
      functionName: "mint",
      args: [config.owner, 20000000n],
    });
  } catch (error) {
    if (
      (error instanceof BaseError &&
        error.walk((e) => e instanceof UserRejectedRequestError)) ||
      (typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === 4001)
    ) {
      save({ pending: false });
      throw Error("Mint signature rejected. No confirmed transaction.");
    }
    throw Error(
      "Wallet result is uncertain. Reconcile the public hash before any retry.",
    );
  }
  save({ pending: true, hash });
  show(
    `Mint submitted: ${hash}\nWaiting for two confirmations. Do not resend.`,
  );
  await confirm(config, hash);
}
for (const button of document.querySelectorAll<HTMLButtonElement>(
  "button[data-action]",
))
  button.onclick = async () => {
    const buttons = document.querySelectorAll<HTMLButtonElement>("button");
    buttons.forEach((b) => {
      b.disabled = true;
    });
    try {
      await run(button.dataset.action ?? "");
    } catch (error) {
      show(
        error instanceof Error && error.message.length < 250
          ? error.message
          : "Mint unconfirmed. Preserve saved state and reconcile before retrying.",
      );
    } finally {
      buttons.forEach((b) => {
        b.disabled = false;
      });
    }
  };
