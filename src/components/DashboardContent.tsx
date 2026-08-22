"use client";

import { useState } from "react";
import { useFirestoreData } from "@/lib/useFirestoreData";
import StatCard from "@/components/ui/StatCard";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import { CardTitle } from "@/components/ui/Card";
import LoadingState from "@/components/ui/LoadingState";
import RiskBadge from "@/components/ui/RiskBadge";

function RiskBar({ level, count, total }: { level: string; count: number; total: number }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="font-mono text-[11px] tracking-[-0.02em] text-ash w-28 capitalize">{level}</span>
      <div className="flex-1 h-[2px] bg-charcoal rounded-full overflow-hidden">
        <div className="h-full rounded-full bg-bone transition-all duration-700" style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono text-[11px] tracking-[-0.02em] text-ash w-8 text-right">{count}</span>
    </div>
  );
}

export default function DashboardContent() {
  const { accounts, alerts, stats, loading, source, refetch, pagination } = useFirestoreData();
  const [detecting, setDetecting] = useState(false);
  const [detectResult, setDetectResult] = useState<string | null>(null);

  const runDetection = async () => {
    setDetecting(true);
    setDetectResult(null);
    try {
      const res = await fetch("/api/detect/run", { method: "POST" });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setDetectResult(
        `${data.summary.mules_detected} mules / ${data.summary.patterns_found} patterns / ${data.summary.total_accounts} accounts / ${data.duration_ms}ms`
      );
      refetch();
    } catch (err) {
      setDetectResult(err instanceof Error ? err.message : "Failed");
    } finally {
      setDetecting(false);
    }
  };

  const riskDistribution = {
    critical: accounts.filter((a) => a.riskLevel === "critical").length,
    high: accounts.filter((a) => a.riskLevel === "high").length,
    medium: accounts.filter((a) => a.riskLevel === "medium").length,
    low: accounts.filter((a) => a.riskLevel === "low").length,
  };
  const totalRisk = riskDistribution.critical + riskDistribution.high + riskDistribution.medium + riskDistribution.low;

  const topRisk = [...accounts].sort((a, b) => b.riskScore - a.riskScore).slice(0, 5);
  const recentAlerts = alerts.slice(0, 5);

  const liveLabel = source === "local" || source === "firestore" ? "Live" : "Demo";

  if (loading) {
    return (
      <div className="p-8 max-w-[1200px] mx-auto">
        <LoadingState />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-[1200px] mx-auto">
      <PageHeader
        title="MuleGuard"
        subtitle={liveLabel}
        action={
          <div className="flex items-center gap-4">
            <button
              onClick={runDetection}
              disabled={detecting}
              className="font-mono text-[11px] tracking-[-0.02em] uppercase px-4 py-2 bg-charcoal text-bone border border-frost/20 rounded-sm transition-default hover:bg-charcoal/80 disabled:opacity-40"
            >
              {detecting ? "Running..." : "Run Detection"}
            </button>
          </div>
        }
      />

      {detectResult && (
        <p className="font-mono text-[11px] tracking-[-0.02em] text-ash mb-6">{detectResult}</p>
      )}

      <div className="grid grid-cols-4 gap-5 mb-8">
        <StatCard label="Accounts" value={stats.totalAccounts} sub={`${stats.flaggedAccounts} flagged`} />
        <StatCard label="Turnover" value={`\u20B9${(stats.totalVolume / 10000000).toFixed(1)}Cr`} />
        <StatCard label="Alerts" value={stats.activeAlerts} sub={`${stats.resolvedAlerts} resolved`} />
        <StatCard label="Avg Risk" value={`${stats.avgRiskScore}%`} />
      </div>

      <Card className="mb-8">
        <CardTitle>Dataset Status</CardTitle>
        <div className="grid grid-cols-4 gap-5 mb-4">
          <div>
            <p className="font-mono text-[10px] tracking-[-0.02em] text-ash">{source === "local" ? "Total in Dataset" : "Total in Firestore"}</p>
            <p className="font-display text-[22px] font-normal leading-[1] text-bone mt-1">
              {pagination.total.toLocaleString("en-IN")}
            </p>
          </div>
          <div>
            <p className="font-mono text-[10px] tracking-[-0.02em] text-ash">Loaded on Page</p>
            <p className="font-display text-[22px] font-normal leading-[1] text-bone mt-1">
              {accounts.length.toLocaleString("en-IN")}
            </p>
          </div>
          <div>
            <p className="font-mono text-[10px] tracking-[-0.02em] text-ash">Expected Total</p>
            <p className="font-display text-[22px] font-normal leading-[1] text-bone mt-1">105,461</p>
          </div>
          <div>
            <p className="font-mono text-[10px] tracking-[-0.02em] text-ash">Import Progress</p>
            <p className="font-display text-[22px] font-normal leading-[1] text-bone mt-1">
              {pagination.total > 0 ? Math.round((pagination.total / 105461) * 100) : 0}%
            </p>
          </div>
        </div>
        <div className="h-[4px] bg-charcoal rounded-full overflow-hidden">
          <div
            className="h-full bg-frost/60 rounded-full transition-all duration-700"
            style={{ width: `${pagination.total > 0 ? Math.min((pagination.total / 105461) * 100, 100) : 0}%` }}
          />
        </div>
        <div className="flex justify-between mt-2">
          <span className="font-mono text-[10px] tracking-[-0.02em] text-ash">
            {pagination.total.toLocaleString("en-IN")} / 105,461 accounts imported
          </span>
          <span className="font-mono text-[10px] tracking-[-0.02em] text-ash">
            {pagination.total > 0 ? (105461 - pagination.total).toLocaleString("en-IN") : "105,461"} remaining
          </span>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-5 mb-8">
        <Card>
          <CardTitle>Risk Distribution</CardTitle>
          <div className="space-y-3">
            <RiskBar level="critical" count={riskDistribution.critical} total={totalRisk} />
            <RiskBar level="high" count={riskDistribution.high} total={totalRisk} />
            <RiskBar level="medium" count={riskDistribution.medium} total={totalRisk} />
            <RiskBar level="low" count={riskDistribution.low} total={totalRisk} />
          </div>
        </Card>

        <Card>
          <CardTitle>Status</CardTitle>
          <div className="space-y-4">
            {[
              { label: "Firestore", ok: true },
              { label: "Graph Engine", ok: true },
              { label: "ML Pipeline", ok: true },
            ].map((s) => (
              <div key={s.label} className="flex items-center justify-between">
                <span className="font-mono text-[12px] tracking-[-0.02em] text-ash">{s.label}</span>
                <span className="font-mono text-[11px] tracking-[-0.02em] text-bone">OK</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-5">
        <Card>
          <CardTitle>Recent Alerts</CardTitle>
          <div className="space-y-3">
            {recentAlerts.length > 0 ? recentAlerts.map((a) => (
              <div key={a.id} className="flex items-center justify-between py-2 border-b border-frost/5 last:border-0">
                <span className="font-mono text-[12px] tracking-[-0.02em] text-bone">{a.title}</span>
                <RiskBadge level={a.type} />
              </div>
            )) : (
              <p className="font-mono text-[11px] tracking-[-0.02em] text-ash">None</p>
            )}
          </div>
        </Card>

        <Card>
          <CardTitle>Top Risk</CardTitle>
          <div className="space-y-3">
            {topRisk.map((a) => (
              <div key={a.id} className="flex items-center justify-between py-2 border-b border-frost/5 last:border-0">
                <div>
                  <span className="font-mono text-[12px] tracking-[-0.02em] text-bone">{a.id}</span>
                  <span className="font-mono text-[11px] tracking-[-0.02em] text-ash ml-3">{a.bank}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[12px] tracking-[-0.02em] text-bone">{a.riskScore.toFixed(0)}%</span>
                  <RiskBadge level={a.riskLevel} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
