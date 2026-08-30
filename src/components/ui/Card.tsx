"use client";

import { forwardRef, HTMLAttributes } from "react";

export type HeadingLevel = "h1" | "h2" | "h3" | "h4" | "h5" | "h6";

type CardProps = HTMLAttributes<HTMLDivElement>;

const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ children, className = "", ...props }, ref) => (
    <div
      ref={ref}
      className={`bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-4 ${className}`}
      {...props}
    >
      {children}
    </div>
  )
);

Card.displayName = "Card";

export default Card;

export function CardTitle({ children, as: Tag = "h2" }: { children: React.ReactNode; as?: HeadingLevel }) {
  // Default h2 keeps heading order valid under each page's <h1> (WCAG 1.3.1);
  // callers can raise it with `as="h3"` etc. where the section nests deeper.
  return (
    <Tag className="font-display text-body tracking-[-0.02em] text-[var(--fg)] mb-4">{children}</Tag>
  );
}