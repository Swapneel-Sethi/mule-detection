"use client";

export default function EmptyState({
  message = "No telemetry available",
  description,
}: {
  message?: string;
  description?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-52 text-center p-6 bg-bg-card/40 rounded-lg border border-border/20">
      <div className="w-10 h-10 rounded-full bg-accent/10 border border-accent/30 flex items-center justify-center text-accent text-base mb-3">
        🔍
      </div>
      <p className="font-mono text-[12px] uppercase tracking-wider text-fg font-semibold">{message}</p>
      {description && (
        <p className="font-mono text-[11px] text-fg-dim max-w-sm mt-1">{description}</p>
      )}
    </div>
  );
}
