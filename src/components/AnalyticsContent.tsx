"use client";

import { useMemo } from "react";
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
  LineChart,
  Line,
  Label,
  LabelList,
} from "recharts";
import { useFirestoreData } from "@/lib/useFirestoreData";
import type { DotItemDotProps } from "recharts";
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

const RISK_COLORS = {
  critical: "var(--color-risk-critical)",
  high: "var(--color-risk-high)",
  medium: "var(--color-risk-medium)",
  low: "var(--color-risk-low)",
} as const;

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

export default function AnalyticsContent() {
  const { accounts, alerts, transactions, loading } = useFirestoreData();

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
        fill: RISK_COLORS.critical,
      },
      {
        name: "High",
        count: accounts.filter((a) => a.riskLevel === "high").length,
        fill: RISK_COLORS.high,
      },
      {
        name: "Medium",
        count: accounts.filter((a) => a.riskLevel === "medium").length,
        fill: RISK_COLORS.medium,
      },
      {
        name: "Low",
        count: accounts.filter((a) => a.riskLevel === "low").length,
        fill: RISK_COLORS.low,
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
    const acctMap = new Map(accounts.map((a) => [a.id, a]));
    const flows = new Map<string, number>();
    for (const txn of transactions) {
      if (txn.flagged) {
        const fromAcct = acctMap.get(txn.from);
        const toAcct = acctMap.get(txn.to);
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
      { name: "Critical", value: counts.critical, fill: RISK_COLORS.critical },
      { name: "High", value: counts.high, fill: RISK_COLORS.high },
      { name: "Medium", value: counts.medium, fill: RISK_COLORS.medium },
      { name: "Low", value: counts.low, fill: RISK_COLORS.low },
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

  const txnAmountByPattern = useMemo(() => {
    const acctMap = new Map(accounts.map((a) => [a.id, a]));
    const patternMap = new Map<string, number>();
    for (const txn of transactions) {
      if (!txn.flagged) continue;
      const fromAcct = acctMap.get(txn.from);
      const toAcct = acctMap.get(txn.to);
      const flags = [...(fromAcct?.flags || []), ...(toAcct?.flags || [])];
      for (const f of flags) {
        const lower = f.toLowerCase();
        if (lower === "fanin_receiver" || lower === "fan_in" || lower === "fanin") {
          patternMap.set("FANIN", (patternMap.get("FANIN") || 0) + txn.amount);
        } else if (lower === "pass_through" || lower === "passthrough" || lower === "layering_chain") {
          patternMap.set("PASSTHROUGH", (patternMap.get("PASSTHROUGH") || 0) + txn.amount);
        } else if (lower === "circular_loop" || lower === "circular" || lower === "circular_transfer") {
          patternMap.set("CIRCULAR", (patternMap.get("CIRCULAR") || 0) + txn.amount);
        } else if (lower === "fanout_source" || lower === "fan_out" || lower === "fanout") {
          patternMap.set("FANOUT", (patternMap.get("FANOUT") || 0) + txn.amount);
        }
      }
    }

    return [
      { pattern: "FANIN", amount: patternMap.get("FANIN") || 0, fill: CHART_COLORS.frost },
      { pattern: "PASSTHROUGH", amount: patternMap.get("PASSTHROUGH") || 0, fill: CHART_COLORS.ash },
      { pattern: "CIRCULAR", amount: patternMap.get("CIRCULAR") || 0, fill: CHART_COLORS.charcoal },
      { pattern: "FANOUT", amount: patternMap.get("FANOUT") || 0, fill: CHART_COLORS.charcoal },
    ];
  }, [transactions, accounts]);

  const riskDistData = useMemo(() => {
    const muleCount = accounts.filter((a) => a.isMule).length;
    const normalCount = accounts.length - muleCount;
    return [
      { category: "Mule / High Risk", count: muleCount, fill: CHART_COLORS.frost },
      { category: "Normal", count: normalCount, fill: CHART_COLORS.bone },
    ];
  }, [accounts]);

  const patternTimeData = useMemo(() => {
    const alertPatternMap: Record<string, string> = {
      fan_in: "FANIN",
      pass_through: "PASSTHROUGH",
      circular: "CIRCULAR",
      circular_transfer: "CIRCULAR",
      fan_out: "FANOUT",
      rapid_movement: "PASSTHROUGH",
      structuring: "FANIN",
      layering_chain: "PASSTHROUGH",
      burst_activity: "FANOUT",
      night_owl: "CIRCULAR",
      automated_timing: "FANOUT",
      behavioral_change: "FANOUT",
    };

    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const monthCounts: Record<string, Record<string, number>> = {};
    for (const m of monthNames) {
      monthCounts[m] = { FANIN: 0, PASSTHROUGH: 0, CIRCULAR: 0, FANOUT: 0 };
    }

    for (const alert of alerts) {
      const ts = alert.timestamp;
      if (!ts) continue;
      const d = new Date(ts);
      const mIdx = d.getMonth();
      if (mIdx < 0 || mIdx > 11) continue;
      const mKey = monthNames[mIdx];
      const alertType = alert.type || "";
      const mapped = alertPatternMap[alertType];
      if (mapped) {
        monthCounts[mKey][mapped] = (monthCounts[mKey][mapped] || 0) + 1;
      }
    }

    const hasAlertData = alerts.length > 0 && alerts.some((a) => a.timestamp);
    if (!hasAlertData) return [];

    return monthNames
      .filter((m) => monthCounts[m].FANIN + monthCounts[m].PASSTHROUGH + monthCounts[m].CIRCULAR + monthCounts[m].FANOUT > 0)
      .map((m) => ({
        month: m,
        FANIN: monthCounts[m].FANIN,
        PASSTHROUGH: monthCounts[m].PASSTHROUGH,
        CIRCULAR: monthCounts[m].CIRCULAR,
        FANOUT: monthCounts[m].FANOUT,
      }));
  }, [alerts]);

  const circularPaths = useMemo(() => {
    const txnMap = new Map<string, Set<string>>();
    for (const txn of transactions) {
      if (!txnMap.has(txn.from)) txnMap.set(txn.from, new Set());
      txnMap.get(txn.from)!.add(txn.to);
    }
    const paths: { from: string; via: string; to: string; amount: number }[] = [];
    const visited = new Set<string>();
    for (const txn of transactions) {
      const targets = txnMap.get(txn.to) || new Set();
      for (const mid of targets) {
        const backTargets = txnMap.get(mid) || new Set();
        if (backTargets.has(txn.from)) {
          const key = [txn.from, txn.to, mid].sort().join("->");
          if (!visited.has(key)) {
            visited.add(key);
            paths.push({ from: txn.from, via: txn.to, to: mid, amount: txn.amount });
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
    return <LoadingState message="Loading analytics..." />;
  }

  return (
    <div className="p-8 space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Flagged%" value={`${flaggedPercent}%`} sub={`${totalFlagged} of ${totalAccounts}`} />
        <StatCard label="Volume" value={`₹${(totalVolume / 100000).toFixed(1)}L`} />
        <StatCard label="Patterns" value={totalPatterns} />
        <StatCard label="Clean%" value={`${cleanPercent}%`} sub={`${totalAccounts - totalFlagged} accounts`} />
      </div>

      <Card>
        <CardTitle>Suspicious Transaction Patterns Over Time</CardTitle>
        <ResponsiveContainer width="100%" height={380} role="img" aria-label="Line chart showing suspicious transaction patterns over time for FANIN, PASSTHROUGH, CIRCULAR, and FANOUT patterns across six months">
          <LineChart data={patternTimeData} margin={{ top: 30, right: 30, left: 10, bottom: 30 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.charcoal} />
            <XAxis
              dataKey="month"
              tick={{ fontSize: 10, fill: CHART_COLORS.frost, fontFamily: "JetBrains Mono" }}
              stroke={CHART_COLORS.charcoal}
            >
              <Label
                value="Month of Date [2026]"
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
                value="Transaction Count"
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
                    <div className="space-y-0.5">
                      <p className="font-mono text-[10px] tracking-[-0.02em] text-frost">
                        Is Fraud Pattern: <span className="text-bone">{String(payload[0]?.dataKey)}</span>
                      </p>
                      <p className="font-mono text-[10px] tracking-[-0.02em] text-frost">
                        Month of Date: <span className="text-bone">{String(lbl)}</span>
                      </p>
                      <p className="font-mono text-[10px] tracking-[-0.02em] text-frost">
                        Transaction Count: <span className="text-bone">{String(payload[0]?.value)}</span>
                      </p>
                    </div>
                  </div>
                );
              }}
            />
            <Line
              type="linear"
              dataKey="FANIN"
              stroke={CHART_COLORS.bone}
              strokeWidth={2}
              name="FANIN"
              dot={(props: DotItemDotProps) => {
                const px = Number(props.cx);
                const py = Number(props.cy);
                return (
                  <g key={`fanin-${props.index}`}>
                    <circle cx={px} cy={py} r={4} fill={CHART_COLORS.bone} stroke={CHART_COLORS.void} strokeWidth={1} />
                    <text x={px} y={py - 10} fill={CHART_COLORS.bone} fontSize={10} fontFamily="JetBrains Mono" textAnchor="middle">{String(props.value)}</text>
                  </g>
                );
              }}
              activeDot={{ r: 6, fill: CHART_COLORS.bone, stroke: CHART_COLORS.void, strokeWidth: 1 }}
            />
            <Line
              type="linear"
              dataKey="PASSTHROUGH"
              stroke={CHART_COLORS.frost}
              strokeWidth={2}
              name="PASSTHROUGH"
              dot={(props: DotItemDotProps) => {
                const px = Number(props.cx);
                const py = Number(props.cy);
                return (
                  <g key={`pass-${props.index}`}>
                    <circle cx={px} cy={py} r={4} fill={CHART_COLORS.frost} stroke={CHART_COLORS.void} strokeWidth={1} />
                    <text x={px} y={py - 10} fill={CHART_COLORS.frost} fontSize={10} fontFamily="JetBrains Mono" textAnchor="middle">{String(props.value)}</text>
                  </g>
                );
              }}
              activeDot={{ r: 6, fill: CHART_COLORS.frost, stroke: CHART_COLORS.void, strokeWidth: 1 }}
            />
            <Line
              type="linear"
              dataKey="CIRCULAR"
              stroke={CHART_COLORS.ash}
              strokeWidth={2}
              name="CIRCULAR"
              dot={(props: DotItemDotProps) => {
                const px = Number(props.cx);
                const py = Number(props.cy);
                return (
                  <g key={`circ-${props.index}`}>
                    <circle cx={px} cy={py} r={4} fill={CHART_COLORS.ash} stroke={CHART_COLORS.void} strokeWidth={1} />
                    <text x={px} y={py - 10} fill={CHART_COLORS.ash} fontSize={10} fontFamily="JetBrains Mono" textAnchor="middle">{String(props.value)}</text>
                  </g>
                );
              }}
              activeDot={{ r: 6, fill: CHART_COLORS.ash, stroke: CHART_COLORS.void, strokeWidth: 1 }}
            />
            <Line
              type="linear"
              dataKey="FANOUT"
              stroke={CHART_COLORS.charcoal}
              strokeWidth={2}
              name="FANOUT"
              dot={(props: DotItemDotProps) => {
                const px = Number(props.cx);
                const py = Number(props.cy);
                return (
                  <g key={`fanout-${props.index}`}>
                    <circle cx={px} cy={py} r={4} fill={CHART_COLORS.charcoal} stroke={CHART_COLORS.frost} strokeWidth={1} />
                    <text x={px} y={py + 18} fill={CHART_COLORS.charcoal} fontSize={10} fontFamily="JetBrains Mono" textAnchor="middle">{String(props.value)}</text>
                  </g>
                );
              }}
              activeDot={{ r: 6, fill: CHART_COLORS.charcoal, stroke: CHART_COLORS.frost, strokeWidth: 1 }}
            />
          </LineChart>
        </ResponsiveContainer>
        <div className="flex flex-wrap gap-4 mt-3 justify-center">
          {[
            { name: "FANIN", colorClass: "bg-bone" },
            { name: "PASSTHROUGH", colorClass: "bg-frost" },
            { name: "CIRCULAR", colorClass: "bg-ash" },
            { name: "FANOUT", colorClass: "bg-charcoal" },
          ].map((l) => (
            <div key={l.name} className="flex items-center gap-1.5">
              <div className={`w-3 h-[2px] rounded-full ${l.colorClass}`} />
              <span className="font-mono text-[9px] tracking-[-0.02em] text-frost">{l.name}</span>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardTitle>Transaction Amount by Pattern</CardTitle>
          <p className="font-mono text-[9px] tracking-[-0.02em] text-ash mb-4">Is Fraud Pattern</p>
          <ResponsiveContainer width="100%" height={280} role="img" aria-label="Bar chart showing transaction amount by fraud pattern: FANIN, PASSTHROUGH, CIRCULAR, FANOUT">
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
          <CardTitle>Risk Distribution</CardTitle>
          <p className="font-mono text-[9px] tracking-[-0.02em] text-ash mb-4">Risk Category</p>
          <ResponsiveContainer width="100%" height={280} role="img" aria-label="Bar chart showing risk distribution: Mule/High Risk vs Normal accounts">
            <BarChart data={riskDistData}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.charcoal} />
              <XAxis
                dataKey="category"
                tick={{ fontSize: 10, fill: CHART_COLORS.frost, fontFamily: "JetBrains Mono" }}
                stroke={CHART_COLORS.charcoal}
              />
              <YAxis
                tick={{ fontSize: 10, fill: CHART_COLORS.frost, fontFamily: "JetBrains Mono" }}
                stroke={CHART_COLORS.charcoal}
              >
                <Label
                  value="Count of Account Id"
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
                        Category: <span className="text-bone">{String(lbl)}</span>
                      </p>
                      <p className="font-mono text-[10px] tracking-[-0.02em] text-frost">
                        Count: <span className="text-bone">{(payload[0]?.value as number)?.toLocaleString("en-IN")}</span>
                      </p>
                    </div>
                  );
                }}
              />
              <Bar dataKey="count" name="Account Id">
                <LabelList content={ValueLabel as never} />
                {riskDistData.map((entry, index) => (
                  <Cell key={index} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <Card>
        <CardTitle>Transaction Volume Over Time</CardTitle>
        <ResponsiveContainer width="100%" height={280} role="img" aria-label="Area chart showing transaction volume over time in lakhs">
          <AreaChart data={volumeByDay}>
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
        <ResponsiveContainer width="100%" height={280} role="img" aria-label="Bar chart showing hourly alert distribution across 24 hours">
          <BarChart data={hourlyAlerts}>
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardTitle>Risk Distribution</CardTitle>
          <ResponsiveContainer width="100%" height={240} role="img" aria-label="Vertical bar chart showing risk distribution by level: Critical, High, Medium, Low">
            <BarChart data={riskBarData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.charcoal} />
              <XAxis
                type="number"
                tick={{ fontSize: 10, fill: CHART_COLORS.frost }}
                stroke={CHART_COLORS.charcoal}
              />
              <YAxis
                dataKey="name"
                type="category"
                tick={{ fontSize: 10, fill: CHART_COLORS.frost }}
                stroke={CHART_COLORS.charcoal}
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
        </Card>

        <Card>
          <CardTitle>Incoming vs Outgoing</CardTitle>
          <ResponsiveContainer width="100%" height={240} role="img" aria-label="Grouped bar chart comparing incoming vs outgoing transactions for top accounts">
            <BarChart data={inOutData}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.charcoal} />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 8, fill: CHART_COLORS.frost }}
                stroke={CHART_COLORS.charcoal}
                angle={-45}
                textAnchor="end"
                height={50}
              />
              <YAxis
                tick={{ fontSize: 10, fill: CHART_COLORS.frost }}
                stroke={CHART_COLORS.charcoal}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="incoming" fill={CHART_COLORS.bone} name="In" />
              <Bar dataKey="outgoing" fill={CHART_COLORS.frost} name="Out" />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card>
          <CardTitle>Money Flow</CardTitle>
          <ResponsiveContainer width="100%" height={240} role="img" aria-label="Vertical bar chart showing money flow between risk levels">
            <BarChart data={moneyFlowData} layout="vertical">
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardTitle>Risk Overview</CardTitle>
          <ResponsiveContainer width="100%" height={240} role="img" aria-label="Pie chart showing risk overview distribution: Critical, High, Medium, Low">
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
        </Card>

        <Card>
          <CardTitle>Patterns</CardTitle>
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
        </Card>

        <Card>
          <CardTitle>Banks</CardTitle>
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
        </Card>
      </div>

      <Card>
        <CardTitle>Circular Transaction Loops</CardTitle>
        <div className="space-y-3 max-h-[280px] overflow-y-auto">
          {circularPaths.map((path, i) => (
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
          {circularPaths.length === 0 && (
            <p className="font-mono text-[10px] text-ash text-center py-8">
              No circular loops detected
            </p>
          )}
        </div>
      </Card>

      <Card>
        <SankeyChart accounts={accounts} transactions={transactions} alerts={alerts} />
      </Card>

      <Card>
        <CardTitle>ML Model — XGBoost</CardTitle>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="flex justify-between md:flex-col gap-1">
            <span className="font-mono text-[9px] tracking-[0.1em] uppercase text-ash">Status</span>
            <span className="font-mono text-[10px] tracking-[-0.02em] text-bone px-2 py-0.5 bg-void border border-frost/10 rounded-lg w-fit">ACTIVE</span>
          </div>
          <div className="flex justify-between md:flex-col gap-1">
            <span className="font-mono text-[9px] tracking-[0.1em] uppercase text-ash">Trees</span>
            <span className="font-mono text-[10px] tracking-[-0.02em] text-bone">200</span>
          </div>
          <div className="flex justify-between md:flex-col gap-1">
            <span className="font-mono text-[9px] tracking-[0.1em] uppercase text-ash">Features</span>
            <span className="font-mono text-[10px] tracking-[-0.02em] text-bone">16</span>
          </div>
          <div className="flex justify-between md:flex-col gap-1">
            <span className="font-mono text-[9px] tracking-[0.1em] uppercase text-ash">Learning Rate</span>
            <span className="font-mono text-[10px] tracking-[-0.02em] text-bone">0.05</span>
          </div>
          <div className="flex justify-between md:flex-col gap-1">
            <span className="font-mono text-[9px] tracking-[0.1em] uppercase text-ash">Objective</span>
            <span className="font-mono text-[10px] tracking-[-0.02em] text-bone">binary:logistic</span>
          </div>
          <div className="flex justify-between md:flex-col gap-1">
            <span className="font-mono text-[9px] tracking-[0.1em] uppercase text-ash">Training Data</span>
            <span className="font-mono text-[10px] tracking-[-0.02em] text-bone">105,461 accounts</span>
          </div>
          <div className="flex justify-between md:flex-col gap-1">
            <span className="font-mono text-[9px] tracking-[0.1em] uppercase text-ash">Mule Prevalence</span>
            <span className="font-mono text-[10px] tracking-[-0.02em] text-bone">5.03%</span>
          </div>
        </div>
      </Card>
    </div>
  );
}
