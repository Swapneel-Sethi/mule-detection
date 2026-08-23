"use client";

import { useFirestoreData } from "@/lib/useFirestoreData";
import { useState, useMemo } from "react";
import PageHeader from "@/components/ui/PageHeader";
import FilterBar from "@/components/ui/FilterBar";
import DataTable from "@/components/ui/DataTable";
import LoadingState from "@/components/ui/LoadingState";

export default function TransactionsContent() {
  const { accounts, transactions, loading } = useFirestoreData();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [showFlaggedOnly, setShowFlaggedOnly] = useState(false);

  const getAccountName = (id: string) => accounts.find((a) => a.id === id)?.name || id;

  const filtered = useMemo(() => {
    let result = [...transactions];
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
    if (showFlaggedOnly) {
      result = result.filter((t) => t.flagged);
    }
    return result.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }, [transactions, search, typeFilter, showFlaggedOnly]);

  if (loading) {
    return (
      <div className="p-8">
        <LoadingState />
      </div>
    );
  }

  const flaggedCount = transactions.filter((t) => t.flagged).length;

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
        <span
          className={`font-mono text-[13px] tracking-[-0.02em] ${txn.flagged ? "text-bone" : "text-ash"}`}
        >
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
      key: "flagged",
      header: "Status",
      render: (txn: (typeof transactions)[0]) => (
        <span
          className={`font-mono text-[11px] tracking-[-0.02em] ${
            txn.flagged ? "text-red" : "text-ash"
          }`}
        >
          {txn.flagged ? "FLAGGED" : "—"}
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
        searchPlaceholder="Search transactions..."
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
      >
        <button
          onClick={() => setShowFlaggedOnly(!showFlaggedOnly)}
          className={`font-mono text-[11px] tracking-[-0.02em] uppercase px-3 py-2 border rounded-sm transition-default ${
            showFlaggedOnly
              ? "bg-surface-2 text-bone border-frost/20"
              : "bg-void text-ash border-frost/10 hover:border-frost/30"
          }`}
        >
          {showFlaggedOnly ? `Flagged (${flaggedCount})` : "All Txns"}
        </button>
      </FilterBar>

      <DataTable
        columns={columns}
        data={filtered.slice(0, 30)}
        keyField="id"
        emptyMessage="No transactions match your filters"
      />

      <p className="font-mono text-[11px] tracking-[-0.02em] text-ash mt-3">
        Showing {Math.min(30, filtered.length)} of {filtered.length}
      </p>
    </div>
  );
}
