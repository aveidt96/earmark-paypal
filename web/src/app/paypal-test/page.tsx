import type { Metadata } from "next";
import { PayPalTestCheckout } from "../../components/paypal-test";
export const metadata: Metadata = {
  title: { absolute: "Controlled Sandbox Checkout | Earmark PayPal" },
};
export default function PayPalTestPage() {
  return <PayPalTestCheckout />;
}
