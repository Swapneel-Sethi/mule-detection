"use client";

interface SkeletonProps {
  className?: string;
  variant?: "text" | "card" | "table" | "chart";
}

export default function Skeleton({ className = "", variant = "text" }: SkeletonProps) {
  const baseClass = "animate-pulse bg-surface-2 rounded-sm";
  
  const variantClasses = {
    text: "h-4 w-3/4",
    card: "aspect-square w-full",
    table: "h-10 w-full",
    chart: "aspect-video w-full",
  };

  return (
    <div className={`${baseClass} ${variantClasses[variant]} ${className}`} aria-hidden="true" />
  );
}

export function SkeletonGroup({ count = 3, variant = "card", className = "" }: { count?: number; variant?: "text" | "card" | "table" | "chart"; className?: string }) {
  return (
    <div className={`grid gap-4 ${className}`} role="status" aria-label="Loading content">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} variant={variant} />
      ))}
    </div>
  );
}