import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  BOUND_SANDBOX_OFFERS,
  MAX_SANDBOX_CHECKOUT_MINOR,
  findBoundSandboxOffer,
} from "../../lib/bound-merchants";
import { PayPalClient, PayPalError } from "./client";
import { SANDBOX_BASE_URL, type PayPalCheckoutSettings } from "./config";
import {
  type Attempt,
  PaymentError,
  externalIdSchema,
  fingerprint,
  fromDecimal,
  parse,
  paypalMerchantSchema,
} from "./domain";

type Env = Record<string, string | undefined>;

const HEADERS = { "Cache-Control": "no-store" } as const;
const SANDBOX_APPROVAL_HOSTS = new Set([
  "www.sandbox.paypal.com",
  "sandbox.paypal.com",
]);

const requestSchema = z.discriminatedUnion("action", [
  z.strictObject({
    action: z.literal("create"),
    offerId: z.string().min(1).max(80),
    budgetMinor: z.number().int().min(1).max(100000),
  }),
  z.strictObject({
    action: z.literal("capture"),
    orderId: externalIdSchema,
  }),
]);

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: HEADERS });
}

function resolveConfig(env: Env): {
  origin: URL;
  settings: PayPalCheckoutSettings;
} | null {
  if (env.EARMARK_SANDBOX_CHECKOUT_ENABLED !== "true") return null;
  if (env.PAYPAL_ENVIRONMENT && env.PAYPAL_ENVIRONMENT !== "sandbox")
    return null;
  const clientId = env.PAYPAL_CLIENT_ID?.trim() ?? "";
  const clientSecret = env.PAYPAL_CLIENT_SECRET?.trim() ?? "";
  const rawMerchant = env.PAYPAL_MERCHANT_ID?.trim() ?? "";
  if (!clientId || !clientSecret || !rawMerchant) return null;

  let merchantId: string;
  try {
    merchantId = parse(paypalMerchantSchema, rawMerchant);
  } catch {
    return null;
  }

  const rawOrigin = (
    env.EARMARK_SANDBOX_CHECKOUT_ORIGIN ??
    env.EARMARK_PUBLIC_RESEARCH_ORIGIN ??
    ""
  ).trim();
  let origin: URL;
  try {
    origin = new URL(rawOrigin);
  } catch {
    return null;
  }
  const hosted = env.VERCEL === "1";
  if (origin.origin !== rawOrigin) return null;
  if (hosted && (origin.protocol !== "https:" || Boolean(origin.port)))
    return null;
  if (!hosted && origin.protocol !== "http:" && origin.protocol !== "https:")
    return null;

  return {
    origin,
    settings: {
      baseUrl: SANDBOX_BASE_URL,
      clientId,
      clientSecret,
      merchantId,
      paymentsEnabled: true,
      credentialSellerOnly: true,
      timeoutMs: 12000,
      maxRetries: 1,
      returnUrl: `${origin.origin}/?sandboxOrder=approved`,
      cancelUrl: `${origin.origin}/?sandboxOrder=cancelled`,
    },
  };
}

function safeSandboxApprovalUrl(
  links: Array<{ rel: string; href: string }> | undefined,
): string | null {
  if (!links) return null;
  const link =
    links.find((item) => item.rel === "payer-action") ??
    links.find((item) => item.rel === "approve");
  if (!link) return null;
  try {
    const parsed = new URL(link.href);
    if (
      parsed.protocol !== "https:" ||
      !SANDBOX_APPROVAL_HOSTS.has(parsed.hostname.toLowerCase())
    )
      return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function buildSandboxAttempt(input: {
  merchantId: string;
  offerId: string;
  amountMinor: string;
  state: "CREATING" | "CAPTURING";
  orderId?: string;
}): Attempt {
  const now = new Date().toISOString();
  const mandateId = randomUUID();
  const purchaseKey = `sandbox-demo:${input.offerId}:${randomUUID()}`;
  return {
    id: randomUUID(),
    mandateId,
    purchaseKey,
    merchantId: input.merchantId,
    amountMinor: input.amountMinor,
    currency: "USD",
    ownerId: "sandbox-demo-visitor",
    agentId: "earmark-sandbox-checkout",
    fingerprint: fingerprint({
      mandateId,
      purchaseKey,
      merchantId: input.merchantId,
      amountMinor: input.amountMinor,
      currency: "USD",
    }),
    state: input.state,
    budgetState: "RESERVED",
    createRequestId: randomUUID(),
    captureRequestId: randomUUID(),
    ...(input.orderId ? { orderId: input.orderId } : {}),
    createdAt: now,
    updatedAt: now,
  };
}

export async function handleSandboxCheckout(
  request: Request,
  env: Env = process.env,
  fetcher?: typeof fetch,
): Promise<Response> {
  const resolved = resolveConfig(env);
  if (!resolved) {
    if (request.method === "GET") return json({ available: false, offers: [] });
    return json({ error: "SANDBOX_CHECKOUT_DISABLED" }, 404);
  }

  const hostMatches = resolved.origin.host === request.headers.get("host");
  if (request.method === "GET") {
    return json({
      available: hostMatches,
      offers: hostMatches ? BOUND_SANDBOX_OFFERS : [],
    });
  }
  if (request.method !== "POST") {
    return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  }
  if (
    !hostMatches ||
    request.headers.get("origin") !== resolved.origin.origin
  ) {
    return json({ error: "SANDBOX_CHECKOUT_ORIGIN_REQUIRED" }, 403);
  }

  let body: z.infer<typeof requestSchema>;
  try {
    body = requestSchema.parse(await request.json());
  } catch {
    return json({ error: "INVALID_SANDBOX_CHECKOUT_REQUEST" }, 400);
  }

  const client = new PayPalClient(resolved.settings, {
    ...(fetcher ? { fetch: fetcher } : {}),
  });

  try {
    if (body.action === "create") {
      const offer = findBoundSandboxOffer(body.offerId);
      if (!offer) return json({ error: "UNKNOWN_BOUND_OFFER" }, 400);
      if (
        offer.priceMinor > body.budgetMinor ||
        offer.priceMinor > MAX_SANDBOX_CHECKOUT_MINOR
      ) {
        return json({ error: "SANDBOX_OFFER_EXCEEDS_BUDGET" }, 400);
      }

      const attempt = buildSandboxAttempt({
        merchantId: resolved.settings.merchantId,
        offerId: offer.id,
        amountMinor: String(offer.priceMinor),
        state: "CREATING",
      });
      const order = await client.createOrder(attempt);
      const approvalUrl = safeSandboxApprovalUrl(order.links);
      if (!approvalUrl) {
        return json({ error: "PAYPAL_APPROVAL_URL_UNAVAILABLE" }, 502);
      }
      return json({
        orderId: order.id,
        status: order.status,
        approvalUrl,
        offer,
      });
    }

    const existing = await client.getOrder(body.orderId);
    if (existing.status === "COMPLETED") {
      const unit = existing.purchase_units[0];
      const existingCapture = unit?.payments?.captures?.[0];
      return json({
        orderId: existing.id,
        status: existing.status,
        captureId: existingCapture?.id ?? null,
        amount: unit?.amount.value ?? null,
        currency: unit?.amount.currency_code ?? "USD",
      });
    }
    if (existing.status !== "APPROVED") {
      return json({ error: "PAYPAL_APPROVAL_REQUIRED" }, 409);
    }

    const unit = existing.purchase_units[0];
    if (!unit || unit.amount.currency_code !== "USD") {
      return json({ error: "PAYPAL_ORDER_MISMATCH" }, 400);
    }
    const amountMinor = fromDecimal(unit.amount.value, "USD");
    const matchedOffer = BOUND_SANDBOX_OFFERS.find(
      (offer) => String(offer.priceMinor) === amountMinor,
    );
    if (!matchedOffer) {
      return json({ error: "PAYPAL_ORDER_MISMATCH" }, 400);
    }

    const captureAttempt = buildSandboxAttempt({
      merchantId: resolved.settings.merchantId,
      offerId: matchedOffer.id,
      amountMinor,
      state: "CAPTURING",
      orderId: existing.id,
    });
    const captured = await client.captureOrder(captureAttempt);
    const captureUnit = captured.purchase_units[0];
    const captureRecord = captureUnit?.payments?.captures?.[0];
    return json({
      orderId: captured.id,
      status: captured.status,
      captureId: captureRecord?.id ?? null,
      amount: captureRecord?.amount.value ?? unit.amount.value,
      currency: captureRecord?.amount.currency_code ?? "USD",
    });
  } catch (error) {
    const code =
      error instanceof PayPalError || error instanceof PaymentError
        ? error.code
        : "PAYPAL_SANDBOX_UNAVAILABLE";
    return json({ error: code }, 502);
  }
}
