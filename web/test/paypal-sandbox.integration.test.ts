import { describe, expect, it, vi } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
vi.mock("server-only", () => ({}));
import {
  paypalOAuthSettings,
  SANDBOX_BASE_URL,
} from "../src/server/paypal/config";
import { PayPalClient, PayPalError } from "../src/server/paypal/client";
import { PaymentError } from "../src/server/paypal/domain";

// Positive real OAuth only. No order/merchant discovery/financial endpoint is reachable.
const enabled =
  process.env.PAYPAL_RUN_SANDBOX_TESTS === "true" &&
  !!process.env.PAYPAL_CLIENT_ID &&
  !!process.env.PAYPAL_CLIENT_SECRET;
(enabled ? describe : describe.skip)(
  "optional real PayPal Sandbox OAuth (no payments)",
  () => {
    it("authenticates, reuses a cached token and refreshes at simulated cache expiry without exposing it", async () => {
      const statuses: number[] = [];
      let calls = 0,
        now = Date.now();
      const checks = {
        authenticated: false,
        bearer: false,
        expiryParsed: false,
        expirySkewCorrect: false,
        cacheReuse: false,
        cacheBoundaryReuse: false,
        expiredCacheRejected: false,
        refreshSucceeded: false,
        metadataRedacted: false,
      };
      const report: Record<string, unknown> = {
        scope: "sandbox-oauth-only",
        endpoint: `${SANDBOX_BASE_URL}/v1/oauth2/token`,
        success: false,
        httpStatuses: statuses,
        checks,
        paymentRequests: 0,
        expiryRefreshUsesSimulatedClock: true,
      };
      try {
        const settings = paypalOAuthSettings(process.env);
        const guardedFetch: typeof fetch = async (input, init) => {
          const url =
            typeof input === "string"
              ? input
              : input instanceof URL
                ? input.href
                : input.url;
          if (
            url !== `${SANDBOX_BASE_URL}/v1/oauth2/token` ||
            init?.method !== "POST" ||
            init.redirect !== "error"
          )
            throw new PaymentError("OAUTH_TEST_ENDPOINT_FORBIDDEN");
          calls++;
          const response = await fetch(input, init);
          statuses.push(response.status);
          return response;
        };
        const client = new PayPalClient(settings, {
          fetch: guardedFetch,
          now: () => now,
        });
        const first = await client.accessToken();
        const state = client.oauthCacheStatus();
        checks.authenticated =
          typeof first === "string" && first.length > 0 && statuses[0] === 200;
        checks.bearer = state.tokenType === "Bearer";
        checks.expiryParsed =
          Number.isInteger(state.lifetimeSeconds) &&
          (state.lifetimeSeconds ?? 0) > 60;
        checks.expirySkewCorrect =
          state.usableUntilMs ===
          now + ((state.lifetimeSeconds ?? 0) - 60) * 1000;
        const initialCalls = calls;
        const reused = await client.accessToken();
        checks.cacheReuse = first === reused && calls === initialCalls;
        now = (state.usableUntilMs ?? now) - 1;
        const atBoundary = await client.accessToken();
        checks.cacheBoundaryReuse =
          atBoundary === first && calls === initialCalls;
        now++;
        checks.expiredCacheRejected = !client.oauthCacheStatus().cached;
        const renewed = await client.accessToken();
        const refreshed = client.oauthCacheStatus();
        checks.refreshSucceeded =
          typeof renewed === "string" &&
          renewed.length > 0 &&
          calls === initialCalls + 1 &&
          statuses.at(-1) === 200 &&
          refreshed.cached;
        checks.metadataRedacted =
          !JSON.stringify(state).includes(first) &&
          !JSON.stringify(refreshed).includes(renewed);
        report.tokenType = state.tokenType;
        report.expiresInSeconds = state.lifetimeSeconds;
        report.usableCacheLifetimeSeconds = (state.lifetimeSeconds ?? 0) - 60;
        report.expirySafetySeconds = state.expirySafetySeconds;
        report.tokenHttpRequests = calls;
        // Assert only booleans: a failing assertion must never print a real token/string diff.
        expect(Object.values(checks).every(Boolean)).toBe(true);
        report.success = true;
        console.log(
          JSON.stringify({
            event: "PAYPAL_SANDBOX_OAUTH_VERIFIED",
            httpStatuses: statuses,
            tokenType: state.tokenType,
            expiresInSeconds: state.lifetimeSeconds,
            cacheReuse: true,
            simulatedExpiryRefresh: true,
            paymentRequests: 0,
          }),
        );
      } catch (error) {
        const code =
          error instanceof PaymentError
            ? error.code
            : "PAYPAL_OAUTH_VALIDATION_FAILED";
        const status =
          error instanceof PayPalError
            ? (error.httpStatus ?? statuses.at(-1) ?? null)
            : (statuses.at(-1) ?? null);
        report.error = code;
        report.httpStatus = status;
        report.tokenHttpRequests = calls;
        throw new Error(
          `${code}; sandboxHttpStatus=${status ?? "unavailable"}`,
        );
      } finally {
        // Only selected primitive/boolean metadata is persisted. Never response JSON, headers or tokens.
        const directory = new URL("../../.tools/", import.meta.url);
        mkdirSync(directory, { recursive: true });
        writeFileSync(
          new URL("paypal-oauth-result.json", directory),
          JSON.stringify(report, null, 2) + "\n",
        );
      }
    }, 120000);
  },
);
