import Link from "next/link";
import { Compass, Home } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] px-6 text-center">
      <div className="w-16 h-16 rounded-xl bg-bg-card border border-border/30 flex items-center justify-center mb-6 shadow-xl text-accent">
        <Compass className="w-8 h-8 text-accent animate-pulse" />
      </div>
      <h1 className="font-display text-2xl font-bold text-fg mb-2">404 — Surveillance Coordinate Not Found</h1>
      <p className="font-mono text-xs text-fg-dim max-w-md mb-6">
        The requested account, corridor, or forensic page does not exist in the active graph cluster.
      </p>
      <Link
        href="/"
        className="px-4 py-2 rounded-md bg-accent/20 text-accent border border-accent/40 font-mono text-xs uppercase tracking-wider font-bold hover:bg-accent/30 transition-all flex items-center gap-2"
      >
        <Home className="w-4 h-4" />
        Return to Operations Hub
      </Link>
    </div>
  );
}
