"use client";

import { useMemo } from "react";
import dynamic from "next/dynamic";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

interface SankeyChartProps {
  flows: { from: string; to: string; amount: number; pattern: string }[];
  accountsTotal: number;
}

const TOP_N = 8;

const PATTERN_ORDER = ["FANIN", "FANOUT", "PASSTHROUGH", "CIRCULAR", "OTHER"] as const;

const PATTERN_COLORS: Record<string, string> = {
  FANIN: "#7fd1f0",
  FANOUT: "#f6ad55",
  PASSTHROUGH: "#b8bab9",
  CIRCULAR: "#ef6c6c",
  OTHER: "#6b7075",
};

const NODE_SOURCE_COLOR = "#5f6b76";
const NODE_DEST_COLOR = "#4a545e";

function formatLakhs(amount: number): string {
  const lakhs = amount / 1e5;
  if (lakhs >= 100) return `₹${(lakhs / 100).toFixed(2)} Cr`;
  return `₹${lakhs.toFixed(2)} L`;
}

export default function SankeyChart({ flows, accountsTotal }: SankeyChartProps) {
  const sankey = useMemo(() => {
    if (flows.length === 0) return null;

    // Aggregate flow totals per source, destination and pattern
    const sourceTotals = new Map<string, number>();
    const destTotals = new Map<string, number>();
    const patternTotals = new Map<string, number>();
    const bySourcePattern = new Map<string, number>();
    const byPatternDest = new Map<string, number>();

    for (const f of flows) {
      const amt = Number(f.amount) || 0;
      sourceTotals.set(f.from, (sourceTotals.get(f.from) || 0) + amt);
      destTotals.set(f.to, (destTotals.get(f.to) || 0) + amt);
      patternTotals.set(f.pattern, (patternTotals.get(f.pattern) || 0) + amt);
      bySourcePattern.set(`${f.from}|${f.pattern}`, (bySourcePattern.get(`${f.from}|${f.pattern}`) || 0) + amt);
      byPatternDest.set(`${f.pattern}|${f.to}`, (byPatternDest.get(`${f.pattern}|${f.to}`) || 0) + amt);
    }

    const topSources = new Set(
      [...sourceTotals.entries()].sort((a, b) => b[1] - a[1]).slice(0, TOP_N).map(([id]) => id)
    );
    const topDests = new Set(
      [...destTotals.entries()].sort((a, b) => b[1] - a[1]).slice(0, TOP_N).map(([id]) => id)
    );
    const otherSourceTotal = [...sourceTotals.entries()]
      .filter(([id]) => !topSources.has(id))
      .reduce((s, [, v]) => s + v, 0);
    const otherDestTotal = [...destTotals.entries()]
      .filter(([id]) => !topDests.has(id))
      .reduce((s, [, v]) => s + v, 0);

    // Node list: sources | patterns | destinations (fixed column order)
    const nodeIndex = new Map<string, number>();
    const nodeLabels: string[] = [];
    const nodeColors: string[] = [];
    const addNode = (key: string, label: string, color: string) => {
      if (nodeIndex.has(key)) return;
      nodeIndex.set(key, nodeLabels.length);
      nodeLabels.push(label);
      nodeColors.push(color);
    };

    for (const id of topSources) addNode(`S:${id}`, `…${id}`, NODE_SOURCE_COLOR);
    const hasOtherSource = otherSourceTotal > 0;
    if (hasOtherSource) addNode("S:__other__", `Other (${Math.max(sourceTotals.size - TOP_N, 0)} accts)`, "#3a424a");

    const patterns = PATTERN_ORDER.filter((p) => patternTotals.has(p));
    for (const p of patterns) addNode(`P:${p}`, p, PATTERN_COLORS[p]);

    for (const id of topDests) addNode(`D:${id}`, `…${id}`, NODE_DEST_COLOR);
    const hasOtherDest = otherDestTotal > 0;
    if (hasOtherDest) addNode("D:__other__", `Other (${Math.max(destTotals.size - TOP_N, 0)} accts)`, "#3a424a");

    // Links, merged per (source node, target node) pair
    const linkAgg = new Map<string, { source: number; target: number; amount: number; pattern: string }>();
    const addLink = (sourceKey: string, targetKey: string, amount: number, pattern: string) => {
      const key = `${sourceKey}>${targetKey}`;
      const existing = linkAgg.get(key);
      if (existing) existing.amount += amount;
      else linkAgg.set(key, { source: nodeIndex.get(sourceKey)!, target: nodeIndex.get(targetKey)!, amount, pattern });
    };

    for (const [key, amount] of bySourcePattern) {
      const [from, pattern] = key.split("|");
      addLink(topSources.has(from) ? `S:${from}` : "S:__other__", `P:${pattern}`, amount, pattern);
    }
    for (const [key, amount] of byPatternDest) {
      const [pattern, to] = key.split("|");
      addLink(`P:${pattern}`, topDests.has(to) ? `D:${to}` : "D:__other__", amount, pattern);
    }

    const links = [...linkAgg.values()].sort((a, b) => b.amount - a.amount);

    return {
      labels: nodeLabels,
      colors: nodeColors,
      sources: links.map((l) => l.source),
      targets: links.map((l) => l.target),
      values: links.map((l) => Math.round((l.amount / 1e5) * 100) / 100),
      linkColors: links.map((l) => {
        const base = PATTERN_COLORS[l.pattern] || PATTERN_COLORS.OTHER;
        // 35% alpha over the pattern hue
        const r = parseInt(base.slice(1, 3), 16);
        const g = parseInt(base.slice(3, 5), 16);
        const b = parseInt(base.slice(5, 7), 16);
        return `rgba(${r},${g},${b},0.35)`;
      }),
      hover: links.map((l) => formatLakhs(l.amount)),
      patterns: patterns.map((p) => ({ name: p, total: patternTotals.get(p) || 0 })),
      hasOtherSource,
      hasOtherDest,
    };
  }, [flows]);

  if (!sankey || sankey.labels.length === 0) {
    return (
      <p className="font-mono text-[10px] text-ash text-center py-8">No flagged flows to display</p>
    );
  }

  return (
    <div role="img" aria-label="Sankey diagram showing money flow between accounts by fraud pattern">
      <div className="flex items-baseline justify-between flex-wrap gap-2 mb-1">
        <p className="font-display text-[13px] tracking-[-0.02em] text-bone">
          Mule Account Money Flow: Sankey Breakdown by Fraud Pattern
        </p>
        <p className="font-mono text-[10px] tracking-[-0.02em] text-ash">
          {accountsTotal.toLocaleString("en-IN")} flagged accounts · values in ₹ Lakhs
        </p>
      </div>

      <div className="flex items-center gap-4 mb-2">
        {sankey.patterns.map(({ name }) => (
          <span key={name} className="flex items-center gap-1.5">
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{ backgroundColor: PATTERN_COLORS[name] }}
            />
            <span className="font-mono text-[10px] tracking-[-0.02em] text-ash">{name}</span>
          </span>
        ))}
      </div>

      <Plot
        data={[
          {
            type: "sankey" as const,
            orientation: "h" as const,
            arrangement: "snap" as const,
            node: {
              pad: 16,
              thickness: 18,
              line: { color: "#444345", width: 0.5 },
              label: sankey.labels,
              color: sankey.colors,
            },
            link: {
              source: sankey.sources,
              target: sankey.targets,
              value: sankey.values,
              color: sankey.linkColors,
              hovertemplate: "%{customdata}<extra></extra>",
              customdata: sankey.hover,
            },
          },
        ]}
        layout={{
          font: { size: 11, color: "#b8bab9", family: "JetBrains Mono, monospace" },
          paper_bgcolor: "rgba(0,0,0,0)",
          plot_bgcolor: "rgba(0,0,0,0)",
          height: 620,
          margin: { l: 10, r: 10, t: 10, b: 10 },
        }}
        config={{
          displayModeBar: false,
          displaylogo: false,
          responsive: true,
        }}
        style={{ width: "100%" }}
        useResizeHandler
      />
    </div>
  );
}
