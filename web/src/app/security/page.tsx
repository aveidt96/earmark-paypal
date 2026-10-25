import type { Metadata } from "next";
import { SecurityDemos } from "../../components/security-demos";
export const metadata: Metadata = {
  title: { absolute: "Security Demos | Earmark PayPal" },
};
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ scenario?: string; scene?: string }>;
}) {
  const params = await searchParams;
  return (
    <SecurityDemos
      selected={params.scenario ?? "A"}
      scene={params.scene ?? ""}
    />
  );
}
