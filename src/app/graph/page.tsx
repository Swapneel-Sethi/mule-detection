"use client";

import { useState } from "react";
import HierarchicalHypergraph from "@/components/HierarchicalHypergraph";
import NetworkGraph from "@/components/NetworkGraph";

export default function GraphPage() {
  const [view, setView] = useState<"hypergraph" | "pairwise">("hypergraph");

  return (
    <div>
      <div className="px-8 pt-8">
        <div className="inline-flex items-center gap-1 bg-surface-1 border border-frost/10 rounded-sm p-1">
          <button
            onClick={() => setView("hypergraph")}
            className={`font-mono text-[10px] px-3 py-1 rounded-[2px] ${view === "hypergraph" ? "bg-frost text-void" : "text-ash hover:text-bone"}`}
          >
            HIERARCHICAL HYPERGRAPH
          </button>
          <button
            onClick={() => setView("pairwise")}
            className={`font-mono text-[10px] px-3 py-1 rounded-[2px] ${view === "pairwise" ? "bg-frost text-void" : "text-ash hover:text-bone"}`}
          >
            PAIRWISE NETWORK
          </button>
        </div>
      </div>
      {view === "hypergraph" ? <HierarchicalHypergraph /> : <NetworkGraph />}
    </div>
  );
}
