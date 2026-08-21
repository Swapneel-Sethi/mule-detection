"use client";

import { useState } from "react";
import { useFirestoreData } from "@/lib/useFirestoreData";

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="border border-frost/10 rounded-[10px] p-5">
      <p className="font-mono text-[10px] tracking-[-0.02em] text-ash uppercase mb-3">{label}</p>
      <p className="font-display text-[30px] font-normal leading-[1] text-bone tracking-tight">
        {typeof value === "number" ? value.toLocaleString("en-IN") : value}
      </p>
      {sub && <p className="font-mono text-[10px] tracking-[-0.02em] text-ash mt-2">{sub}</p>}
    </div>
  );
}

function RiskBar({ level, count, total }: { level: string; count: number; total: number }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="font-mono text-[10px] tracking-[-0.02em] text-ash w-28 capitalize">{level}</span>
      <div className="flex-1 h-[2px] bg-charcoal rounded-full overflow-hidden">
        <div className="h-full rounded-full bg-bone transition-all duration-700" style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono text-[10px] tracking-[-0.02em] text-ash w-8 text-right">{count}</span>
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

  const riskDistribution = {
    critical: accounts.filter((a) => a.riskLevel === "critical").length,
    high: accounts.filter((a) => a.riskLevel === "high").length,
    medium: accounts.filter((a) => a.riskLevel === "medium").length,
    low: accounts.filter((a) => a.riskLevel === "low").length,
  };
  const totalRisk = riskDistribution.critical + riskDistribution.high + riskDistribution.medium + riskDistribution.low;

  const topRisk = [...accounts].sort((a, b) => b.riskScore - a.riskScore).slice(0, 5);

  const recentAlerts = alerts.slice(0, 5);

  if (loading) {
    return (
      <div className="p-10 max-w-[1200px] mx-auto">
        <div className="flex items-center justify-center h-64">
          <span className="font-mono text-[10px] tracking-[-0.02em] text-ash">Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-10 max-w-[1200px] mx-auto">
      <div className="mb-10">
        <div className="flex items-center gap-3 mb-4">
          <h1 className="font-display text-[80px] font-normal leading-[0.78] text-bone tracking-tight">
            MuleGuard
          </h1>
        </div>
        <div className="h-[1px] bg-frost/20 w-[200px] mb-4" />
        <div className="flex items-center gap-4">
          <p className="font-mono text-[10px] tracking-[-0.02em] text-ash uppercase">
            {source === "firestore" ? "Live" : "Demo"}
          </p>
          <button
            onClick={runDetection}
            disabled={detecting}
            className="font-mono text-[10px] tracking-[-0.02em] uppercase px-4 py-2 bg-charcoal text-bone border border-frost/20 rounded-[2px] hover:bg-charcoal/80 transition-colors disabled:opacity-40"
          >
            {detecting ? "Running..." : "Run Detection"}
          </button>
        </div>
        {detectResult && (
          <p className="font-mono text-[10px] tracking-[-0.02em] text-ash mt-3">{detectResult}</p>
        )}
      </div>

      <div className="grid grid-cols-4 gap-5 mb-10">
        <StatCard label="Accounts" value={stats.totalAccounts} sub={`${stats.flaggedAccounts} flagged`} />
        <StatCard label="Turnover" value={`\u20B9${(stats.totalVolume / 10000000).toFixed(1)}Cr`} />
        <StatCard label="Alerts" value={stats.activeAlerts} sub={`${stats.resolvedAlerts} resolved`} />
        <StatCard label="Avg Risk" value={`${stats.avgRiskScore}%`} />
      </div>

      <div className="grid grid-cols-2 gap-5 mb-10">
        <div className="border border-frost/10 rounded-[10px] p-5">
          <p className="font-mono text-[10px] tracking-[-0.02em] text-ash uppercase mb-5">Risk Distribution</p>
          <div className="space-y-3">
            <RiskBar level="critical" count={riskDistribution.critical} total={totalRisk} />
            <RiskBar level="high" count={riskDistribution.high} total={totalRisk} />
            <RiskBar level="medium" count={riskDistribution.medium} total={totalRisk} />
            <RiskBar level="low" count={riskDistribution.low} total={totalRisk} />
          </div>
        </div>

        <div className="border border-frost/10 rounded-[10px] p-5">
          <p className="font-mono text-[10px] tracking-[-0.02em] text-ash uppercase mb-5">Status</p>
          <div className="space-y-4">
            {[
              { label: "Firestore", ok: true },
              { label: "Graph Engine", ok: true },
              { label: "ML Pipeline", ok: true },
            ].map((s) => (
              <div key={s.label} className="flex items-center justify-between">
                <span className="font-mono text-[12px] tracking-[-0.02em] text-ash">{s.label}</span>
                <span className="font-mono text-[10px] tracking-[-0.02em] text-bone">OK</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-5">
        <div className="border border-frost/10 rounded-[10px] p-5">
          <p className="font-mono text-[10px] tracking-[-0.02em] text-ash uppercase mb-5">Recent Alerts</p>
          <div className="space-y-3">
            {recentAlerts.length > 0 ? recentAlerts.map((a) => (
              <div key={a.id} className="flex items-center justify-between py-2 border-b border-frost/5 last:border-0">
                <span className="font-mono text-[12px] tracking-[-0.02em] text-bone">{a.title}</span>
                <span className="font-mono text-[10px] tracking-[-0.02em] text-ash">{a.type}</span>
              </div>
            )) : (
              <p className="font-mono text-[10px] tracking-[-0.02em] text-ash">None</p>
            )}
          </div>
        </div>

        <div className="border border-frost/10 rounded-[10px] p-5">
          <p className="font-mono text-[10px] tracking-[-0.02em] text-ash uppercase mb-5">Top Risk</p>
          <div className="space-y-3">
            {topRisk.map((a) => (
              <div key={a.id} className="flex items-center justify-between py-2 border-b border-frost/5 last:border-0">
                <div>
                  <span className="font-mono text-[12px] tracking-[-0.02em] text-bone">{a.id}</span>
                  <span className="font-mono text-[10px] tracking-[-0.02em] text-ash ml-3">{a.bank}</span>
                </div>
                <span className="font-mono text-[12px] tracking-[-0.02em] text-bone">{a.riskScore.toFixed(0)}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
