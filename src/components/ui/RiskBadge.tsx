"use client";

const RISK_STYLES: Record<string, { className: string; label: string; icon: string }> = {
  critical: { className: "risk-badge-critical", label: "Critical Risk", icon: "●" },
  high: { className: "risk-badge-high", label: "High Risk", icon: "▲" },
  medium: { className: "risk-badge-medium", label: "Medium Risk", icon: "■" },
  low: { className: "risk-badge-low", label: "Low Risk", icon: "◆" },
};

// Unrecognized levels must NOT inherit the green low-risk styling — an
// unknown severity in a fraud tool should read as indeterminate, not safe.
// Uses plain utilities so globals.css needs no extra class.
const UNKNOWN_STYLE = {
  className: "border border-frost/10 bg-surface-2 text-ash",
  label: "Unknown Risk",
  icon: "?",
};

interface RiskBadgeProps {
  level: string;
  /** Replaces the visible level word (e.g. show "new" on a hot-toned badge). */
  displayText?: string;
  /**
   * Accessible name when the tone's default ("High Risk") would misdescribe
   * the content — e.g. a status badge borrowing the high-risk palette must
   * not be announced as "High Risk".
   */
  accessibleLabel?: string;
}

export default function RiskBadge({
  level,
  displayText,
  accessibleLabel,
}: RiskBadgeProps) {
  const style = RISK_STYLES[level.toLowerCase()] || UNKNOWN_STYLE;
  const label = accessibleLabel ?? style.label;
  return (
    <span
      className={`font-mono text-[11px] tracking-[-0.02em] px-2 py-0.5 rounded-sm uppercase ${style.className}`}
      role="img"
      aria-label={label}
      title={label}
    >
      <span className="mr-1" aria-hidden="true">{style.icon}</span>
      {displayText ?? level}
    </span>
  );
}
