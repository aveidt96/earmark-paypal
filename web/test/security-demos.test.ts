import { describe, expect, it, vi } from "vitest";
import { mkdtemp, writeFile, readFile, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { demoSuiteSchema } from "@flint/agent/demos";
import {
  verifyVideoMetadata,
  videoClipTiming,
  replaceEvidence,
} from "../../scripts/demo-tools.mjs";
vi.mock("server-only", () => ({}));
import { readDemoEvidence } from "../src/server/security-demos";
const video = {
  streams: [
    {
      codec_type: "video",
      codec_name: "h264",
      width: 1920,
      height: 1080,
      pix_fmt: "yuv420p",
    },
  ],
  format: { duration: "150", size: "12000000" },
};
describe("local demonstration evidence boundary", () => {
  it("refuses a remote request even with an absolute evidence path", async () => {
    await expect(
      readDemoEvidence(
        new Request("https://example.com/api/security-demos"),
        join(tmpdir(), "evidence.json"),
      ),
    ).rejects.toThrow("DEMO_VIEWER_DISABLED");
  });
  it("refuses caller-independent missing or relative configuration", async () => {
    await expect(
      readDemoEvidence(new Request("http://localhost/api/security-demos"), ""),
    ).rejects.toThrow("DEMO_VIEWER_DISABLED");
    await expect(
      readDemoEvidence(
        new Request("http://localhost/api/security-demos"),
        "../secrets",
      ),
    ).rejects.toThrow("DEMO_VIEWER_DISABLED");
  });
  it("strict schema rejects fake, incomplete or secret-bearing evidence", () => {
    expect(
      demoSuiteSchema.safeParse({
        version: 1,
        privateKey: "secret",
        status: "complete",
      }).success,
    ).toBe(false);
    expect(demoSuiteSchema.safeParse({}).success).toBe(false);
  });
  it("rejects oversized evidence before parsing", async () => {
    const dir = await mkdtemp(join(tmpdir(), "earmark-evidence-"));
    try {
      const path = join(dir, "evidence.json");
      await writeFile(path, "x".repeat(2_000_001));
      await expect(
        readDemoEvidence(
          new Request("http://127.0.0.1/api/security-demos"),
          path,
        ),
      ).rejects.toThrow("INVALID_DEMO_EVIDENCE");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
describe("video automation acceptance", () => {
  it("requires playable target format and bounded duration", () => {
    expect(verifyVideoMetadata(video)).toMatchObject({
      duration: 150,
      width: 1920,
      height: 1080,
      codec: "h264",
      bytes: 12000000,
    });
  });
  it.each(["vp9", "av1"])("rejects wrong codec %s", (codec_name) => {
    expect(() =>
      verifyVideoMetadata({
        ...video,
        streams: [{ ...video.streams[0], codec_name }],
      }),
    ).toThrow("INVALID_FINAL_VIDEO");
  });
  it.each([0, 60, 191, "NaN"])("rejects unsuitable duration %s", (duration) => {
    expect(() =>
      verifyVideoMetadata({ ...video, format: { duration, size: "12" } }),
    ).toThrow("INVALID_FINAL_VIDEO");
  });
  it("rejects wrong frame dimensions and pixel format", () => {
    expect(() =>
      verifyVideoMetadata({
        ...video,
        streams: [{ ...video.streams[0], width: 640 }],
      }),
    ).toThrow();
    expect(() =>
      verifyVideoMetadata({
        ...video,
        streams: [{ ...video.streams[0], pix_fmt: "yuv444p" }],
      }),
    ).toThrow();
  });
});

describe("atomic local evidence replacement", () => {
  it("retries Windows sharing violations while preserving the last valid snapshot", async () => {
    const dir = await mkdtemp(join(tmpdir(), "earmark-atomic-"));
    if (!dir.startsWith(join(tmpdir(), "earmark-atomic-")))
      throw new Error("INVALID_TEST_CLEANUP");
    try {
      const current = join(dir, "current.json"),
        pending = join(dir, "pending.json");
      await writeFile(current, "old-verified");
      await writeFile(pending, "new-verified");
      let calls = 0;
      await replaceEvidence(pending, current, async (from, to) => {
        calls++;
        if (calls < 3) {
          expect(await readFile(current, "utf8")).toBe("old-verified");
          throw Object.assign(new Error("reader holds file"), {
            code: "EPERM",
          });
        }
        await rename(from, to);
      });
      expect(calls).toBe(3);
      expect(await readFile(current, "utf8")).toBe("new-verified");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  it("does not retry unrelated filesystem failures", async () => {
    const fail = vi.fn(async () => {
      throw Object.assign(new Error("disk failure"), { code: "EIO" });
    });
    await expect(replaceEvidence("pending", "current", fail)).rejects.toThrow(
      "disk failure",
    );
    expect(fail).toHaveBeenCalledTimes(1);
  });
});

describe("browser loading lead-in trimming", () => {
  it("preserves the complete visible recording after readiness", () => {
    expect(videoClipTiming(20, 8)).toEqual({ start: 12, duration: 8 });
    expect(videoClipTiming(7.98, 8)).toEqual({ start: 0, duration: 7.98 });
  });
  it("refuses invalid timing rather than fabricating footage", () => {
    for (const value of [0, -1, NaN, Infinity]) {
      expect(() => videoClipTiming(value, 8)).toThrow("INVALID_CAPTURE_TIMING");
      expect(() => videoClipTiming(20, value)).toThrow(
        "INVALID_CAPTURE_TIMING",
      );
    }
  });
});
