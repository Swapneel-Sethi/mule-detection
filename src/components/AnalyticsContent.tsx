"use client";

import { useState, useEffect } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  Area,
  AreaChart,
  LineChart,
  Line,
  Label,
} from "recharts";
import SankeyChart from "./SankeyChart";
import StatCard from "@/components/ui/StatCard";
import Card, { CardTitle } from "@/components/ui/Card";
import LoadingState from "@/components/ui/LoadingState";

const CHART_COLORS = {
  void: "var(--color-void)",
  bone: "var(--color-bone)",
  charcoal: "var(--color-charcoal)",
  frost: "var(--color-frost)",
  ash: "var(--color-ash)",
} as const;

const PATTERN_LINES = [
  { key: "Fan In", color: "#f87171" },
  { key: "Fan Out", color: "#38bdf8" },
  { key: "Rapid Movement", color: "#fbbf24" },
];

interface AnalyticsData {
  totalAccounts: number;
  totalTransactions: number;
  totalAlerts: number;
  muleAccounts: number;
  cleanAccounts: number;
  riskCounts: { critical: number; high: number; medium: number; low: number };
  flaggedTransactions: number;
  totalTurnover: number;
  bankData: { bank: string; count: number }[];
  patternData: { pattern: string; count: number }[];
  txnByPattern: Record<string, number>;
  moneyFlowData: { from: string; to: string; amount: number; amountInLakhs: number }[];
  volumeByDay: { day: string; volumeInLakhs: number; transactions: number }[];
  hourlyAlerts: { hour: string; alerts: number }[];
  patternTimeData: Record<string, string | number>[];
  inOutData: { name: string; incoming: number; outgoing: number }[];
  circularPaths: { from: string; via: string; to: string; amount: number }[];
  sankeyFlows: { from: string; to: string; amount: number; pattern: string }[];
  allAccountsTotal: number;
}

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
    <div className="bg-void border border-frost/10 rounded-lg px-3 py-2">
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

function ValueLabel(props: Record<string, unknown>) {
  const px = Number(props.x);
  const py = Number(props.y);
  const val = Number(props.value);
  if (!px || !py) return null;
  return (
    <text x={px} y={py - 10} fill={CHART_COLORS.frost} fontSize={10} fontFamily="JetBrains Mono" textAnchor="middle">
      {val.toLocaleString("en-IN")}
    </text>
  );
}

export default function AnalyticsContent() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/analytics")
      .then((r) => r.json())
      .then((json) => {
        setData(json);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading || !data) {
    return <LoadingState message="Loading analytics..." />;
  }

  const txnAmountByPattern = [
    { pattern: "FANIN", amount: data.txnByPattern.FANIN || 0, fill: CHART_COLORS.frost },
    { pattern: "PASSTHROUGH", amount: data.txnByPattern.PASSTHROUGH || 0, fill: CHART_COLORS.ash },
    { pattern: "CIRCULAR", amount: data.txnByPattern.CIRCULAR || 0, fill: CHART_COLORS.charcoal },
    { pattern: "FANOUT", amount: data.txnByPattern.FANOUT || 0, fill: CHART_COLORS.charcoal },
  ];

  const highRiskCount = data.riskCounts.critical + data.riskCounts.high;
  const muleOnlyCount = data.muleAccounts - highRiskCount;
  const categoryBarData = [
    { name: "Mule", count: data.muleAccounts, fill: "var(--color-risk-critical)" },
    { name: "High Risk", count: highRiskCount, fill: "var(--color-risk-high)" },
  ];

  return (
    <div className="p-8 space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Flagged Accounts" value={data.muleAccounts.toLocaleString("en-IN")} sub={`of ${data.allAccountsTotal.toLocaleString("en-IN")} total`} />
        <StatCard label="Total Volume" value={`₹${(data.totalTurnover / 100000).toFixed(1)}L`} />
        <StatCard label="Flagged Transactions" value={data.flaggedTransactions.toLocaleString("en-IN")} sub={`of ${data.totalTransactions.toLocaleString("en-IN")} total`} />
        <StatCard label="Alerts" value={data.totalAlerts} />
      </div>

      <Card>
        <CardTitle>Suspicious Transaction Patterns Over Time</CardTitle>
        <ResponsiveContainer width="100%" height={380} role="img" aria-label="Line chart showing suspicious transaction patterns over time">
          <LineChart data={data.patternTimeData} margin={{ top: 30, right: 30, left: 10, bottom: 50 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.charcoal} />
            <XAxis
              dataKey="day"
              tick={{ fontSize: 10, fill: CHART_COLORS.frost, fontFamily: "JetBrains Mono" }}
              stroke={CHART_COLORS.charcoal}
            >
              <Label
                value="Date [Aug 2026]"
                position="bottom"
                offset={10}
                className="font-mono text-[10px] text-frost"
              />
            </XAxis>
            <YAxis
              tick={{ fontSize: 10, fill: CHART_COLORS.frost, fontFamily: "JetBrains Mono" }}
              stroke={CHART_COLORS.charcoal}
            >
              <Label
                value="Alert Count"
                angle={-90}
                position="insideLeft"
                offset={10}
                className="font-mono text-[10px] text-frost"
              />
            </YAxis>
            <Tooltip content={<CustomTooltip />} />
            {PATTERN_LINES.map((p) => (
              <Line key={p.key} type="linear" dataKey={p.key} stroke={p.color} strokeWidth={2} name={p.key} dot={{ r: 3, fill: p.color }} />
            ))}
          </LineChart>
        </ResponsiveContainer>
        <div className="flex flex-wrap gap-4 mt-3 justify-center">
          {PATTERN_LINES.map((l) => (
            <div key={l.key} className="flex items-center gap-1.5">
              <div className="w-3 h-[2px] rounded-full" style={{ backgroundColor: l.color }} />
              <span className="font-mono text-[9px] tracking-[-0.02em] text-frost">{l.key}</span>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardTitle>Transaction Amount by Pattern</CardTitle>
          <p className="font-mono text-[9px] tracking-[-0.02em] text-ash mb-4">Is Fraud Pattern</p>
          <ResponsiveContainer width="100%" height={280} role="img" aria-label="Bar chart showing transaction amount by fraud pattern">
            <BarChart data={txnAmountByPattern}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.charcoal} />
              <XAxis
                dataKey="pattern"
                tick={{ fontSize: 10, fill: CHART_COLORS.frost, fontFamily: "JetBrains Mono" }}
                stroke={CHART_COLORS.charcoal}
              />
              <YAxis
                tick={{ fontSize: 10, fill: CHART_COLORS.frost, fontFamily: "JetBrains Mono" }}
                stroke={CHART_COLORS.charcoal}
                tickFormatter={(v: number) => `${(v / 10000000).toFixed(0)}M`}
              >
                <Label
                  value="Total Amount in ₹"
                  angle={-90}
                  position="insideLeft"
                  offset={10}
                  className="font-mono text-[10px] text-frost"
                />
              </YAxis>
              <Tooltip
                content={({ active, payload, label: lbl }) => {
                  if (!active || !payload || payload.length === 0) return null;
                  return (
                    <div className="bg-void border border-frost/10 rounded-lg px-3 py-2">
                      <p className="font-mono text-[10px] tracking-[-0.02em] text-frost">
                        Pattern: <span className="text-bone">{String(lbl)}</span>
                      </p>
                      <p className="font-mono text-[10px] tracking-[-0.02em] text-frost">
                        Amount: <span className="text-bone">₹{((payload[0]?.value as number) / 10000000).toFixed(2)}M</span>
                      </p>
                    </div>
                  );
                }}
              />
              <Bar dataKey="amount" name="Total Amount">
                {txnAmountByPattern.map((entry, index) => (
                  <Cell key={index} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card>
          <CardTitle>Top Banks by Flagged Accounts</CardTitle>
          <div className="space-y-2 max-h-[280px] overflow-y-auto">
            {data.bankData.slice(0, 15).map((b) => (
              <div key={b.bank} className="flex items-center gap-3">
                <span className="font-mono text-[10px] tracking-[-0.02em] text-frost min-w-[80px] truncate">
                  {b.bank}
                </span>
                <div className="flex-1 h-[6px] bg-void rounded-full overflow-hidden">
                  <div
                    className="h-full bg-frost/40 rounded-full"
                    style={{
                      width: `${(b.count / (data.bankData[0]?.count || 1)) * 100}%`,
                    }}
                  />
                </div>
                <span className="font-mono text-[10px] tracking-[-0.02em] text-ash min-w-[40px] text-right">
                  {b.count.toLocaleString("en-IN")}
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card>
        <CardTitle>Transaction Volume Over Time</CardTitle>
        <ResponsiveContainer width="100%" height={280} role="img" aria-label="Area chart showing transaction volume over time in lakhs">
          <AreaChart data={data.volumeByDay}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.charcoal} />
            <XAxis
              dataKey="day"
              tick={{ fontSize: 10, fill: CHART_COLORS.frost }}
              stroke={CHART_COLORS.charcoal}
            />
            <YAxis
              tick={{ fontSize: 10, fill: CHART_COLORS.frost }}
              stroke={CHART_COLORS.charcoal}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="volumeInLakhs"
              stroke={CHART_COLORS.frost}
              fill={CHART_COLORS.frost}
              fillOpacity={0.08}
              strokeWidth={1.5}
              name="Volume (₹L)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </Card>

      <Card>
        <CardTitle>Hourly Alert Distribution</CardTitle>
        <ResponsiveContainer width="100%" height={280} role="img" aria-label="Bar chart showing hourly alert distribution">
          <BarChart data={data.hourlyAlerts}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.charcoal} />
            <XAxis
              dataKey="hour"
              tick={{ fontSize: 9, fill: CHART_COLORS.frost }}
              stroke={CHART_COLORS.charcoal}
              interval={2}
            />
            <YAxis
              tick={{ fontSize: 10, fill: CHART_COLORS.frost }}
              stroke={CHART_COLORS.charcoal}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="alerts" fill={CHART_COLORS.frost} name="Alerts" />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardTitle>Account Categories</CardTitle>
          <ResponsiveContainer width="100%" height={240} role="img" aria-label="Bar chart showing Mule vs High Risk account counts">
            <BarChart data={categoryBarData}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.charcoal} />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 10, fill: CHART_COLORS.frost }}
                stroke={CHART_COLORS.charcoal}
              />
              <YAxis
                tick={{ fontSize: 10, fill: CHART_COLORS.frost }}
                stroke={CHART_COLORS.charcoal}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="count" name="Accounts" radius={[2, 2, 0, 0]}>
                {categoryBarData.map((entry, index) => (
                  <Cell key={index} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card>
          <CardTitle>Money Flow</CardTitle>
          <ResponsiveContainer width="100%" height={240} role="img" aria-label="Horizontal bar chart showing money flow between risk levels">
            <BarChart data={data.moneyFlowData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.charcoal} />
              <XAxis
                type="number"
                tick={{ fontSize: 10, fill: CHART_COLORS.frost }}
                stroke={CHART_COLORS.charcoal}
              />
              <YAxis
                dataKey={(d) => `${d.from}→${d.to}`}
                type="category"
                tick={{ fontSize: 9, fill: CHART_COLORS.frost }}
                stroke={CHART_COLORS.charcoal}
                width={70}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar
                dataKey="amountInLakhs"
                fill={CHART_COLORS.frost}
                name="Amount (₹L)"
                radius={[0, 2, 2, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardTitle>Summary</CardTitle>
          <div className="space-y-4 py-2">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] tracking-[-0.02em] text-ash">Mule Accounts</span>
              <span className="font-mono text-[13px] tracking-[-0.02em] text-bone">{data.muleAccounts.toLocaleString("en-IN")}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] tracking-[-0.02em] text-ash">High Risk (Potential Mules)</span>
              <span className="font-mono text-[13px] tracking-[-0.02em] text-bone">{highRiskCount.toLocaleString("en-IN")}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] tracking-[-0.02em] text-ash">Total Flagged Transactions</span>
              <span className="font-mono text-[13px] tracking-[-0.02em] text-bone">{data.flaggedTransactions.toLocaleString("en-IN")}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] tracking-[-0.02em] text-ash">Total Accounts in Dataset</span>
              <span className="font-mono text-[13px] tracking-[-0.02em] text-bone">{data.allAccountsTotal.toLocaleString("en-IN")}</span>
            </div>
          </div>
        </Card>

        <Card>
          <CardTitle>Patterns</CardTitle>
          <div className="space-y-2 max-h-[240px] overflow-y-auto">
            {data.patternData.slice(0, 10).map((p) => (
              <div key={p.pattern} className="flex items-center gap-3">
                <span className="font-mono text-[10px] tracking-[-0.02em] text-frost min-w-[120px] truncate">
                  {p.pattern}
                </span>
                <div className="flex-1 h-[6px] bg-void rounded-full overflow-hidden">
                  <div
                    className="h-full bg-frost/40 rounded-full"
                    style={{
                      width: `${(p.count / (data.patternData[0]?.count || 1)) * 100}%`,
                    }}
                  />
                </div>
                <span className="font-mono text-[10px] tracking-[-0.02em] text-ash min-w-[40px] text-right">
                  {p.count.toLocaleString("en-IN")}
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card>
        <CardTitle>Circular Transaction Loops</CardTitle>
        <div className="space-y-3 max-h-[280px] overflow-y-auto">
          {data.circularPaths.map((path, i) => (
            <div
              key={i}
              className="bg-void border border-frost/10 rounded-lg p-3"
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
          {data.circularPaths.length === 0 && (
            <p className="font-mono text-[10px] text-ash text-center py-8">
              No circular loops detected
            </p>
          )}
        </div>
      </Card>

      <Card>
        <SankeyChart flows={data.sankeyFlows} accountsTotal={data.totalAccounts} />
      </Card>
    </div>
  );
}
