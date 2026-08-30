"use client";

import React, { forwardRef, useState, useEffect } from "react";

interface FlipCardProps extends React.HTMLAttributes<HTMLDivElement> {
  front: React.ReactNode;
  back: React.ReactNode;
  direction?: "horizontal" | "vertical";
  autoplayInterval?: number;
  swapped?: boolean;
}

function FlipCardInner({
  front,
  back,
  direction = "horizontal",
  autoplayInterval = 0,
  swapped = false,
  className = "",
  ...props
}: FlipCardProps) {
  const [isFlipped, setIsFlipped] = useState(false);

  useEffect(() => {
    if (autoplayInterval > 0) {
      const timer = setInterval(() => {
        setIsFlipped((prev) => !prev);
      }, autoplayInterval);
      return () => clearInterval(timer);
    }
  }, [autoplayInterval]);

  const effectiveSwapped = swapped ? !isFlipped : isFlipped;

  // Build front face class
  let frontClass = "front face";
  if (effectiveSwapped) {
    frontClass += " flipped";
  }

  // Build back face class
  let backClass = "back face";
  if (!effectiveSwapped) {
    backClass += " flipped";
  }
  if (direction === "vertical") {
    backClass += " rotate-y-180";
  } else {
    backClass += " rotate-x-180";
  }

  return React.createElement(
    "div",
    {
      className:
        "relative w-full max-w-sm group " + (className || ""),
      ...props,
    },
    React.createElement(
      "div",
      { className: "aspect-square w-full overflow-hidden rounded-md bg-[var(--bg-card)] border border-[var(--border-light)]" },
      React.createElement(
        "div",
        { className: "backface-hidden transition-transform duration-700 transform-style-preserve-3d" },
        React.createElement(
          "div",
          { className: frontClass },
          front
        ),
        React.createElement(
          "div",
          { className: backClass },
          back
        )
      )
    ),

    React.createElement(
      "div",
      {
        className:
          "group-hover:rotate-y-180 group-hover:transition-transform group-hover:duration-700 group-hover:transform-style-preserve-3d cursor-pointer absolute inset-0",
        onClick: () => setIsFlipped((prev) => !prev),
      }
    )
  );
}

const FlipCard = forwardRef<HTMLDivElement, FlipCardProps>(FlipCardInner);

FlipCard.displayName = "FlipCard";

export default FlipCard;