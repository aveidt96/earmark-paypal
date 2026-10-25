import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
const manifest = JSON.parse(
  readFileSync("deployments/monad-testnet.json", "utf8"),
);
const origin = "http://127.0.0.1:3345";
let ownedServer;
test.beforeAll(async () => {
  try {
    const response = await fetch(origin + "/config", {
      signal: AbortSignal.timeout(1000),
    });
    const config = await response.json();
    if (
      response.ok &&
      config.chainId === 10143 &&
      config.token.toLowerCase() === manifest.token.address.toLowerCase() &&
      config.owner.toLowerCase() === manifest.owner.toLowerCase()
    )
      return;
    throw Error("FUNDING_PORT_OCCUPIED_BY_UNEXPECTED_SERVICE");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "FUNDING_PORT_OCCUPIED_BY_UNEXPECTED_SERVICE"
    )
      throw error;
  }
  ownedServer = spawn(process.execPath, ["scripts/fund-testnet-owner.mjs"], {
    windowsHide: true,
    stdio: "ignore",
  });
  const until = Date.now() + 60000;
  while (Date.now() < until && ownedServer.exitCode === null) {
    try {
      if (
        (await fetch(origin + "/config", { signal: AbortSignal.timeout(1000) }))
          .ok
      )
        return;
    } catch {
      /* Bounded read-only helper readiness. */
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw Error("FUNDING_BROWSER_NOT_READY");
});
test.afterAll(() => {
  ownedServer?.kill("SIGTERM");
});
async function wallet(page, account, chain = "0x279f") {
  await page.addInitScript(
    ({ account, chain }) => {
      window.__fundingWrites = 0;
      window.ethereum = {
        request: async ({ method }) => {
          if (method === "eth_requestAccounts" || method === "eth_accounts")
            return [account];
          if (method === "eth_chainId") return chain;
          if (method === "eth_sendTransaction") {
            window.__fundingWrites++;
            throw Error("TEST_BROADCAST_FORBIDDEN");
          }
          throw Error("UNEXPECTED_WALLET_METHOD");
        },
      };
    },
    { account, chain },
  );
}
test("funding helper serves only GET and never exposes deployment/admin actions", async ({
  page,
  request,
}) => {
  await page.goto(origin);
  await expect(
    page.getByRole("heading", { name: "Earmark testnet setup" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /deploy|withdraw|deposit/i }),
  ).toHaveCount(0);
  expect(
    (
      await request.post(origin + "/config", { data: { action: "mint" } })
    ).status(),
  ).toBe(403);
});
test("wrong wallet and wrong chain cannot submit owner mock mint", async ({
  page,
}) => {
  await wallet(page, "0x" + "1".repeat(40));
  await page.goto(origin);
  await page
    .getByRole("button", { name: "Mint / reconcile 20 mock USDC" })
    .click();
  await expect(page.getByRole("status")).toHaveText(
    "Connect the approved owner wallet only.",
  );
  expect(await page.evaluate(() => window.__fundingWrites)).toBe(0);
  await wallet(page, manifest.owner, "0x1");
  await page.reload();
  await page
    .getByRole("button", { name: "Mint / reconcile 20 mock USDC" })
    .click();
  await expect(page.getByRole("status")).toHaveText(
    "Switch your wallet to Monad Testnet (10143) first.",
  );
  expect(await page.evaluate(() => window.__fundingWrites)).toBe(0);
});
test("uncertain owner mint remains blocked after reload without rebroadcast", async ({
  page,
}) => {
  let rpcReads = 0;
  await page.route("https://testnet-rpc.monad.xyz/**", async (route) => {
    rpcReads++;
    await route.abort();
  });
  await wallet(page, manifest.owner);
  await page.goto(origin);
  await page.evaluate(() =>
    localStorage.setItem(
      "earmark-owner-mint:10143:0x8f4660ed18a3ba5ba9dbe64e18f06ef4a43c0136",
      JSON.stringify({ pending: true }),
    ),
  );
  await page.reload();
  await page
    .getByRole("button", { name: "Mint / reconcile 20 mock USDC" })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Wallet result is uncertain",
    { timeout: 60000 },
  );
  expect(await page.evaluate(() => window.__fundingWrites)).toBe(0);
  expect(rpcReads).toBe(0);
});
test("an existing deployment receipt cannot be relabeled as a mint", async ({
  page,
}) => {
  await page.goto(origin);
  await page
    .getByLabel("Public mint transaction hash (only for reconciliation)")
    .fill(manifest.token.transactionHash);
  await page.getByRole("button", { name: "Reconcile this mint hash" }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Transaction does not match the exact owner mint.",
    { timeout: 60000 },
  );
  await expect(page.getByRole("status")).not.toContainText(
    "Confirmed owner mint",
  );
});
