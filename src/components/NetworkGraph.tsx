"use client";

import { useEffect, useRef } from "react";
import { getGraphData } from "@/lib/mockData";

export default function NetworkGraph() {
  const containerRef = useRef<HTMLDivElement>(null);
  const networkRef = useRef<unknown>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    let cancelled = false;

    async function init() {
      const vis = await import("vis-network/standalone");
      if (cancelled || !containerRef.current) return;

      const { nodes, edges } = getGraphData();

      const riskColors: Record<number, string> = {
        0: "#22c550",
        1: "#eab308",
        2: "#f97316",
        3: "#ef4444",
      };

      const visNodes = new (vis.DataSet as unknown as new (data?: unknown[]) => { add: (item: unknown) => void })(
        nodes.map((n) => {
          const riskTier =
            n.riskScore >= 80 ? 3 : n.riskScore >= 60 ? 2 : n.riskScore >= 40 ? 1 : 0;
          return {
            id: n.id,
            label: `${n.label}\n${n.id}`,
            color: {
              background: "#08090b",
              border: riskColors[riskTier],
              highlight: { background: "#232323", border: riskColors[riskTier] },
            },
            font: { color: "#b3b3b5", size: 10, face: "Inter, sans-serif" },
            size: 12 + riskTier * 6,
            borderWidth: 2,
            shape: "dot",
          };
        })
      );

      const edgeData = edges.map((e) => ({
        from: e.from,
        to: e.to,
        color: e.flagged ? "#ef444440" : "#e2e8f030",
        width: e.flagged ? 2 : 1,
        arrows: { to: { enabled: true, scaleFactor: 0.5 } },
        smooth: { type: "curvedCW" as const, roundness: 0.2 },
      }));

      const visEdges = new (vis.DataSet as unknown as new (data?: unknown[]) => { add: (item: unknown) => void })(edgeData);

      const options = {
        nodes: {
          font: { color: "#b3b3b5", size: 10 },
        },
        edges: {
          smooth: { enabled: true, type: "curvedCW", roundness: 0.2 },
          arrows: { to: { enabled: true, scaleFactor: 0.5 } },
        },
        physics: {
          enabled: true,
          solver: "forceAtlas2Based",
          forceAtlas2Based: {
            gravitationalConstant: -40,
            centralGravity: 0.005,
            springLength: 150,
            springConstant: 0.08,
            damping: 0.4,
          },
          stabilization: { iterations: 100 },
        },
        interaction: {
          hover: true,
          tooltipDelay: 200,
          zoomView: true,
          dragView: true,
        },
        layout: { improvedLayout: true },
      };

      networkRef.current = new vis.Network(containerRef.current, { nodes: visNodes as unknown as Record<string, unknown>[], edges: visEdges as unknown as Record<string, unknown>[] }, options);
    }

    init();

    return () => {
      cancelled = true;
      if (networkRef.current && typeof (networkRef.current as { destroy: () => void }).destroy === "function") {
        (networkRef.current as { destroy: () => void }).destroy();
      }
    };
  }, []);

  return (
    <div className="p-8 max-w-[1200px] mx-auto">
      <div className="mb-8">
        <h1 className="text-[45px] font-light tracking-[-1.17px] text-paper-white leading-[1.18]">
          Network Graph
        </h1>
        <p className="text-[15px] text-fog mt-2">
          Interactive visualization of transaction relationships and risk clusters
        </p>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full border-2 border-signal-green bg-carbon" />
          <span className="text-[12px] text-fog">Low Risk</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full border-2 border-warning bg-carbon" />
          <span className="text-[12px] text-fog">Medium Risk</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full border-2 border-danger bg-carbon" />
          <span className="text-[12px] text-fog">High Risk</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="w-4 h-px bg-danger" />
          <span className="text-[12px] text-fog">Flagged Transaction</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-4 h-px bg-chalk" />
          <span className="text-[12px] text-fog">Normal Transaction</span>
        </div>
      </div>

      <div
        ref={containerRef}
        className="graph-container w-full"
        style={{ height: "600px" }}
      />

      <div className="mt-4 grid grid-cols-4 gap-4">
        <div className="card py-3 px-4">
          <p className="text-[11px] text-fog">Total Nodes</p>
          <p className="text-[20px] font-light text-paper-white">20</p>
        </div>
        <div className="card py-3 px-4">
          <p className="text-[11px] text-fog">Total Edges</p>
          <p className="text-[20px] font-light text-paper-white">40</p>
        </div>
        <div className="card py-3 px-4">
          <p className="text-[11px] text-fog">Flagged Edges</p>
          <p className="text-[20px] font-light text-danger">
            {Math.floor(40 * 0.35)}
          </p>
        </div>
        <div className="card py-3 px-4">
          <p className="text-[11px] text-fog">Clusters Detected</p>
          <p className="text-[20px] font-light text-paper-white">3</p>
        </div>
      </div>
    </div>
  );
}
