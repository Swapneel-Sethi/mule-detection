"use client";

import { useMemo } from "react";
import dynamic from "next/dynamic";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

interface SankeyChartProps {
  flows: { from: string; to: string; amount: number; pattern: string }[];
  accountsTotal: number;
}

const colorMap: Record<string, string> = {
  FANIN: "rgba(139,210,245,0.4)",
  FANOUT: "rgba(184,186,185,0.4)",
  PASSTHROUGH: "rgba(184,186,185,0.4)",
  CIRCULAR: "rgba(246,173,85,0.4)",
  OTHER: "rgba(100,100,100,0.2)",
};

export default function SankeyChart({ flows, accountsTotal }: SankeyChartProps) {
  const { labels, sources, targets, values, linkColors, nodeColors, nodeLabels } = useMemo(() => {
    if (flows.length === 0) return { labels: [], sources: [], targets: [], values: [], linkColors: [], nodeColors: [], nodeLabels: [] };

    const nodeSet = new Map<string, number>();
    const addNode = (name: string) => {
      if (!nodeSet.has(name)) nodeSet.set(name, nodeSet.size);
    };

    const lSources: number[] = [];
    const lTargets: number[] = [];
    const lValues: number[] = [];
    const lColors: string[] = [];

    for (const flow of flows) {
      addNode(flow.from);
      addNode(flow.to);
      lSources.push(nodeSet.get(flow.from)!);
      lTargets.push(nodeSet.get(flow.to)!);
      lValues.push(Math.round(flow.amount / 1000));
      lColors.push(colorMap[flow.pattern] || colorMap.OTHER);
    }

    const allLabels = [...nodeSet.keys()];
    const nColors = allLabels.map(() => "var(--color-chart-secondary)");
    const nLabels = allLabels.map((n) => n);

    return { labels: allLabels, sources: lSources, targets: lTargets, values: lValues, linkColors: lColors, nodeColors: nColors, nodeLabels: nLabels };
  }, [flows]);

  if (labels.length === 0) {
    return (
      <p className="font-mono text-[10px] text-ash text-center py-8">No flagged flows to display</p>
    );
  }

  return (
    <div role="img" aria-label="Sankey diagram showing money flow between accounts by fraud pattern">
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
