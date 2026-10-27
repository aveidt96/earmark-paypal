import { getPayPalWebhooks } from "../web/src/server/paypal/runtime";
import { loadPayPalEnvironment } from "./paypal-env";

async function main() {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args[0] && args[0] !== "--run"))
    throw new Error("INVALID_RECOVERY_ARGUMENTS");
  if (!args.includes("--run")) {
    console.log(
      JSON.stringify({
        mode: "plan-only",
        operations: ["reconcile-known-orders", "retry-verified-webhook-inbox"],
        paymentRequests: false,
      }),
    );
    return;
  }
  // Defense in depth: this operator process cannot create/capture even if configured elsewhere.
  loadPayPalEnvironment();
  process.env.PAYPAL_PAYMENTS_ENABLED = "false";
  const webhooks = await getPayPalWebhooks();
  const payments = await webhooks.payments.recover(50);
  const events = await webhooks.recover(50);
  console.log(JSON.stringify({ payments, events, paymentRequests: false }));
}
main().catch(() => {
  console.error("PAYPAL_RECOVERY_UNAVAILABLE");
  process.exitCode = 1;
});
