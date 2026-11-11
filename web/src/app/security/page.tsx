import type { Metadata } from "next";
import { PublicPayPalStatusPage } from "../../components/public-paypal-pages";
export const metadata: Metadata = {
  title:
    process.env.NEXT_PUBLIC_DEMO_ONLY === "true"
      ? "Policies"
      : "Security Demos",
};
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ scenario?: string; scene?: string }>;
}) {
  if (process.env.NEXT_PUBLIC_DEMO_ONLY === "true")
    return <PublicPayPalStatusPage view="policy" />;
  const params = await searchParams;
  const { SecurityDemos } = await import("../../components/legacy-web-profile");
  return (
    <SecurityDemos
      selected={params.scenario ?? "A"}
      scene={params.scene ?? ""}
    />
  );
}
