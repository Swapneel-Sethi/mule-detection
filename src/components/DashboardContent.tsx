"use client";

import { useMemo } from "react";
import { useLocalData } from "@/lib/useLocalData";
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
  const { accounts, alerts, stats, loading, source, error, refetch } = useLocalData();

  // safeStat's fallback param keeps a legitimate 0 sent by the API — only a
  // missing/NaN stat falls back. `||` here would mask real zeros with
  // recomputed or hardcoded values.
  const s = stats as Record<string, unknown>;
  const totalInDataset = safeStat(s.totalInDataset, 105501);
  const muleCount = safeStat(
    s.muleCount,
    accounts.filter((a) => a.isMule && (a.riskLevel === "critical" || a.riskLevel === "high")).length
  );
  const highRiskCount = safeStat(
    s.highRiskCount,
    // Same disjoint tier rule as the API: "high risk" = confirmed mules below
    // the critical/high band, NOT non-mule high-severity accounts.
    accounts.filter((a) => a.isMule && !(a.riskLevel === "critical" || a.riskLevel === "high")).length
  );

  const topRisk = useMemo(
    () => [...accounts].sort((a, b) => b.riskScore - a.riskScore).slice(0, 5),
    [accounts]
  );
  const sortedAlerts = useMemo(
    () =>
      [...alerts].sort((a, b) => {
        const sevDiff = (SEVERITY_ORDER[a.severity] ?? 4) - (SEVERITY_ORDER[b.severity] ?? 4);
        if (sevDiff !== 0) return sevDiff;
        // Unparsable timestamps (Date.parse -> NaN) sort as oldest, never NaN.
        return (Date.parse(b.timestamp) || 0) - (Date.parse(a.timestamp) || 0);
      }),
    [alerts]
  );
  const recentAlerts = sortedAlerts.slice(0, 8);

  const liveLabel = source === "local" || source === "firestore" ? "Live" : "Demo";

  if (loading) {
    return (
      <div className="p-8 max-w-[1200px] mx-auto">
        <PageHeader title="MuleGuard" />
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

      {loading && accounts.length > 0 && (
        <p className="font-mono text-[11px] tracking-[-0.02em] text-ash mb-2" role="status" aria-live="polite">
          Refreshing…
        </p>
      )}

      {!loading && error && accounts.length > 0 && (
        <p className="font-mono text-[11px] tracking-[-0.02em] text-ash mb-2" role="alert">
          Refresh failed — showing previously loaded data. {error}
        </p>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-5 mb-8">
        <StatCard label="Total Accounts" value={totalInDataset.toLocaleString("en-IN")} sub={`${(muleCount + highRiskCount).toLocaleString("en-IN")} flagged`} />
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
            {topRisk.length > 0 ? topRisk.map((a) => {
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
            }) : (
              <p className="font-mono text-[11px] tracking-[-0.02em] text-ash">None</p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
