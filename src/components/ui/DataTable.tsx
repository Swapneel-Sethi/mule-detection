"use client";

import EmptyState from "./EmptyState";
import Skeleton from "./Skeleton";

export interface Column<T> {
  key: string;
  header: string;
  render?: (item: T, index: number) => React.ReactNode;
  className?: string;
  headerClassName?: string;
  sortable?: boolean;
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
  loading?: boolean;
  loadingCount?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  onSort?: (key: string) => void;
  striped?: boolean;
  hoverable?: boolean;
  caption?: string;
  className?: string;
}

function defaultRender<T>(item: T, key: string): React.ReactNode {
  const value = (item as Record<string, unknown>)[key];
  if (value === undefined || value === null) return <span className="text-ash/40">—</span>;
  if (typeof value === "number") return <span className="font-mono tabular-nums">{value.toLocaleString("en-IN")}</span>;
  return <span>{String(value)}</span>;
}

export default function DataTable<T extends object>({
  columns,
  data,
  keyField,
  emptyMessage = "No data available",
  emptyDescription,
  emptyAction,
  loading = false,
  loadingCount = 5,
  sortBy,
  sortOrder,
  onSort,
  striped = true,
  hoverable = true,
  caption,
  className = "",
}: DataTableProps<T>) {

  if (loading) {
    return (
      <div className="border border-frost/10 rounded-lg overflow-hidden" role="status" aria-label="Loading table data">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px]" role="table">
            <thead>
              <tr className="border-b border-frost/10 bg-surface-2/50">
                {columns.map((col) => (
                  <th
                    key={col.key}
                    scope="col"
                    style={col.width ? { width: col.width } : undefined}
                    className={`text-left font-mono text-caption tracking-[-0.02em] text-ash uppercase px-4 py-3 ${
                      col.align === "center" ? "text-center" : col.align === "right" ? "text-right" : ""
                    } ${col.headerClassName || ""}`}
                  >
                    {col.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: loadingCount }).map((_, i) => (
                <tr key={i} className="border-b border-frost/5">
                  {columns.map((col) => (
                    <td key={col.key} className="px-4 py-3">
                      <Skeleton variant="text" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="border border-frost/10 rounded-lg" role="region" aria-label={emptyMessage}>
        <EmptyState message={emptyMessage} description={emptyDescription} action={emptyAction} />
      </div>
    );
  }

  return (
    <div className={`border border-frost/10 rounded-lg overflow-x-auto ${className}`} role="region" aria-label={caption || "Data table"} tabIndex={0}>
      <table className="w-full min-w-[600px]" role="table">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr className="border-b border-frost/10 bg-surface-2/50">
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                style={col.width ? { width: col.width } : undefined}
                className={`
                  text-left font-mono text-caption tracking-[-0.02em] text-ash uppercase px-4 py-3
                  ${col.sortable ? "cursor-pointer select-none hover:text-bone transition-default" : ""}
                  ${col.headerClassName || ""}
                  ${col.align === "center" ? "text-center" : col.align === "right" ? "text-right" : ""}
                `}
                onClick={() => col.sortable && onSort?.(col.key)}
                onKeyDown={
                  col.sortable
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onSort?.(col.key);
                        }
                      }
                    : undefined
                }
                tabIndex={col.sortable ? 0 : undefined}
                aria-sort={
                  sortBy !== col.key
                    ? undefined
                    : sortOrder === "asc"
                      ? "ascending"
                      : "descending"
                }
              >
                <div className="flex items-center gap-1">
                  {col.header}
                  {col.sortable && sortBy === col.key && (
                    <span aria-hidden="true">{sortOrder === "asc" ? "▲" : "▼"}</span>
                  )}
                </div>
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
                className={`
                  border-b border-frost/5 transition-default
                  ${striped && index % 2 === 1 ? "bg-surface-2/30" : ""}
                  ${hoverable ? "hover:bg-surface-2" : ""}
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
                    {col.render
                      ? col.render(item, index)
                      : defaultRender(item, col.key)}
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