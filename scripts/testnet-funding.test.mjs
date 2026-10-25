import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyOwnerMint } from "./testnet-funding-recovery.mjs";
const owner = "0x" + "1".repeat(40),
  token = "0x" + "2".repeat(40),
  hash = "0x" + "3".repeat(64),
  calldata = "0xabcdef";
function fixture() {
  const receipt = {
    transactionHash: hash,
    from: owner,
    to: token,
    status: "success",
    blockNumber: 100n,
  };
  const transaction = {
    hash,
    from: owner,
    to: token,
    chainId: 10143,
    value: 0n,
    input: calldata,
  };
  return {
    receipt,
    transaction,
    client: {
      getChainId: async () => 10143,
      getTransactionReceipt: async () => receipt,
      getTransaction: async () => transaction,
      getBlockNumber: async () => 101n,
    },
  };
}
test("exact successful owner mint with two confirmations reconciles without signing", async () => {
  const f = fixture();
  assert.equal(
    await verifyOwnerMint(f.client, { owner, token, calldata }, hash),
    f.receipt,
  );
});
test("mint reconciliation rejects wrong owner, token, calldata, network and value", async () => {
  for (const field of ["from", "to", "input", "chainId", "value", "hash"]) {
    const f = fixture();
    f.transaction[field] =
      field === "chainId"
        ? 1
        : field === "value"
          ? 1n
          : field === "input"
            ? "0xdead"
            : field === "hash"
              ? "0x" + "4".repeat(64)
              : "0x" + "4".repeat(40);
    await assert.rejects(
      verifyOwnerMint(f.client, { owner, token, calldata }, hash),
      /does not match/,
    );
  }
});
test("reverted mint cannot become confirmed", async () => {
  const f = fixture();
  f.receipt.status = "reverted";
  await assert.rejects(
    verifyOwnerMint(f.client, { owner, token, calldata }, hash),
    /reverted/,
  );
});
test("single confirmation retains uncertain state and requires reconciliation", async () => {
  const f = fixture();
  f.client.getBlockNumber = async () => 100n;
  await assert.rejects(
    verifyOwnerMint(f.client, { owner, token, calldata }, hash),
    /two confirmations/,
  );
});
test("RPC uncertainty never invokes signing or rebroadcast", async () => {
  const f = fixture();
  let sends = 0;
  f.client.getTransactionReceipt = async () => {
    throw Error("timeout");
  };
  f.client.sendTransaction = () => {
    sends++;
  };
  await assert.rejects(
    verifyOwnerMint(f.client, { owner, token, calldata }, hash),
    /do not resend/,
  );
  assert.equal(sends, 0);
});
test("malformed hashes and wrong RPC chain fail before receipt reads", async () => {
  const f = fixture();
  let reads = 0;
  f.client.getTransactionReceipt = async () => {
    reads++;
    return f.receipt;
  };
  await assert.rejects(
    verifyOwnerMint(f.client, { owner, token, calldata }, "bad"),
    /Invalid/,
  );
  f.client.getChainId = async () => 1;
  await assert.rejects(
    verifyOwnerMint(f.client, { owner, token, calldata }, hash),
    /Wrong/,
  );
  assert.equal(reads, 0);
});
