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
  ];
  for (const path of routes) {
    const response = await page.goto(origin + path);
    expect(response.status()).toBe(200);
    await expect(
      page.getByRole("link", { name: "Earmark PayPal home" }),
    ).toBeVisible();
    await expect(page.getByRole("main")).toBeVisible();
  }
  await page.goto(origin);
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
  mkdirSync(new URL("../.tools/", import.meta.url), { recursive: true });
  await page.screenshot({ path: `${root}.tools/paypal-preview-desktop.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(
    page.getByRole("link", { name: "Earmark PayPal home" }),
  ).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
  await page.screenshot({ path: `${root}.tools/paypal-preview-mobile.png` });
  expect(errors).toEqual([]);
  console.log(
    `PASS: ${routes.length} production routes, four recorded scenario controls, Sandbox status, mobile layout and no browser exceptions. External services/mutations blocked.`,
  );
} finally {
  await browser?.close();
  child.kill();
}
