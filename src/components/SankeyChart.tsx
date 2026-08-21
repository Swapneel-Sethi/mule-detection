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
  FANIN: "rgba(242, 142, 43, 0.65)",
  PASSTHROUGH: "rgba(176, 122, 161, 0.65)",
  CIRCULAR: "rgba(225, 87, 89, 0.65)",
  FANOUT: "rgba(237, 201, 72, 0.65)",
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
    n.includes("MULE") || n.includes("LOOP") ? "#E15759" : "#4E79A7"
  );

  const linkSources = flows.map((f) => nodeMap.get(f.source)!);
  const linkTargets = flows.map((f) => nodeMap.get(f.target)!);
  const linkValues = flows.map((f) => f.amount);
  const linkColors = flows.map((f) => colorPalette[f.pattern] || "rgba(180,180,180,0.4)");
  const linkLabels = flows.map(
    (f) => `${f.source} → ${f.target}<br>₹${f.amount.toLocaleString("en-IN")}<br>${f.pattern}`
  );

  return (
    <div className="w-full">
      <Plot
        data={[
          {
            type: "sankey" as const,
            orientation: "h" as const,
            node: {
              pad: 18,
              thickness: 20,
              line: { color: "black", width: 0.5 },
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
