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
  return (
    <div className="flex items-center gap-3">
      <span className="font-mono text-[11px] tracking-[-0.02em] text-ash w-28">{label}</span>
      <div className="flex-1 h-[2px] bg-charcoal rounded-full overflow-hidden">
        {/* Visibility floor lives in CSS min-width so a tiny nonzero share stays
            visible without the declared percentage being inflated. */}
        <div
          className={`h-full rounded-full transition-all duration-700 ${colorClass}`}
          style={{ width: `${pct}%`, minWidth: count > 0 ? "1.5%" : undefined }}
        />
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
  const { accounts, alerts, stats, loading, error, refetch } = useLocalData();

  // Server stats win — the hook ships at most the top-1000 risk page, so local
  // recounts can understate dataset-wide totals. Only when the API omits a
  // stat does safeStat fall back to recounting the loaded page, mirroring the
  // server's disjoint rule exactly: mules never count toward high-risk.
  // (safeStat's fallback param also keeps a legitimate 0 sent by the API —
  // `||` would mask real zeros.)
  const muleCount = safeStat(
    stats.muleCount,
    accounts.filter((a) => a.isMule).length
  );
  const highRiskCount = safeStat(
    stats.highRiskCount,
    accounts.filter(
      (a) => !a.isMule && (a.riskLevel === "critical" || a.riskLevel === "high")
    ).length
  );
  // "—" when the true dataset size is unknown; never fabricate a plausible
  // total for missing data.
  const rawTotal = Number(stats.totalInDataset);
  const totalInDataset = Number.isFinite(rawTotal) && rawTotal > 0 ? rawTotal : null;

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
      <PageHeader title="MuleGuard" />

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

      {/* All values pre-formatted as strings — StatCard's numeric path formats
          via navigator.language and would diverge from its en-IN neighbors. */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-5 mb-8">
        <StatCard label="Total Accounts" value={totalInDataset !== null ? totalInDataset.toLocaleString("en-IN") : "—"} sub={`${(muleCount + highRiskCount).toLocaleString("en-IN")} flagged`} />
        <StatCard label="Flagged Turnover" value={formatCurrencyINR(safeStat(stats.totalVolume))} />
        {/* Owner definition: "Alerts" = accounts warranting review = confirmed
            mules + high-risk potentials — identical to the flagged universe,
            NOT the event-row count in alerts_synthetic.json. */}
        <StatCard
          label="Alerts"
          value={safeStat(stats.flaggedAccounts, muleCount + highRiskCount).toLocaleString("en-IN")}
          sub={`${muleCount.toLocaleString("en-IN")} mule · ${highRiskCount.toLocaleString("en-IN")} potential`}
        />
        <StatCard label="Avg Risk (flagged)" value={`${safeStat(stats.avgRiskScore)}%`} />
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
          {/* "Events" — this feed lists rows from alerts_synthetic.json (alert
              events), which is a different concept from the Alerts KPI above
              (= accounts warranting review). Label keeps the distinction honest. */}
          <CardTitle>Recent Alert Events</CardTitle>
          <div className="space-y-3">
            {recentAlerts.length > 0 ? recentAlerts.map((a) => {
              // Structured fields only — parsing a.title on " - " duplicated
              // the whole title into label and id whenever it was absent.
              const alertLabel = a.type.replace(/_/g, " ");
              const accountId = a.accounts?.[0] || "";
              return (
                <div key={a.id} className="flex items-center justify-between py-2 border-b border-frost/5 last:border-0 gap-3">
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="font-mono text-[12px] tracking-[-0.02em] text-bone capitalize truncate">
                      {accountId ? `${alertLabel} · ${accountId}` : alertLabel}
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
                    <span className="font-mono text-[12px] tracking-[-0.02em] text-bone truncate">{a.id}</span>
                    <span className="font-mono text-[11px] tracking-[-0.02em] text-ash ml-3 truncate">{displayBank}</span>
                  </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="font-mono text-[12px] tracking-[-0.02em] text-bone">
                        {Number.isFinite(a.riskScore) ? a.riskScore.toFixed(0) : 0}%
                      </span>
                      {/* Badge mirrors the account's own ground-truth mule
                          flag — no severity re-derivation. */}
                      <CategoryBadge isMule={a.isMule} />
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
