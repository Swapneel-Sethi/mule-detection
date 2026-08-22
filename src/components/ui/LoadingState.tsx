"use client";

import Skeleton, { SkeletonGroup } from "./Skeleton";

interface LoadingStateProps {
  message?: string;
  variant?: "full" | "inline" | "skeleton";
  skeletonCount?: number;
  skeletonVariant?: "text" | "card" | "table" | "chart";
}

export default function LoadingState({ 
  message = "Loading...", 
  variant = "full",
  skeletonCount = 3,
  skeletonVariant = "card"
}: LoadingStateProps) {
  if (variant === "skeleton") {
    return <SkeletonGroup count={skeletonCount} variant={skeletonVariant} />;
  }

  if (variant === "inline") {
    return (
      <div className="flex items-center gap-3 py-4" role="status" aria-label={message}>
        <svg className="animate-spin h-5 w-5 text-ash" viewBox="0 0 24 24" aria-hidden="true">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
        <span className="font-mono text-caption text-ash">{message}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-12" role="status" aria-label={message}>
      <svg className="animate-spin h-8 w-8 text-ash" viewBox="0 0 24 24" aria-hidden="true">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
      </svg>
      <p className="font-mono text-caption text-ash">{message}</p>
    </div>
  );
}