import type { Hex } from "viem";
import type { VaultChain, SignedCall } from "./chain.js";
import {
  type EventStream,
  identity,
  paymentIdentity,
  taskSchema,
  toolSchemas,
  type AgentContext,
  type AssignedTask,
  type PaymentView,
  type ProviderInfo,
  type Quote,
  type ToolName,
} from "./domain.js";
import { AgentError, bounded } from "./errors.js";
import {
  inspectArtifact,
  validateQuote,
  type ServiceProvider,
} from "./providers.js";
import {
  IntentStore,
  type IntentJournal,
  type IntentRecord,
  type TxRecord,
} from "./store.js";
export type ToolChain = Pick<
  VaultChain,
  | "chainId"
  | "vault"
  | "agent"
  | "token"
  | "mandate"
  | "providers"
  | "balance"
  | "now"
  | "genesis"
  | "prepareRequest"
  | "prepareAcceptance"
  | "broadcast"
  | "payment"
  | "receipt"
  | "verifyFundedEvent"
>;
export class AgentTools {
  readonly context: AgentContext;
  readonly intentKey: Hex;
  #providers: Map<string, ServiceProvider>;
  #inspected: { paymentId: Hex; commitment: Hex } | undefined;
  constructor(
    task: AssignedTask,
    private readonly chain: ToolChain,
    readonly store: IntentJournal,
    providers: ServiceProvider[],
    readonly events: EventStream,
    private readonly providerTimeoutMs = 5000,
  ) {
    this.context = {
      task: taskSchema.parse(task),
      observations: { quotes: [] },
    };
    if (
      new Set(providers.map((p) => p.info.id)).size !== providers.length ||
      new Set(providers.map((p) => p.info.address.toLowerCase())).size !==
        providers.length
    )
      throw new AgentError("DUPLICATE_PROVIDER_REGISTRY");
    this.#providers = new Map(providers.map((p) => [p.info.id, p]));
    this.intentKey = identity(
      "flint-purchase-v1",
      String(chain.chainId),
      chain.vault.toLowerCase(),
      this.context.task.taskHash,
      chain.agent.toLowerCase(),
      this.context.task.purchaseKey,
    );
  }
  async resume() {
    const record = await this.store.get(this.intentKey);
    if (record?.requestTx)
      this.context.observations.payment = await this.#reconcile(record);
  }
  async call(name: ToolName, raw: unknown): Promise<unknown> {
    const validation = toolSchemas[name]?.safeParse(raw);
    if (!validation?.success) throw new AgentError("INVALID_TOOL_ARGUMENTS");
    const args = validation.data;
    const o = this.context.observations;
    switch (name) {
      case "getMandate": {
        const m = await this.chain.mandate(this.context.task.taskHash);
        if (
          m.agent.toLowerCase() !== this.chain.agent.toLowerCase() ||
          m.token.toLowerCase() !== this.chain.token.toLowerCase()
        )
          throw new AgentError("MANDATE_IDENTITY_MISMATCH");
        if (
          !(await this.store.get(this.intentKey)) &&
          (!m.active || BigInt(m.expiry) <= BigInt(m.now))
        )
          throw new AgentError("MANDATE_INACTIVE_OR_EXPIRED");
        o.mandate = m;
        this.events.emit("mandate.loaded", "onchain", {
          taskHash: m.taskHash,
          active: m.active,
          cap: m.cap,
          reserved: m.reserved,
          settled: m.settled,
        });
        return m;
      }
      case "listApprovedProviders": {
        const approved = await this.chain.providers(this.context.task.taskHash);
        const known = [...this.#providers.values()];
        const list = approved.map(
          (address) =>
            known.find(
              (p) => p.info.address.toLowerCase() === address.toLowerCase(),
            )?.info,
        );
        if (list.some((p) => !p))
          throw new AgentError("UNKNOWN_APPROVED_PROVIDER");
        o.providers = list as ProviderInfo[];
        return o.providers;
      }
      case "getVaultBalance": {
        o.balance = await this.chain.balance();
        return { available: o.balance };
      }
      case "getProviderQuote": {
        if (!("providerId" in args))
          throw new AgentError("INVALID_TOOL_ARGUMENTS");
        const info = o.providers?.find((p) => p.id === args.providerId);
        const provider = this.#providers.get(args.providerId);
        if (!info || !provider) throw new AgentError("UNAPPROVED_PROVIDER");
        const mandate = await this.chain.mandate(this.context.task.taskHash);
        try {
          const rawQuote = await bounded(
            (signal) =>
              provider.getQuote(
                this.context.task,
                this.chain.token,
                mandate.now,
                signal,
              ),
            this.providerTimeoutMs,
            "PROVIDER_TIMEOUT",
          );
          const quote = validateQuote(
            rawQuote,
            info,
            mandate,
            this.context.task.budget,
            await this.chain.now(),
          );
          o.quotes = o.quotes.filter((q) => q.providerId !== info.id);
          o.quotes.push(quote);
          this.events.emit("provider.quote.received", "simulated-provider", {
            providerId: info.id,
            quoteId: quote.quoteId,
            price: quote.price,
          });
          return quote;
        } catch (error) {
          this.events.emit("provider.quote.rejected", "application", {
            providerId: info.id,
            code: error instanceof AgentError ? error.code : "PROVIDER_FAILURE",
          });
          throw error;
        }
      }
      case "requestMandatePayment": {
        if (!("quoteId" in args))
          throw new AgentError("INVALID_TOOL_ARGUMENTS");
        const quote = o.quotes.find((q) => q.quoteId === args.quoteId);
        if (!quote) throw new AgentError("UNKNOWN_QUOTE");
        this.events.emit("provider.selected", "model", {
          providerId: quote.providerId,
          quoteId: quote.quoteId,
          summary: args.reason,
        });
        o.payment = await this.#request(quote);
        o.statusObserved = false;
        return o.payment;
      }
      case "getPaymentStatus": {
        const record = await this.#record();
        o.payment = await this.#reconcile(record);
        o.statusObserved = true;
        this.observe(o.payment);
        return o.payment;
      }
      case "inspectDelivery": {
        const record = await this.#record();
        const p = await this.#reconcile(record);
        if (!["FUNDED", "SUBMITTED"].includes(p.status))
          throw new AgentError("DELIVERY_NOT_INSPECTABLE");
        const now = await this.chain.now();
        if (
          (p.status === "FUNDED" && now >= p.deliveryDeadline) ||
          now >= p.reviewDeadline
        )
          throw new AgentError("DELIVERY_TIMED_OUT");
        const provider = this.#providers.get(record.quote.providerId);
        if (!provider) throw new AgentError("UNAPPROVED_PROVIDER");
        try {
          const rawDelivery = await bounded(
            (signal) => provider.getDelivery(record.quote, p.id, signal),
            this.providerTimeoutMs,
            "PROVIDER_TIMEOUT",
          );
          const submitted = await this.chain.payment(p.id);
          if (!submitted) throw new AgentError("PAYMENT_NOT_OBSERVED");
          const artifact = inspectArtifact(
            rawDelivery,
            record.quote,
            submitted,
          );
          this.#inspected = {
            paymentId: p.id,
            commitment: submitted.deliveredHash,
          };
          o.payment = submitted;
          o.inspected = true;
          o.artifact = artifact;
          this.events.emit("delivery.received", "simulated-provider", {
            paymentId: p.id,
            quoteId: record.quote.quoteId,
            commitment: submitted.deliveredHash,
          });
          return artifact;
        } catch (error) {
          this.events.emit("delivery.rejected", "application", {
            paymentId: p.id,
            code: error instanceof AgentError ? error.code : "INVALID_DELIVERY",
          });
          throw error;
        }
      }
      case "acceptDelivery": {
        const record = await this.#record();
        const p = await this.#reconcile(record);
        if (p.status === "ACCEPTED" || p.status === "COMPLETED") {
          o.payment = p;
          this.observe(p);
          return p;
        }
        if (
          p.status !== "SUBMITTED" ||
          !o.inspected ||
          this.#inspected?.paymentId !== p.id ||
          this.#inspected.commitment !== p.deliveredHash
        )
          throw new AgentError("DELIVERY_INSPECTION_REQUIRED");
        if (record.acceptTx) {
          await this.#receipt(record, "acceptTx", false);
          const observed = await this.chain.payment(p.id);
          if (!observed || !["ACCEPTED", "COMPLETED"].includes(observed.status))
            throw new AgentError("UNCERTAIN_TRANSACTION");
          o.payment = observed;
          this.observe(observed);
          return observed;
        }
        const signed = await this.chain.prepareAcceptance(p.id);
        await this.#send(record, "acceptTx", signed);
        const accepted = await this.chain.payment(p.id);
        if (accepted?.status !== "ACCEPTED")
          throw new AgentError("ACCEPTANCE_NOT_OBSERVED");
        o.payment = accepted;
        this.events.emit("delivery.accepted", "onchain", {
          paymentId: p.id,
          transactionHash: signed.hash,
        });
        this.observe(accepted);
        return accepted;
      }
    }
  }
  observe(payment: PaymentView) {
    if (payment.status === "ACCEPTED")
      this.events.emit("challenge.active", "onchain", {
        paymentId: payment.id,
        challengeDeadline: payment.challengeDeadline,
      });
    if (payment.status === "COMPLETED")
      this.events.emit("payment.settled", "onchain", { paymentId: payment.id });
    if (payment.status === "REJECTED" || payment.status === "EXPIRED")
      this.events.emit("payment.refunded", "onchain", {
        paymentId: payment.id,
        status: payment.status,
      });
  }
  async #record(): Promise<IntentRecord> {
    const record = await this.store.get(this.intentKey);
    if (!record) throw new AgentError("NO_PURCHASE_INTENT");
    if (
      record.genesisHash !== (await this.chain.genesis()) ||
      record.paymentId !==
        paymentIdentity(
          this.chain.chainId,
          this.chain.vault,
          this.context.task.taskHash,
          this.chain.agent,
          record.requestId,
        )
    )
      throw new AgentError("INTENT_CHAIN_MISMATCH");
    return record;
  }
  async #request(quote: Quote): Promise<PaymentView> {
    let record = await this.store.get(this.intentKey);
    if (record) {
      if (!IntentStore.sameQuote(record.quote, quote))
        throw new AgentError("PURCHASE_INTENT_CONFLICT");
      if (record.requestTx) return this.#reconcile(record);
    }
    const mandate = await this.chain.mandate(this.context.task.taskHash);
    const approved = await this.chain.providers(mandate.taskHash);
    const info = this.#providers.get(quote.providerId)?.info;
    if (
      !info ||
      !approved.some((a) => a.toLowerCase() === info.address.toLowerCase())
    )
      throw new AgentError("UNAPPROVED_PROVIDER");
    if (
      mandate.agent.toLowerCase() !== this.chain.agent.toLowerCase() ||
      !mandate.active ||
      BigInt(mandate.expiry) <= BigInt(mandate.now)
    )
      throw new AgentError("MANDATE_INACTIVE_OR_EXPIRED");
    validateQuote(
      record?.quote ?? quote,
      info,
      mandate,
      this.context.task.budget,
      mandate.now,
    );
    if (
      BigInt(mandate.reserved) + BigInt(mandate.settled) + BigInt(quote.price) >
      BigInt(mandate.cap)
    )
      throw new AgentError("INSUFFICIENT_TASK_CAP");
    if (BigInt(await this.chain.balance()) < BigInt(quote.price))
      throw new AgentError("INSUFFICIENT_VAULT_FUNDS");
    if (!record) {
      const requestId = identity(
        "flint-request-v1",
        this.intentKey,
        quote.quoteId,
      );
      record = {
        key: this.intentKey,
        requestId,
        paymentId: paymentIdentity(
          this.chain.chainId,
          this.chain.vault,
          mandate.taskHash,
          this.chain.agent,
          requestId,
        ),
        genesisHash: await this.chain.genesis(),
        quote,
      };
      await this.store.put(record);
    } else {
      await this.#record();
    }
    this.events.emit("payment.requested", "application", {
      intentId: record.key,
      paymentId: record.paymentId,
      providerId: quote.providerId,
      amount: quote.price,
    });
    const signed = await this.chain.prepareRequest(
      mandate.taskHash,
      record.requestId,
      info.address,
      BigInt(quote.price),
    );
    await this.#send(record, "requestTx", signed);
    return this.#reconcile(record);
  }
  async #receipt(
    record: IntentRecord,
    key: "requestTx" | "acceptTx",
    wait: boolean,
  ) {
    const tx = record[key];
    if (!tx) throw new AgentError("NO_TRANSACTION_ATTEMPT");
    let receipt: Awaited<ReturnType<VaultChain["receipt"]>>;
    try {
      receipt = await this.chain.receipt(tx.hash, wait);
    } catch {
      throw new AgentError("UNCERTAIN_TRANSACTION");
    }
    if (!receipt) return null;
    tx.state = receipt.status === "success" ? "confirmed" : "reverted";
    await this.store.put(record);
    this.events.emit(
      receipt.status === "success"
        ? "transaction.confirmed"
        : "transaction.reverted",
      "onchain",
      {
        transactionHash: tx.hash,
        paymentId: record.paymentId,
        blockNumber: String(receipt.blockNumber),
      },
    );
    if (receipt.status !== "success")
      throw new AgentError("TRANSACTION_REVERTED");
    if (key === "requestTx")
      this.chain.verifyFundedEvent(receipt, record.paymentId);
    return receipt;
  }
  async #send(
    record: IntentRecord,
    key: "requestTx" | "acceptTx",
    signed: SignedCall,
  ) {
    const tx: TxRecord = {
      hash: signed.hash,
      nonce: signed.nonce,
      state: "prepared",
    };
    record[key] = tx;
    await this.store.put(record); // Durable deterministic hash BEFORE any broadcast. Never repeat an existing attempt.
    try {
      await this.chain.broadcast(signed);
      tx.state = "submitted";
      await this.store.put(record);
      this.events.emit("transaction.submitted", "application", {
        transactionHash: tx.hash,
        paymentId: record.paymentId,
        action: signed.action,
      });
      const receipt = await this.#receipt(record, key, true);
      if (!receipt) throw new AgentError("UNCERTAIN_TRANSACTION");
    } catch (error) {
      if (tx.state !== "reverted" && tx.state !== "confirmed") {
        tx.state = "uncertain";
        await this.store.put(record);
      }
      if (error instanceof AgentError && error.code === "TRANSACTION_REVERTED")
        throw error;
      this.events.emit("transaction.uncertain", "application", {
        transactionHash: tx.hash,
        paymentId: record.paymentId,
      });
      throw new AgentError("UNCERTAIN_TRANSACTION");
    }
  }
  async #reconcile(input: IntentRecord): Promise<PaymentView> {
    const record = await this.#record();
    if (record.key !== input.key) throw new AgentError("INTENT_CHAIN_MISMATCH");
    if (record.requestTx) await this.#receipt(record, "requestTx", false);
    if (record.acceptTx) await this.#receipt(record, "acceptTx", false);
    const p = await this.chain.payment(record.paymentId);
    const info = this.#providers.get(record.quote.providerId)?.info;
    if (!p) throw new AgentError("UNCERTAIN_TRANSACTION");
    if (
      !info ||
      p.taskHash !== this.context.task.taskHash ||
      p.requestId !== record.requestId ||
      p.agent.toLowerCase() !== this.chain.agent.toLowerCase() ||
      p.provider.toLowerCase() !== info.address.toLowerCase() ||
      p.token.toLowerCase() !== this.chain.token.toLowerCase() ||
      p.amount !== record.quote.price
    )
      throw new AgentError("PAYMENT_BINDING_MISMATCH");
    this.events.emit("payment.funded", "onchain", {
      paymentId: p.id,
      providerId: info.id,
      amount: p.amount,
      status: p.status,
    });
    return p;
  }
}
