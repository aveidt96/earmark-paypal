import type { Metadata } from "next";
import { notFound } from "next/navigation";
export const metadata: Metadata = { title: "Resolve Escrow" };
export default async function Page() {
  if (process.env.NEXT_PUBLIC_DEMO_ONLY === "true") notFound();
  const { PaymentResolution } =
    await import("../../components/legacy-web-profile");
  return <PaymentResolution />;
}
