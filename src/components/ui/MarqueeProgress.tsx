"use client";

import { ReactNode, useRef, useEffect, useState } from "react";

/**
 * MarqueeProgress - A horizontal marquee progress indicator
 * following the IRONFORGE design system tokens and patterns.
 *
 * Usage:
 *  <MarqueeProgress progress={75} className="w-48" />
 *  <MarqueeProgress progress={50} size="md" variant="success" />
 */
interface MarqueeProgressProps {
  /** Progress percentage (0-100) */
  progress: number;
  /** Size variant: "sm" | "md" | "lg" */
  size?: "sm" | "md" | "lg";
  /** Visual variant: "default" | "success" | "warning" | "error" */
  variant?: "default" | "success" | "warning" | "error";
  /** Additional CSS classes */
  className?: string;
}

/**
 * Size mapping for the progress bar height
 */
const SIZE_CLASSES: Record<string, string> = {
  sm: "h-2",
  md: "h-4",
  lg: "h-6",
};

/**
 * Variant background colors using IRONFORGE design tokens
 */
const VARIANT_BG_CLASSES: Record<string, string> = {
  default: "bg-[var(--color-surface-2)]",
  success: "bg-[var(--color-risk-low)]",
  warning: "bg-[var(--color-risk-medium)]",
  error: "bg-[var(--color-risk-critical)]",
};

/**
 * MarqueeProgress - Marquee-style progress bar that animates from right to left.
 * Uses CSS custom properties (design tokens) for theming and Tailwind transition classes.
 */
export default function MarqueeProgress({
  progress,
  size = "sm",
  variant = "default",
  className = "",
}: MarqueeProgressProps) {
  const [animatedProgress, setAnimatedProgress] = useState(0);
  const marqueeRef = useRef<HTMLDivElement>(null);

  // Start animation on mount
  useEffect(() => {
    let cancelled = false;

    const marquee = marqueeRef.current;
    if (!marquee) return;

    // Initial setup - hide off-screen, then animate
    marquee.style.transition = "none";
    marquee.style.transform = "translateX(0)";
    marquee.offsetWidth; // trigger repaint
    marquee.style.transition = "transform 2s linear";
    marquee.style.transform = "translateX(-100%)";

    // Reset and repeat
    const reset = () => {
      if (!marqueeRef.current) return;
      marqueeRef.current.style.transition = "none";
      marqueeRef.current.style.transform = "translateX(0)";
      marqueeRef.current.offsetWidth;
      marqueeRef.current.style.transition = "transform 2s linear";
      marqueeRef.current.style.transform = "translateX(-100%)";
    };

    // Reset at the end of each cycle
    const interval = setInterval(reset, 2200);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const progressPercent = Math.min(Math.max(progress, 0), 100);

  // Build className string without template literals with computed properties
  const sizeClass = SIZE_CLASSES[size];
  const variantBgClass = VARIANT_BG_CLASSES[variant];

  const baseClasses = [
    "relative",
    "w-full",
    "overflow-hidden",
    "rounded-sm",
    sizeClass,
    "transition-colors",
    "duration-300",
    className,
  ]
    .filter((c): c is string => !!c)
    .join(" ");

  const allClasses = [baseClasses, variantBgClass]
    .filter((c): c is string => !!c)
    .join(" ");

  return (
    <div
      ref={marqueeRef}
      className={allClasses}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progressPercent)}
      aria-label={`Progress: ${progressPercent}%`}
    >
      {/* Moving gradient indicator */}
      <div
        className="
        absolute
        inset-0
        bg-gradient-to-r
        from-transparent
        via-[var(--fg)]/20
        to-transparent
        transform
        transition-transform
        duration-1.5s
        linear
        ease-out
        will-change-transform
        "
      />
    </div>
  );
}