import { describe, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";
import {
  identity,
  MockModel,
  AgentError,
  type VaultChain,
} from "@flint/agent/server";
import type { AgentContext, AgentDecision } from "@flint/agent/schema";
import { WorkspaceService } from "../src/server/service";
import {
  geminiTypedData,
  geminiStage,
  geminiError,
  type GeminiChallenge,
} from "../src/lib/gemini";
import { launchTypedData } from "../src/lib/model";
import { createApi } from "../../api/src/server";
import type { HostedService } from "../../api/src/runtime";

function fixture() {
  const owner = privateKeyToAccount(generatePrivateKey());
  const other = privateKeyToAccount(generatePrivateKey());
  const env = {
    EARMARK_GEMINI_ENABLED: "true",
    EARMARK_ENABLE_TESTNET_EXECUTION: "false",
    AI_ENABLE_NETWORK: "true",
    GEMINI_API_KEY: "synthetic-test-token",
    GEMINI_MODEL: "gemini-3.8-flash",
  };
  const model = {
    mode: "gemini" as const,
    toolResult: vi.fn(),
    decide: vi.fn(async (context: AgentContext): Promise<AgentDecision> => ({
      kind: "tool",
      name: "requestMandatePayment",
      args: {
        quoteId: context.observations.quotes[0]?.quoteId,
        reason: "DataHub's acceptable quote costs less.",
      },
      summary: "Recommend DataHub.",
    })),
  };
  const statePath = join(
    process.cwd(),
    ".tools",
    "phase-c-tests",
    randomUUID(),
    "workspace.json",
  );
  let now = Math.floor(Date.now() / 1000);
  const chain = {
    verify: vi.fn(async () => {}),
    genesis: async () => identity("genesis"),
  } as unknown as VaultChain;
  const options = {
    config: {
      chainId: 31337 as const,
      network: "Local Anvil",
      rpcUrl: "http://127.0.0.1:1",
      vault: other.address,
      agent: privateKeyToAccount(generatePrivateKey()).address,
      token: privateKeyToAccount(generatePrivateKey()).address,
      providers: [
        {
          id: "datahub",
          name: "DataHub",
          address: privateKeyToAccount(generatePrivateKey()).address,
        },
        {
          id: "weatherco",
          name: "WeatherCo",
          address: privateKeyToAccount(generatePrivateKey()).address,
        },
      ],
    },
    chain,
    model: new MockModel(),
    providers: [],
    statePath,
    journalPath: statePath + ".payments",
    fromBlock: 0n,
    now: () => now,
    gemini: { env, modelFactory: () => model },
  };
  const service = new WorkspaceService(options);
  vi.spyOn(service, "owner").mockResolvedValue(owner.address);
  const authorize = async (
    action: GeminiChallenge["action"] = "gemini-normal",
    sessionId?: Hex,
  ) => {
    const c = await service.gemini.challenge({
      action,
      ...(sessionId ? { sessionId } : {}),
    });
    return {
      c,
      auth: {
        nonce: c.nonce,
        signature: await owner.signTypedData(geminiTypedData(c)),
      },
    };
  };
  return {
    owner,
    other,
    service,
    options,
    model,
    env,
    authorize,
    advance: (seconds: number) => {
      now += seconds;
    },
    statePath,
  };
}
describe("owner-authenticated read-only Gemini sessions", () => {
  it("refuses production legacy inference without a synthetic outbound policy even outside the PayPal profile", async () => {
    const t = fixture();
    const service = new WorkspaceService({
      ...t.options,
      gemini: { env: t.env },
    });
    expect(service.gemini.available()).toBe(false);
    await expect(
      service.gemini.challenge({ action: "gemini-normal" }),
    ).rejects.toThrow("MISSING_MODEL_CONFIGURATION");
    expect(t.model.decide).not.toHaveBeenCalled();
  });
  it("disables the legacy model route in the synthetic-only PayPal profile", async () => {
    const t = fixture();
    const service = new WorkspaceService({
      ...t.options,
      gemini: {
        ...t.options.gemini,
        env: { ...t.env, PAYPAL_AGENT_CHECKOUT_ENABLED: "true" },
      },
    });
    expect(service.gemini.available()).toBe(false);
    await expect(
      service.gemini.challenge({ action: "gemini-normal" }),
    ).rejects.toThrow("MISSING_MODEL_CONFIGURATION");
    expect(t.model.decide).not.toHaveBeenCalled();
  });
  it("persists actual restricted results and independent validation without financial workspace changes", async () => {
    const t = fixture(),
      { auth } = await t.authorize();
    const access = await t.service.gemini.start(auth);
    await t.service.drain();
    const view = await t.service.gemini.view(access);
    expect(view.session.status).toBe("validated");
    expect(view.session.proposal).toMatchObject({
      providerId: "datahub",
      amount: "6000000",
    });
    expect(view.events.map((e) => e.type)).toContain("gemini.validated");
    expect(geminiStage(view.events)).toBe(5);
    expect(view.events.every((e) => e.source !== "onchain")).toBe(true);
    expect(JSON.stringify(view)).not.toContain("accessHash");
    const main = await (await t.service.ready()).read();
    expect(main.runs).toEqual({});
    expect(main.challenges).toEqual({});
    expect(main.events).toEqual([]);
    expect(readFileSync(t.statePath + ".gemini.json", "utf8")).not.toContain(
      access.token,
    );
    const recovered = new WorkspaceService(t.options);
    vi.spyOn(recovered, "owner").mockResolvedValue(t.owner.address);
    expect((await recovered.gemini.view(access)).session.status).toBe(
      "validated",
    );
  });
  it("consumes the signed nonce atomically; concurrent retries cannot duplicate inference", async () => {
    const t = fixture(),
      { auth } = await t.authorize();
    const results = await Promise.allSettled([
      t.service.gemini.start(auth),
      t.service.gemini.start(auth),
    ]);
    await t.service.drain();
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(t.model.decide).toHaveBeenCalledTimes(1);
    await expect(t.service.gemini.start(auth)).rejects.toThrow(
      "EXPIRED_OR_USED",
    );
  });
  it("rejects unsigned, wrong-owner, expired and cross-action authorizations", async () => {
    const t = fixture(),
      { c } = await t.authorize();
    await expect(
      t.service.gemini.start({
        nonce: c.nonce,
        signature: await t.other.signTypedData(geminiTypedData(c)),
      }),
    ).rejects.toThrow("OWNER_SIGNATURE_REQUIRED");
    await expect(
      t.service.gemini.start({
        nonce: c.nonce,
        signature: await t.owner.signTypedData(
          launchTypedData({ ...c, action: "launch" }),
        ),
      }),
    ).rejects.toThrow("OWNER_SIGNATURE_REQUIRED");
    await expect(
      t.service.launch({
        nonce: c.nonce,
        signature: await t.owner.signTypedData(geminiTypedData(c)),
      }),
    ).rejects.toThrow("AUTHORIZATION_EXPIRED_OR_USED");
    const auth = {
      nonce: c.nonce,
      signature: await t.owner.signTypedData(geminiTypedData(c)),
    };
    t.advance(121);
    await expect(t.service.gemini.start(auth)).rejects.toThrow(
      "EXPIRED_OR_USED",
    );
    expect(t.model.decide).not.toHaveBeenCalled();
  });
  it("binds chain, vault and current owner without trusting browser identity", async () => {
    const t = fixture(),
      { c, auth } = await t.authorize();
    const signature = await t.owner.signTypedData(
      geminiTypedData({ ...c, chainId: 10143 }),
    );
    await expect(
      t.service.gemini.start({ nonce: c.nonce, signature }),
    ).rejects.toThrow("OWNER_SIGNATURE_REQUIRED");
    await expect(
      t.service.gemini.start({ ...auth, owner: t.owner.address }),
    ).rejects.toThrow();
    vi.spyOn(t.service, "owner").mockResolvedValue(t.other.address);
    await expect(t.service.gemini.start(auth)).rejects.toThrow(
      "OWNER_SIGNATURE_REQUIRED",
    );
  });
  it("keeps records viewable with Gemini disabled and supports new signed view access", async () => {
    const t = fixture(),
      { auth } = await t.authorize();
    const access = await t.service.gemini.start(auth);
    await t.service.drain();
    t.env.EARMARK_GEMINI_ENABLED = "false";
    await expect(
      t.service.gemini.challenge({ action: "gemini-normal" }),
    ).rejects.toThrow("GEMINI_DISABLED");
    expect((await t.service.gemini.view(access)).session.status).toBe(
      "validated",
    );
    const read = await t.authorize("gemini-view", access.sessionId);
    const renewed = await t.service.gemini.start(read.auth);
    expect((await t.service.gemini.view(renewed)).session.status).toBe(
      "validated",
    );
    expect(t.model.decide).toHaveBeenCalledTimes(1);
    await expect(t.service.gemini.view(access)).rejects.toThrow(
      "AUTH_REQUIRED",
    );
  });
  it.each([
    "GEMINI_DISABLED",
    "READ_ONLY_ENVIRONMENT_REQUIRED",
    "MISSING_MODEL_CONFIGURATION",
  ])("fails closed for %s before inference", async (code) => {
    const t = fixture();
    if (code === "GEMINI_DISABLED") t.env.EARMARK_GEMINI_ENABLED = "false";
    if (code === "READ_ONLY_ENVIRONMENT_REQUIRED")
      t.env.EARMARK_ENABLE_TESTNET_EXECUTION = "true";
    if (code === "MISSING_MODEL_CONFIGURATION") t.env.GEMINI_API_KEY = "";
    await expect(
      t.service.gemini.challenge({ action: "gemini-normal" }),
    ).rejects.toThrow(code);
    expect(t.model.decide).not.toHaveBeenCalled();
  });
  it("enforces owner rate limits and prevents reads after owner transfer or access expiry", async () => {
    const t = fixture(),
      { auth } = await t.authorize();
    const access = await t.service.gemini.start(auth);
    await t.service.drain();
    const repeat = await t.authorize();
    await expect(t.service.gemini.start(repeat.auth)).rejects.toThrow(
      "INFERENCE_RATE_LIMITED",
    );
    await expect(
      t.service.gemini.view({ ...access, token: "11".repeat(32) }),
    ).rejects.toThrow("AUTH_REQUIRED");
    t.advance(1801);
    await expect(t.service.gemini.view(access)).rejects.toThrow(
      "AUTH_REQUIRED",
    );
  });
  it.each([
    "MODEL_TIMEOUT",
    "MODEL_RATE_LIMITED",
    "MODEL_API_ERROR",
    "INVALID_MODEL_RESPONSE",
  ])("preserves partial history for %s with no fallback", async (code) => {
    const t = fixture();
    t.model.decide.mockRejectedValue(new AgentError(code));
    const { auth } = await t.authorize(),
      access = await t.service.gemini.start(auth);
    await t.service.drain();
    const view = await t.service.gemini.view(access);
    expect(view.session).toMatchObject({ status: "failed", error: code });
    expect(view.events.some((e) => e.type === "gemini.started")).toBe(true);
    expect(geminiError(code)).not.toBe("");
    expect(t.model.decide).toHaveBeenCalledTimes(1);
  });
  it("cancels in-flight work and never dispatches its returned proposal", async () => {
    const t = fixture();
    let release!: (decision: AgentDecision) => void;
    t.model.decide.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const { auth } = await t.authorize(),
      access = await t.service.gemini.start(auth);
    await vi.waitFor(() => expect(release).toBeDefined());
    await t.service.gemini.cancel(access);
    release({
      kind: "tool",
      name: "getMandate",
      args: {},
      summary: "Read mandate.",
    });
    await t.service.drain();
    const view = await t.service.gemini.view(access);
    expect(view.session.status).toBe("cancelled");
    expect(view.events.some((e) => e.type === "gemini.tool")).toBe(false);
  });
  it("marks a persisted running session interrupted on restart without retrying inference", async () => {
    const t = fixture();
    let release!: (decision: AgentDecision) => void;
    t.model.decide.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const { auth } = await t.authorize(),
      access = await t.service.gemini.start(auth);
    await vi.waitFor(() => expect(release).toBeDefined());
    const recovered = new WorkspaceService(t.options);
    vi.spyOn(recovered, "owner").mockResolvedValue(t.owner.address);
    expect((await recovered.gemini.view(access)).session.status).toBe(
      "interrupted",
    );
    await t.service.gemini.cancel(access);
    release({
      kind: "tool",
      name: "getMandate",
      args: {},
      summary: "Read mandate.",
    });
    await t.service.drain();
    expect(t.model.decide).toHaveBeenCalledTimes(1);
  });
  it("routes read-only inference while financial execution is off, with exact-origin and owner checks", async () => {
    const t = fixture();
    const api = createApi(
      {
        service: t.service,
        origin: "https://earmark-test.vercel.app",
      } as unknown as HostedService,
      false,
    );
    await new Promise<void>((resolve) =>
      api.server.listen(0, "127.0.0.1", resolve),
    );
    try {
      const address = api.server.address();
      if (!address || typeof address === "string")
        throw Error("TEST_BIND_FAILED");
      const base = "http://127.0.0.1:" + address.port + "/api/workspace/";
      const request = (
        path: string,
        body: unknown,
        origin = "https://earmark-test.vercel.app",
      ) =>
        fetch(base + path, {
          method: "POST",
          headers: { Origin: origin, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      expect(
        (
          await request(
            "gemini-challenge",
            { action: "gemini-normal" },
            "https://attacker.example",
          )
        ).status,
      ).toBe(403);
      expect((await request("launch", {})).status).toBe(503);
      expect(
        (
          await request("gemini-start", {
            nonce: identity("fake"),
            signature: "0x" + "00".repeat(65),
          })
        ).status,
      ).toBe(400);
      expect(t.model.decide).not.toHaveBeenCalled();
      const c = (await (
        await request("gemini-challenge", { action: "gemini-normal" })
      ).json()) as GeminiChallenge;
      const result = await request("gemini-start", {
        nonce: c.nonce,
        signature: await t.owner.signTypedData(geminiTypedData(c)),
      });
      expect(result.status).toBe(200);
      await t.service.drain();
    } finally {
      await new Promise<void>((resolve) => api.server.close(() => resolve()));
    }
  });
});
