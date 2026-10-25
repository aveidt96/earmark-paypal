import { encodeDeployData, keccak256 } from "viem";

/** Read-only recovery. Only a confirmed exact owner deployment may be reused. */
export async function verifyMockTokenDeployment(client, owner, artifact, hash) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash))
    throw Error("INVALID_TRANSACTION_HASH");
  const [chainId, receipt, transaction, latest] = await Promise.all([
    client.getChainId(),
    client.getTransactionReceipt({ hash }),
    client.getTransaction({ hash }),
    client.getBlockNumber(),
  ]);
  if (
    chainId !== 10143 ||
    transaction.chainId !== 10143 ||
    receipt.status !== "success" ||
    receipt.to ||
    transaction.to ||
    receipt.from.toLowerCase() !== owner.toLowerCase() ||
    transaction.from.toLowerCase() !== owner.toLowerCase() ||
    receipt.transactionHash.toLowerCase() !== hash.toLowerCase() ||
    !receipt.contractAddress ||
    latest < receipt.blockNumber + 1n ||
    transaction.input !==
      encodeDeployData({
        abi: artifact.abi,
        bytecode: artifact.bytecode.object,
      })
  )
    throw Error("TOKEN_DEPLOYMENT_NOT_VERIFIED");
  const [code, decimals] = await Promise.all([
    client.getCode({ address: receipt.contractAddress }),
    client.readContract({
      address: receipt.contractAddress,
      abi: artifact.abi,
      functionName: "decimals",
    }),
  ]);
  if (
    !code ||
    code === "0x" ||
    code.toLowerCase() !== artifact.deployedBytecode.object.toLowerCase() ||
    decimals !== 6
  )
    throw Error("TOKEN_RUNTIME_NOT_VERIFIED");
  return {
    address: receipt.contractAddress,
    transactionHash: hash,
    blockNumber: String(receipt.blockNumber),
    codeHash: keccak256(code),
    decimals: 6,
  };
}
