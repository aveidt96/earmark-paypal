import type { Pool } from "@flint/agent/server";
import {
  workspaceStateSchema,
  type WorkspaceState,
  type WorkspaceRepository,
} from "./store";

export class PostgresWorkspaceStore implements WorkspaceRepository {
  constructor(
    readonly pool: Pool,
    readonly scope: string,
    readonly initial: Pick<WorkspaceState, "vault" | "genesis">,
  ) {}
  private parse(raw: unknown) {
    const state = workspaceStateSchema.parse(raw);
    if (
      state.genesis !== this.initial.genesis ||
      state.vault.toLowerCase() !== this.initial.vault.toLowerCase()
    )
      throw new Error("WORKSPACE_CHAIN_MISMATCH");
    return state;
  }
  private empty(): WorkspaceState {
    return {
      version: 1,
      vault: this.initial.vault.toLowerCase() as WorkspaceState["vault"],
      genesis: this.initial.genesis,
      nextId: 1,
      mandates: {},
      challenges: {},
      runs: {},
      events: [],
      seen: {},
    };
  }
  async read() {
    const result = await this.pool.query<{ state: unknown }>(
      "SELECT state FROM earmark_workspaces WHERE scope=$1",
      [this.scope],
    );
    return result.rows[0] ? this.parse(result.rows[0].state) : this.empty();
  }
  async mutate<T>(work: (state: WorkspaceState) => T): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "INSERT INTO earmark_workspaces(scope,state) VALUES($1,$2) ON CONFLICT DO NOTHING",
        [this.scope, JSON.stringify(this.empty())],
      );
      const row = await client.query<{ state: unknown }>(
        "SELECT state FROM earmark_workspaces WHERE scope=$1 FOR UPDATE",
        [this.scope],
      );
      const state = this.parse(row.rows[0]?.state);
      const oldNext = state.nextId;
      const result = work(state);
      if (result instanceof Promise)
        throw new Error("ASYNC_DATABASE_MUTATION_FORBIDDEN");
      workspaceStateSchema.parse(state);
      for (const [nonce, c] of Object.entries(state.challenges)) {
        const changed = await client.query(
          `INSERT INTO earmark_launch_nonces(scope,nonce,mandate_id,consumed,expires_at,record)
          VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(scope,nonce) DO UPDATE SET consumed=EXCLUDED.consumed,record=EXCLUDED.record
          WHERE NOT earmark_launch_nonces.consumed OR EXCLUDED.consumed`,
          [
            this.scope,
            nonce,
            c.mandateId,
            c.used,
            c.expiresAt,
            JSON.stringify(c),
          ],
        );
        if (!changed.rowCount) throw new Error("AUTHORIZATION_EXPIRED_OR_USED");
      }
      for (const r of [
        ...Object.values(state.runs),
        ...Object.values(state.geminiSessions ?? {}),
      ])
        await client.query(
          `INSERT INTO earmark_runs(scope,run_id,record)
        VALUES($1,$2,$3) ON CONFLICT(scope,run_id) DO UPDATE SET record=EXCLUDED.record,updated_at=now()`,
          [this.scope, r.id, JSON.stringify(r)],
        );
      for (const e of state.events.filter((e) => e.id >= oldNext))
        await client.query(
          "INSERT INTO earmark_events(scope,event_id,record) VALUES($1,$2,$3)",
          [this.scope, e.id, JSON.stringify(e)],
        );
      await client.query(
        "UPDATE earmark_workspaces SET state=$2,updated_at=now() WHERE scope=$1",
        [this.scope, JSON.stringify(state)],
      );
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error instanceof Error && /^[A-Z0-9_]+$/.test(error.message)
        ? error
        : new Error("DATABASE_PERSISTENCE_FAILURE");
    } finally {
      client.release();
    }
  }
}
