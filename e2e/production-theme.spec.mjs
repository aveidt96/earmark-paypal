import { test, expect } from "@playwright/test";
import { writeFileSync } from "node:fs";
const origin = "https://earmark-omega-virid.vercel.app";
const paymentId =
  "0x003be982f4f5ec1eceb497862bdeb8ac65c0d9a9f4e452324e9dc883af72c98e";
const hash =
  "0x95810b4c31144e9b044955d7fc9b4e9dc055fb6842aaab495ea677a9a0a66e25";
test.skip(
  process.env.EARMARK_PRODUCTION_SMOKE !== "1",
  "Explicit opt-in required for read-only public verification",
);

test.beforeEach(async ({ page }) => {
  await page.route("**/api/workspace/**", (route) => {
    if (route.request().method() !== "GET")
      return route.abort("blockedbyclient");
    return route.continue();
  });
});
test("public dark default, real settled history, logo and responsive layouts", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (
      m.type() === "error" &&
      /hydrat|uncaught|TypeError|ReferenceError/i.test(m.text())
    )
      errors.push(m.text());
  });
  await page.emulateMedia({ colorScheme: "light" });
  const r = await page.goto(origin, { waitUntil: "domcontentloaded" });
  expect(await r.text()).toContain('data-theme="dark"');
  await expect(page.getByLabel("Appearance", { exact: true })).toHaveValue(
    "dark",
  );
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByTestId("contract-verdict")).toHaveText(
    "PAYMENT SETTLED",
    { timeout: 90000 },
  );
  await expect
    .poll(() =>
      page
        .locator("header .brand-crystal")
        .evaluate((img) => img.complete && img.naturalWidth > 0),
    )
    .toBe(true);
  const data = await (await page.request.get(origin + "/api/workspace")).json();
  expect(data.config.chainId).toBe(10143);
  expect(data.config.vault.toLowerCase()).toBe(
    "0x37c026c7207de8f202a06726eb02e6233ed06160",
  );
  expect(data.config.token.toLowerCase()).toBe(
    "0x8f4660ed18a3ba5ba9dbe64e18f06ef4a43c0136",
  );
  const p = data.payments.find((p) => p.id === paymentId);
  expect(p.status).toBe("COMPLETED");
  expect(p.amount).toBe("6000000");
  expect(
    data.events.some(
      (e) => e.type === "PaymentCompleted" && e.data.transactionHash === hash,
    ),
  ).toBe(true);
  await page.screenshot({
    path: ".tools/dark-publish/live-dark.png",
    fullPage: true,
  });
  await page.getByLabel("Appearance", { exact: true }).selectOption("light");
  await expect(page.locator(".flow-scene")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Appearance", { exact: true })).toHaveValue(
    "light",
  );
  await page.getByLabel("Appearance", { exact: true }).selectOption("system");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.getByLabel("Appearance", { exact: true })).toHaveValue(
    "system",
  );
  await page.getByRole("link", { name: "Payments", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.goto(origin);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId("contract-verdict")).toHaveText(
    "PAYMENT SETTLED",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .locator(".execution-console")
    .screenshot({ path: ".tools/dark-publish/live-mobile.png" });
  expect(errors).toEqual([]);
  writeFileSync(
    ".tools/dark-publish/live-ui-verification.json",
    JSON.stringify(
      {
        verifiedAt: new Date().toISOString(),
        chainId: data.config.chainId,
        vault: data.config.vault,
        token: data.config.token,
        paymentId,
        status: p.status,
        amount: p.amount,
        settlementHash: hash,
        criticalBrowserErrors: errors.length,
        financialTransactions: 0,
      },
      null,
      2,
    ),
  );
});
for (const saved of ["light", "dark", "system"]) {
  test("public saved " + saved + " survives first load", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.addInitScript(
      (value) => localStorage.setItem("earmark-theme", value),
      saved,
    );
    await page.goto(origin);
    await expect(page.getByLabel("Appearance", { exact: true })).toHaveValue(
      saved,
    );
    await expect(page.locator("html")).toHaveAttribute(
      "data-theme",
      saved === "system" ? "light" : saved,
    );
  });
}
test("public read-only injected wallet protocol preserves connection on Monad", async ({
  page,
}) => {
  let connected = false;
  const methods = [];
  await page.exposeFunction("earmarkReadOnlyWallet", ({ method }) => {
    methods.push(method);
    if (method === "eth_requestAccounts") {
      connected = true;
      return ["0x9Db22De53242B5376fC4B87B523a0a91aDD0b09A"];
    }
    if (method === "eth_accounts")
      return connected ? ["0x9Db22De53242B5376fC4B87B523a0a91aDD0b09A"] : [];
    if (method === "eth_chainId") return "0x279f";
    throw Error("TEST_FORBIDS_SIGNING_OR_TRANSACTIONS");
  });
  await page.addInitScript(() => {
    const provider = {
      request: (args) => window.earmarkReadOnlyWallet(args),
      on: () => {},
      removeListener: () => {},
    };
    window.ethereum = provider;
    window.addEventListener("eip6963:requestProvider", () =>
      window.dispatchEvent(
        new CustomEvent("eip6963:announceProvider", {
          detail: {
            info: {
              uuid: "earmark-public-readonly",
              name: "Read-only test wallet",
            },
            provider,
          },
        }),
      ),
    );
  });
  await page.goto(origin);
  await expect(page.getByTestId("contract-verdict")).toHaveText(
    "PAYMENT SETTLED",
    { timeout: 90000 },
  );
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Read-only test wallet", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Deposit", exact: true }),
  ).toBeEnabled();
  const account = await page.locator(".wallet-pill").textContent();
  await page.getByLabel("Appearance", { exact: true }).selectOption("light");
  await expect(page.locator(".wallet-pill")).toHaveText(account);
  await page.locator(".wallet-pill").click();
  await expect(page.getByRole("dialog")).toContainText(
    "Connected to Monad Testnet",
  );
  await expect(page.getByRole("dialog")).toContainText("Current vault owner");
  expect(
    methods.every((m) =>
      ["eth_requestAccounts", "eth_accounts", "eth_chainId"].includes(m),
    ),
  ).toBe(true);
});
