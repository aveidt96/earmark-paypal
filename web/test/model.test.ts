import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { GEMINI_UNAVAILABLE_NOTE, modelLabel } from "../src/lib/model";
import { getSnapshot } from "../src/server/runtime";
import { WorkspaceStore } from "../src/server/store";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { zeroHash } from "viem";

describe("truthful model identity (no silent fallback)", () => {
  it.each([
    ["gemini", "Gemini"],
    ["qwen", "Qwen"],
    ["mock", "Deterministic Mock"],
    [undefined, "Deterministic Mock"],
    ["invented", "Deterministic Mock"],
  ])("labels mode %j as %j", (mode, label) =>
    expect(modelLabel(mode)).toBe(label),
  );

  it("explains Gemini unavailability with the free-tier message", () =>
    expect(GEMINI_UNAVAILABLE_NOTE).toBe(
      "Live Gemini is temporarily unavailable. Demo Mode remains available.",
    ));
});

describe("backend-authoritative snapshot model identity", () => {
  it("reports mock and unavailable Gemini by default", async () => {
    vi.stubEnv("AGENT_MODEL_PROVIDER", "");
    vi.stubEnv("AGENT_MODEL_MODE", "");
    vi.stubEnv("EARMARK_GEMINI_ENABLED", "");
    const snapshot = await getSnapshot();
    expect(snapshot.configured).toBe(false);
    expect(snapshot.model).toBe("mock");
    expect(snapshot.geminiAvailable).toBe(false);
    vi.unstubAllEnvs();
  });

  it("reports the selected model but keeps inference unavailable until the workspace is configured", async () => {
    vi.stubEnv("AGENT_MODEL_PROVIDER", "gemini");
    vi.stubEnv("EARMARK_GEMINI_ENABLED", "true");
    const snapshot = await getSnapshot();
    expect(snapshot.model).toBe("gemini");
    expect(snapshot.geminiAvailable).toBe(false);
    vi.unstubAllEnvs();
  });

  it("never reports Gemini while the feature switch is off", async () => {
    vi.stubEnv("AGENT_MODEL_PROVIDER", "gemini");
    vi.stubEnv("EARMARK_GEMINI_ENABLED", "false");
    const snapshot = await getSnapshot();
    expect(snapshot.model).toBe("mock");
    expect(snapshot.geminiAvailable).toBe(false);
    vi.unstubAllEnvs();
  });

  it("keeps the legacy Qwen selection working", async () => {
    vi.stubEnv("AGENT_MODEL_PROVIDER", "");
    vi.stubEnv("AGENT_MODEL_MODE", "qwen");
    vi.stubEnv("EARMARK_GEMINI_ENABLED", "");
    const snapshot = await getSnapshot();
    expect(snapshot.model).toBe("qwen");
    expect(snapshot.geminiAvailable).toBe(false);
    vi.unstubAllEnvs();
  });
});

describe("gemini run persistence", () => {
  it("stores and recovers a Gemini-mode run without schema changes elsewhere", () => {
    const path = join(
      process.cwd(),
      "..",
      ".tools",
      "stage-6-store-tests",
      `${randomUUID()}.json`,
    );
    const store = new WorkspaceStore(path, {
      vault: `0x${"12".repeat(20)}`,
      genesis: zeroHash,
    });
    const id = `0x${"ab".repeat(32)}` as `0x${string}`;
    store.mutate((v) => {
      v.runs[id] = {
        id,
        mandateId: `0x${"cd".repeat(32)}` as `0x${string}`,
        mode: "gemini",
        status: "running",
        createdAt: 123,
        quotes: [],
        inspected: false,
        worker: "test-worker",
      };
    });
    expect(store.read().runs[id]?.mode).toBe("gemini");
  });
});
