"use client";

import { useState } from "react";
import {
  Shield,
  AlertTriangle,
  TrendingUp,
  Users,
  ArrowLeftRight,
  CheckCircle2,
  Play,
  Loader2,
} from "lucide-react";
import { useFirestoreData } from "@/lib/useFirestoreData";

function StatCard({
  label,
  value,
  icon: Icon,
  color,
  sub,
}: {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  sub?: string;
}) {
  return (
    <div className="card flex items-start gap-4 animate-fade-in">
      <div
        className="w-10 h-10 rounded-[12px] flex items-center justify-center shrink-0"
        style={{ backgroundColor: `${color}15`, border: `1px solid ${color}30` }}
      >
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-[13px] text-fog font-medium">{label}</p>
        <p className="text-[28px] font-light tracking-tight text-paper-white mt-0.5">
          {typeof value === "number" && value > 999 ? value.toLocaleString("en-IN") : value}
        </p>
        {sub && <p className="text-[11px] text-slate-mist mt-1">{sub}</p>}
      </div>
    </div>
  );
}

function RiskBar({ level, count, total, color }: { level: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-[12px] text-fog w-16 capitalize">{level}</span>
      <div className="flex-1 h-2 bg-graphite rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="text-[12px] text-slate-mist w-8 text-right">{count}</span>
    </div>
  );
}

export default function DashboardContent() {
  const { accounts, alerts, stats, loading, source } = useFirestoreData();
  const [detecting, setDetecting] = useState(false);
  const [detectResult, setDetectResult] = useState<string | null>(null);

  const runDetection = async () => {
    setDetecting(true);
    setDetectResult(null);
    try {
      const res = await fetch("/api/detect", { method: "POST" });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setDetectResult(
        `Detection complete: ${data.summary.mules_detected} mules found, ${data.summary.patterns_found} patterns detected across ${data.summary.total_accounts} accounts.`
      );
      window.location.reload();
    } catch (err) {
      setDetectResult(`Error: ${err instanceof Error ? err.message : "Failed"}`);
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

  const severityColors: Record<string, string> = {
    critical: "#ef4444",
    high: "#f97316",
    medium: "#eab308",
    low: "#3b82f6",
  };

  return (
    <div className="p-8 max-w-[1200px] mx-auto">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <span className="w-2 h-2 rounded-full bg-signal-green signal-pulse" />
          <span className="text-[11px] font-medium text-signal-green uppercase tracking-wider">Live Monitoring</span>
          {source === "firestore" && (
            <span className="text-[10px] text-fog bg-graphite/50 px-2 py-0.5 rounded-full">Firebase Connected</span>
          )}
          {source === "mock" && (
            <span className="text-[10px] text-warning bg-warning/10 px-2 py-0.5 rounded-full">Demo Data</span>
          )}
          <button
            onClick={runDetection}
            disabled={detecting}
            className="ml-auto flex items-center gap-2 px-3 py-1.5 text-[12px] font-medium bg-signal-green/10 text-signal-green border border-signal-green/30 rounded-[8px] hover:bg-signal-green/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {detecting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Running Detection...
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5" />
                Run Detection
              </>
            )}
          </button>
        </div>
        <h1 className="text-[45px] font-light tracking-[-1.17px] text-paper-white leading-[1.18]">
          MuleGuard Dashboard
        </h1>
        <p className="text-[15px] text-fog mt-2">
          Real-time mule account detection and transaction network analysis
        </p>
        {detectResult && (
          <div className={`mt-3 px-4 py-2.5 rounded-[8px] text-[13px] ${detectResult.startsWith("Error") ? "bg-danger/10 text-danger border border-danger/30" : "bg-signal-green/10 text-signal-green border border-signal-green/30"}`}>
            {detectResult}
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-chalk border-t-signal-green rounded-full animate-spin mx-auto mb-3" />
            <p className="text-[13px] text-fog">Loading from Firestore...</p>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-4 mb-8">
            <StatCard label="Total Accounts" value={stats.totalAccounts} icon={Users} color="#e2e8f0" sub={`${stats.flaggedAccounts} flagged`} />
            <StatCard label="Total Turnover" value={`₹${(stats.totalVolume / 1000000).toFixed(0)}M`} icon={ArrowLeftRight} color="#e2e8f0" sub="Across all accounts" />
            <StatCard label="Active Alerts" value={stats.activeAlerts} icon={AlertTriangle} color="#ef4444" sub={`${stats.resolvedAlerts} resolved`} />
            <StatCard label="Avg Risk Score" value={`${stats.avgRiskScore}%`} icon={TrendingUp} color={stats.avgRiskScore > 50 ? "#ef4444" : "#eab308"} sub="Across all accounts" />
          </div>

          <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="card col-span-2">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-[15px] font-medium text-paper-white">Risk Distribution</h3>
                <span className="text-[11px] text-slate-mist">{totalRisk} accounts analyzed</span>
              </div>
              <div className="space-y-3">
                <RiskBar level="critical" count={riskDistribution.critical} total={totalRisk} color="#ef4444" />
                <RiskBar level="high" count={riskDistribution.high} total={totalRisk} color="#f97316" />
                <RiskBar level="medium" count={riskDistribution.medium} total={totalRisk} color="#eab308" />
                <RiskBar level="low" count={riskDistribution.low} total={totalRisk} color="#22c550" />
              </div>
            </div>

            <div className="card">
              <h3 className="text-[15px] font-medium text-paper-white mb-4">System Health</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-signal-green" />
                    <span className="text-[13px] text-bone">Graph Engine</span>
                  </div>
                  <span className="text-[11px] text-signal-green font-medium">Operational</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-signal-green" />
                    <span className="text-[13px] text-bone">ML Pipeline</span>
                  </div>
                  <span className="text-[11px] text-signal-green font-medium">Operational</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-signal-green" />
                    <span className="text-[13px] text-bone">Firestore</span>
                  </div>
                  <span className={`text-[11px] font-medium ${source === "firestore" ? "text-signal-green" : "text-warning"}`}>
                    {source === "firestore" ? "Connected" : "Fallback"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="card">
              <h3 className="text-[15px] font-medium text-paper-white mb-4">Recent Alerts</h3>
              <div>
                {alerts.slice(0, 5).map((alert) => (
                  <div key={alert.id} className="flex items-center gap-3 py-3 border-b border-chalk/50 last:border-0">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: severityColors[alert.severity] || "#3b82f6" }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] text-bone truncate">{alert.title}</p>
                      <p className="text-[11px] text-slate-mist">
                        {alert.timestamp ? new Date(alert.timestamp).toLocaleDateString("en-IN", { month: "short", day: "numeric" }) : ""}
                      </p>
                    </div>
                  </div>
                ))}
                {alerts.length === 0 && <p className="text-[13px] text-slate-mist">No alerts</p>}
              </div>
            </div>

            <div className="card">
              <h3 className="text-[15px] font-medium text-paper-white mb-4">Top Risk Accounts</h3>
              <div className="space-y-3">
                {topRisk.map((a) => (
                  <div key={a.id} className="flex items-center gap-3 py-2 border-b border-chalk/30 last:border-0">
                    <div className="w-8 h-8 rounded-full bg-graphite flex items-center justify-center">
                      <Shield className="w-4 h-4 text-fog" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] text-bone font-medium truncate">{a.id}</p>
                      <p className="text-[11px] text-slate-mist">{a.city}</p>
                    </div>
                    <div className="text-right">
                      <p className={`text-[14px] font-medium ${a.riskScore >= 60 ? "text-danger" : "text-warning"}`}>
                        {a.riskScore.toFixed(1)}%
                      </p>
                      {a.isMule && (
                        <span className="text-[10px] text-danger bg-danger/10 px-1.5 py-0.5 rounded">MULE</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
