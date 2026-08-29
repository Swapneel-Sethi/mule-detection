"use client";

export default function LoadingState({ message = "Processing forensic pipeline..." }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-64 gap-3 bg-bg-card/40 rounded-lg border border-border/20 p-8">
      <div className="relative w-10 h-10">
        <div className="absolute inset-0 rounded-full border-2 border-accent/20 border-t-accent animate-spin" />
        <div className="absolute inset-2 rounded-full border-2 border-risk-critical/20 border-b-risk-critical animate-spin" style={{ animationDirection: "reverse" }} />
      </div>
      <p className="font-mono text-[11px] uppercase tracking-wider text-fg-dim font-medium animate-pulse">{message}</p>
    </div>
  );
}
