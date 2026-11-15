import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { type Principal, parse, PaymentError } from "./domain";
import type { TestCheckoutConfig } from "./test-config";

const cookieName = "earmark_paypal_test_session";
export type LocalOwnerAuthConfig = {
  campaign:
    | "legacy"
    | "us-v1"
    | "agent-05a"
    | "agent-05c-v1"
    | "agent-05d-v1"
    | "agent-09-v1"
    | "judge-sandbox";
  origin: string;
  ownerId: string;
  loginSecret: string;
  sessionSecret: string;
  sessionEpoch: string;
};
const sessionSchema = z.strictObject({
  v: z.literal(1),
  owner: z.string().max(120),
  sid: z.string().regex(/^[a-f0-9]{64}$/),
  csrf: z.string().regex(/^[a-f0-9]{64}$/),
  expires: z.number().int().positive(),
});
export type TestSession = z.infer<typeof sessionSchema>;
const same = (a: string, b: string) => {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/** One allowlisted local test owner; no owner/agent/role supplied by the browser is accepted. */
export class TestOwnerAuth<
  C extends LocalOwnerAuthConfig = TestCheckoutConfig,
> {
  private attempts: number[] = [];
  private revoked = new Map<string, number>();
  constructor(
    readonly config: C,
    private readonly now = Date.now,
  ) {}
  origin(request: Request, mutating = false) {
    const url = new URL(request.url),
      host = request.headers.get("host");
    if (this.config.origin.startsWith("https:") && !host)
      throw new PaymentError("UNTRUSTED_REQUEST_ORIGIN");
    // Next may normalize request.url to its internal hostname. Host is the incoming
    // authority; pin it to the server-configured origin (DNS rebinding guard).
    if (
      host
        ? host !== new URL(this.config.origin).host
        : url.origin !== this.config.origin
    )
      throw new PaymentError("UNTRUSTED_REQUEST_ORIGIN");
    if (mutating && request.headers.get("origin") !== this.config.origin)
      throw new PaymentError("UNTRUSTED_REQUEST_ORIGIN");
  }
  private sign(payload: string) {
    return createHmac("sha256", this.config.sessionSecret)
      .update(
        `${this.config.origin.startsWith("https:") ? this.config.origin + "\0" : ""}${this.config.sessionEpoch}\0${payload}`,
      )
      .digest("base64url");
  }
  private cookie(value: string, age: number) {
    return `${this.cookieName}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${this.config.origin.startsWith("https:") ? "; Secure" : ""}`;
  }
  private get cookieName() {
    if (this.config.campaign === "judge-sandbox")
      return "earmark_judge_session";
    if (this.config.campaign === "agent-09-v1")
      return "earmark_paypal_agent_09_v1_session";
    if (this.config.campaign === "agent-05d-v1")
      return "earmark_paypal_agent_05d_v1_session";
    if (this.config.campaign === "agent-05c-v1")
      return "earmark_paypal_agent_05c_v1_session";
    if (this.config.campaign === "agent-05a")
      return "earmark_paypal_agent_05a_session";
    return this.config.campaign === "us-v1"
      ? `${cookieName}_us_v1`
      : cookieName;
  }
  login(request: Request, raw: unknown) {
    this.origin(request, true);
    this.attempts = this.attempts.filter((t) => t > this.now() - 60000);
    if (this.attempts.length >= 5)
      throw new PaymentError("TEST_LOGIN_RATE_LIMITED");
    this.attempts.push(this.now());
    const input = parse(
      z.strictObject({ password: z.string().min(1).max(1024) }),
      raw,
    );
    if (!same(input.password, this.config.loginSecret))
      throw new PaymentError("TEST_OWNER_AUTH_REQUIRED");
    this.attempts = [];
    const session: TestSession = {
      v: 1,
      owner: this.config.ownerId,
      sid: randomBytes(32).toString("hex"),
      csrf: randomBytes(32).toString("hex"),
      expires: Math.floor(this.now() / 1000) + 1800,
    };
    const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
    return {
      session,
      cookie: this.cookie(`${payload}.${this.sign(payload)}`, 1800),
    };
  }
  authenticate(request: Request, mutating = false): TestSession {
    this.origin(request, mutating);
    for (const [sid, expires] of this.revoked)
      if (expires <= Math.floor(this.now() / 1000)) this.revoked.delete(sid);
    const cookies = request.headers.get("cookie") ?? "";
    if (cookies.length > 8192)
      throw new PaymentError("TEST_OWNER_AUTH_REQUIRED");
    const value =
      cookies
        .split(";")
        .map((p) => p.trim())
        .find((p) => p.startsWith(`${this.cookieName}=`))
        ?.slice(this.cookieName.length + 1) ?? "";
    const [payload, signature, extra] = value.split(".");
    if (
      !payload ||
      !signature ||
      extra ||
      !/^[A-Za-z0-9_-]+$/.test(payload) ||
      !same(signature, this.sign(payload))
    )
      throw new PaymentError("TEST_OWNER_AUTH_REQUIRED");
    let raw: unknown;
    try {
      raw = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    } catch {
      throw new PaymentError("TEST_OWNER_AUTH_REQUIRED");
    }
    const parsed = sessionSchema.safeParse(raw);
    if (
      !parsed.success ||
      parsed.data.owner !== this.config.ownerId ||
      parsed.data.expires <= Math.floor(this.now() / 1000) ||
      this.revoked.has(parsed.data.sid)
    )
      throw new PaymentError("TEST_OWNER_AUTH_REQUIRED");
    if (
      mutating &&
      !same(request.headers.get("x-earmark-csrf") ?? "", parsed.data.csrf)
    )
      throw new PaymentError("TEST_CSRF_REQUIRED");
    return parsed.data;
  }
  principal(session: TestSession): Principal {
    if (session.owner !== this.config.ownerId)
      throw new PaymentError("TEST_OWNER_AUTH_REQUIRED");
    return {
      ownerId: this.config.ownerId,
      subjectId: this.config.ownerId,
      role: "owner",
    };
  }
  logout(session: TestSession) {
    this.revoked.set(session.sid, session.expires);
    return this.cookie("", 0);
  }
}
