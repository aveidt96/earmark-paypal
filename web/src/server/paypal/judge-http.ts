import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { AgentError } from "@flint/agent/server";
import { TestOwnerAuth, type LocalOwnerAuthConfig } from "./test-auth";
import { PaymentError } from "./domain";
import { evaluateJudgeSandbox } from "./judge-sandbox";
import { discoverOffers } from "./offer-discovery";

const origin = "http://127.0.0.1:3032";
const payload = z.discriminatedUnion("action", [
  z.strictObject({
    action: z.literal("evaluate"),
    mode: z.enum(["policy", "gemini", "discovery"]),
    instruction: z.string().min(1).max(1000),
  }),
  z.strictObject({
    action: z.literal("login"),
    password: z.string().min(1).max(1024),
  }),
  z.strictObject({ action: z.literal("logout") }),
]);
const headers = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};
async function body(request: Request) {
  if (
    request.headers.get("content-type")?.split(";")[0]?.trim() !==
    "application/json"
  )
    throw new PaymentError("JSON_REQUIRED");
  if (Number(request.headers.get("content-length")) > 8192)
    throw new PaymentError("REQUEST_TOO_LARGE");
  const reader = request.body?.getReader();
  if (!reader) throw new PaymentError("INVALID_PAYMENT_INPUT");
  const chunks: Uint8Array[] = [];
  let size = 0;
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    void reader.cancel().catch(() => {});
  }, 5000);
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 8192) {
        await reader.cancel();
        throw new PaymentError("REQUEST_TOO_LARGE");
      }
      chunks.push(part.value);
    }
    if (timedOut) throw new PaymentError("JUDGE_REQUEST_TIMEOUT");
    return payload.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
}

/** Public branch has zero external/model/storage work. Local-only limits are NOT distributed quotas. */
export function createJudgeHandler(
  env: Record<string, string | undefined> = process.env,
  evaluate = evaluateJudgeSandbox,
  discover = discoverOffers,
) {
  let auth: TestOwnerAuth<LocalOwnerAuthConfig> | undefined;
  let active = false;
  const uses: Array<{ sid: string; at: number }> = [];
  function localAuth(request: Request) {
    if (
      env.EARMARK_JUDGE_LOCAL_GEMINI !== "true" ||
      env.VERCEL ||
      env.RENDER ||
      env.AWS_EXECUTION_ENV ||
      env.AWS_LAMBDA_FUNCTION_NAME ||
      env.PAYPAL_BACKEND_ENABLED !== "false" ||
      env.PAYPAL_PAYMENTS_ENABLED !== "false" ||
      env.EARMARK_GEMINI_ENABLED !== "true" ||
      env.AI_ENABLE_NETWORK !== "true" ||
      !env.GEMINI_API_KEY ||
      (env.EARMARK_JUDGE_LOGIN_SECRET?.length ?? 0) < 32 ||
      (env.EARMARK_JUDGE_SESSION_SECRET?.length ?? 0) < 48 ||
      (request.headers.has("x-forwarded-for") &&
        !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(
          request.headers.get("x-forwarded-for") ?? "",
        )) ||
      (request.headers.has("x-forwarded-host") &&
        request.headers.get("x-forwarded-host") !== "127.0.0.1:3032")
    )
      throw new PaymentError("JUDGE_LOCAL_GEMINI_DISABLED");
    auth ??= new TestOwnerAuth({
      campaign: "judge-sandbox",
      origin,
      ownerId: "synthetic-judge-session",
      loginSecret: env.EARMARK_JUDGE_LOGIN_SECRET ?? "",
      sessionSecret: env.EARMARK_JUDGE_SESSION_SECRET ?? "",
      sessionEpoch: createHash("sha256")
        .update("judge-sandbox-v1")
        .digest("hex"),
    });
    auth.origin(request);
    return auth;
  }
  return async function handle(request: Request) {
    try {
      if (request.method === "GET") {
        let authenticated = false,
          csrfToken = "",
          localGeminiAvailable = false;
        try {
          const a = localAuth(request);
          localGeminiAvailable = true;
          try {
            csrfToken = a.authenticate(request).csrf;
            authenticated = true;
          } catch {
            /* Separate judge login required. */
          }
        } catch {
          /* Hosted/default profile has no live capability. */
        }
        return Response.json(
          {
            localGeminiAvailable,
            localDiscoveryAvailable:
              localGeminiAvailable &&
              env.EARMARK_OFFER_DISCOVERY_ENABLED === "true" &&
              Boolean(env.TAVILY_API_KEY),
            authenticated,
            csrfToken,
            publicLiveGemini: false,
          },
          { headers },
        );
      }
      if (request.method !== "POST")
        return Response.json(
          { error: "METHOD_NOT_ALLOWED" },
          { status: 405, headers },
        );
      // Same-origin JSON only. Never trust forwarded hosts for private access.
      const incoming = new URL(request.url);
      const expected =
        incoming.protocol +
        "//" +
        (request.headers.get("host") ?? incoming.host);
      if (request.headers.get("origin") !== expected)
        throw new PaymentError("UNTRUSTED_REQUEST_ORIGIN");
      const input = await body(request);
      if (input.action === "evaluate" && input.mode === "policy") {
        return Response.json(
          { evaluation: await evaluate(input.instruction, "policy", {}) },
          { headers },
        );
      }
      // Unconditional hosted denial: no flag, cookie, request field or process counter enables public Gemini.
      const a = localAuth(request);
      if (input.action === "login") {
        const login = a.login(request, { password: input.password });
        return Response.json(
          { authenticated: true, csrfToken: login.session.csrf },
          { headers: { ...headers, "Set-Cookie": login.cookie } },
        );
      }
      const session = a.authenticate(request, true);
      if (input.action === "logout")
        return Response.json(
          { authenticated: false },
          { headers: { ...headers, "Set-Cookie": a.logout(session) } },
        );
      if (
        input.mode === "discovery" &&
        (env.EARMARK_OFFER_DISCOVERY_ENABLED !== "true" || !env.TAVILY_API_KEY)
      )
        throw new PaymentError("DISCOVERY_DISABLED");
      const now = Date.now();
      while (uses[0] && uses[0].at < now - 3600000) uses.shift();
      if (
        active ||
        uses.length >= 12 ||
        uses.filter((u) => u.sid === session.sid).length >= 3
      )
        throw new PaymentError("JUDGE_LOCAL_QUOTA_EXCEEDED");
      uses.push({ sid: session.sid, at: now });
      active = true;
      try {
        if (input.mode === "discovery")
          return Response.json(
            { discovery: await discover(input.instruction, env) },
            { headers },
          );
        return Response.json(
          { evaluation: await evaluate(input.instruction, "gemini", env) },
          { headers },
        );
      } finally {
        active = false;
      }
    } catch (error) {
      const code =
        error instanceof PaymentError || error instanceof AgentError
          ? error.code
          : "JUDGE_INVALID_REQUEST";
      const status =
        code === "TEST_OWNER_AUTH_REQUIRED"
          ? 401
          : [
                "TEST_CSRF_REQUIRED",
                "UNTRUSTED_REQUEST_ORIGIN",
                "JUDGE_LOCAL_GEMINI_DISABLED",
                "DISCOVERY_DISABLED",
              ].includes(code)
            ? 403
            : code === "JUDGE_REQUEST_TIMEOUT"
              ? 408
              : code === "REQUEST_TOO_LARGE"
                ? 413
                : [
                      "JUDGE_LOCAL_QUOTA_EXCEEDED",
                      "TEST_LOGIN_RATE_LIMITED",
                    ].includes(code)
                  ? 429
                  : 400;
      return Response.json({ error: code }, { status, headers });
    }
  };
}
