"use client";

import { useState } from "react";
import HierarchicalHypergraph from "@/components/HierarchicalHypergraph";
import MuleGalaxy from "@/components/MuleGalaxy";
import NetworkGraph from "@/components/NetworkGraph";

export default function GraphPage() {
  const [view, setView] = useState<"galaxy" | "hypergraph" | "pairwise">("galaxy");

  return (
    <div>
      <div className="px-8 pt-8">
        <div className="inline-flex items-center gap-1 bg-surface-1 border border-frost/10 rounded-sm p-1">
          <button
            onClick={() => setView("galaxy")}
            aria-pressed={view === "galaxy"}
            className={`font-mono text-[11px] px-3 py-1.5 rounded-[2px] ${view === "galaxy" ? "bg-frost text-void" : "text-ash hover:text-bone"}`}
          >
            RISK GALAXY
          </button>
          <button
            onClick={() => setView("hypergraph")}
            aria-pressed={view === "hypergraph"}
            className={`font-mono text-[11px] px-3 py-1.5 rounded-[2px] ${view === "hypergraph" ? "bg-frost text-void" : "text-ash hover:text-bone"}`}
          >
            HIERARCHICAL HYPERGRAPH
          </button>
          <button
            onClick={() => setView("pairwise")}
            aria-pressed={view === "pairwise"}
            className={`font-mono text-[11px] px-3 py-1.5 rounded-[2px] ${view === "pairwise" ? "bg-frost text-void" : "text-ash hover:text-bone"}`}
          >
            PAIRWISE NETWORK
          </button>
        </div>
      </div>
      {view === "galaxy" && <MuleGalaxy />}
      {view === "hypergraph" && <HierarchicalHypergraph />}
      {view === "pairwise" && <NetworkGraph />}
    </div>
  );
}
