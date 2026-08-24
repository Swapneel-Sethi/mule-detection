"use client";

import { useFirestoreData, type MappedAccount } from "@/lib/useFirestoreData";
import { useState, useMemo } from "react";
import PageHeader from "@/components/ui/PageHeader";
import FilterBar from "@/components/ui/FilterBar";
import DataTable from "@/components/ui/DataTable";
import LoadingState from "@/components/ui/LoadingState";

const RISK_OPTIONS = [
  { value: "all", label: "All Flagged" },
  { value: "mule", label: "Mule" },
  { value: "high", label: "High Risk" },
];

export default function AccountsContent() {
  const [search, setSearch] = useState("");
  const [riskFilter, setRiskFilter] = useState("all");
  const { accounts, loading } = useFirestoreData(riskFilter);

  const filtered = useMemo(() => {
    let result = [...accounts];
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (a) => a.id.toLowerCase().includes(q) || a.city.toLowerCase().includes(q) || a.bank.toLowerCase().includes(q)
      );
    }
    // Category filtering (Mule / High Risk) happens server-side via the
    // category param — the API returns disjoint, pre-filtered account sets.
    result.sort((a, b) => b.riskScore - a.riskScore);
    return result;
  }, [accounts, search]);

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
