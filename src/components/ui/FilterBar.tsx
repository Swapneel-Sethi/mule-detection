"use client";

interface FilterOption {
  value: string;
  label: string;
}

interface FilterBarProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  filters?: { value: string; onChange: (value: string) => void; options: FilterOption[]; label: string }[];
  children?: React.ReactNode;
}

export default function FilterBar({ searchValue, onSearchChange, searchPlaceholder = "Search accounts / transactions...", filters, children }: FilterBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 mb-6 p-3 rounded-lg border border-border/30 bg-bg-card/70 backdrop-blur-sm shadow-md">
      <div className="relative flex-1 min-w-[240px]">
        <input
          type="text"
          placeholder={searchPlaceholder}
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          aria-label="Search"
          className="w-full bg-bg-surface border border-border/30 rounded-md px-3.5 py-2 font-mono text-[12px] tracking-tight text-fg placeholder:text-fg-dim/50 focus:border-accent/70 focus:ring-1 focus:ring-accent/30 outline-none transition-all"
        />
        {searchValue && (
          <button
            onClick={() => onSearchChange("")}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 font-mono text-xs text-fg-dim hover:text-fg"
          >
            ✕
          </button>
        )}
      </div>

      {filters?.map((f) => (
        <div key={f.label} className="relative">
          <select
            value={f.value}
            onChange={(e) => f.onChange(e.target.value)}
            aria-label={f.label}
            className="bg-bg-surface border border-border/30 rounded-md px-3.5 py-2 font-mono text-[12px] tracking-tight text-fg appearance-none cursor-pointer pr-8 focus:border-accent/70 focus:ring-1 focus:ring-accent/30 outline-none transition-all"
          >
            {f.options.map((opt) => (
              <option key={opt.value} value={opt.value} className="bg-bg-card text-fg">
                {opt.label}
              </option>
            ))}
          </select>
          <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 font-mono text-[10px] text-fg-dim">
            ▼
          </div>
        </div>
      ))}
      {children}
    </div>
  );
}
