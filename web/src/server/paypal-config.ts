import "server-only";

/** Configuration/status only. There is deliberately no PayPal network client. */
export function paypalPreparationStatus(
  env: Record<string, string | undefined> = process.env,
) {
  if (env.PAYPAL_ENVIRONMENT && env.PAYPAL_ENVIRONMENT !== "sandbox")
    throw new Error("PAYPAL_SANDBOX_ONLY");
  if (env.PAYPAL_PAYMENTS_ENABLED && env.PAYPAL_PAYMENTS_ENABLED !== "false")
    throw new Error("PAYPAL_PAYMENTS_NOT_IMPLEMENTED");
  return {
    provider: "paypal" as const,
    environment: "sandbox" as const,
    status: "preparation-only" as const,
    paymentsImplemented: false,
    paymentsEnabled: false,
  };
}
