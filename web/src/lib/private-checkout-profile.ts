/** Server-side hosting policy shared by the launcher, proxy and checkout config. */
export function privateCheckoutOrigin(
  env: Record<string, string | undefined> = {
    ...process.env,
    EARMARK_PRIVATE_CHECKOUT_BUILD: process.env.EARMARK_PRIVATE_CHECKOUT_BUILD,
  },
): string | undefined {
  const profile = env.PAYPAL_TEST_HOSTING_PROFILE;
  if (!profile || profile === "loopback") {
    if (env.EARMARK_PRIVATE_CHECKOUT_BUILD === "true")
      throw new Error("PRIVATE_CHECKOUT_PROFILE_REQUIRED");
    return undefined;
  }
  if (profile !== "private-https")
    throw new Error("INVALID_CHECKOUT_HOSTING_PROFILE");
  if (
    env.VERCEL ||
    env.AWS_EXECUTION_ENV ||
    env.AWS_LAMBDA_FUNCTION_NAME ||
    env.NEXT_PUBLIC_DEMO_ONLY === "true" ||
    env.EARMARK_PUBLIC_DEMO_ONLY === "true" ||
    env.EARMARK_PUBLIC_RESEARCH_ENABLED === "true" ||
    env.PAYPAL_TEST_GATEWAY_PROTECTED !== "true" ||
    env.NODE_TLS_REJECT_UNAUTHORIZED === "0"
  )
    throw new Error("PRIVATE_CHECKOUT_PROFILE_CONFLICT");
  let origin: URL;
  try {
    origin = new URL(env.PAYPAL_TEST_ORIGIN ?? "");
  } catch {
    throw new Error("INVALID_PRIVATE_CHECKOUT_ORIGIN");
  }
  if (
    origin.protocol !== "https:" ||
    origin.origin !== env.PAYPAL_TEST_ORIGIN ||
    !/^([a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z][a-z0-9-]*[a-z0-9]$/.test(
      origin.hostname,
    ) ||
    origin.hostname.endsWith(".") ||
    origin.hostname.endsWith(".localhost") ||
    origin.hostname === "localhost" ||
    /^[\d.]+$/.test(origin.hostname) ||
    origin.hostname.includes(":") ||
    origin.username ||
    origin.password ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash
  )
    throw new Error("INVALID_PRIVATE_CHECKOUT_ORIGIN");
  return origin.origin;
}

export function privateCheckoutRouteAllowed(path: string, method: string) {
  if (method === "GET" || method === "HEAD")
    return (
      path === "/paypal-test" ||
      path === "/api/paypal/test" ||
      path.startsWith("/_next/static/") ||
      /^\/fonts\/norway\/[a-z0-9-]+\.woff2$/.test(path)
    );
  return (
    method === "POST" &&
    /^\/api\/paypal\/test\/(login|logout|mandate|reserve|order|approval|capture|recover|cancel)$/.test(
      path,
    )
  );
}
