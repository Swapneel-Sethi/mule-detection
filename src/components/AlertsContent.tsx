"use client";

import { useFirestoreData } from "@/lib/useFirestoreData";
import {
  AlertTriangle,
  ArrowUpRight,
  GitBranch,
  Repeat,
  Zap,
  Clock,
  Eye,
} from "lucide-react";
import { useState, useMemo } from "react";

const severityColors: Record<string, string> = {
  critical: "#ef4444",
  high: "#f97316",
  medium: "#eab308",
  low: "#3b82f6",
};

const typeIcons: Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  rapid_movement: Zap,
  fan_in: ArrowUpRight,
  fan_out: GitBranch,
  circular: Repeat,
  behavioral_change: AlertTriangle,
  dormant_activation: Clock,
};

const typeLabels: Record<string, string> = {
  rapid_movement: "Rapid Movement",
  fan_in: "Fan-In Pattern",
  fan_out: "Fan-Out Pattern",
  circular: "Circular Transfer",
  behavioral_change: "Behavioral Change",
  dormant_activation: "Dormant Reactivation",
};

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
    return result;
  }, [alerts, severityFilter, statusFilter]);

  if (loading) {
    return (
      <div className="p-8 max-w-[1200px] mx-auto">
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-chalk border-t-signal-green rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-[1200px] mx-auto">
      <div className="mb-8">
        <h1 className="text-[45px] font-light tracking-[-1.17px] text-paper-white leading-[1.18]">
          Alerts
        </h1>
        <p className="text-[15px] text-fog mt-2">
          Suspicious patterns and anomalies detected by the Graph ML engine
        </p>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-8">
        {["critical", "high", "medium", "low"].map((sev) => {
          const count = alerts.filter((a) => a.severity === sev).length;
          return (
            <div key={sev} className="card text-center">
              <div
                className="w-3 h-3 rounded-full mx-auto mb-2"
                style={{ backgroundColor: severityColors[sev] }}
              />
              <p className="text-[24px] font-light text-paper-white">{count}</p>
              <p className="text-[12px] text-fog capitalize">{sev}</p>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-3 mb-6">
        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
          className="bg-carbon border border-chalk rounded-[12px] px-4 py-2.5 text-[14px] text-paper-white appearance-none cursor-pointer focus:outline-none focus:border-fog"
        >
          <option value="all">All Severities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-carbon border border-chalk rounded-[12px] px-4 py-2.5 text-[14px] text-paper-white appearance-none cursor-pointer focus:outline-none focus:border-fog"
        >
          <option value="all">All Statuses</option>
          <option value="new">New</option>
          <option value="investigating">Investigating</option>
          <option value="resolved">Resolved</option>
          <option value="dismissed">Dismissed</option>
        </select>
      </div>

      <div className="space-y-4">
        {filtered.map((alert) => {
          const Icon = typeIcons[alert.type] || AlertTriangle;

          return (
            <div
              key={alert.id}
              className="card-elevated p-6 hover:bg-graphite/20 transition-colors cursor-pointer"
            >
              <div className="flex items-start gap-4">
                <div
                  className="w-10 h-10 rounded-[12px] flex items-center justify-center shrink-0"
                  style={{
                    backgroundColor: `${severityColors[alert.severity]}15`,
                    border: `1px solid ${severityColors[alert.severity]}30`,
                  }}
                >
                  <Icon className="w-5 h-5" style={{ color: severityColors[alert.severity] }} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className="text-[11px] font-medium px-2 py-0.5 rounded-full"
                      style={{
                        color: severityColors[alert.severity],
                        backgroundColor: `${severityColors[alert.severity]}15`,
                      }}
                    >
                      {alert.severity}
                    </span>
                    <span className="text-[11px] text-slate-mist">
                      {typeLabels[alert.type] || alert.type}
                    </span>
                    <span className="text-[11px] text-slate-mist">•</span>
                    <span className="text-[11px] text-slate-mist">{alert.id}</span>
                  </div>

                  <h3 className="text-[15px] font-medium text-paper-white mb-1">
                    {alert.title}
                  </h3>
                  <p className="text-[13px] text-fog leading-relaxed">
                    {alert.description}
                  </p>

                  <div className="flex items-center gap-4 mt-3">
                    <span className="text-[12px] text-fog capitalize">
                      {alert.status?.replace("_", " ") || "new"}
                    </span>
                    <span className="text-[12px] text-slate-mist">
                      {alert.timestamp ? new Date(alert.timestamp).toLocaleString("en-IN", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      }) : ""}
                    </span>
                    {alert.accounts && alert.accounts.length > 0 && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[12px] text-slate-mist">Accounts:</span>
                        {alert.accounts.map((acc: string) => (
                          <span
                            key={acc}
                            className="text-[11px] text-bone bg-graphite/50 px-1.5 py-0.5 rounded font-mono"
                          >
                            {acc}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="card text-center py-12">
            <p className="text-[15px] text-fog">No alerts match the current filters</p>
          </div>
        )}
      </div>
    </div>
  );
}
