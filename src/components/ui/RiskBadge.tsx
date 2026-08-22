"use client";

const RISK_STYLES: Record<string, string> = {
  critical: "bg-bone text-void",
  high: "bg-frost/40 text-bone",
  medium: "bg-ash/40 text-bone",
  low: "bg-charcoal text-ash",
};

export default function RiskBadge({ level }: { level: string }) {
  const style = RISK_STYLES[level] || RISK_STYLES.low;
  return (
    <span className={`font-mono text-[11px] tracking-[-0.02em] px-2 py-0.5 rounded-sm uppercase ${style}`}>
      {level}
    </span>
  );
}
