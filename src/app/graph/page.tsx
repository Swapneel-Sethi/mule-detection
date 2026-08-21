"use client";

import NetworkGraph from "@/components/NetworkGraph";
import SankeyGraph from "@/components/SankeyGraph";

export default function GraphPage() {
  return (
    <div className="space-y-6">
      <NetworkGraph />
      <SankeyGraph />
    </div>
  );
}