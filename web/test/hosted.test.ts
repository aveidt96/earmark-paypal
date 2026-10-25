import { describe, it, expect, vi, afterEach } from "vitest";
import { createApi, RateLimiter, safeError } from "../../api/src/server";
import type { HostedService } from "../../api/src/runtime";
import type { Server } from "node:http";
vi.mock("server-only", () => ({}));
import { apiOrigin, forwardApi } from "../src/server/api-proxy";
const servers: Server[] = [];
afterEach(async () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  for (const s of servers.splice(0))
    await new Promise<void>((resolve) => s.close(() => resolve()));
});
async function fixture(enabled = false) {
  const launch = vi.fn(async () => {
    throw new Error("OWNER_SIGNATURE_REQUIRED");
  });
  const snapshot = vi.fn(async () => ({
    configured: true,
    events: [],
    model: "mock",
  }));
  const hosted = {
    origin: "https://earmark-example.vercel.app",
    service: {
      snapshot,
      launch,
      register: vi.fn(),
      challenge: vi.fn(),
      options: { model: { mode: "mock" } },
    },
  } as unknown as HostedService;
  const api = createApi(hosted, enabled);
  servers.push(api.server);
  await new Promise<void>((resolve) =>
    api.server.listen(0, "127.0.0.1", resolve),
  );
  const a = api.server.address();
  if (!a || typeof a === "string") throw Error("TEST_BIND_FAILED");
  return { url: "http://127.0.0.1:" + a.port, launch, snapshot };
}
describe("hosted HTTP trust boundary", () => {
  it("serves explicitly testnet health and public read-only records, coalescing expensive reads", async () => {
    const f = await fixture();
    const h = await fetch(f.url + "/health");
    expect(await h.json()).toMatchObject({
      application: "Earmark",
      chainId: 10143,
    });
    await Promise.all([
      fetch(f.url + "/api/workspace"),
      fetch(f.url + "/api/workspace"),
    ]);
    expect(f.snapshot).toHaveBeenCalledTimes(1);
  });
  it("blocks foreign origins and generic financial/admin routes", async () => {
    const f = await fixture(true);
    const response = await fetch(f.url + "/api/workspace/launch", {
      method: "POST",
      headers: {
        Origin: "https://attacker.example",
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    expect(response.status).toBe(403);
    expect(f.launch).not.toHaveBeenCalled();
    expect((await fetch(f.url + "/execute", { method: "POST" })).status).toBe(
      404,
    );
  });
  it("keeps public execution disabled until explicitly enabled and still requires owner authorization", async () => {
    const f = await fixture();
    const init = {
      method: "POST",
      headers: {
        Origin: "https://earmark-example.vercel.app",
        "Content-Type": "application/json",
      },
      body: "{}",
    };
    expect((await fetch(f.url + "/api/workspace/launch", init)).status).toBe(
      503,
    );
    expect(f.launch).not.toHaveBeenCalled();
    const g = await fixture(true);
    const r = await fetch(g.url + "/api/workspace/launch", init);
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: "OWNER_SIGNATURE_REQUIRED" });
  });
  it("bounds JSON size and prevents CORS wildcard access", async () => {
    const f = await fixture(true);
    const r = await fetch(f.url + "/api/workspace/launch", {
      method: "POST",
      headers: {
        Origin: "https://earmark-example.vercel.app",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: "x".repeat(17000) }),
    });
    expect(await r.json()).toEqual({ error: "REQUEST_TOO_LARGE" });
    expect(f.launch).not.toHaveBeenCalled();
    const preflight = await fetch(f.url + "/api/workspace", {
      method: "OPTIONS",
      headers: { Origin: "https://attacker.example" },
    });
    expect(preflight.status).toBe(403);
    expect(preflight.headers.get("access-control-allow-origin")).toBeNull();
  });
  it("enforces bounded rate buckets and redacts unexpected errors", () => {
    const rate = new RateLimiter(2, 100);
    expect(rate.allow("a", 0)).toBe(true);
    expect(rate.allow("a", 1)).toBe(true);
    expect(rate.allow("a", 2)).toBe(false);
    expect(rate.allow("a", 101)).toBe(true);
    expect(safeError(new Error("sensitive credential details"))).toBe(
      "REQUEST_REJECTED",
    );
  });
});
describe("Vercel deployment proxy", () => {
  it("never falls back to localhost in hosted mode", () => {
    expect(() => apiOrigin({ VERCEL: "1" })).toThrow("HOSTED_API_REQUIRED");
    expect(() => apiOrigin({ EARMARK_DEPLOYMENT: "monad-testnet" })).toThrow(
      "HOSTED_API_REQUIRED",
    );
    for (const url of [
      "http://127.0.0.1:3000",
      "https://attacker.example/",
      "https://api.onrender.com/path",
      "https://api.onrender.com/?key=secret",
    ])
      expect(() => apiOrigin({ EARMARK_API_URL: url })).toThrow(
        "INVALID_HOSTED_API_ORIGIN",
      );
    expect(
      apiOrigin({
        EARMARK_API_URL: "https://earmark-api-testnet.onrender.com",
      }),
    ).toBe("https://earmark-api-testnet.onrender.com");
  });
  it("does not forward a foreign-origin signature request", async () => {
    vi.stubEnv("EARMARK_API_URL", "https://earmark-api-testnet.onrender.com");
    vi.stubEnv("FLINT_WEB_ORIGIN", "https://earmark-example.vercel.app");
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    await expect(
      forwardApi(
        new Request("https://earmark-example.vercel.app/api/workspace/launch", {
          method: "POST",
          headers: { Origin: "https://attacker.example" },
          body: "{}",
        }),
        "launch",
      ),
    ).rejects.toThrow("UNTRUSTED_REQUEST_ORIGIN");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("reports cold-start HTML instead of displaying fabricated successful JSON", async () => {
    vi.stubEnv("EARMARK_API_URL", "https://earmark-api-testnet.onrender.com");
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("Waking up", {
            headers: { "Content-Type": "text/html" },
            status: 503,
          }),
      ),
    );
    await expect(
      forwardApi(
        new Request("https://earmark-example.vercel.app/api/workspace"),
      ),
    ).rejects.toThrow("BACKEND_WAKING_OR_UNAVAILABLE");
  });
});
