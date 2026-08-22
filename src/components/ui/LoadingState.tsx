"use client";

export default function LoadingState({ message = "Loading..." }: { message?: string }) {
  return (
    <div className="flex items-center justify-center h-64">
      <p className="font-mono text-[11px] tracking-[-0.02em] text-ash">{message}</p>
    </div>
  );
}
