import "server-only";
import { channel } from "node:diagnostics_channel";
import { evaluatePurchasingChat } from "./agent-chat";
import type { PurchasingChatResult } from "../../lib/paypal-agent";
import type { OfferDiscoveryResult } from "../../lib/offer-discovery";
import { discoverOffers } from "./offer-discovery";
import type { AgentSyntheticDiagnostic } from "../../lib/agent-checkout";
import {
  AGENT_RUNTIME_VERSION,
  runSyntheticAgentDiagnostic,
} from "./agent-diagnostic";
import { AgentError, GeminiResponseError } from "@flint/agent/server";
import { PaymentError } from "./domain";
import { TestOwnerAuth } from "./test-auth";
import {
  agentCheckoutConfig,
  type AgentCheckoutConfig,
} from "./agent-checkout-config";
import { AgentCheckoutPreparationService } from "./agent-checkout";
import { PostgresAgentCheckoutRepository } from "./agent-checkout-postgres";
import {
  assertPayPalDatabase,
  paypalDatabase,
  PostgresPaymentRepository,
} from "./postgres";
import {
  AgentCheckoutPaymentService,
  isAgentPaymentCampaign,
  type AgentPaymentAction,
} from "./agent-checkout-payment";

export type AgentCheckoutRuntime = {
  auth: TestOwnerAuth<AgentCheckoutConfig>;
  checkout: () => Promise<AgentCheckoutPreparationService>;
  diagnose?: () => Promise<AgentSyntheticDiagnostic>;
  chat?: (instruction: string) => Promise<PurchasingChatResult>;
  discover?: (instruction: string) => Promise<OfferDiscoveryResult>;
  traceDiscoveryValidation?: boolean;
};
const discoveryValidationTrace = channel("earmark.discovery.validation");
let instance: AgentCheckoutRuntime | undefined;
export function getAgentCheckoutRuntime(): AgentCheckoutRuntime {
  if (!instance) {
    const config = agentCheckoutConfig();
    const env = process.env;
    const discoveryEnabled =
      !env.RENDER &&
      env.PAYPAL_BACKEND_ENABLED === "false" &&
      env.PAYPAL_PAYMENTS_ENABLED === "false" &&
      env.EARMARK_OFFER_DISCOVERY_ENABLED === "true" &&
      env.EARMARK_GEMINI_ENABLED === "true" &&
      env.AI_ENABLE_NETWORK === "true" &&
      Boolean(env.BRAVE_SEARCH_API_KEY && env.GEMINI_API_KEY);
    let service: Promise<AgentCheckoutPreparationService> | undefined;
    let diagnostic: Promise<AgentSyntheticDiagnostic> | undefined;
    instance = {
      chat: (instruction) => evaluatePurchasingChat(instruction),
      ...(discoveryEnabled && {
        discover: (instruction: string) => discoverOffers(instruction, env),
        traceDiscoveryValidation:
          env.EARMARK_DISCOVERY_VALIDATION_TRACE === "true",
      }),
      // A process-local promise shares concurrent/repeated checks; no durable run reset.
      diagnose: () => (diagnostic ??= runSyntheticAgentDiagnostic()),
      auth: new TestOwnerAuth(config),
      checkout: () => {
        if (!service) {
          service = (async () => {
            const pool = paypalDatabase();
            try {
              await assertPayPalDatabase(pool);
              const repository = new PostgresAgentCheckoutRepository(
                pool,
                config,
              );
              return new AgentCheckoutPreparationService(
                config,
                repository,
                process.env,
                undefined,
                Date.now,
                isAgentPaymentCampaign(config)
                  ? new AgentCheckoutPaymentService(
                      config,
                      repository,
                      new PostgresPaymentRepository(pool),
                      process.env,
                    )
                  : undefined,
              );
            } catch (error) {
              await pool.end();
              throw error;
            }
          })();
          service.catch(() => {
            service = undefined;
          });
        }
        return service;
      },
    };
  }
  return instance;
}
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
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 2048) throw new PaymentError("REQUEST_TOO_LARGE");
      parts.push(chunk.value);
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
const requests = new Map<string, { count: number; until: number }>();
export async function handleAgentCheckout(
  request: Request,
  action?: string,
  runtime: () => AgentCheckoutRuntime = getAgentCheckoutRuntime,
) {
  const headers: Record<string, string> = {
    "Cache-Control": "no-store",
    Vary: "Cookie",
    "X-Earmark-Agent-Runtime": AGENT_RUNTIME_VERSION,
  };
  try {
    const services = runtime();
    const discoveryCapability = services.discover
      ? { localDiscoveryAvailable: true }
      : {};
    headers["X-Earmark-Agent-Epoch"] = services.auth.config.sessionEpoch;
    if (request.method === "GET" && action === "chat") {
      if (new URL(request.url).search)
        throw new PaymentError("CLIENT_CHECKOUT_SCOPE_FORBIDDEN");
      const session = services.auth.authenticate(request);
      return Response.json(
        {
          authenticated: true,
          csrfToken: session.csrf,
          ...discoveryCapability,
        },
        { headers },
      );
    }
    if (request.method === "GET" && !action) {
      if (new URL(request.url).search)
        throw new PaymentError("CLIENT_CHECKOUT_SCOPE_FORBIDDEN");
      const session = services.auth.authenticate(request);
      return Response.json(
        {
          ...(await (
            await services.checkout()
          ).view(services.auth.principal(session))),
          csrfToken: session.csrf,
        },
        { headers },
      );
    }
    if (
      request.method !== "POST" ||
      !action ||
      ![
        "login",
        "logout",
        "initialize",
        "evaluate",
        "diagnose",
        "chat",
        "authorize-order",
        "capture",
        "reconcile",
      ].includes(action)
    )
      throw new PaymentError("AGENT_PAYMENT_EXECUTION_DISABLED");
    if (action === "login") {
      const result = services.auth.login(request, await body(request));
      headers["Set-Cookie"] = result.cookie;
      return Response.json(
        {
          authenticated: true,
          csrfToken: result.session.csrf,
          ...discoveryCapability,
        },
        { headers },
      );
    }
    const session = services.auth.authenticate(request, true),
      input = await body(request);
    if (
      !input ||
      typeof input !== "object" ||
      Array.isArray(input) ||
      (action === "chat"
        ? Object.keys(input).some(
            (key) => key !== "instruction" && key !== "mode",
          ) ||
          ("mode" in input && input.mode !== "discovery") ||
          !("instruction" in input) ||
          typeof input.instruction !== "string" ||
          !input.instruction.trim() ||
          input.instruction.length > 1000
        : Object.keys(input).length > 0)
    )
      throw new PaymentError("CLIENT_CHECKOUT_SCOPE_FORBIDDEN");
    if (action === "logout") {
      headers["Set-Cookie"] = services.auth.logout(session);
      return Response.json({ authenticated: false }, { headers });
    }
    const now = Date.now(),
      key = services.auth.config.ownerId;
    let bucket = requests.get(key);
    if (!bucket || bucket.until <= now) {
      bucket = { count: 0, until: now + 60000 };
      requests.set(key, bucket);
    }
    bucket.count++;
    if (bucket.count > 12) throw new PaymentError("AGENT_RATE_LIMITED");
    if (action === "chat") {
      const { instruction, mode } = input as {
        instruction: string;
        mode?: "discovery";
      };
      if (mode === "discovery") {
        if (!services.discover) throw new PaymentError("DISCOVERY_DISABLED");
        try {
          return Response.json(
            { discovery: await services.discover(instruction) },
            { headers },
          );
        } catch (error) {
          if (
            services.traceDiscoveryValidation &&
            error instanceof AgentError &&
            error.code === "INVALID_MODEL_RESPONSE"
          ) {
            discoveryValidationTrace.publish(
              error instanceof GeminiResponseError
                ? {
                    validationStage: "GEMINI_RESPONSE_PARSE",
                    validationCategory: error.diagnostic.category,
                  }
                : {
                    validationStage: "GEMINI_RESPONSE_BODY",
                    validationCategory: "RESPONSE_BODY_REJECTED",
                  },
            );
          }
          throw error;
        }
      }
      if (!services.chat) throw new PaymentError("AGENT_CHECKOUT_UNAVAILABLE");
      return Response.json(
        {
          evaluation: await services.chat(instruction),
        },
        { headers },
      );
    }
    if (action === "diagnose") {
      if (!services.diagnose)
        throw new PaymentError("AGENT_DIAGNOSTIC_UNAVAILABLE");
      return Response.json(
        { diagnostic: await services.diagnose() },
        { headers },
      );
    }
    const paymentAction = ["authorize-order", "capture", "reconcile"].includes(
      action,
    );
    if (paymentAction && !isAgentPaymentCampaign(services.auth.config))
      throw new PaymentError("AGENT_PAYMENT_EXECUTION_DISABLED");
    const service = await services.checkout(),
      actor = services.auth.principal(session);
    const view = paymentAction
      ? await service.paymentAction(actor, action as AgentPaymentAction)
      : action === "initialize"
        ? await service.initialize(actor)
        : await service.evaluate(actor);
    return Response.json({ ...view, csrfToken: session.csrf }, { headers });
  } catch (error) {
    const code =
      error instanceof PaymentError || error instanceof AgentError
        ? error.code
        : "AGENT_CHECKOUT_UNAVAILABLE";
    const status =
      code === "TEST_OWNER_AUTH_REQUIRED"
        ? 401
        : [
              "UNTRUSTED_REQUEST_ORIGIN",
              "TEST_CSRF_REQUIRED",
              "MANDATE_OWNER_REQUIRED",
              "DISCOVERY_DISABLED",
            ].includes(code)
          ? 403
          : [
                "JSON_REQUIRED",
                "INVALID_PAYMENT_INPUT",
                "REQUEST_TOO_LARGE",
                "CLIENT_CHECKOUT_SCOPE_FORBIDDEN",
                "AGENT_PAYMENT_EXECUTION_DISABLED",
              ].includes(code)
            ? 400
            : ["TEST_LOGIN_RATE_LIMITED", "AGENT_RATE_LIMITED"].includes(code)
              ? 429
              : [
                    "AGENT_CHECKOUT_LOCAL_PROFILE_DISABLED",
                    "AGENT_CHECKOUT_UNAVAILABLE",
                    "GEMINI_DISABLED",
                    "MISSING_MODEL_CONFIGURATION",
                  ].includes(code)
                ? 503
                : 409;
    return Response.json({ error: code }, { status, headers });
  }
}
