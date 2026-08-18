"use client";

import { useFirestoreData } from "@/lib/useFirestoreData";
import { useState, useMemo } from "react";

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
        (t) => t.id.toLowerCase().includes(q) || t.from.toLowerCase().includes(q) || t.to.toLowerCase().includes(q)
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
      <div className="p-10 max-w-[1200px] mx-auto">
        <div className="flex items-center justify-center h-64">
          <span className="font-mono text-[10px] tracking-[-0.02em] text-ash">Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-10 max-w-[1200px] mx-auto">
      <div className="mb-8">
        <h1 className="font-display text-[30px] font-normal leading-[1] text-bone tracking-tight mb-2">
          Transactions
        </h1>
        <div className="h-[1px] bg-frost/20 w-[100px] mb-3" />
        <p className="font-mono text-[10px] tracking-[-0.02em] text-ash uppercase">
          {transactions.length} total — {transactions.filter((t) => t.flagged).length} flagged
        </p>
      </div>

      <div className="flex items-center gap-3 mb-6">
        <input
          type="text"
          placeholder="Search..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 bg-void border border-frost/10 rounded-[2px] px-3 py-2 font-mono text-[12px] tracking-[-0.02em] text-bone placeholder:text-ash/40 focus:outline-none focus:border-frost/30"
        />
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="bg-void border border-frost/10 rounded-[2px] px-3 py-2 font-mono text-[12px] tracking-[-0.02em] text-bone appearance-none cursor-pointer focus:outline-none focus:border-frost/30"
        >
          <option value="all">All Types</option>
          <option value="transfer">Transfer</option>
          <option value="payment">Payment</option>
          <option value="withdrawal">Withdrawal</option>
          <option value="deposit">Deposit</option>
        </select>
        <button
          onClick={() => setShowFlaggedOnly(!showFlaggedOnly)}
          className={`font-mono text-[10px] tracking-[-0.02em] uppercase px-3 py-2 border rounded-[2px] transition-colors ${
            showFlaggedOnly ? "bg-charcoal text-bone border-frost/20" : "bg-void text-ash border-frost/10 hover:border-frost/30"
          }`}
        >
          {showFlaggedOnly ? "Flagged" : "All"}
        </button>
      </div>

      <div className="border border-frost/10 rounded-[10px] overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-frost/10">
              {["Txn", "From", "", "To", "Amount", "Type", "Risk", "Time"].map((h, i) => (
                <th key={i} className="text-left font-mono text-[10px] tracking-[-0.02em] text-ash uppercase px-5 py-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 30).map((txn) => (
              <tr key={txn.id} className={`border-b border-frost/5 hover:bg-charcoal/20 transition-colors ${txn.flagged ? "bg-charcoal/10" : ""}`}>
                <td className="px-5 py-3">
                  <span className="font-mono text-[10px] tracking-[-0.02em] text-ash">{txn.id}</span>
                </td>
                <td className="px-5 py-3">
                  <span className="font-mono text-[12px] tracking-[-0.02em] text-bone">{getAccountName(txn.from)}</span>
                </td>
                <td className="px-2 py-3">
                  <span className="font-mono text-[10px] text-ash">→</span>
                </td>
                <td className="px-5 py-3">
                  <span className="font-mono text-[12px] tracking-[-0.02em] text-bone">{getAccountName(txn.to)}</span>
                </td>
                <td className="px-5 py-3">
                  <span className={`font-mono text-[12px] tracking-[-0.02em] ${txn.flagged ? "text-bone" : "text-ash"}`}>
                    ₹{txn.amount.toLocaleString("en-IN")}
                  </span>
                </td>
                <td className="px-5 py-3">
                  <span className="font-mono text-[10px] tracking-[-0.02em] text-ash uppercase">{txn.type}</span>
                </td>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-10 h-[2px] bg-charcoal rounded-full overflow-hidden">
                      <div className="h-full bg-bone rounded-full" style={{ width: `${txn.riskScore}%` }} />
                    </div>
                    <span className="font-mono text-[10px] tracking-[-0.02em] text-ash">{Math.round(txn.riskScore)}</span>
                  </div>
                </td>
                <td className="px-5 py-3">
                  <span className="font-mono text-[10px] tracking-[-0.02em] text-ash">
                    {new Date(txn.timestamp).toLocaleString("en-IN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="font-mono text-[10px] tracking-[-0.02em] text-ash mt-3">
        Showing {Math.min(30, filtered.length)} of {filtered.length}
      </p>
    </div>
  );
}
