import { writeFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { startApplication } from "../scripts/start-workspace.mjs";
let app;
test.beforeAll(async () => {
  app = await startApplication({ port: 3359, production: true });
  // Check the production frontend is ready, including immutable assets; do not warm browser storage or bypass backend checks.
  const html = await (await fetch(app.origin)).text();
  const resources = [
    ...new Set(
      [...html.matchAll(/(?:src|href)="([^" ]+)"/g)]
        .map((m) => m[1].replaceAll("&amp;", "&"))
        .filter((path) => path.startsWith("/_next/")),
    ),
  ];
  await Promise.all(
    resources.map(async (path) => {
      const r = await fetch(app.origin + path);
      if (!r.ok) throw Error("FRONTEND_ASSET_NOT_READY");
      await r.arrayBuffer();
    }),
  );
}, 120000);
test.afterAll(async () => {
  if (app) await app.close();
});
async function inject(page) {
  const state = {
    account: app.ownerWallet.account.address,
    chain: "0x7a69",
    connected: false,
    rejectSignature: false,
  };
  await page.exposeFunction(
    "flintTestRequest",
    async ({ method, params = [] }) => {
      if (method === "eth_requestAccounts") {
        state.connected = true;
        return [state.account];
      }
      if (method === "eth_accounts")
        return state.connected ? [state.account] : [];
      if (method === "eth_chainId") return state.chain;
      if (method === "wallet_switchEthereumChain") {
        state.chain = params[0].chainId;
        return null;
      }
      if (method === "eth_signTypedData_v4") {
        if (state.rejectSignature) throw new Error("User rejected signature");
        if (
          params[0].toLowerCase() !==
          app.ownerWallet.account.address.toLowerCase()
        )
          throw new Error("UNAUTHORIZED_SIGNER");
        return app.ownerWallet.account.signTypedData(JSON.parse(params[1]));
      }
      if (method === "eth_sendTransaction") {
        const tx = params[0];
        if (
          tx.from.toLowerCase() !==
          app.ownerWallet.account.address.toLowerCase()
        )
          throw new Error("UNAUTHORIZED_SIGNER");
        return app.ownerWallet.sendTransaction({
          to: tx.to,
          data: tx.data,
          value: BigInt(tx.value ?? "0x0"),
          ...(tx.gas ? { gas: BigInt(tx.gas) } : {}),
        });
      }
      return app.node.publicClient.request({ method, params });
    },
  );
  await page.addInitScript(() => {
    const listeners = new Map();
    const provider = {
      request: (args) => window.flintTestRequest(args),
      on: (name, fn) => {
        const list = listeners.get(name) ?? [];
        list.push(fn);
        listeners.set(name, list);
      },
      removeListener: (name, fn) =>
        listeners.set(
          name,
          (listeners.get(name) ?? []).filter((f) => f !== fn),
        ),
    };
    window.ethereum = provider;
    window.flintTestEmit = (name, value) =>
      (listeners.get(name) ?? []).forEach((fn) => {
        fn(value);
      });
    window.addEventListener("eip6963:requestProvider", () =>
      window.dispatchEvent(
        new CustomEvent("eip6963:announceProvider", {
          detail: {
            info: { uuid: "flint-e2e-owner", name: "Test owner wallet" },
            provider,
          },
        }),
      ),
    );
  });
  return state;
}
async function connect(page) {
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Test owner wallet", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Deposit", exact: true }),
  ).toBeEnabled();
}

const shot = (page, name) =>
  page.screenshot({
    path: "docs/screenshots/pre-submission-owner-" + name + ".png",
    fullPage: true,
  });
test("real local wallet, mandate, escrow and theme changes preserve financial state", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await inject(page);
  await page.goto(app.origin);
  await expect(page.getByLabel("Appearance", { exact: true })).toHaveValue(
    "dark",
  );
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await connect(page);
  await page.getByRole("button", { name: "Deposit", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Amount", { exact: true })
    .fill("20");
  await page.getByLabel("Appearance", { exact: true }).selectOption("dark");
  await expect(
    page.getByRole("dialog").getByLabel("Amount", { exact: true }),
  ).toHaveValue("20");
  await page
    .getByRole("button", { name: "Confirm deposit", exact: true })
    .click();
  await expect(page.getByTestId("vault-balance")).toHaveText("20.00");
  await page.goto(app.origin + "/mandates/new");
  await expect(
    page.getByRole("button", { name: "Review earmark", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Review earmark", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("reserves no funds");
  await page
    .getByRole("button", { name: "Approve earmark in wallet", exact: true })
    .click();
  await expect(
    page.getByText("Your earmark is ready.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Open workspace", exact: false })
    .click();
  await page.getByRole("button", { name: "Run Agent", exact: true }).click();
  await expect(page.getByTestId("reserved-balance")).toHaveText("6.00", {
    timeout: 90000,
  });
  await expect(page.getByTestId("contract-verdict")).toHaveText(
    "CHALLENGE ACTIVE",
    { timeout: 90000 },
  );
  const before = await (await fetch(app.origin + "/api/workspace")).json();
  expect(before.payments).toHaveLength(1);
  const count = await page.locator(".wallet-pill").textContent();
  await page.getByLabel("Appearance", { exact: true }).selectOption("light");
  await expect(
    page.getByRole("region", { name: "Execution Console", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".progress-timeline li")).toHaveCount(5);
  await shot(page, "light");
  await page.getByLabel("Appearance", { exact: true }).selectOption("dark");
  await expect(
    page.getByRole("region", { name: "Execution Console", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".wallet-pill")).toHaveText(count);
  await expect(page.getByTestId("available-balance")).toHaveText("14.00");
  await shot(page, "workspace");
  const run = before.runs.at(-1);
  await page.goto(app.origin + "/executions/" + run.id);
  await expect(page.getByTestId("contract-verdict")).toHaveText(
    "CHALLENGE ACTIVE",
  );
  await page
    .locator(".execution-console")
    .screenshot({ path: "docs/screenshots/pre-submission-owner-console.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByLabel("Appearance", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .locator(".execution-console")
    .screenshot({ path: "docs/screenshots/pre-submission-owner-mobile.png" });
  await page.setViewportSize({ width: 820, height: 1180 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 1672, height: 1050 });
  await app.node.testClient.increaseTime({ seconds: 3601 });
  await app.node.testClient.mine({ blocks: 2 });
  await expect(page.getByTestId("contract-verdict")).toHaveText(
    "READY TO SETTLE",
  );
  await page
    .getByRole("button", { name: "Settle payment", exact: true })
    .click();
  await expect(page.getByTestId("contract-verdict")).toHaveText(
    "PAYMENT SETTLED",
    { timeout: 30000 },
  );
  await page.reload();
  await expect(page.getByTestId("contract-verdict")).toHaveText(
    "PAYMENT SETTLED",
  );
  expect(errors).toEqual([]);
});
test("system, saved choice, navigation, cross-tab and blocked storage", async ({
  page,
  context,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.goto(app.origin);
  await page.getByLabel("Appearance", { exact: true }).selectOption("system");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByLabel("Appearance", { exact: true }).selectOption("dark");
  await page.reload();
  await expect(page.getByLabel("Appearance", { exact: true })).toHaveValue(
    "dark",
  );
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const other = await context.newPage();
  await other.goto(app.origin);
  await other.getByLabel("Appearance", { exact: true }).selectOption("light");
  await expect(page.getByLabel("Appearance", { exact: true })).toHaveValue(
    "light",
  );
  await other.close();
  for (const route of [
    "/mandates/new",
    "/mandates",
    "/payments",
    "/activity",
    "/resolve",
    "/security",
  ]) {
    await page.goto(app.origin + route);
    await page.getByLabel("Appearance", { exact: true }).selectOption("dark");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    expect(
      await page.evaluate(() => getComputedStyle(document.body).color),
    ).toBe("rgb(232, 235, 239)");
  }
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k === "earmark-theme") throw Error("storage blocked");
      return original.call(this, k, v);
    };
  });
  await page.getByLabel("Appearance", { exact: true }).selectOption("light");
  await expect(page.getByLabel("Appearance", { exact: true })).toHaveValue(
    "light",
  );
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  expect(errors).toEqual([]);
});

for (const [saved, os, expected] of [
  [null, "light", "dark"],
  ["light", "dark", "light"],
  ["dark", "light", "dark"],
  ["system", "light", "light"],
  ["system", "dark", "dark"],
]) {
  test(
    "first paint retains " + (saved ?? "default") + " with OS " + os,
    async ({ page }) => {
      await page.emulateMedia({ colorScheme: os });
      await page.addInitScript((value) => {
        if (value !== null) localStorage.setItem("earmark-theme", value);
      }, saved);
      const documentResponse = await page.goto(app.origin, {
        waitUntil: "domcontentloaded",
      });
      expect(await documentResponse.text()).toContain('data-theme="dark"');
      await expect(page.locator("html")).toHaveAttribute(
        "data-theme",
        expected,
      );
      await expect(page.getByLabel("Appearance", { exact: true })).toHaveValue(
        saved ?? "dark",
      );
      await page.reload();
      await expect(page.locator("html")).toHaveAttribute(
        "data-theme",
        expected,
      );
      await page.getByRole("link", { name: "Payments", exact: true }).click();
      await expect(page.locator("html")).toHaveAttribute(
        "data-theme",
        expected,
      );
    },
  );
}
async function offlineReplay(page) {
  // Fail only the live snapshot fetch inside the browser. Avoid routing every asset through the test driver.
  await page.addInitScript(() => {
    const original = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = new URL(
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url,
        location.href,
      );
      if (url.origin === location.origin && url.pathname === "/api/workspace")
        return Promise.resolve(
          new Response(
            JSON.stringify({ error: "BACKEND_WAKING_OR_UNAVAILABLE" }),
            { status: 503, headers: { "Content-Type": "application/json" } },
          ),
        );
      return original(input, init);
    };
  });
}
test("judge first visit renders verified read-only demo within two seconds despite backend failure", async ({
  page,
}) => {
  const mutations = [],
    errors = [];
  page.on("request", (r) => {
    if (r.method() !== "GET") mutations.push(r.url());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await offlineReplay(page);
  const started = Date.now();
  await page.goto(app.origin, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("contract-verdict")).toHaveText(
    "PAYMENT SETTLED",
    { timeout: 2000 },
  );
  const elapsed = Date.now() - started;
  const paint = await page.evaluate(
    () => performance.getEntriesByName("first-contentful-paint")[0]?.startTime,
  );
  const html = await (await page.request.get(app.origin)).text();
  expect(html).toContain("PAYMENT SETTLED");
  expect(html).toContain("Demo Mode");
  expect(paint).toBeGreaterThan(0);
  expect(paint).toBeLessThan(2000);
  writeFileSync(
    ".tools/pre-submission/first-render.json",
    JSON.stringify({
      firstContentfulPaintMs: paint,
      driverRoundTripMs: elapsed,
      backend: "503 intercepted",
      wallet: "disconnected",
      source: "recorded Monad Testnet",
    }),
  );
  await expect(
    page.getByText("Connecting to your workspace…", { exact: true }),
  ).toHaveCount(0);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(
    page.getByText("Demo Mode · Recorded Monad Testnet execution", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Execution Console" }),
  ).toContainText("Lowest validated price");
  await expect(page.getByText("Connecting · Deterministic Mock")).toHaveCount(
    0,
  );
  await expect(page.getByText("UNCONFIRMED", { exact: true })).toHaveCount(0);
  await expect(
    page.getByText("Payment Analytics", { exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".console-quote-list")).toHaveCount(1);
  await expect(page.locator(".console-checks")).toHaveCount(1);
  await expect(page.locator(".console-decision")).toHaveCount(1);
  await expect(page.locator(".progress-timeline li")).toHaveCount(5);
  expect(await page.locator("main").innerText()).not.toMatch(
    /TaskVault|Launch Task/,
  );
  await expect(
    page.getByRole("link", { name: "View confirmed settlement", exact: true }),
  ).toHaveAttribute(
    "href",
    /95810b4c31144e9b044955d7fc9b4e9dc055fb6842aaab495ea677a9a0a66e25$/,
  );
  await page.getByRole("button", { name: "Replay", exact: true }).click();
  await expect(page.getByTestId("contract-verdict")).toHaveText(
    "PAYMENT SETTLED",
  );
  await expect(
    page.getByText("Offline replay available", { exact: true }),
  ).toBeVisible();
  const logo = await page
    .locator(".workspace-footer .brand-mark")
    .boundingBox();
  expect(logo.width).toBeLessThanOrEqual(48);
  expect(logo.height).toBeLessThanOrEqual(48);
  expect(
    await page.locator(".floating-nav .brand-crystal").getAttribute("src"),
  ).not.toContain("w=3840");
  expect(mutations).toEqual([]);
  expect(errors).toEqual([]);
  await page.screenshot({
    path: "docs/screenshots/pre-submission-demo-desktop.png",
    fullPage: true,
  });
});
test("prompt injection replay separates actual model resistance, backend block and local contract revert", async ({
  page,
}) => {
  await offlineReplay(page);
  await page.goto(app.origin);
  await page
    .getByRole("button", { name: "B — Prompt Injection", exact: true })
    .click();
  await expect(
    page.getByText("Demo Mode · Recorded local Anvil execution", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator(".untrusted-input")).toContainText(
    "Ignore the owner's mandate",
  );
  await expect(page.getByTestId("contract-verdict")).toHaveText("BLOCKED");
  await expect(page.locator(".console-verdict")).toHaveClass(/danger/);
  await expect(page.locator(".rejection-reason")).toHaveText(
    "ProviderNotApproved",
  );
  await expect(page.locator(".console-decision")).toContainText(
    "ignored the redirect",
  );
  await expect(page.locator(".console-tool")).toContainText(
    "Invalid recipient field rejected",
  );
  await expect(page.locator(".progress-timeline li.reached")).toHaveCount(1);
  await page.screenshot({
    path: "docs/screenshots/pre-submission-demo-injection.png",
    fullPage: true,
  });
});
test("normal replay preserves genuine evidence and exactly five recorded payment states", async ({
  page,
}) => {
  await offlineReplay(page);
  await page.goto(app.origin);
  await page
    .getByRole("button", { name: "A — Normal Purchase", exact: true })
    .click();
  await expect(page.locator(".console-quote-list")).toContainText("DataHub");
  await expect(page.locator(".progress-timeline li")).toHaveText([
    "Requested",
    "Earmarked",
    "Delivered",
    "Accepted",
    "Settled",
  ]);
  await expect(page.getByTestId("contract-verdict")).toHaveText(
    "CHALLENGE ACTIVE",
  );
  await expect(page.locator(".challenge-note")).toContainText(
    "Historical acceptance",
  );
  await expect(page.getByTestId("contract-verdict")).toHaveText(
    "PAYMENT SETTLED",
  );
  await expect(page.locator(".progress-timeline li.reached")).toHaveCount(5);
  await page.locator(".console-evidence summary").click();
  await expect(page.locator(".console-evidence")).toContainText(
    "Recorded artifact checks passed",
  );
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (value) => {
          window.earmarkCopiedHash = value;
        },
      },
    });
  });
  await page
    .getByRole("button", {
      name: "Copy transaction hash 0x9581…6e25",
      exact: true,
    })
    .click();
  expect(await page.evaluate(() => window.earmarkCopiedHash)).toBe(
    "0x95810b4c31144e9b044955d7fc9b4e9dc055fb6842aaab495ea677a9a0a66e25",
  );
  await expect(page.locator(".console-evidence a")).toHaveAttribute(
    "href",
    /testnet.monadscan.com\/tx\/0x95810b/,
  );
});
test("invalid delivery and cumulative budget replay keep terminal and funded outcomes distinct", async ({
  page,
}) => {
  await offlineReplay(page);
  await page.goto(app.origin);
  await page
    .getByRole("button", { name: "C — Invalid Delivery", exact: true })
    .click();
  await expect(page.getByTestId("contract-verdict")).toHaveText(
    "REJECTED · REFUNDED",
  );
  await expect(page.locator(".progress-timeline li.reached")).toHaveCount(3);
  await expect(page.locator(".console-budget")).toContainText("Reserved 0");
  await page
    .getByRole("button", { name: "D — Budget Exhaustion", exact: true })
    .click();
  await expect(page.getByTestId("contract-verdict")).toHaveText("BLOCKED");
  await expect(page.locator(".rejection-reason")).toContainText("8 + 4 > 10");
  await expect(page.locator(".console-budget")).toContainText("Reserved 8");
  await expect(page.locator(".console-budget")).toContainText("Settled 0");
  await expect(page.locator(".progress-timeline li.reached")).toHaveCount(1);
});
test("390px demo is accessible, stacked and overflow-free in both themes with reduced-motion replay", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await offlineReplay(page);
  await page.goto(app.origin);
  const panes = page.locator(".console-pane"),
    agent = await panes.nth(0).boundingBox(),
    contract = await panes.nth(1).boundingBox();
  expect(agent.y + agent.height).toBeLessThan(contract.y);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "B — Prompt Injection", exact: true })
    .click();
  await expect(page.getByTestId("contract-verdict")).toHaveText("BLOCKED");
  await expect(
    page.getByRole("button", { name: "B — Prompt Injection", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  const box = await page
    .getByRole("button", { name: "B — Prompt Injection", exact: true })
    .boundingBox();
  expect(box.height).toBeGreaterThanOrEqual(44);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Threat Model", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "do not prove semantic quality",
  );
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.screenshot({
    path: "docs/screenshots/pre-submission-demo-mobile.png",
    fullPage: true,
  });
  await page.getByLabel("Appearance", { exact: true }).selectOption("light");
  await expect(page.getByTestId("contract-verdict")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});
