import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep, basename } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { generatePrivateKey } from "viem/accounts";
import {
  identity,
  quoteSchema,
  artifactHash,
  deliverySchema,
  toolNames,
} from "../src/domain.js";
import { VaultChain } from "../src/chain.js";
import { IntentStore, type IntentRecord } from "../src/store.js";
import { parseRuntimeConfig } from "../src/runtime-config.js";
import {
  inspectArtifact,
  validateQuote,
  weatherArtifact,
} from "../src/providers.js";
import { zeroHash, type Address } from "viem";
const address = `0x${"1".repeat(40)}` as Address;
const provider = { id: "datahub", name: "DataHub", address };
const taskHash = identity("task"),
  quoteId = identity("quote"),
  paymentId = identity("payment");
const artifact = weatherArtifact(taskHash, quoteId, provider.id);
const quote = quoteSchema.parse({
  providerId: provider.id,
  taskHash,
  quoteId,
  token: address,
  price: "6000000",
  expiresAt: 2000,
  currency: "mock-USDC",
  decimals: 6,
  commitment: artifactHash(artifact),
  description: "untrusted",
});
const mandate = { taskHash, token: address, trustedHash: zeroHash };
const payment = {
  id: paymentId,
  taskHash,
  requestId: identity("request"),
  agent: address,
  provider: address,
  token: address,
  amount: "6000000",
  status: "SUBMITTED" as const,
  deliveryDeadline: 1500,
  reviewDeadline: 1800,
  challengeDeadline: 0,
  expectedHash: zeroHash,
  deliveredHash: quote.commitment,
};
const dirs: string[] = [];
afterEach(async () => {
  for (const dir of dirs.splice(0)) {
    if (
      !resolve(dir).startsWith(resolve(tmpdir()) + sep) ||
      !basename(dir).startsWith("flint-agent-test-")
    )
      throw new Error("Unexpected test cleanup directory");
    await rm(dir, { recursive: true, force: true });
  }
});
describe("quote and deterministic delivery policy", () => {
  it("validates an exact base-unit quote", () =>
    expect(validateQuote(quote, provider, mandate, "10000000", 1000)).toEqual(
      quote,
    ));
  it.each([
    { price: "6.0" },
    { price: "0" },
    { price: "-1" },
    { price: "6000000e0" },
    { price: "11000000" },
    { token: `0x${"2".repeat(40)}` },
    { taskHash: identity("other") },
    { providerId: "other" },
    { expiresAt: 1000 },
    { currency: "ETH" },
    { decimals: 18 },
    { recipient: address },
  ])("rejects unsafe quote fields %#", (change) =>
    expect(() =>
      validateQuote(
        { ...quote, ...change },
        provider,
        mandate,
        "10000000",
        1000,
      ),
    ).toThrow(),
  );
  it("enforces optional trusted commitment", () =>
    expect(() =>
      validateQuote(
        quote,
        provider,
        { ...mandate, trustedHash: identity("other-hash") },
        "10000000",
        1000,
      ),
    ).toThrow("QUOTE_POLICY_VIOLATION"));
  it("binds delivered structure and commitment to quote/task/payment", () =>
    expect(
      inspectArtifact({ paymentId, quoteId, artifact }, quote, payment),
    ).toEqual(artifact));
  it.each([
    { paymentId: identity("other") },
    { quoteId: identity("other") },
    { artifact: { ...artifact, taskHash: identity("other") } },
    { artifact: { ...artifact, rows: [] } },
    {
      artifact: {
        ...artifact,
        rows: [
          { city: "Lagos", temperature: 99 },
          { city: "Abuja", temperature: 99 },
        ],
      },
    },
  ])("rejects wrong delivery association/content %#", (change) =>
    expect(() =>
      inspectArtifact(
        { paymentId, quoteId, artifact, ...change },
        quote,
        payment,
      ),
    ).toThrow(),
  );
  it("requires actual onchain submission", () =>
    expect(() =>
      inspectArtifact({ paymentId, quoteId, artifact }, quote, {
        ...payment,
        status: "FUNDED",
      }),
    ).toThrow());
  it("does not accept extra artifact instructions as schema fields", () =>
    expect(() =>
      deliverySchema.parse({
        paymentId,
        quoteId,
        artifact: { ...artifact, execute: "withdraw" },
      }),
    ).toThrow());
  it("exposes exactly the requested tool names", () =>
    expect(toolNames).toEqual([
      "getMandate",
      "listApprovedProviders",
      "getProviderQuote",
      "getVaultBalance",
      "getPaymentStatus",
      "requestMandatePayment",
      "inspectDelivery",
      "acceptDelivery",
    ]));
});
describe("server-only local runtime configuration", () => {
  const env = () => ({
    AGENT_CHAIN_ID: "31337",
    AGENT_RPC_URL: "http://127.0.0.1:8545",
    TASK_VAULT_ADDRESS: address,
    AGENT_EXPECTED_VAULT_ADDRESS: address,
    AGENT_PAYMENT_TOKEN: address,
    AGENT_VAULT_CODE_HASH: identity("code"),
    AGENT_PRIVATE_KEY: generatePrivateKey(),
  });
  it("rejects invalid signing-key scalar without echoing it", () =>
    expect(
      () =>
        new VaultChain(
          parseRuntimeConfig({
            ...env(),
            AGENT_PRIVATE_KEY: `0x${"0".repeat(64)}`,
          }),
        ),
    ).toThrow(/^INVALID_AGENT_KEY$/));
  it("rejects unexpected configured vault", () =>
    expect(() =>
      parseRuntimeConfig({
        ...env(),
        TASK_VAULT_ADDRESS: `0x${"2".repeat(40)}`,
      }),
    ).toThrow("UNEXPECTED_VAULT_ADDRESS"));
  it("rejects unexpected chain ID", () =>
    expect(() =>
      parseRuntimeConfig({ ...env(), AGENT_CHAIN_ID: "10143" }),
    ).toThrow("INVALID_RUNTIME_CONFIGURATION"));
  it.each([
    "https://external.example",
    "http://127.0.0.1:8545?key=secret",
    "http://user:secret@localhost:8545",
  ])("rejects unsafe RPC URL %s", (AGENT_RPC_URL) =>
    expect(() => parseRuntimeConfig({ ...env(), AGENT_RPC_URL })).toThrow(
      /^INVALID_RUNTIME_CONFIGURATION$/,
    ),
  );
  it("rejects missing key without echoing supplied values", () =>
    expect(() =>
      parseRuntimeConfig({
        ...env(),
        AGENT_PRIVATE_KEY: "synthetic-sensitive-invalid-value",
      }),
    ).toThrow(/^INVALID_RUNTIME_CONFIGURATION$/));
});
describe("durable idempotency store", () => {
  async function store() {
    const dir = await mkdtemp(join(tmpdir(), "flint-agent-test-"));
    dirs.push(dir);
    return new IntentStore(join(dir, "intents.json"));
  }
  const record = (): IntentRecord => ({
    key: identity("intent"),
    requestId: identity("request"),
    paymentId,
    genesisHash: identity("genesis"),
    quote,
  });
  it("persists immutable intent and transaction identity across instances without keys/raw transactions", async () => {
    const s = await store();
    const r = record();
    r.requestTx = { hash: identity("tx"), nonce: 0, state: "prepared" };
    await s.exclusive(() => s.put(r));
    expect(await new IntentStore(s.path).get(r.key)).toEqual(r);
    const text = await readFile(s.path, "utf8");
    expect(text).not.toContain("privateKey");
    expect(text).not.toContain("serialized");
  });
  it("rejects an unlocked financial journal write", async () => {
    const s = await store();
    await expect(s.put(record())).rejects.toThrow("INTENT_STORE_NOT_LOCKED");
  });
  it("rejects concurrent writers and releases the lock", async () => {
    const s = await store();
    await s.exclusive(async () => {
      await expect(
        new IntentStore(s.path).exclusive(async () => {}),
      ).rejects.toThrow("INTENT_STORE_LOCKED");
    });
    await expect(s.exclusive(async () => "ok")).resolves.toBe("ok");
  });
  it("rejects quote mutation", async () => {
    const s = await store();
    const r = record();
    await s.exclusive(async () => {
      await s.put(r);
      await expect(
        s.put({ ...r, quote: { ...quote, price: "8000000" } }),
      ).rejects.toThrow("INTENT_TERMS_IMMUTABLE");
    });
  });
  it("rejects transaction hash/nonce replacement", async () => {
    const s = await store();
    const r = {
      ...record(),
      requestTx: { hash: identity("tx"), nonce: 0, state: "prepared" as const },
    };
    await s.exclusive(async () => {
      await s.put(r);
      await expect(
        s.put({
          ...r,
          requestTx: { ...r.requestTx, hash: identity("replacement") },
        }),
      ).rejects.toThrow("TRANSACTION_IDENTITY_IMMUTABLE");
    });
  });
  it("fails closed on corrupt persisted state", async () => {
    const s = await store();
    await writeFile(s.path, "broken-json");
    await expect(s.get(record().key)).rejects.toThrow("INTENT_STORE_CORRUPT");
  });
});
