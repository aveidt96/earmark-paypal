import type { Metadata } from "next";
import { notFound } from "next/navigation";
export const metadata: Metadata = {
  title: { absolute: "Agent Activity | Earmark PayPal" },
};
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (process.env.NEXT_PUBLIC_DEMO_ONLY === "true") notFound();
  const { ExecutionPage } =
    await import("../../../components/legacy-web-profile");
  return <ExecutionPage id={(await params).id} />;
}
