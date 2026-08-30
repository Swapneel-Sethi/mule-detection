"use client";

export default function Loading() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] px-6" role="status">
      <div className="w-10 h-10 rounded-full border-2 border-[var(--border)] border-t-[var(--accent)] animate-spin" />
      <p className="text-[14px] text-[var(--fg-dim)] mt-4">Loading…</p>
    </div>
  );
}