"use client";

import { useLocalData, type ApiTransaction } from "@/lib/useLocalData";
import { useState, useMemo } from "react";
import PageHeader from "@/components/ui/PageHeader";
import FilterBar from "@/components/ui/FilterBar";
import DataTable from "@/components/ui/DataTable";
import LoadingState from "@/components/ui/LoadingState";
import ErrorState from "@/components/ui/ErrorState";
import { formatCurrencyINR } from "@/lib/utils";

const DISPLAY_CAP = 500;

export default function TransactionsContent() {
  const { accounts, transactions, loading, error, refetch } = useLocalData();
  // The hook exports ApiTransaction explicitly for consumers — don't re-derive it.
  type Txn = ApiTransaction;
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  // Map-based lookup — the previous Array.find per row × 2 cols was O(n·m)
  // (~10⁸ comparisons on the full flagged set) and stalled typing badly.
  // NOTE: resolves only the accounts page the hook fetched (top-1000 by
  // risk); endpoints outside it degrade to their raw account id.
  const nameById = useMemo(
    () => new Map(accounts.map((a) => [a.id, a.name])),
    [accounts]
  );
  const getAccountName = (id: string) => nameById.get(id) || id;

  // Timestamps are stamped UTC while analytics buckets in IST, so render the
  // same Asia/Kolkata wall-clock here. Unparsable stamps degrade to "—",
  // never "Invalid Date".
  const formatTxnTime = (timestamp: string) => {
    const ms = Date.parse(timestamp);
    if (Number.isNaN(ms)) return "—";
    return new Date(ms).toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Epoch parsed once per dataset instead of twice per sort comparison —
  // the flagged set is ~8k rows, so re-parsing Dates in the comparator
  // allocated ~200k Date objects on every keystroke.
  const flaggedTransactions = useMemo(
    () =>
      transactions
        .filter((t) => t.flagged)
        .map((t) => ({ txn: t, timeMs: Date.parse(t.timestamp) || 0 })),
    [transactions]
  );

  const filtered = useMemo(() => {
    let result = [...flaggedTransactions];
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(
        ({ txn: t }) =>
          t.id.toLowerCase().includes(q) ||
          t.from.toLowerCase().includes(q) ||
          t.to.toLowerCase().includes(q) ||
          (nameById.get(t.from) || "").toLowerCase().includes(q) ||
          (nameById.get(t.to) || "").toLowerCase().includes(q)
      );
    }
    if (typeFilter !== "all") {
      result = result.filter(({ txn: t }) => t.type === typeFilter);
    }
    return result.sort((a, b) => b.timeMs - a.timeMs);
  }, [flaggedTransactions, search, typeFilter, nameById]);

  const displayed = useMemo(
    () => filtered.slice(0, DISPLAY_CAP).map((e) => e.txn),
    [filtered]
  );

  // Warm refreshes keep the loaded table visible (Refreshing banner below);
  // only a cold load with nothing cached wipes to the skeleton.
  if (loading && accounts.length === 0 && transactions.length === 0) {
    return (
      <div className="p-8 max-w-[1200px] mx-auto">
        <PageHeader title="Transactions" />
        <LoadingState />
      </div>
    );
  }

  if (error && accounts.length === 0 && transactions.length === 0) {
    return (
      <div className="p-8 max-w-[1200px] mx-auto">
        <PageHeader title="Transactions" subtitle="Error" />
        <ErrorState message="Couldn't load transactions" description={error} onRetry={refetch} />
      </div>
    );
  }

  const columns = [
    {
      key: "id",
      header: "Txn",
      render: (txn: Txn) => (
        <span className="font-mono text-[11px] tracking-[-0.02em] text-ash">{txn.id}</span>
      ),
    },
    {
      key: "from",
      header: "From",
      render: (txn: Txn) => (
        <span className="font-mono text-[13px] tracking-[-0.02em] text-bone">
          {getAccountName(txn.from)}
        </span>
      ),
    },
    {
      key: "arrow",
      // Decorative separator — sr-only header so the column isn't announced
      // as unlabeled, glyph hidden from assistive tech.
      header: "From → To",
      headerClassName: "sr-only",
      render: () => (
        <span aria-hidden="true" className="font-mono text-[10px] text-ash">→</span>
      ),
    },
    {
      key: "to",
      header: "To",
      render: (txn: Txn) => (
        <span className="font-mono text-[13px] tracking-[-0.02em] text-bone">
          {getAccountName(txn.to)}
        </span>
      ),
    },
    {
      key: "amount",
      header: "Amount",
      // Compact INR like the Dashboard/Analytics stat cards; the exact rupee
      // figure stays reachable via the tooltip for reconciliation work.
      render: (txn: Txn) => (
        <span
          className="font-mono text-[13px] tracking-[-0.02em] text-bone"
          title={
            Number.isFinite(txn.amount)
              ? `₹${txn.amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              : undefined
          }
        >
          {Number.isFinite(txn.amount) ? formatCurrencyINR(txn.amount) : "—"}
        </span>
      ),
    },
    {
      key: "type",
      header: "Type",
      render: (txn: Txn) => (
        <span className="font-mono text-[11px] tracking-[-0.02em] text-ash uppercase">
          {txn.type}
        </span>
      ),
    },
    {
      key: "riskScore",
      header: "Risk",
      // Bar tint matches the score bands used elsewhere (>=80 critical,
      // >=60 high, >=30 medium, else low); corrupt scores read as 0.
      render: (txn: Txn) => {
        const score = Number.isFinite(txn.riskScore) ? txn.riskScore : 0;
        const barColor =
          score >= 80 ? "bg-risk-critical"
          : score >= 60 ? "bg-risk-high"
          : score >= 30 ? "bg-risk-medium"
          : "bg-risk-low";
        return (
          <div className="flex items-center gap-2">
            <div className="w-10 h-[2px] bg-surface-2 rounded-full overflow-hidden">
              <div
                className={`h-full ${barColor} rounded-full`}
                style={{ width: `${Math.min(Math.max(score, 0), 100)}%` }}
              />
            </div>
            <span className="font-mono text-[11px] tracking-[-0.02em] text-ash">
              {Math.round(score)}
            </span>
          </div>
        );
      },
    },
    {
      key: "timestamp",
      header: "Time",
      render: (txn: Txn) => (
        <span className="font-mono text-[11px] tracking-[-0.02em] text-ash">
          {formatTxnTime(txn.timestamp)}
        </span>
      ),
    },
  ];

  return (
    <div className="p-8 max-w-[1200px] mx-auto">
      <PageHeader
        title="Transactions"
      />

      {loading && accounts.length > 0 && (
        <p className="font-mono text-[11px] tracking-[-0.02em] text-ash mb-2" role="status" aria-live="polite">
          Refreshing…
        </p>
      )}

      {/* Banner regardless of row count — the both-empty case returns the
          full ErrorState above, so this never double-renders. */}
      {!loading && error && (
        <p className="font-mono text-[11px] tracking-[-0.02em] text-ash mb-2" role="alert">
          Refresh failed — showing previously loaded transactions. {error}
        </p>
      )}

      <FilterBar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search flagged transactions..."
        filters={[
          {
            value: typeFilter,
            onChange: setTypeFilter,
            label: "Type",
            options: [
              { value: "all", label: "All Types" },
              { value: "upi", label: "UPI" },
              { value: "imps", label: "IMPS" },
              { value: "neft", label: "NEFT" },
              { value: "rtgs", label: "RTGS" },
            ],
          },
        ]}
      />

      <DataTable
        columns={columns}
        data={displayed}
        keyField="id"
        caption="Flagged transactions"
        emptyMessage="No flagged transactions match your filters"
      />

      <p className="font-mono text-[11px] tracking-[-0.02em] text-ash mt-3">
        {filtered.length > displayed.length
          ? `Showing first ${DISPLAY_CAP.toLocaleString("en-IN")} of ${filtered.length.toLocaleString("en-IN")} flagged transactions — search to narrow further.`
          : `Showing ${displayed.length.toLocaleString("en-IN")} of ${filtered.length.toLocaleString("en-IN")} flagged transactions`}
      </p>
    </div>
  );
}
