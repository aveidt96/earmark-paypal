import { createServer } from "node:http";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { build } from "esbuild";
import { createPublicClient, http, encodeDeployData, keccak256 } from "viem";
import { monadTestnet } from "viem/chains";
import { verifyMockTokenDeployment } from "./deployment-recovery.mjs";
const owner = "0x9Db22De53242B5376fC4B87B523a0a91aDD0b09A";
const origin = "http://127.0.0.1:3344";
const sourceCommit = execFileSync(
  "git",
  [
    "-c",
    "safe.directory=C:/Users/USER/Documents/project-prometheus/project-flint",
    "rev-parse",
    "HEAD",
  ],
  { encoding: "utf8", windowsHide: true },
).trim();
const contracts = Object.fromEntries(
  ["MockUSDC", "TaskVault"].map((name) => {
    const a = JSON.parse(
      readFileSync(`contracts/out/${name}.sol/${name}.json`, "utf8"),
    );
    return [name, { abi: a.abi, bytecode: a.bytecode.object }];
  }),
);
const bundled = await build({
  entryPoints: ["scripts/testnet-deployer-client.ts"],
  bundle: true,
  platform: "browser",
  format: "esm",
  write: false,
});
const client = createPublicClient({
  chain: monadTestnet,
  transport: http("https://testnet-rpc.monad.xyz", {
    retryCount: 0,
    timeout: 15000,
  }),
});
if ((await client.getChainId()) !== 10143) throw Error("UNEXPECTED_CHAIN");
const recoveryFile = "deployments/monad-testnet-token.json";
let confirmedTokenTransaction;
if (existsSync(recoveryFile)) {
  const recovery = JSON.parse(readFileSync(recoveryFile, "utf8"));
  if (
    recovery.application !== "Earmark" ||
    recovery.chainId !== 10143 ||
    recovery.owner.toLowerCase() !== owner.toLowerCase()
  )
    throw Error("TOKEN_RECOVERY_SCOPE_MISMATCH");
  const artifact = JSON.parse(
    readFileSync("contracts/out/MockUSDC.sol/MockUSDC.json", "utf8"),
  );
  const verified = await verifyMockTokenDeployment(
    client,
    owner,
    artifact,
    recovery.token.transactionHash,
  );
  if (
    verified.address.toLowerCase() !== recovery.token.address.toLowerCase() ||
    verified.codeHash !== recovery.token.codeHash
  )
    throw Error("TOKEN_RECOVERY_RECORD_MISMATCH");
  confirmedTokenTransaction = verified.transactionHash;
}
const file = "deployments/monad-testnet.json";
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Earmark — Owner deployment</title><style>body{font:17px system-ui;background:#eaf6ff;color:#092454;max-width:900px;margin:70px auto;padding:25px}section{background:#ffffffbb;border-radius:28px;padding:35px}button{padding:15px;border:0;border-radius:20px;background:#1677ff;color:white;margin:8px;cursor:pointer}button:disabled{opacity:.5}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:white;padding:20px;border-radius:18px}</style><section><h1>Earmark testnet deployment</h1><p>Owner: ${owner}</p><p>Monad Testnet · Chain 10143 · Testnet MON only</p><p>Deploy the tested Mock USDC (6 decimals), then TaskVault with the displayed owner and confirmed token. No mandate, deposit or payment is submitted here. Your key stays in your wallet.</p><p>Each button requests one wallet approval. Saved transaction hashes are reconciled before any retry. Do not clear browser storage after an uncertain result.</p><button data-action="network">Switch to Monad Testnet</button><button data-action="token">1. Deploy / reconcile Mock USDC</button><button data-action="vault">2. Deploy / reconcile TaskVault</button><button data-action="verify">3. Verify and save manifest</button><pre aria-live="polite">Checking public testnet state…</pre></section><script type="module" src="/client.js"></script></html>`;
const server = createServer(async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  try {
    if (req.headers.host !== "127.0.0.1:3344")
      throw Error("LOCAL_HOST_REQUIRED");
    if (req.method === "GET" && req.url === "/") {
      res.setHeader("Content-Type", "text/html");
      return res.end(html);
    }
    if (req.method === "GET" && req.url === "/client.js") {
      res.setHeader("Content-Type", "text/javascript");
      return res.end(bundled.outputFiles[0].text);
    }
    if (req.method === "GET" && req.url === "/config") {
      res.setHeader("Content-Type", "application/json");
      return res.end(
        JSON.stringify({
          owner,
          contracts,
          sourceCommit,
          confirmedTokenTransaction,
        }),
      );
    }
    if (
      req.method !== "POST" ||
      req.url !== "/manifest" ||
      req.headers.origin !== origin
    )
      throw Error("UNKNOWN_OR_UNTRUSTED_REQUEST");
    let body = "";
    for await (const part of req) {
      body += part;
      if (body.length > 1000) throw Error("REQUEST_TOO_LARGE");
    }
    const hashes = JSON.parse(body);
    if (
      !/^0x[0-9a-fA-F]{64}$/.test(hashes.token) ||
      !/^0x[0-9a-fA-F]{64}$/.test(hashes.vault)
    )
      throw Error("INVALID_TRANSACTION_HASH");
    const [token, vault] = await Promise.all([
      client.getTransactionReceipt({ hash: hashes.token }),
      client.getTransactionReceipt({ hash: hashes.vault }),
    ]);
    const latest = await client.getBlockNumber();
    for (const receipt of [token, vault])
      if (
        receipt.status !== "success" ||
        receipt.from.toLowerCase() !== owner.toLowerCase() ||
        receipt.to ||
        !receipt.contractAddress ||
        latest < receipt.blockNumber + 1n
      )
        throw Error("UNCONFIRMED_OWNER_DEPLOYMENT");
    for (const [receipt, artifact, args] of [
      [token, contracts.MockUSDC, []],
      [vault, contracts.TaskVault, [owner, token.contractAddress]],
    ]) {
      const tx = await client.getTransaction({ hash: receipt.transactionHash });
      if (
        tx.chainId !== 10143 ||
        tx.input !== encodeDeployData({ ...artifact, args })
      )
        throw Error("DEPLOYMENT_ARTIFACT_OR_CONSTRUCTOR_MISMATCH");
    }
    const configuredOwner = await client.readContract({
      address: vault.contractAddress,
      abi: contracts.TaskVault.abi,
      functionName: "owner",
    });
    const configuredToken = await client.readContract({
      address: vault.contractAddress,
      abi: contracts.TaskVault.abi,
      functionName: "paymentToken",
    });
    const decimals = await client.readContract({
      address: token.contractAddress,
      abi: contracts.MockUSDC.abi,
      functionName: "decimals",
    });
    if (
      configuredOwner.toLowerCase() !== owner.toLowerCase() ||
      configuredToken.toLowerCase() !== token.contractAddress.toLowerCase() ||
      decimals !== 6
    )
      throw Error("DEPLOYED_CONFIGURATION_MISMATCH");
    const manifest = {
      application: "Earmark",
      environment: "testnet",
      chainId: 10143,
      rpcUrl: "https://testnet-rpc.monad.xyz",
      owner,
      sourceCommit,
      abiVersion: "TaskVault-stage4",
      token: {
        address: token.contractAddress,
        transactionHash: token.transactionHash,
        codeHash: keccak256(
          await client.getCode({ address: token.contractAddress }),
        ),
        decimals: 6,
      },
      vault: {
        address: vault.contractAddress,
        transactionHash: vault.transactionHash,
        deploymentBlock: String(vault.blockNumber),
        codeHash: keccak256(
          await client.getCode({ address: vault.contractAddress }),
        ),
      },
    };
    if (existsSync(file)) {
      const prior = JSON.parse(readFileSync(file, "utf8"));
      if (
        prior.token.transactionHash !== token.transactionHash ||
        prior.vault.transactionHash !== vault.transactionHash
      )
        throw Error("EXISTING_MANIFEST_PRESERVED");
    } else {
      mkdirSync("deployments", { recursive: true });
      writeFileSync(file, JSON.stringify(manifest, null, 2) + "\n", {
        flag: "wx",
      });
    }
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(manifest));
  } catch {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({ error: "DEPLOYMENT_NOT_VERIFIED_RECONCILE_REQUIRED" }),
    );
  }
});
server.listen(3344, "127.0.0.1", () =>
  console.log(
    "Earmark owner signing page: " +
      origin +
      " (testnet only; no transactions until owner approves)",
  ),
);
