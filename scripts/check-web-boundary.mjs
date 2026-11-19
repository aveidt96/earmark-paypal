import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
const root = "web/.next/static";
function files(path) {
  return readdirSync(path, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(path, e.name)) : [join(path, e.name)],
  );
}
const chunks = files(root).filter((f) => f.endsWith(".js"));
const publicDemo = process.env.NEXT_PUBLIC_DEMO_ONLY === "true";
for (const file of chunks) {
  const source = readFileSync(file, "utf8");
  if (
    /AGENT_PRIVATE_KEY|SIM_DATAHUB_PRIVATE_KEY|SIM_WEATHERCO_PRIVATE_KEY|AI_API_KEY|GEMINI_API_KEY|TAVILY_API_KEY|BRAVE_SEARCH_API_KEY|DATABASE_URL|EARMARK_RESEARCH_QUOTA_SECRET|EARMARK_JUDGE_(?:LOGIN|SESSION)_SECRET|PAYPAL_(?:(?:ORIGINAL|OLD)_)?CLIENT_(?:ID|SECRET)|PAYPAL_WEBHOOK_ID|PAYPAL_TEST_LOGIN_SECRET|PAYPAL_TEST_SESSION_SECRET|BEGIN (?:EC |RSA )?PRIVATE KEY/.test(
      source,
    )
  )
    throw new Error(`SERVER_SECRET_BOUNDARY_FAILED: ${file}`);
  if (
    /(?:^|["'/\\])\.tools[/\\]|\.env\.local|[a-z]:[\\/]+Users[\\/]+[^\\/]+[\\/]+(?:Documents|AppData)/i.test(
      source,
    )
  )
    throw new Error(`PRIVATE_PATH_BOUNDARY_FAILED: ${file}`);
  if (
    publicDemo &&
    /testnet-rpc\.monad\.xyz|monadscan\.com|Monad Testnet|MONAD METROPOLIS|Local Anvil|mock USDC|eth_requestAccounts|wallet_switchEthereumChain|eip6963:requestProvider|Resolve escrow directly onchain/i.test(
      source,
    )
  )
    throw new Error(`LEGACY_WEB_BOUNDARY_FAILED: ${file}`);
}
console.log(
  `Browser boundary passed: ${chunks.length} compiled JavaScript chunks contain no server credential variable names, private-key PEM material or local artifact paths.`,
);
