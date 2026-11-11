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
  const workspace = await fetch(`${origin}/api/workspace`);
  expect(workspace.status).toBe(200);
  expect(await workspace.json()).toMatchObject({
    error: "PUBLIC_DEMO_READ_ONLY",
  });
  expect(
    (await fetch(`${origin}/api/workspace/launch`, { method: "POST" })).status,
  ).toBe(403);
  expect((await fetch(`${origin}/api/security-demos`)).status).toBe(404);
  expect(await (await fetch(`${origin}/api/paypal/research`)).json()).toEqual({
    available: false,
  });
  browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const externalRequests = [];
  const legacyRequests = [];
  const walletProbes = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.origin !== origin) externalRequests.push(url.hostname);
    if (/^\/api\/(?:workspace|security-demos)(?:\/|$)/.test(url.pathname))
      legacyRequests.push(url.pathname);
  });
  page.on("console", (message) => {
    if (message.text() === "EARMARK_WALLET_PROBE") walletProbes.push(true);
  });
  await page.addInitScript(() => {
    const record = () => console.debug("EARMARK_WALLET_PROBE");
    Object.defineProperty(window, "ethereum", { get: record });
    window.addEventListener("eip6963:requestProvider", record);
  });
  async function assertPayPalOnly() {
    await expect(page.locator(".wallet-tools")).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText(
      /Monad|Local Anvil|mock USDC|Connect (?:your )?wallet|Resolve escrow directly onchain|Legacy EVM|Create an Earmark/i,
    );
    await expect(
      page.locator('a[href="/resolve"], a[href="/mandates/new"]'),
    ).toHaveCount(0);
  }
  async function assertResearchOnly() {
    await expect(page.locator("body")).not.toContainText(
      /\bSandbox\b|synthetic offers|Policy demo|Live Gemini chat|mock planner/i,
    );
    await expect(
      page.locator(
        ".norway-sandbox, .norway-recorded-receipt, .norway-recent-card",
      ),
    ).toHaveCount(0);
  }
  // Smoke verification cannot call external services or submit mutations.
  await page.route("**/*", (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const judgePolicy =
      url.pathname === "/api/judge-sandbox" &&
      request.method() === "POST" &&
      request.postDataJSON()?.action === "evaluate" &&
      request.postDataJSON()?.mode === "policy";
    return new URL(request.url()).origin === origin &&
      (request.method() === "GET" || judgePolicy)
      ? route.continue()
      : route.abort();
  });
  const routes = [
    "/",
    "/mandates",
    "/payments",
    "/activity",
    "/security",
    "/paypal-test",
    "/agent-checkout",
    "/judge",
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
  for (const path of ["/resolve", "/mandates/new", "/executions/fixture"]) {
    expect((await page.goto(origin + path)).status()).toBe(404);
    await assertPayPalOnly();
  }
  await page.goto(origin);
  await expect(
    page.getByRole("heading", { name: "Agent checkout", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Main navigation" }).getByRole("link"),
  ).toHaveText(["Checkout", "Mandates", "Policies", "Activity", "Purchases"]);
  await expect(
    page.getByRole("button", { name: "Research offers" }),
  ).toBeVisible();
  await expect(
    page
      .getByTestId("norway-purchasing-conversation")
      .getByRole("heading", { name: "Policy checks" }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Real merchant research budget" }),
  ).toBeVisible();
  await assertResearchOnly();
  await expect(page.getByLabel("Budget (USD)")).toHaveValue("");
  await expect(
    page.getByRole("region", { name: "Real merchant research budget" }),
  ).not.toContainText(/\$\d/);
  await expect(
    page.getByText("Independent policy simulation · synthetic catalog"),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Judge sandbox", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByTestId("paypal-completed-receipt")).toHaveCount(0);
  for (const path of routes) {
    const response = await page.goto(origin + path);
    expect(response.status()).toBe(200);
    await expect(
      page.getByRole("link", { name: "Earmark PayPal home" }),
    ).toBeVisible();
    await expect(page.getByRole("main")).toBeVisible();
    await assertPayPalOnly();
    if (path !== "/judge") await assertResearchOnly();
    if (
      [
        "/mandates",
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
    await assertPayPalOnly();
    if (path !== "/judge") await assertResearchOnly();
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
  await page.goto(`${origin}/judge`);
  await expect(
    page.getByTestId("norway-purchasing-conversation"),
  ).toBeVisible();
  await expect(
    page.getByRole("article", { name: "Embedded purchase proposal" }),
  ).toContainText("Human authorization required");
  mkdirSync(new URL("../.tools/", import.meta.url), { recursive: true });
  // Check the public Norway layout separately from the Judge console.
  await page.goto(origin);
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
        primary: rect(".norway-commerce"),
        chat: rect(".purchasing-chat"),
        budget: rect(".norway-budget"),
        policy: rect(".norway-policy-rail"),
        overflow: document.documentElement.scrollWidth > innerWidth,
      };
    });
    await page.screenshot({
      path: `${root}.tools/paypal-norway-${width}.png`,
    });
    console.log(
      `Norway ${width}px: assistantTop=${Math.round(geometry.chat.top)}, budgetTop=${Math.round(geometry.budget.top)}, overflow=${geometry.overflow}`,
    );
    expect(geometry.overflow).toBe(false);
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
  await assertResearchOnly();
  // Public Policies explains the review checks. Recorded evidence is on Judge.
  await page.goto(`${origin}/security?scene=intro`);
  await assertPayPalOnly();
  await assertResearchOnly();
  await expect(page.getByRole("heading", { name: "Policies" })).toBeVisible();
  await page.goto(`${origin}/judge`);
  await expect(page.getByTestId("paypal-completed-receipt")).toContainText(
    "6U113515L79775315",
  );
  await expect(page.getByTestId("paypal-completed-receipt")).toContainText(
    "0V581522H50035631",
  );
  const chat = page.getByRole("region", {
    name: /(?:Gemini|Earmark AI) purchasing conversation/,
  });
  expect(
    await chat
      .locator("h3")
      .evaluate((element) => getComputedStyle(element).fontWeight),
  ).toBe("600");
  // Exercise actual judge requests on the dedicated route.
  await page
    .getByRole("button", { name: "Judge sandbox", exact: true })
    .click();
  await expect(chat).toContainText("Public live Gemini is unavailable");
  await expect(page.locator(".norway-policy-card")).toContainText(
    "AWAITING EVALUATION",
  );
  await expect(
    chat.getByRole("button", { name: "Evaluate instruction" }),
  ).toBeDisabled();
  await expect(chat.getByLabel("Owner login secret")).toHaveCount(0);
  await expect(chat.getByLabel("Judge evaluation mode")).toHaveCount(0);
  const judgeLiveDenied = await fetch(`${origin}/api/judge-sandbox`, {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "evaluate",
      mode: "gemini",
      instruction: "Find approved weather data within $10",
    }),
  });
  expect(judgeLiveDenied.status).toBe(403);
  expect(
    (
      await fetch(`${origin}/api/judge-sandbox`, {
        method: "POST",
        headers: { Origin: origin, "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "evaluate",
          mode: "discovery",
          instruction: "Find affordable weather API under $10",
        }),
      })
    ).status,
  ).toBe(403);
  expect((await fetch(`${origin}/api/paypal/agent-checkout/chat`)).status).toBe(
    403,
  );
  for (const [instruction, amount] of [
    [
      "Find the cheapest approved weather feed within $10 and 15 minutes. Do not execute payment.",
      "400",
    ],
    [
      "Use approved backup only for weather data within $10 and 15 minutes.",
      "600",
    ],
    ["Find approved weather data for no more than $3 within 15 minutes.", null],
  ]) {
    await chat.getByLabel("Your purchasing instruction").fill(instruction);
    const response = page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/judge-sandbox") &&
        r.request().method() === "POST",
    );
    await chat.getByRole("button", { name: "Evaluate instruction" }).click();
    const r = await response;
    expect(r.status()).toBe(200);
    const { evaluation } = await r.json();
    expect(evaluation.objective.instruction).toBe(instruction);
    expect(evaluation.source).toBe("DETERMINISTIC_POLICY_ENGINE");
    expect(evaluation.proposal?.amountMinor ?? null).toBe(amount);
    expect(
      evaluation.persisted ||
        evaluation.ownerAuthorized ||
        evaluation.fundsReserved,
    ).toBe(false);
    await expect(chat.getByRole("article")).toContainText(
      amount ? "Human authorization required" : "TRANSACTION_LIMIT_EXCEEDED",
    );
    await expect(chat).toContainText(
      "Mock AI planner · real deterministic policy engine",
    );
  }
  await chat.screenshot({ path: `${root}.tools/task07i-judge-desktop.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  await chat
    .getByLabel("Your purchasing instruction")
    .fill("Find approved weather data within $10 and 2 minutes.");
  const slaResponse = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/judge-sandbox") && r.request().method() === "POST",
  );
  await chat.getByRole("button", { name: "Evaluate instruction" }).click();
  const slaResult = await (await slaResponse).json();
  expect(slaResult.evaluation.authorizationDecision.verdictCode).toBe(
    "OBJECTIVE_MISMATCH",
  );
  await expect(chat.getByRole("article")).toContainText("Proposal blocked");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  await chat.screenshot({ path: `${root}.tools/task07i-judge-mobile.png` });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${origin}/judge`);
  // Browser-only interception. No chat POST or owner credential reaches the server.
  // Full native tool/guard/policy integration is covered by paypal-agent-chat.test.ts.
  const fixture = await (
    await fetch(
      `${origin}/api/paypal/agent?scenarioId=normal&mode=deterministic-policy`,
    )
  ).json();
  const submitted = [];
  const firstResponse = Promise.withResolvers();
  const researchResponse = Promise.withResolvers();
  const researchSource = `https://example.com/weather/${"pricing-".repeat(35)}`;
  let discoveryFixture;
  await page.route("**/api/judge-sandbox", async (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({
        json: {
          authenticated: true,
          localGeminiAvailable: true,
          localDiscoveryAvailable: true,
          publicLiveGemini: false,
          csrfToken: "browser-mock-csrf",
        },
      });
    }
    const { instruction, mode } = route.request().postDataJSON();
    if (mode === "discovery") {
      if (instruction === "Test research failure")
        return route.fulfill({
          status: 409,
          json: { error: "RAW_PROVIDER_DETAIL_FIXTURE" },
        });
      await researchResponse.promise;
      discoveryFixture = {
        discovery: {
          source: "OFFLINE_SEARCH_FIXTURE",
          instruction,
          retrievedAt: "2026-11-04T12:00:00.000Z",
          summary:
            "Offline research fixture. No current price or PayPal support is verified.",
          offers: [
            {
              id: "fixture-weather-api-month",
              provider: "Fixture weather provider",
              service: "Weather API",
              priceMinor: "500",
              currency: "USD",
              billing: "per month",
              availability: "Listed for signup (claim)",
              delivery: null,
              slaMinutes: null,
              paypal: "unknown",
              paypalEvidence: null,
              sources: [{ url: researchSource, cited: true }],
              factStatus: "claimed",
              pricing: {
                status: "source-matched",
                period: "month",
                sourceUrl: researchSource,
              },
              reviewFit: "matches",
              policy: {
                eligible: false,
                canonicalVerdict: "UNAPPROVED_MERCHANT",
                reasons: [
                  "EXTERNAL_MERCHANT_NOT_BOUND",
                  "IMMUTABLE_TERMS_UNVERIFIED",
                ],
              },
            },
          ],
          reviewRecommendation: 0,
          searchSuggestions:
            '<p>Offline search suggestions fixture</p><script>parent.document.documentElement.dataset.searchScript="executed"</script>',
          proposal: null,
          ownerAuthorized: false,
          persisted: false,
          fundsReserved: false,
          evidence: {
            httpStatus: 200,
            durationMs: 1,
            modelTurns: 1,
            collectedTool: "reportDiscoveredOffers",
            citedSourceCount: 1,
            outboundGuardPassed: true,
          },
        },
      };
      return route.fulfill({ json: discoveryFixture });
    }
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
    .getByRole("button", { name: "Judge sandbox", exact: true })
    .click();
  await chat.getByLabel("Judge evaluation mode").selectOption("gemini");
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
  await expect(chat.getByRole("alert")).toContainText(
    "The evaluation took too long",
  );
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
  // New research UI is explicitly stubbed; hosted backend remains denied above.
  await chat.getByLabel("Judge evaluation mode").selectOption("discovery");
  await chat.getByRole("button", { name: "Use example" }).click();
  await expect(chat.getByLabel("Your purchasing instruction")).toHaveValue(
    /Find weather API plans costing less than/,
  );
  await expect(
    chat.getByRole("region", { name: "Online offer research" }),
  ).toHaveCount(0);
  const researchInstruction = "Find an affordable weather API under $10.";
  await chat
    .getByLabel("Your purchasing instruction")
    .fill(researchInstruction);
  await chat
    .getByRole("button", { name: "Research offers", exact: true })
    .click();
  await expect(chat.getByRole("status")).toContainText("20–30 seconds");
  await expect(
    chat.getByRole("button", { name: "Research offers" }),
  ).toBeDisabled();
  await expect(chat.getByLabel("Judge evaluation mode")).toBeDisabled();
  researchResponse.resolve();
  const research = chat.getByRole("region", { name: "Online offer research" });
  await expect(research).toContainText(
    "Offline search fixture · no live research",
  );
  await expect(research).toContainText("PayPal acceptance: unknown");
  await expect(research).toContainText("Recommended for review");
  await expect(research).toContainText("Matches requirements");
  await research.getByText("Sources (1)", { exact: true }).click();
  const source = research.getByRole("link", {
    name: "Pricing evidence · example.com",
  });
  await expect(source).toHaveAttribute("href", researchSource);
  await expect(source).toHaveAttribute("rel", "noopener noreferrer");
  await expect(
    research.getByRole("button", { name: "Review for manual checkout" }),
  ).toHaveCount(0);
  await expect(chat.locator(".chat-user")).toHaveText(researchInstruction);
  await expect(research.locator("iframe")).toHaveAttribute(
    "sandbox",
    "allow-popups",
  );
  expect(
    await page.locator("html").getAttribute("data-search-script"),
  ).toBeNull();
  await research.screenshot({
    path: `${root}.tools/task07j-discovery-desktop.png`,
  });
  for (const width of [1280, 768, 390, 375]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    await expect(source).toBeVisible();
    await expect(
      chat.getByRole("button", { name: "Research offers" }),
    ).toBeEnabled();
  }
  await research.screenshot({
    path: `${root}.tools/task07j-discovery-mobile.png`,
  });
  await chat
    .getByLabel("Your purchasing instruction")
    .fill("Test research failure");
  await chat.getByRole("button", { name: "Research offers" }).click();
  await expect(chat.getByRole("alert")).toContainText(
    "Online research couldn’t finish",
  );
  await expect(chat).not.toContainText("RAW_PROVIDER_DETAIL_FIXTURE");
  await page.setViewportSize({ width: 1440, height: 1000 });
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
  await page.goto(`${origin}/judge`);
  await page
    .getByRole("button", { name: "Judge sandbox", exact: true })
    .click();
  await chat.getByLabel("Judge evaluation mode").selectOption("gemini");
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
    await assertPayPalOnly();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
  }
  await page.goto(origin);
  await expect(
    page.getByRole("heading", { name: "Agent checkout", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: `${root}.tools/paypal-classic-mobile.png` });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: `${root}.tools/paypal-classic-desktop.png` });
  await appearance.selectOption("norway");
  await page.reload();
  await expect(appearance).toHaveValue("norway");
  const publicPosts = [];
  const publicMutationRequests = [];
  page.on("request", (request) => {
    if (!["GET", "HEAD"].includes(request.method())) {
      publicMutationRequests.push(
        `${request.method()} ${new URL(request.url()).pathname}`,
      );
    }
  });
  await page
    .context()
    .addCookies([
      { name: "preview-smoke-session", value: "fixture", url: origin },
    ]);
  const checkoutSource = "https://example.com/checkout/weather-api";
  await page.route("**/api/paypal/research", async (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({ json: { available: true } });
    const payload = route.request().postDataJSON();
    expect((await route.request().allHeaders()).cookie).toContain(
      "preview-smoke-session=fixture",
    );
    publicPosts.push(payload);
    const discovery = structuredClone(discoveryFixture.discovery);
    discovery.instruction = payload.instruction;
    discovery.source =
      publicPosts.length === 1
        ? "OFFLINE_SEARCH_FIXTURE"
        : "LIVE_TAVILY_SEARCH";
    discovery.offers[0].officialMerchantUrl = researchSource;
    if (publicPosts.length === 2) {
      discovery.offers[0].officialCheckoutUrl = checkoutSource;
      discovery.offers[0].sources.push({ url: checkoutSource, cited: true });
    }
    return route.fulfill({ json: { discovery } });
  });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.reload();
    await chat
      .getByLabel("Budget (USD)")
      .fill(width === 1440 ? "25.00" : "1,000");
    await chat
      .getByLabel("Your purchasing instruction")
      .fill("Compare weather API plans within my research budget");
    await chat.getByRole("button", { name: "Research offers" }).click();
    if (width === 1440) {
      await expect(chat.getByRole("alert")).toContainText(
        "couldn’t verify the offer evidence",
      );
      await expect(chat).not.toContainText("Offline search fixture");
      await chat.getByRole("button", { name: "Research offers" }).click();
    }
    await expect(chat).toContainText("Matches requirements");
    await expect(chat).toContainText("Earmark AI · online research");
    await expect(chat).not.toContainText(/\b(?:Google|Tavily|Gemini)\b/i);
    await expect(
      chat.getByRole("region", { name: "Online offer research" }),
    ).toContainText(width === 1440 ? "$25.00" : "$1,000.00");
    await expect(chat).not.toContainText("Ineligible for Earmark payment");
    await expect(
      chat.getByText(
        "Earmark cannot currently execute payments for discovered merchants.",
        { exact: true },
      ),
    ).toHaveCount(1);
    await chat
      .getByRole("button", { name: "Review for manual checkout" })
      .click();
    const merchantLink = chat.getByRole("link", {
      name:
        width === 1440
          ? "Continue to merchant checkout"
          : "View plan on merchant site",
    });
    await expect(merchantLink).toHaveAttribute(
      "href",
      width === 1440 ? checkoutSource : researchSource,
    );
    await expect(merchantLink).toHaveAttribute("target", "_blank");
    await expect(merchantLink).toHaveAttribute("rel", "noopener noreferrer");
    await chat
      .getByRole("button", { name: "Approve for manual checkout" })
      .click();
    await expect(chat).toContainText("Manual checkout intent · not paid");
    await chat.getByRole("button", { name: "Reject", exact: true }).click();
    await expect(chat).toContainText("Rejected · no action");
    await expect(chat).not.toContainText("Manual checkout intent · not paid");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
  }
  expect(publicMutationRequests).toEqual(
    Array(3).fill("POST /api/paypal/research"),
  );
  expect(publicPosts).toEqual(
    [2500, 2500, 100000].map((budgetMinor) => ({
      instruction: "Compare weather API plans within my research budget",
      budgetMinor,
    })),
  );
  expect(errors).toEqual([]);
  expect(externalRequests).toEqual([]);
  expect(legacyRequests).toEqual([]);
  expect(walletProbes).toEqual([]);
  console.log(
    `PASS: ${routes.length} PayPal pages and three legacy page denials, both themes, four PayPal policy scenarios, deterministic Judge and offline public research/manual checkout, hosted endpoint denials, disabled payments and responsive layout. Zero browser exceptions, external requests, legacy API requests or injected wallet probes.`,
  );
} finally {
  await browser?.close();
  child.kill();
}
