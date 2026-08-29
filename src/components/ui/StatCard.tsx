"use client";

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  trend?: "up" | "down" | "neutral";
  variant?: "default" | "critical" | "warning" | "success";
}

export default function StatCard({ label, value, sub, variant = "default" }: StatCardProps) {
  const variantStyles = {
    default: "border-border/30 hover:border-border/60",
    critical: "border-risk-critical/40 bg-risk-critical/5 hover:border-risk-critical/70",
    warning: "border-risk-high/40 bg-risk-high/5 hover:border-risk-high/70",
    success: "border-risk-low/40 bg-risk-low/5 hover:border-risk-low/70",
  };

  const textVariant = {
    default: "text-fg",
    critical: "text-risk-critical",
    warning: "text-risk-high",
    success: "text-risk-low",
  };

  return (
    <div className={`bg-bg-card/90 border rounded-lg p-4.5 shadow-md backdrop-blur-sm transition-all duration-200 ${variantStyles[variant]}`}>
      <p className="font-mono text-[10px] uppercase tracking-wider text-fg-dim mb-2 font-medium">{label}</p>
      <p className={`font-display text-[26px] font-bold leading-tight tracking-tight ${textVariant[variant]}`}>
        {typeof value === "number" ? value.toLocaleString("en-IN") : value}
      </p>
      {sub && <p className="font-mono text-[11px] text-fg-dim mt-1.5 flex items-center gap-1.5 font-medium">{sub}</p>}
    </div>
  );
}
