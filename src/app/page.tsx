import DashboardContent from "@/components/DashboardContent";
import type { Metadata } from "next";

export default function Home() {
  return <DashboardContent />;
}

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Live dashboard: flagged mule accounts, turnover, alerts and risk distribution.",
};
