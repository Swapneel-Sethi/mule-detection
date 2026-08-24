export default function Loading() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] px-6" role="status" aria-live="polite">
      <div className="w-10 h-10 rounded-full border-2 border-surface-2 border-t-frost animate-spin" />
      <p className="text-[14px] text-ash mt-4">Loading…</p>
    </div>
  );
}
