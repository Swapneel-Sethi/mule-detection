"use client";

interface EmptyStateProps {
  message?: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  variant?: "default" | "search" | "filter" | "error";
}

const defaultIcons = {
  default: (
    <svg className="w-12 h-12 text-ash/30" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  ),
  search: (
    <svg className="w-12 h-12 text-ash/30" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  ),
  filter: (
    <svg className="w-12 h-12 text-ash/30" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
    </svg>
  ),
  error: (
    <svg className="w-12 h-12 text-risk-critical/30" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  ),
};

export default function EmptyState({ 
  message = "No data available", 
  description,
  icon,
  action,
  variant = "default"
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center" role="status">
      {icon || defaultIcons[variant]}
      <p className="mt-4 font-display text-heading-sm text-bone">{message}</p>
      {description && (
        <p className="mt-2 font-mono text-caption text-ash max-w-xs">{description}</p>
      )}
      {action && (
        <div className="mt-6">{action}</div>
      )}
    </div>
  );
}