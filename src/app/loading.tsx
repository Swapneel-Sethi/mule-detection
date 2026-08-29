export default function Loading() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] px-6 gap-4">
      <div className="relative w-12 h-12">
        <div className="absolute inset-0 rounded-full border-2 border-accent/20 border-t-accent animate-spin" />
        <div className="absolute inset-2 rounded-full border-2 border-risk-critical/20 border-b-risk-critical animate-spin" style={{ animationDirection: "reverse" }} />
      </div>
      <p className="font-mono text-xs uppercase tracking-widest text-fg-dim animate-pulse font-medium">
        Loading IronForge Telemetry…
      </p>
    </div>
  );
}
