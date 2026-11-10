import type { Metadata } from "next";
import { notFound } from "next/navigation";
export const metadata: Metadata = {
  title: { absolute: "Create an Earmark | Earmark PayPal" },
};
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ task?: string }>;
}) {
  if (process.env.NEXT_PUBLIC_DEMO_ONLY === "true") notFound();
  const { CreateMandate } =
    await import("../../../components/legacy-web-profile");
  const p = await searchParams;
  return (
    <CreateMandate
      initialTask={typeof p.task === "string" ? p.task.slice(0, 1000) : ""}
    />
  );
}
