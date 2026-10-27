import "server-only";
import { testCheckoutConfig } from "./test-config";
import { TestOwnerAuth } from "./test-auth";
import { PayPalClient } from "./client";
import {
  assertPayPalDatabase,
  paypalDatabase,
  PostgresPaymentRepository,
} from "./postgres";
import { TestCheckoutService, testCheckoutGateway } from "./test-checkout";
import { usOrderPermission } from "./us-order";
import { usCapturePermission } from "./us-capture";
import { PayPalPaymentService } from "./service";

type TestRuntime = {
  auth: TestOwnerAuth;
  checkout: () => Promise<TestCheckoutService>;
};
const state = globalThis as typeof globalThis & {
  earmarkPayPalTestRuntime?: TestRuntime;
};
export function getTestRuntime(): TestRuntime {
  if (!state.earmarkPayPalTestRuntime) {
    const config = testCheckoutConfig();
    let service: Promise<TestCheckoutService> | undefined;
    state.earmarkPayPalTestRuntime = {
      auth: new TestOwnerAuth(config),
      checkout: () => {
        if (!service) {
          service = (async () => {
            const pool = paypalDatabase();
            try {
              await assertPayPalDatabase(pool);
              const repository = new PostgresPaymentRepository(pool);
              return new TestCheckoutService(
                config,
                repository,
                testCheckoutGateway(new PayPalClient(config.settings)),
                Date.now,
                config.usOrderOnce
                  ? async (actor, a) => {
                      const scope = usOrderPermission(config, a);
                      const client = new PayPalClient(
                        {
                          ...config.settings,
                          paymentsEnabled: true,
                          orderOnlyPermission: scope,
                        },
                        {
                          fetch: async (input, init) => {
                            const response = await fetch(input, init);
                            const debug =
                              response.headers.get("paypal-debug-id");
                            console.log(
                              JSON.stringify({
                                event: "TASK03E_PAYPAL_API",
                                operation:
                                  init?.method === "POST"
                                    ? String(input).endsWith("/v1/oauth2/token")
                                      ? "OAUTH"
                                      : "CREATE_ONE_ORDER"
                                    : "GET_ORDER",
                                httpStatus: response.status,
                                debugId:
                                  debug && /^[a-f0-9]{8,64}$/i.test(debug)
                                    ? debug
                                    : null,
                              }),
                            );
                            return response;
                          },
                        },
                      );
                      return new PayPalPaymentService(
                        repository,
                        client,
                        Date.now,
                        config.merchantId,
                      ).createPreparedOrderOnce(actor, scope);
                    }
                  : undefined,
                config.usCaptureOnce
                  ? async (actor, a) => {
                      const scope = usCapturePermission(config, a);
                      const client = new PayPalClient(
                        {
                          ...config.settings,
                          paymentsEnabled: true,
                          captureOnlyPermission: scope,
                        },
                        {
                          fetch: async (input, init) => {
                            const url = new URL(String(input)),
                              method = init?.method ?? "GET";
                            if (
                              url.origin !==
                                "https://api-m.sandbox.paypal.com" ||
                              url.search ||
                              url.hash ||
                              !(
                                (method === "POST" &&
                                  [
                                    "/v1/oauth2/token",
                                    `/v2/checkout/orders/${scope.orderId}/capture`,
                                  ].includes(url.pathname)) ||
                                (method === "GET" &&
                                  (url.pathname ===
                                    `/v2/checkout/orders/${scope.orderId}` ||
                                    /^\/v2\/payments\/captures\/[A-Za-z0-9_-]+$/.test(
                                      url.pathname,
                                    )))
                              )
                            )
                              throw new Error(
                                "CAPTURE_ONLY_TRANSPORT_FORBIDDEN",
                              );
                            const response = await fetch(input, init),
                              debug = response.headers.get("paypal-debug-id");
                            console.log(
                              JSON.stringify({
                                event: "TASK03G_PAYPAL_API",
                                operation:
                                  method === "POST"
                                    ? url.pathname === "/v1/oauth2/token"
                                      ? "OAUTH"
                                      : "CAPTURE_ONE_ORDER"
                                    : url.pathname.includes("/captures/")
                                      ? "GET_CAPTURE"
                                      : "GET_ORDER",
                                httpStatus: response.status,
                                debugId:
                                  debug && /^[a-f0-9]{8,64}$/i.test(debug)
                                    ? debug
                                    : null,
                              }),
                            );
                            return response;
                          },
                        },
                      );
                      return new PayPalPaymentService(
                        repository,
                        client,
                        Date.now,
                        config.merchantId,
                      ).capturePreparedOnce(actor, scope);
                    }
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
  return state.earmarkPayPalTestRuntime;
}
