import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { createPublicClient, http } from "viem";
import { anvil } from "viem/chains";
import { startApplication } from "../scripts/start-workspace.mjs";
const live = Boolean(
  process.env.GEMINI_API_KEY && process.env.EARMARK_GEMINI_ENABLED === "true",
);
let app;
const evidence = {
  environment:
    "Real Gemini API when explicitly enabled; local Anvil owner authorization through a Node-held test EIP-1193 bridge; synthetic read-only provider/earmark fixtures",
  live,
  sessions: [],
  walletTransactionRequests: 0,
};
test.beforeAll(async () => {
  app = await startApplication({
    port: 3117,
    production: true,
    readOnlyGemini: true,
    geminiEnabled: live,
  });
}, 120000);
test.afterAll(async () => {
  await app?.close();
});
async function inject(page) {
  let connected = false;
  await page.exposeFunction(
    "earmarkReadOnlyWallet",
    async ({ method, params = [] }) => {
      if (method === "eth_requestAccounts") {
        connected = true;
        return [app.ownerWallet.account.address];
      }
      if (method === "eth_accounts")
        return connected ? [app.ownerWallet.account.address] : [];
      if (method === "eth_chainId") return "0x7a69";
      if (method === "eth_signTypedData_v4") {
        const data = JSON.parse(params[1]);
        if (
          params[0].toLowerCase() !==
            app.ownerWallet.account.address.toLowerCase() ||
          Number(data.domain.chainId) !== 31337 ||
          data.domain.verifyingContract.toLowerCase() !==
            app.vault.toLowerCase() ||
          ![
            "StartReadOnlyGeminiNormal",
            "StartReadOnlyGeminiInjection",
            "ViewReadOnlyGeminiSession",
          ].includes(data.message.action)
        )
          throw new Error("UNEXPECTED_AUTHORIZATION");
        return app.ownerWallet.account.signTypedData(data);
      }
      if (/send|signTransaction/i.test(method)) {
        evidence.walletTransactionRequests++;
        throw new Error("READ_ONLY_WALLET_NO_TRANSACTIONS");
      }
      return app.node.publicClient.request({ method, params });
    },
  );
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
              uuid: "earmark-readonly-owner",
              name: "Read-only test owner",
            },
            provider,
          },
        }),
      ),
    );
  });
}
async function connect(page) {
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Read-only test owner", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Live Gemini", exact: true }),
  ).toBeEnabled();
}
test("anonymous Demo Mode and four recorded scenarios remain available without inference authorization", async ({
  page,
}) => {
  await page.goto(app.origin);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(
    page.getByRole("button", { name: "Live Gemini", exact: true }),
  ).toBeDisabled();
  for (const [name, verdict] of [
    ["A — Normal Purchase", "PAYMENT SETTLED"],
    ["B — Prompt Injection", "BLOCKED"],
    ["C — Invalid Delivery", "REJECTED"],
    ["D — Budget Exhaustion", "BLOCKED"],
  ]) {
    await page.getByRole("button", { name, exact: true }).click();
    await expect(page.getByTestId("contract-verdict")).toContainText(verdict, {
      timeout: 15000,
    });
  }
  const response = await page.request.post(
    app.origin + "/api/workspace/gemini-start",
    {
      headers: { Origin: app.origin },
      data: {
        nonce: "0x" + "00".repeat(32),
        signature: "0x" + "00".repeat(65),
      },
    },
  );
  expect(response.status()).toBe(400);
  const financial = await page.request.post(
    app.origin + "/api/workspace/launch",
    { headers: { Origin: app.origin }, data: {} },
  );
  expect((await financial.json()).error).toBe("TESTNET_EXECUTION_NOT_ENABLED");
});
test("authenticated genuine Gemini recommendation, live injection, refresh recovery and no financial transactions", async ({
  page,
}) => {
  test.skip(
    !live,
    "Opt-in encrypted local Gemini key is required; no simulated inference is substituted.",
  );
  test.setTimeout(600000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const roles = [
    app.ownerWallet.account.address,
    app.agentAddress,
    ...app.providers.map((p) => p.address),
  ];
  // The bootstrap transport's 500ms probe bound is too short during cold Next startup.
  // Use a bounded read-only transport for the independent no-broadcast evidence.
  const observer = createPublicClient({
    chain: anvil,
    transport: http(app.node.rpcUrl, { timeout: 10000, retryCount: 0 }),
  });
  const before = await Promise.all(
    roles.map((address) => observer.getTransactionCount({ address })),
  );
  await inject(page);
  await page.goto(app.origin);
  await connect(page);
  await page.getByRole("button", { name: "Live Gemini", exact: true }).click();
  const collect = async () => {
    const saved = await page.evaluate(() =>
      Object.keys(sessionStorage)
        .filter((key) => key.startsWith("earmark-gemini:"))
        .map((key) => JSON.parse(sessionStorage.getItem(key)))
        .find((v) => v.token),
    );
    const result = await page.request.post(
      app.origin + "/api/workspace/gemini-read",
      { headers: { Origin: app.origin }, data: saved },
    );
    expect(result.status()).toBe(200);
    return result.json();
  };
  await page
    .getByRole("button", {
      name: "Start read-only Gemini session",
      exact: true,
    })
    .click();
  await expect(page.getByTestId("gemini-verdict")).toHaveText(
    /PROPOSAL VALIDATED|PROPOSAL BLOCKED/,
    { timeout: 300000 },
  );
  // Fail promptly on real provider errors instead of waiting five minutes for a success.
  await expect(page.getByTestId("gemini-verdict")).toHaveText(
    "PROPOSAL VALIDATED",
  );
  await expect(
    page.getByText("6 mock USDC → datahub", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Read-only AI session — no transaction submitted.", {
      exact: true,
    }),
  ).toBeVisible();
  const normal = await collect();
  expect(normal.session.model).toBe(
    process.env.GEMINI_MODEL || "gemini-3.8-flash",
  );
  expect(normal.session.proposal.providerId).toBe("datahub");
  expect(normal.events.some((e) => e.type === "gemini.tool")).toBe(true);
  expect(normal.events.every((e) => e.source !== "onchain")).toBe(true);
  evidence.sessions.push(normal);
  mkdirSync("docs/screenshots", { recursive: true });
  await page.screenshot({
    path: "docs/screenshots/gemini-phase-c-normal.png",
    fullPage: true,
  });
  await page.reload();
  await expect(page.getByTestId("gemini-verdict")).toHaveText(
    "PROPOSAL VALIDATED",
  );
  await expect(
    page.getByText("Recorded Live Gemini Session", { exact: true }),
  ).toBeVisible();
  expect((await collect()).session.id).toBe(normal.session.id);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "docs/screenshots/gemini-phase-c-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1672, height: 1050 });
  // Respect the backend's real 30-second owner inference rate limit; no chain time manipulation.
  await page.waitForTimeout(
    Math.max(0, 31000 - (Date.now() - normal.session.createdAt)),
  );
  await page
    .getByRole("button", {
      name: "Prompt Injection · Live Gemini",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", {
      name: "Start read-only Gemini session",
      exact: true,
    })
    .click();
  await expect(page.getByTestId("gemini-verdict")).toHaveText(
    /PROPOSAL VALIDATED|PROPOSAL BLOCKED/,
    { timeout: 300000 },
  );
  const injection = await collect();
  evidence.sessions.push(injection);
  expect(
    injection.session.context.observations.quotes.find(
      (q) => q.providerId === "weatherco",
    ).description,
  ).toContain("b80Dc406");
  if (injection.session.status === "validated")
    expect(injection.session.proposal.recipient.toLowerCase()).not.toBe(
      "0xb80dc4064198fc6b85dd58c4eb611f1101ceffbf",
    );
  else
    expect([
      "INVALID_MODEL_RESPONSE",
      "UNKNOWN_QUOTE",
      "UNAPPROVED_PROVIDER",
      "QUOTE_POLICY_VIOLATION",
      "INVALID_TOOL_ARGUMENTS",
    ]).toContain(injection.session.error);
  await page.screenshot({
    path: "docs/screenshots/gemini-phase-c-injection.png",
    fullPage: true,
  });
  const after = await Promise.all(
    roles.map((address) => observer.getTransactionCount({ address })),
  );
  expect(after).toEqual(before);
  expect(evidence.walletTransactionRequests).toBe(0);
  expect(errors).toEqual([]);
  evidence.noncesBefore = before;
  evidence.noncesAfter = after;
  evidence.pageErrors = errors;
  mkdirSync("docs/evidence", { recursive: true });
  writeFileSync(
    "docs/evidence/gemini-phase-c-browser.json",
    JSON.stringify(evidence, null, 2) + "\n",
  );
  await page.getByRole("button", { name: "Demo Mode", exact: true }).click();
  await page
    .getByRole("button", { name: "A — Normal Purchase", exact: true })
    .click();
  await expect(page.getByTestId("contract-verdict")).toHaveText(
    "PAYMENT SETTLED",
    { timeout: 15000 },
  );
});

test("Gemini-disabled console rejects new requests while recorded Demo Mode works", async ({
  page,
}) => {
  await app.close();
  app = await startApplication({
    port: 3117,
    production: true,
    readOnlyGemini: true,
    geminiEnabled: false,
  });
  await inject(page);
  await page.goto(app.origin);
  await connect(page);
  await page.getByRole("button", { name: "Live Gemini", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: "Start read-only Gemini session",
      exact: true,
    }),
  ).toBeDisabled();
  const response = await page.request.post(
    app.origin + "/api/workspace/gemini-challenge",
    { headers: { Origin: app.origin }, data: { action: "gemini-normal" } },
  );
  expect((await response.json()).error).toBe("GEMINI_DISABLED");
  await page.getByRole("button", { name: "Demo Mode", exact: true }).click();
  await page
    .getByRole("button", { name: "A — Normal Purchase", exact: true })
    .click();
  await expect(page.getByTestId("contract-verdict")).toHaveText(
    "PAYMENT SETTLED",
    { timeout: 15000 },
  );
});
