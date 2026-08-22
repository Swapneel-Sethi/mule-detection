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

export default function FilterBar({ searchValue, onSearchChange, searchPlaceholder = "Search...", filters, children }: FilterBarProps) {
  return (
    <div className="flex items-center gap-3 mb-6">
      <input
        type="text"
        placeholder={searchPlaceholder}
        value={searchValue}
        onChange={(e) => onSearchChange(e.target.value)}
        aria-label="Search"
        className="flex-1 bg-void border border-frost/10 rounded-sm px-3 py-2 font-mono text-[13px] tracking-[-0.02em] text-bone placeholder:text-ash/40 focus-visible:border-frost/30 transition-default"
      />
      {filters?.map((f) => (
        <select
          key={f.label}
          value={f.value}
          onChange={(e) => f.onChange(e.target.value)}
          aria-label={f.label}
          className="bg-void border border-frost/10 rounded-sm px-3 py-2 font-mono text-[13px] tracking-[-0.02em] text-bone appearance-none cursor-pointer focus-visible:border-frost/30 transition-default"
        >
          {f.options.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      ))}
      {children}
    </div>
  );
}
