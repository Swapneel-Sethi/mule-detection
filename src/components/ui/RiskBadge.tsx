"use client";

const RISK_STYLES: Record<string, { className: string; label: string; icon: string }> = {
  critical: { className: "risk-badge-critical", label: "Critical Risk", icon: "●" },
  high: { className: "risk-badge-high", label: "High Risk", icon: "▲" },
  medium: { className: "risk-badge-medium", label: "Medium Risk", icon: "■" },
  low: { className: "risk-badge-low", label: "Low Risk", icon: "◆" },
};

export default function RiskBadge({ level }: { level: string }) {
  const style = RISK_STYLES[level] || RISK_STYLES.low;
  return (
    <span 
      className={`font-mono text-[11px] tracking-[-0.02em] px-2 py-0.5 rounded-sm uppercase ${style.className}`}
      aria-label={style.label}
      title={style.label}
    >
      <span className="mr-1" aria-hidden="true">{style.icon}</span>
      {level}
    </span>
  );
}
