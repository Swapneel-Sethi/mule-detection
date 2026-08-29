"use client";

export interface Column<T> {
  key: string;
  header: string;
  render?: (item: T) => React.ReactNode;
  className?: string;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyField: keyof T | string;
  emptyMessage?: string;
}

export default function DataTable<T extends Record<string, any>>({
  columns,
  data,
  keyField,
  emptyMessage = "No matching records found.",
}: DataTableProps<T>) {
  if (data.length === 0) {
    return (
      <div className="border border-border/30 rounded-lg p-12 text-center bg-bg-card/50">
        <p className="font-mono text-[12px] tracking-wider uppercase text-fg-dim font-medium">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="border border-border/30 rounded-lg overflow-x-auto bg-bg-card/90 shadow-xl backdrop-blur-sm">
      <table className="w-full text-left border-collapse" role="table">
        <thead>
          <tr className="border-b border-border/30 bg-bg-surface/90">
            {columns.map((col) => (
              <th
                key={col.key}
                className={`font-mono text-[11px] font-semibold tracking-wider text-fg-dim uppercase px-4 py-3.5 ${col.className || ""}`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/20">
          {data.map((item, index) => {
            const rowKey = (keyField in item ? String(item[keyField]) : undefined) ?? String(index);
            return (
              <tr
                key={rowKey}
                className="hover:bg-accent/5 transition-colors duration-150 group"
              >
                {columns.map((col) => (
                  <td key={col.key} className={`px-4 py-3 font-mono text-[12px] text-fg ${col.className || ""}`}>
                    {col.render ? (
                      col.render(item)
                    ) : (
                      <span>{item[col.key] !== undefined && item[col.key] !== null ? String(item[col.key]) : "—"}</span>
                    )}
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
