export default function Loading() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] px-6">
      <div className="w-10 h-10 rounded-full border-2 border-graphite border-t-signal-green animate-spin" />
      <p className="text-[14px] text-fog mt-4">Loading…</p>
    </div>
  );
}
