"use client";

import { ReactNode, useRef, useEffect, useState } from "react";

/**
 * NumberCounter - An animated number counter that counts from 0 to a target value,
 * following the IRONFORGE design system using the project's design tokens.
 *
 * The counter animates smoothly using a frame-based interpolation for a natural
 * counting motion that respects the design system's color and typography tokens.
 *
 * @param props - NumberCounter properties
 * @param props.value - The target number to count up to
 * @param props.prefix - Optional prefix text (e.g., "$", "₹")
 * @param props.suffix - Optional suffix text (e.g., "+", "%")
 * @param props.variant - Visual variant: "default", "success", "warning", "error"
 * @param props.duration - Animation duration in milliseconds (default: 1500)
 * @param props.separator - Thousands separator format (default: ",")
 * @param props.className - Additional CSS classes
 */
interface NumberCounterProps {
  value: number | string;
  prefix?: string;
  suffix?: string;
  variant?: "default" | "success" | "warning" | "error";
  duration?: number;
  separator?: string;
  className?: string;
}

const variantStyles: Record<NumberCounterProps["variant"], string> = {
  default: "text-bone",
  success: "text-risk-low",
  warning: "text-risk-high",
  error: "text-risk-critical",
};

const variantBg: Record<NumberCounterProps["variant"], string> = {
  default: "bg-surface-1",
  success: "bg-risk-low/10",
  warning: "bg-risk-high/10",
  error: "bg-risk-critical/10",
};

const variantBorder: Record<NumberCounterProps["variant"], string> = {
  default: "border-frost/10",
  success: "border-risk-low/20",
  warning: "border-risk-high/20",
  error: "border-risk-critical/20",
};

export default function NumberCounter({
  value,
  prefix,
  suffix,
  variant = "default",
  duration = 1500,
  separator = ",",
  className = "",
}: NumberCounterProps) {
  const [displayValue, setDisplayValue] = useState<string>("0");
  const [isAnimating, setIsAnimating] = useState(true);
  const counterRef = useRef<HTMLDivElement>(null);

  // Parse the value if it's a string
  const numericValue = typeof value === "string" ? parseFloat(value) : Number(value);

  // Format number with separator
  const formatNumber = (num: number): string =>
    num.toLocaleString(undefined, { maximumFractionDigits: 0 }).replace(/,/g, separator);

  // Animate the counter from 0 to target value
  useEffect(() => {
    if (!Number.isFinite(numericValue) || numericValue < 0) {
      setDisplayValue(formatNumber(0));
      setIsAnimating(false);
      return;
    }

    setIsAnimating(true);
    setDisplayValue("0");

    const startTime = performance.now();

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Ease-out curve for natural counting feel
      const easedProgress = 1 - Math.pow(1 - progress, 3);

      const currentValue = Math.floor(numericValue * easedProgress);
      setDisplayValue(formatNumber(currentValue));

      if (progress < 1 && !isNaN(currentTime)) {
        requestAnimationFrame(animate);
      } else {
        setDisplayValue(formatNumber(numericValue));
        setIsAnimating(false);
      }
    };

    requestAnimationFrame(animate);

    return () => {
      // cleanup
    };
  }, [numericValue, duration, separator, isAnimating]);

  const styleClasses = `
    inline-block rounded-md transition-all duration-500
    ${variantBg[variant]} ${variantBorder[variant]}
    ${className}
  `;

  const valueClass = `font-display text-heading-lg font-normal text-bone${variant !== "default" ? " " + variantStyles[variant] : ""}`;

  return (
    <div
      ref={counterRef}
      className={styleClasses}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <span className={valueClass}>{prefix ?? ""}{displayValue}{suffix ?? ""}</span>
    </div>
  );
}

/**
 * NumberCounterGroup - A group of number counters that automatically manages
 * spacing and styling following the IRONFORGE design system.
 */
export function NumberCounterGroup({
  counters,
  className,
}: {
  counters: Array<{
    value: number | string;
    prefix?: string;
    suffix?: string;
    variant?: NumberCounterProps["variant"];
    duration?: number;
    separator?: string;
    className?: string;
  }>;
  className: string;
}) {
  return (
    <div className={`flex flex-col sm:flex-row gap-4 ${className}`}>
      {counters.map((counter, index) => (
        <NumberCounter
          key={counter.value || index}
          value={counter.value}
          prefix={counter.prefix}
          suffix={counter.suffix}
          variant={counter.variant}
          duration={counter.duration}
          separator={counter.separator}
          className={`flex-1 ${counter.className || ""}`}
        />
      ))}
    </div>
  );
}

NumberCounter.displayName = "NumberCounter";
NumberCounterGroup.displayName = "NumberCounterGroup";