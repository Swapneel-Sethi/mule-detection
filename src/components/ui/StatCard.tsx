"use client";

import { forwardRef, HTMLAttributes } from "react";

// Pinned locale instead of getUserLocale(): navigator-derived locales made SSR
// and client output diverge (hydration mismatch) and disagreed with sibling
// cards that hardcode "en-IN".
const compactFormatter = new Intl.NumberFormat("en-IN", {
  notation: "compact",
  compactDisplay: "short",
  maximumFractionDigits: 1,
});

interface StatCardProps extends HTMLAttributes<HTMLDivElement> {
  label: string;
  value: string | number;
  sub?: string;
}

const StatCard = forwardRef<HTMLDivElement, StatCardProps>(
  ({ label, value, sub, className = "", ...props }, ref) => {
    const formattedValue = typeof value === "number" ? compactFormatter.format(value) : value;

    return (
      <div
        ref={ref}
        className={`bg-surface-1 border border-frost/10 p-4 rounded-md ${className}`}
        {...props}
      >
        <p className="font-mono text-caption tracking-wide text-ash uppercase mb-1 truncate">{label}</p>
        <p className="font-display text-heading-sm font-normal leading-tight text-bone tracking-tight truncate">
          {formattedValue}
        </p>
        {sub && <p className="font-mono text-caption text-ash mt-1 truncate">{sub}</p>}
      </div>
    );
  }
);

StatCard.displayName = "StatCard";

export default StatCard;
