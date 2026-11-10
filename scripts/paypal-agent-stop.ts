import { execFileSync } from "node:child_process";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PaymentError } from "../web/src/server/paypal/domain";

/** Console-less Windows Next process: invoke its existing SIGTERM cleanup only. */
export async function stopOwnedAgentWithoutConsole(saved: {
  pid: number;
  epoch: string;
  origin: string;
}) {
  const fail = () => {
    throw new PaymentError("OWNED_AGENT_GRACEFUL_STOP_UNAVAILABLE");
  };
  if (
    saved.origin !== "http://127.0.0.1:3032" ||
    !Number.isInteger(saved.pid) ||
    saved.pid <= 0 ||
    !/^[a-f0-9]{64}$/.test(saved.epoch)
  )
    return fail();
  const netstat = execFileSync("netstat", ["-ano", "-p", "tcp"], {
    windowsHide: true,
  }).toString();
  const listeners = netstat
    .split(/\r?\n/)
    .map((line) => line.trim().split(/\s+/))
    .filter((line) => line[1] === "127.0.0.1:3032" && line[3] === "LISTENING");
  if (listeners.length !== 1 || Number(listeners[0]?.[4]) !== saved.pid)
    return fail();
  const identity = await fetch(saved.origin + "/api/paypal/agent-checkout", {
    redirect: "error",
    signal: AbortSignal.timeout(10000),
  });
  if (
    identity.status !== 401 ||
    identity.headers.get("x-earmark-agent-epoch") !== saved.epoch
  )
    return fail();
  // Never attach to an already-running debugger belonging to another project.
  const probe = createServer();
  await new Promise<void>((ok, bad) => {
    probe.once("error", bad);
    probe.listen(9229, "127.0.0.1", ok);
  });
  await new Promise<void>((ok) => probe.close(() => ok()));
  const native = process as NodeJS.Process & {
    _debugProcess?: (pid: number) => void;
  };
  if (typeof native._debugProcess !== "function") return fail();
  native._debugProcess(saved.pid); // Same PID activation used by Node's `inspect -p` client.
  let endpoint: string | undefined;
  const deadline = Date.now() + 10000;
  while (!endpoint && Date.now() < deadline) {
    try {
      const reply = await fetch("http://127.0.0.1:9229/json/list", {
        signal: AbortSignal.timeout(1000),
      });
      const list = (await reply.json()) as Array<{
        webSocketDebuggerUrl?: string;
      }>;
      if (
        list.length === 1 &&
        typeof list[0]?.webSocketDebuggerUrl === "string"
      )
        endpoint = list[0].webSocketDebuggerUrl;
    } catch {
      /* bounded local activation */
    }
    if (!endpoint) await new Promise((ok) => setTimeout(ok, 100));
  }
  if (!endpoint) return fail();
  const url = new URL(endpoint);
  if (
    url.protocol !== "ws:" ||
    url.hostname !== "127.0.0.1" ||
    url.port !== "9229"
  )
    return fail();
  const socket = new WebSocket(endpoint);
  await new Promise<void>((ok, bad) => {
    socket.addEventListener("open", () => ok(), { once: true });
    socket.addEventListener(
      "error",
      () => bad(new PaymentError("OWNED_AGENT_DEBUGGER_UNAVAILABLE")),
      { once: true },
    );
  });
  let id = 0;
  const evaluate = (expression: string) =>
    new Promise<unknown>((ok, bad) => {
      const requestId = ++id;
      const timer = setTimeout(() => {
        socket.removeEventListener("message", handler);
        bad(new PaymentError("OWNED_AGENT_DEBUGGER_TIMEOUT"));
      }, 5000);
      const handler = (message: MessageEvent) => {
        const result = JSON.parse(String(message.data)) as {
          id?: number;
          result?: { result?: { value?: unknown }; exceptionDetails?: unknown };
          error?: unknown;
        };
        if (result.id !== requestId) return;
        clearTimeout(timer);
        socket.removeEventListener("message", handler);
        if (result.error || result.result?.exceptionDetails)
          bad(new PaymentError("OWNED_AGENT_DEBUGGER_REJECTED"));
        else ok(result.result?.result?.value);
      };
      socket.addEventListener("message", handler);
      socket.send(
        JSON.stringify({
          id: requestId,
          method: "Runtime.evaluate",
          params: { expression, returnByValue: true },
        }),
      );
    });
  try {
    const target = (await evaluate(
      "({pid:process.pid,cwd:process.cwd(),listeners:process.listenerCount('SIGTERM')})",
    )) as { pid?: number; cwd?: string; listeners?: number };
    if (
      target.pid !== saved.pid ||
      typeof target.cwd !== "string" ||
      resolve(target.cwd).toLowerCase() !==
        resolve(
          fileURLToPath(new URL("../web/", import.meta.url)),
        ).toLowerCase() ||
      !target.listeners
    )
      return fail();
    // No environment inspection, application invocation, database or payment code.
    // The existing Next cleanup handler stops accepting requests, closes Next and exits.
    await evaluate("setImmediate(()=>process.emit('SIGTERM','SIGTERM'));true");
  } finally {
    socket.close();
  }
  const stopDeadline = Date.now() + 30000;
  while (Date.now() < stopDeadline) {
    try {
      process.kill(saved.pid, 0);
    } catch {
      return;
    }
    await new Promise((ok) => setTimeout(ok, 200));
  }
  return fail();
}
