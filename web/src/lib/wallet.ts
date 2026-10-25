import {
  createPublicClient,
  createWalletClient,
  custom,
  erc20Abi,
  parseUnits,
  type Address,
  type Hex,
  type EIP1193Provider,
} from "viem";
import { workspaceChain } from "./local-chain";
import { ownerAbi } from "./abi";
import {
  launchTypedData,
  type WorkspaceConfig,
  type LaunchChallenge,
} from "./model";
import type { ReturnTypeOfCreation } from "./wallet-types";
export interface InjectedProvider {
  request(args: {
    method: string;
    params?: unknown[] | object;
  }): Promise<unknown>;
  on?(event: string, listener: (value: unknown) => void): void;
  removeListener?(event: string, listener: (value: unknown) => void): void;
}
export interface WalletState {
  account: Address;
  chainId: number;
}
export async function readWallet(
  provider: InjectedProvider,
  prompt = false,
): Promise<WalletState | null> {
  const raw = await provider.request({
    method: prompt ? "eth_requestAccounts" : "eth_accounts",
  });
  if (!Array.isArray(raw) || !raw.length) return null;
  const account = raw[0];
  if (typeof account !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(account))
    throw new Error("Wallet returned an invalid account.");
  const chain = await provider.request({ method: "eth_chainId" });
  if (typeof chain !== "string" || !/^0x[0-9a-fA-F]+$/.test(chain))
    throw new Error("Wallet returned an invalid network.");
  return { account: account as Address, chainId: Number(BigInt(chain)) };
}
export class OwnerWallet {
  constructor(
    readonly provider: InjectedProvider,
    readonly config: WorkspaceConfig,
    readonly notify: (hash: Hex, kind: string) => void,
  ) {}
  clients() {
    const transport = custom(this.provider as EIP1193Provider, {
      retryCount: 0,
    });
    return {
      public: createPublicClient({
        chain: workspaceChain(this.config.chainId),
        transport,
      }),
      wallet: createWalletClient({
        chain: workspaceChain(this.config.chainId),
        transport,
      }),
    };
  }
  async account(ownerOnly = true) {
    const state = await readWallet(this.provider);
    if (!state) throw new Error("Connect your owner wallet first.");
    if (state.chainId !== this.config.chainId)
      throw new Error("Switch your wallet to " + this.config.network + ".");
    const clients = this.clients();
    const owner = await clients.public.readContract({
      address: this.config.vault,
      abi: ownerAbi,
      functionName: "owner",
    });
    if (ownerOnly && owner.toLowerCase() !== state.account.toLowerCase())
      throw new Error("This action requires the current vault owner.");
    if (
      ownerOnly &&
      state.account.toLowerCase() === this.config.agent.toLowerCase()
    )
      throw new Error("Owner and agent wallets must remain separate.");
    return state.account;
  }
  async confirm(
    hash: Hex,
    kind: string,
    expectedTo: Address = this.config.vault,
  ) {
    this.notify(hash, kind);
    const receipt = await this.clients().public.waitForTransactionReceipt({
      hash,
      timeout: this.config.chainId === 10143 ? 60000 : 20000,
      confirmations: this.config.chainId === 10143 ? 2 : 1,
      pollingInterval: this.config.chainId === 10143 ? 1000 : 100,
    });
    if (
      receipt.transactionHash !== hash ||
      receipt.to?.toLowerCase() !== expectedTo.toLowerCase()
    )
      throw new Error(
        "Receipt does not match the submitted contract transaction.",
      );
    if (receipt.status !== "success")
      throw new Error("Transaction reverted. No success has been recorded.");
    return receipt;
  }
  async deposit(amount: string, decimals: number) {
    const value = this.amount(amount, decimals);
    const account = await this.account();
    const { wallet, public: client } = this.clients();
    const allowance = await client.readContract({
      address: this.config.token,
      abi: erc20Abi,
      functionName: "allowance",
      args: [account, this.config.vault],
    });
    if (allowance < value) {
      if (allowance > 0n)
        await this.confirm(
          await wallet.writeContract({
            account,
            address: this.config.token,
            abi: erc20Abi,
            functionName: "approve",
            args: [this.config.vault, 0n],
          }),
          "Approval reset",
          this.config.token,
        );
      await this.confirm(
        await wallet.writeContract({
          account,
          address: this.config.token,
          abi: erc20Abi,
          functionName: "approve",
          args: [this.config.vault, value],
        }),
        "Exact deposit approval",
        this.config.token,
      );
    }
    return this.confirm(
      await wallet.writeContract({
        account,
        address: this.config.vault,
        abi: ownerAbi,
        functionName: "deposit",
        args: [this.config.token, value],
      }),
      "Deposit",
    );
  }
  amount(text: string, decimals: number) {
    if (
      !/^[0-9]+(\.[0-9]+)?$/.test(text) ||
      (text.split(".")[1]?.length ?? 0) > decimals
    )
      throw new Error("Enter an amount in exact token units.");
    const value = parseUnits(text, decimals);
    if (value <= 0n) throw new Error("Amount must be greater than zero.");
    return value;
  }
  async withdraw(amount: string, decimals: number) {
    const value = this.amount(amount, decimals);
    const account = await this.account();
    const { wallet, public: client } = this.clients();
    const available = await client.readContract({
      address: this.config.vault,
      abi: ownerAbi,
      functionName: "availableBalance",
    });
    if (value > available)
      throw new Error("Withdrawal exceeds unreserved vault funds.");
    return this.confirm(
      await wallet.writeContract({
        account,
        address: this.config.vault,
        abi: ownerAbi,
        functionName: "withdraw",
        args: [this.config.token, account, value],
      }),
      "Withdrawal",
    );
  }
  async create(p: ReturnTypeOfCreation) {
    const account = await this.account();
    return this.confirm(
      await this.clients().wallet.writeContract({
        account,
        address: this.config.vault,
        abi: ownerAbi,
        functionName: "createMandate",
        args: [
          p.taskHash,
          p.agent as Address,
          p.token as Address,
          p.capUnits,
          BigInt(p.expiry),
          p.providers as Address[],
          {
            deliveryWindow: BigInt(p.deliveryWindow),
            challengeWindow: BigInt(p.challengeWindow),
            trustedDeliverableHash: p.trustedHash as Hex,
          },
        ],
      }),
      "Mandate creation",
    );
  }
  async revoke(id: Hex) {
    const account = await this.account();
    return this.confirm(
      await this.clients().wallet.writeContract({
        account,
        address: this.config.vault,
        abi: ownerAbi,
        functionName: "revokeMandate",
        args: [id],
      }),
      "Mandate revocation",
    );
  }
  async reject(id: Hex, reason: string) {
    if (!reason.trim() || new TextEncoder().encode(reason).length > 256)
      throw new Error("Provide a rejection reason of 1–256 bytes.");
    const account = await this.account();
    return this.confirm(
      await this.clients().wallet.writeContract({
        account,
        address: this.config.vault,
        abi: ownerAbi,
        functionName: "rejectPayment",
        args: [id, reason.trim()],
      }),
      "Payment rejection",
    );
  }
  async settle(id: Hex) {
    const account = await this.account(false);
    return this.confirm(
      await this.clients().wallet.writeContract({
        account,
        address: this.config.vault,
        abi: ownerAbi,
        functionName: "settlePayment",
        args: [id],
      }),
      "Payment settlement",
    );
  }
  async refund(id: Hex) {
    const account = await this.account(false);
    return this.confirm(
      await this.clients().wallet.writeContract({
        account,
        address: this.config.vault,
        abi: ownerAbi,
        functionName: "refundExpired",
        args: [id],
      }),
      "Timeout refund",
    );
  }
  async sign(c: LaunchChallenge) {
    const account = await this.account();
    if (
      c.chainId !== this.config.chainId ||
      c.vault.toLowerCase() !== this.config.vault.toLowerCase() ||
      c.owner.toLowerCase() !== account.toLowerCase()
    )
      throw new Error(
        "Launch authorization does not match this wallet and vault.",
      );
    return this.clients().wallet.signTypedData({
      account,
      ...launchTypedData(c),
    });
  }
  async signGemini(c: GeminiChallenge) {
    const account = await this.account();
    if (
      c.chainId !== this.config.chainId ||
      c.vault.toLowerCase() !== this.config.vault.toLowerCase() ||
      c.owner.toLowerCase() !== account.toLowerCase()
    )
      throw new Error(
        "Read-only authorization does not match this wallet and vault.",
      );
    return this.clients().wallet.signTypedData({
      account,
      ...geminiTypedData(c),
    });
  }
}
export async function switchLocal(
  provider: InjectedProvider,
  config: WorkspaceConfig,
) {
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0x" + config.chainId.toString(16) }],
    });
  } catch (error) {
    if ((error as { code?: number }).code !== 4902) throw error;
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: "0x" + config.chainId.toString(16),
          chainName: "Earmark " + config.network,
          rpcUrls: [config.rpcUrl],
          nativeCurrency: workspaceChain(config.chainId).nativeCurrency,
        },
      ],
    });
  }
}
export function walletError(error: unknown) {
  const text = error instanceof Error ? error.message : "";
  if (
    (error as { code?: number })?.code === 4001 ||
    /rejected|denied/i.test(text)
  )
    return "Wallet request declined. No new authorization was granted.";
  if (/timeout|timed out/i.test(text))
    return "Confirmation is uncertain. Inspect the recorded transaction; do not resend blindly.";
  return text.length < 220 && text && !text.includes("Request Arguments")
    ? text
    : "The request could not be completed. Check the transaction and try reconnecting.";
}

/** A delayed receipt must never clear or relabel a newer pending transaction. */
export function receiptMatchesPending(
  stored: string | null,
  hash: string,
  config: { vault: string; chainId: number },
) {
  try {
    if (!stored) return false;
    const p = JSON.parse(stored) as {
      hash?: unknown;
      vault?: unknown;
      chainId?: unknown;
    };
    return (
      typeof p.hash === "string" &&
      typeof p.vault === "string" &&
      p.hash.toLowerCase() === hash.toLowerCase() &&
      p.vault.toLowerCase() === config.vault.toLowerCase() &&
      p.chainId === config.chainId
    );
  } catch {
    return false;
  }
}
import { geminiTypedData, type GeminiChallenge } from "./gemini";
