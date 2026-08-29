"use client";

import Card, { CardTitle } from "@/components/ui/Card";
import SankeyChart from "@/components/SankeyChart";

export default function SankeyGraph() {
  return (
    <Card className="p-6">
      <CardTitle subtitle="Multi-hop money laundering corridor flow analysis across Fan-In, Fan-Out, Layering & Circular loops">
        Money Flow Sankey Visualization
      </CardTitle>
      <div className="w-full mt-4 rounded-lg overflow-hidden border border-border/30 bg-bg-surface/50 p-2">
        <SankeyChart />
      </div>
    </Card>
  );
}
