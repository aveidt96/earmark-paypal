/**
 * Receipt-only owner mock-token mint reconciliation; never signs or rebroadcasts.
 * @param {Pick<import("viem").PublicClient,"getChainId"|"getTransactionReceipt"|"getTransaction"|"getBlockNumber">} client
 * @param {{owner:import("viem").Address,token:import("viem").Address,calldata:import("viem").Hex}} expected
 * @param {import("viem").Hex} hash
 */
export async function verifyOwnerMint(client, expected, hash) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash))
    throw Error("Invalid public mint hash.");
  if ((await client.getChainId()) !== 10143)
    throw Error("Wrong mint reconciliation chain.");
  let receipt, transaction, latest;
  try {
    [receipt, transaction, latest] = await Promise.all([
      client.getTransactionReceipt({ hash }),
      client.getTransaction({ hash }),
      client.getBlockNumber(),
    ]);
  } catch {
    throw Error(
      "Mint unconfirmed or RPC unavailable. Preserve state; do not resend.",
    );
  }
  if (
    receipt.transactionHash.toLowerCase() !== hash.toLowerCase() ||
    transaction.hash.toLowerCase() !== hash.toLowerCase() ||
    receipt.from.toLowerCase() !== expected.owner.toLowerCase() ||
    transaction.from.toLowerCase() !== expected.owner.toLowerCase() ||
    receipt.to?.toLowerCase() !== expected.token.toLowerCase() ||
    transaction.to?.toLowerCase() !== expected.token.toLowerCase() ||
    transaction.chainId !== 10143 ||
    transaction.value !== 0n ||
    transaction.input.toLowerCase() !== expected.calldata.toLowerCase()
  )
    throw Error("Transaction does not match the exact owner mint.");
  if (receipt.status !== "success")
    throw Error("Mint reverted. No success recorded; review before retrying.");
  if (latest < receipt.blockNumber + 1n)
    throw Error(
      "Mint needs two confirmations. Reconcile later; do not resend.",
    );
  return receipt;
}
