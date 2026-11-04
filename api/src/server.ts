import { setTimeout as delay } from "node:timers/promises";
import type { PoolClient } from "pg";
import { reconcileHosted } from "./recovery";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { createHash } from "node:crypto";
import {
  createHostedService,
  databaseReady,
  type HostedService,
} from "./runtime";

export function safeError(error: unknown) {
  return error instanceof Error && /^[A-Z0-9_]+$/.test(error.message)
    ? error.message
    : "REQUEST_REJECTED";
}
export class RateLimiter {
  private buckets = new Map<string, { until: number; count: number }>();
  constructor(
    readonly limit = 30,
    readonly duration = 60000,
  ) {}
  allow(key: string, now = Date.now()) {
    for (const [k, v] of this.buckets)
      if (v.until <= now) this.buckets.delete(k);
    const prior = this.buckets.get(key);
    if (!prior) {
      if (this.buckets.size >= 2000) return false;
      this.buckets.set(key, { until: now + this.duration, count: 1 });
      return true;
    }
    return ++prior.count <= this.limit;
  }
}
async function body(req: IncomingMessage) {
  if (!req.headers["content-type"]?.startsWith("application/json"))
    throw new Error("JSON_REQUIRED");
  let text = "";
  for await (const chunk of req) {
    text += String(chunk);
    if (Buffer.byteLength(text) > 16000) throw new Error("REQUEST_TOO_LARGE");
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("INVALID_REQUEST_JSON");
  }
}
export function createApi(
  hosted: HostedService,
  allowExecution = false,
  initiallyReady = true,
) {
  const reads = new RateLimiter(120),
    writes = new RateLimiter(12),
    globalWrites = new RateLimiter(40);
  let stopping = false;
  let ready = initiallyReady;
  let closing: Promise<void> | undefined;
  let cached: { at: number; value: unknown } | undefined;
  let reading: Promise<unknown> | undefined;
  async function snapshot() {
    if (cached && Date.now() - cached.at < 5000) return cached.value;
    reading ??= hosted.service
      .snapshot()
      .then((value) => {
        cached = { at: Date.now(), value };
        return value;
      })
      .finally(() => {
        reading = undefined;
      });
    return reading;
  }
  const server = createServer(
    async (req: IncomingMessage, res: ServerResponse) => {
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Content-Type", "application/json");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Vary", "Origin");
      const origin = req.headers.origin;
      if (origin === hosted.origin)
        res.setHeader("Access-Control-Allow-Origin", hosted.origin);
      const reply = (status: number, value: unknown) => {
        // A request active when close() starts must not enter a new idle
        // keep-alive period after its response, delaying graceful handover.
        if (stopping) res.setHeader("Connection", "close");
        res.statusCode = status;
        res.end(JSON.stringify(value));
      };
      try {
        const path = new URL(req.url ?? "/", "http://localhost").pathname;
        if (req.method === "OPTIONS") {
          if (origin !== hosted.origin)
            return reply(403, { error: "UNTRUSTED_REQUEST_ORIGIN" });
          res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
          res.setHeader("Access-Control-Allow-Headers", "Content-Type");
          return reply(204, {});
        }
        if (req.method === "GET" && path === "/health")
          return reply(200, {
            application: "Earmark",
            status: stopping ? "stopping" : ready ? "up" : "starting",
            chainId: 10143,
          });
        if (stopping) return reply(503, { error: "SERVICE_RESTARTING" });
        if (!ready) return reply(503, { error: "WORKER_STARTING" });
        if (req.method === "GET" && path === "/ready") {
          await databaseReady(hosted.pool);
          await hosted.service.ready();
          return reply(200, {
            ready: true,
            chainId: 10143,
            persistence: "postgres",
            model: hosted.service.options.model.mode,
          });
        }
        // IP is only a rate-limit hint. The owner signature is the spending authority.
        const ip = createHash("sha256")
          .update(req.socket.remoteAddress ?? "unknown")
          .digest("hex");
        if (req.method === "GET" && path === "/api/workspace") {
          if (!reads.allow(ip)) return reply(429, { error: "RATE_LIMITED" });
          return reply(200, await snapshot());
        }
        if (
          req.method === "POST" &&
          [
            "/api/workspace/register",
            "/api/workspace/challenge",
            "/api/workspace/launch",
            "/api/workspace/gemini-challenge",
            "/api/workspace/gemini-start",
            "/api/workspace/gemini-read",
            "/api/workspace/gemini-cancel",
          ].includes(path)
        ) {
          if (origin !== hosted.origin)
            return reply(403, { error: "UNTRUSTED_REQUEST_ORIGIN" });
          const gemini = path.includes("/gemini-");
          const readOnlyView = path.endsWith("/gemini-read");
          if (
            readOnlyView
              ? !reads.allow(ip)
              : !writes.allow(ip) || !globalWrites.allow("global")
          )
            return reply(429, { error: "RATE_LIMITED" });
          if (!allowExecution && !gemini && path !== "/api/workspace/register")
            return reply(503, { error: "TESTNET_EXECUTION_NOT_ENABLED" });
          const input = await body(req);
          if (stopping) return reply(503, { error: "SERVICE_RESTARTING" });
          const result = path.endsWith("/gemini-challenge")
            ? await hosted.service.gemini.challenge(input)
            : path.endsWith("/gemini-start")
              ? await hosted.service.gemini.start(input)
              : path.endsWith("/gemini-read")
                ? await hosted.service.gemini.view(input)
                : path.endsWith("/gemini-cancel")
                  ? await hosted.service.gemini.cancel(input)
                  : path.endsWith("/register")
                    ? await hosted.service.register(input)
                    : path.endsWith("/challenge")
                      ? await hosted.service.challenge(input)
                      : await hosted.service.launch(input);
          cached = undefined;
          return reply(200, result);
        }
        return reply(404, { error: "UNKNOWN_ROUTE" });
      } catch (error) {
        return reply(400, { error: safeError(error) });
      }
    },
  );
  return {
    server,
    activate: () => {
      if (stopping) throw new Error("SERVICE_RESTARTING");
      ready = true;
    },
    stop: () => {
      stopping = true;
      closing ??= new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
      return closing;
    },
  };
}
/** Keep a single signing worker during rolling deployments; never steal an existing lock. */
export async function acquireWorkerLock(
  leader: Pick<PoolClient, "query">,
  key: string,
  signal: AbortSignal,
  timeoutMs = 240000,
  intervalMs = 1000,
) {
  const until = Date.now() + timeoutMs;
  for (;;) {
    if (signal.aborted) throw new Error("WORKER_STARTUP_CANCELLED");
    const lock = await leader.query<{ locked: boolean }>(
      "SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS locked",
      [key],
    );
    if (signal.aborted) throw new Error("WORKER_STARTUP_CANCELLED");
    if (lock.rows[0]?.locked) return;
    if (Date.now() >= until) throw new Error("WORKER_LOCK_WAIT_TIMEOUT");
    await delay(Math.min(intervalMs, until - Date.now()), undefined, {
      signal,
    }).catch(() => {
      throw new Error("WORKER_STARTUP_CANCELLED");
    });
  }
}

export async function startHostedApi(
  hosted: HostedService,
  port: number,
  allowExecution = false,
) {
  let leader: PoolClient;
  try {
    leader = await hosted.pool.connect();
  } catch (error) {
    await hosted.pool.end();
    throw error;
  }
  const api = createApi(hosted, allowExecution, false);
  const controller = new AbortController();
  let startupDone!: () => void;
  const startup = new Promise<void>((resolve) => {
    startupDone = resolve;
  });
  let cleanup: Promise<void> | undefined;
  const release = () =>
    (cleanup ??= (async () => {
      leader.release(true);
      await hosted.pool.end();
    })());
  let shutdown: Promise<void> | undefined;
  const onSignal = () => {
    if (shutdown) return;
    shutdown = (async () => {
      controller.abort();
      await api.stop();
      await startup;
      await hosted.service.drain();
      await release();
    })().catch(() => {
      console.error("SHUTDOWN_RECONCILE_REQUIRED");
      process.exit(1);
    });
  };
  process.once("SIGTERM", onSignal);
  process.once("SIGINT", onSignal);
  // A lost session stops asynchronous signing as well as the HTTP listener.
  leader.on("error", () => {
    api.stop();
    console.error("WORKER_DATABASE_LOCK_LOST");
    process.exit(1);
  });
  try {
    // Render needs liveness before retiring the old instance. All application
    // routes stay 503 until exclusive authority and receipt recovery are ready.
    await new Promise<void>((resolve, reject) => {
      api.server.once("error", reject);
      api.server.listen(port, "0.0.0.0", resolve);
    });
    await acquireWorkerLock(
      leader,
      `earmark-worker:10143:${hosted.service.config.vault.toLowerCase()}`,
      controller.signal,
    );
    await hosted.service.ready();
    await reconcileHosted(hosted.service, hosted.pool);
    if (controller.signal.aborted) throw new Error("WORKER_STARTUP_CANCELLED");
    api.activate();
    console.log(
      JSON.stringify({
        application: "Earmark",
        event: "api.ready",
        chainId: 10143,
        model: hosted.service.options.model.mode,
      }),
    );
  } catch (error) {
    await api.stop();
    await release();
    process.removeListener("SIGTERM", onSignal);
    process.removeListener("SIGINT", onSignal);
    throw error;
  } finally {
    startupDone();
  }
  return api;
}
export async function startApi(
  env: Record<string, string | undefined> = process.env,
) {
  const port = Number(env.PORT ?? 10000);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535)
    throw new Error("INVALID_SERVICE_PORT");
  return startHostedApi(
    await createHostedService(env),
    port,
    env.EARMARK_ENABLE_TESTNET_EXECUTION === "true",
  );
}
