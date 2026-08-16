"use client";

import { useFirestoreData } from "@/lib/useFirestoreData";
import { ArrowUpRight, Search, Filter } from "lucide-react";
import { useState, useMemo } from "react";

const typeColors: Record<string, string> = {
  transfer: "#3b82f6",
  payment: "#8b5cf6",
  withdrawal: "#ef4444",
  deposit: "#22c550",
};

export default function TransactionsContent() {
  const { accounts, transactions, loading } = useFirestoreData();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
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
    return result.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [transactions, search, typeFilter, showFlaggedOnly]);

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
          Transactions
        </h1>
        <p className="text-[15px] text-fog mt-2">
          Track and analyze transaction flows across the network
        </p>
      </div>

      <div className="flex items-center gap-3 mb-6">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-mist" />
          <input
            type="text"
            placeholder="Search transactions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-carbon border border-chalk rounded-[12px] pl-10 pr-4 py-2.5 text-[14px] text-paper-white placeholder:text-slate-mist focus:outline-none focus:border-fog"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="bg-carbon border border-chalk rounded-[12px] px-4 py-2.5 text-[14px] text-paper-white appearance-none cursor-pointer focus:outline-none focus:border-fog"
        >
          <option value="all">All Types</option>
          <option value="transfer">Transfer</option>
          <option value="payment">Payment</option>
          <option value="withdrawal">Withdrawal</option>
          <option value="deposit">Deposit</option>
        </select>
        <button
          onClick={() => setShowFlaggedOnly(!showFlaggedOnly)}
          className={`btn-primary flex items-center gap-2 ${showFlaggedOnly ? "bg-danger/20 border-danger text-danger" : ""}`}
        >
          <Filter className="w-4 h-4" />
          {showFlaggedOnly ? "Flagged Only" : "All"}
        </button>
      </div>

      <div className="card-elevated overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-chalk">
              <th className="text-left text-[12px] font-medium text-fog uppercase tracking-wider px-6 py-3">Txn ID</th>
              <th className="text-left text-[12px] font-medium text-fog uppercase tracking-wider px-6 py-3">From</th>
              <th className="text-left text-[12px] font-medium text-fog uppercase tracking-wider px-6 py-3"></th>
              <th className="text-left text-[12px] font-medium text-fog uppercase tracking-wider px-6 py-3">To</th>
              <th className="text-left text-[12px] font-medium text-fog uppercase tracking-wider px-6 py-3">Amount</th>
              <th className="text-left text-[12px] font-medium text-fog uppercase tracking-wider px-6 py-3">Type</th>
              <th className="text-left text-[12px] font-medium text-fog uppercase tracking-wider px-6 py-3">Risk</th>
              <th className="text-left text-[12px] font-medium text-fog uppercase tracking-wider px-6 py-3">Time</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 30).map((txn) => (
              <tr
                key={txn.id}
                className={`border-b border-chalk/30 hover:bg-graphite/30 transition-colors cursor-pointer ${
                  txn.flagged ? "bg-danger/5" : ""
                }`}
              >
                <td className="px-6 py-3.5">
                  <span className="text-[12px] text-slate-mist font-mono">{txn.id}</span>
                </td>
                <td className="px-6 py-3.5">
                  <div>
                    <p className="text-[13px] text-bone">{getAccountName(txn.from)}</p>
                    <p className="text-[11px] text-slate-mist">{txn.from}</p>
                  </div>
                </td>
                <td className="px-2 py-3.5">
                  <ArrowUpRight className="w-4 h-4 text-fog" />
                </td>
                <td className="px-6 py-3.5">
                  <div>
                    <p className="text-[13px] text-bone">{getAccountName(txn.to)}</p>
                    <p className="text-[11px] text-slate-mist">{txn.to}</p>
                  </div>
                </td>
                <td className="px-6 py-3.5">
                  <span className={`text-[14px] font-medium ${txn.flagged ? "text-danger" : "text-paper-white"}`}>
                    ₹{txn.amount.toLocaleString("en-IN")}
                  </span>
                </td>
                <td className="px-6 py-3.5">
                  <span
                    className="text-[11px] font-medium capitalize px-2 py-0.5 rounded-full"
                    style={{
                      color: typeColors[txn.type],
                      backgroundColor: `${typeColors[txn.type]}15`,
                    }}
                  >
                    {txn.type}
                  </span>
                </td>
                <td className="px-6 py-3.5">
                  <div className="flex items-center gap-2">
                    <div className="w-12 h-1.5 bg-graphite rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${txn.riskScore}%`,
                          backgroundColor: txn.riskScore >= 70 ? "#ef4444" : txn.riskScore >= 40 ? "#eab308" : "#22c550",
                        }}
                      />
                    </div>
                    <span className="text-[11px] text-slate-mist">{Math.round(txn.riskScore)}</span>
                  </div>
                </td>
                <td className="px-6 py-3.5">
                  <span className="text-[12px] text-slate-mist">
                    {new Date(txn.timestamp).toLocaleString("en-IN", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between mt-4">
        <p className="text-[13px] text-slate-mist">
          Showing {Math.min(30, filtered.length)} of {filtered.length} transactions
        </p>
      </div>
    </div>
  );
}
