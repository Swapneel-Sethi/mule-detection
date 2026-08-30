"use client";

import EmptyState from "./EmptyState";

// The sortable-header API and inline skeleton-loading branch were removed as
// dead code (no caller passed sortable/sortBy/onSort/loading, and every
// column supplies its own render). Re-introduce them only alongside a real
// producer, with proper button semantics on the sorted th.
export interface Column<T> {
  key: string;
  header: string;
  render: (item: T, index: number) => React.ReactNode;
  className?: string;
  headerClassName?: string;
  align?: "left" | "center" | "right";
  width?: string;
}

export interface DataTableProps<T extends object> {
  columns: Column<T>[];
  data: T[];
  keyField: string;
  emptyMessage?: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
  striped?: boolean;
  hoverable?: boolean;
  caption?: string;
  className?: string;
  /**
   * Makes whole rows clickable (detail views). Keyboard users activate rows
   * with Enter/Space; the cursor affordance only appears when provided.
   */
  onRowClick?: (item: T) => void;
}

export default function DataTable<T extends object>({
  columns,
  data,
  keyField,
  emptyMessage = "No data available",
  emptyDescription,
  emptyAction,
  striped = true,
  hoverable = true,
  caption,
  className = "",
  onRowClick,
}: DataTableProps<T>) {
  if (data.length === 0) {
    return (
      <div className="border border-[var(--border-light)] rounded-lg">
        <EmptyState message={emptyMessage} description={emptyDescription} action={emptyAction} />
      </div>
    );
  }

  // Expose a named landmark only when a real caption exists — a generic
  // "Data table" or message-named region just pollutes SR landmark rosters.
  return (
    <div
      className={`border border-[var(--border-light)] rounded-lg overflow-x-auto ${className}`}
      role={caption ? "region" : undefined}
      aria-label={caption}
      tabIndex={0}
    >
      <table className="w-full min-w-[600px]" role="table">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr className="border-b border-[var(--border-light)] bg-[var(--bg-card)]/50">
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                style={col.width ? { width: col.width } : undefined}
                className={`
                  text-left font-mono text-caption tracking-[-0.02em] text-[var(--muted)] uppercase px-4 py-3
                  ${col.headerClassName || ""}
                  ${col.align === "center" ? "text-center" : col.align === "right" ? "text-right" : ""}
                `}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((item, index) => {
            // Fall back to the row index when keyField is missing OR an
            // empty string — otherwise multiple rows could share React key "".
            const rawKey = (item as Record<string, unknown>)[keyField];
            const rowKey =
              rawKey !== undefined && rawKey !== null && String(rawKey) !== ""
                ? String(rawKey)
                : `__row_${index}`;

            return (
              <tr
                key={rowKey}
                onClick={onRowClick ? () => onRowClick(item) : undefined}
                onKeyDown={
                  onRowClick
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onRowClick(item);
                        }
                      }
                    : undefined
                }
                tabIndex={onRowClick ? 0 : undefined}
                aria-label={
                  onRowClick
                    ? `View details of row ${index + 1}`
                    : undefined
                }
                className={`
                  border-b border-[var(--border)] transition-default
                  ${striped && index % 2 === 1 ? "bg-[var(--bg-card)]/30" : ""}
                  ${hoverable ? "hover:bg-[var(--bg-card-hover)]" : ""}
                  ${onRowClick ? "cursor-pointer focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent)]/40" : ""}
                `}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    style={col.width ? { width: col.width } : undefined}
                    className={`
                      px-4 py-3
                      ${col.align === "center" ? "text-center" : col.align === "right" ? "text-right" : ""}
                      ${col.className || ""}
                    `}
                  >
                    {col.render(item, index)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}