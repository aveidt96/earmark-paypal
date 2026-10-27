import "server-only";
import { sandboxFlags } from "./paypal/config";

/** Public status does not connect to PayPal/Neon or imply an end-to-end verified payment. */
export function paypalPreparationStatus(
  env: Record<string, string | undefined> = process.env,
) {
  const flags = sandboxFlags(env);
  return {
    provider: "paypal" as const,
    environment: "sandbox" as const,
    status: "backend-foundation" as const,
    backendImplemented: true,
    backendEnabled: flags.backendEnabled,
    manualPaymentsConfigured: flags.backendEnabled && flags.paymentsEnabled,
    sandboxVerified: false,
    autonomousPaymentsEnabled: false,
    // Existing fields describe UI/agent financial entrypoints, which remain unwired.
    paymentsImplemented: false,
    paymentsEnabled: false,
  };
}
