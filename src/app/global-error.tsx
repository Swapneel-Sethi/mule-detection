"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Global runtime error:", error);
  }, [error]);

  return (
    <html lang="en" className="h-full bg-[#070b14] text-[#f1f5f9]">
      <body className="min-h-full flex items-center justify-center p-6 font-mono">
        <div className="flex flex-col items-center justify-center max-w-lg text-center p-8 rounded-xl bg-[#0d1527] border border-[rgba(125,180,255,0.2)] shadow-2xl">
          <div className="w-16 h-16 rounded-xl bg-[rgba(239,69,98,0.15)] border border-[rgba(239,69,98,0.4)] flex items-center justify-center mb-6 text-[#ef4562]">
            <AlertTriangle className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Global System Error</h1>
          <p className="text-xs text-[#94a3b8] mb-6">
            A critical fault was encountered at root level. Reset the application context to resume operations.
          </p>
          <button
            onClick={reset}
            className="px-5 py-2.5 rounded-md bg-[rgba(56,189,248,0.2)] text-[#38bdf8] border border-[rgba(56,189,248,0.4)] text-xs uppercase tracking-wider font-bold hover:bg-[rgba(56,189,248,0.3)] transition-all flex items-center gap-2"
          >
            <RotateCw className="w-4 h-4" />
            Restart Application
          </button>
        </div>
      </body>
    </html>
  );
}
