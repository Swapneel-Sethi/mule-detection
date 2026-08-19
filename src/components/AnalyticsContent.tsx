"use client";

import { useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Area, AreaChart,
} from "recharts";
import { useFirestoreData } from "@/lib/useFirestoreData";

const MONO_COLORS = ["#ffffff", "#b8bab9", "#444345", "#e2e2e2"];

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; name: string }>; label?: string }) => {
  if (!active || !payload) return null;
  return (
    <div className="bg-void border border-frost/10 rounded-[2px] px-3 py-2">
      <p className="font-mono text-[10px] tracking-[-0.02em] text-ash mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="font-mono text-[10px] tracking-[-0.02em] text-bone">
          {p.name}: {typeof p.value === "number" ? p.value.toLocaleString("en-IN") : p.value}
        </p>
      ))}
    </div>
  );
};

export default function AnalyticsContent() {
  const { accounts, alerts, loading } = useFirestoreData();

  const flaggedAccounts = useMemo(() => accounts.filter((a) => a.isMule || a.riskScore >= 60), [accounts]);
  const flaggedPct = useMemo(() => accounts.length > 0 ? Math.round((flaggedAccounts.length / accounts.length) * 100) : 0, [accounts, flaggedAccounts]);
  const totalVolume = useMemo(() => accounts.reduce((s, a) => s + a.turnover, 0), [accounts]);

  const riskPieData = useMemo(() => [
    { name: "Critical", value: accounts.filter((a) => a.riskLevel === "critical").length },
    { name: "High", value: accounts.filter((a) => a.riskLevel === "high").length },
    { name: "Medium", value: accounts.filter((a) => a.riskLevel === "medium").length },
    { name: "Low", value: accounts.filter((a) => a.riskLevel === "low").length },
  ].filter((d) => d.value > 0), [accounts]);

  const patternTypes = useMemo(() => {
    const counts = new Map<string, number>();
    for (const alert of alerts) counts.set(alert.type, (counts.get(alert.type) || 0) + 1);
    const names: Record<string, string> = {
      rapid_movement: "Rapid", fan_in: "Fan-In", fan_out: "Fan-Out",
      circular_transfer: "Circular", layering_chain: "Layering", structuring: "Structuring",
      night_owl: "Night Owl", burst_activity: "Burst", automated_timing: "Automated",
      pass_through: "Pass-Through", community_cluster: "Community", bridge_account: "Bridge",
    };
    return Array.from(counts.entries()).map(([type, count], idx) => ({
      name: names[type] || type, count, color: MONO_COLORS[idx % MONO_COLORS.length],
    }));
  }, [alerts]);

  const maxPatternCount = useMemo(() => {
    const values = patternTypes.map((p) => p.count);
    return values.length > 0 ? values.reduce((a, b) => Math.max(a, b), 1) : 1;
  }, [patternTypes]);

  const bankDist = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of accounts) counts.set(a.bank || "Unknown", (counts.get(a.bank || "Unknown") || 0) + 1);
    return Array.from(counts.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 8);
  }, [accounts]);

  const volumeByDay = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const dayAccounts = accounts.filter((_, idx) => idx % 7 === i);
    return { day: `D${i + 1}`, volumeInLakhs: dayAccounts.reduce((s, a) => s + a.turnover, 0) / 100000 };
  }), [accounts]);

  const hourlyData = useMemo(() => {
    const alertCounts = new Array<number>(24).fill(0);
    for (const a of alerts) {
      if (!a.timestamp) continue;
      const h = new Date(a.timestamp).getHours();
      if (h >= 0 && h < 24) alertCounts[h]++;
    }
    return alertCounts.map((count, i) => ({ hour: `${String(i).padStart(2, "0")}`, alerts: count }));
  }, [alerts]);

  const topology = useMemo(() => {
    const totalEdges = accounts.reduce((s, a) => s + a.inDegree + a.outDegree, 0) / 2;
    const avgIn = accounts.length > 0 ? accounts.reduce((s, a) => s + a.inDegree, 0) / accounts.length : 0;
    const avgOut = accounts.length > 0 ? accounts.reduce((s, a) => s + a.outDegree, 0) / accounts.length : 0;
    return { totalEdges: Math.round(totalEdges), avgIn: avgIn.toFixed(1), avgOut: avgOut.toFixed(1) };
  }, [accounts]);

  const cleanPct = useMemo(() => accounts.length > 0
    ? Math.round(((accounts.filter((a) => a.riskLevel === "low").length / accounts.length) * 100))
    : 0, [accounts]);

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
      <div className="mb-8">
        <h1 className="font-display text-[30px] font-normal leading-[1] text-bone tracking-tight mb-2">
          Analytics
        </h1>
        <div className="h-[1px] bg-frost/20 w-[100px]" />
      </div>

      <div className="grid grid-cols-4 gap-5 mb-10">
        {[
          { label: "Flagged", value: `${flaggedPct}%` },
          { label: "Volume", value: totalVolume >= 10000000 ? `₹${(totalVolume / 10000000).toFixed(1)}Cr` : `₹${(totalVolume / 100000).toFixed(1)}L` },
          { label: "Patterns", value: patternTypes.length },
          { label: "Clean", value: `${cleanPct}%` },
        ].map((m) => (
          <div key={m.label} className="border border-frost/10 rounded-[10px] p-5 text-center">
            <p className="font-display text-[30px] font-normal leading-[1] text-bone">{m.value}</p>
            <p className="font-mono text-[10px] tracking-[-0.02em] text-ash uppercase mt-2">{m.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-5 mb-10">
        <div className="border border-frost/10 rounded-[10px] p-5">
          <p className="font-mono text-[10px] tracking-[-0.02em] text-ash uppercase mb-4">Volume</p>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={volumeByDay}>
              <CartesianGrid strokeDasharray="3 3" stroke="#222222" />
              <XAxis dataKey="day" tick={{ fill: "#b8bab9", fontSize: 10 }} />
              <YAxis tick={{ fill: "#b8bab9", fontSize: 10 }} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="volumeInLakhs" stroke="#e2e2e2" fill="#e2e2e210" name="Volume (₹L)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="border border-frost/10 rounded-[10px] p-5">
          <p className="font-mono text-[10px] tracking-[-0.02em] text-ash uppercase mb-4">Hourly</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={hourlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#222222" />
              <XAxis dataKey="hour" tick={{ fill: "#b8bab9", fontSize: 9 }} interval={3} />
              <YAxis tick={{ fill: "#b8bab9", fontSize: 10 }} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="alerts" fill="#e2e2e240" name="Alerts" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-5 mb-10">
        <div className="border border-frost/10 rounded-[10px] p-5">
          <p className="font-mono text-[10px] tracking-[-0.02em] text-ash uppercase mb-4">Risk</p>
          {riskPieData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={riskPieData} cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={3} dataKey="value">
                    {riskPieData.map((_, index) => (
                      <Cell key={index} fill={MONO_COLORS[index]} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap justify-center gap-3 mt-2">
                {riskPieData.map((entry, i) => (
                  <div key={entry.name} className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: MONO_COLORS[i] }} />
                    <span className="font-mono text-[10px] tracking-[-0.02em] text-ash">{entry.name}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="font-mono text-[10px] tracking-[-0.02em] text-ash text-center py-8">No data</p>
          )}
        </div>

        <div className="border border-frost/10 rounded-[10px] p-5">
          <p className="font-mono text-[10px] tracking-[-0.02em] text-ash uppercase mb-4">Patterns</p>
          {patternTypes.length > 0 ? (
            <div className="space-y-3">
              {patternTypes.map((p) => (
                <div key={p.name} className="flex items-center gap-3">
                  <span className="font-mono text-[12px] tracking-[-0.02em] text-bone flex-1">{p.name}</span>
                  <div className="w-16 h-[2px] bg-charcoal rounded-full overflow-hidden">
                    <div className="h-full bg-bone rounded-full" style={{ width: `${(p.count / maxPatternCount) * 100}%` }} />
                  </div>
                  <span className="font-mono text-[10px] tracking-[-0.02em] text-ash w-4 text-right">{p.count}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="font-mono text-[10px] tracking-[-0.02em] text-ash text-center py-8">None</p>
          )}
        </div>

        <div className="border border-frost/10 rounded-[10px] p-5">
          <p className="font-mono text-[10px] tracking-[-0.02em] text-ash uppercase mb-4">Banks</p>
          {bankDist.length > 0 ? (
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={bankDist} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#222222" horizontal={false} />
                <XAxis type="number" tick={{ fill: "#b8bab9", fontSize: 10 }} />
                <YAxis type="category" dataKey="name" tick={{ fill: "#b8bab9", fontSize: 10 }} width={50} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" fill="#e2e2e260" name="Accounts" radius={[0, 2, 2, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="font-mono text-[10px] tracking-[-0.02em] text-ash text-center py-8">No data</p>
          )}
        </div>
      </div>

      <div className="border border-frost/10 rounded-[10px] p-5">
        <p className="font-mono text-[10px] tracking-[-0.02em] text-ash uppercase mb-5">Topology</p>
        <div className="grid grid-cols-5 gap-6">
          {[
            { label: "Nodes", value: String(accounts.length) },
            { label: "Edges", value: String(topology.totalEdges) },
            { label: "Avg In", value: topology.avgIn },
            { label: "Avg Out", value: topology.avgOut },
            { label: "Flagged", value: String(flaggedAccounts.length) },
          ].map((m) => (
            <div key={m.label} className="text-center">
              <p className="font-mono text-[20px] tracking-[-0.02em] text-bone">{m.value}</p>
              <p className="font-mono text-[10px] tracking-[-0.02em] text-ash uppercase mt-1">{m.label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
