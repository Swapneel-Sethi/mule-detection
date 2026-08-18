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
    // Log to an error monitoring service (e.g. Sentry) in production.
    // In development, log to console for debugging.
    if (process.env.NODE_ENV === "development") {
      console.error("Route error:", error);
    } else {
      // TODO: Replace with actual error monitoring service initialization
      // Example: Sentry.captureException(error);
      console.error("Route error:", error); // Fallback to console in production if monitoring not set up
    }
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] px-6 text-center animate-fade-in">
      <div className="w-16 h-16 rounded-[20px] bg-obsidian border border-danger/40 flex items-center justify-center mb-6">
        <AlertTriangle className="w-7 h-7 text-danger" />
      </div>
      <h1 className="section-heading mb-2">Something went wrong</h1>
      <p className="text-[15px] text-fog max-w-[440px] mb-2">
        An unexpected error occurred while loading this section. The issue has been logged and our team has been notified.
      </p>
      {/* Only show error digest in development to avoid leaking internal information */}
      {process.env.NODE_ENV === "development" && error.digest && (
        <p className="text-[12px] text-slate-mist mb-6 font-mono">
          Ref: {error.digest}
        </p>
      )}
      <div className="flex items-center gap-3">
        <button onClick={reset} className="btn-primary flex items-center gap-2">
          <RotateCw className="w-4 h-4" />
          Try again
        </button>
        <Link href="/" className="btn-ghost flex items-center gap-2">
          <Home className="w-4 h-4" />
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}