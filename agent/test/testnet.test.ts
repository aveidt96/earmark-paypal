import { describe, it, expect } from "vitest";
import { parseRuntimeConfig, runtimeChain } from "../src/runtime-config.js";
import { createDatabase } from "../src/postgres.js";
import { EventStream } from "../src/domain.js";
const base = {
  AGENT_CHAIN_ID: "10143",
  AGENT_ENABLE_TESTNET: "true",
  AGENT_RPC_URL: "https://testnet-rpc.monad.xyz",
  TASK_VAULT_ADDRESS: "0x" + "11".repeat(20),
  AGENT_EXPECTED_VAULT_ADDRESS: "0x" + "11".repeat(20),
  AGENT_PAYMENT_TOKEN: "0x" + "22".repeat(20),
  AGENT_VAULT_CODE_HASH: "0x" + "33".repeat(32),
  AGENT_TOKEN_CODE_HASH: "0x" + "44".repeat(32),
  AGENT_PRIVATE_KEY: "0x" + "55".repeat(32),
};
describe("explicit testnet configuration", () => {
  it("permits only opted-in pinned Monad Testnet with the official RPC", () => {
    expect(parseRuntimeConfig(base).AGENT_CHAIN_ID).toBe("10143");
    expect(runtimeChain(10143).id).toBe(10143);
  });
  it("rejects mainnet, missing opt-in/token pin, redirect URLs and alternate network origins", () => {
    for (const override of [
      { AGENT_CHAIN_ID: "143" },
      { AGENT_ENABLE_TESTNET: undefined },
      { AGENT_TOKEN_CODE_HASH: undefined },
      { AGENT_RPC_URL: "https://rpc.monad.xyz" },
      { AGENT_RPC_URL: "http://testnet-rpc.monad.xyz" },
      { AGENT_RPC_URL: "https://testnet-rpc.monad.xyz/?key=secret" },
      { AGENT_RPC_URL: "https://testnet-rpc.monad.xyz:1234/" },
    ])
      expect(() => parseRuntimeConfig({ ...base, ...override })).toThrow(
        "INVALID_RUNTIME_CONFIGURATION",
      );
  });
  it("rejects transaction-mode poolers and arbitrary database origins without echoing credentials", () => {
    for (const url of [
      "postgresql://user:private@ep-example-pooler.neon.tech/db",
      "postgresql://user:private@attacker.example/db",
      "postgresql://user:private@localhost/db",
    ])
      expect(() => createDatabase(url)).toThrow(
        "DIRECT_NEON_DATABASE_REQUIRED",
      );
  });
  it("sets the server deadline through startup options without extending client limits", async () => {
    const pool = createDatabase(
      "postgresql://synthetic:synthetic@ep-example.neon.tech/synthetic",
    );
    expect(pool.options).toMatchObject({
      options: "-c statement_timeout=10000",
      statement_timeout: 10000,
      query_timeout: 15000,
      connectionTimeoutMillis: 10000,
      max: 4,
    });
    await pool.end(); // No client was opened and no network request is made.
  });
  it("waits for asynchronous event durability and propagates persistence failures", async () => {
    let release: (() => void) | undefined;
    const events = new EventStream(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    events.emit("model.decision", "model", { summary: "safe" });
    let done = false;
    const flush = events.flush().then(() => {
      done = true;
    });
    await Promise.resolve();
    expect(done).toBe(false);
    release?.();
    await flush;
    expect(done).toBe(true);
    const failed = new EventStream(async () => {
      throw Error("PERSISTENCE_FAILED");
    });
    failed.emit("payment.requested", "application");
    await expect(failed.flush()).rejects.toThrow("PERSISTENCE_FAILED");
  });
});
