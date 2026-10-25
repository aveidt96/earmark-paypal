import { test, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
const manifest = JSON.parse(
  readFileSync("deployments/monad-testnet.json", "utf8"),
);
const origin = "http://127.0.0.1:3318";
let server;
test.beforeAll(async () => {
  server = spawn(
    process.execPath,
    [
      "../node_modules/next/dist/bin/next",
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      "3318",
    ],
    {
      cwd: "web",
      windowsHide: true,
      stdio: "ignore",
      env: {
        ...process.env,
        EARMARK_DEPLOYMENT: "monad-testnet",
        EARMARK_API_URL: "https://earmark-api-testnet.onrender.com",
      },
    },
  );
  const deadline = Date.now() + 60000;
  for (;;) {
    try {
      if ((await fetch(origin + "/resolve")).ok) return;
    } catch {
      /* Bounded local server startup. */
    }
    if (Date.now() > deadline || server.exitCode !== null)
      throw Error("RESOLUTION_BROWSER_NOT_READY");
    await new Promise((r) => setTimeout(r, 250));
  }
});
test.afterAll(async () => {
  server?.kill("SIGTERM");
});
test.beforeEach(async ({ page }) => {
  await page.route("**/api/workspace", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "BACKEND_UNAVAILABLE" }),
    }),
  );
});
test("direct resolver remains usable and refuses malformed payment input during backend outage", async ({
  page,
}) => {
  await page.goto(origin + "/resolve");
  await expect(
    page.getByRole("heading", { name: "Resolve Escrow" }),
  ).toBeVisible();
  await expect(
    page.getByText(manifest.vault.address, { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Payment ID", { exact: true }).fill("invalid");
  await page
    .getByRole("button", { name: "Read Onchain Payment", exact: true })
    .click();
  await expect(page.locator("main").getByRole("status")).not.toBeEmpty();
  await expect(
    page.getByRole("button", { name: "Settle Eligible Payment", exact: true }),
  ).toBeDisabled();
});
test("refresh preserves uncertain attempts and rejects a real unrelated testnet receipt", async ({
  page,
}) => {
  const id = "0x" + "a".repeat(64);
  await page.goto(origin + "/resolve");
  await page.evaluate(
    ({ key, record }) => localStorage.setItem(key, JSON.stringify(record)),
    {
      key: "earmark-resolution:10143:" + manifest.vault.address,
      record: {
        paymentId: id,
        action: "settlePayment",
        account: manifest.owner,
        hash: manifest.vault.transactionHash,
      },
    },
  );
  await page.goto(origin + "/resolve");
  await expect(page.getByLabel("Payment ID", { exact: true })).toHaveValue(id);
  await expect(
    page.getByRole("button", { name: "Settle Eligible Payment", exact: true }),
  ).toBeDisabled();
  await page.reload();
  await expect(
    page.getByLabel("Public transaction hash", { exact: true }),
  ).toHaveValue(manifest.vault.transactionHash);
  await page
    .getByRole("button", { name: "Reconcile Saved Transaction", exact: true })
    .click();
  await expect(page.locator("main").getByRole("status")).toHaveText(
    "Transaction does not match the saved payment resolution.",
    { timeout: 60000 },
  );
  await expect(
    page.getByRole("button", { name: "Settle Eligible Payment", exact: true }),
  ).toBeDisabled();
});

for (const [code, status, message] of [
  ["HISTORY_SYNCING", 400, "Synchronizing confirmed contract history."],
  ["WORKER_STARTING", 503, "Backend starting or restarting."],
  ["BACKEND_WAKING_OR_UNAVAILABLE", 503, "Backend waking up or unavailable."],
  ["untrusted response containing secret text", 500, "Connection interrupted."],
]) {
  test(`workspace explains ${code} without enabling financial actions`, async ({
    page,
  }) => {
    await page.route("**/api/workspace", (route) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify({ error: code }),
      }),
    );
    await page.goto(origin + "/");
    await expect(
      page.getByRole("status").filter({ hasText: message }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Deposit", exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Withdraw", exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Run Agent", exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByText("configuration needs review", { exact: false }),
    ).toHaveCount(0);
    await expect(
      page.getByText("untrusted response containing secret text", {
        exact: false,
      }),
    ).toHaveCount(0);
    await expect(
      page
        .getByText(
          "Earmark data is loading. Existing permissions are unchanged.",
          { exact: true },
        )
        .first(),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Create an Earmark first", exact: false }),
    ).toHaveCount(0);
    await page.reload();
    await expect(
      page.getByRole("status").filter({ hasText: message }),
    ).toBeVisible();
    await page.goto(origin + "/mandates");
    await expect(
      page.getByRole("heading", { name: "Mandates", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "Earmark data is loading. Existing permissions are unchanged.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      page.getByText("No mandates yet.", { exact: false }),
    ).toHaveCount(0);
  });
}

test("workspace automatically recovers after synchronization without sending a financial POST", async ({
  page,
}) => {
  let available = false;
  let financialRequests = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().includes("/api/workspace"))
      financialRequests++;
  });
  await page.route("**/api/workspace", (route) =>
    route.fulfill({
      status: available ? 200 : 400,
      contentType: "application/json",
      body: JSON.stringify(
        available
          ? {
              configured: true,
              chainTime: 0,
              owner: manifest.owner,
              model: "mock",
              mandates: [],
              payments: [],
              runs: [],
              events: [],
              config: {
                chainId: 10143,
                network: "Monad Testnet",
                rpcUrl: "https://testnet-rpc.monad.xyz",
                vault: manifest.vault.address,
                token: manifest.token.address,
                agent: "0xD3Ccb5ab79fC3939f1d25592F19Db534BA420799",
                providers: [],
              },
              balance: {
                actual: "0",
                available: "0",
                reserved: "0",
                decimals: 6,
                symbol: "mock USDC",
              },
            }
          : { error: "HISTORY_SYNCING" },
      ),
    }),
  );
  await page.goto(origin + "/");
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Synchronizing confirmed contract history." }),
  ).toBeVisible();
  available = true;
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Synchronizing confirmed contract history." }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Vault not configured", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Deposit", exact: true }),
  ).toBeDisabled();
  expect(financialRequests).toBe(0);
});
