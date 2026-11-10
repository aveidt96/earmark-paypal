import type { Metadata } from "next";
import { PublicPayPalHome } from "../components/public-paypal-pages";
export const metadata: Metadata = {
  title: { absolute: "Purchasing assistant | Earmark PayPal" },
};
export default async function Home() {
  if (process.env.NEXT_PUBLIC_DEMO_ONLY === "true") return <PublicPayPalHome />;
  const { Dashboard } = await import("../components/legacy-web-profile");
  return <Dashboard />;
}
