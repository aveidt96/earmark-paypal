import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { build } from "esbuild";
import { createPublicClient, http, keccak256 } from "viem";
import { monadTestnet } from "viem/chains";
const manifest = JSON.parse(
  readFileSync("deployments/monad-testnet.json", "utf8"),
);
if (
  manifest.application !== "Earmark" ||
  manifest.environment !== "testnet" ||
  manifest.chainId !== 10143 ||
  manifest.owner.toLowerCase() !==
    "0x9db22de53242b5376fc4b87b523a0a91add0b09a" ||
  manifest.vault.address.toLowerCase() !==
    "0x37c026c7207de8f202a06726eb02e6233ed06160" ||
  manifest.token.address.toLowerCase() !==
    "0x8f4660ed18a3ba5ba9dbe64e18f06ef4a43c0136"
)
  throw Error("FUNDING_MANIFEST_MISMATCH");
const client = createPublicClient({
  chain: monadTestnet,
  transport: http("https://testnet-rpc.monad.xyz", {
    timeout: 15000,
    retryCount: 0,
  }),
});
const abi = JSON.parse(
  readFileSync("contracts/out/TaskVault.sol/TaskVault.json", "utf8"),
).abi;
if ((await client.getChainId()) !== 10143) throw Error("FUNDING_WRONG_CHAIN");
const [tokenCode, vaultCode, owner, token] = await Promise.all([
  client.getCode({ address: manifest.token.address }),
  client.getCode({ address: manifest.vault.address }),
  client.readContract({
    address: manifest.vault.address,
    abi,
    functionName: "owner",
  }),
  client.readContract({
    address: manifest.vault.address,
    abi,
    functionName: "paymentToken",
  }),
]);
if (
  !tokenCode ||
  !vaultCode ||
  keccak256(tokenCode) !== manifest.token.codeHash ||
  keccak256(vaultCode) !== manifest.vault.codeHash ||
  owner.toLowerCase() !== manifest.owner.toLowerCase() ||
  token.toLowerCase() !== manifest.token.address.toLowerCase()
)
  throw Error("FUNDING_DEPLOYMENT_MISMATCH");
const config = {
  chainId: 10143,
  owner: manifest.owner,
  token: manifest.token.address,
  tokenCodeHash: manifest.token.codeHash,
  vault: manifest.vault.address,
  vaultCodeHash: manifest.vault.codeHash,
  amount: "20000000",
};
const bundled = await build({
  entryPoints: ["scripts/testnet-funding-client.ts"],
  bundle: true,
  platform: "browser",
  format: "esm",
  write: false,
});
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Earmark — Testnet mock-token funding</title><style>body{font:17px system-ui;background:#eaf6ff;color:#092454;max-width:850px;margin:50px auto;padding:24px}main{background:#ffffffbb;border:1px solid white;border-radius:28px;padding:30px;box-shadow:0 16px 70px #538ec025}button{background:#1677ff;color:white;border:0;border-radius:18px;padding:15px;margin:8px;cursor:pointer}button:disabled{opacity:.5}input{width:95%;padding:12px;border-radius:14px;border:1px solid #b8ddff}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:white;padding:20px;border-radius:18px}label{display:block}</style><main><h1>Earmark testnet setup</h1><p>Monad Testnet · Chain 10143 · Mock assets only</p><p>This page can only mint 20 mock USDC to the approved owner. It cannot deploy, deposit, withdraw or request a payment. Your key stays in Rabby or MetaMask.</p><p>Owner: ${config.owner}<br>Existing mock token: ${config.token}</p><button data-action="network">Switch to Monad Testnet</button><button data-action="mint">Mint / reconcile 20 mock USDC</button><label for="hash">Public mint transaction hash (only for reconciliation)</label><input id="hash" placeholder="0x…" autocomplete="off"><button data-action="reconcile">Reconcile this mint hash</button><pre role="status" aria-live="polite">Connect the approved owner wallet. No transaction starts automatically.</pre><p>After confirmation, use the public Earmark Vault Balance panel to deposit 20 mock USDC. Do not approve another mint after an uncertain result.</p></main><script type="module" src="/client.js"></script></html>`;
const server = createServer((req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self' https://testnet-rpc.monad.xyz; frame-ancestors 'none'; base-uri 'none'",
  );
  if (req.headers.host !== "127.0.0.1:3345" || req.method !== "GET") {
    res.writeHead(403);
    res.end("REQUEST_REJECTED");
    return;
  }
  if (req.url === "/") {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(html);
    return;
  }
  if (req.url === "/client.js") {
    res.setHeader("Content-Type", "text/javascript; charset=utf-8");
    res.end(bundled.outputFiles[0].text);
    return;
  }
  if (req.url === "/config") {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(config));
    return;
  }
  res.writeHead(404);
  res.end("NOT_FOUND");
});
server.listen(3345, "127.0.0.1", () =>
  console.log(
    "Owner funding page: http://127.0.0.1:3345 — existing verified contracts only; no automatic transaction.",
  ),
);
process.once("SIGTERM", () => server.close());
process.once("SIGINT", () => server.close());
