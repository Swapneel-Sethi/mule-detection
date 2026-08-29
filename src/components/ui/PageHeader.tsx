"use client";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  badge?: string;
}

export default function PageHeader({ title, subtitle, action, badge }: PageHeaderProps) {
  return (
    <div className="mb-8 border-b border-border/25 pb-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-display text-[28px] font-bold tracking-tight text-fg">{title}</h1>
            {badge && (
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-semibold uppercase tracking-wider bg-accent/15 text-accent border border-accent/40">
                {badge}
              </span>
            )}
          </div>
          {subtitle && (
            <p className="font-mono text-[11px] tracking-wider text-fg-dim uppercase mt-1.5 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-accent/60" />
              {subtitle}
            </p>
          )}
        </div>
        {action && <div className="flex items-center gap-3">{action}</div>}
      </div>
    </div>
  );
}
