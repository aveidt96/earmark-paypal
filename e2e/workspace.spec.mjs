import { test, expect } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { createWalletClient, http } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { anvil } from "viem/chains";
import { startApplication } from "../scripts/start-workspace.mjs";
import { readLocalArtifact } from "../agent/dist/local/harness.js";
let app;
const evidence = {
  environment:
    "Local Anvil, real contracts; test EIP-1193 bridge with Node-held owner signer, not a live browser extension",
  transactions: {},
};
test.beforeAll(async () => {
  app = await startApplication({ port: 3110, production: true });
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
async function snapshot() {
  return (await fetch(`${app.origin}/api/workspace`)).json();
}
async function createMandate(page) {
  await page.goto(`${app.origin}/mandates/new`);
  await expect(
    page.getByRole("button", { name: "Review earmark", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Review earmark", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("reserves no funds");
  await page.screenshot({
    path: "docs/screenshots/stage-6-mandate.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Approve earmark in wallet", exact: true })
    .click();
  await expect(
    page.getByText("Your earmark is ready.", { exact: true }),
  ).toBeVisible();
  const s = await snapshot();
  const m = s.mandates.at(-1);
  expect(m).toBeTruthy();
  evidence.transactions.creation ??= s.events.findLast(
    (e) => e.type === "MandateCreated",
  ).data.transactionHash;
  await page
    .getByRole("link", { name: "Open workspace", exact: false })
    .click();
  return m;
}
test("complete owner browser purchase, challenge, settlement and refresh recovery", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await inject(page);
  await page.goto(app.origin);
  await expect(page).toHaveTitle("Workspace | Earmark");
  await expect(
    page.getByRole("link", { name: "Earmark home", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "money with purpose.",
  );
  expect(await page.locator("body").innerText()).not.toMatch(/\bFlint\b/i);
  await expect
    .poll(() =>
      page
        .locator("header .brand-crystal")
        .evaluate((img) => img.complete && img.naturalWidth > 0),
    )
    .toBe(true);
  await expect(page.locator('meta[property="og:site_name"]')).toHaveAttribute(
    "content",
    "Earmark",
  );
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
    "content",
    "Earmark — Every payment has a purpose.",
  );
  for (const [selector, width, height, name] of [
    ['link[rel="icon"]', 32, 32, "icon"],
    ['link[rel="apple-touch-icon"]', 180, 180, "apple-icon"],
    ['meta[property="og:image"]', 1200, 630, "social"],
  ]) {
    const element = page.locator(selector).first();
    const href = await element.getAttribute(
      selector.startsWith("meta") ? "content" : "href",
    );
    expect(href).toBeTruthy();
    const resource = new URL(href, app.origin);
    const response = await page.request.get(
      app.origin + resource.pathname + resource.search,
    );
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("image/png");
    const png = await response.body();
    expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(png.readUInt32BE(16)).toBe(width);
    expect(png.readUInt32BE(20)).toBe(height);
    const bounds = await page.evaluate(
      async (url) => {
        const img = new Image();
        img.src = url;
        await img.decode();
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let minX = canvas.width,
          maxX = -1;
        for (let i = 0; i < pixels.length; i += 4) {
          if (
            pixels[i + 2] > 180 &&
            pixels[i + 2] - pixels[i] > 50 &&
            pixels[i + 3] > 0
          ) {
            const x = (i / 4) % canvas.width;
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
          }
        }
        return { minX, maxX };
      },
      app.origin + resource.pathname + resource.search,
    );
    expect(bounds.maxX).toBeGreaterThan(bounds.minX);
    if (name === "social") {
      expect(bounds.maxX).toBeGreaterThan(800);
    } else {
      expect(bounds.minX).toBeGreaterThan(0);
      expect(bounds.maxX).toBeLessThan(width - 1);
    }
    writeFileSync(".tools/stage-6.5/" + name + ".png", png);
  }
  await page
    .getByRole("button", { name: "Explore How It Works", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Define the Task");
  await expect(page.getByRole("dialog")).toContainText("Settle on Delivery");
  await expect(page.getByRole("dialog")).toContainText("Owner Control");
  await page
    .getByRole("button", { name: "Explore Security Demos", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "Four repeatable local security scenarios are available.",
  );
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await expect(page.getByTestId("vault-balance")).toHaveText("0.00");
  await expect(
    page.getByText("No escrow payments yet.", { exact: false }),
  ).toBeVisible();
  await connect(page);
  await page.getByRole("button", { name: "Deposit", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Amount", { exact: true })
    .fill("20");
  await page
    .getByRole("button", { name: "Confirm deposit", exact: true })
    .click();
  await expect(page.getByTestId("vault-balance")).toHaveText("20.00");
  evidence.transactions.deposit = (await snapshot()).events.findLast(
    (e) => e.type === "Deposited",
  ).data.transactionHash;
  const mandate = await createMandate(page);
  await expect(page.getByTestId("reserved-balance")).toHaveText("0.00");
  await page.getByRole("button", { name: "Run Agent", exact: true }).click();
  await expect(
    page.getByText("Delivery accepted. Your challenge window is active.", {
      exact: true,
    }),
  ).toBeVisible({ timeout: 60000 });
  await expect(page.getByTestId("reserved-balance")).toHaveText("6.00");
  await expect(page.getByText("Agent selected", { exact: true })).toBeVisible();
  const s = await snapshot();
  const p = s.payments.find((p) => p.taskHash === mandate.id),
    run = s.runs.find((r) => r.mandateId === mandate.id);
  expect(p.status).toBe("ACCEPTED");
  expect(run.inspected).toBe(true);
  expect(run.quotes.map((q) => q.price).sort()).toEqual(["6000000", "8000000"]);
  expect(p.provider.toLowerCase()).toBe(app.providers[0].address.toLowerCase());
  evidence.transactions.funding = p.transactionHash;
  evidence.paymentId = p.id;
  evidence.quotes = run.quotes.map((q) => ({
    providerId: q.providerId,
    quoteId: q.quoteId,
    price: q.price,
    expiresAt: q.expiresAt,
  }));
  for (const [key, type] of [
    ["delivery", "DeliverySubmitted"],
    ["acceptance", "DeliveryAccepted"],
  ]) {
    const event = s.events.find(
      (e) => e.type === type && e.data.paymentId === p.id,
    );
    expect(event).toBeTruthy();
    evidence.transactions[key] = event.data.transactionHash;
    if (type === "DeliveryAccepted") {
      evidence.acceptanceBlockTime = event.chainTime;
      expect(p.challengeDeadline - event.chainTime).toBe(3600);
    }
  }
  evidence.mandateId = mandate.id;
  evidence.runId = run.id;
  evidence.challengeDeadline = p.challengeDeadline;
  evidence.acceptedState = {
    balance: s.balance,
    mandate: s.mandates.find((m) => m.id === mandate.id),
    payment: p,
  };
  await page.screenshot({
    path: "docs/screenshots/stage-6-dashboard.png",
    fullPage: true,
  });
  await page.getByRole("link", { name: "View details", exact: false }).click();
  await expect(
    page.getByRole("button", { name: "Settle payment", exact: true }),
  ).toBeDisabled();
  const abi = readLocalArtifact("TaskVault").abi;
  await expect(
    app.node.publicClient.simulateContract({
      address: app.vault,
      abi,
      functionName: "settlePayment",
      args: [p.id],
      account: app.ownerWallet.account.address,
    }),
  ).rejects.toThrow();
  const attacker = privateKeyToAccount(generatePrivateKey());
  await app.node.testClient.setBalance({
    address: attacker.address,
    value: 10n ** 18n,
  });
  const attackerWallet = createWalletClient({
    chain: anvil,
    transport: http(app.node.rpcUrl),
    account: attacker,
  });
  const badHash = await attackerWallet.writeContract({
    address: app.vault,
    abi,
    functionName: "requestPayment",
    args: [
      mandate.id,
      `0x${"41".repeat(32)}`,
      app.providers[0].address,
      app.token,
      1_000_000n,
    ],
    gas: 500000n,
  });
  const badReceipt = await app.node.publicClient.waitForTransactionReceipt({
    hash: badHash,
  });
  expect(badReceipt.status).toBe("reverted");
  evidence.transactions.unauthorizedPayment = badHash;
  evidence.unauthorizedStatus = badReceipt.status;
  await app.node.testClient.setNextBlockTimestamp({
    timestamp: BigInt(p.challengeDeadline),
  });
  await app.node.testClient.mine({ blocks: 1 });
  evidence.timeAdvance =
    "Test harness advanced Anvil to the full original challenge deadline; production UI has no time-control endpoint.";
  await expect(
    page.getByRole("button", { name: "Settle payment", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Settle payment", exact: true })
    .click();
  await expect(
    page.getByText("Payment settled to the approved provider.", {
      exact: true,
    }),
  ).toBeVisible();
  await page.screenshot({
    path: "docs/screenshots/stage-6-execution.png",
    fullPage: true,
  });
  const final = await snapshot();
  const completed = final.payments.find((x) => x.id === p.id);
  expect(completed.status).toBe("COMPLETED");
  expect(final.balance).toMatchObject({
    actual: "14000000",
    available: "14000000",
    reserved: "0",
  });
  expect(final.mandates.find((m) => m.id === mandate.id)).toMatchObject({
    settled: "6000000",
    remaining: "4000000",
  });
  evidence.transactions.settlement = completed.resolutionHash;
  evidence.completedState = { balance: final.balance, payment: completed };
  const before = final.events.map((e) => e.id);
  await page.reload();
  await expect(
    page.getByText("Payment settled to the approved provider.", {
      exact: true,
    }),
  ).toBeVisible();
  expect((await snapshot()).events.map((e) => e.id)).toEqual(before);
  await page.goto(app.origin);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.getByTestId("vault-balance")).toHaveText("14.00");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "docs/screenshots/stage-6-mobile.png",
    fullPage: true,
  });
  await page.getByRole("link", { name: "Payments", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Payments", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
  writeFileSync(
    "docs/stage-6-evidence.json",
    JSON.stringify(evidence, null, 2) + "\n",
  );
});
test("wallet account/chain changes, rejected signatures, revocation and replay boundaries", async ({
  page,
}) => {
  const wallet = await inject(page);
  wallet.connected = false;
  await page.goto(app.origin);
  await connect(page);
  wallet.chain = "0x1";
  await page.evaluate(() => window.flintTestEmit("chainChanged", "0x1"));
  await expect(
    page.getByRole("button", { name: "Deposit", exact: true }),
  ).toBeDisabled();
  await page.locator(".wallet-pill").click();
  await expect(page.getByText("Wrong network", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Switch to Local Anvil", exact: true })
    .click();
  await page.evaluate(() => window.flintTestEmit("chainChanged", "0x7a69"));
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Deposit", exact: true }),
  ).toBeEnabled();
  wallet.account = app.agentAddress;
  await page.evaluate(
    (a) => window.flintTestEmit("accountsChanged", [a]),
    wallet.account,
  );
  await expect(
    page.getByRole("button", { name: "Deposit", exact: true }),
  ).toBeDisabled();
  wallet.account = app.ownerWallet.account.address;
  await page.evaluate(
    (a) => window.flintTestEmit("accountsChanged", [a]),
    wallet.account,
  );
  await expect(
    page.getByRole("button", { name: "Deposit", exact: true }),
  ).toBeEnabled();
  const m = await createMandate(page);
  wallet.rejectSignature = true;
  await page.getByRole("button", { name: "Run Agent", exact: true }).click();
  await expect(page.locator(".notice[role=alert]")).toContainText("declined");
  expect((await snapshot()).runs.some((r) => r.mandateId === m.id)).toBe(false);
  wallet.rejectSignature = false;
  const response = await page.request.post(
    `${app.origin}/api/workspace/challenge`,
    {
      headers: { Origin: "http://attacker.invalid" },
      data: { mandateId: m.id, action: "launch" },
    },
  );
  expect(response.status()).toBe(400);
  expect((await response.json()).error).toBe("UNTRUSTED_REQUEST_ORIGIN");
  const c = await (
    await page.request.post(`${app.origin}/api/workspace/challenge`, {
      headers: { Origin: app.origin },
      data: { mandateId: m.id, action: "launch" },
    })
  ).json(); // EIP-712 signature via the same owner provider request, with no private key in the page.
  const typed = {
    domain: {
      name: "Flint Owner Launch",
      version: "1",
      chainId: c.chainId,
      verifyingContract: c.vault,
    },
    types: {
      Launch: [
        { name: "action", type: "string" },
        { name: "mandateId", type: "bytes32" },
        { name: "purchaseKey", type: "bytes32" },
        { name: "nonce", type: "bytes32" },
        { name: "expiresAt", type: "uint64" },
      ],
    },
    primaryType: "Launch",
    message: {
      action: "LaunchTask",
      mandateId: c.mandateId,
      purchaseKey: c.purchaseKey,
      nonce: c.nonce,
      expiresAt: BigInt(c.expiresAt),
    },
  };
  const sig = await app.ownerWallet.signTypedData(typed);
  const authorized = await page.request.post(
    `${app.origin}/api/workspace/launch`,
    {
      headers: { Origin: app.origin },
      data: { nonce: c.nonce, signature: sig },
    },
  );
  expect(authorized.status()).toBe(200);
  const replay = await page.request.post(`${app.origin}/api/workspace/launch`, {
    headers: { Origin: app.origin },
    data: { nonce: c.nonce, signature: sig },
  });
  expect(replay.status()).toBe(400);
  expect((await replay.json()).error).toBe("AUTHORIZATION_EXPIRED_OR_USED");
  await expect
    .poll(
      async () =>
        (await snapshot()).runs.find((r) => r.mandateId === m.id)?.status,
      { timeout: 60000 },
    )
    .toBe("awaiting-challenge");
  await page.getByRole("link", { name: "Mandates", exact: true }).click();
  const card = page.locator(".list-grid > section").filter({ hasText: m.id });
  await card
    .getByRole("button", { name: "Revoke earmark", exact: true })
    .click();
  await expect(
    card.getByText("Expired or revoked", { exact: true }),
  ).toBeVisible();
  await page.locator(".wallet-pill").click();
  await page
    .getByRole("button", { name: "Disconnect workspace", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Connect wallet", exact: true }),
  ).toBeVisible();
});

test("owner rejection after revocation and permissionless delivery-timeout refund", async ({
  page,
}) => {
  await inject(page);
  await page.goto(app.origin);
  await connect(page);
  const before = await snapshot();
  const prior = before.runs.find((r) => r.status === "awaiting-challenge");
  expect(prior).toBeTruthy();
  await page.goto(`${app.origin}/executions/${prior.id}`);
  await page
    .getByRole("button", { name: "Reject payment", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Rejection reason", { exact: true })
    .fill("Owner rejects this simulated dataset during the challenge period.");
  await page
    .getByRole("button", { name: "Confirm rejection in wallet", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await snapshot()).payments.find((p) => p.id === prior.paymentId)
          ?.status,
    )
    .toBe("REJECTED");
  await expect(
    page.getByText("Owner rejected the payment. Reservation released.", {
      exact: true,
    }),
  ).toBeVisible();
  const rejected = await snapshot();
  expect(rejected.mandates.find((m) => m.id === prior.mandateId)).toMatchObject(
    { reserved: "0", settled: "0", remaining: "10000000" },
  );
  evidence.rejectionPaymentId = prior.paymentId;
  evidence.transactions.rejection = rejected.payments.find(
    (p) => p.id === prior.paymentId,
  ).resolutionHash;
  const m = await createMandate(page);
  await app.node.testClient.setBalance({
    address: app.providers[0].address,
    value: 0n,
  });
  try {
    await page.getByRole("button", { name: "Run Agent", exact: true }).click();
    await expect
      .poll(
        async () =>
          (await snapshot()).runs.find((r) => r.mandateId === m.id)?.status,
        { timeout: 60000 },
      )
      .toBe("failed");
    const failed = await snapshot();
    const run = failed.runs.find((r) => r.mandateId === m.id),
      p = failed.payments.find((p) => p.id === run.paymentId);
    expect(p.status).toBe("FUNDED");
    expect(failed.balance.reserved).toBe("6000000");
    await page.goto(`${app.origin}/executions/${run.id}`);
    await expect(
      page.getByRole("button", { name: "Refund expired payment", exact: true }),
    ).toBeDisabled();
    await app.node.testClient.setNextBlockTimestamp({
      timestamp: BigInt(p.deliveryDeadline),
    });
    await app.node.testClient.mine({ blocks: 1 });
    await expect(
      page.getByRole("button", { name: "Refund expired payment", exact: true }),
    ).toBeEnabled();
    await page
      .getByRole("button", { name: "Refund expired payment", exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (await snapshot()).payments.find((x) => x.id === p.id)?.status,
      )
      .toBe("EXPIRED");
    await expect(
      page.getByText("Payment expired. Reservation refunded.", { exact: true }),
    ).toBeVisible();
    const refunded = await snapshot();
    expect(refunded.balance).toMatchObject({
      reserved: "0",
      available: "14000000",
    });
    expect(refunded.mandates.find((x) => x.id === m.id)).toMatchObject({
      reserved: "0",
      settled: "0",
      remaining: "10000000",
    });
    evidence.refundPaymentId = p.id;
    evidence.transactions.refund = refunded.payments.find(
      (x) => x.id === p.id,
    ).resolutionHash;
    evidence.providerFailure =
      "Harness removed mock-provider gas to create a real delivery failure; funded escrow recovered through its full delivery timeout.";
  } finally {
    await app.node.testClient.setBalance({
      address: app.providers[0].address,
      value: 10n ** 20n,
    });
  }
  writeFileSync(
    "docs/stage-6-evidence.json",
    JSON.stringify(evidence, null, 2) + "\n",
  );
});
