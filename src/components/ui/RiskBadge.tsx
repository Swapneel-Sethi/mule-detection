"use client";

const RISK_STYLES: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  critical: {
    bg: "bg-risk-critical/15",
    text: "text-risk-critical",
    border: "border-risk-critical/40",
    dot: "bg-risk-critical",
  },
  high: {
    bg: "bg-risk-high/15",
    text: "text-risk-high",
    border: "border-risk-high/40",
    dot: "bg-risk-high",
  },
  medium: {
    bg: "bg-risk-medium/15",
    text: "text-risk-medium",
    border: "border-risk-medium/40",
    dot: "bg-risk-medium",
  },
  low: {
    bg: "bg-risk-low/15",
    text: "text-risk-low",
    border: "border-risk-low/40",
    dot: "bg-risk-low",
  },
};

export default function RiskBadge({ level, showDot = true }: { level: string; showDot?: boolean }) {
  const normLevel = (level || "low").toLowerCase();
  const config = RISK_STYLES[normLevel] || RISK_STYLES.low;

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-mono text-[10px] uppercase font-bold px-2.5 py-0.5 rounded border tracking-wider ${config.bg} ${config.text} ${config.border}`}
    >
      {showDot && <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />}
      {level}
    </span>
  );
}
