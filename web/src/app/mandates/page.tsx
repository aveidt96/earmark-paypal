import type { Metadata } from "next";
import { PublicPayPalReceiptPage } from "../../components/public-paypal-pages";
export const metadata: Metadata = {
  title: { absolute: "Earmarks | Earmark PayPal" },
};
export default async function Page() {
  if (process.env.NEXT_PUBLIC_DEMO_ONLY === "true")
    return <PublicPayPalReceiptPage view="mandate" />;
  const { MandatesPage } = await import("../../components/legacy-web-profile");
  return <MandatesPage />;
}
