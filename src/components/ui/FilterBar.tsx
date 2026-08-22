"use client";

import { Button } from "./Button";

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterConfig {
  key?: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: FilterOption[];
  placeholder?: string;
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
  const hasActiveFilters = filters?.some(f => f.value !== "") || searchValue !== "";
  
  return (
    <div className={`flex flex-wrap items-center gap-3 mb-6 ${className}`} role="search" aria-label="Filter and search">
      <label htmlFor="filter-search" className="sr-only">
        Search
      </label>
      <div className="relative flex-1 min-w-[200px]">
        <input
          id="filter-search"
          type="search"
          placeholder={searchPlaceholder}
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full bg-surface-1 border border-frost/10 rounded-sm px-4 py-2 pl-10 font-mono text-body text-bone placeholder:text-ash/40 focus-visible:border-frost/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bone transition-default"
          aria-label={searchPlaceholder}
        />
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ash/40 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </div>
      
      {filters?.map((filter) => (
        <div key={filter.key ?? filter.label} className="flex items-center gap-2">
          <label htmlFor={`filter-${filter.key ?? filter.label}`} className="sr-only">
            {filter.label}
          </label>
          <select
            id={`filter-${filter.key ?? filter.label}`}
            value={filter.value}
            onChange={(e) => filter.onChange(e.target.value)}
            aria-label={filter.label}
            className="bg-surface-1 border border-frost/10 rounded-sm px-3 py-2 pr-8 font-mono text-body text-bone appearance-none cursor-pointer focus-visible:border-frost/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bone transition-default"
          >
            {filter.options.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      ))}
      
      {showClear && hasActiveFilters && (
        <Button variant="ghost" size="sm" onClick={onClear} aria-label="Clear all filters">
          Clear
        </Button>
      )}
      
      {children}
    </div>
  );
}