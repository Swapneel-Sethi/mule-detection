"use client";

import { useFirestoreData } from "@/lib/useFirestoreData";
import { useState, useMemo } from "react";
import PageHeader from "@/components/ui/PageHeader";
import FilterBar from "@/components/ui/FilterBar";
import DataTable from "@/components/ui/DataTable";
import LoadingState from "@/components/ui/LoadingState";

export default function AlertsContent() {
  const { alerts, loading } = useFirestoreData();
  const [severityFilter, setSeverityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const filtered = useMemo(() => {
    let result = [...alerts];
    if (severityFilter !== "all") {
      result = result.filter((a) => a.severity === severityFilter);
    }
    if (statusFilter !== "all") {
      result = result.filter((a) => a.status === statusFilter);
    }
    return result.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }, [alerts, severityFilter, statusFilter]);

  if (loading) {
    return (
      <div className="p-8">
        <LoadingState />
      </div>
    );
  }

  const newCount = alerts.filter((a) => a.status === "new").length;

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
        <span className="font-mono text-[11px] tracking-[-0.02em] text-bone uppercase">
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
        <span className="font-mono text-[11px] tracking-[-0.02em] text-ash uppercase">
          {alert.status}
        </span>
      ),
    },
    {
      key: "accounts",
      header: "Accounts",
      render: (alert: (typeof alerts)[0]) => (
        <span className="font-mono text-[11px] tracking-[-0.02em] text-ash">
          {alert.accounts.length}
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
        subtitle={`${alerts.length} total — ${newCount} new`}
      />

      <FilterBar
        searchValue=""
        onSearchChange={() => {}}
        searchPlaceholder=""
        filters={[
          {
            value: severityFilter,
            onChange: setSeverityFilter,
            label: "Severity",
            options: [
              { value: "all", label: "All Severity" },
              { value: "critical", label: "Critical" },
              { value: "high", label: "High" },
              { value: "medium", label: "Medium" },
              { value: "low", label: "Low" },
            ],
          },
          {
            value: statusFilter,
            onChange: setStatusFilter,
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
        data={filtered.slice(0, 50)}
        keyField="id"
        emptyMessage="No alerts match your filters"
      />

      <p className="font-mono text-[11px] tracking-[-0.02em] text-ash mt-3">
        Showing {Math.min(50, filtered.length)} of {filtered.length}
      </p>
    </div>
  );
}
