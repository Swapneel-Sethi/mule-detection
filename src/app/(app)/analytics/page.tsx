import AnalyticsContent from "@/components/AnalyticsContent";
import type { Metadata } from "next";

export default function AnalyticsPage() {
  return <AnalyticsContent />;
}

export const metadata: Metadata = {
  title: "Analytics",
  description: "Sankey money-flow breakdown, circular paths, hourly alert distribution and pattern trends.",
};