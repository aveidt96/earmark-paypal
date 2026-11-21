import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { handleSandboxCheckout } from "../src/server/paypal/sandbox-checkout";

const origin = "https://preview.example.com";
const validEnv = {
  EARMARK_SANDBOX_CHECKOUT_ENABLED: "true",
  EARMARK_SANDBOX_CHECKOUT_ORIGIN: origin,
  PAYPAL_ENVIRONMENT: "sandbox",
  PAYPAL_CLIENT_ID: "sandbox-client-id",
  PAYPAL_CLIENT_SECRET: "sandbox-super-secret-value",
  PAYPAL_MERCHANT_ID: "MERCHANT12345",
  VERCEL: "1",
};

function makeRequest(
  method: "GET" | "POST",
  body?: unknown,
  overrideOrigin = origin,
) {
  return new Request(`${origin}/api/paypal/sandbox-checkout`, {
    method,
    headers: {
      Host: new URL(origin).host,
      Origin: overrideOrigin,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

describe("bound PayPal Sandbox checkout redirect", () => {
  it("stays disabled by default and rejects untrusted origins or over-budget offers", async () => {
    const disabledGet = await handleSandboxCheckout(makeRequest("GET"), {});
    expect(disabledGet.status).toBe(200);
    expect(await disabledGet.json()).toEqual({ available: false, offers: [] });

    const disabledPost = await handleSandboxCheckout(
      makeRequest("POST", {
        action: "create",
        offerId: "sandbox-weather-starter",
        budgetMinor: 1000,
      }),
      {},
    );
    expect(disabledPost.status).toBe(404);

    const badOrigin = await handleSandboxCheckout(
      makeRequest(
        "POST",
        {
          action: "create",
          offerId: "sandbox-weather-starter",
          budgetMinor: 1000,
        },
        "https://evil.example",
      ),
      validEnv,
    );
    expect(badOrigin.status).toBe(403);

    const overBudget = await handleSandboxCheckout(
      makeRequest("POST", {
        action: "create",
        offerId: "sandbox-weather-pro",
        budgetMinor: 500,
      }),
      validEnv,
    );
    expect(overBudget.status).toBe(400);
    expect(await overBudget.json()).toEqual({
      error: "SANDBOX_OFFER_EXCEEDS_BUDGET",
    });
  });

  it("creates a Sandbox order, returns a validated sandbox.paypal.com approval URL, and requires APPROVED before capture", async () => {
    let orderStatus: "CREATED" | "APPROVED" = "CREATED";
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/v1/oauth2/token")) {
        return Response.json({
          access_token: "sandbox-access-token",
          expires_in: 32400,
        });
      }
      if (url.endsWith("/v2/checkout/orders") && init?.method === "POST") {
        return Response.json({
          id: "ORDER1234567890",
          intent: "CAPTURE",
          status: "PAYER_ACTION_REQUIRED",
          purchase_units: [
            {
              reference_id: "ref-1",
              custom_id: "cust-1",
              amount: { currency_code: "USD", value: "4.00" },
              payee: { merchant_id: validEnv.PAYPAL_MERCHANT_ID },
            },
          ],
          links: [
            {
              rel: "payer-action",
              href: "https://www.sandbox.paypal.com/checkoutnow?token=ORDER1234567890",
            },
          ],
        });
      }
      if (
        url.endsWith("/v2/checkout/orders/ORDER1234567890") &&
        init?.method === "GET"
      ) {
        return Response.json({
          id: "ORDER1234567890",
          intent: "CAPTURE",
          status: orderStatus,
          purchase_units: [
            {
              reference_id: "ref-1",
              custom_id: "cust-1",
              amount: { currency_code: "USD", value: "4.00" },
              payee: { merchant_id: validEnv.PAYPAL_MERCHANT_ID },
            },
          ],
        });
      }
      if (
        url.endsWith("/v2/checkout/orders/ORDER1234567890/capture") &&
        init?.method === "POST"
      ) {
        return Response.json({
          id: "ORDER1234567890",
          intent: "CAPTURE",
          status: "COMPLETED",
          purchase_units: [
            {
              reference_id: "ref-1",
              custom_id: "cust-1",
              amount: { currency_code: "USD", value: "4.00" },
              payee: { merchant_id: validEnv.PAYPAL_MERCHANT_ID },
              payments: {
                captures: [
                  {
                    id: "CAPTURE987654321",
                    status: "COMPLETED",
                    amount: { currency_code: "USD", value: "4.00" },
                  },
                ],
              },
            },
          ],
        });
      }
      throw new Error(`Unexpected PayPal URL: ${url}`);
    });

    const getRes = await handleSandboxCheckout(
      makeRequest("GET"),
      validEnv,
      fetcher,
    );
    const getBody = await getRes.json();
    expect(getBody.available).toBe(true);
    expect(getBody.offers).toHaveLength(2);
    expect(JSON.stringify(getBody)).not.toContain(
      validEnv.PAYPAL_CLIENT_SECRET,
    );
    expect(JSON.stringify(getBody)).not.toContain(validEnv.PAYPAL_MERCHANT_ID);

    const createRes = await handleSandboxCheckout(
      makeRequest("POST", {
        action: "create",
        offerId: "sandbox-weather-starter",
        budgetMinor: 1000,
      }),
      validEnv,
      fetcher,
    );
    expect(createRes.status).toBe(200);
    const created = await createRes.json();
    expect(created.orderId).toBe("ORDER1234567890");
    expect(created.approvalUrl).toBe(
      "https://www.sandbox.paypal.com/checkoutnow?token=ORDER1234567890",
    );

    const prematureCapture = await handleSandboxCheckout(
      makeRequest("POST", {
        action: "capture",
        orderId: "ORDER1234567890",
      }),
      validEnv,
      fetcher,
    );
    expect(prematureCapture.status).toBe(409);

    orderStatus = "APPROVED";
    const capturedRes = await handleSandboxCheckout(
      makeRequest("POST", {
        action: "capture",
        orderId: "ORDER1234567890",
      }),
      validEnv,
      fetcher,
    );
    expect(capturedRes.status).toBe(200);
    expect(await capturedRes.json()).toEqual({
      orderId: "ORDER1234567890",
      status: "COMPLETED",
      captureId: "CAPTURE987654321",
      amount: "4.00",
      currency: "USD",
    });
  });
});
