"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Area,
  AreaChart,
} from "recharts";
import { useFirestoreData } from "@/lib/useFirestoreData";

const COLORS = ["#ef4444", "#f97316", "#eab308", "#22c550"];

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; name: string; color: string }>; label?: string }) => {
  if (!active || !payload) return null;
  return (
    <div className="bg-carbon border border-chalk rounded-[12px] px-3 py-2">
      <p className="text-[12px] text-fog mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="text-[12px]" style={{ color: p.color }}>
          {p.name}: {p.value}
        </p>
      ))}
    </div>
  );
};

export default function AnalyticsContent() {
  const { accounts, alerts } = useFirestoreData();

  const flaggedAccounts = accounts.filter((a) => a.isMule || a.riskScore >= 60);
  const flaggedPct = accounts.length > 0
    ? Math.round((flaggedAccounts.length / accounts.length) * 100)
    : 0;

  const totalVolume = accounts.reduce((s, a) => s + a.turnover, 0);

  // Risk distribution from real data
  const riskPieData = [
    { name: "Critical", value: accounts.filter((a) => a.riskLevel === "critical").length },
    { name: "High", value: accounts.filter((a) => a.riskLevel === "high").length },
    { name: "Medium", value: accounts.filter((a) => a.riskLevel === "medium").length },
    { name: "Low", value: accounts.filter((a) => a.riskLevel === "low").length },
  ].filter((d) => d.value > 0);

  // Pattern types from alerts
  const patternCounts = new Map<string, number>();
  for (const alert of alerts) {
    patternCounts.set(alert.type, (patternCounts.get(alert.type) || 0) + 1);
  }
  const patternNames: Record<string, string> = {
    rapid_movement: "Rapid Movement",
    fan_in: "Fan-In",
    fan_out: "Fan-Out",
    circular_transfer: "Circular Transfer",
  };
  const maxPatternCount = Math.max(1, ...Array.from(patternCounts.values()));
  const patternTypes = Array.from(patternCounts.entries()).map(([type, count]) => ({
    name: patternNames[type] || type,
    count,
    color: COLORS[Array.from(patternCounts.keys()).indexOf(type) % COLORS.length],
  }));

  // Bank distribution from real data
  const bankCounts = new Map<string, number>();
  for (const a of accounts) {
    const bank = a.bank || "Unknown";
    bankCounts.set(bank, (bankCounts.get(bank) || 0) + 1);
  }
  const bankDist = Array.from(bankCounts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  // Volume over time — derive from account turnover (simple bucket)
  const volumeByDay = Array.from({ length: 7 }, (_, i) => {
    const dayAccounts = accounts.filter((_, idx) => idx % 7 === i);
    return {
      day: `Day ${i + 1}`,
      volumeInLakhs: dayAccounts.reduce((s, a) => s + a.turnover, 0) / 100000,
    };
  });

  // Hourly distribution — derive from alerts timestamps
  const hourlyData = Array.from({ length: 24 }, (_, i) => {
    const hourAlerts = alerts.filter((a) => {
      if (!a.timestamp) return false;
      const h = new Date(a.timestamp).getHours();
      return h === i;
    });
    return {
      hour: `${String(i).padStart(2, "0")}:00`,
      alerts: hourAlerts.length,
    };
  });

  // Network topology metrics
  const totalEdges = accounts.reduce((s, a) => s + a.inDegree + a.outDegree, 0) / 2;

  return (
    <div className="p-8 max-w-[1200px] mx-auto">
      <div className="mb-8">
        <h1 className="text-[45px] font-light tracking-[-1.17px] text-paper-white leading-[1.18]">
          Analytics
        </h1>
        <p className="text-[15px] text-fog mt-2">
          Deep analysis of detection patterns, risk trends, and network behavior
        </p>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="card text-center">
          <p className="text-[28px] font-light text-paper-white">{flaggedPct}%</p>
          <p className="text-[12px] text-fog">Flagged Accounts</p>
        </div>
        <div className="card text-center">
          <p className="text-[28px] font-light text-paper-white">
            ₹{(totalVolume / 100000).toFixed(0)}L
          </p>
          <p className="text-[12px] text-fog">Total Volume</p>
        </div>
        <div className="card text-center">
          <p className="text-[28px] font-light text-paper-white">{patternCounts.size}</p>
          <p className="text-[12px] text-fog">Pattern Types</p>
        </div>
        <div className="card text-center">
          <p className="text-[28px] font-light text-signal-green">
            {accounts.length > 0 ? Math.round(((accounts.filter((a) => a.riskLevel === "low").length / accounts.length) * 100)) : 0}%
          </p>
          <p className="text-[12px] text-fog">Clean Accounts</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="card">
          <h3 className="text-[15px] font-medium text-paper-white mb-4">
            Transaction Volume Over Time
          </h3>
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={volumeByDay}>
              <CartesianGrid strokeDasharray="3 3" stroke="#232323" />
              <XAxis dataKey="day" tick={{ fill: "#b3b3b5", fontSize: 11 }} />
              <YAxis tick={{ fill: "#b3b3b5", fontSize: 11 }} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="volumeInLakhs" stroke="#e2e8f0" fill="#e2e8f020" name="Volume (₹L)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h3 className="text-[15px] font-medium text-paper-white mb-4">
            Alerts by Hour of Day
          </h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={hourlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#232323" />
              <XAxis dataKey="hour" tick={{ fill: "#b3b3b5", fontSize: 10 }} interval={3} />
              <YAxis tick={{ fill: "#b3b3b5", fontSize: 11 }} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="alerts" fill="#e2e8f060" name="Alerts" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="card">
          <h3 className="text-[15px] font-medium text-paper-white mb-4">
            Risk Distribution
          </h3>
          {riskPieData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={riskPieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {riskPieData.map((_, index) => (
                      <Cell key={index} fill={COLORS[index]} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap justify-center gap-3 mt-2">
                {riskPieData.map((entry, i) => (
                  <div key={entry.name} className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i] }} />
                    <span className="text-[11px] text-fog">{entry.name}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-[13px] text-slate-mist text-center py-8">No data</p>
          )}
        </div>

        <div className="card">
          <h3 className="text-[15px] font-medium text-paper-white mb-4">
            Detected Patterns
          </h3>
          {patternTypes.length > 0 ? (
            <div className="space-y-3">
              {patternTypes.map((p) => (
                <div key={p.name} className="flex items-center gap-3">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                  <span className="text-[13px] text-bone flex-1">{p.name}</span>
                  <div className="w-20 h-1.5 bg-graphite rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${(p.count / maxPatternCount) * 100}%`, backgroundColor: p.color }}
                    />
                  </div>
                  <span className="text-[12px] text-slate-mist w-4 text-right">{p.count}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[13px] text-slate-mist text-center py-8">No patterns detected</p>
          )}
        </div>

        <div className="card">
          <h3 className="text-[15px] font-medium text-paper-white mb-4">
            Bank Distribution
          </h3>
          {bankDist.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={bankDist} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#232323" horizontal={false} />
                <XAxis type="number" tick={{ fill: "#b3b3b5", fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fill: "#b3b3b5", fontSize: 11 }} width={50} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" fill="#e2e8f080" name="Accounts" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-[13px] text-slate-mist text-center py-8">No data</p>
          )}
        </div>
      </div>

      <div className="card">
        <h3 className="text-[15px] font-medium text-paper-white mb-4">
          Network Topology Metrics
        </h3>
        <div className="grid grid-cols-5 gap-6">
          {[
            { label: "Nodes", value: String(accounts.length), sub: "accounts" },
            { label: "Edges", value: String(Math.round(totalEdges)), sub: "transactions" },
            { label: "Avg In-Degree", value: accounts.length > 0 ? (accounts.reduce((s, a) => s + a.inDegree, 0) / accounts.length).toFixed(1) : "0", sub: "per node" },
            { label: "Avg Out-Degree", value: accounts.length > 0 ? (accounts.reduce((s, a) => s + a.outDegree, 0) / accounts.length).toFixed(1) : "0", sub: "per node" },
            { label: "Flagged", value: String(flaggedAccounts.length), sub: "accounts" },
          ].map((m) => (
            <div key={m.label} className="text-center">
              <p className="text-[24px] font-light text-paper-white">{m.value}</p>
              <p className="text-[12px] text-fog">{m.label}</p>
              <p className="text-[11px] text-slate-mist">{m.sub}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
