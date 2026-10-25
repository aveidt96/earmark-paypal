import {
  BaseError,
  ContractFunctionRevertedError,
  TransactionReceiptNotFoundError,
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  http,
  keccak256,
  parseEventLogs,
  type Address,
  type Hex,
  type TransactionReceipt,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { runtimeChain } from "./runtime-config.js";
import { vaultAbi } from "./abi.js";
import { AgentError } from "./errors.js";
import type { PaymentView, PublicMandate } from "./domain.js";
import type { RuntimeConfig } from "./runtime-config.js";
export interface SignedCall {
  hash: Hex;
  nonce: number;
  serialized: Hex;
  action: "request" | "accept";
}
const statuses = [
  "NONE",
  "FUNDED",
  "SUBMITTED",
  "ACCEPTED",
  "COMPLETED",
  "REJECTED",
  "EXPIRED",
] as const;
function reverted(error: unknown, name: string) {
  return (
    error instanceof BaseError &&
    error.walk((e) => e instanceof ContractFunctionRevertedError) instanceof
      ContractFunctionRevertedError &&
    (
      error.walk(
        (e) => e instanceof ContractFunctionRevertedError,
      ) as ContractFunctionRevertedError
    ).data?.errorName === name
  );
}
export class VaultChain {
  readonly agent: Address;
  readonly vault: Address;
  readonly token: Address;
  readonly chainId: 31337 | 10143;
  private tokenCodeHash: Hex | undefined;
  readonly receiptTimeoutMs: number;
  #client;
  #wallet;
  #account;
  #codeHash: Hex;
  constructor(config: RuntimeConfig, timeoutMs = 10_000) {
    try {
      this.#account = privateKeyToAccount(config.AGENT_PRIVATE_KEY as Hex);
    } catch {
      throw new AgentError("INVALID_AGENT_KEY");
    }
    this.chainId = config.AGENT_CHAIN_ID === "10143" ? 10143 : 31337;
    this.tokenCodeHash = config.AGENT_TOKEN_CODE_HASH;
    const network = runtimeChain(this.chainId);
    this.agent = this.#account.address;
    this.vault = config.TASK_VAULT_ADDRESS;
    this.token = config.AGENT_PAYMENT_TOKEN;
    this.#codeHash = config.AGENT_VAULT_CODE_HASH;
    this.receiptTimeoutMs = timeoutMs;
    const transport = http(config.AGENT_RPC_URL, {
      retryCount: 0,
      timeout: timeoutMs,
      fetchOptions: { redirect: "error" },
    });
    this.#client = createPublicClient({ chain: network, transport });
    this.#wallet = createWalletClient({
      chain: network,
      transport,
      account: this.#account,
    });
  }
  async verify() {
    if ((await this.#client.getChainId()) !== this.chainId)
      throw new AgentError("UNEXPECTED_CHAIN");
    const code = await this.#client.getCode({ address: this.vault });
    if (!code || keccak256(code) !== this.#codeHash)
      throw new AgentError("UNEXPECTED_VAULT_CODE");
    if (this.tokenCodeHash) {
      const tokenCode = await this.#client.getCode({ address: this.token });
      if (!tokenCode || keccak256(tokenCode) !== this.tokenCodeHash)
        throw new AgentError("UNEXPECTED_PAYMENT_TOKEN_CODE");
    }
    const owner = await this.#client.readContract({
      address: this.vault,
      abi: vaultAbi,
      functionName: "owner",
    });
    const token = await this.#client.readContract({
      address: this.vault,
      abi: vaultAbi,
      functionName: "paymentToken",
    });
    if (owner.toLowerCase() === this.agent.toLowerCase())
      throw new AgentError("OWNER_AGENT_MUST_DIFFER");
    if (token.toLowerCase() !== this.token.toLowerCase())
      throw new AgentError("UNEXPECTED_PAYMENT_TOKEN");
  }
  async genesis(): Promise<Hex> {
    const block = await this.#client.getBlock({ blockNumber: 0n });
    if (!block.hash) throw new AgentError("MISSING_GENESIS");
    return block.hash;
  }
  async now() {
    return Number((await this.#client.getBlock()).timestamp);
  }
  async mandate(taskHash: Hex): Promise<PublicMandate> {
    try {
      const [m, terms, now] = await Promise.all([
        this.#client.readContract({
          address: this.vault,
          abi: vaultAbi,
          functionName: "getMandate",
          args: [taskHash],
        }),
        this.#client.readContract({
          address: this.vault,
          abi: vaultAbi,
          functionName: "getDeliveryTerms",
          args: [taskHash],
        }),
        this.now(),
      ]);
      return {
        taskHash: m.taskHash,
        agent: m.agent,
        token: m.token,
        cap: String(m.cap),
        reserved: String(m.reserved),
        settled: String(m.settled),
        expiry: String(m.expiry),
        active: m.active,
        trustedHash: terms.trustedDeliverableHash,
        now,
      };
    } catch (error) {
      if (reverted(error, "MandateNotFound"))
        throw new AgentError("MANDATE_NOT_FOUND");
      throw error;
    }
  }
  async providers(task: Hex) {
    return this.#client.readContract({
      address: this.vault,
      abi: vaultAbi,
      functionName: "getApprovedProviders",
      args: [task],
    });
  }
  async balance() {
    return String(
      await this.#client.readContract({
        address: this.vault,
        abi: vaultAbi,
        functionName: "availableBalance",
      }),
    );
  }
  async payment(id: Hex): Promise<PaymentView | null> {
    try {
      const p = await this.#client.readContract({
        address: this.vault,
        abi: vaultAbi,
        functionName: "getPayment",
        args: [id],
      });
      const status = statuses[p.status];
      if (!status || status === "NONE")
        throw new AgentError("INVALID_CHAIN_PAYMENT");
      return {
        id,
        taskHash: p.taskHash,
        requestId: p.requestId,
        agent: p.agent,
        provider: p.provider,
        token: p.token,
        amount: String(p.amount),
        status,
        deliveryDeadline: Number(p.deliveryDeadline),
        reviewDeadline: Number(p.reviewDeadline),
        challengeDeadline: Number(p.challengeDeadline),
        expectedHash: p.expectedDeliverableHash,
        deliveredHash: p.deliverableHash,
      };
    } catch (error) {
      if (reverted(error, "PaymentNotFound")) return null;
      throw error;
    }
  }
  async #sign(data: Hex, action: SignedCall["action"]): Promise<SignedCall> {
    await this.verify();
    const request = await this.#wallet.prepareTransactionRequest({
      account: this.#account,
      to: this.vault,
      data,
      value: 0n,
    });
    const serialized = await this.#wallet.signTransaction(request);
    return {
      hash: keccak256(serialized),
      nonce: request.nonce,
      serialized,
      action,
    };
  }
  async prepareRequest(
    task: Hex,
    requestId: Hex,
    provider: Address,
    amount: bigint,
  ): Promise<SignedCall> {
    await this.#client.simulateContract({
      address: this.vault,
      abi: vaultAbi,
      functionName: "requestPayment",
      args: [task, requestId, provider, this.token, amount],
      account: this.agent,
    });
    return this.#sign(
      encodeFunctionData({
        abi: vaultAbi,
        functionName: "requestPayment",
        args: [task, requestId, provider, this.token, amount],
      }),
      "request",
    );
  }
  async prepareAcceptance(id: Hex): Promise<SignedCall> {
    await this.#client.simulateContract({
      address: this.vault,
      abi: vaultAbi,
      functionName: "acceptDelivery",
      args: [id],
      account: this.agent,
    });
    return this.#sign(
      encodeFunctionData({
        abi: vaultAbi,
        functionName: "acceptDelivery",
        args: [id],
      }),
      "accept",
    );
  }
  async broadcast(call: SignedCall) {
    const hash = await this.#client.sendRawTransaction({
      serializedTransaction: call.serialized,
    });
    if (hash !== call.hash)
      throw new AgentError("UNEXPECTED_RPC_TRANSACTION_HASH");
  }
  async receipt(hash: Hex, wait = false): Promise<TransactionReceipt | null> {
    try {
      const receipt = wait
        ? await this.#client.waitForTransactionReceipt({
            hash,
            timeout: this.receiptTimeoutMs,
            confirmations: this.chainId === 10143 ? 2 : 1,
            pollingInterval: this.chainId === 10143 ? 1000 : 50,
          })
        : await this.#client.getTransactionReceipt({ hash });
      if (
        receipt.transactionHash !== hash ||
        receipt.to?.toLowerCase() !== this.vault.toLowerCase() ||
        receipt.from.toLowerCase() !== this.agent.toLowerCase()
      )
        throw new AgentError("UNEXPECTED_TRANSACTION_RECEIPT");
      return receipt;
    } catch (error) {
      if (error instanceof TransactionReceiptNotFoundError) return null;
      throw error;
    }
  }
  verifyFundedEvent(receipt: TransactionReceipt, paymentId: Hex) {
    const events = parseEventLogs({
      abi: vaultAbi,
      eventName: "PaymentFunded",
      logs: receipt.logs,
    });
    if (
      !events.some(
        (event) =>
          event.address.toLowerCase() === this.vault.toLowerCase() &&
          event.args.paymentId === paymentId,
      )
    )
      throw new AgentError("MISSING_FUNDED_EVENT");
  }
}
