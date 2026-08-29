"use client";

import { useFirestoreData } from "@/lib/useFirestoreData";
import { useState, useMemo } from "react";
import PageHeader from "@/components/ui/PageHeader";
import FilterBar from "@/components/ui/FilterBar";
import DataTable, { Column } from "@/components/ui/DataTable";
import LoadingState from "@/components/ui/LoadingState";
import { formatCurrencyINR } from "@/lib/utils";

type TransactionItem = ReturnType<typeof useFirestoreData>["transactions"][0];

export default function TransactionsContent() {
  const { transactions, loading } = useFirestoreData();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [showFlaggedOnly, setShowFlaggedOnly] = useState(false);

  const filtered = useMemo(() => {
    let result = [...transactions];
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (t) =>
          t.id.toLowerCase().includes(q) ||
          t.from.toLowerCase().includes(q) ||
          t.to.toLowerCase().includes(q) ||
          (t.type && t.type.toLowerCase().includes(q))
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
      <div className="p-8 max-w-[1400px] mx-auto">
        <PageHeader title="Transaction Ledger" subtitle="Loading corridor activity..." />
        <LoadingState message="Processing live corridor transactions..." />
      </div>
    );
  }

  const flaggedCount = transactions.filter((t) => t.flagged).length;

  const columns: Column<TransactionItem>[] = [
    {
      key: "id",
      header: "Transaction ID",
      render: (t) => (
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] font-bold text-fg">{t.id}</span>
          {t.flagged && (
            <span className="px-1.5 py-0.2 text-[9px] rounded font-bold uppercase bg-risk-critical/20 text-risk-critical border border-risk-critical/40">
              FLAGGED
            </span>
          )}
        </div>
      ),
    },
    {
      key: "corridor",
      header: "Origin → Destination",
      render: (t) => (
        <div className="flex items-center gap-2 font-mono text-[12px]">
          <span className="text-fg-dim font-medium">{t.from}</span>
          <span className="text-accent font-bold">→</span>
          <span className="text-fg font-semibold">{t.to}</span>
        </div>
      ),
    },
    {
      key: "amount",
      header: "Flow Amount",
      render: (t) => (
        <span className={`font-mono text-[13px] font-bold ${t.flagged ? "text-risk-critical" : "text-fg"}`}>
          {formatCurrencyINR(t.amount)}
        </span>
      ),
    },
    {
      key: "type",
      header: "Payment Mode",
      render: (t) => (
        <span className="px-2 py-0.5 rounded font-mono text-[10px] font-semibold uppercase bg-bg-surface border border-border/30 text-fg-dim">
          {t.type || "UPI"}
        </span>
      ),
    },
    {
      key: "riskScore",
      header: "Risk Index",
      render: (t) => {
        const score = t.riskScore || (t.flagged ? 85 : 15);
        const color = score >= 60 ? "#ef4562" : score >= 40 ? "#f2a35c" : "#10b981";
        return (
          <div className="flex items-center gap-2">
            <div className="w-12 h-1.5 bg-bg-surface rounded-full overflow-hidden border border-border/20">
              <div className="h-full rounded-full" style={{ width: `${score}%`, backgroundColor: color }} />
            </div>
            <span className="font-mono text-[11px] font-semibold text-fg">{score.toFixed(0)}%</span>
          </div>
        );
      },
    },
    {
      key: "timestamp",
      header: "Timestamp",
      render: (t) => (
        <span className="font-mono text-[11px] text-fg-dim">
          {t.timestamp
            ? new Date(t.timestamp).toLocaleString("en-IN", {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })
            : "Live"}
        </span>
      ),
    },
  ];

  return (
    <div className="p-8 max-w-[1400px] mx-auto space-y-6">
      <PageHeader
        title="Transaction Corridors & Ledger"
        subtitle={`${transactions.length.toLocaleString("en-IN")} Live Transactions Monitored • ${flaggedCount.toLocaleString("en-IN")} Flagged High-Risk Flows`}
        badge="Surveillance Ledger"
      />

      {/* Filter Bar */}
      <FilterBar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Filter by Txn ID, Origin Account, Destination Account..."
        filters={[
          {
            value: typeFilter,
            onChange: setTypeFilter,
            label: "Transfer Type",
            options: [
              { value: "all", label: "All Payment Modes" },
              { value: "transfer", label: "Direct Transfer" },
              { value: "payment", label: "UPI / Merchant Payment" },
              { value: "withdrawal", label: "Cash Withdrawal (Drain)" },
              { value: "deposit", label: "Cash / Inbound Deposit" },
            ],
          },
        ]}
      >
        <button
          onClick={() => setShowFlaggedOnly(!showFlaggedOnly)}
          className={`font-mono text-[11px] uppercase tracking-wider px-3.5 py-2 border rounded-md font-bold transition-all ${
            showFlaggedOnly
              ? "bg-risk-critical/20 text-risk-critical border-risk-critical/50 shadow-sm"
              : "bg-bg-surface text-fg-dim border-border/30 hover:text-fg hover:border-border/60"
          }`}
        >
          {showFlaggedOnly ? "⚠ Flagged Flows Only" : "Show All Flows"}
        </button>
      </FilterBar>

      {/* Main Table */}
      <DataTable
        columns={columns}
        data={filtered.slice(0, 50)}
        keyField="id"
        emptyMessage="No transaction corridors match current filters."
      />

      <div className="flex items-center justify-between font-mono text-[11px] text-fg-dim pt-2">
        <span>
          Displaying {Math.min(50, filtered.length).toLocaleString("en-IN")} of {filtered.length.toLocaleString("en-IN")} corridors
        </span>
        <span>Streaming Micro-Batch Ledger</span>
      </div>
    </div>
  );
}
