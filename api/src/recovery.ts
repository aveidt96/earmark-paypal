import {
  PostgresIntentStore,
  intentSchema,
  type Pool,
  type VaultChain,
} from "@flint/agent/server";
import { paymentIdentity } from "@flint/agent/schema";
import type { Hex } from "viem";
import type { WorkspaceService } from "../../web/src/server/service";
import { PostgresWorkspaceStore } from "../../web/src/server/postgres-store";
/** Receipt-only recovery: no signing, broadcast, provider submission or new model decision. */
export async function reconcileHosted(service: WorkspaceService, pool: Pool) {
  const chain: VaultChain = service.options.chain,
    scope = String(chain.chainId) + ":" + chain.vault.toLowerCase();
  let count = 0,
    cursor = "";
  for (;;) {
    const rows = await pool.query<{
      record: unknown;
      run_id: Hex;
      mandate_id: Hex;
      intent_id: string;
    }>(
      "SELECT record,run_id,mandate_id,intent_id FROM earmark_intents WHERE scope=$1 AND intent_id>$2 ORDER BY intent_id LIMIT 100",
      [scope + ":" + chain.agent.toLowerCase(), cursor],
    );
    if (!rows.rows.length) break;
    cursor = rows.rows[rows.rows.length - 1]?.intent_id ?? cursor;
    count += rows.rows.length;
    const db = new PostgresWorkspaceStore(pool, scope, {
      vault: chain.vault,
      genesis: await chain.genesis(),
    });
    for (const row of rows.rows) {
      const journal = new PostgresIntentStore(
        pool,
        scope + ":" + chain.agent.toLowerCase(),
        {
          runId: row.run_id,
          mandateId: row.mandate_id,
          providers: service.config.providers,
        },
      );
      await journal.exclusive(async () => {
        const record = intentSchema.parse(row.record);
        if (
          record.genesisHash !== (await chain.genesis()) ||
          record.quote.taskHash !== row.mandate_id ||
          record.paymentId !==
            paymentIdentity(
              chain.chainId,
              chain.vault,
              row.mandate_id,
              chain.agent,
              record.requestId,
            )
        )
          throw new Error("INTENT_CHAIN_MISMATCH");
        for (const action of ["requestTx", "acceptTx"] as const) {
          const tx = record[action];
          if (!tx) continue;
          const receipt = await chain.receipt(tx.hash);
          if (!receipt) {
            if (["confirmed", "reverted"].includes(tx.state))
              throw new Error("CHAIN_REORG_REVIEW_REQUIRED");
            continue;
          }
          if (receipt.status === "success" && action === "requestTx")
            chain.verifyFundedEvent(receipt, record.paymentId);
          tx.state = receipt.status === "success" ? "confirmed" : "reverted";
        }
        await journal.put(record);
        const p = await chain.payment(record.paymentId);
        const provider = service.config.providers.find(
          (i) => i.id === record.quote.providerId,
        );
        if (
          p &&
          (!provider ||
            p.taskHash !== row.mandate_id ||
            p.requestId !== record.requestId ||
            p.agent.toLowerCase() !== chain.agent.toLowerCase() ||
            p.provider.toLowerCase() !== provider.address.toLowerCase() ||
            p.token.toLowerCase() !== chain.token.toLowerCase() ||
            p.amount !== record.quote.price)
        )
          throw new Error("PAYMENT_BINDING_MISMATCH");
        await db.mutate((state) => {
          const run = state.runs[row.run_id];
          if (!run) return;
          if (p) run.paymentId = p.id;
          run.status =
            p?.status === "COMPLETED"
              ? "completed"
              : p?.status === "REJECTED" || p?.status === "EXPIRED"
                ? "refunded"
                : p?.status === "ACCEPTED"
                  ? "awaiting-challenge"
                  : "interrupted";
          if (run.status === "interrupted")
            run.error = "SERVER_RESTART_RECONCILE_REQUIRED";
        });
      });
    }
  }
  return { intents: count };
}
