import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";
import { chromium, expect } from "@playwright/test";

const root = fileURLToPath(new URL("../", import.meta.url));
const server = createServer();
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
await new Promise((resolve) => server.close(resolve));
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
    if (child.exitCode !== null || Date.now() > deadline)
      throw new Error("PREVIEW_START_FAILED");
    try {
      if ((await fetch(origin)).ok) break;
    } catch {
      /* Bounded loopback readiness only. */
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  const status = await fetch(`${origin}/api/integrations/paypal`);
  expect(status.status).toBe(200);
  expect(await status.json()).toMatchObject({
    provider: "paypal",
    environment: "sandbox",
    paymentsImplemented: false,
    paymentsEnabled: false,
  });
  browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  // Smoke verification cannot call external services or submit mutations.
  await page.route("**/*", (route) => {
    const request = route.request();
    return new URL(request.url()).origin === origin &&
      request.method() === "GET"
      ? route.continue()
      : route.abort();
  });
  const routes = [
    "/",
    "/mandates",
    "/mandates/new",
    "/payments",
    "/activity",
    "/security",
    "/resolve",
    "/paypal-test",
    "/agent-checkout",
  ];
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto(origin);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "norway");
  const appearance = page.getByRole("combobox", { name: "Appearance" });
  await expect(appearance.locator("option")).toHaveText([
    "Norway",
    "Classic Light",
  ]);
  for (const [saved, expected] of [
    ["airy", "norway"],
    ["dark", "norway"],
    ["system", "norway"],
    ["light", "light"],
  ]) {
    await page.evaluate(
      (value) => localStorage.setItem("earmark-theme", value),
      saved,
    );
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", expected);
    await expect(appearance).toHaveValue(expected);
    expect(
      await page.evaluate(() => localStorage.getItem("earmark-theme")),
    ).toBe(expected);
  }
  await appearance.selectOption("norway");
  await page.reload();
  await expect(appearance).toHaveValue("norway");
  const navigation = page.getByRole("navigation", { name: "Main navigation" });
  await navigation.getByRole("link", { name: "Policies", exact: true }).click();
  await expect(page).toHaveURL(`${origin}/security`);
  await navigation.getByRole("link", { name: "Checkout", exact: true }).click();
  await expect(page).toHaveURL(`${origin}/`);
  for (const path of routes) {
    const response = await page.goto(origin + path);
    expect(response.status()).toBe(200);
    await expect(
      page.getByRole("link", { name: "Earmark PayPal home" }),
    ).toBeVisible();
    await expect(page.getByRole("main")).toBeVisible();
    if (
      [
        "/mandates",
        "/mandates/new",
        "/payments",
        "/activity",
        "/agent-checkout",
        "/paypal-test",
      ].includes(path)
    ) {
      await page.screenshot({
        path: `${root}.tools/norway-${path.slice(1).replaceAll("/", "-")}-desktop.png`,
      });
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of routes) {
    await page.goto(origin + path);
    await expect(page.getByRole("main")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    if (
      ["/mandates", "/payments", "/activity", "/agent-checkout"].includes(path)
    ) {
      await page.screenshot({
        path: `${root}.tools/norway-${path.slice(1)}-mobile.png`,
      });
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(origin);
  await expect(
    page.getByTestId("norway-purchasing-conversation"),
  ).toBeVisible();
  await expect(
    page.getByRole("article", { name: "Embedded purchase proposal" }),
  ).toContainText("Human authorization required");
  mkdirSync(new URL("../.tools/", import.meta.url), { recursive: true });
  // Check the whole Chat page, not just a crop inside the legacy console.
  for (const [width, height] of [
    [1440, 900],
    [1280, 800],
    [1024, 768],
    [390, 844],
    [375, 812],
  ]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => scrollTo(0, 0));
    const geometry = await page.evaluate(() => {
      const rect = (selector) => {
        const r = document.querySelector(selector).getBoundingClientRect();
        return {
          top: r.top,
          bottom: r.bottom,
          left: r.left,
          right: r.right,
          height: r.height,
        };
      };
      return {
        nav: rect(".floating-nav"),
        notice: rect(".workspace-mode-notice"),
        primary: rect(".norway-commerce"),
        chat: rect(".purchasing-chat"),
        budget: rect(".norway-budget"),
        policy: rect(".norway-policy-rail"),
        merchant: rect(".norway-merchant-name"),
        price: rect(".norway-price"),
        intro: rect(".workspace-intro"),
        overflow: document.documentElement.scrollWidth > innerWidth,
      };
    });
    await page.screenshot({
      path: `${root}.tools/paypal-norway-${width}.png`,
    });
    console.log(
      `Norway ${width}px: assistantTop=${Math.round(geometry.chat.top)}, budgetTop=${Math.round(geometry.budget.top)}, noticeHeight=${Math.round(geometry.notice.height)}, overflow=${geometry.overflow}`,
    );
    expect(geometry.overflow).toBe(false);
    if (
      geometry.merchant.top < geometry.price.bottom &&
      geometry.merchant.bottom > geometry.price.top
    ) {
      expect(geometry.merchant.right).toBeLessThanOrEqual(geometry.price.left);
    }
    if (width >= 1024) expect(geometry.primary.top).toBeLessThan(60);
    else expect(geometry.primary.top - geometry.nav.bottom).toBeLessThan(32);
    await expect(page.locator(".workspace-intro")).toBeHidden();
    await expect(
      page.locator(
        ".execution-console:has(.norway-commerce) > .console-heading",
      ),
    ).toBeHidden();
    if (width >= 1024) {
      expect(geometry.chat.left).toBe(geometry.budget.left);
      expect(geometry.policy.left).toBeGreaterThan(geometry.budget.right);
      expect(geometry.nav.right).toBe(232);
      expect(geometry.chat.top).toBeLessThan(650);
      expect(geometry.budget.top).toBeLessThan(220);
      expect(geometry.notice.height).toBeLessThan(45);
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const selector of [
    ".execution-console > .execution-modes",
    ".execution-console > .gemini-controls",
    ".execution-console > .console-body",
    ".workspace-intro",
    ".workspace-footer",
  ]) {
    await expect(page.locator(selector)).toBeHidden();
  }
  await page.goto(`${origin}/mandates`);
  await expect(page.locator(".norway-legacy-label")).toBeHidden();
  await expect(page.locator(".workspace-footer")).toBeHidden();
  await expect(page.locator(".norway-recorded-receipt")).toBeVisible();
  // Full legacy scenario controls live on Policies, outside the Norway workspace.
  await page.goto(`${origin}/security`);
  await page.getByRole("button", { name: "Demo Mode", exact: true }).click();
  for (const name of [
    "A — Normal Purchase",
    "B — Prompt Injection",
    "C — Invalid Delivery",
    "D — Budget Exhaustion",
  ]) {
    const button = page.getByRole("button", { name, exact: true });
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true");
  }
  await page
    .getByRole("button", { name: "PayPal Agent · Policy", exact: true })
    .click();
  await expect(page.getByTestId("paypal-completed-receipt")).toContainText(
    "6U113515L79775315",
  );
  await expect(page.getByTestId("paypal-completed-receipt")).toContainText(
    "0V581522H50035631",
  );
  const chat = page.getByRole("region", {
    name: "Gemini purchasing conversation",
  });
  expect(
    await chat
      .locator("h3")
      .evaluate((element) => getComputedStyle(element).fontWeight),
  ).toBe("600");
  await page
    .getByRole("button", { name: "Live Gemini chat", exact: true })
    .click();
  await expect(chat).toContainText(
    "Live chat is disabled in this read-only public preview",
  );
  await expect(page.locator(".norway-policy-card")).toContainText(
    "AWAITING EVALUATION",
  );
  await expect(
    chat.getByRole("button", { name: "Send to Gemini" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Policy demo", exact: true }).click();
  // Browser-only interception. No chat POST or owner credential reaches the server.
  // Full native tool/guard/policy integration is covered by paypal-agent-chat.test.ts.
  const fixture = await (
    await fetch(
      `${origin}/api/paypal/agent?scenarioId=normal&mode=deterministic-policy`,
    )
  ).json();
  const submitted = [];
  const firstResponse = Promise.withResolvers();
  await page.route("**/api/paypal/agent-checkout/chat", async (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({
        json: { authenticated: true, csrfToken: "browser-mock-csrf" },
      });
    }
    const { instruction } = route.request().postDataJSON();
    submitted.push(instruction);
    if (instruction === "Find the cheapest eligible weather feed.")
      await firstResponse.promise;
    if (instruction === "Test model failure")
      return route.fulfill({ status: 409, json: { error: "MODEL_TIMEOUT" } });
    const offer = fixture.offersEvaluated.find(
      (o) => o.priceMinor === (instruction.includes("backup") ? "600" : "400"),
    );
    const rejected = instruction === "Test policy rejection";
    return route.fulfill({
      json: {
        evaluation: {
          source: "MOCKED_TRANSPORT_TEST",
          persisted: false,
          fundsReserved: false,
          ownerAuthorized: false,
          objective: { ...fixture.objective, instruction },
          offersEvaluated: fixture.offersEvaluated.filter(
            (o) => o.eligibility === "ELIGIBLE",
          ),
          agentExplanation: rejected
            ? "The requested policy override was rejected."
            : `Mocked comparison selected ${offer.merchantName}.`,
          authorizationDecision: {
            ...fixture.authorizationDecision,
            allowed: !rejected,
            summary: rejected
              ? "Mock policy rejected the requested override."
              : "Mock policy validated the selected synthetic offer; owner approval remains required.",
            checks: fixture.authorizationDecision.checks.map(
              (check, index) => ({
                ...check,
                passed: rejected && index === 0 ? false : check.passed,
              }),
            ),
            verdictCode: rejected
              ? "POLICY_REJECTED"
              : "POLICY_VALIDATED_HUMAN_AUTHORIZATION_REQUIRED",
          },
          proposalState: rejected
            ? "PROPOSAL_REJECTED"
            : "PROPOSAL_AUTHORIZED_NO_ORDER_CREATED",
          proposal: rejected
            ? null
            : {
                merchantName: offer.merchantName,
                amountDisplay: offer.priceDisplay,
                currency: offer.currency,
                amountMinor: offer.priceMinor,
              },
        },
      },
    });
  });
  await page
    .getByRole("button", { name: "Live Gemini chat", exact: true })
    .click();
  for (const [instruction, expected] of [
    ["Find the cheapest eligible weather feed.", "$4.00 USD"],
    ["Use the approved backup merchant only.", "$6.00 USD"],
    ["Test policy rejection", "Proposal blocked"],
  ]) {
    await chat.getByLabel("Your purchasing instruction").fill(instruction);
    await chat.getByRole("button", { name: "Send to Gemini" }).click();
    if (instruction === "Find the cheapest eligible weather feed.") {
      await expect(chat.getByRole("status")).toContainText(
        "Comparing eligible synthetic offers",
      );
      await expect(
        chat.getByRole("button", { name: "Send to Gemini" }),
      ).toBeDisabled();
      firstResponse.resolve();
    }
    await expect(
      chat.getByRole("article", { name: "Embedded purchase proposal" }),
    ).toContainText(expected);
    await expect(chat).toContainText("Mocked Gemini transport · offline test");
    await expect(page.locator(".norway-policy-card")).toContainText(
      instruction === "Test policy rejection" ? "BLOCKED" : "ALL PASSED",
    );
    await expect(chat.locator(".chat-user")).toHaveText(instruction);
  }
  await chat
    .getByLabel("Your purchasing instruction")
    .fill("Test model failure");
  await chat.getByRole("button", { name: "Send to Gemini" }).click();
  await expect(chat.getByRole("alert")).toContainText("MODEL_TIMEOUT");
  await expect(page.locator(".norway-policy-card")).toContainText(
    "AWAITING EVALUATION",
  );
  await expect(
    chat.getByRole("article", { name: "Embedded purchase proposal" }),
  ).toHaveCount(0);
  expect(submitted).toEqual([
    "Find the cheapest eligible weather feed.",
    "Use the approved backup merchant only.",
    "Test policy rejection",
    "Test model failure",
  ]);
  await chat
    .getByLabel("Your purchasing instruction")
    .fill("Use the approved backup merchant only.");
  await chat.getByRole("button", { name: "Send to Gemini" }).click();
  await expect(
    chat.getByRole("article", { name: "Embedded purchase proposal" }),
  ).toContainText("$6.00 USD");
  await expect(
    chat.getByRole("button", {
      name: "Payment execution disabled",
      exact: true,
    }),
  ).toBeDisabled();
  mkdirSync(new URL("../.tools/", import.meta.url), { recursive: true });
  await page
    .getByTestId("norway-purchasing-conversation")
    .screenshot({ path: `${root}.tools/paypal-norway-conversation.png` });
  for (const [name, expectedVerdict] of [
    ["A — Normal Purchase", "PROPOSAL AUTHORIZED — NO PAYPAL ORDER CREATED"],
    ["B — Prompt Injection", "PROPOSAL REJECTED (UNAPPROVED_MERCHANT)"],
    ["C — Invalid Delivery", "PROPOSAL REJECTED (INVALID_DELIVERY_COMMITMENT)"],
    ["D — Budget Exhaustion", "PROPOSAL REJECTED (BUDGET_EXHAUSTED)"],
  ]) {
    const button = page.getByRole("button", { name, exact: true });
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("paypal-agent-verdict")).toContainText(
      expectedVerdict,
    );
    if (name === "B — Prompt Injection") {
      await page
        .getByRole("button", { name: "Policy demo", exact: true })
        .click();
      await page.evaluate(() => scrollTo(0, 0));
      await page.screenshot({
        path: `${root}.tools/norway-injection-desktop.png`,
      });
    }
  }
  mkdirSync(new URL("../.tools/", import.meta.url), { recursive: true });
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: `${root}.tools/paypal-preview-desktop.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(origin);
  await page
    .getByRole("button", { name: "Live Gemini chat", exact: true })
    .click();
  await chat
    .getByLabel("Your purchasing instruction")
    .fill("Find the cheapest eligible weather feed.");
  await chat.getByRole("button", { name: "Send to Gemini" }).click();
  await expect(
    chat.getByRole("article", { name: "Embedded purchase proposal" }),
  ).toContainText("$4.00 USD");
  await expect(
    page.getByRole("link", { name: "Earmark PayPal home" }),
  ).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: `${root}.tools/paypal-preview-mobile.png` });
  await page.getByTestId("norway-purchasing-conversation").screenshot({
    path: `${root}.tools/paypal-norway-conversation-mobile.png`,
  });
  expect(
    await page
      .locator(".purchasing-chat")
      .evaluate(
        (chatElement) =>
          chatElement.getBoundingClientRect().top >
          document.querySelector(".norway-budget").getBoundingClientRect().top,
      ),
  ).toBe(true);
  // Exercise all shared screens in Classic Light and confirm switching survives reload.
  await appearance.selectOption("light");
  await page.reload();
  await expect(appearance).toHaveValue("light");
  for (const path of routes) {
    await page.goto(origin + path);
    await expect(page.getByRole("main")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
  }
  await page.goto(origin);
  await expect(page.getByTestId("norway-purchasing-conversation")).toBeHidden();
  await page.screenshot({ path: `${root}.tools/paypal-classic-mobile.png` });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: `${root}.tools/paypal-classic-desktop.png` });
  await appearance.selectOption("norway");
  await page.reload();
  await expect(appearance).toHaveValue("norway");
  expect(errors).toEqual([]);
  console.log(
    `PASS: ${routes.length} production routes, Norway/Classic Light persistence and legacy migration under OS dark, four recorded and four PayPal scenarios, typed chat with explicitly mocked comparison/proposal/rejection/error states, public chat lockdown, disabled payments, desktop/mobile layout and no browser exceptions. External services/mutations blocked.`,
  );
} finally {
  await browser?.close();
  child.kill();
}
