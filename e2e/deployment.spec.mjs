import { test, expect } from "@playwright/test";
import { spawn } from "node:child_process";
let child;
test.beforeAll(async () => {
  child = spawn(process.execPath, ["scripts/deploy-testnet.mjs"], {
    windowsHide: true,
    stdio: "ignore",
  });
  const deadline = Date.now() + 60000;
  for (;;) {
    try {
      if ((await fetch("http://127.0.0.1:3344/config")).ok) break;
    } catch {
      /* Bounded local readiness. */
    }
    if (Date.now() > deadline || child.exitCode !== null)
      throw Error("DEPLOYMENT_HELPER_NOT_READY");
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
});
test.beforeEach(async ({ page }) => {
  // These rejection fixtures intentionally start without a known confirmed deployment.
  // The separately tested recovery flow must not suppress the uncertain-send fixture.
  await page.route("http://127.0.0.1:3344/config", async (route) => {
    const response = await route.fetch();
    const config = await response.json();
    delete config.confirmedTokenTransaction;
    await route.fulfill({ response, json: config });
  });
  // Wallet behavior is synthetic; live chain identity is verified separately by the helper.
  // Keep wallet rejection tests independent of public-RPC latency, without permitting broadcasts.
  await page.route("https://testnet-rpc.monad.xyz/**", async (route) => {
    const request = route.request().postDataJSON();
    const result =
      request.method === "eth_chainId"
        ? "0x279f"
        : request.method === "eth_getBalance"
          ? "0x0"
          : undefined;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(
        result === undefined
          ? {
              jsonrpc: "2.0",
              id: request.id,
              error: { code: -32601, message: "Unsupported test RPC" },
            }
          : { jsonrpc: "2.0", id: request.id, result },
      ),
    });
  });
});

test.afterAll(async () => {
  if (child && child.exitCode === null) {
    const exited = new Promise((resolve) => child.once("exit", resolve));
    child.kill();
    await exited;
  }
});
test("owner deployment rejects another wallet and the wrong network without sending a transaction", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.deploymentRequests = [];
    window.ethereum = {
      request: async ({ method }) => {
        window.deploymentRequests.push(method);
        if (method === "eth_requestAccounts")
          return ["0x1111111111111111111111111111111111111111"];
        if (method === "eth_chainId") return "0x279f";
        throw Error("Unexpected wallet method");
      },
    };
  });
  await page.goto("http://127.0.0.1:3344");
  await expect(
    page.getByRole("heading", { name: "Earmark testnet deployment" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "1. Deploy / reconcile Mock USDC" })
    .click();
  await expect(page.locator("pre")).toContainText(
    "Connect only the approved owner wallet",
  );
  expect(await page.evaluate(() => window.deploymentRequests)).not.toContain(
    "eth_sendTransaction",
  );
  await page.evaluate(() => {
    window.ethereum.request = async ({ method }) => {
      window.deploymentRequests.push(method);
      if (method === "eth_requestAccounts")
        return ["0x9Db22De53242B5376fC4B87B523a0a91aDD0b09A"];
      if (method === "eth_chainId") return "0x7a69";
      throw Error("Unexpected wallet method");
    };
  });
  await page
    .getByRole("button", { name: "1. Deploy / reconcile Mock USDC" })
    .click();
  await expect(page.locator("pre")).toContainText(
    "Switch your wallet to Monad Testnet",
  );
  expect(await page.evaluate(() => window.deploymentRequests)).not.toContain(
    "eth_sendTransaction",
  );
});

test("an uncertain wallet result blocks repeat deployment; explicit rejection permits a fresh approval", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.deploymentRequests = [];
    window.rejectDeployment = false;
    window.ethereum = {
      request: async ({ method }) => {
        window.deploymentRequests.push(method);
        if (method === "eth_requestAccounts")
          return ["0x9Db22De53242B5376fC4B87B523a0a91aDD0b09A"];
        if (method === "eth_chainId") return "0x279f";
        if (method === "eth_sendTransaction")
          throw Object.assign(
            Error(window.rejectDeployment ? "User rejected" : "RPC timeout"),
            { code: window.rejectDeployment ? 4001 : -32000 },
          );
        throw Error("Unexpected wallet method");
      },
    };
  });
  await page.goto("http://127.0.0.1:3344");
  const deploy = page.getByRole("button", {
    name: "1. Deploy / reconcile Mock USDC",
  });
  await deploy.click();
  await expect(page.locator("pre")).toContainText("Wallet result is uncertain");
  await deploy.click();
  await expect(page.locator("pre")).toContainText(
    "Do not approve another deployment",
  );
  expect(
    await page.evaluate(
      () =>
        window.deploymentRequests.filter((m) => m === "eth_sendTransaction")
          .length,
    ),
  ).toBe(1);
  // Clearing a synthetic test-only attempt is not an operator recovery procedure.
  await page.evaluate(() => {
    localStorage.clear();
    window.rejectDeployment = true;
  });
  await deploy.click();
  await expect(page.locator("pre")).toContainText("Wallet approval rejected");
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("earmark-testnet-deployment-v1"))
          .tokenPending,
    ),
  ).toBe(false);
});

test("explicit network switch adds only the official testnet when absent and sends no transaction", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.deploymentRequests = [];
    window.walletChain = "0x1";
    window.networkAdded = false;
    window.ethereum = {
      request: async ({ method, params }) => {
        window.deploymentRequests.push({ method, params });
        if (method === "eth_requestAccounts")
          return ["0x9Db22De53242B5376fC4B87B523a0a91aDD0b09A"];
        if (method === "eth_chainId") return window.walletChain;
        if (method === "wallet_switchEthereumChain") {
          if (!window.networkAdded)
            throw Object.assign(Error("Unknown chain"), { code: 4902 });
          window.walletChain = params[0].chainId;
          return null;
        }
        if (method === "wallet_addEthereumChain") {
          window.networkAdded = true;
          return null;
        }
        throw Error("Unexpected wallet method");
      },
    };
  });
  await page.goto("http://127.0.0.1:3344");
  await page
    .getByRole("button", { name: "Switch to Monad Testnet", exact: true })
    .click();
  await expect(page.locator("pre")).toContainText("Wallet network verified");
  const requests = await page.evaluate(() => window.deploymentRequests);
  expect(
    requests.filter((r) => r.method === "wallet_switchEthereumChain"),
  ).toHaveLength(2);
  expect(
    requests.find((r) => r.method === "wallet_addEthereumChain").params[0],
  ).toMatchObject({
    chainId: "0x279f",
    rpcUrls: ["https://testnet-rpc.monad.xyz"],
  });
  expect(requests.some((r) => r.method === "eth_sendTransaction")).toBe(false);
  expect(
    await page.evaluate(() =>
      localStorage.getItem("earmark-testnet-deployment-v1"),
    ),
  ).toBeNull();
});

test("network-switch rejection does not add a chain or create a pending deployment", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.deploymentRequests = [];
    window.ethereum = {
      request: async ({ method }) => {
        window.deploymentRequests.push(method);
        if (method === "eth_requestAccounts")
          return ["0x9Db22De53242B5376fC4B87B523a0a91aDD0b09A"];
        if (method === "eth_chainId") return "0x1";
        if (method === "wallet_switchEthereumChain")
          throw Object.assign(Error("Rejected"), { code: 4001 });
        throw Error("Unexpected wallet method");
      },
    };
  });
  await page.goto("http://127.0.0.1:3344");
  await page
    .getByRole("button", { name: "Switch to Monad Testnet", exact: true })
    .click();
  await expect(page.locator("pre")).toContainText(
    "Network switch was not approved or supported",
  );
  const requests = await page.evaluate(() => window.deploymentRequests);
  expect(requests).not.toContain("wallet_addEthereumChain");
  expect(requests).not.toContain("eth_sendTransaction");
  expect(
    await page.evaluate(() =>
      localStorage.getItem("earmark-testnet-deployment-v1"),
    ),
  ).toBeNull();
});

test("a wallet that ignores the switch remains blocked and reports its actual chain", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.deploymentRequests = [];
    window.ethereum = {
      request: async ({ method }) => {
        window.deploymentRequests.push(method);
        if (method === "eth_requestAccounts")
          return ["0x9Db22De53242B5376fC4B87B523a0a91aDD0b09A"];
        if (method === "eth_chainId") return "0x1";
        if (method === "wallet_switchEthereumChain") return null;
        throw Error("Unexpected wallet method");
      },
    };
  });
  await page.goto("http://127.0.0.1:3344");
  await page
    .getByRole("button", { name: "Switch to Monad Testnet", exact: true })
    .click();
  await expect(page.locator("pre")).toContainText("reports chain 1 (0x1)");
  expect(await page.evaluate(() => window.deploymentRequests)).not.toContain(
    "eth_sendTransaction",
  );
});
