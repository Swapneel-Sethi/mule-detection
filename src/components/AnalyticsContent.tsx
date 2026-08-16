"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  Area,
  AreaChart,
} from "recharts";
import {
  transactionTimeline,
  patternTypes,
  riskDistribution,
  accounts,
  transactions,
} from "@/lib/mockData";

const COLORS = ["#ef4444", "#f97316", "#eab308", "#22c550"];

const riskPieData = [
  { name: "Critical", value: riskDistribution.critical },
  { name: "High", value: riskDistribution.high },
  { name: "Medium", value: riskDistribution.medium },
  { name: "Low", value: riskDistribution.low },
];

const hourlyData = Array.from({ length: 24 }, (_, i) => ({
  hour: `${String(i).padStart(2, "0")}:00`,
  transactions: Math.floor(Math.random() * 20) + (i >= 9 && i <= 18 ? 15 : 3),
  flagged: Math.floor(Math.random() * 5),
}));

const bankDist = [
  { name: "SBI", count: 4 },
  { name: "HDFC", count: 3 },
  { name: "ICICI", count: 3 },
  { name: "Axis", count: 2 },
  { name: "Kotak", count: 2 },
  { name: "PNB", count: 2 },
  { name: "Others", count: 4 },
];

const volumeByDay = transactionTimeline.map((d) => ({
  ...d,
  volumeInLakhs: d.volume / 100000,
}));

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
  const flaggedPct = Math.round((transactions.filter((t) => t.flagged).length / transactions.length) * 100);

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
          <p className="text-[12px] text-fog">Flagged Transactions</p>
        </div>
        <div className="card text-center">
          <p className="text-[28px] font-light text-paper-white">
            ₹{(transactions.reduce((s, t) => s + t.amount, 0) / 100000).toFixed(0)}L
          </p>
          <p className="text-[12px] text-fog">Total Volume</p>
        </div>
        <div className="card text-center">
          <p className="text-[28px] font-light text-paper-white">6</p>
          <p className="text-[12px] text-fog">Pattern Types</p>
        </div>
        <div className="card text-center">
          <p className="text-[28px] font-light text-signal-green">94.2%</p>
          <p className="text-[12px] text-fog">Detection Accuracy</p>
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
              <XAxis dataKey="date" tick={{ fill: "#b3b3b5", fontSize: 11 }} />
              <YAxis tick={{ fill: "#b3b3b5", fontSize: 11 }} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="volumeInLakhs" stroke="#e2e8f0" fill="#e2e8f020" name="Volume (₹L)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h3 className="text-[15px] font-medium text-paper-white mb-4">
            Hourly Transaction Distribution
          </h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={hourlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#232323" />
              <XAxis dataKey="hour" tick={{ fill: "#b3b3b5", fontSize: 10 }} interval={3} />
              <YAxis tick={{ fill: "#b3b3b5", fontSize: 11 }} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="transactions" fill="#e2e8f060" name="Total" radius={[2, 2, 0, 0]} />
              <Bar dataKey="flagged" fill="#ef4444" name="Flagged" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="card">
          <h3 className="text-[15px] font-medium text-paper-white mb-4">
            Risk Distribution
          </h3>
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
        </div>

        <div className="card">
          <h3 className="text-[15px] font-medium text-paper-white mb-4">
            Detected Patterns
          </h3>
          <div className="space-y-3">
            {patternTypes.map((p) => (
              <div key={p.name} className="flex items-center gap-3">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                <span className="text-[13px] text-bone flex-1">{p.name}</span>
                <div className="w-20 h-1.5 bg-graphite rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${(p.count / 4) * 100}%`, backgroundColor: p.color }}
                  />
                </div>
                <span className="text-[12px] text-slate-mist w-4 text-right">{p.count}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h3 className="text-[15px] font-medium text-paper-white mb-4">
            Bank Distribution
          </h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={bankDist} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#232323" horizontal={false} />
              <XAxis type="number" tick={{ fill: "#b3b3b5", fontSize: 11 }} />
              <YAxis type="category" dataKey="name" tick={{ fill: "#b3b3b5", fontSize: 11 }} width={50} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="count" fill="#e2e8f080" name="Accounts" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card">
        <h3 className="text-[15px] font-medium text-paper-white mb-4">
          Network Topology Metrics
        </h3>
        <div className="grid grid-cols-5 gap-6">
          {[
            { label: "Nodes", value: "20", sub: "accounts" },
            { label: "Edges", value: "80", sub: "transactions" },
            { label: "Density", value: "0.21", sub: "graph density" },
            { label: "Avg Path", value: "2.4", sub: "hops" },
            { label: "Components", value: "3", sub: "connected" },
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
