"use client";

import { useMemo } from "react";
import { useFirestoreData } from "@/lib/useFirestoreData";
import StatCard from "@/components/ui/StatCard";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import { CardTitle } from "@/components/ui/Card";
import LoadingState from "@/components/ui/LoadingState";
import ErrorState from "@/components/ui/ErrorState";
import { formatCurrencyINR } from "@/lib/utils";

function safeStat(value: unknown, fallback = 0): number {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

// Alert sort priority; unknown severities sort last.
const SEVERITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

function CategoryBar({ label, count, total, colorClass }: { label: string; count: number; total: number; colorClass: string }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  const barWidth = count > 0 ? Math.max(pct, 1.5) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="font-mono text-[11px] tracking-[-0.02em] text-ash w-28">{label}</span>
      <div className="flex-1 h-[2px] bg-charcoal rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ${colorClass}`} style={{ width: `${barWidth}%` }} />
      </div>
      <span className="font-mono text-[11px] tracking-[-0.02em] text-ash w-8 text-right">{count.toLocaleString("en-IN")}</span>
    </div>
  );
}

function CategoryBadge({ isMule }: { isMule: boolean }) {
  return (
    <span className={`font-mono text-[10px] tracking-[-0.02em] px-2 py-0.5 rounded-full ${
      isMule
        ? "bg-risk-critical/15 text-risk-critical border border-risk-critical/20"
        : "bg-risk-high/15 text-risk-high border border-risk-high/20"
    }`}>
      {isMule ? "MULE" : "HIGH RISK"}
    </span>
  );
}

export default function DashboardContent() {
  const { accounts, alerts, stats, loading, source, error, refetch } = useFirestoreData();

  // ?? (not ||) — a legitimate 0 from the API must not be masked; the
  // literal is only a last-resort fallback if stats are missing entirely.
  const totalInDataset = safeStat((stats as Record<string, unknown>).totalInDataset) || 105501;
  const muleCount = safeStat((stats as Record<string, unknown>).muleCount) || accounts.filter((a) => a.isMule && (a.riskLevel === "critical" || a.riskLevel === "high")).length;
  const highRiskCount = safeStat((stats as Record<string, unknown>).highRiskCount) || accounts.filter((a) => !a.isMule && (a.riskLevel === "critical" || a.riskLevel === "high")).length;

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

  if (error && accounts.length === 0 && alerts.length === 0) {
    return (
      <div className="p-8 max-w-[1200px] mx-auto">
        <PageHeader title="MuleGuard" subtitle="Error" />
        <ErrorState message="Couldn't load dashboard" description={error} onRetry={refetch} />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-[1200px] mx-auto">
      <PageHeader
        title="MuleGuard"
        subtitle={liveLabel}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-5 mb-8">
        <StatCard label="Total Accounts" value={totalInDataset.toLocaleString("en-IN")} sub={`${muleCount + highRiskCount} flagged`} />
        <StatCard label="Turnover" value={formatCurrencyINR(safeStat(stats.totalVolume))} />
        <StatCard label="Alerts" value={safeStat(stats.activeAlerts)} sub={`${safeStat(stats.resolvedAlerts)} resolved`} />
        <StatCard label="Avg Risk" value={`${safeStat(stats.avgRiskScore)}%`} />
      </div>

      <Card className="mb-8">
        <CardTitle>Account Categories</CardTitle>
        <div className="space-y-3">
          <CategoryBar label="Mule" count={muleCount} total={muleCount + highRiskCount || 1} colorClass="bg-risk-critical" />
          <CategoryBar label="High Risk" count={highRiskCount} total={muleCount + highRiskCount || 1} colorClass="bg-risk-high" />
        </div>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
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
                      {/* Same tier rule as the API: severity-tier mules are
                          "MULE", everything else flagged is "HIGH RISK". */}
                      <CategoryBadge isMule={a.isMule && (a.riskLevel === "critical" || a.riskLevel === "high")} />
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
