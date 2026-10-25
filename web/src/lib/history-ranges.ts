/** Four bounded RPC calls per refresh; official Monad Testnet permits only 100-block ranges. */
export function historyBatch(
  start: bigint,
  latest: bigint,
  chainId: 31337 | 10143,
) {
  if (start < 0n || latest < start)
    throw Error("HISTORY_RANGE_REVIEW_REQUIRED");
  const size = chainId === 10143 ? 100n : 1000n;
  const target =
    start + size * 4n - 1n < latest ? start + size * 4n - 1n : latest;
  const ranges: { fromBlock: bigint; toBlock: bigint }[] = [];
  for (let from = start; from <= target; from += size) {
    ranges.push({
      fromBlock: from,
      toBlock: from + size - 1n < target ? from + size - 1n : target,
    });
  }
  return { target, ranges };
}
