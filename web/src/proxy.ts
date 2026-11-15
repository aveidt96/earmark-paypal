import { NextResponse, type NextRequest } from "next/server";
import {
  privateCheckoutOrigin,
  privateCheckoutRouteAllowed,
} from "./lib/private-checkout-profile";

// No matcher exclusions: private hosting must also reject unrelated public assets/APIs.
export function proxy(request: NextRequest) {
  const headers = {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  };
  let origin: string | undefined;
  try {
    origin = privateCheckoutOrigin();
  } catch {
    return new NextResponse(null, { status: 503, headers });
  }
  if (!origin) return NextResponse.next();
  // The access gateway must preserve Host; never derive authority from forwarded headers.
  if (request.headers.get("host") !== new URL(origin).host)
    return new NextResponse(null, { status: 403, headers });
  if (!privateCheckoutRouteAllowed(request.nextUrl.pathname, request.method))
    return new NextResponse(null, { status: 404, headers });
  const response = NextResponse.next();
  for (const [name, value] of Object.entries(headers))
    response.headers.set(name, value);
  response.headers.set("Content-Security-Policy", "frame-ancestors 'none'");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
