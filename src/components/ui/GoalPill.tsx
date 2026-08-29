"use client";

/**
 * GoalPill - A pill-shaped goal/achievement display component following the
 * IRONFORGE design system using the project's design tokens.
 *
 * Pills are compact, rounded components that display a short label or status.
 * They follow the design token system (void, bone, charcoal, frost, ash)
 * and semantic risk colors for visual consistency across the UI.
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
  default: "bg-surface-2 text-bone border border-frost/10",
  critical: "bg-risk-critical/15 text-risk-critical border border-risk-critical/20",
  high: "bg-risk-high/15 text-risk-high border border-risk-high/20",
  medium: "bg-risk-medium/15 text-risk-medium border border-risk-medium/20",
  low: "bg-risk-low/15 text-risk-low border border-risk-low/20",
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