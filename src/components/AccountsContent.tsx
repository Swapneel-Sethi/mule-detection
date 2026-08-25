"use client";

import { useLocalData, type MappedAccount } from "@/lib/useLocalData";
import { useState, useMemo } from "react";
import PageHeader from "@/components/ui/PageHeader";
import FilterBar from "@/components/ui/FilterBar";
import DataTable from "@/components/ui/DataTable";
import LoadingState from "@/components/ui/LoadingState";
import ErrorState from "@/components/ui/ErrorState";

const RISK_OPTIONS = [
  { value: "all", label: "All Flagged" },
  { value: "mule", label: "Mule" },
  { value: "high", label: "High Risk" },
];

// Hard cap on rendered rows — matches TransactionsContent's DISPLAY_CAP.
const DISPLAY_CAP = 500;

export default function AccountsContent() {
  const [search, setSearch] = useState("");
  const [riskFilter, setRiskFilter] = useState("all");
  const { accounts, loading, error, refetch, pagination } = useLocalData(riskFilter);

  const filtered = useMemo(() => {
    let result = [...accounts];
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (a) =>
          a.id.toLowerCase().includes(q) ||
          a.name.toLowerCase().includes(q) ||
          a.city.toLowerCase().includes(q) ||
          a.bank.toLowerCase().includes(q)
      );
    }
    // Category filtering (Mule / High Risk) happens server-side via the
    // category param — the API returns disjoint, pre-filtered account sets.
    result.sort((a, b) => b.riskScore - a.riskScore);
    return result;
  }, [accounts, search]);

  const displayed = filtered.slice(0, DISPLAY_CAP);

  // Without an active search, report the server-side category total (the hook
  // fetches at most 1,000 rows per page, so filtered.length would under-report
  // e.g. the 8,578-account "All Flagged" view). While searching, only the
  // fetched page has been scanned, so the exact client-side match count is the
  // honest number.
  const totalLabel = search ? filtered.length : pagination.total || filtered.length;

  const isInitialLoad = loading && accounts.length === 0;

  if (isInitialLoad) {
    return (
      <div className="p-8 max-w-[1200px] mx-auto">
        <PageHeader title="Accounts" />
        <LoadingState />
      </div>
    );
  }

  if (error && accounts.length === 0) {
    return (
      <div className="p-8 max-w-[1200px] mx-auto">
        <PageHeader title="Accounts" subtitle="Error" />
        <ErrorState message="Couldn't load accounts" description={error} onRetry={refetch} />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-[1200px] mx-auto">
      <PageHeader
        title="Accounts"
      />

      {loading && accounts.length > 0 && (
        <p className="font-mono text-[11px] tracking-[-0.02em] text-ash mb-2" role="status" aria-live="polite">
          Refreshing…
        </p>
      )}

      {!loading && error && accounts.length > 0 && (
        <p className="font-mono text-[11px] tracking-[-0.02em] text-ash mb-2" role="alert">
          Refresh failed — showing previously loaded accounts. {error}
        </p>
      )}

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
            render: (a: MappedAccount) => (
              <div>
                <span className="font-mono text-[13px] tracking-[-0.02em] text-bone block">
                  {a.id}
                </span>
                <span className="font-mono text-[11px] tracking-[-0.02em] text-ash">
                  {a.city}
                </span>
              </div>
            ),
          },
          {
            key: "riskScore",
            header: "Risk",
            render: (a: MappedAccount) => (
              <div className="flex items-center gap-2">
                <div className="w-10 h-[2px] bg-charcoal rounded-full overflow-hidden">
                  <div
                    className="h-full bg-bone rounded-full"
                    style={{ width: `${Math.min(Math.max(a.riskScore, 0), 100)}%` }}
                  />
                </div>
                <span className="font-mono text-[13px] tracking-[-0.02em] text-bone">
                  {a.riskScore.toFixed(0)}
                </span>
              </div>
            ),
          },
          {
            key: "flags",
            header: "Flags",
            render: (a: MappedAccount) => (
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
            ),
          },
        ]}
        data={displayed}
        keyField="id"
        emptyMessage="No accounts match your filters"
      />

      <p className="font-mono text-[11px] tracking-[-0.02em] text-ash mt-3">
        Showing {displayed.length.toLocaleString("en-IN")} of{" "}
        {totalLabel.toLocaleString("en-IN")} accounts
        {filtered.length > displayed.length ? " (refine search to see more)" : ""}
      </p>
    </div>
  );
}
