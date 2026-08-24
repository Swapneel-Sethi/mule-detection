"use client";

import { useMemo } from "react";
import dynamic from "next/dynamic";
import type { MappedAccount, MappedAlert } from "@/lib/normalizers";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

interface SankeyChartProps {
  accounts: MappedAccount[];
  transactions: { from: string; to: string; amount: number; flagged: boolean; type: string }[];
  alerts: MappedAlert[];
}

export default function SankeyChart({ accounts, transactions, alerts }: SankeyChartProps) {
  const { labels, sources, targets, values, linkColors, nodeColors, nodeLabels } = useMemo(() => {
    const acctMap = new Map(accounts.map((a) => [a.id, a]));
    const flagged = transactions.filter((t) => t.flagged);
    if (flagged.length === 0) return { labels: [], sources: [], targets: [], values: [], linkColors: [], nodeColors: [], nodeLabels: [] };

    const alertTypeMap: Record<string, string> = {
      fan_in: "FANIN",
      rapid_movement: "PASSTHROUGH",
      fan_out: "FANOUT",
      behavioral_change: "FANOUT",
      circular_transfer: "CIRCULAR",
    };

    const txnByType = new Map<string, { from: string; to: string; amount: number }[]>();
    for (const txn of flagged) {
      const fromAcct = acctMap.get(txn.from);
      const toAcct = acctMap.get(txn.to);
      const flags = [...(fromAcct?.flags || []), ...(toAcct?.flags || [])];

      let pattern = "OTHER";
      for (const f of flags) {
        const lower = f.toLowerCase();
        if (lower === "fanin_receiver" || lower === "fan_in") { pattern = "FANIN"; break; }
        if (lower === "fanout_source" || lower === "fan_out") { pattern = "FANOUT"; break; }
        if (lower === "circular_loop") { pattern = "CIRCULAR"; break; }
        if (lower === "pass_through" || lower === "passthrough") { pattern = "PASSTHROUGH"; break; }
      }
      if (pattern === "OTHER") {
        const fromLevel = fromAcct?.riskLevel || "low";
        const toLevel = toAcct?.riskLevel || "low";
        if (fromLevel === "critical" || fromLevel === "high") pattern = "PASSTHROUGH";
      }

      if (!txnByType.has(pattern)) txnByType.set(pattern, []);
      txnByType.get(pattern)!.push({ from: txn.from, to: txn.to, amount: txn.amount });
    }

    const nodeSet = new Map<string, number>();
    const addNode = (name: string) => {
      if (!nodeSet.has(name)) nodeSet.set(name, nodeSet.size);
    };

    const lSources: number[] = [];
    const lTargets: number[] = [];
    const lValues: number[] = [];
    const lColors: string[] = [];

    const colorMap: Record<string, string> = {
      FANIN: "rgba(139,210,245,0.4)",
      FANOUT: "rgba(184,186,185,0.4)",
      PASSTHROUGH: "rgba(184,186,185,0.4)",
      CIRCULAR: "rgba(246,173,85,0.4)",
      OTHER: "rgba(100,100,100,0.2)",
    };

    for (const [pattern, txns] of txnByType) {
      const aggMap = new Map<string, number>();
      for (const txn of txns) {
        const key = `${txn.from}|${txn.to}`;
        aggMap.set(key, (aggMap.get(key) || 0) + txn.amount);
      }

      const sorted = [...aggMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
      for (const [key, amount] of sorted) {
        const [from, to] = key.split("|");
        const fromLabel = from.slice(-6);
        const toLabel = to.slice(-6);
        addNode(fromLabel);
        addNode(toLabel);
        lSources.push(nodeSet.get(fromLabel)!);
        lTargets.push(nodeSet.get(toLabel)!);
        lValues.push(Math.round(amount / 1000));
        lColors.push(colorMap[pattern] || colorMap.OTHER);
      }
    }

    const allLabels = [...nodeSet.keys()];
    const nColors = allLabels.map((n) => {
      const fullId = accounts.find((a) => a.id.endsWith(n))?.id;
      const acct = fullId ? acctMap.get(fullId) : undefined;
      if (acct?.riskLevel === "critical" || acct?.riskLevel === "high") return "var(--color-risk-critical)";
      return "var(--color-chart-secondary)";
    });
    const nLabels = allLabels.map((n) => {
      const fullId = accounts.find((a) => a.id.endsWith(n))?.id;
      const acct = fullId ? acctMap.get(fullId) : undefined;
      return `${n}${acct?.isMule ? " [MULE]" : ""}`;
    });

    return { labels: allLabels, sources: lSources, targets: lTargets, values: lValues, linkColors: lColors, nodeColors: nColors, nodeLabels: nLabels };
  }, [accounts, transactions]);

  if (labels.length === 0) {
    return (
      <p className="font-mono text-[10px] text-ash text-center py-8">No flagged flows to display</p>
    );
  }

  return (
    <div role="img" aria-label="Sankey diagram showing money flow between accounts by fraud pattern: FANIN, PASSTHROUGH, CIRCULAR, FANOUT. Mule accounts highlighted in red.">
      <p className="font-display text-[13px] tracking-[-0.02em] text-bone mb-2">
        Mule Account Money Flow: Sankey Breakdown by Fraud Pattern
      </p>
      <Plot
        data={[
          {
            type: "sankey" as const,
            orientation: "h" as const,
            node: {
              pad: 18,
              thickness: 20,
              line: { color: "black", width: 0.5 },
              label: nodeLabels,
              color: nodeColors,
            },
            link: {
              source: sources,
              target: targets,
              value: values,
              color: linkColors,
            },
          },
        ]}
        layout={{
          font: { size: 11, color: "#b8bab9", family: "JetBrains Mono, monospace" },
          paper_bgcolor: "rgba(0,0,0,0)",
          plot_bgcolor: "rgba(0,0,0,0)",
          height: 750,
          margin: { l: 10, r: 10, t: 10, b: 10 },
        }}
        config={{
          displayModeBar: true,
          displaylogo: false,
          responsive: true,
          modeBarButtonsToRemove: ["lasso2d", "select2d"],
        }}
        style={{ width: "100%" }}
        useResizeHandler
      />
    </div>
  );
}
