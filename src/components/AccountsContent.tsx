"use client";

import { useFirestoreData, type MappedAccount } from "@/lib/useFirestoreData";
import { useState, useMemo } from "react";
import PageHeader from "@/components/ui/PageHeader";
import FilterBar from "@/components/ui/FilterBar";
import DataTable from "@/components/ui/DataTable";
import RiskBadge from "@/components/ui/RiskBadge";
import LoadingState from "@/components/ui/LoadingState";

const RISK_OPTIONS = [
  { value: "all", label: "All Flagged" },
  { value: "critical", label: "Critical" },
  { value: "high", label: "High" },
];

export default function AccountsContent() {
  const { accounts, loading } = useFirestoreData();
  const [search, setSearch] = useState("");
  const [riskFilter, setRiskFilter] = useState("all");

  const filtered = useMemo(() => {
    let result = [...accounts];
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (a) => a.id.toLowerCase().includes(q) || a.city.toLowerCase().includes(q) || a.bank.toLowerCase().includes(q)
      );
    }
    if (riskFilter === "all") {
      result = result.filter((a) => a.riskLevel === "critical" || a.riskLevel === "high");
    } else {
      result = result.filter((a) => a.riskLevel === riskFilter);
    }
    result.sort((a, b) => b.riskScore - a.riskScore);
    return result;
  }, [accounts, search, riskFilter]);

  const displayed = filtered.slice(0, 500);

  if (loading) {
    return (
      <div className="p-8 max-w-[1200px] mx-auto">
        <PageHeader title="Accounts" subtitle="Loading..." />
        <LoadingState />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-[1200px] mx-auto">
      <PageHeader
        title="Accounts"
      />

      <FilterBar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search accounts..."
        filters={[
          {
            label: "Risk",
            value: riskFilter,
            onChange: setRiskFilter,
            options: RISK_OPTIONS,
          },
        ]}
      />

      <DataTable
        columns={[
          {
            key: "id",
            header: "Account",
            render: (row) => {
              const a = row as unknown as MappedAccount;
              return (
                <div>
                  <span className="font-mono text-[13px] tracking-[-0.02em] text-bone block">
                    {a.id}
                  </span>
                  <span className="font-mono text-[11px] tracking-[-0.02em] text-ash">
                    {a.city}
                  </span>
                </div>
              );
            },
          },
          {
            key: "riskScore",
            header: "Risk",
            render: (row) => {
              const a = row as unknown as MappedAccount;
              return (
                <div className="flex items-center gap-2">
                  <div className="w-10 h-[2px] bg-charcoal rounded-full overflow-hidden">
                    <div
                      className="h-full bg-bone rounded-full"
                      style={{ width: `${Math.min(a.riskScore, 100)}%` }}
                    />
                  </div>
                  <span className="font-mono text-[13px] tracking-[-0.02em] text-bone">
                    {a.riskScore.toFixed(0)}
                  </span>
                </div>
              );
            },
          },
          {
            key: "behavioralScore",
            header: "Behavioral",
            render: (row) => {
              const a = row as unknown as MappedAccount;
              return (
                <span className="font-mono text-[12px] tracking-[-0.02em] text-ash">
                  {a.behavioralScore.toFixed(0)}%
                </span>
              );
            },
          },
          {
            key: "graphScore",
            header: "Graph",
            render: (row) => {
              const a = row as unknown as MappedAccount;
              return (
                <span className="font-mono text-[12px] tracking-[-0.02em] text-ash">
                  {Math.min(a.graphScore * 20, 100).toFixed(0)}%
                </span>
              );
            },
          },
          {
            key: "isMule",
            header: "Mule",
            render: (row) => {
              const a = row as unknown as MappedAccount;
              return (
                <span className="font-mono text-[11px] tracking-[-0.02em] text-bone uppercase">
                  {a.isMule ? "Yes" : "\u2014"}
                </span>
              );
            },
          },
          {
            key: "flags",
            header: "Flags",
            render: (row) => {
              const a = row as unknown as MappedAccount;
              return (
                <div className="flex flex-wrap gap-1">
                  {a.flags.slice(0, 2).map((flag) => (
                    <span
                      key={flag}
                      className="font-mono text-[10px] tracking-[-0.02em] text-ash bg-charcoal/30 px-1.5 py-0.5 rounded-sm"
                    >
                      {flag}
                    </span>
                  ))}
                  {a.flags.length > 2 && (
                    <span className="font-mono text-[10px] tracking-[-0.02em] text-ash">
                      +{a.flags.length - 2}
                    </span>
                  )}
                </div>
              );
            },
          },
        ]}
        data={displayed as unknown as Record<string, unknown>[]}
        keyField="id"
        emptyMessage="No accounts match your filters"
      />

      <p className="font-mono text-[11px] tracking-[-0.02em] text-ash mt-3">
        Showing {displayed.length.toLocaleString("en-IN")} of {filtered.length.toLocaleString("en-IN")}
      </p>
    </div>
  );
}
