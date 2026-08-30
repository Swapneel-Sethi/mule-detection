"use client";

import type { Metadata } from "next";
import { useLocalData } from "@/lib/useLocalData";
import type { MappedAlert } from "@/lib/normalizers";
import { useState, useMemo } from "react";
import PageHeader from "@/components/ui/PageHeader";
import FilterBar from "@/components/ui/FilterBar";
import DataTable, { type Column } from "@/components/ui/DataTable";
import LoadingState from "@/components/ui/LoadingState";
import ErrorState from "@/components/ui/ErrorState";
import RiskBadge from "@/components/ui/RiskBadge";

const PAGE_SIZE = 50;

// Invalid timestamps sort as epoch 0 instead of poisoning the ordering with
// NaN (mirrors TransactionsContent's Date.parse guard).
const epochMs = (ts: string) => Date.parse(ts) || 0;

export default function AlertsPage() {
  const { alerts, loading, error, refetch } = useLocalData();
  const [search, setSearch] = useState("");
  const [pageIndex, setPageIndex] = useState(0);
  const [severityFilter, setSeverityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const filtered = useMemo(() => {
    let result = [...alerts];
    if (search.trim()) {
      const q = search.trim().toLowerCase();
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
    return result.sort((a, b) => epochMs(b.timestamp) - epochMs(a.timestamp));
  }, [alerts, search, severityFilter, statusFilter]);

  // Filter changes snap back to page 1 — adjusting state inside the handler
  // (not an effect) keeps a single render pass.
  const changeSearch = (v: string) => { setSearch(v); setPageIndex(0); };
  const changeSeverity = (v: string) => { setSeverityFilter(v); setPageIndex(0); };
  const changeStatus = (v: string) => { setStatusFilter(v); setPageIndex(0); };

  const isInitialLoad = loading && alerts.length === 0;

  if (isInitialLoad) {
    return (
      <div className="min-h-screen bg-[var(--bg)] p-8 reveal" style={{ minHeight: '100vh' }}>
        <PageHeader title="Alerts" />
        <LoadingState />
      </div>
    );
  }

  if (error && alerts.length === 0) {
    return (
      <div className="min-h-screen bg-[var(--bg)] p-8 reveal" style={{ minHeight: '100vh' }}>
        <PageHeader title="Alerts" subtitle="Error" />
        <ErrorState message="Couldn't load alerts" description={error} onRetry={refetch} />
      </div>
    );
  }

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(pageIndex, pageCount - 1);
  const displayed = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  const columns: Column<MappedAlert>[] = [
    {
      key: "id",
      header: "ID",
      render: (alert) => (
        <span className="font-mono text-[11px] tracking-[-0.02em] text-[var(--muted)]">
          {alert.id}
        </span>
      ),
    },
    {
      key: "type",
      header: "Type",
      render: (alert) => (
        <span className="font-mono text-[11px] tracking-[-0.02em] uppercase text-[var(--muted)]">
          {alert.type}
        </span>
      ),
    },
    {
      key: "severity",
      header: "Severity",
      // Shared badge component — one source for severity treatment across the
      // app instead of per-cell tailwind palettes.
      render: (alert) => <RiskBadge level={alert.severity} />,
    },
    {
      key: "title",
      header: "Title",
      render: (alert) => (
        <span className="font-mono text-[13px] tracking-[-0.02em] text-[var(--fg)]">
          {alert.title}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      // Status borrows the nearest-severity palette so urgency reads at a
      // glance; accessibleLabel keeps screen readers from announcing it as
      // "High Risk".
      render: (alert) =>
        alert.status === "resolved" ? (
          <RiskBadge level="low" displayText={alert.status} accessibleLabel={`Status: ${alert.status}`} />
        ) : alert.status === "investigating" ? (
          <RiskBadge level="medium" displayText={alert.status} accessibleLabel={`Status: ${alert.status}`} />
        ) : (
          <RiskBadge level="high" displayText={alert.status} accessibleLabel={`Status: ${alert.status}`} />
        ),
    },
    {
      key: "accounts",
      header: "Accounts",
      render: (alert) => (
        <span className="font-mono text-[11px] tracking-[-0.02em] text-[var(--muted)]">
          {alert.accounts.join(", ")}
        </span>
      ),
    },
    {
      key: "timestamp",
      header: "Time",
      render: (alert) => {
        const d = new Date(alert.timestamp);
        return (
          <span className="font-mono text-[11px] tracking-[-0.02em] text-[var(--muted)]">
            {Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("en-IN", {
              year: "numeric",
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
              timeZone: "Asia/Kolkata",
            })}
          </span>
        );
      },
    },
  ];

  return (
    <div className="min-h-screen bg-[var(--bg)] p-8 reveal" style={{ minHeight: '100vh' }}>
      <PageHeader
        title="Alerts"
      />

      {loading && alerts.length > 0 && (
        <p className="font-mono text-[11px] tracking-[-0.02em] text-[var(--muted)] mb-2" role="status" aria-live="polite">
          Refreshing…
        </p>
      )}

      {!loading && error && alerts.length > 0 && (
        <p className="font-mono text-[11px] tracking-[-0.02em] text-[var(--muted)] mb-2" role="alert">
          Refresh failed — showing previously loaded alerts. {error}
        </p>
      )}

      <FilterBar
        searchValue={search}
        onSearchChange={changeSearch}
        searchPlaceholder="Search alerts by title, description, type, or account ID..."
        filters={[
          {
            value: severityFilter,
            onChange: changeSeverity,
            label: "Severity",
            options: [
              { value: "all", label: "All Severity" },
              { value: "critical", label: "Critical" },
              // Only Critical: all 45 shipped alert events carry severity
              // critical, so High/Medium/Low/Info options could only ever
              // filter down to an empty table. Re-add tiers when a dataset
              // regeneration actually emits them.
            ],
          },
          {
            value: statusFilter,
            onChange: changeStatus,
            label: "Status",
            options: [
              { value: "all", label: "All Status" },
              { value: "new", label: "New" },
              // Only New: every shipped alert event is status new, so
              // Investigating/Resolved/Dismissed options always filtered to
              // zero rows. Re-add when the workflow actually emits them.
            ],
          },
        ]}
      />

      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-4">
        <DataTable
          columns={columns}
          data={displayed}
          keyField="id"
          caption="Alerts"
          emptyMessage={alerts.length === 0 ? "No alerts available" : "No alerts match your filters"}
        />
      </div>

      <div className="flex items-center justify-between mt-3" aria-live="polite">
        <p className="font-mono text-[11px] tracking-[-0.02em] text-[var(--muted)]">
          Showing {displayed.length} of {filtered.length} alerts · page {safePage + 1}/{pageCount}
        </p>
        {pageCount > 1 && (
          <div className="flex items-center gap-2">
            {/* Navigate from the clamped value — raw pageIndex can sit past
                pageCount after the filter set shrinks. */}
            <button
              onClick={() => setPageIndex(Math.max(safePage - 1, 0))}
              disabled={safePage === 0}
              className="font-mono text-[11px] tracking-[-0.02em] text-[var(--fg)] bg-[var(--bg-card)] border border-[var(--border)] rounded-sm px-3 py-1 hover:bg-[var(--bg-card-hover)] disabled:opacity-40 disabled:cursor-not-allowed focus-visible:border-[var(--border-light)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--fg)] transition-default"
            >
              Prev
            </button>
            <button
              onClick={() => setPageIndex(Math.min(safePage + 1, pageCount - 1))}
              disabled={safePage >= pageCount - 1}
              className="font-mono text-[11px] tracking-[-0.02em] text-[var(--fg)] bg-[var(--bg-card)] border border-[var(--border)] rounded-sm px-3 py-1 hover:bg-[var(--bg-card-hover)] disabled:opacity-40 disabled:cursor-not-allowed focus-visible:border-[var(--border-light)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--fg)] transition-default"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export const metadata: Metadata = {
  title: "Alerts",
  description: "Precomputed fan-in, fan-out, rapid-movement and behavioral-change alerts from the trained-model pipeline.",
};