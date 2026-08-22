"use client";

export default function EmptyState({ message = "No data available" }: { message?: string }) {
  return (
    <div className="flex items-center justify-center h-48">
      <p className="font-mono text-[11px] tracking-[-0.02em] text-ash">{message}</p>
    </div>
  );
}
