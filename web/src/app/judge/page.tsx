import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PayPalAgentConsole } from "../../components/paypal-agent-console";

export const metadata: Metadata = { title: "Judge Sandbox" };

export default function Judge() {
  if (process.env.NEXT_PUBLIC_DEMO_ONLY !== "true") notFound();
  return (
    <main id="main" className="demo-workspace">
      <PayPalAgentConsole />
    </main>
  );
}
