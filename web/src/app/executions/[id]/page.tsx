import type { Metadata } from "next";
import { ExecutionPage } from "../../../components/detail-pages";
export const metadata: Metadata = {
  title: { absolute: "Agent Activity | Earmark PayPal" },
};
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <ExecutionPage id={(await params).id} />;
}
