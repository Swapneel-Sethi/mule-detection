"use client";

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  variant?: "default" | "compact";
}

export default function StatCard({ label, value, sub, variant = "default" }: StatCardProps) {
  return (
    <div className="bg-surface-1 border border-frost/10 rounded-lg p-4">
      <p className="font-mono text-[11px] tracking-[-0.02em] text-ash uppercase mb-2">{label}</p>
      <p className="font-display text-[28px] font-normal leading-[1] text-bone tracking-tight">
        {typeof value === "number" ? value.toLocaleString("en-IN") : value}
      </p>
      {sub && <p className="font-mono text-[11px] tracking-[-0.02em] text-ash mt-1">{sub}</p>}
    </div>
  );
}
