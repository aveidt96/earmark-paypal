import { spawn } from "node:child_process";
import { mkdir, writeFile, rename, stat } from "node:fs/promises";
import { join, dirname } from "node:path";
import { demoSuiteSchema } from "../agent/dist/security-demo-schema.js";
export async function writeEvidence(path, value) {
  const parsed = demoSuiteSchema.parse(value);
  await mkdir(dirname(path), { recursive: true });
  const pending = path + ".pending";
  await writeFile(pending, JSON.stringify(parsed, null, 2) + "\n", {
    mode: 0o600,
  });
  await replaceEvidence(pending, path);
}
/** Retry Windows sharing violations only. Old valid evidence remains until replacement. */
export async function replaceEvidence(pending, path, renameFile = rename) {
  for (let attempt = 0; ; attempt++) {
    try {
      await renameFile(pending, path);
      return;
    } catch (error) {
      if (!["EPERM", "EACCES", "EBUSY"].includes(error.code) || attempt >= 19)
        throw error;
      await new Promise((done) => setTimeout(done, 50 + attempt * 10));
    }
  }
}
export function runBinary(binary, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, {
      cwd,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "",
      stderr = "";
    child.stdout.on("data", (v) => {
      stdout += v;
    });
    child.stderr.on("data", (v) => {
      stderr = (stderr + v).slice(-12000);
    });
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0
        ? resolve(stdout)
        : reject(new Error("MEDIA_TOOL_FAILED: " + stderr)),
    );
  });
}
/** Remove only the browser-loading lead-in; retain the measured visible session. */
export function videoClipTiming(rawDuration, visibleDuration) {
  if (![rawDuration, visibleDuration].every((v) => Number.isFinite(v) && v > 0))
    throw new Error("INVALID_CAPTURE_TIMING");
  const start = Math.max(0, rawDuration - visibleDuration);
  return { start, duration: rawDuration - start };
}
export function verifyVideoMetadata(value) {
  const video = value.streams?.find((s) => s.codec_type === "video");
  const duration = Number(value.format?.duration);
  if (
    video?.codec_name !== "h264" ||
    video.width !== 1920 ||
    video.height !== 1080 ||
    video.pix_fmt !== "yuv420p" ||
    !Number.isFinite(duration) ||
    duration < 120 ||
    duration > 190
  )
    throw new Error("INVALID_FINAL_VIDEO");
  return {
    duration,
    width: video.width,
    height: video.height,
    codec: video.codec_name,
    pixelFormat: video.pix_fmt,
    bytes: Number(value.format.size),
  };
}
export async function mediaTools() {
  const base = join(
    process.cwd(),
    ".tools",
    "stage-7",
    "ffmpeg",
    "ffmpeg-9.0.2-essentials_build",
    "bin",
  );
  const ffmpeg =
    process.env.FFMPEG_PATH ||
    (process.platform === "win32" ? join(base, "ffmpeg.exe") : "ffmpeg");
  const ffprobe =
    process.env.FFPROBE_PATH ||
    (process.platform === "win32" ? join(base, "ffprobe.exe") : "ffprobe");
  await runBinary(ffmpeg, ["-version"]);
  await runBinary(ffprobe, ["-version"]);
  return { ffmpeg, ffprobe };
}
export async function verifyMp4(path, browser, tools) {
  await stat(path);
  const data = JSON.parse(
    await runBinary(tools.ffprobe, [
      "-v",
      "error",
      "-show_streams",
      "-show_format",
      "-of",
      "json",
      path,
    ]),
  );
  const metadata = verifyVideoMetadata(data);
  await runBinary(tools.ffmpeg, ["-v", "error", "-i", path, "-f", "null", "-"]);
  // Decode-only validation plus actual Chromium playback over loopback HTTP.
  const { createServer } = await import("node:http");
  const { readFile } = await import("node:fs/promises");
  const bytes = await readFile(path);
  const server = createServer((req, res) => {
    if (req.url === "/video.mp4") {
      res.writeHead(200, {
        "Content-Type": "video/mp4",
        "Content-Length": bytes.length,
      });
      res.end(bytes);
    } else {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(
        '<video id="video" src="/video.mp4" muted playsinline controls></video>',
      );
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const page = await browser.newPage();
  try {
    await page.goto("http://127.0.0.1:" + address.port);
    await page.evaluate(async () => {
      await document.querySelector("video").play();
    });
    await page.waitForFunction(
      () => document.querySelector("video").currentTime > 0.3,
      { timeout: 10000 },
    );
    const playback = await page.evaluate(() => {
      const v = document.querySelector("video");
      return {
        width: v.videoWidth,
        height: v.videoHeight,
        duration: v.duration,
        error: v.error?.code ?? null,
      };
    });
    if (
      playback.width !== 1920 ||
      playback.height !== 1080 ||
      playback.error ||
      Math.abs(playback.duration - metadata.duration) > 1
    )
      throw new Error("VIDEO_PLAYBACK_FAILED");
    return { ...metadata, chromiumPlayback: true, fullDecode: true };
  } finally {
    await page.close();
    await new Promise((resolve) => server.close(resolve));
  }
}
