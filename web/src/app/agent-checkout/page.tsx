import type { Metadata } from "next";
import { AgentCheckoutPreparation } from "../../components/agent-checkout";
export const metadata: Metadata = {
  title: { absolute: "Agent checkout preparation | Earmark PayPal" },
};
export default function Page() {
  return (
    <main id="main">
      <AgentCheckoutPreparation />
    </main>
  );
}
