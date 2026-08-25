"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCw, Home } from "lucide-react";
import Link from "next/link";

export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    // Log to an error monitoring service (e.g. Sentry) in production;
    // console is the fallback until one is wired up.
    console.error("Route error:", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] px-6 text-center">
      <div className="w-16 h-16 rounded-lg bg-surface-1 border border-risk-critical/40 flex items-center justify-center mb-6">
        <AlertTriangle className="w-7 h-7 text-risk-critical" aria-hidden="true" />
      </div>
      <h1 className="font-display text-heading text-bone mb-2">Something went wrong</h1>
      <p className="text-[15px] text-ash max-w-[440px] mb-2">
        An unexpected error occurred while loading this section.
      </p>
      {/* Only show error digest in development to avoid leaking internal information */}
      {process.env.NODE_ENV === "development" && error.digest && (
        <p className="text-[12px] text-ash/70 mb-6 font-mono">
          Ref: {error.digest}
        </p>
      )}
      <div className="flex items-center gap-3">
        <button
          onClick={() => retry()}
          className="inline-flex items-center gap-2 rounded-sm bg-frost px-4 py-2 font-mono text-body font-medium tracking-[-0.02em] text-void transition-default hover:bg-frost/80"
        >
          <RotateCw className="w-4 h-4" aria-hidden="true" />
          Try again
        </button>
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-sm border border-frost/20 bg-transparent px-4 py-2 font-mono text-body font-medium tracking-[-0.02em] text-bone transition-default hover:bg-surface-1"
        >
          <Home className="w-4 h-4" aria-hidden="true" />
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
