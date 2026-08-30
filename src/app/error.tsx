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
    <div role="alert" className="flex flex-col items-center justify-center min-h-[70vh] px-6 text-center bg-[var(--bg)]">
      <div className="w-16 h-16 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] flex items-center justify-center mb-6">
        <AlertTriangle className="w-7 h-7 text-[var(--accent)]" aria-hidden="true" />
      </div>
      <h1 className="font-display text-heading text-[var(--fg)] mb-2">Something went wrong</h1>
      <p className="text-[15px] text-[var(--fg-dim)] max-w-[440px] mb-2">
        An unexpected error occurred while loading this section.
      </p>
      {/* Only show error digest in development to avoid leaking internal information */}
      {process.env.NODE_ENV === "development" && error.digest && (
        <p className="text-[12px] text-[var(--fg-dim)] mb-6 font-mono">
          Ref: {error.digest}
        </p>
      )}
      <div className="flex items-center gap-3">
        <button
          onClick={() => retry()}
          className="inline-flex items-center gap-2 rounded-sm bg-[var(--bg-card)] px-4 py-2 font-mono text-body font-medium tracking-[-0.02em] text-[var(--fg)] transition-default hover:bg-[var(--bg-darker)]"
        >
          <RotateCw className="w-4 h-4" aria-hidden="true" />
          Try again
        </button>
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-sm border border-[var(--border-light)] bg-transparent px-4 py-2 font-mono text-body font-medium tracking-[-0.02em] text-[var(--fg)] transition-default hover:bg-[var(--bg-card)]"
        >
          <Home className="w-4 h-4" aria-hidden="true" />
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}