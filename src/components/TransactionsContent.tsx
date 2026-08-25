"use client";

import { useFirestoreData } from "@/lib/useFirestoreData";
import { useState, useMemo } from "react";
import PageHeader from "@/components/ui/PageHeader";
import FilterBar from "@/components/ui/FilterBar";
import DataTable from "@/components/ui/DataTable";
import LoadingState from "@/components/ui/LoadingState";
import ErrorState from "@/components/ui/ErrorState";

export default function TransactionsContent() {
  const { accounts, transactions, loading, error, refetch } = useFirestoreData();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  // Map-based lookup — the previous Array.find per row × 2 cols was O(n·m)
  // (~10⁸ comparisons on the full flagged set) and stalled typing badly.
  const nameById = useMemo(
    () => new Map(accounts.map((a) => [a.id, a.name])),
    [accounts]
  );
  const getAccountName = (id: string) => nameById.get(id) || id;

  const flaggedTransactions = useMemo(
    () => transactions.filter((t) => t.flagged),
    [transactions]
  );

  const DISPLAY_CAP = 500;

  const filtered = useMemo(() => {
    let result = [...flaggedTransactions];
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (t) =>
          t.id.toLowerCase().includes(q) ||
          t.from.toLowerCase().includes(q) ||
          t.to.toLowerCase().includes(q) ||
          (nameById.get(t.from) || "").toLowerCase().includes(q) ||
          (nameById.get(t.to) || "").toLowerCase().includes(q)
      );
    }
    if (typeFilter !== "all") {
      result = result.filter((t) => t.type === typeFilter);
    }
    return result.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }, [flaggedTransactions, search, typeFilter, nameById]);

  const displayed = useMemo(() => filtered.slice(0, DISPLAY_CAP), [filtered]);

  if (loading) {
    return (
      <div className="p-8">
        <LoadingState />
      </div>
    );
  }

  if (error && accounts.length === 0 && transactions.length === 0) {
    return (
      <div className="p-8">
        <ErrorState message="Couldn't load transactions" description={error} onRetry={refetch} />
      </div>
    );
  }

  const columns = [
    {
      key: "id",
      header: "Txn",
      render: (txn: (typeof transactions)[0]) => (
        <span className="font-mono text-[11px] tracking-[-0.02em] text-ash">{txn.id}</span>
      ),
    },
    {
      key: "from",
      header: "From",
      render: (txn: (typeof transactions)[0]) => (
        <span className="font-mono text-[13px] tracking-[-0.02em] text-bone">
          {getAccountName(txn.from)}
        </span>
      ),
    },
    {
      key: "arrow",
      header: "",
      render: () => (
        <span className="font-mono text-[10px] text-ash">→</span>
      ),
    },
    {
      key: "to",
      header: "To",
      render: (txn: (typeof transactions)[0]) => (
        <span className="font-mono text-[13px] tracking-[-0.02em] text-bone">
          {getAccountName(txn.to)}
        </span>
      ),
    },
    {
      key: "amount",
      header: "Amount",
      render: (txn: (typeof transactions)[0]) => (
        <span className="font-mono text-[13px] tracking-[-0.02em] text-bone">
          ₹{Number.isFinite(txn.amount) ? txn.amount.toLocaleString("en-IN", { maximumFractionDigits: 2 }) : "—"}
        </span>
      ),
    },
    {
      key: "type",
      header: "Type",
      render: (txn: (typeof transactions)[0]) => (
        <span className="font-mono text-[11px] tracking-[-0.02em] text-ash uppercase">
          {txn.type}
        </span>
      ),
    },
    {
      key: "riskScore",
      header: "Risk",
      render: (txn: (typeof transactions)[0]) => (
        <div className="flex items-center gap-2">
          <div className="w-10 h-[2px] bg-surface-2 rounded-full overflow-hidden">
            <div
              className="h-full bg-bone rounded-full"
              style={{ width: `${Math.min(Math.max(Number.isFinite(txn.riskScore) ? txn.riskScore : 0, 0), 100)}%` }}
            />
          </div>
          <span className="font-mono text-[11px] tracking-[-0.02em] text-ash">
            {Number.isFinite(txn.riskScore) ? Math.round(txn.riskScore) : 0}
          </span>
        </div>
      ),
    },
    {
      key: "timestamp",
      header: "Time",
      render: (txn: (typeof transactions)[0]) => (
        <span className="font-mono text-[11px] tracking-[-0.02em] text-ash">
          {new Date(txn.timestamp).toLocaleString("en-IN", {
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
        title="Transactions"
      />

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
        emptyMessage="No flagged transactions match your filters"
      />

      <p className="font-mono text-[11px] tracking-[-0.02em] text-ash mt-3">
        Showing {displayed.length.toLocaleString("en-IN")} of{" "}
        {filtered.length.toLocaleString("en-IN")} flagged transactions
        {filtered.length > displayed.length ? " (refine search to see more)" : ""}
      </p>
    </div>
  );
}
