"use client";

import { useFirestoreData } from "@/lib/useFirestoreData";
import { useState, useMemo } from "react";
import PageHeader from "@/components/ui/PageHeader";
import FilterBar from "@/components/ui/FilterBar";
import DataTable, { Column } from "@/components/ui/DataTable";
import LoadingState from "@/components/ui/LoadingState";
import RiskBadge from "@/components/ui/RiskBadge";
import Card from "@/components/ui/Card";
import type { MappedAlert } from "@/lib/normalizers";

export default function AlertsContent() {
  const { alerts, loading } = useFirestoreData();
  const [search, setSearch] = useState("");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [localAlerts, setLocalAlerts] = useState<MappedAlert[] | null>(null);

  const activeList: MappedAlert[] = localAlerts || alerts;

  const handleStatusChange = (alertId: string, newStatus: string) => {
    const updated = activeList.map((a) =>
      a.id === alertId ? { ...a, status: newStatus as any } : a
    );
    setLocalAlerts(updated);
  };

  const filtered = useMemo(() => {
    let result = [...activeList];
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (a) =>
          a.id.toLowerCase().includes(q) ||
          a.title.toLowerCase().includes(q) ||
          a.type.toLowerCase().includes(q) ||
          a.accounts.some((acc) => acc.toLowerCase().includes(q))
      );
    }
    if (severityFilter !== "all") {
      result = result.filter((a) => a.severity.toLowerCase() === severityFilter.toLowerCase());
    }
    if (statusFilter !== "all") {
      result = result.filter((a) => a.status.toLowerCase() === statusFilter.toLowerCase());
    }
    return result.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }, [activeList, search, severityFilter, statusFilter]);

  if (loading) {
    return (
      <div className="p-8 max-w-[1400px] mx-auto">
        <PageHeader title="Alert Intelligence" subtitle="Connecting to alert queue..." />
        <LoadingState message="Fetching live behavioral triggers..." />
      </div>
    );
  }

  const newCount = activeList.filter((a) => a.status === "new").length;
  const investigatingCount = activeList.filter((a) => a.status === "investigating").length;
  const resolvedCount = activeList.filter((a) => a.status === "resolved").length;
  const criticalCount = activeList.filter((a) => a.severity.toLowerCase() === "critical").length;

  const columns: Column<MappedAlert>[] = [
    {
      key: "id",
      header: "Alert ID",
      render: (a) => (
        <span className="font-mono text-[11px] font-bold text-fg">{a.id}</span>
      ),
    },
    {
      key: "type",
      header: "Pattern Typology",
      render: (a) => (
        <span className="px-2.5 py-0.5 rounded font-mono text-[10px] uppercase font-bold bg-accent/15 text-accent border border-accent/30 tracking-wider">
          {a.type.replaceAll("_", " ")}
        </span>
      ),
    },
    {
      key: "severity",
      header: "Severity",
      render: (a) => <RiskBadge level={a.severity} />,
    },
    {
      key: "title",
      header: "Incident Narrative & Entity",
      render: (a) => (
        <div>
          <p className="font-mono text-[12px] font-semibold text-fg">{a.title}</p>
          {a.accounts.length > 0 && (
            <p className="font-mono text-[10px] text-fg-dim mt-0.5">
              Target Account: <span className="text-accent font-medium">{a.accounts.join(", ")}</span>
            </p>
          )}
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (a) => {
        const statusColors: Record<string, string> = {
          new: "bg-risk-critical/20 text-risk-critical border-risk-critical/40",
          investigating: "bg-risk-high/20 text-risk-high border-risk-high/40",
          resolved: "bg-risk-low/20 text-risk-low border-risk-low/40",
          dismissed: "bg-bg-surface text-fg-dim border-border/30",
        };
        return (
          <span className={`px-2 py-0.5 rounded font-mono text-[10px] uppercase font-bold border tracking-wider ${statusColors[a.status.toLowerCase()] || statusColors.new}`}>
            {a.status}
          </span>
        );
      },
    },
    {
      key: "timestamp",
      header: "Triggered At",
      render: (a) => (
        <span className="font-mono text-[11px] text-fg-dim">
          {a.timestamp
            ? new Date(a.timestamp).toLocaleString("en-IN", {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })
            : "Recent"}
        </span>
      ),
    },
    {
      key: "actions",
      header: "Triage Action",
      render: (a) => (
        <div className="flex items-center gap-1.5 font-mono text-[10px]">
          {a.status !== "investigating" && a.status !== "resolved" && (
            <button
              onClick={() => handleStatusChange(a.id, "investigating")}
              className="px-2 py-1 rounded bg-risk-high/15 text-risk-high border border-risk-high/40 hover:bg-risk-high/25 font-semibold"
            >
              Investigate
            </button>
          )}
          {a.status !== "resolved" && (
            <button
              onClick={() => handleStatusChange(a.id, "resolved")}
              className="px-2 py-1 rounded bg-risk-low/15 text-risk-low border border-risk-low/40 hover:bg-risk-low/25 font-semibold"
            >
              Resolve
            </button>
          )}
          {a.status === "resolved" && (
            <span className="text-risk-low font-bold">✓ Cleared</span>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="p-8 max-w-[1400px] mx-auto space-y-6">
      <PageHeader
        title="Fraud & Mule Alert Triage Station"
        subtitle={`${activeList.length} Total Alerts Logged • ${newCount} Unacknowledged • ${criticalCount} Critical Severity`}
        badge="Incident Queue"
      />

      {/* Metric summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="bg-bg-card/90 border border-border/30 p-4">
          <p className="font-mono text-[10px] text-fg-dim uppercase font-semibold">Unacknowledged</p>
          <p className="font-display text-2xl font-bold text-accent mt-1">{newCount}</p>
        </Card>
        <Card className="bg-bg-card/90 border border-border/30 p-4">
          <p className="font-mono text-[10px] text-fg-dim uppercase font-semibold">Under Investigation</p>
          <p className="font-display text-2xl font-bold text-risk-high mt-1">{investigatingCount}</p>
        </Card>
        <Card className="bg-bg-card/90 border border-border/30 p-4">
          <p className="font-mono text-[10px] text-fg-dim uppercase font-semibold">Critical Threats</p>
          <p className="font-display text-2xl font-bold text-risk-critical mt-1">{criticalCount}</p>
        </Card>
        <Card className="bg-bg-card/90 border border-border/30 p-4">
          <p className="font-mono text-[10px] text-fg-dim uppercase font-semibold">Resolved / Cleared</p>
          <p className="font-display text-2xl font-bold text-risk-low mt-1">{resolvedCount}</p>
        </Card>
      </div>

      {/* Filter Bar */}
      <FilterBar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search alerts by title, ID, pattern type, account ID..."
        filters={[
          {
            value: severityFilter,
            onChange: setSeverityFilter,
            label: "Severity",
            options: [
              { value: "all", label: "All Severities" },
              { value: "critical", label: "Critical Severity" },
              { value: "high", label: "High Severity" },
              { value: "medium", label: "Medium Severity" },
              { value: "low", label: "Low Severity" },
            ],
          },
          {
            value: statusFilter,
            onChange: setStatusFilter,
            label: "Status",
            options: [
              { value: "all", label: "All Lifecycle States" },
              { value: "new", label: "New / Open" },
              { value: "investigating", label: "Investigating" },
              { value: "resolved", label: "Resolved" },
              { value: "dismissed", label: "Dismissed" },
            ],
          },
        ]}
      />

      {/* Alerts Table */}
      <DataTable
        columns={columns}
        data={filtered.slice(0, 60)}
        keyField="id"
        emptyMessage="No alerts match the applied criteria."
      />

      <div className="flex items-center justify-between font-mono text-[11px] text-fg-dim pt-2">
        <span>
          Displaying {Math.min(60, filtered.length)} of {filtered.length} active alerts
        </span>
        <span>DAN Framework Attribution Engine</span>
      </div>
    </div>
  );
}
