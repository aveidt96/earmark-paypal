import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.mjs",
  fullyParallel: false,
  workers: 1,
  timeout: 120000,
  expect: { timeout: 20000 },
  outputDir: ".tools/playwright-results",
  reporter: [
    ["list"],
    ["html", { outputFolder: ".tools/playwright-report", open: "never" }],
  ],
  use: {
    headless: true,
    viewport: { width: 1672, height: 1050 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
