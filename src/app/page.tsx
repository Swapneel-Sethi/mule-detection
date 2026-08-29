import DashboardContent from "@/components/DashboardContent";
import type { Metadata } from "next";

export default function Home() {
  return (
    <div>
      <h3 className="text-[var(--accent)] text-sm mb-4 font-mono uppercase tracking-[0.2em]">MuleGuard built by Team Calamity</h3>
      <DashboardContent />
    </div>
  );
}

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Live dashboard: flagged mule accounts, turnover, alerts and flagged-account category split.",
};
