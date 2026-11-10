import type { Metadata } from "next";
import { PayPalAgentConsole } from "../../components/paypal-agent-console";
import { PAYPAL_CORE_DEMO_SCENARIOS } from "../../lib/paypal-agent";
export const metadata: Metadata = {
  title: { absolute: "Security Demos | Earmark PayPal" },
};
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ scenario?: string; scene?: string }>;
}) {
  const params = await searchParams;
  if (process.env.NEXT_PUBLIC_DEMO_ONLY === "true")
    return (
      <main id="main" className="demo-workspace">
        <PayPalAgentConsole
          initialScenarioId={
            PAYPAL_CORE_DEMO_SCENARIOS.find(
              (scenario) =>
                scenario.code === params.scenario ||
                scenario.label.split(" — ")[0] === params.scenario,
            )?.id ?? "normal"
          }
        />
      </main>
    );
  const { SecurityDemos } = await import("../../components/legacy-web-profile");
  return (
    <SecurityDemos
      selected={params.scenario ?? "A"}
      scene={params.scene ?? ""}
    />
  );
}
