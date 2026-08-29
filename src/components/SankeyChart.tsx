"use client";

import dynamic from "next/dynamic";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

interface Flow {
  source: string;
  target: string;
  amount: number;
  pattern: string;
}

function generateFlows(): Flow[] {
  const flows: Flow[] = [];
  let seed = 42;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };

  for (let i = 0; i < 3; i++) {
    const mule = `MULE_FANIN_${String(i + 1).padStart(2, "0")}`;
    const count = Math.floor(rand() * 4) + 4;
    for (let j = 0; j < count; j++) {
      flows.push({
        source: `VICTIM_${i + 1}_${String(j + 1).padStart(2, "0")}`,
        target: mule,
        amount: Math.round((rand() * 30000 + 15000) * 100) / 100,
        pattern: "FANIN",
      });
    }
  }

  for (let i = 0; i < 3; i++) {
    const mule = `MULE_FANOUT_${String(i + 1).padStart(2, "0")}`;
    const count = Math.floor(rand() * 3) + 4;
    for (let j = 0; j < count; j++) {
      flows.push({
        source: mule,
        target: `RECV_OUT_${i + 1}_${String(j + 1).padStart(2, "0")}`,
        amount: Math.round((rand() * 23000 + 12000) * 100) / 100,
        pattern: "FANOUT",
      });
    }
  }

  for (let i = 0; i < 2; i++) {
    const chain = [`SRC_${i + 1}`, `MULE_PASS_L1_${i + 1}`, `MULE_PASS_L2_${i + 1}`, `DEST_${i + 1}`];
    let amt = Math.round((rand() * 70000 + 80000) * 100) / 100;
    for (let k = 0; k < chain.length - 1; k++) {
      flows.push({ source: chain[k], target: chain[k + 1], amount: amt, pattern: "PASSTHROUGH" });
      amt *= 0.96;
    }
  }

  for (let i = 0; i < 2; i++) {
    const loop = [`LOOP_A_${i + 1}`, `LOOP_B_${i + 1}`, `LOOP_C_${i + 1}`, `LOOP_EXIT_${i + 1}`];
    let amt = Math.round((rand() * 50000 + 50000) * 100) / 100;
    for (let k = 0; k < loop.length - 1; k++) {
      flows.push({ source: loop[k], target: loop[k + 1], amount: amt, pattern: "CIRCULAR" });
      amt *= 0.95;
    }
  }

  return flows;
}

const colorPalette: Record<string, string> = {
  FANIN: "rgba(242, 163, 92, 0.75)",
  PASSTHROUGH: "rgba(56, 189, 248, 0.75)",
  CIRCULAR: "rgba(239, 69, 98, 0.8)",
  FANOUT: "rgba(101, 169, 250, 0.75)",
};

export default function SankeyChart() {
  const flows = generateFlows();

  const nodeSet = new Set<string>();
  flows.forEach((f) => {
    nodeSet.add(f.source);
    nodeSet.add(f.target);
  });
  const allNodes = [...nodeSet];

  const nodeMap = new Map<string, number>();
  allNodes.forEach((n, i) => nodeMap.set(n, i));

  const nodeColors = allNodes.map((n) =>
    n.includes("MULE") || n.includes("LOOP") ? "#ef4562" : "#38bdf8"
  );

  const linkSources = flows.map((f) => nodeMap.get(f.source)!);
  const linkTargets = flows.map((f) => nodeMap.get(f.target)!);
  const linkValues = flows.map((f) => f.amount);
  const linkColors = flows.map((f) => colorPalette[f.pattern] || "rgba(148,163,184,0.4)");
  const linkLabels = flows.map(
    (f) => `${f.source} → ${f.target}<br>₹${f.amount.toLocaleString("en-IN")}<br>${f.pattern}`
  );

  return (
    <div>
      <p className="font-display text-[13px] font-semibold text-fg mb-3">
        Multi-Hop Money Corridor Flow: Sankey Decomposition by Fraud Topology
      </p>
      <Plot
        data={[
          {
            type: "sankey" as const,
            orientation: "h" as const,
            node: {
              pad: 18,
              thickness: 20,
              line: { color: "#070b14", width: 1 },
              label: allNodes,
              color: nodeColors,
            },
            link: {
              source: linkSources,
              target: linkTargets,
              value: linkValues,
              color: linkColors,
              customdata: linkLabels,
              hovertemplate: "%{customdata}<extra></extra>",
            },
          },
        ]}
        layout={{
          font: { size: 11, color: "#94a3b8", family: "JetBrains Mono, monospace" },
          paper_bgcolor: "rgba(0,0,0,0)",
          plot_bgcolor: "rgba(0,0,0,0)",
          height: 720,
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
