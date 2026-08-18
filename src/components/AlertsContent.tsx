"use client";

import { useFirestoreData } from "@/lib/useFirestoreData";
import { useState, useMemo } from "react";

export default function AlertsContent() {
  const { alerts, loading } = useFirestoreData();
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const filtered = useMemo(() => {
    let result = [...alerts];
    if (severityFilter !== "all") {
      result = result.filter((a) => a.severity === severityFilter);
    }
    if (statusFilter !== "all") {
      result = result.filter((a) => a.status === statusFilter);
    }
    return result.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [alerts, severityFilter, statusFilter]);

  if (loading) {
    return (
      <div className="p-10 max-w-[1200px] mx-auto">
        <div className="flex items-center justify-center h-64">
          <span className="font-mono text-[10px] tracking-[-0.02em] text-ash">Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-10 max-w-[1200px] mx-auto">
      <div className="mb-8">
        <h1 className="font-display text-[30px] font-normal leading-[1] text-bone tracking-tight mb-2">
          Alerts
        </h1>
        <div className="h-[1px] bg-frost/20 w-[100px] mb-3" />
        <p className="font-mono text-[10px] tracking-[-0.02em] text-ash uppercase">
          {alerts.length} total — {alerts.filter((a) => a.status === "new").length} new
        </p>
      </div>

      <div className="flex items-center gap-3 mb-6">
        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
          className="bg-void border border-frost/10 rounded-[2px] px-3 py-2 font-mono text-[12px] tracking-[-0.02em] text-bone appearance-none cursor-pointer focus:outline-none focus:border-frost/30"
        >
          <option value="all">All Severity</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-void border border-frost/10 rounded-[2px] px-3 py-2 font-mono text-[12px] tracking-[-0.02em] text-bone appearance-none cursor-pointer focus:outline-none focus:border-frost/30"
        >
          <option value="all">All Status</option>
          <option value="new">New</option>
          <option value="investigating">Investigating</option>
          <option value="resolved">Resolved</option>
          <option value="dismissed">Dismissed</option>
        </select>
      </div>

      <div className="border border-frost/10 rounded-[10px] overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-frost/10">
              {["ID", "Type", "Severity", "Title", "Status", "Accounts", "Time"].map((h) => (
                <th key={h} className="text-left font-mono text-[10px] tracking-[-0.02em] text-ash uppercase px-5 py-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 50).map((alert) => (
              <tr key={alert.id} className="border-b border-frost/5 hover:bg-charcoal/20 transition-colors">
                <td className="px-5 py-3">
                  <span className="font-mono text-[10px] tracking-[-0.02em] text-ash">{alert.id}</span>
                </td>
                <td className="px-5 py-3">
                  <span className="font-mono text-[10px] tracking-[-0.02em] text-ash uppercase">{alert.type}</span>
                </td>
                <td className="px-5 py-3">
                  <span className="font-mono text-[10px] tracking-[-0.02em] text-bone uppercase">{alert.severity}</span>
                </td>
                <td className="px-5 py-3">
                  <span className="font-mono text-[12px] tracking-[-0.02em] text-bone">{alert.title}</span>
                </td>
                <td className="px-5 py-3">
                  <span className="font-mono text-[10px] tracking-[-0.02em] text-ash uppercase">{alert.status}</span>
                </td>
                <td className="px-5 py-3">
                  <span className="font-mono text-[10px] tracking-[-0.02em] text-ash">{alert.accounts.length}</span>
                </td>
                <td className="px-5 py-3">
                  <span className="font-mono text-[10px] tracking-[-0.02em] text-ash">
                    {new Date(alert.timestamp).toLocaleString("en-IN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="font-mono text-[10px] tracking-[-0.02em] text-ash mt-3">
        Showing {Math.min(50, filtered.length)} of {filtered.length}
      </p>
    </div>
  );
}
