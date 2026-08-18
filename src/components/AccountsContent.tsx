"use client";

import { useFirestoreData, type MappedAccount } from "@/lib/useFirestoreData";
import { useState, useMemo } from "react";

export default function AccountsContent() {
  const { accounts, loading } = useFirestoreData();
  const [search, setSearch] = useState("");
  const [riskFilter, setRiskFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"riskScore" | "totalTransactions" | "totalAmount">("riskScore");

  const filtered = useMemo(() => {
    let result = [...accounts];
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (a) => a.id.toLowerCase().includes(q) || a.city.toLowerCase().includes(q)
      );
    }
    if (riskFilter !== "all") {
      result = result.filter((a) => a.riskLevel === riskFilter);
    }
    result.sort((a, b) => b[sortBy] - a[sortBy]);
    return result;
  }, [accounts, search, riskFilter, sortBy]);

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
          Accounts
        </h1>
        <div className="h-[1px] bg-frost/20 w-[100px] mb-3" />
        <p className="font-mono text-[10px] tracking-[-0.02em] text-ash uppercase">
          {accounts.length.toLocaleString("en-IN")} analyzed — {accounts.filter((a) => a.isMule).length} mules
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
          value={riskFilter}
          onChange={(e) => setRiskFilter(e.target.value)}
          className="bg-void border border-frost/10 rounded-[2px] px-3 py-2 font-mono text-[12px] tracking-[-0.02em] text-bone appearance-none cursor-pointer focus:outline-none focus:border-frost/30"
        >
          <option value="all">All</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
          className="bg-void border border-frost/10 rounded-[2px] px-3 py-2 font-mono text-[12px] tracking-[-0.02em] text-bone appearance-none cursor-pointer focus:outline-none focus:border-frost/30"
        >
          <option value="riskScore">Risk</option>
          <option value="totalTransactions">Transactions</option>
          <option value="totalAmount">Turnover</option>
        </select>
      </div>

      <div className="border border-frost/10 rounded-[10px] overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-frost/10">
              {["Account", "Risk", "Behavioral", "Graph", "Temporal", "Mule", "Flags"].map((h) => (
                <th key={h} className="text-left font-mono text-[10px] tracking-[-0.02em] text-ash uppercase px-4 py-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 50).map((account) => (
              <tr key={account.id} className="border-b border-frost/5 hover:bg-charcoal/20 transition-colors">
                <td className="px-4 py-3">
                  <div>
                    <span className="font-mono text-[12px] tracking-[-0.02em] text-bone block">{account.id}</span>
                    <span className="font-mono text-[10px] tracking-[-0.02em] text-ash">{account.city}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-10 h-[2px] bg-charcoal rounded-full overflow-hidden">
                      <div className="h-full bg-bone rounded-full" style={{ width: `${Math.min(account.riskScore, 100)}%` }} />
                    </div>
                    <span className="font-mono text-[12px] tracking-[-0.02em] text-bone">{account.riskScore.toFixed(0)}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className="font-mono text-[11px] tracking-[-0.02em] text-ash">{(account.behavioralScore * 100).toFixed(0)}%</span>
                </td>
                <td className="px-4 py-3">
                  <span className="font-mono text-[11px] tracking-[-0.02em] text-ash">{(account.graphScore * 100).toFixed(0)}%</span>
                </td>
                <td className="px-4 py-3">
                  <span className="font-mono text-[11px] tracking-[-0.02em] text-ash">{(account.temporalScore * 100).toFixed(0)}%</span>
                </td>
                <td className="px-4 py-3">
                  {account.isMule ? (
                    <span className="font-mono text-[10px] tracking-[-0.02em] text-bone uppercase">Yes</span>
                  ) : (
                    <span className="font-mono text-[10px] tracking-[-0.02em] text-ash">—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {account.flags.slice(0, 2).map((flag) => (
                      <span key={flag} className="font-mono text-[10px] tracking-[-0.02em] text-ash bg-charcoal/30 px-1.5 py-0.5 rounded-[2px]">
                        {flag}
                      </span>
                    ))}
                    {account.flags.length > 2 && (
                      <span className="font-mono text-[10px] tracking-[-0.02em] text-ash">+{account.flags.length - 2}</span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="font-mono text-[10px] tracking-[-0.02em] text-ash mt-3">
        Showing {Math.min(50, filtered.length)} of {filtered.length.toLocaleString("en-IN")}
      </p>
    </div>
  );
}
