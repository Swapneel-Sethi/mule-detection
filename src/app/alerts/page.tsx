import AlertsContent from "@/components/AlertsContent";
import type { Metadata } from "next";

export default function AlertsPage() {
  return <AlertsContent />;
}

export const metadata: Metadata = {
  title: "Alerts",
  description: "Fan-in, fan-out, rapid-movement and behavioral-change alerts raised by the detection engine.",
};
