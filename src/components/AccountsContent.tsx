"use client";

import { useLocalData, type MappedAccount } from "@/lib/useLocalData";
import { useState, useMemo } from "react";
import PageHeader from "@/components/ui/PageHeader";
import FilterBar from "@/components/ui/FilterBar";
import DataTable from "@/components/ui/DataTable";
import LoadingState from "@/components/ui/LoadingState";
import ErrorState from "@/components/ui/ErrorState";
import AccountDrawer from "@/components/AccountDrawer";

const RISK_OPTIONS = [
  { value: "all", label: "All Flagged" },
  { value: "mule", label: "Mule" },
  // 2026-08-26 tier migration: high-tier ex-mules are now is_mule=false with
  // risk_level='high', so category=high yields a real (6,635-row) view again.
  { value: "high", label: "High Risk" },
];

// Rows revealed per "Load more" step — matches TransactionsContent's DISPLAY_CAP.
const REVEAL_STEP = 500;

export default function AccountsContent() {
  const [search, setSearch] = useState("");
  const [riskFilter, setRiskFilter] = useState("all");
  const [visibleCount, setVisibleCount] = useState(REVEAL_STEP);
  const [selectedAccount, setSelectedAccount] = useState<MappedAccount | null>(null);
  const { accounts, loading, error, refetch, loadMore, pagination } = useLocalData(riskFilter);

  const filtered = useMemo(() => {
    let result = [...accounts];
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(
        (a) =>
          a.id.toLowerCase().includes(q) ||
          a.name.toLowerCase().includes(q) ||
          a.city.toLowerCase().includes(q) ||
          a.bank.toLowerCase().includes(q)
      );
    }
    // Category filtering (Mule) happens server-side via the category param —
    // the API returns disjoint, pre-filtered account sets.
    result.sort((a, b) => b.riskScore - a.riskScore);
    return result;
  }, [accounts, search]);

  const displayed = filtered.slice(0, visibleCount);

  // Without an active search the server-reported category total is exact.
  // While searching, only rows fetched so far have been scanned (the hook
  // loads ≤1,000 per request out of e.g. 8,578 flagged accounts), so the
  // match count is labelled as partial below rather than presented as all.
  const totalLabel = search ? filtered.length : pagination.total || filtered.length;

  // Filter/search changes restart the reveal window — adjusting state inside
  // the handlers (not an effect) keeps a single render pass.
  const changeSearch = (v: string) => { setSearch(v); setVisibleCount(REVEAL_STEP); };
  const changeRisk = (v: string) => { setRiskFilter(v); setVisibleCount(REVEAL_STEP); };

  // Reveal more rows locally; once everything fetched is visible, pull the
  // next server page so browsing reaches beyond the initial 1,000-row window.
  const showMore = () => {
    setVisibleCount((c) => c + REVEAL_STEP);
    if (visibleCount + REVEAL_STEP >= filtered.length && pagination.hasMore && !loading) {
      loadMore();
    }
  };
  const hasMoreRows = visibleCount < filtered.length || (pagination.hasMore && !loading);

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
        onSearchChange={changeSearch}
        searchPlaceholder="Search accounts..."
        filters={[
          {
            label: "Risk",
            value: riskFilter,
            onChange: changeRisk,
            options: RISK_OPTIONS,
          },
        ]}
      />

      <DataTable
        caption="Flagged accounts — click a row for details and transaction history"
        onRowClick={(a) => setSelectedAccount(a)}
        columns={[
          {
            key: "id",
            header: "Account",
            render: (a: MappedAccount) => (
              <div>
                <span className="font-mono text-[13px] tracking-[-0.02em] text-bone block">
                  {a.id}
                </span>
                {/* Rendered so search hits on name are visible in the table. */}
                <span className="font-mono text-[11px] tracking-[-0.02em] text-bone block">
                  {a.name}
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
                  {a.riskScore.toFixed(0)}%
                </span>
              </div>
            ),
          },
          {
            key: "flags",
            header: "Flags",
            // All flags rendered — max observed per account is 6, and
            // flex-wrap keeps even that compact without hiding anything.
            render: (a: MappedAccount) => (
              <div className="flex flex-wrap gap-1">
                {a.flags.map((flag) => (
                  <span
                    key={flag}
                    className="font-mono text-[10px] tracking-[-0.02em] text-ash bg-charcoal/30 px-1.5 py-0.5 rounded-sm"
                  >
                    {flag}
                  </span>
                ))}
              </div>
            ),
          },
        ]}
        data={displayed}
        keyField="id"
        emptyMessage="No accounts match your filters"
        emptyDescription={
          search && pagination.total > accounts.length
            ? `Searched ${accounts.length.toLocaleString("en-IN")} of ${pagination.total.toLocaleString("en-IN")} accounts — load more to scan further.`
            : undefined
        }
      />

      <div className="flex items-center justify-between gap-3 mt-3">
        <p className="font-mono text-[11px] tracking-[-0.02em] text-ash">
          Showing {displayed.length.toLocaleString("en-IN")} of{" "}
          {totalLabel.toLocaleString("en-IN")} accounts
          {!search && pagination.total > accounts.length &&
            ` · ${accounts.length.toLocaleString("en-IN")} loaded`}
          {search && pagination.total > accounts.length &&
            ` · searched ${accounts.length.toLocaleString("en-IN")}`}
        </p>
        {hasMoreRows && (
          <button
            onClick={showMore}
            disabled={loading}
            className="font-mono text-[11px] tracking-[-0.02em] text-bone bg-surface-1 border border-frost/10 rounded-sm px-3 py-1 hover:bg-surface-2 disabled:opacity-40 disabled:cursor-not-allowed transition-default shrink-0"
          >
            Load more
          </button>
        )}
      </div>

      <p className="font-mono text-[10px] tracking-[-0.02em] text-ash mt-2" aria-hidden="true">
        Click any account row to inspect its details and full transaction history.
      </p>

      {selectedAccount && (
        <AccountDrawer account={selectedAccount} onClose={() => setSelectedAccount(null)} />
      )}
    </div>
  );
}
