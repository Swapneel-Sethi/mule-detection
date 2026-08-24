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

  const getAccountName = (id: string) => accounts.find((a) => a.id === id)?.name || id;

  const flaggedTransactions = useMemo(
    () => transactions.filter((t) => t.flagged),
    [transactions]
  );

  const filtered = useMemo(() => {
    let result = [...flaggedTransactions];
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (t) =>
          t.id.toLowerCase().includes(q) ||
          t.from.toLowerCase().includes(q) ||
          t.to.toLowerCase().includes(q)
      );
    }
    if (typeFilter !== "all") {
      result = result.filter((t) => t.type === typeFilter);
    }
    return result.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }, [flaggedTransactions, search, typeFilter]);

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
          ₹{txn.amount.toLocaleString("en-IN")}
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
              style={{ width: `${txn.riskScore}%` }}
            />
          </div>
          <span className="font-mono text-[11px] tracking-[-0.02em] text-ash">
            {Math.round(txn.riskScore)}
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
        data={filtered}
        keyField="id"
        emptyMessage="No flagged transactions match your filters"
      />

      <p className="font-mono text-[11px] tracking-[-0.02em] text-ash mt-3">
        Showing {filtered.length} flagged transactions
      </p>
    </div>
  );
}
