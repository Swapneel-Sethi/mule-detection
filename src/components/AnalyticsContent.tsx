"use client";

import { useMemo, useState } from "react";
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
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
} from "recharts";
import { useFirestoreData } from "@/lib/useFirestoreData";
import { getFeatureImportances } from "@/lib/xgboostPredictor";

const COLORS = {
  void: "#000000",
  bone: "#ffffff",
  charcoal: "#222222",
  frost: "#b8bab9",
  ash: "#444345",
};

const CustomTooltip = ({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number; name: string }>;
  label?: string;
}) => {
  if (!active || !payload) return null;
  return (
    <div className="bg-void border border-frost/10 rounded-[2px] px-3 py-2">
      <p className="font-mono text-[10px] tracking-[-0.02em] text-ash mb-1">
        {label}
      </p>
      {payload.map((p, i) => (
        <p
          key={i}
          className="font-mono text-[10px] tracking-[-0.02em] text-bone"
        >
          {p.name}:{" "}
          {typeof p.value === "number"
            ? p.value.toLocaleString("en-IN")
            : p.value}
        </p>
      ))}
    </div>
  );
};

export default function AnalyticsContent() {
  const { accounts, alerts, transactions, loading } = useFirestoreData();
  const [radarAccount, setRadarAccount] = useState<string>("");

  const volumeByDay = useMemo(() => {
    if (transactions.length > 0) {
      const dayMap = new Map<string, { volume: number; count: number }>();
      for (const txn of transactions) {
        const day = txn.timestamp.slice(0, 10);
        const existing = dayMap.get(day) || { volume: 0, count: 0 };
        existing.volume += txn.amount;
        existing.count += 1;
        dayMap.set(day, existing);
      }
      return Array.from(dayMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([day, d]) => ({
          day: day.slice(5),
          volumeInLakhs: d.volume / 100000,
          transactions: d.count,
        }));
    }
    return Array.from({ length: 7 }, (_, i) => {
      const dayAccounts = accounts.filter((_, idx) => idx % 7 === i);
      return {
        day: `D${i + 1}`,
        volumeInLakhs:
          dayAccounts.reduce((s, a) => s + a.turnover, 0) / 100000,
        transactions: 0,
      };
    });
  }, [accounts, transactions]);

  const hourlyAlerts = useMemo(() => {
    const hourMap = new Map<number, number>();
    for (let h = 0; h < 24; h++) hourMap.set(h, 0);
    for (const alert of alerts) {
      const ts = alert.timestamp;
      if (ts) {
        const hour = new Date(ts).getHours();
        hourMap.set(hour, (hourMap.get(hour) || 0) + 1);
      }
    }
    return Array.from(hourMap.entries()).map(([hour, count]) => ({
      hour: `${String(hour).padStart(2, "0")}:00`,
      alerts: count,
    }));
  }, [alerts]);

  const riskBarData = useMemo(
    () => [
      {
        name: "Critical",
        count: accounts.filter((a) => a.riskLevel === "critical").length,
        fill: "#ef4444",
      },
      {
        name: "High",
        count: accounts.filter((a) => a.riskLevel === "high").length,
        fill: "#f97316",
      },
      {
        name: "Medium",
        count: accounts.filter((a) => a.riskLevel === "medium").length,
        fill: "#eab308",
      },
      {
        name: "Low",
        count: accounts.filter((a) => a.riskLevel === "low").length,
        fill: "#22c55e",
      },
    ],
    [accounts]
  );

  const inOutData = useMemo(() => {
    return accounts.slice(0, 20).map((a) => ({
      name: a.id.length > 8 ? a.id.slice(-6) : a.id,
      incoming: a.inDegree,
      outgoing: a.outDegree,
    }));
  }, [accounts]);

  const moneyFlowData = useMemo(() => {
    const flows = new Map<string, number>();
    for (const txn of transactions) {
      if (txn.flagged) {
        const fromAcct = accounts.find((a) => a.id === txn.from);
        const toAcct = accounts.find((a) => a.id === txn.to);
        const fromLevel = fromAcct?.riskLevel || "low";
        const toLevel = toAcct?.riskLevel || "low";
        const key = `${fromLevel}->${toLevel}`;
        flows.set(key, (flows.get(key) || 0) + txn.amount);
      }
    }
    return Array.from(flows.entries()).map(([key, amount]) => {
      const [from, to] = key.split("->");
      return { from, to, amount, amountInLakhs: amount / 100000 };
    });
  }, [transactions, accounts]);

  const riskPieData = useMemo(() => {
    const counts = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const a of accounts) {
      const level = a.riskLevel as keyof typeof counts;
      if (level in counts) counts[level]++;
    }
    return [
      { name: "Critical", value: counts.critical, fill: "#ef4444" },
      { name: "High", value: counts.high, fill: "#f97316" },
      { name: "Medium", value: counts.medium, fill: "#eab308" },
      { name: "Low", value: counts.low, fill: "#22c55e" },
    ];
  }, [accounts]);

  const patternData = useMemo(() => {
    const patternMap = new Map<string, number>();
    for (const a of accounts) {
      if (a.flags && Array.isArray(a.flags)) {
        for (const p of a.flags) {
          patternMap.set(p, (patternMap.get(p) || 0) + 1);
        }
      }
    }
    return Array.from(patternMap.entries())
      .map(([pattern, count]) => ({ pattern, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [accounts]);

  const bankData = useMemo(() => {
    const bankMap = new Map<string, number>();
    for (const a of accounts) {
      const bank = a.bank || "Unknown";
      bankMap.set(bank, (bankMap.get(bank) || 0) + 1);
    }
    return Array.from(bankMap.entries())
      .map(([bank, count]) => ({ bank, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [accounts]);

  const radarData = useMemo(() => {
    const acct =
      accounts.find((a) => a.id === radarAccount) || accounts[0];
    if (!acct) return [];
    return [
      { metric: "Behavioral", value: acct.behavioralScore, fullMark: 100 },
      { metric: "Graph", value: acct.graphScore, fullMark: 100 },
      { metric: "Temporal", value: acct.temporalScore, fullMark: 100 },
      { metric: "PageRank", value: acct.pagerankScore, fullMark: 100 },
      { metric: "Community", value: acct.communityScore, fullMark: 100 },
      { metric: "Bridge", value: acct.bridgeScore, fullMark: 100 },
      { metric: "ML", value: acct.mlScore, fullMark: 100 },
    ];
  }, [accounts, radarAccount]);

  const circularPaths = useMemo(() => {
    const txnMap = new Map<string, string[]>();
    for (const txn of transactions) {
      const existing = txnMap.get(txn.from) || [];
      existing.push(txn.to);
      txnMap.set(txn.from, existing);
    }
    const paths: { from: string; via: string; to: string; amount: number }[] =
      [];
    const visited = new Set<string>();
    for (const txn of transactions) {
      const targets = txnMap.get(txn.to) || [];
      for (const mid of targets) {
        const backTargets = txnMap.get(mid) || [];
        if (backTargets.includes(txn.from)) {
          const key = [txn.from, txn.to, mid].sort().join("->");
          if (!visited.has(key)) {
            visited.add(key);
            paths.push({
              from: txn.from,
              via: txn.to,
              to: mid,
              amount: txn.amount,
            });
          }
        }
      }
    }
    return paths.slice(0, 10);
  }, [transactions]);

  const totalFlagged = accounts.filter((a) => a.isMule || a.riskScore >= 60).length;
  const totalAccounts = accounts.length || 1;
  const flaggedPercent = ((totalFlagged / totalAccounts) * 100).toFixed(1);
  const totalVolume = accounts.reduce((s, a) => s + a.turnover, 0);
  const totalPatterns = patternData.length;
  const cleanPercent = (
    ((totalAccounts - totalFlagged) / totalAccounts) *
    100
  ).toFixed(1);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="font-mono text-[11px] tracking-[-0.02em] text-frost">
          Loading analytics...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Flagged%", value: `${flaggedPercent}%`, color: "text-red-400" },
          { label: "Volume", value: `₹${(totalVolume / 100000).toFixed(1)}L`, color: "text-bone" },
          { label: "Patterns", value: totalPatterns, color: "text-yellow-400" },
          { label: "Clean%", value: `${cleanPercent}%`, color: "text-green-400" },
        ].map((stat) => (
          <div
            key={stat.label}
            className="bg-charcoal border border-frost/10 rounded-[2px] p-4"
          >
            <p className="font-mono text-[9px] tracking-[0.1em] uppercase text-ash mb-2">
              {stat.label}
            </p>
            <p className={`font-mono text-xl tracking-[-0.02em] ${stat.color}`}>
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      <div className="bg-charcoal border border-frost/10 rounded-[2px] p-5">
        <h3 className="font-display text-[13px] tracking-[-0.02em] text-bone mb-4">
          Transaction Volume Over Time
        </h3>
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={volumeByDay}>
            <CartesianGrid strokeDasharray="3 3" stroke="#444345" />
            <XAxis
              dataKey="day"
              tick={{ fontSize: 10, fill: "#b8bab9" }}
              stroke="#444345"
            />
            <YAxis
              tick={{ fontSize: 10, fill: "#b8bab9" }}
              stroke="#444345"
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="volumeInLakhs"
              stroke="#b8bab9"
              fill="#b8bab9"
              fillOpacity={0.08}
              strokeWidth={1.5}
              name="Volume (₹L)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-charcoal border border-frost/10 rounded-[2px] p-5">
        <h3 className="font-display text-[13px] tracking-[-0.02em] text-bone mb-4">
          Hourly Alert Distribution
        </h3>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={hourlyAlerts}>
            <CartesianGrid strokeDasharray="3 3" stroke="#444345" />
            <XAxis
              dataKey="hour"
              tick={{ fontSize: 9, fill: "#b8bab9" }}
              stroke="#444345"
              interval={2}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "#b8bab9" }}
              stroke="#444345"
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="alerts" fill="#b8bab9" name="Alerts" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-charcoal border border-frost/10 rounded-[2px] p-5">
          <h3 className="font-display text-[13px] tracking-[-0.02em] text-bone mb-4">
            Risk Distribution
          </h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={riskBarData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#444345" />
              <XAxis
                type="number"
                tick={{ fontSize: 10, fill: "#b8bab9" }}
                stroke="#444345"
              />
              <YAxis
                dataKey="name"
                type="category"
                tick={{ fontSize: 10, fill: "#b8bab9" }}
                stroke="#444345"
                width={60}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="count" name="Accounts" radius={[0, 2, 2, 0]}>
                {riskBarData.map((entry, index) => (
                  <Cell key={index} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-charcoal border border-frost/10 rounded-[2px] p-5">
          <h3 className="font-display text-[13px] tracking-[-0.02em] text-bone mb-4">
            Incoming vs Outgoing
          </h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={inOutData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#444345" />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 8, fill: "#b8bab9" }}
                stroke="#444345"
                angle={-45}
                textAnchor="end"
                height={50}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "#b8bab9" }}
                stroke="#444345"
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="incoming" fill="#22c55e" name="In" />
              <Bar dataKey="outgoing" fill="#ef4444" name="Out" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-charcoal border border-frost/10 rounded-[2px] p-5">
          <h3 className="font-display text-[13px] tracking-[-0.02em] text-bone mb-4">
            Money Flow
          </h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={moneyFlowData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#444345" />
              <XAxis
                type="number"
                tick={{ fontSize: 10, fill: "#b8bab9" }}
                stroke="#444345"
              />
              <YAxis
                dataKey={(d) => `${d.from}→${d.to}`}
                type="category"
                tick={{ fontSize: 9, fill: "#b8bab9" }}
                stroke="#444345"
                width={70}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar
                dataKey="amountInLakhs"
                fill="#ef4444"
                name="Amount (₹L)"
                radius={[0, 2, 2, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-charcoal border border-frost/10 rounded-[2px] p-5">
          <h3 className="font-display text-[13px] tracking-[-0.02em] text-bone mb-4">
            Risk Overview
          </h3>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={riskPieData}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={85}
                dataKey="value"
                stroke="none"
              >
                {riskPieData.map((entry, index) => (
                  <Cell key={index} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap gap-3 mt-2 justify-center">
            {riskPieData.map((entry) => (
              <div key={entry.name} className="flex items-center gap-1.5">
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: entry.fill }}
                />
                <span className="font-mono text-[9px] tracking-[-0.02em] text-frost">
                  {entry.name} ({entry.value})
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-charcoal border border-frost/10 rounded-[2px] p-5">
          <h3 className="font-display text-[13px] tracking-[-0.02em] text-bone mb-4">
            Patterns
          </h3>
          <div className="space-y-2 max-h-[240px] overflow-y-auto">
            {patternData.map((p) => (
              <div key={p.pattern} className="flex items-center gap-3">
                <span className="font-mono text-[10px] tracking-[-0.02em] text-frost min-w-[120px] truncate">
                  {p.pattern}
                </span>
                <div className="flex-1 h-[6px] bg-void rounded-full overflow-hidden">
                  <div
                    className="h-full bg-frost/40 rounded-full"
                    style={{
                      width: `${(p.count / (patternData[0]?.count || 1)) * 100}%`,
                    }}
                  />
                </div>
                <span className="font-mono text-[10px] tracking-[-0.02em] text-ash min-w-[20px] text-right">
                  {p.count}
                </span>
              </div>
            ))}
            {patternData.length === 0 && (
              <p className="font-mono text-[10px] text-ash">No patterns found</p>
            )}
          </div>
        </div>

        <div className="bg-charcoal border border-frost/10 rounded-[2px] p-5">
          <h3 className="font-display text-[13px] tracking-[-0.02em] text-bone mb-4">
            Banks
          </h3>
          <div className="space-y-2 max-h-[240px] overflow-y-auto">
            {bankData.map((b) => (
              <div key={b.bank} className="flex items-center gap-3">
                <span className="font-mono text-[10px] tracking-[-0.02em] text-frost min-w-[80px] truncate">
                  {b.bank}
                </span>
                <div className="flex-1 h-[6px] bg-void rounded-full overflow-hidden">
                  <div
                    className="h-full bg-frost/40 rounded-full"
                    style={{
                      width: `${(b.count / (bankData[0]?.count || 1)) * 100}%`,
                    }}
                  />
                </div>
                <span className="font-mono text-[10px] tracking-[-0.02em] text-ash min-w-[20px] text-right">
                  {b.count}
                </span>
              </div>
            ))}
            {bankData.length === 0 && (
              <p className="font-mono text-[10px] text-ash">No bank data</p>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-charcoal border border-frost/10 rounded-[2px] p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display text-[13px] tracking-[-0.02em] text-bone">
              Account Behaviour Radar
            </h3>
            <select
              value={radarAccount}
              onChange={(e) => setRadarAccount(e.target.value)}
              className="bg-void border border-frost/10 rounded-[2px] px-2 py-1 font-mono text-[10px] tracking-[-0.02em] text-frost"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.id}
                </option>
              ))}
            </select>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <RadarChart data={radarData}>
              <PolarGrid stroke="#444345" />
              <PolarAngleAxis
                dataKey="metric"
                tick={{ fontSize: 9, fill: "#b8bab9" }}
              />
              <PolarRadiusAxis
                tick={{ fontSize: 8, fill: "#444345" }}
                domain={[0, 100]}
              />
              <Radar
                name="Score"
                dataKey="value"
                stroke="#b8bab9"
                fill="#b8bab9"
                fillOpacity={0.12}
                strokeWidth={1.5}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-charcoal border border-frost/10 rounded-[2px] p-5">
          <h3 className="font-display text-[13px] tracking-[-0.02em] text-bone mb-4">
            Circular Transaction Loops
          </h3>
          <div className="space-y-3 max-h-[280px] overflow-y-auto">
            {circularPaths.map((path, i) => (
              <div
                key={i}
                className="bg-void border border-frost/10 rounded-[2px] p-3"
              >
                <p className="font-mono text-[11px] tracking-[-0.02em] text-bone mb-1">
                  {path.from.slice(-6)} → {path.via.slice(-6)} →{" "}
                  {path.to.slice(-6)} → {path.from.slice(-6)}
                </p>
                <p className="font-mono text-[9px] tracking-[-0.02em] text-ash">
                  Amount: ₹{(path.amount / 100000).toFixed(2)}L
                </p>
              </div>
            ))}
            {circularPaths.length === 0 && (
              <p className="font-mono text-[10px] text-ash text-center py-8">
                No circular loops detected
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ML Model Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-charcoal border border-frost/10 rounded-[2px] p-5">
          <h3 className="font-display text-[13px] tracking-[-0.02em] text-bone mb-4">
            ML Model — XGBoost
          </h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="font-mono text-[10px] tracking-[-0.02em] text-frost">Status</span>
              <span className="font-mono text-[10px] tracking-[-0.02em] text-bone px-2 py-0.5 bg-void border border-frost/10 rounded-[2px]">ACTIVE</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="font-mono text-[10px] tracking-[-0.02em] text-frost">Version</span>
              <span className="font-mono text-[10px] tracking-[-0.02em] text-bone">1.0</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="font-mono text-[10px] tracking-[-0.02em] text-frost">Trees</span>
              <span className="font-mono text-[10px] tracking-[-0.02em] text-bone">200</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="font-mono text-[10px] tracking-[-0.02em] text-frost">Features</span>
              <span className="font-mono text-[10px] tracking-[-0.02em] text-bone">16</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="font-mono text-[10px] tracking-[-0.02em] text-frost">Learning Rate</span>
              <span className="font-mono text-[10px] tracking-[-0.02em] text-bone">0.05</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="font-mono text-[10px] tracking-[-0.02em] text-frost">Objective</span>
              <span className="font-mono text-[10px] tracking-[-0.02em] text-bone">binary:logistic</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="font-mono text-[10px] tracking-[-0.02em] text-frost">Training Data</span>
              <span className="font-mono text-[10px] tracking-[-0.02em] text-bone">105,461 accounts</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="font-mono text-[10px] tracking-[-0.02em] text-frost">Mule Prevalence</span>
              <span className="font-mono text-[10px] tracking-[-0.02em] text-bone">5.03%</span>
            </div>
          </div>
        </div>

        <div className="bg-charcoal border border-frost/10 rounded-[2px] p-5">
          <h3 className="font-display text-[13px] tracking-[-0.02em] text-bone mb-4">
            Feature Importances
          </h3>
          <div className="space-y-2">
            {getFeatureImportances().map((f) => {
              const maxImp = 12501.1;
              const pct = (f.importance / maxImp) * 100;
              return (
                <div key={f.feature} className="flex items-center gap-3">
                  <span className="font-mono text-[10px] tracking-[-0.02em] text-frost min-w-[110px] truncate">
                    {f.feature}
                  </span>
                  <div className="flex-1 h-[6px] bg-void rounded-full overflow-hidden">
                    <div
                      className="h-full bg-frost/60 rounded-full"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="font-mono text-[9px] tracking-[-0.02em] text-ash min-w-[50px] text-right">
                    {f.importance.toFixed(1)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
