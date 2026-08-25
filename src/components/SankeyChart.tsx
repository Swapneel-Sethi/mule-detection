"use client";

import { useMemo } from "react";
import dynamic from "next/dynamic";

const Plot = dynamic(() => import("./plotly/PlotlySankey"), { ssr: false });

interface SankeyChartProps {
  flows: { from: string; to: string; amount: number; pattern: string }[];
  accountsTotal: number;
  selectedPattern?: string | null;
  onPatternSelect?: (pattern: string | null) => void;
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

const SOURCE_COLOR = "#5f6b76";
const DEST_COLOR = "#4a545e";
const OTHER_NODE_COLOR = "#3a424a";
const DIM_NODE_COLOR = "#2e343a";
const OTHER_LINK_COLOR = "rgba(107,112,117,0.22)";
const DIM_LINK_COLOR = "rgba(107,112,117,0.06)";

function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

function formatINR(amount: number): string {
  if (amount < 1e3) return `₹${amount.toFixed(0)}`;
  const lakhs = amount / 1e5;
  if (lakhs >= 100) return `₹${(lakhs / 100).toFixed(2)} Cr`;
  if (lakhs >= 1) return `₹${lakhs.toFixed(2)} L`;
  return `₹${(amount / 1e3).toFixed(1)} K`;
}

export default function SankeyChart({
  flows,
  accountsTotal,
  selectedPattern = null,
  onPatternSelect,
}: SankeyChartProps) {
  const sankey = useMemo(() => {
    if (flows.length === 0) return null;

    // Aggregate totals per source, destination, pattern and merged link pair
    const sourceTotals = new Map<string, number>();
    const destTotals = new Map<string, number>();
    const patternTotals = new Map<string, number>();
    const bySourcePattern = new Map<string, number>();
    const byPatternDest = new Map<string, number>();

    for (const f of flows) {
      const amt = Number(f.amount) || 0;
      // Normalize to the canonical vocabulary so every pattern referenced by
      // a link is guaranteed to have a node (unknown values fold into OTHER).
      const pattern = PATTERN_ORDER.includes(f.pattern as (typeof PATTERN_ORDER)[number]) ? f.pattern : "OTHER";
      sourceTotals.set(f.from, (sourceTotals.get(f.from) || 0) + amt);
      destTotals.set(f.to, (destTotals.get(f.to) || 0) + amt);
      patternTotals.set(pattern, (patternTotals.get(pattern) || 0) + amt);
      // \u0000 separator: an account id containing "|" would silently swap
      // fields when these keys are parsed back with split().
      bySourcePattern.set(`${f.from}\u0000${pattern}`, (bySourcePattern.get(`${f.from}\u0000${pattern}`) || 0) + amt);
      byPatternDest.set(`${pattern}\u0000${f.to}`, (byPatternDest.get(`${pattern}\u0000${f.to}`) || 0) + amt);
    }

    const topSources = new Set(
      [...sourceTotals.entries()].sort((a, b) => b[1] - a[1]).slice(0, TOP_N).map(([id]) => id)
    );
    const topDests = new Set(
      [...destTotals.entries()].sort((a, b) => b[1] - a[1]).slice(0, TOP_N).map(([id]) => id)
    );
    const otherSourceCount = Math.max(sourceTotals.size - TOP_N, 0);
    const otherDestCount = Math.max(destTotals.size - TOP_N, 0);
    const hasOtherSource = otherSourceCount > 0;
    const hasOtherDest = otherDestCount > 0;

    // Node columns: sources | patterns | destinations, "Other" last in each column
    const nodeIndex = new Map<string, number>();
    const nodeLabels: string[] = [];
    const nodeBaseColors: string[] = [];
    const nodeHover: string[] = [];
    const nodePattern: (string | null)[] = [];
    const addNode = (key: string, label: string, color: string, hover: string, pattern: string | null = null) => {
      if (nodeIndex.has(key)) return;
      nodeIndex.set(key, nodeLabels.length);
      nodeLabels.push(label);
      nodeBaseColors.push(color);
      nodeHover.push(hover);
      nodePattern.push(pattern);
    };

    for (const id of topSources) {
      addNode(`S:${id}`, `…${id}`, SOURCE_COLOR, formatINR(sourceTotals.get(id) || 0));
    }
    if (hasOtherSource) {
      const total = [...sourceTotals.entries()]
        .filter(([id]) => !topSources.has(id))
        .reduce((s, [, v]) => s + v, 0);
      addNode("S:__other__", `Other · ${otherSourceCount} accts`, OTHER_NODE_COLOR, formatINR(total));
    }

    const patterns = PATTERN_ORDER.filter((p) => patternTotals.has(p));
    for (const p of patterns) {
      // Total lives in customdata only — the hover template already renders
      // it, so repeating it in the label would show the amount twice.
      addNode(`P:${p}`, p, PATTERN_COLORS[p], formatINR(patternTotals.get(p) || 0), p);
    }

    for (const id of topDests) {
      addNode(`D:${id}`, `…${id}`, DEST_COLOR, formatINR(destTotals.get(id) || 0));
    }
    if (hasOtherDest) {
      const total = [...destTotals.entries()]
        .filter(([id]) => !topDests.has(id))
        .reduce((s, [, v]) => s + v, 0);
      addNode("D:__other__", `Other · ${otherDestCount} accts`, OTHER_NODE_COLOR, formatINR(total));
    }

    // Links merged per node pair; "Other" endpoints are muted grey so the
    // pattern colors only highlight the named top flows.
    const linkAgg = new Map<string, { source: number; target: number; amount: number; pattern: string; fromLabel: string; toLabel: string }>();
    const addLink = (sourceKey: string, targetKey: string, amount: number, pattern: string, fromLabel: string, toLabel: string) => {
      const key = `${sourceKey}>${targetKey}`;
      const existing = linkAgg.get(key);
      if (existing) existing.amount += amount;
      else linkAgg.set(key, { source: nodeIndex.get(sourceKey)!, target: nodeIndex.get(targetKey)!, amount, pattern, fromLabel, toLabel });
    };

    for (const [key, amount] of bySourcePattern) {
      const [from, pattern] = key.split("\u0000");
      const sourceKey = topSources.has(from) ? `S:${from}` : "S:__other__";
      addLink(sourceKey, `P:${pattern}`, amount, pattern, topSources.has(from) ? `…${from}` : `Other · ${otherSourceCount} accts`, pattern);
    }
    for (const [key, amount] of byPatternDest) {
      const [pattern, to] = key.split("\u0000");
      const targetKey = topDests.has(to) ? `D:${to}` : "D:__other__";
      addLink(`P:${pattern}`, targetKey, amount, pattern, pattern, topDests.has(to) ? `…${to}` : `Other · ${otherDestCount} accts`);
    }

    const links = [...linkAgg.values()].sort((a, b) => b.amount - a.amount);
    const maxAmount = Math.max(...links.map((l) => l.amount), 1);

    // Selection state: dim everything not carrying the selected pattern and
    // track which account nodes participate in it.
    const participating = new Set<number>();
    for (const l of links) {
      if (!selectedPattern || l.pattern === selectedPattern) {
        participating.add(l.source);
        participating.add(l.target);
      }
    }

    const nodeColors = nodeBaseColors.map((color, i) => {
      if (!selectedPattern) return color;
      if (nodePattern[i]) return nodePattern[i] === selectedPattern ? color : OTHER_NODE_COLOR;
      return participating.has(i) ? color : DIM_NODE_COLOR;
    });

    return {
      labels: nodeLabels,
      colors: nodeColors,
      nodeHover,
      nodePattern,
      sources: links.map((l) => l.source),
      targets: links.map((l) => l.target),
      values: links.map((l) => l.amount / 1e5),
      linkColors: links.map((l) => {
        if (selectedPattern && l.pattern !== selectedPattern) return DIM_LINK_COLOR;
        if (l.fromLabel.startsWith("Other") || l.toLabel.startsWith("Other")) return OTHER_LINK_COLOR;
        const [r, g, b] = hexToRgb(PATTERN_COLORS[l.pattern] || PATTERN_COLORS.OTHER);
        const baseAlpha = selectedPattern ? 0.4 : 0.22;
        const alpha = baseAlpha + 0.26 * (l.amount / maxAmount);
        return `rgba(${r},${g},${b},${alpha.toFixed(2)})`;
      }),
      linkHover: links.map((l) => `${l.fromLabel} → ${l.toLabel} · ${formatINR(l.amount)}`),
      patterns: patterns.map((p) => ({ name: p, total: patternTotals.get(p) || 0 })),
    };
  }, [flows, selectedPattern]);

  if (!sankey || sankey.labels.length === 0) {
    return (
      <p className="font-mono text-[10px] text-ash text-center py-8">No flagged flows to display</p>
    );
  }

  // plotly_click delivers the raw sankey calc datums: node points carry
  // pointNumber (input-label index), link points also carry source/target.
  // Indexing nodePattern by pointNumber selects patterns; link hits are ignored.
  const handleNodeClick = (e: { points: Array<{ pointNumber?: number; source?: unknown }> }) => {
    const pt = e.points?.[0];
    if (!pt || !onPatternSelect || !sankey) return;
    if ("source" in pt || typeof pt.pointNumber !== "number") return;
    const pattern = sankey.nodePattern[pt.pointNumber];
    if (!pattern) return;
    onPatternSelect(pattern === selectedPattern ? null : pattern);
  };

  const columnLabel = {
    font: { size: 10, color: "#6b7075", family: "JetBrains Mono, monospace" },
    showarrow: false,
    yref: "paper" as const,
    y: 1.045,
    yanchor: "bottom" as const,
  };

  return (
    <section aria-label="Sankey diagram showing money flow between accounts by fraud pattern">
      <div className="flex items-baseline justify-between flex-wrap gap-2 mb-1">
        <p className="font-display text-[13px] tracking-[-0.02em] text-bone">
          Mule Account Money Flow: Sankey Breakdown by Fraud Pattern
        </p>
        <p className="font-mono text-[10px] tracking-[-0.02em] text-ash">
          {accountsTotal.toLocaleString("en-IN")} flagged accounts · click a pattern to filter
        </p>
      </div>

      <div className="flex items-center gap-4 mb-2">
        {sankey.patterns.map(({ name }) => (
          <button
            key={name}
            onClick={() => onPatternSelect?.(name === selectedPattern ? null : name)}
            disabled={!onPatternSelect}
            aria-pressed={selectedPattern === name}
            className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded-sm transition-colors ${
              selectedPattern && selectedPattern !== name ? "opacity-40" : ""
            } ${selectedPattern === name ? "bg-charcoal/50" : "hover:bg-charcoal/30"} ${
              onPatternSelect ? "" : "cursor-not-allowed"
            }`}
          >
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{ backgroundColor: PATTERN_COLORS[name] }}
            />
            <span className={`font-mono text-[10px] tracking-[-0.02em] ${selectedPattern === name ? "text-bone" : "text-ash"}`}>
              {name}
            </span>
          </button>
        ))}
      </div>

      <Plot
        data={[
          {
            type: "sankey" as const,
            orientation: "h" as const,
            arrangement: "snap" as const,
            node: {
              pad: 18,
              thickness: 18,
              line: { color: "#444345", width: 0.5 },
              label: sankey.labels,
              color: sankey.colors,
              customdata: sankey.nodeHover,
              hovertemplate: "%{label}<br><b>%{customdata}</b><extra></extra>",
            },
            link: {
              source: sankey.sources,
              target: sankey.targets,
              value: sankey.values,
              color: sankey.linkColors,
              customdata: sankey.linkHover,
              hovertemplate: "%{customdata}<extra></extra>",
            },
          },
        ]}
        layout={{
          font: { size: 11, color: "#888888", family: "JetBrains Mono, monospace" },
          paper_bgcolor: "rgba(0,0,0,0)",
          plot_bgcolor: "rgba(0,0,0,0)",
          height: 640,
          margin: { l: 10, r: 10, t: 30, b: 10 },
          clickmode: "event+select",
          annotations: [
            { x: 0.01, xref: "paper", xanchor: "left", text: "TOP SOURCE ACCOUNTS", ...columnLabel },
            { x: 0.5, xref: "paper", xanchor: "center", text: "FRAUD PATTERN", ...columnLabel },
            { x: 0.99, xref: "paper", xanchor: "right", text: "TOP DESTINATION ACCOUNTS", ...columnLabel },
          ],
        }}
        config={{
          displayModeBar: false,
          displaylogo: false,
          responsive: true,
        }}
        onClick={handleNodeClick}
        style={{ width: "100%" }}
        useResizeHandler
      />
    </section>
  );
}
