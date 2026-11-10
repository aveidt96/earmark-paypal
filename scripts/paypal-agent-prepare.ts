import { readFileSync, writeFileSync } from "node:fs";
import { PaymentError } from "../web/src/server/paypal/domain";
import type { AgentCheckoutView } from "../web/src/lib/agent-checkout";
async function main() {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args[0] && args[0] !== "--evaluate"))
    throw new PaymentError("INVALID_AGENT_PREPARATION_ARGUMENTS");
  const directory = new URL("../.tools/", import.meta.url),
    server = JSON.parse(
      readFileSync(new URL("paypal-agent-server.json", directory), "utf8"),
    ) as { origin: string; epoch: string };
  const auth = JSON.parse(
    readFileSync(new URL("paypal-test-auth.json", directory), "utf8"),
  ) as { loginSecret: string };
  if (
    server.origin !== "http://127.0.0.1:3032" ||
    !/^[a-f0-9]{64}$/.test(server.epoch)
  )
    throw new PaymentError("LOCAL_AGENT_PROFILE_REQUIRED");
  const request = async (path: string, init?: RequestInit) => {
    const response = await fetch(
      `${server.origin}/api/paypal/agent-checkout${path}`,
      { ...init, redirect: "error", signal: AbortSignal.timeout(240000) },
    );
    if (response.headers.get("x-earmark-agent-epoch") !== server.epoch)
      throw new PaymentError("AGENT_SERVER_IDENTITY_MISMATCH");
    return response;
  };
  if ((await request("")).status !== 401)
    throw new PaymentError("AGENT_OWNER_AUTH_BOUNDARY_REQUIRED");
  const login = await request("/login", {
    method: "POST",
    headers: { Origin: server.origin, "Content-Type": "application/json" },
    body: JSON.stringify({ password: auth.loginSecret }),
  });
  const cookie = login.headers.get("set-cookie")?.split(";")[0],
    session = (await login.json()) as { csrfToken: string };
  if (!login.ok || !cookie || !session.csrfToken)
    throw new PaymentError("AGENT_OWNER_SESSION_REQUIRED");
  const call = async (action: string) => {
    const response = await request(`/${action}`, {
      method: "POST",
      headers: {
        Origin: server.origin,
        "Content-Type": "application/json",
        Cookie: cookie,
        "X-Earmark-CSRF": session.csrfToken,
      },
      body: "{}",
    });
    const result = (await response.json()) as AgentCheckoutView & {
      error?: string;
    };
    if (!response.ok)
      throw new PaymentError(
        result.error && /^[A-Z0-9_]+$/.test(result.error)
          ? result.error
          : "AGENT_PREPARATION_UNAVAILABLE",
      );
    return result;
  };
  let result = await call("initialize");
  if (args.includes("--evaluate")) result = await call("evaluate");
  const report = {
    observedAt: new Date().toISOString(),
    campaign: result.campaign,
    mandate: result.mandate,
    intent: result.intent,
    evaluationState: result.evaluationState,
    liveGeminiConfigured: result.liveGeminiConfigured,
    blocker: result.blocker,
    authenticatedLocalOwner: true,
    productionAuthentication: false,
    persistentReservationEnabled: false,
    paypalOrdersCreated: 0,
    paypalCapturesExecuted: 0,
  };
  writeFileSync(
    new URL("paypal-agent-preparation.json", directory),
    JSON.stringify(report, null, 2) + "\n",
    { mode: 0o600 },
  );
  console.log(JSON.stringify(report, null, 2));
}
main().catch((error: unknown) => {
  console.error(
    error instanceof PaymentError
      ? error.code
      : "AGENT_PREPARATION_UNAVAILABLE",
  );
  process.exitCode = 1;
});
