"use client";

import { useId } from "react";
import { Button } from "./Button";

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterConfig {
  key?: string;
  label: string;
  value: string;
  /** Value meaning "no filtering". Defaults to the first option (e.g. "all"). */
  defaultValue?: string;
  onChange: (value: string) => void;
  options: FilterOption[];
}

export interface FilterBarProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  filters?: FilterConfig[];
  children?: React.ReactNode;
  className?: string;
  showClear?: boolean;
  onClear?: () => void;
}

/** One labelled select. Kept as its own component so each can call useId(). */
function FilterSelect({ filter }: { filter: FilterConfig }) {
  const id = useId();

  return (
    <div className="relative flex items-center">
      <label htmlFor={id} className="sr-only">
        {filter.label}
      </label>
      <select
        id={id}
        value={filter.value}
        onChange={(e) => filter.onChange(e.target.value)}
        aria-label={filter.label}
        className="bg-[var(--bg-card)] border border-[var(--border)] rounded-sm px-3 py-2 pr-8 font-mono text-body text-[var(--fg)] appearance-none cursor-pointer focus-visible:border-[var(--border-light)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--fg)] transition-default"
      >
        {filter.options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      {/* appearance-none removes the native arrow — draw our own in the reserved pr-8 space */}
      <svg className="absolute right-2 w-4 h-4 text-[var(--muted)]/40 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 9l-7 7-7-7" />
      </svg>
    </div>
  );
}

export default function FilterBar({
  searchValue,
  onSearchChange,
  searchPlaceholder = "Search...",
  filters,
  children,
  className = "",
  showClear = false,
  onClear,
}: FilterBarProps) {
  const searchId = useId();
  // A filter counts as active once its value differs from its reset value
  // ("defaultValue", else the first option — consumers reset to "all", not "").
  const hasActiveFilters =
    filters?.some((f) => f.value !== (f.defaultValue ?? f.options[0]?.value)) ||
    searchValue !== "";

  return (
    <div className={`flex flex-wrap items-center gap-3 mb-6 ${className}`} role="search" aria-label="Filter and search">
      <label htmlFor={searchId} className="sr-only">
        Search
      </label>
      <div className="relative flex-1 min-w-[200px]">
        <input
          id={searchId}
          type="search"
          placeholder={searchPlaceholder}
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full bg-[var(--bg-card)] border border-[var(--border)] rounded-sm px-4 py-2 pl-10 font-mono text-body text-[var(--fg)] placeholder:text-[var(--muted)] focus-visible:border-[var(--border-light)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--fg)] transition-default"
        />
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted)]/40 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </div>

      {filters?.map((filter) => (
        <FilterSelect key={filter.key ?? filter.label} filter={filter} />
      ))}

      {/* onClear must exist — otherwise Clear would render as a dead button */}
      {showClear && onClear && hasActiveFilters && (
        <Button variant="ghost" size="sm" onClick={onClear} aria-label="Clear all filters">
          Clear
        </Button>
      )}

      {children}
    </div>
  );
}