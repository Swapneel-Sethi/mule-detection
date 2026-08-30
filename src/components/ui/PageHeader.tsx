"use client";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}

export default function PageHeader({ title, subtitle, action }: PageHeaderProps) {
  return (
    <div className="mb-8">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-display text-heading font-normal leading-[1] text-[var(--fg)] tracking-tight">{title}</h1>
        {action}
      </div>
      <div className="h-px bg-[var(--border)] w-24 mt-3 mb-2" />
      {subtitle && (
        <p className="font-mono text-caption tracking-[-0.02em] text-[var(--muted)] uppercase">{subtitle}</p>
      )}
    </div>
  );
}
