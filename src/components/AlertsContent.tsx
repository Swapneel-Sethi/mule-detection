"use client";

import { useFirestoreData } from "@/lib/useFirestoreData";
import { useState, useMemo } from "react";
import PageHeader from "@/components/ui/PageHeader";
import FilterBar from "@/components/ui/FilterBar";
import DataTable from "@/components/ui/DataTable";
import LoadingState from "@/components/ui/LoadingState";
import ErrorState from "@/components/ui/ErrorState";

const PAGE_SIZE = 50;

export default function AlertsContent() {
  const { alerts, loading, error, refetch } = useFirestoreData();
  const [search, setSearch] = useState("");
  const [pageIndex, setPageIndex] = useState(0);
  const [severityFilter, setSeverityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const filtered = useMemo(() => {
    let result = [...alerts];
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (a) =>
          a.title.toLowerCase().includes(q) ||
          a.description.toLowerCase().includes(q) ||
          a.type.toLowerCase().includes(q) ||
          a.accounts.some((id) => id.toLowerCase().includes(q))
      );
    }
    if (severityFilter !== "all") {
      result = result.filter((a) => a.severity === severityFilter);
    }
    if (statusFilter !== "all") {
      result = result.filter((a) => a.status === statusFilter);
    }
    return result.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }, [alerts, search, severityFilter, statusFilter]);

  // Filter changes snap back to page 1 — adjusting state inside the handler
  // (not an effect) keeps a single render pass.
  const changeSearch = (v: string) => { setSearch(v); setPageIndex(0); };
  const changeSeverity = (v: string) => { setSeverityFilter(v); setPageIndex(0); };
  const changeStatus = (v: string) => { setStatusFilter(v); setPageIndex(0); };

  if (loading) {
    return (
      <div className="p-8">
        <LoadingState />
      </div>
    );
  }

  if (error && alerts.length === 0) {
    return (
      <div className="p-8">
        <ErrorState message="Couldn't load alerts" description={error} onRetry={refetch} />
      </div>
    );
  }

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(pageIndex, pageCount - 1);
  const displayed = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  const columns = [
    {
      key: "id",
      header: "ID",
      render: (alert: (typeof alerts)[0]) => (
        <span className="font-mono text-[11px] tracking-[-0.02em] text-ash">{alert.id}</span>
      ),
    },
    {
      key: "type",
      header: "Type",
      render: (alert: (typeof alerts)[0]) => (
        <span className="font-mono text-[11px] tracking-[-0.02em] text-ash uppercase">
          {alert.type}
        </span>
      ),
    },
    {
      key: "severity",
      header: "Severity",
      render: (alert: (typeof alerts)[0]) => (
        <span className={`font-mono text-[11px] tracking-[-0.02em] uppercase ${
          alert.severity === "critical" ? "text-red-500" :
          alert.severity === "high" ? "text-orange-400" :
          alert.severity === "medium" ? "text-yellow-300" :
          "text-bone"
        }`}>
          {alert.severity}
        </span>
      ),
    },
    {
      key: "title",
      header: "Title",
      render: (alert: (typeof alerts)[0]) => (
        <span className="font-mono text-[13px] tracking-[-0.02em] text-bone">
          {alert.title}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (alert: (typeof alerts)[0]) => (
        <span className={`font-mono text-[11px] tracking-[-0.02em] uppercase ${
          alert.status === "new" ? "text-white" :
          alert.status === "investigating" ? "text-amber-400" :
          "text-ash"
        }`}>
          {alert.status}
        </span>
      ),
    },
    {
      key: "accounts",
      header: "Accounts",
      render: (alert: (typeof alerts)[0]) => (
        <span className="font-mono text-[11px] tracking-[-0.02em] text-ash">
          {alert.accounts.join(", ")}
        </span>
      ),
    },
    {
      key: "timestamp",
      header: "Time",
      render: (alert: (typeof alerts)[0]) => (
        <span className="font-mono text-[11px] tracking-[-0.02em] text-ash">
          {new Date(alert.timestamp).toLocaleString("en-IN", {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      ),
    },
  ];

  return (
    <div className="p-8">
      <PageHeader
        title="Alerts"
        subtitle=""
      />

      <FilterBar
        searchValue={search}
        onSearchChange={changeSearch}
        searchPlaceholder="Search alerts by title, type, or account ID..."
        filters={[
          {
            value: severityFilter,
            onChange: changeSeverity,
            label: "Severity",
            options: [
              { value: "all", label: "All Severity" },
              { value: "critical", label: "Critical" },
              { value: "high", label: "High" },
              { value: "medium", label: "Medium" },
              { value: "low", label: "Low" },
              { value: "info", label: "Info" },
            ],
          },
          {
            value: statusFilter,
            onChange: changeStatus,
            label: "Status",
            options: [
              { value: "all", label: "All Status" },
              { value: "new", label: "New" },
              { value: "investigating", label: "Investigating" },
              { value: "resolved", label: "Resolved" },
              { value: "dismissed", label: "Dismissed" },
            ],
          },
        ]}
      />

      <DataTable
        columns={columns}
        data={displayed}
        keyField="id"
        emptyMessage="No alerts match your filters"
      />

      <div className="flex items-center justify-between mt-3">
        <p className="font-mono text-[11px] tracking-[-0.02em] text-ash">
          Showing {displayed.length} of {filtered.length} alerts · page {safePage + 1}/{pageCount}
        </p>
        {pageCount > 1 && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPageIndex((p) => Math.max(p - 1, 0))}
              disabled={safePage === 0}
              className="font-mono text-[11px] tracking-[-0.02em] text-bone bg-surface-1 border border-frost/10 rounded-sm px-3 py-1 hover:bg-surface-2 disabled:opacity-40 disabled:cursor-not-allowed transition-default"
            >
              Prev
            </button>
            <button
              onClick={() => setPageIndex((p) => Math.min(p + 1, pageCount - 1))}
              disabled={safePage >= pageCount - 1}
              className="font-mono text-[11px] tracking-[-0.02em] text-bone bg-surface-1 border border-frost/10 rounded-sm px-3 py-1 hover:bg-surface-2 disabled:opacity-40 disabled:cursor-not-allowed transition-default"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
