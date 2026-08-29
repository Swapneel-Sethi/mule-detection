"use client";

import { useState } from "react";
import MuleGalaxy from "@/components/MuleGalaxy";
import NetworkGraph from "@/components/NetworkGraph";
import SankeyGraph from "@/components/SankeyGraph";

export default function GraphPage() {
  const [activeTab, setActiveTab] = useState<"3d" | "2d" | "sankey">("3d");

  return (
    <div className="p-8 max-w-[1500px] mx-auto space-y-6">
      {/* Tab Selector */}
      <div className="flex items-center gap-2 border-b border-border/30 pb-4">
        <button
          onClick={() => setActiveTab("3d")}
          className={`px-4 py-2 rounded-md font-mono text-xs uppercase tracking-wider transition-all font-semibold ${
            activeTab === "3d"
              ? "bg-accent/20 text-accent border border-accent/50 shadow-sm shadow-accent/20"
              : "text-fg-dim hover:text-fg hover:bg-bg-card border border-transparent"
          }`}
        >
          🌌 3D Mule Galaxy
        </button>
        <button
          onClick={() => setActiveTab("2d")}
          className={`px-4 py-2 rounded-md font-mono text-xs uppercase tracking-wider transition-all font-semibold ${
            activeTab === "2d"
              ? "bg-accent/20 text-accent border border-accent/50 shadow-sm shadow-accent/20"
              : "text-fg-dim hover:text-fg hover:bg-bg-card border border-transparent"
          }`}
        >
          🕸️ 2D Network Topology
        </button>
        <button
          onClick={() => setActiveTab("sankey")}
          className={`px-4 py-2 rounded-md font-mono text-xs uppercase tracking-wider transition-all font-semibold ${
            activeTab === "sankey"
              ? "bg-accent/20 text-accent border border-accent/50 shadow-sm shadow-accent/20"
              : "text-fg-dim hover:text-fg hover:bg-bg-card border border-transparent"
          }`}
        >
          🌊 Money Flow Sankey
        </button>
      </div>

      {activeTab === "3d" && <MuleGalaxy />}
      {activeTab === "2d" && <NetworkGraph />}
      {activeTab === "sankey" && <SankeyGraph />}
    </div>
  );
}
