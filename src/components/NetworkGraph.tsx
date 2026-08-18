"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { useFirestoreData } from "@/lib/useFirestoreData";
import type { DataSet, Edge, Network, Node, Options } from "vis-network/standalone";

function buildGraphData(accounts: ReturnType<typeof useFirestoreData>["accounts"]) {
  const graphNodes = accounts.map((a) => ({
    id: a.id,
    label: `${a.name}\n${a.id}`,
    riskScore: a.riskScore,
    isMule: a.isMule,
  }));

  const graphEdges: { from: string; to: string; flagged: boolean }[] = [];
  const n = accounts.length;
  const muleIds = new Set(accounts.filter((a) => a.isMule).map((a) => a.id));
  const highRiskIds = new Set(accounts.filter((a) => a.riskScore >= 60).map((a) => a.id));

  for (let i = 0; i < n; i++) {
    const a = accounts[i];
    if (a.inDegree > 0 && a.outDegree > 0) {
      const fanOut = Math.min(a.outDegree, 5);
      for (let k = 1; k <= fanOut; k++) {
        const j = (i + k) % n;
        if (j === i) continue;
        const target = accounts[j];
        graphEdges.push({
          from: a.id,
          to: target.id,
          flagged: muleIds.has(a.id) || muleIds.has(target.id) || highRiskIds.has(a.id),
        });
      }
    }
  }

  return { graphNodes, displayEdges: graphEdges.slice(0, 80) };
}

export default function NetworkGraph() {
  const containerRef = useRef<HTMLDivElement>(null);
  const networkRef = useRef<Network | null>(null);
  const { accounts, source } = useFirestoreData();
  const [graphStats, setGraphStats] = useState({ nodes: 0, edges: 0, flaggedEdges: 0 });

  const { graphNodes, displayEdges } = useMemo(() => buildGraphData(accounts), [accounts]);
  const accountsKey = useMemo(() => accounts.map((a) => `${a.id}:${a.riskScore}:${a.isMule}`).join(","), [accounts]);

  useEffect(() => {
    if (!containerRef.current || accounts.length === 0) return;
    let cancelled = false;

    async function init() {
      const vis = await import("vis-network/standalone");
      if (cancelled || !containerRef.current) return;

      const visNodes: DataSet<Node, "id"> = new vis.DataSet<Node, "id">(
        graphNodes.map((n) => ({
          id: n.id,
          label: n.label,
          color: {
            background: "#000000",
            border: n.riskScore >= 60 ? "#ffffff" : "#444345",
            highlight: { background: "#222222", border: "#ffffff" },
          },
          font: { color: "#b8bab9", size: 10, face: "JetBrains Mono, monospace" },
          size: n.riskScore >= 60 ? 18 : 12,
          borderWidth: n.riskScore >= 60 ? 2 : 1,
          shape: "dot",
        }))
      );

      const visEdges: DataSet<Edge, "id"> = new vis.DataSet<Edge, "id">(
        displayEdges.map((e) => ({
          id: `${e.from}->${e.to}`,
          from: e.from,
          to: e.to,
          color: e.flagged ? "#ffffff40" : "#e2e2e215",
          width: e.flagged ? 1.5 : 0.5,
          arrows: { to: { enabled: true, scaleFactor: 0.5 } },
          smooth: { enabled: true, type: "curvedCW", roundness: 0.2 },
        }))
      );

      const options: Options = {
        nodes: { font: { color: "#b8bab9", size: 10 } },
        edges: {
          smooth: { enabled: true, type: "curvedCW", roundness: 0.2 },
          arrows: { to: { enabled: true, scaleFactor: 0.5 } },
        },
        physics: {
          enabled: true,
          solver: "forceAtlas2Based",
          forceAtlas2Based: { gravitationalConstant: -40, centralGravity: 0.005, springLength: 150, springConstant: 0.08, damping: 0.4 },
          stabilization: { iterations: 100 },
        },
        interaction: { hover: true, tooltipDelay: 200, zoomView: true, dragView: true },
        layout: { improvedLayout: true },
      };

      networkRef.current = new vis.Network(containerRef.current, { nodes: visNodes, edges: visEdges }, options);
      setGraphStats({ nodes: graphNodes.length, edges: displayEdges.length, flaggedEdges: displayEdges.filter((e) => e.flagged).length });
    }

    init();
    return () => { cancelled = true; networkRef.current?.destroy(); };
  }, [accountsKey, graphNodes, displayEdges]);

  return (
    <div className="p-10 max-w-[1200px] mx-auto">
      <div className="mb-8">
        <h1 className="font-display text-[30px] font-normal leading-[1] text-bone tracking-tight mb-2">
          Network Graph
        </h1>
        <div className="h-[1px] bg-frost/20 w-[100px] mb-3" />
      </div>

      <div className="flex items-center gap-6 mb-5">
        {[
          { label: "Low", border: "#444345" },
          { label: "Medium", border: "#b8bab9" },
          { label: "High", border: "#ffffff" },
        ].map((l) => (
          <div key={l.label} className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full border" style={{ borderColor: l.border, background: "#000" }} />
            <span className="font-mono text-[10px] tracking-[-0.02em] text-ash">{l.label}</span>
          </div>
        ))}
        <div className="ml-auto flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="w-4 h-[1px] bg-bone" />
            <span className="font-mono text-[10px] tracking-[-0.02em] text-ash">Flagged</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-4 h-[1px] bg-frost/30" />
            <span className="font-mono text-[10px] tracking-[-0.02em] text-ash">Normal</span>
          </div>
        </div>
      </div>

      {accounts.length === 0 ? (
        <div className="flex items-center justify-center h-[600px] border border-frost/10 rounded-[10px]">
          <span className="font-mono text-[10px] tracking-[-0.02em] text-ash">No data</span>
        </div>
      ) : (
        <div ref={containerRef} className="w-full border border-frost/10 rounded-[10px]" style={{ height: "600px" }} />
      )}

      <div className="mt-4 grid grid-cols-4 gap-5">
        {[
          { label: "Nodes", value: graphStats.nodes },
          { label: "Edges", value: graphStats.edges },
          { label: "Flagged", value: graphStats.flaggedEdges },
          { label: "Source", value: source === "firestore" ? "Live" : "Demo" },
        ].map((m) => (
          <div key={m.label} className="border border-frost/10 rounded-[10px] p-4">
            <p className="font-mono text-[10px] tracking-[-0.02em] text-ash uppercase mb-1">{m.label}</p>
            <p className="font-mono text-[20px] tracking-[-0.02em] text-bone">{m.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
