import type { Metadata } from "next";
import { AgentCheckoutPreparation } from "../../components/agent-checkout";
import { PublicPayPalHome } from "../../components/public-paypal-pages";
export const metadata: Metadata = {
  title: { absolute: "Agent checkout preparation | Earmark PayPal" },
};
export default function Page() {
  if (process.env.NEXT_PUBLIC_DEMO_ONLY === "true") return <PublicPayPalHome />;
  return (
    <main id="main">
      <AgentCheckoutPreparation />
    </main>
  );
}
