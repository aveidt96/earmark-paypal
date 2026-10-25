import { describe, it, expect, vi } from "vitest";
import { EventEmitter } from "node:events";
import { createServer } from "node:net";
import { request } from "node:http";
import {
  acquireWorkerLock,
  createApi,
  startHostedApi,
} from "../../api/src/server";
import type { HostedService } from "../../api/src/runtime";
import type { PoolClient } from "pg";
vi.mock("../../api/src/recovery", () => ({ reconcileHosted: vi.fn() }));
import { reconcileHosted } from "../../api/src/recovery";

async function unusedPort() {
  const socket = createServer();
  await new Promise<void>((resolve) => socket.listen(0, "127.0.0.1", resolve));
  const address = socket.address();
  if (!address || typeof address === "string") throw Error("TEST_BIND_FAILED");
  await new Promise<void>((resolve) => socket.close(() => resolve()));
  return address.port;
}

describe("exclusive worker rolling handover", () => {
  it("drains HTTP requests and rejects a partial launch body after shutdown starts", async () => {
    const launch = vi.fn();
    const hosted = {
      origin: "https://earmark-example.vercel.app",
      service: { launch },
    } as unknown as HostedService;
    const api = createApi(hosted, true);
    await new Promise<void>((resolve) =>
      api.server.listen(0, "127.0.0.1", resolve),
    );
    const address = api.server.address();
    if (!address || typeof address === "string")
      throw Error("TEST_BIND_FAILED");
    const req = request({
      host: "127.0.0.1",
      port: address.port,
      path: "/api/workspace/launch",
      method: "POST",
      headers: { Origin: hosted.origin, "Content-Type": "application/json" },
    });
    const response = new Promise<{ status: number | undefined; body: string }>(
      (resolve, reject) => {
        req.on("error", reject);
        req.on("response", (res) => {
          let body = "";
          res.on("data", (chunk) => {
            body += chunk;
          });
          res.on("end", () => resolve({ status: res.statusCode, body }));
        });
      },
    );
    const received = new Promise<void>((resolve) =>
      api.server.once("request", () => resolve()),
    );
    req.write("{");
    await received;
    let closed = false;
    const stopping = api.stop().then(() => {
      closed = true;
    });
    expect(closed).toBe(false);
    req.end("}");
    const result = await response;
    expect(result.status).toBe(503);
    expect(JSON.parse(result.body)).toEqual({ error: "SERVICE_RESTARTING" });
    await stopping;
    expect(closed).toBe(true);
    expect(launch).not.toHaveBeenCalled();
  });
  it("waits for the old session without replacing or releasing its lock", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ locked: false }] })
      .mockResolvedValueOnce({ rows: [{ locked: false }] })
      .mockResolvedValue({ rows: [{ locked: true }] });
    await acquireWorkerLock(
      { query } as unknown as PoolClient,
      "test:worker",
      new AbortController().signal,
      1000,
      1,
    );
    expect(query).toHaveBeenCalledTimes(3);
    for (const [sql, args] of query.mock.calls) {
      expect(sql).toBe(
        "SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS locked",
      );
      expect(args).toEqual(["test:worker"]);
    }
  });
  it("fails closed after bounded contention rather than allowing a second worker", async () => {
    const query = vi.fn(async () => ({ rows: [{ locked: false }] }));
    await expect(
      acquireWorkerLock(
        { query } as unknown as PoolClient,
        "test:worker",
        new AbortController().signal,
        0,
        1,
      ),
    ).rejects.toThrow("WORKER_LOCK_WAIT_TIMEOUT");
    expect(query).toHaveBeenCalledTimes(1);
  });
  it("cancels acquisition on shutdown including a lock returned during cancellation", async () => {
    const controller = new AbortController();
    const query = vi.fn(async () => {
      controller.abort();
      return { rows: [{ locked: true }] };
    });
    await expect(
      acquireWorkerLock(
        { query } as unknown as PoolClient,
        "test:worker",
        controller.signal,
      ),
    ).rejects.toThrow("WORKER_STARTUP_CANCELLED");
    const already = vi.fn();
    await expect(
      acquireWorkerLock(
        { query: already } as unknown as PoolClient,
        "test:worker",
        controller.signal,
      ),
    ).rejects.toThrow("WORKER_STARTUP_CANCELLED");
    expect(already).not.toHaveBeenCalled();
  });
  it("serves only liveness until exclusive lock AND receipt recovery complete", async () => {
    let recover!: () => void;
    const pending = new Promise<void>((resolve) => {
      recover = resolve;
    });
    vi.mocked(reconcileHosted).mockImplementationOnce(async () => {
      await pending;
      return { intents: 0 };
    });
    const leader = Object.assign(new EventEmitter(), {
      query: vi.fn(async () => ({ rows: [{ locked: true }] })),
      release: vi.fn(),
    });
    const launch = vi.fn(async () => {
      throw Error("OWNER_SIGNATURE_REQUIRED");
    });
    const hosted = {
      origin: "https://earmark-example.vercel.app",
      pool: { connect: async () => leader, end: vi.fn(), query: vi.fn() },
      service: {
        config: { vault: "0x0000000000000000000000000000000000000001" },
        ready: vi.fn(),
        drain: vi.fn(),
        launch,
        snapshot: vi.fn(async () => ({ configured: true })),
        register: vi.fn(),
        challenge: vi.fn(),
        options: { model: { mode: "mock" } },
      },
    } as unknown as HostedService;
    const port = await unusedPort();
    const boot = startHostedApi(hosted, port, true);
    const base = "http://127.0.0.1:" + port;
    let api: Awaited<ReturnType<typeof startHostedApi>> | undefined;
    const signalsBeforeTerm = process.listeners("SIGTERM"),
      signalsBeforeInt = process.listeners("SIGINT");
    try {
      await vi.waitFor(() => expect(reconcileHosted).toHaveBeenCalled(), {
        timeout: 2000,
      });
      const health = await fetch(base + "/health");
      expect(health.status).toBe(200);
      expect(await health.json()).toMatchObject({ status: "starting" });
      for (const path of ["/ready", "/api/workspace"]) {
        const response = await fetch(base + path);
        expect(response.status).toBe(503);
        expect(await response.json()).toEqual({ error: "WORKER_STARTING" });
      }
      for (const path of ["register", "challenge", "launch"]) {
        expect(
          (
            await fetch(base + "/api/workspace/" + path, {
              method: "POST",
              headers: {
                Origin: hosted.origin,
                "Content-Type": "application/json",
              },
              body: "{}",
            })
          ).status,
        ).toBe(503);
      }
      expect(launch).not.toHaveBeenCalled();
      expect(hosted.service.snapshot).not.toHaveBeenCalled();
      recover();
      api = await boot;
      expect((await fetch(base + "/api/workspace")).status).toBe(200);
      const result = await fetch(base + "/api/workspace/launch", {
        method: "POST",
        headers: { Origin: hosted.origin, "Content-Type": "application/json" },
        body: "{}",
      });
      expect(result.status).toBe(400);
      expect(await result.json()).toEqual({
        error: "OWNER_SIGNATURE_REQUIRED",
      });
      expect(leader.release).not.toHaveBeenCalled();
    } finally {
      recover();
      api ??= await boot;
      api.stop();
      leader.release(true);
      await hosted.pool.end();
      for (const listener of process.listeners("SIGTERM"))
        if (!signalsBeforeTerm.includes(listener))
          process.removeListener("SIGTERM", listener);
      for (const listener of process.listeners("SIGINT"))
        if (!signalsBeforeInt.includes(listener))
          process.removeListener("SIGINT", listener);
    }
  });
});
