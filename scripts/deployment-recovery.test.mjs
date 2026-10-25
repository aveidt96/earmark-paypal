import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { webcrypto } from "node:crypto";
import { build } from "esbuild";
import { encodeDeployData } from "viem";
import { verifyMockTokenDeployment } from "./deployment-recovery.mjs";
const artifact = JSON.parse(
  readFileSync("contracts/out/MockUSDC.sol/MockUSDC.json", "utf8"),
);
const owner = "0x9Db22De53242B5376fC4B87B523a0a91aDD0b09A";
const hash = "0x" + "11".repeat(32);
const other = "0x" + "22".repeat(32);
const address = "0x1111111111111111111111111111111111111111";
function fixture(change = {}) {
  const state = {
    chainId: 10143,
    latest: 11n,
    decimals: 6,
    code: artifact.deployedBytecode.object,
    receipt: {
      status: "success",
      from: owner,
      to: null,
      contractAddress: address,
      blockNumber: 10n,
      transactionHash: hash,
    },
    transaction: {
      chainId: 10143,
      from: owner,
      to: null,
      input: encodeDeployData({
        abi: artifact.abi,
        bytecode: artifact.bytecode.object,
      }),
    },
  };
  Object.assign(state, change);
  return {
    getChainId: async () => state.chainId,
    getBlockNumber: async () => state.latest,
    getTransactionReceipt: async () => state.receipt,
    getTransaction: async () => state.transaction,
    getCode: async () => state.code,
    readContract: async () => state.decimals,
  };
}
test("confirmed exact owner token deployment is reusable", async () => {
  const record = await verifyMockTokenDeployment(
    fixture(),
    owner,
    artifact,
    hash,
  );
  assert.equal(record.transactionHash, hash);
  assert.equal(record.address, address);
  assert.equal(record.decimals, 6);
});
for (const [name, change] of [
  ["wrong RPC chain", { chainId: 1 }],
  ["insufficient confirmations", { latest: 10n }],
  [
    "failed transaction",
    {
      receipt: {
        status: "reverted",
        from: owner,
        to: null,
        contractAddress: address,
        blockNumber: 10n,
        transactionHash: hash,
      },
    },
  ],
  [
    "wrong owner",
    {
      receipt: {
        status: "success",
        from: address,
        to: null,
        contractAddress: address,
        blockNumber: 10n,
        transactionHash: hash,
      },
    },
  ],
  [
    "noncreation transaction",
    { transaction: { chainId: 10143, from: owner, to: address, input: "0x" } },
  ],
  [
    "wrong transaction chain",
    {
      transaction: {
        chainId: 1,
        from: owner,
        to: null,
        input: artifact.bytecode.object,
      },
    },
  ],
  [
    "wrong deployment bytecode",
    { transaction: { chainId: 10143, from: owner, to: null, input: "0x00" } },
  ],
  ["wrong runtime", { code: "0x00" }],
  ["missing code", { code: "0x" }],
  ["wrong decimals", { decimals: 18 }],
])
  test("recovery rejects " + name, async () => {
    await assert.rejects(
      verifyMockTokenDeployment(fixture(change), owner, artifact, hash),
    );
  });
test("recovery rejects malformed hash before RPC", async () => {
  await assert.rejects(
    verifyMockTokenDeployment({}, owner, artifact, "0x00"),
    /INVALID_TRANSACTION_HASH/,
  );
});
const bundle = (
  await build({
    entryPoints: ["scripts/testnet-deployer-client.ts"],
    bundle: true,
    platform: "browser",
    format: "iife",
    write: false,
  })
).outputFiles[0].text;
async function clientFixture(state, recovered) {
  const output = { textContent: "" },
    button = { dataset: { action: "verify" }, disabled: false };
  const storage = new Map([
      ["earmark-testnet-deployment-v1", JSON.stringify(state)],
    ]),
    walletCalls = [],
    manifestCalls = [];
  const ethereum = {
    request: async ({ method }) => {
      walletCalls.push(method);
      if (method === "eth_requestAccounts") return [owner];
      if (method === "eth_chainId") return "0x279f";
      throw Error("FORBIDDEN_FINANCIAL_WALLET_CALL");
    },
  };
  const fetch = async (input, init) => {
    if (input === "/config")
      return Response.json({
        owner,
        contracts: {},
        confirmedTokenTransaction: recovered,
      });
    if (input === "/manifest") {
      manifestCalls.push(JSON.parse(init.body));
      return Response.json({ status: "TEST_ONLY_MANIFEST_RESPONSE" });
    }
    const request = JSON.parse(init.body);
    return Response.json({
      jsonrpc: "2.0",
      id: request.id,
      result: request.method === "eth_chainId" ? "0x279f" : "0x0",
    });
  };
  runInNewContext(bundle, {
    window: { ethereum },
    document: { querySelector: () => output, querySelectorAll: () => [button] },
    localStorage: {
      getItem: (k) => storage.get(k) ?? null,
      setItem: (k, v) => storage.set(k, v),
    },
    fetch,
    Headers,
    Request,
    Response,
    AbortController,
    URL,
    TextEncoder,
    TextDecoder,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    crypto: webcrypto,
    console,
  });
  await button.onclick();
  assert.equal(walletCalls.includes("eth_sendTransaction"), false);
  return {
    state: JSON.parse(storage.get("earmark-testnet-deployment-v1")),
    output: output.textContent,
    manifestCalls,
  };
}
test("client recovers pending token without overwriting the vault attempt or broadcasting", async () => {
  const result = await clientFixture(
    { tokenPending: true, vault: other, vaultPending: true },
    hash,
  );
  assert.equal(result.state.token, hash);
  assert.equal(result.state.tokenPending, false);
  assert.equal(result.state.vault, other);
  assert.equal(result.state.vaultPending, true);
  assert.equal(result.manifestCalls.length, 1);
  assert.equal(result.manifestCalls[0].token, hash);
});
test("client preserves a conflicting token hash and blocks further work", async () => {
  const original = {
    token: other,
    tokenPending: true,
    vault: other,
    vaultPending: true,
  };
  const result = await clientFixture(original, hash);
  assert.deepEqual(result.state, original);
  assert.match(result.output, /conflicts with verified recovery/);
  assert.equal(result.manifestCalls.length, 0);
});
test("client cannot adopt malformed server recovery data", async () => {
  const original = { tokenPending: true, vault: other };
  const result = await clientFixture(original, "invalid");
  assert.deepEqual(result.state, original);
  assert.match(result.output, /Invalid server-confirmed token hash/);
  assert.equal(result.manifestCalls.length, 0);
});
