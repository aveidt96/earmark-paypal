import { afterEach, describe, expect, it, vi } from "vitest";

const handlers = vi.hoisted(() => ({
  checkout: vi.fn(),
  agent: vi.fn(),
  webhook: vi.fn(),
}));
vi.mock("../src/server/paypal/test-http", () => ({
  handleTestCheckout: handlers.checkout,
}));
vi.mock("../src/server/paypal/agent-checkout-http", () => ({
  handleAgentCheckout: handlers.agent,
}));
vi.mock("../src/server/paypal/http", () => ({
  handlePayPalWebhook: handlers.webhook,
}));
import { GET as checkoutGet } from "../src/app/api/paypal/test/route";
import { POST as checkoutPost } from "../src/app/api/paypal/test/[action]/route";
import {
  GET as agentGet,
  POST as agentPost,
} from "../src/app/api/paypal/agent-checkout/route";
import {
  POST as agentAction,
  GET as agentChat,
} from "../src/app/api/paypal/agent-checkout/[action]/route";
import { POST as webhookPost } from "../src/app/api/paypal/webhooks/route";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("public research cannot dispatch private checkout handlers", () => {
  it.each(["NEXT_PUBLIC_DEMO_ONLY", "EARMARK_PUBLIC_DEMO_ONLY"])(
    "blocks payment endpoints with %s alone, even if payment flags are mistakenly enabled",
    async (flag) => {
      vi.stubEnv("NEXT_PUBLIC_DEMO_ONLY", "false");
      vi.stubEnv("EARMARK_PUBLIC_DEMO_ONLY", "false");
      vi.stubEnv(flag, "true");
      vi.stubEnv("PAYPAL_TEST_CHECKOUT_ENABLED", "true");
      vi.stubEnv("PAYPAL_AGENT_CHECKOUT_ENABLED", "true");
      vi.stubEnv("PAYPAL_BACKEND_ENABLED", "true");
      vi.stubEnv("PAYPAL_PAYMENTS_ENABLED", "true");
      const request = new Request("https://public.example/api/paypal/test");
      const responses = [
        await checkoutGet(request),
        await agentGet(request),
        await agentPost(request),
        await webhookPost(request),
      ];
      for (const action of [
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
      ])
        responses.push(
          await checkoutPost(request, { params: Promise.resolve({ action }) }),
        );
      for (const action of [
        "login",
        "initialize",
        "evaluate",
        "authorize-order",
        "capture",
        "reconcile",
        "chat",
      ])
        responses.push(
          await agentAction(request, { params: Promise.resolve({ action }) }),
        );
      responses.push(
        await agentChat(request, {
          params: Promise.resolve({ action: "chat" }),
        }),
      );
      for (const response of responses) {
        expect(response.status).toBe(403);
        expect(response.headers.get("cache-control")).toBe("no-store");
        expect(await response.json()).toEqual({
          error: "PUBLIC_DEMO_ENDPOINT_DISABLED",
        });
      }
      expect(handlers.checkout).not.toHaveBeenCalled();
      expect(handlers.agent).not.toHaveBeenCalled();
      expect(handlers.webhook).not.toHaveBeenCalled();
    },
  );
});
