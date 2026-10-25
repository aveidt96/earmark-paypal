"use client";
import { useEffect, useRef, useState } from "react";
import {
  createWalletClient,
  custom,
  formatUnits,
  type Address,
  type Hex,
  type EIP1193Provider,
} from "viem";
import { useWorkspace } from "./workspace-provider";
import { Panel, Button, Badge } from "./glass";
import { readWallet, walletError } from "../lib/wallet";
import { workspaceChain } from "../lib/local-chain";
import { ownerAbi } from "../lib/abi";
import {
  deployment,
  eligibleResolution,
  matchingResolutionTransaction,
  pendingResolutionSchema,
  paymentIdSchema,
  resolutionStorageKey,
  verifiedResolverClient,
  type PendingResolution,
} from "../lib/payment-resolution";

export function PaymentResolution() {
  const w = useWorkspace();
  const [id, setId] = useState(""),
    [choice, setChoice] = useState(""),
    [hash, setHash] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const [record, setRecord] = useState<{
    status: number;
    amount: bigint;
    provider: Address;
    deliveryDeadline: bigint;
    reviewDeadline: bigint;
    challengeDeadline: bigint;
  } | null>(null);
  const [chainTime, setChainTime] = useState(0n),
    [pending, setPending] = useState<PendingResolution | null>(null);
  const locked = useRef(false);
  useEffect(() => {
    const saved = localStorage.getItem(resolutionStorageKey);
    if (!saved) return;
    try {
      const p = pendingResolutionSchema.parse(JSON.parse(saved));
      setPending(p);
      setId(p.paymentId);
      setHash(p.hash ?? "");
    } catch {
      setMessage(
        "Saved resolution is invalid. Review wallet activity before taking further action.",
      );
      locked.current = true;
    }
  }, []);
  async function inspect() {
    const paymentId = paymentIdSchema.parse(id) as Hex;
    const client = await verifiedResolverClient();
    const block = await client.getBlock();
    const payment = await client.readContract({
      address: deployment.vault.address as Address,
      abi: ownerAbi,
      functionName: "getPayment",
      args: [paymentId],
      blockNumber: block.number,
    });
    setRecord(payment);
    setChainTime(block.timestamp);
    return { client, payment, now: block.timestamp, paymentId };
  }
  async function perform(work: () => Promise<void>) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setMessage("");
    try {
      await work();
    } catch (error) {
      setMessage(walletError(error));
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  async function reconcile(p: PendingResolution, txHash: Hex) {
    const client = await verifiedResolverClient();
    const tx = await client.getTransaction({ hash: txHash });
    if (!matchingResolutionTransaction(p, tx))
      throw Error("Transaction does not match the saved payment resolution.");
    const saved = { ...p, hash: txHash };
    localStorage.setItem(resolutionStorageKey, JSON.stringify(saved));
    setPending(saved);
    setHash(txHash);
    const receipt = await client.waitForTransactionReceipt({
      hash: txHash,
      confirmations: 2,
      timeout: 60000,
      pollingInterval: 1000,
    });
    if (
      receipt.to?.toLowerCase() !== deployment.vault.address ||
      receipt.transactionHash !== txHash
    )
      throw Error("Receipt mismatch.");
    localStorage.removeItem(resolutionStorageKey);
    setPending(null);
    await inspect();
    setMessage(
      receipt.status === "success"
        ? "Resolution confirmed on Monad Testnet."
        : "Transaction reverted. No successful resolution recorded.",
    );
  }
  async function resolve() {
    if (localStorage.getItem(resolutionStorageKey))
      throw Error(
        "Reconcile the saved wallet attempt before another transaction.",
      );
    const { client, payment, now, paymentId } = await inspect();
    const action = eligibleResolution(payment, now);
    if (!action)
      throw Error(
        "This payment is not eligible for settlement or timeout refund.",
      );
    const provider = (w.choices.find((c) => c.id === choice) ?? w.choices[0])
      ?.provider;
    if (!provider) throw Error("Enable MetaMask or Rabby first.");
    const state = await readWallet(provider, true);
    if (state?.chainId !== 10143)
      throw Error("Switch your wallet to Monad Testnet, chain 10143.");
    await client.simulateContract({
      address: deployment.vault.address as Address,
      abi: ownerAbi,
      functionName: action,
      args: [paymentId],
      account: state.account,
    });
    const saved: PendingResolution = {
      paymentId,
      action,
      account: state.account,
    };
    localStorage.setItem(resolutionStorageKey, JSON.stringify(saved));
    setPending(saved);
    let txHash: Hex;
    try {
      txHash = await createWalletClient({
        chain: workspaceChain(10143),
        transport: custom(provider as EIP1193Provider, { retryCount: 0 }),
      }).writeContract({
        account: state.account,
        address: deployment.vault.address as Address,
        abi: ownerAbi,
        functionName: action,
        args: [paymentId],
      });
    } catch (error) {
      if (
        (error as { code?: number })?.code === 4001 ||
        (error as { cause?: { code?: number } })?.cause?.code === 4001
      ) {
        localStorage.removeItem(resolutionStorageKey);
        setPending(null);
      }
      throw error;
    }
    const submitted = { ...saved, hash: txHash };
    localStorage.setItem(resolutionStorageKey, JSON.stringify(submitted));
    setPending(submitted);
    setHash(txHash);
    await reconcile(submitted, txHash);
  }
  const action = record && eligibleResolution(record, chainTime);
  return (
    <main id="main" className="page-shell">
      <div className="page-heading">
        <div>
          <h1>Resolve Escrow</h1>
          <p>
            Read and resolve existing payments directly on Monad Testnet, even
            while the backend is asleep.
          </p>
        </div>
      </div>
      <Panel>
        <Badge>Monad Testnet · mock USDC</Badge>
        <p>
          Vault: <code className="hash">{deployment.vault.address}</code>
        </p>
        <p>
          Settlement sends funds only to the original provider. Timeout refunds
          restore vault liquidity. The full onchain challenge window applies;
          accepted payments cannot be timeout-refunded.
        </p>
        <label>
          Payment ID
          <input
            className="input"
            value={id}
            onChange={(e) => {
              setId(e.target.value);
              setRecord(null);
            }}
            disabled={busy || !!pending}
            placeholder="0x… (32 bytes)"
          />
        </label>
        <Button
          variant="soft"
          disabled={busy}
          onClick={() =>
            void perform(async () => {
              await inspect();
            })
          }
        >
          Read Onchain Payment
        </Button>
        {record && (
          <div>
            <p>
              Escrow Status:{" "}
              <strong>
                {
                  [
                    "NONE",
                    "FUNDED",
                    "SUBMITTED",
                    "ACCEPTED",
                    "COMPLETED",
                    "REJECTED",
                    "EXPIRED",
                  ][record.status]
                }
              </strong>
            </p>
            <p>
              {formatUnits(record.amount, 6)} mock USDC · Provider{" "}
              <code className="hash">{record.provider}</code>
            </p>
            <p>
              Delivery deadline: {String(record.deliveryDeadline)} · Review
              deadline: {String(record.reviewDeadline)} · Challenge deadline:{" "}
              {String(record.challengeDeadline)}
            </p>
            <p>
              Observed chain timestamp: {String(chainTime)}. Refresh to check
              eligibility.
            </p>
          </div>
        )}
        <label>
          Signing wallet
          <select
            className="input"
            value={choice}
            onChange={(e) => setChoice(e.target.value)}
          >
            {w.choices.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <Button
          disabled={busy || !action || !!pending}
          onClick={() => void perform(resolve)}
        >
          {action === "refundExpired"
            ? "Refund Expired Escrow"
            : "Settle Eligible Payment"}
        </Button>
        {pending && (
          <div>
            <p>
              A wallet attempt is saved. Check wallet activity; do not approve
              another transaction.
            </p>
            <label>
              Public transaction hash
              <input
                className="input"
                value={hash}
                onChange={(e) => setHash(e.target.value)}
              />
            </label>
            <Button
              disabled={busy}
              variant="soft"
              onClick={() =>
                void perform(async () => {
                  await reconcile(pending, paymentIdSchema.parse(hash) as Hex);
                })
              }
            >
              Reconcile Saved Transaction
            </Button>
          </div>
        )}
        {message && <p role="status">{message}</p>}
      </Panel>
    </main>
  );
}
