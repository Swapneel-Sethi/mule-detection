"use client";

export default function SankeyGraph() {
  return (
    <div className="w-full">
      <iframe
        src="/graphs/sankey_money_flow.html"
        title="Mule Account Money Flow Sankey Diagram"
        className="w-full border-0"
        style={{ height: "750px" }}
      />
    </div>
  );
}