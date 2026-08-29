"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCw, Home } from "lucide-react";
import Link from "next/link";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Pipeline telemetry error:", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] px-6 text-center">
      <div className="w-16 h-16 rounded-xl bg-risk-critical/10 border border-risk-critical/40 flex items-center justify-center mb-6 shadow-xl text-risk-critical">
        <AlertTriangle className="w-8 h-8 text-risk-critical" />
      </div>
      <h1 className="font-display text-2xl font-bold text-fg mb-2">Forensic Exception Triggered</h1>
      <p className="font-mono text-xs text-fg-dim max-w-md mb-4">
        An anomalous exception occurred while processing telemetry data. The system has automatically isolated the sub-routine.
      </p>
      {error.digest && (
        <p className="font-mono text-[11px] text-accent/80 mb-6 bg-bg-card px-3 py-1 rounded border border-border/20">
          Digest Ref: {error.digest}
        </p>
      )}
      <div className="flex items-center gap-3">
        <button
          onClick={reset}
          className="px-4 py-2 rounded-md bg-accent/20 text-accent border border-accent/40 font-mono text-xs uppercase tracking-wider font-bold hover:bg-accent/30 transition-all flex items-center gap-2"
        >
          <RotateCw className="w-4 h-4" />
          Re-initialize Stream
        </button>
        <Link
          href="/"
          className="px-4 py-2 rounded-md bg-bg-card text-fg border border-border/30 font-mono text-xs uppercase tracking-wider font-medium hover:border-accent/40 transition-all flex items-center gap-2"
        >
          <Home className="w-4 h-4" />
          Dashboard
        </Link>
      </div>
    </div>
  );
}
