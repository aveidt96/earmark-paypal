import { readFileSync, writeFileSync } from "node:fs";

/** Operator-only bootstrap: authenticates the fixed local test owner; never approves/captures. */
async function main() {
  const directory = new URL("../.tools/", import.meta.url);
  const server = JSON.parse(
    readFileSync(new URL("paypal-test-server.json", directory), "utf8"),
  ) as { origin: string; epoch: string; pid: number };
  const auth = JSON.parse(
    readFileSync(new URL("paypal-test-auth.json", directory), "utf8"),
  ) as { loginSecret: string };
  if (
    server.origin !== "http://127.0.0.1:3030" ||
    !/^[a-f0-9]{64}$/.test(server.epoch)
  )
    throw new Error("INVALID_LOCAL_TEST_SERVER");
  process.kill(server.pid, 0); // Only checks liveness; never kills a process.
  const check = await fetch(`${server.origin}/api/paypal/test`);
  if (
    check.status !== 401 ||
    check.headers.get("x-earmark-test-epoch") !== server.epoch
  )
    throw new Error("LOCAL_TEST_SERVER_IDENTITY_MISMATCH");
  const login = await fetch(`${server.origin}/api/paypal/test/login`, {
    method: "POST",
    headers: { Origin: server.origin, "Content-Type": "application/json" },
    body: JSON.stringify({ password: auth.loginSecret }),
  });
  if (!login.ok) throw new Error("LOCAL_TEST_OWNER_LOGIN_FAILED");
  const cookie = login.headers.get("set-cookie")?.split(";")[0];
  const logged = (await login.json()) as { csrfToken: string };
  if (!cookie || !logged.csrfToken)
    throw new Error("LOCAL_TEST_SESSION_REQUIRED");
  let result: Record<string, unknown> = {};
  for (const action of ["mandate", "reserve", "order"]) {
    const response = await fetch(`${server.origin}/api/paypal/test/${action}`, {
      method: "POST",
      headers: {
        Origin: server.origin,
        "Content-Type": "application/json",
        Cookie: cookie,
        "X-Earmark-CSRF": logged.csrfToken,
      },
      body: "{}",
    });
    const body = (await response.json()) as Record<string, unknown>;
    if (!response.ok)
      throw new Error(
        typeof body.error === "string" && /^[A-Z_]+$/.test(body.error)
          ? body.error
          : "CONTROLLED_CHECKOUT_REQUEST_FAILED",
      );
    result = body;
  }
  const attempt = result.attempt as {
    state: string;
    orderId: string | null;
    approvalUrl: string | null;
    captureId: string | null;
  } | null;
  const mandate = result.mandate as { id: string } | null;
  const summary = {
    status: attempt?.approvalUrl
      ? "HUMAN_BUYER_APPROVAL_REQUIRED"
      : "CHECKOUT_REQUIRES_REVIEW",
    url: `${server.origin}/paypal-test`,
    mandateId: mandate?.id,
    orderId: attempt?.orderId,
    captureId: attempt?.captureId,
    paymentState: attempt?.state,
    authorizedMinor: result.authorizedMinor,
    requestedMinor: result.requestedMinor,
    reservedMinor: result.reservedMinor,
    capturedMinor: result.capturedMinor,
    availableMinor: result.availableMinor,
    approvalUrl: attempt?.approvalUrl,
    paymentConfirmed: result.paymentConfirmed,
    authenticatedOwner: true,
    merchantMatched: !!attempt?.approvalUrl,
  };
  writeFileSync(
    new URL("paypal-test-order-result.json", directory),
    JSON.stringify(summary, null, 2) + "\n",
    { mode: 0o600 },
  );
  console.log(JSON.stringify(summary, null, 2));
  if (!attempt?.approvalUrl) process.exitCode = 1;
}
main().catch(() => {
  console.error(
    "CONTROLLED_SANDBOX_ORDER_NOT_CONFIRMED_CHECK_SAVED_STATE_BEFORE_RETRY",
  );
  process.exitCode = 1;
});
