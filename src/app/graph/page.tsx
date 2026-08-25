"use client";

import { useState } from "react";
import MuleGalaxy from "@/components/MuleGalaxy";
import FundFlowInvestigator from "@/components/FundFlowInvestigator";

type GraphMode = "case-file" | "constellation";

export default function GraphPage() {
  const [mode, setMode] = useState<GraphMode>("case-file");

  return (
    <div>
      <div className="mb-4 flex justify-center">
        <div className="flex items-center gap-1 rounded-sm border border-frost/10 bg-surface-1 p-1">
          {(
            [
              ["case-file", "CASE FILE — FUND FLOW"],
              ["constellation", "RISK CONSTELLATION 3D"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setMode(value)}
              className={`rounded-[2px] px-4 py-1.5 font-mono text-[10px] tracking-wide ${mode === value ? "bg-frost text-void" : "text-ash hover:text-bone"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {mode === "case-file" ? <FundFlowInvestigator /> : <MuleGalaxy />}
    </div>
  );
}
