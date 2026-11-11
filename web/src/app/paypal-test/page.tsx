import type { Metadata } from "next";
import { PayPalTestCheckout } from "../../components/paypal-test";
import { PublicPayPalStatusPage } from "../../components/public-paypal-pages";
export const metadata: Metadata = {
  title:
    process.env.NEXT_PUBLIC_DEMO_ONLY === "true"
      ? "Purchases"
      : "Controlled Sandbox Checkout",
};
export default function PayPalTestPage() {
  if (process.env.NEXT_PUBLIC_DEMO_ONLY === "true")
    return <PublicPayPalStatusPage view="payment" />;
  return <PayPalTestCheckout />;
}
