"use client";

interface CardProps {
  children: React.ReactNode;
  className?: string;
}

export default function Card({ children, className = "" }: CardProps) {
  return (
    <div className={`bg-bg-card/90 border border-border/30 rounded-lg p-5 shadow-lg backdrop-blur-sm transition-all duration-200 hover:border-border/60 ${className}`}>
      {children}
    </div>
  );
}

export function CardTitle({ children, subtitle }: { children: React.ReactNode; subtitle?: string }) {
  return (
    <div className="mb-4">
      <h3 className="font-display text-[14px] font-semibold tracking-wider text-fg uppercase flex items-center gap-2">
        <span className="w-1.5 h-3.5 bg-accent rounded-sm inline-block" />
        {children}
      </h3>
      {subtitle && (
        <p className="font-mono text-[11px] text-fg-dim mt-1 pl-3.5">{subtitle}</p>
      )}
    </div>
  );
}
