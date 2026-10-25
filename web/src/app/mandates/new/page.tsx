import type { Metadata } from "next";
import { CreateMandate } from "../../../components/create-mandate";
export const metadata: Metadata = {
  title: { absolute: "Create an Earmark | Earmark PayPal" },
};
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ task?: string }>;
}) {
  const p = await searchParams;
  return (
    <CreateMandate
      initialTask={typeof p.task === "string" ? p.task.slice(0, 1000) : ""}
    />
  );
}
