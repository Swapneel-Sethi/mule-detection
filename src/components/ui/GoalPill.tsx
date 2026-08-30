"use client";

/**
 * GoalPill - A pill-shaped goal/achievement display component following the
 * IRONFORGE design system using the project's design tokens.
 *
 * Pills are compact, rounded components that display a short label or status.
 * They follow the IRONFORGE design token system (--bg, --bg-card, --fg, --fg-dim, --accent, --border, --border-light)
 * and semantic risk colors mapped to IRONFORGE accent variations for visual consistency across the UI.
 *
 * @param props - GoalPill properties
 * @param props.label - The text label to display inside the pill
 * @param props.variant - Visual variant: "default", "critical", "high", "medium", "low"
 * @param props.size - Size variant: "sm" (small), "md" (medium), "lg" (large)
 * @param props.className - Additional CSS classes
 */
interface GoalPillProps {
  label: string;
  variant?:
    | "default"
    | "critical"
    | "high"
    | "medium"
    | "low";
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeClasses: Record<"sm" | "md" | "lg", string> = {
  sm: "h-6 px-2 text-[10px]",
  md: "h-8 px-3 text-[11px]",
  lg: "h-10 px-4 text-[12px]",
};

const variantClasses: Record<"default" | "critical" | "high" | "medium" | "low", string> = {
  default: "bg-[var(--bg-card)] text-[var(--fg)] border border-[var(--border-light)]",
  critical: "bg-[var(--accent)]/15 text-[var(--accent)] border border-[var(--accent)]/20",
  high: "bg-[var(--accent-bright)]/15 text-[var(--accent-bright)] border border-[var(--accent-bright)]/20",
  medium: "bg-[var(--fg-dim)]/15 text-[var(--fg-dim)] border border-[var(--fg-dim)]/20",
  low: "bg-[var(--muted)]/15 text-[var(--muted)] border border-[var(--muted)]/20",
};

export default function GoalPill({
  label,
  variant = "default",
  size = "md",
  className = "",
}: GoalPillProps) {
  const sizeStyle = sizeClasses[size];
  const variantClass = variantClasses[variant];

  return (
    <span
      className={`inline-flex items-center rounded-full ${sizeStyle} ${variantClass} ${className}`}
    >
      {label}
    </span>
  );
}

/**
 * GoalPillGroup - A group of GoalPill components that automatically spaces
 * pills evenly with consistent styling.
 */
export function GoalPillGroup({
  pills,
  className,
}: {
  pills: Array<{ label: string; variant?: GoalPillProps["variant"] }>;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-wrap gap-2 ${className}`}
    >
      {pills.map((pill) => (
        <GoalPill key={pill.label} label={pill.label} variant={pill.variant} />
      ))}
    </div>
  );
}