import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile, copyFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { randomUUID } from "node:crypto";
import { startApplication } from "./start-workspace.mjs";
import { runSecurityDemos } from "../agent/dist/local/security-demo.js";
import {
  writeEvidence,
  mediaTools,
  runBinary,
  verifyMp4,
  videoClipTiming,
} from "./demo-tools.mjs";
const record =
  !process.argv.includes("--verify-only") && !process.argv.includes("--serve");
const serve = process.argv.includes("--serve");
const artifacts = resolve(".tools/stage-7/recordings", randomUUID());
await mkdir(artifacts, { recursive: true });
const evidencePath = join(artifacts, "security.json");
const media = record ? await mediaTools() : null;
const app = await startApplication({
  port: 3217,
  production: true,
  demoStatePath: evidencePath,
});
const browser = await chromium.launch();
const segments = [];
const errors = [];
let context, page, segmentStarted;
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const captions = {
  intro:
    "Earmark: task-scoped financial authority for autonomous agents.\nLocal Anvil | mock USDC | deterministic mock model | simulated services",
  A: "A - Autonomous purchase: 20-USDC vault, 10-USDC mandate, DataHub at 6 USDC.\nFull challenge period reached with disclosed TEST-ONLY Anvil time advancement.",
  B: "B - Provider prompt injection: record actual mock-policy behavior, not a fabricated compromise.\nBackend validation and independent unauthorized-provider contract revert are separate.",
  C: "C - Approved provider, incorrect artifact: inspect byte binding and the owner dispute path.\nHashes are commitments, not proof of semantic correctness.",
  D: "D - Three distinct 4-USDC purchase intents against a 10-USDC mandate.\nWatch cumulative budget checks and the independent onchain probe.",
  outro:
    "Earmark - Every payment has a purpose.\nThe agent chooses. The mandate constrains. Delivery settles.",
};
async function openSegment(name) {
  context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    ...(record
      ? { recordVideo: { dir: artifacts, size: { width: 1920, height: 1080 } } }
      : {}),
  });
  page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(
    app.origin +
      "/security?" +
      (name === "intro" || name === "outro"
        ? "scene=" + name
        : "scenario=" + name),
  );
  await expect(page).toHaveTitle("Security Demos | Earmark");
  await expect(
    page.getByRole("link", { name: "Earmark home", exact: true }),
  ).toBeVisible();
  await expect(page.locator("main")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  segmentStarted = Date.now();
}
async function closeSegment(name) {
  const video = page.video();
  const visibleDuration = (Date.now() - segmentStarted) / 1000;
  await context.close();
  if (record && video)
    segments.push({ name, path: await video.path(), visibleDuration });
  page = null;
  context = null;
}
async function verifyScenario(s) {
  await expect(page.locator(".demo-result")).toContainText(
    s.label + " · complete",
    { timeout: 15000 },
  );
  await expect(page.getByTestId("contract-verdict")).toHaveText(
    s.contractVerdict,
  );
  await expect(page.getByTestId("demo-available")).toHaveText(
    { A: "14", B: "14", C: "20", D: "12" }[s.id] + " USDC",
  );
  await expect(page.getByTestId("demo-reserved")).toHaveText(
    (s.id === "D" ? "8" : "0") + " USDC",
  );
  await expect(
    page.getByRole("heading", { name: "Agent Activity", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Contract Authority", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".demo-receipts")).toContainText(
    s.receipts.at(-1).hash,
  );
  await expect(page.locator(".demo-payments")).toContainText(s.payments[0].id);
  await expect(page.locator(".demo-provider")).toHaveText(s.providerResponse);
  const text = await page.locator("body").innerText();
  expect(text).not.toMatch(/\bFlint\b/i);
  expect(text).toContain("Deterministic Mock");
  expect(s.receipts.every((r) => /^0x[0-9a-f]{64}$/i.test(r.hash))).toBe(true);
  expect(new Set(s.events.map((e) => e.id)).size).toBe(s.events.length);
  await page.screenshot({
    path: resolve("docs/screenshots/stage-7-" + s.id + ".png"),
    fullPage: true,
  });
  if (s.id === "A") {
    const ids = s.events.map((e) => e.id);
    await page.reload();
    await expect(page.locator(".demo-result")).toContainText(
      "Normal Purchase · complete",
    );
    const persisted = await (
      await page.request.get(app.origin + "/api/security-demos")
    ).json();
    expect(persisted.scenarios[0].events.map((e) => e.id)).toEqual(ids);
    const rejected = await page.request.post(
      app.origin + "/api/security-demos",
      { data: { action: "run" } },
    );
    expect(rejected.status()).toBe(405);
    if (!record) {
      await page.route("**/api/security-demos", (route) => route.abort());
      await expect(page.getByRole("status")).toContainText(
        "Last verified snapshot retained",
        { timeout: 10000 },
      );
      await expect(page.locator(".demo-result")).toContainText(
        "Normal Purchase · complete",
      );
      await page.unroute("**/api/security-demos");
      await expect(page.getByRole("status")).toHaveCount(0, { timeout: 10000 });
      await page
        .getByRole("button", { name: "Budget Exhaustion", exact: true })
        .click();
      await expect(page).toHaveURL(/scenario=D$/);
      await page
        .getByRole("button", { name: "Normal Purchase", exact: true })
        .click();
      await expect(page.locator(".demo-result")).toContainText(
        "Normal Purchase · complete",
      );
    }
  }
}
let suite;
try {
  if (record) {
    await openSegment("intro");
    await delay(8000);
    await closeSegment("intro");
  }
  suite = await runSecurityDemos({
    onUpdate: (value) => writeEvidence(evidencePath, value),
    beforeScenario: async (id) => {
      await openSegment(id);
    },
    checkpoint: async () => {
      if (record) await delay(2200);
    },
    afterScenario: async (id) => {
      const snapshot = await (
        await page.request.get(app.origin + "/api/security-demos")
      ).json();
      const s = snapshot.scenarios.find((v) => v.id === id);
      await verifyScenario(s);
      if (record) {
        await delay(3000);
        await page.locator(".demo-receipts").evaluate((el) => {
          el.scrollTop = el.scrollHeight;
        });
        await page.locator(".demo-events").evaluate((el) => {
          el.scrollTop = el.scrollHeight;
        });
        await page.locator(".demo-receipts").scrollIntoViewIfNeeded();
        await delay(Math.max(4000, 32000 - (Date.now() - segmentStarted)));
      }
      await closeSegment(id);
      console.log("Browser verified " + id + ": " + s.contractVerdict);
    },
  });
  await writeEvidence(resolve("demo/earmark-demo-evidence.json"), suite);
  if (errors.length) throw new Error("BROWSER_PAGE_ERROR");
  if (record) {
    await openSegment("outro");
    await delay(10000);
    await closeSegment("outro");
    await copyFile("C:/Windows/Fonts/segoeui.ttf", join(artifacts, "font.ttf"));
    const files = [];
    for (const [i, segment] of segments.entries()) {
      const cap = "caption-" + i + ".txt";
      await writeFile(join(artifacts, cap), captions[segment.name]);
      const metadata = JSON.parse(
        await runBinary(media.ffprobe, [
          "-v",
          "error",
          "-show_format",
          "-of",
          "json",
          segment.path,
        ]),
      );
      const timing = videoClipTiming(
        Number(metadata.format.duration),
        segment.visibleDuration,
      );
      const duration = timing.duration;
      const name = "segment-" + i + ".mp4";
      const filter =
        "scale=1920:1080,setsar=1,fps=30,drawtext=fontfile=font.ttf:textfile=" +
        cap +
        ":fontsize=25:fontcolor=0x092454:box=1:boxcolor=0xEAF6FF@0.96:boxborderw=18:x=50:y=h-88,fade=t=in:st=0:d=0.25,fade=t=out:st=" +
        Math.max(0.5, duration - 0.25) +
        ":d=0.25";
      await runBinary(
        media.ffmpeg,
        [
          "-y",
          "-ss",
          String(timing.start),
          "-i",
          segment.path,
          "-t",
          String(duration),
          "-an",
          "-vf",
          filter,
          "-c:v",
          "libx264",
          "-preset",
          "veryfast",
          "-crf",
          "20",
          "-pix_fmt",
          "yuv420p",
          "-movflags",
          "+faststart",
          name,
        ],
        artifacts,
      );
      files.push("file '" + name + "'");
    }
    await writeFile(join(artifacts, "concat.txt"), files.join("\n"));
    const output = resolve("demo/earmark-metropolis-demo.mp4");
    await runBinary(
      media.ffmpeg,
      [
        "-y",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        "concat.txt",
        "-c",
        "copy",
        "-movflags",
        "+faststart",
        output,
      ],
      artifacts,
    );
    const verified = await verifyMp4(output, browser, media);
    const report = {
      path: output,
      ...verified,
      runId: suite.runId,
      scenarios: suite.scenarios.map((s) => ({
        id: s.id,
        outcome: s.contractVerdict,
      })),
      mode: "deterministic mock",
      environment: suite.environment,
      clockDisclosure: suite.clockDisclosure,
    };
    await writeFile(
      resolve("demo/earmark-video-verification.json"),
      JSON.stringify(report, null, 2) + "\n",
    );
    console.log(JSON.stringify(report, null, 2));
  }
  if (serve) {
    console.log(
      "Earmark Security Demos: " +
        app.origin +
        "/security | read-only verified local snapshots. Ctrl+C to stop.",
    );
    await new Promise((done) => {
      process.once("SIGINT", done);
      process.once("SIGTERM", done);
    });
  }
} finally {
  if (context) await context.close();
  await browser.close();
  await app.close();
}
