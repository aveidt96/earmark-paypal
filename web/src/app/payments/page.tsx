import type { Metadata } from "next";
import { PublicPayPalReceiptPage } from "../../components/public-paypal-pages";
export const metadata: Metadata = {
  title: { absolute: "Payments | Earmark PayPal" },
};
export default async function Page() {
  if (process.env.NEXT_PUBLIC_DEMO_ONLY === "true")
    return <PublicPayPalReceiptPage view="payment" />;
  const { PaymentsPage } = await import("../../components/legacy-web-profile");
  return <PaymentsPage />;
}
