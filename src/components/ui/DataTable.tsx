"use client";

interface Column<T> {
  key: string;
  header: string;
  render?: (item: T) => React.ReactNode;
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyField: string;
  emptyMessage?: string;
}

export default function DataTable<T extends object>({ columns, data, keyField, emptyMessage = "No data" }: DataTableProps<T>) {
  if (data.length === 0) {
    return (
      <div className="border border-frost/10 rounded-lg p-8 text-center">
        <p className="font-mono text-[11px] tracking-[-0.02em] text-ash">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="border border-frost/10 rounded-lg overflow-hidden">
      <table className="w-full" role="table">
        <thead>
          <tr className="border-b border-frost/10">
            {columns.map((col) => (
              <th key={col.key} className={`text-left font-mono text-[11px] tracking-[-0.02em] text-ash uppercase px-4 py-3 ${col.className || ""}`}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((item) => (
            <tr key={String((item as Record<string, unknown>)[keyField])} className="border-b border-frost/5 hover:bg-surface-2 transition-default">
              {columns.map((col) => (
                <td key={col.key} className={`px-4 py-3 ${col.className || ""}`}>
                  {col.render ? col.render(item) : (
                    <span className="font-mono text-[13px] tracking-[-0.02em] text-bone">{String((item as Record<string, unknown>)[col.key] ?? "")}</span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
