"use client";

import { ReactNode, useRef, useEffect, useState } from "react";

/**
 * CoachMark - A coach mark/onboarding component following the IRONFORGE design system.
 *
 * Displays a guided tour step with an arrow pointer and optional content.
 * Features a flip animation when the user dismisses or advances through the tour.
 *
 * @param props - CoachMark properties
 * @param props.content - The coach mark content to display
 * @param props.target - CSS selector or DOM element to point to
 * @param props.variant - Visual variant: "default", "success", "warning", "error"
 * @param props.showDismiss - Whether to show the dismiss button (default: true)
 * @param props.className - Additional CSS classes
 */
interface CoachMarkProps {
  content: ReactNode;
  target?: string | HTMLElement;
  variant?: "default" | "success" | "warning" | "error";
  showDismiss?: boolean;
  className?: string;
}

const variantClasses: Record<string, string> = {
  default: "bg-void text-bone",
  success: "bg-risk-low text-bone",
  warning: "bg-risk-high text-bone",
  error: "bg-risk-critical text-bone",
};

export default function CoachMark({
  content,
  target,
  variant = "default",
  showDismiss = true,
  className = "",
}: CoachMarkProps) {
  const [isFlipped, setIsFlipped] = useState(false);
  const mountRef = useRef<HTMLDivElement>(null);

  // Handle flip animation
  useEffect(() => {
    if (isFlipped) {
      const marqueeRef = mountRef.current;
      if (marqueeRef) {
        marqueeRef.style.transition = "none";
        marqueeRef.offsetWidth; // trigger repaint
        marqueeRef.style.transition = "transform 1.5s linear";
        marqueeRef.style.transform = "rotateY(180deg)";
      }
    }
  }, [isFlipped]);

  // Dismiss handler
  const handleDismiss = () => {
    setIsFlipped(true);
  };

  const variantClass = variantClasses[variant];
  const baseClasses = "relative inline-block rounded-lg shadow-lg text-base py-3 px-6";

  return (
    <div
      ref={mountRef}
      className={baseClasses + " " + variantClass + (className ? " " + className : "")}
    >
      {/* Coach mark card with flip animation */}
      <div
        className="
          absolute inset-0
          backface-hidden
          transition-transform
          duration-700
          transform-style-preserve-3d
        "
      >
        <div className="front face">
          {/* Pointer arrow */}
          <div
            className="
              absolute
              top-[-12px]
              left-1/2
              -translate-x-1/2
              border-l-4 border-b-4 border-transparent border-b-black/20
              border-top-color: currentColor
            "
          />
          {/* Content overlay */}
          <div className="relative z-10 p-6">
            {content}
          </div>
        </div>
        <div
          className={
            "back face " + (isFlipped ? "" : "rotate-y-180")
          }
        >
          {/* Dismiss or continue content */}
          <div className="relative p-6 text-center">
            {showDismiss ? (
              <button
                onClick={handleDismiss}
                className="
                  bg-frost/20 hover:bg-frost/30 text-bone rounded-full p-2
                  transition-colors duration-200
                  focus:outline-none focus:ring-2 focus:ring-frost focus:ring-offset-2
                "
              >
                ✕
              </button>
            ) : (
              <span className="text-ash/60 small">Continue →</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * CoachMarkGroup - A group of CoachMark components that automatically spaces
 * coach marks with consistent styling.
 */
export function CoachMarkGroup({
  marks,
  className,
}: {
  marks: Array<{
    id: string;
    content: ReactNode;
    target?: string | HTMLElement;
    variant?: "default" | "success" | "warning" | "error";
    onDismiss?: () => void;
    className?: string;
  }>;
  className?: string;
}) {
  return (
    <div
      className="
        flex flex-col gap-4
      "
    >
      {marks.map((mark) => (
        <CoachMark
          key={mark.id}
          content={mark.content}
          target={mark.target}
          variant={mark.variant ?? "default"}
          showDismiss={!!mark.onDismiss}
          className={mark.className ?? ""}
        />
      ))}
    </div>
  );
}

CoachMark.displayName = "CoachMark";