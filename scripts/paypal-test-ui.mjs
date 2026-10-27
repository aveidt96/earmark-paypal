import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";
import { chromium, expect } from "@playwright/test";

// Production UI with intercepted synthetic API responses. Never PayPal payment evidence.
const listener = createServer();
await new Promise((r) => listener.listen(0, "127.0.0.1", r));
const port = listener.address().port;
await new Promise((r) => listener.close(r));
const origin = `http://127.0.0.1:${port}`;
const child = spawn(
  process.execPath,
  [
    "../node_modules/next/dist/bin/next",
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    String(port),
  ],
  {
    cwd: fileURLToPath(new URL("../web/", import.meta.url)),
    stdio: "ignore",
    windowsHide: true,
  },
);
let browser;
try {
  const deadline = Date.now() + 60000;
  for (;;) {
    try {
      if ((await fetch(`${origin}/paypal-test`)).ok) break;
    } catch {
      /* Bounded readiness. */
    }
    if (child.exitCode !== null || Date.now() > deadline)
      throw new Error("MOCK_UI_SERVER_NOT_READY");
    await new Promise((r) => setTimeout(r, 250));
  }
  browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1100 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  let authenticated = false,
    captures = 0;
  const state = {
    authenticated: true,
    ownerLabel: "Verified local Sandbox test owner",
    environment: "sandbox",
    merchantId: "ABCDEFGHJKLMN",
    authorizedMinor: "1000",
    requestedMinor: "600",
    currency: "USD",
    availableMinor: "1000",
    reservedMinor: "0",
    capturedMinor: "0",
    unspentMinor: "1000",
    mandate: null,
    attempt: null,
    authorizationDecision: "MANDATE_NOT_CREATED",
    paymentConfirmed: false,
    webhookConfigured: false,
    executionEnabled: true,
    csrfToken: "mock-ui-csrf",
  };
  await page.route("**/*", async (route) => {
    const req = route.request(),
      url = new URL(req.url());
    if (url.origin !== origin) return route.abort();
    if (!url.pathname.startsWith("/api/paypal/test"))
      return req.method() === "GET" ? route.continue() : route.abort();
    const action = url.pathname.split("/").at(-1);
    if (req.method() === "GET")
      return route.fulfill({
        status: authenticated ? 200 : 401,
        json: authenticated ? state : { error: "TEST_OWNER_AUTH_REQUIRED" },
      });
    const payload = req.postDataJSON();
    if (action === "login") {
      expect(Object.keys(payload)).toEqual(["password"]);
      authenticated = true;
      return route.fulfill({
        json: { authenticated: true, csrfToken: state.csrfToken },
      });
    }
    expect(Object.keys(payload)).toEqual([]);
    expect(req.headers()["x-earmark-csrf"]).toBe(state.csrfToken);
    if (action === "mandate")
      state.mandate = {
        id: "c60750d9-f853-51c2-9eb1-17b678140161",
        status: "ACTIVE",
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
        expired: false,
      };
    if (action === "reserve") {
      state.reservedMinor = "600";
      state.availableMinor = "400";
      state.authorizationDecision = "AUTHORIZED_BUDGET_RESERVED";
      state.attempt = {
        id: "d60750d9-f853-41c2-9eb1-17b678140161",
        state: "RESERVED",
        budgetState: "RESERVED",
        orderId: null,
        captureId: null,
        approvalUrl: null,
        lastRemoteState: null,
        errorCode: null,
      };
    }
    if (action === "order")
      Object.assign(state.attempt, {
        state: "AWAITING_APPROVAL",
        orderId: "MOCKORDER123",
        approvalUrl:
          "https://www.sandbox.paypal.com/checkoutnow?token=MOCKORDER123",
        lastRemoteState: "CREATED",
      });
    if (action === "approval")
      Object.assign(state.attempt, {
        state: "APPROVED",
        approvalUrl: null,
        lastRemoteState: "APPROVED",
      });
    if (action === "capture") {
      captures++;
      Object.assign(state.attempt, {
        state: "PENDING",
        captureId: "MOCKCAPTURE123",
        lastRemoteState: "PENDING",
      });
    }
    if (action === "recover") {
      Object.assign(state.attempt, {
        state: "SUCCEEDED",
        budgetState: "CONSUMED",
        lastRemoteState: "COMPLETED",
      });
      state.capturedMinor = "600";
      state.reservedMinor = "0";
      state.availableMinor = "400";
      state.unspentMinor = "400";
      state.paymentConfirmed = true;
    }
    return route.fulfill({ json: state });
  });
  await page.goto(`${origin}/paypal-test`);
  await page.getByLabel("Local test-owner password").fill("mock-password-only");
  await page
    .getByRole("button", { name: "Sign in to controlled checkout" })
    .click();
  await page.getByRole("button", { name: "Create $10 mandate" }).click();
  await page.getByRole("button", { name: "Reserve $6", exact: true }).click();
  await expect(page.getByTestId("held-reservation")).toHaveText("$6.00 USD");
  await page.getByRole("button", { name: "Create $6 Sandbox order" }).click();
  await expect(
    page.getByRole("link", { name: "Approve with PayPal Sandbox" }),
  ).toHaveAttribute("href", /^https:\/\/www\.sandbox\.paypal\.com\//);
  // No approval link is clicked. Return parameters must not enable capture on their own.
  await page.goto(
    `${origin}/paypal-test?paypal_return=approved&token=MOCKORDER123`,
  );
  await expect(
    page.getByRole("button", { name: "Capture approved $6" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Verify buyer approval" }).click();
  await page.getByRole("button", { name: "Capture approved $6" }).click();
  await expect(page.getByTestId("transaction-status")).toHaveText("PENDING");
  await expect(page.getByTestId("captured-spending")).toHaveText("$0.00 USD");
  await page
    .getByRole("button", { name: "Reconcile authoritative status" })
    .click();
  await expect(page.getByTestId("captured-spending")).toHaveText("$6.00 USD");
  await expect(page.getByTestId("remaining-budget")).toHaveText("$4.00 USD");
  expect(captures).toBe(1);
  await page.evaluate(() => {
    const mark = document.createElement("p");
    mark.textContent = "MOCKED UI TEST ONLY — NOT PAYMENT EVIDENCE";
    mark.style.cssText =
      "position:fixed;bottom:0;left:0;right:0;z-index:99999;background:#fff;color:#000;padding:8px;text-align:center";
    document.body.append(mark);
  });
  mkdirSync(new URL("../.tools/", import.meta.url), { recursive: true });
  await page.screenshot({
    path: fileURLToPath(
      new URL("../.tools/paypal-test-ui-mocked-desktop.png", import.meta.url),
    ),
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    ),
  ).toBe(false);
  await page.screenshot({
    path: fileURLToPath(
      new URL("../.tools/paypal-test-ui-mocked-mobile.png", import.meta.url),
    ),
  });
  expect(errors).toEqual([]);
  console.log(
    "PASS: mocked checkout UI login, fixed budget, untrusted return, approval gate, pending/recovery, $4 projection and mobile. No PayPal/browser approval occurred.",
  );
} finally {
  await browser?.close();
  child.kill();
}
