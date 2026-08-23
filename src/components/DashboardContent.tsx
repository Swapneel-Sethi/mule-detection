"use client";

import { useState } from "react";
import { useFirestoreData } from "@/lib/useFirestoreData";
import StatCard from "@/components/ui/StatCard";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import { CardTitle } from "@/components/ui/Card";
import LoadingState from "@/components/ui/LoadingState";
import RiskBadge from "@/components/ui/RiskBadge";
import { formatCurrencyINR } from "@/lib/utils";

function safeStat(value: unknown, fallback = 0): number {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function RiskBar({ level, count, total }: { level: string; count: number; total: number }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  const barWidth = count > 0 ? Math.max(pct, 1.5) : 0;
  const riskColors: Record<string, string> = {
    critical: "bg-risk-critical",
    high: "bg-risk-high",
    medium: "bg-risk-medium",
    low: "bg-risk-low",
  };
  return (
    <div className="flex items-center gap-3">
      <span className="font-mono text-[11px] tracking-[-0.02em] text-ash w-28 capitalize">{level}</span>
      <div className="flex-1 h-[2px] bg-charcoal rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ${riskColors[level] || "bg-bone"}`} style={{ width: `${barWidth}%` }} />
      </div>
      <span className="font-mono text-[11px] tracking-[-0.02em] text-ash w-8 text-right">{count}</span>
    </div>
  );
}

export default function DashboardContent() {
  const { accounts, alerts, stats, loading, source, refetch } = useFirestoreData();
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

  const riskDistribution = stats.riskDistribution || {
    critical: accounts.filter((a) => a.riskLevel === "critical").length,
    high: accounts.filter((a) => a.riskLevel === "high").length,
    medium: accounts.filter((a) => a.riskLevel === "medium").length,
    low: accounts.filter((a) => a.riskLevel === "low").length,
  };
  const totalRisk = riskDistribution.critical + riskDistribution.high + riskDistribution.medium + riskDistribution.low;

  const topRisk = [...accounts].sort((a, b) => b.riskScore - a.riskScore).slice(0, 5);
  const severityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  const sortedAlerts = [...alerts].sort((a, b) => {
    const sevDiff = (severityOrder[a.severity] ?? 4) - (severityOrder[b.severity] ?? 4);
    if (sevDiff !== 0) return sevDiff;
    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
  });
  const recentAlerts = sortedAlerts.slice(0, 8);

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
        <StatCard label="Accounts" value={safeStat(stats.totalAccounts)} sub={`${safeStat(stats.flaggedAccounts)} flagged`} />
        <StatCard label="Turnover" value={formatCurrencyINR(safeStat(stats.totalVolume))} />
        <StatCard label="Alerts" value={safeStat(stats.activeAlerts)} sub={`${safeStat(stats.resolvedAlerts)} resolved`} />
        <StatCard label="Avg Risk" value={`${safeStat(stats.avgRiskScore)}%`} />
      </div>

      <Card className="mb-8">
        <CardTitle>Risk Distribution</CardTitle>
        <div className="space-y-3">
          <RiskBar level="critical" count={riskDistribution.critical} total={totalRisk} />
          <RiskBar level="high" count={riskDistribution.high} total={totalRisk} />
          <RiskBar level="medium" count={riskDistribution.medium} total={totalRisk} />
          <RiskBar level="low" count={riskDistribution.low} total={totalRisk} />
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-5">
        <Card>
          <CardTitle>Recent Alerts</CardTitle>
          <div className="space-y-3">
            {recentAlerts.length > 0 ? recentAlerts.map((a) => {
              const alertLabel = a.title.split(" - ")[0] || a.type.replace(/_/g, " ");
              const accountId = a.accounts?.[0] || a.title.split(" - ").pop() || "";
              return (
                <div key={a.id} className="flex items-center justify-between py-2 border-b border-frost/5 last:border-0 gap-3">
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="font-mono text-[12px] tracking-[-0.02em] text-bone capitalize truncate">
                      {alertLabel} · {accountId}
                    </span>
                    <span className="font-mono text-[10px] tracking-[-0.02em] text-ash truncate">
                      {a.status}
                    </span>
                  </div>
                  <RiskBadge level={a.severity} />
                </div>
              );
            }) : (
              <p className="font-mono text-[11px] tracking-[-0.02em] text-ash">None</p>
            )}
          </div>
        </Card>

        <Card>
          <CardTitle>Top Risk</CardTitle>
          <div className="space-y-3">
            {topRisk.map((a) => {
              const displayBank = a.bank === "Unknown"
                ? (a.flags?.slice(0, 2).join(", ") || a.muleType || "Mule Account")
                : a.bank;
              return (
                <div key={a.id} className="flex items-center justify-between py-2 border-b border-frost/5 last:border-0 gap-3">
                  <div className="min-w-0 flex-1">
                    <span className="font-mono text-[12px] tracking-[-0.02em] text-bone">{a.id.slice(0, 12)}</span>
                    <span className="font-mono text-[11px] tracking-[-0.02em] text-ash ml-3 truncate">{displayBank}</span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="font-mono text-[12px] tracking-[-0.02em] text-bone">
                      {Number.isFinite(a.riskScore) ? a.riskScore.toFixed(0) : 0}%
                    </span>
                    <RiskBadge level={a.riskLevel} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}
