import Link from "next/link";
import { Compass, Home } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] px-6 text-center">
      <div className="w-16 h-16 rounded-lg bg-surface-1 border border-surface-2 flex items-center justify-center mb-6">
        <Compass className="w-7 h-7 text-ash" />
      </div>
      <h1 className="font-display text-heading text-bone mb-2">Page not found</h1>
      <p className="text-[15px] text-ash max-w-[440px] mb-6">
        The page you&apos;re looking for doesn&apos;t exist or may have been moved.
      </p>
      <Link
        href="/"
        className="inline-flex items-center gap-2 rounded-sm bg-frost px-4 py-2 font-mono text-body font-medium tracking-[-0.02em] text-void transition-default hover:bg-frost/80"
      >
        <Home className="w-4 h-4" aria-hidden="true" />
        Back to dashboard
      </Link>
    </div>
  );
}
