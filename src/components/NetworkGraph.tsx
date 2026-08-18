"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { useFirestoreData } from "@/lib/useFirestoreData";
import type { DataSet, Edge, Network, Node, Options } from "vis-network/standalone";

interface GraphNode {
  id: string;
  label: string;
  riskScore: number;
  isMule: boolean;
}

interface GraphEdge {
  from: string;
  to: string;
  flagged: boolean;
}

function buildGraphData(accounts: ReturnType<typeof useFirestoreData>["accounts"]) {
  const graphNodes: GraphNode[] = accounts.map((a) => ({
    id: a.id,
    label: `${a.name}\n${a.id}`,
    riskScore: a.riskScore,
    isMule: a.isMule,
  }));

  const graphEdges: GraphEdge[] = [];
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

  const maxEdges = 80;
  return { graphNodes, displayEdges: graphEdges.slice(0, maxEdges) };
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

      const riskColors: Record<number, string> = {
        0: "#22c550",
        1: "#eab308",
        2: "#f97316",
        3: "#ef4444",
      };

      const visNodes: DataSet<Node, "id"> = new vis.DataSet<Node, "id">(
        graphNodes.map((n) => {
          const riskTier =
            n.riskScore >= 80 ? 3 : n.riskScore >= 60 ? 2 : n.riskScore >= 40 ? 1 : 0;
          return {
            id: n.id,
            label: n.label,
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

      const visEdges: DataSet<Edge, "id"> = new vis.DataSet<Edge, "id">(
        displayEdges.map((e) => ({
          id: `${e.from}->${e.to}`,
          from: e.from,
          to: e.to,
          color: e.flagged ? "#ef444440" : "#e2e8f030",
          width: e.flagged ? 2 : 1,
          arrows: { to: { enabled: true, scaleFactor: 0.5 } },
          smooth: { enabled: true, type: "curvedCW", roundness: 0.2 },
        }))
      );

      const options: Options = {
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

      networkRef.current = new vis.Network(
        containerRef.current,
        { nodes: visNodes, edges: visEdges },
        options
      );

      setGraphStats({
        nodes: graphNodes.length,
        edges: displayEdges.length,
        flaggedEdges: displayEdges.filter((e) => e.flagged).length,
      });
    }

    init();

    return () => {
      cancelled = true;
      networkRef.current?.destroy();
    };
  }, [accountsKey, graphNodes, displayEdges]);

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

      {accounts.length === 0 ? (
        <div className="flex items-center justify-center h-[600px] bg-obsidian border border-chalk rounded-[12px]">
          <p className="text-[13px] text-fog">No account data available</p>
        </div>
      ) : (
        <div
          ref={containerRef}
          className="graph-container w-full"
          style={{ height: "600px" }}
        />
      )}

      <div className="mt-4 grid grid-cols-4 gap-4">
        <div className="card py-3 px-4">
          <p className="text-[11px] text-fog">Total Nodes</p>
          <p className="text-[20px] font-light text-paper-white">{graphStats.nodes}</p>
        </div>
        <div className="card py-3 px-4">
          <p className="text-[11px] text-fog">Total Edges</p>
          <p className="text-[20px] font-light text-paper-white">{graphStats.edges}</p>
        </div>
        <div className="card py-3 px-4">
          <p className="text-[11px] text-fog">Flagged Edges</p>
          <p className="text-[20px] font-light text-danger">{graphStats.flaggedEdges}</p>
        </div>
        <div className="card py-3 px-4">
          <p className="text-[11px] text-fog">Data Source</p>
          <p className="text-[20px] font-light text-paper-white">{source === "firestore" ? "Live" : "Demo"}</p>
        </div>
      </div>
    </div>
  );
}
