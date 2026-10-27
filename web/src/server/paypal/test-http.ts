import "server-only";
import { z } from "zod";
import { externalIdSchema, parse, PaymentError } from "./domain";
import { getTestRuntime } from "./test-runtime";

async function body(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new PaymentError("JSON_REQUIRED");
  if (Number(request.headers.get("content-length") ?? 0) > 2048)
    throw new PaymentError("REQUEST_TOO_LARGE");
  const reader = request.body?.getReader();
  if (!reader) throw new PaymentError("INVALID_PAYMENT_INPUT");
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > 2048) throw new PaymentError("REQUEST_TOO_LARGE");
      parts.push(next.value);
    }
    try {
      return JSON.parse(Buffer.concat(parts).toString("utf8")) as unknown;
    } catch {
      throw new PaymentError("INVALID_PAYMENT_INPUT");
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
const empty = z.strictObject({});
export async function handleTestCheckout(
  request: Request,
  action?: string,
  runtime: typeof getTestRuntime = getTestRuntime,
) {
  const headers: Record<string, string> = {
    "Cache-Control": "no-store",
    Vary: "Cookie",
  };
  try {
    const services = runtime();
    headers["X-Earmark-Test-Epoch"] = services.auth.config.sessionEpoch;
    if (request.method === "GET" && !action) {
      const session = services.auth.authenticate(request);
      const snapshot = await (
        await services.checkout()
      ).snapshot(services.auth.principal(session));
      return Response.json(
        { ...snapshot, csrfToken: session.csrf },
        { headers },
      );
    }
    if (
      request.method !== "POST" ||
      !action ||
      ![
        "login",
        "logout",
        "mandate",
        "reserve",
        "order",
        "approval",
        "capture",
        "recover",
        "cancel",
        "hold-original",
        "order-once",
        "capture-once",
      ].includes(action)
    )
      throw new PaymentError("UNKNOWN_TEST_CHECKOUT_ACTION");
    if (action === "login") {
      const logged = services.auth.login(request, await body(request));
      headers["Set-Cookie"] = logged.cookie;
      return Response.json(
        { authenticated: true, csrfToken: logged.session.csrf },
        { headers },
      );
    }
    const session = services.auth.authenticate(request, true);
    const raw = await body(request);
    const input =
      action === "recover"
        ? parse(z.strictObject({ orderId: externalIdSchema.optional() }), raw)
        : parse(empty, raw);
    if (action === "logout") {
      headers["Set-Cookie"] = services.auth.logout(session);
      return Response.json({ authenticated: false }, { headers });
    }
    if (
      services.auth.config.preparationOnly &&
      !(services.auth.config.usCaptureOnce
        ? action === "capture-once"
        : services.auth.config.usOrderOnce
          ? action === "order-once"
          : ["mandate", "reserve", "hold-original"].includes(action))
    )
      throw new PaymentError("PREPARATION_ONLY_NO_PAYMENT_ACTIONS");
    const checkout = await services.checkout(),
      actor = services.auth.principal(session);
    const snapshot =
      action === "mandate"
        ? await checkout.mandate(actor)
        : await checkout.action(
            actor,
            action,
            "orderId" in input
              ? (input.orderId as string | undefined)
              : undefined,
          );
    return Response.json({ ...snapshot, csrfToken: session.csrf }, { headers });
  } catch (error) {
    const code =
      error instanceof PaymentError
        ? error.code
        : "PAYPAL_TEST_CHECKOUT_UNAVAILABLE";
    const status =
      code === "TEST_OWNER_AUTH_REQUIRED"
        ? 401
        : [
              "UNTRUSTED_REQUEST_ORIGIN",
              "TEST_CSRF_REQUIRED",
              "MANDATE_OWNER_REQUIRED",
            ].includes(code)
          ? 403
          : code === "TEST_LOGIN_RATE_LIMITED"
            ? 429
            : [
                  "INVALID_PAYMENT_INPUT",
                  "JSON_REQUIRED",
                  "REQUEST_TOO_LARGE",
                  "UNKNOWN_TEST_CHECKOUT_ACTION",
                ].includes(code)
              ? 400
              : [
                    "PAYPAL_TEST_CHECKOUT_DISABLED",
                    "PAYPAL_TEST_CHECKOUT_UNAVAILABLE",
                    "PAYPAL_DATABASE_UNAVAILABLE",
                    "PAYPAL_BACKEND_DISABLED",
                    "PAYPAL_PAYMENTS_DISABLED",
                  ].includes(code)
                ? 503
                : 409;
    return Response.json({ error: code }, { status, headers });
  }
}
