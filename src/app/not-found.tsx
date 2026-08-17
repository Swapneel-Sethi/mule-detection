import Link from "next/link";
import { Compass, Home } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] px-6 text-center animate-fade-in">
      <div className="w-16 h-16 rounded-[20px] bg-obsidian border border-chalk flex items-center justify-center mb-6">
        <Compass className="w-7 h-7 text-fog" />
      </div>
      <h1 className="section-heading mb-2">Page not found</h1>
      <p className="text-[15px] text-fog max-w-[440px] mb-6">
        The page you&apos;re looking for doesn&apos;t exist or may have been moved.
      </p>
      <Link href="/" className="btn-primary flex items-center gap-2">
        <Home className="w-4 h-4" />
        Back to dashboard
      </Link>
    </div>
  );
}
