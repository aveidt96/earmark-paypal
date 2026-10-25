import type { Metadata } from "next";
import { Dashboard } from "../components/dashboard";
export const metadata: Metadata = {
  title: { absolute: "Workspace | Earmark PayPal" },
};
export default function Home() {
  return <Dashboard />;
}
