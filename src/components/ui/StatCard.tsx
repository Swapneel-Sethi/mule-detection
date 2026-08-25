"use client";

import { formatNumber } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  trend?: { value: number; label: string; positive?: boolean };
  variant?: "default" | "compact" | "highlight";
  icon?: React.ReactNode;
  className?: string;
}

export default function StatCard({ 
  label, 
  value, 
  sub, 
  trend,
  variant = "default",
  icon,
  className = ""
}: StatCardProps) {
  const formattedValue = typeof value === "number" ? formatNumber(value) : value;

  // When the caller omits `positive`, infer direction from the sign so an
  // unspecified flag doesn't silently render every trend as a red decline.
  const trendPositive = trend ? (trend.positive ?? trend.value >= 0) : false;

  const variantStyles = {
    default: "bg-surface-1 border border-frost/10",
    compact: "bg-surface-1 border border-frost/10",
    highlight: "bg-surface-2 border border-frost/20",
  };

  const paddingStyles = {
    default: "p-4",
    compact: "p-3",
    highlight: "p-5",
  };

  return (
    <div className={`${variantStyles[variant]} ${paddingStyles[variant]} rounded-md ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-mono text-caption tracking-wide text-ash uppercase mb-1 truncate">{label}</p>
          <p className="font-display text-heading-sm font-normal leading-tight text-bone tracking-tight truncate">
            {formattedValue}
          </p>
          {sub && <p className="font-mono text-caption text-ash mt-1 truncate">{sub}</p>}
          {trend && (
            <p className={`font-mono text-caption mt-2 flex items-center gap-1 ${trendPositive ? "text-risk-low" : "text-risk-critical"}`}>
              <span aria-hidden="true">{trendPositive ? "▲" : "▼"}</span>
              <span>{Math.abs(trend.value).toFixed(1)}%</span>
              <span className="text-ash">{trend.label}</span>
            </p>
          )}
        </div>
        {icon && (
          <div className="flex-shrink-0 text-ash/30" aria-hidden="true">
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}