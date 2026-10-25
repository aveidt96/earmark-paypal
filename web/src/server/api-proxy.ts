import "server-only";
/** Vercel forwards to a fixed server-configured Render origin; models cannot choose URLs. */
export function apiOrigin(
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  const raw = env.EARMARK_API_URL;
  if (!raw) {
    if (env.VERCEL || env.EARMARK_DEPLOYMENT === "monad-testnet")
      throw new Error("HOSTED_API_REQUIRED");
    return undefined;
  }
  const u = new URL(raw);
  if (
    u.protocol !== "https:" ||
    !u.hostname.endsWith(".onrender.com") ||
    u.username ||
    u.password ||
    u.search ||
    u.hash ||
    u.pathname !== "/" ||
    u.port
  )
    throw new Error("INVALID_HOSTED_API_ORIGIN");
  return u.origin;
}
export async function forwardApi(request: Request, action?: string) {
  const origin = apiOrigin();
  if (!origin) return undefined;
  const expected = process.env.FLINT_WEB_ORIGIN;
  if (
    request.method === "POST" &&
    (!expected || request.headers.get("origin") !== expected)
  )
    throw new Error("UNTRUSTED_REQUEST_ORIGIN");
  if (
    action &&
    ![
      "challenge",
      "launch",
      "register",
      "gemini-challenge",
      "gemini-start",
      "gemini-read",
      "gemini-cancel",
    ].includes(action)
  )
    throw new Error("UNKNOWN_ACTION");
  const body = request.method === "POST" ? await request.text() : undefined;
  if (body && body.length > 16000) throw new Error("REQUEST_TOO_LARGE");
  const upstream = await fetch(
    origin + "/api/workspace" + (action ? "/" + action : ""),
    {
      method: request.method,
      ...(body !== undefined ? { body } : {}),
      headers: {
        "Content-Type": "application/json",
        ...(request.method === "POST" && expected ? { Origin: expected } : {}),
      },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(25000),
    },
  );
  const text = await upstream.text();
  if (
    !upstream.headers.get("content-type")?.includes("application/json") ||
    text.length > 12000000
  )
    throw new Error("BACKEND_WAKING_OR_UNAVAILABLE");
  return new Response(text, {
    status: upstream.status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}
