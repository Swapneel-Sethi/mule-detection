import AlertsContent from "@/components/AlertsContent";
import type { Metadata } from "next";

export default function AlertsPage() {
  return <AlertsContent />;
}

export const metadata: Metadata = {
  title: "Alerts",
  description: "Precomputed fan-in, fan-out, rapid-movement and behavioral-change alerts from the trained-model pipeline.",
};
