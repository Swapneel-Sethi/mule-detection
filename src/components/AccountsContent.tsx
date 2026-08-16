"use client";

import { useFirestoreData, type MappedAccount } from "@/lib/useFirestoreData";
import { Shield, Search, Download } from "lucide-react";
import { useState, useMemo } from "react";

const riskColors: Record<string, string> = {
  critical: "#ef4444",
  high: "#f97316",
  medium: "#eab308",
  low: "#22c550",
};

const flagLabels: Record<string, string> = {
  fan_in: "Fan-In",
  fan_out: "Fan-Out",
  transit: "Transit",
  confirmed_mule: "Mule",
  near_zero_balance: "Zero Bal",
  high_velocity: "High Velocity",
  rapid_movement: "Rapid Move",
};

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
        (a) =>
          a.id.toLowerCase().includes(q) ||
          a.city.toLowerCase().includes(q)
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
          Accounts
        </h1>
        <p className="text-[15px] text-fog mt-2">
          {accounts.length.toLocaleString("en-IN")} accounts analyzed — {accounts.filter((a) => a.isMule).length} confirmed mules
        </p>
      </div>

      <div className="flex items-center gap-3 mb-6">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-mist" />
          <input
            type="text"
            placeholder="Search by ID or city..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-carbon border border-chalk rounded-[12px] pl-10 pr-4 py-2.5 text-[14px] text-paper-white placeholder:text-slate-mist focus:outline-none focus:border-fog"
          />
        </div>
        <select
          value={riskFilter}
          onChange={(e) => setRiskFilter(e.target.value)}
          className="bg-carbon border border-chalk rounded-[12px] px-4 py-2.5 text-[14px] text-paper-white appearance-none cursor-pointer focus:outline-none focus:border-fog"
        >
          <option value="all">All Risk Levels</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
          className="bg-carbon border border-chalk rounded-[12px] px-4 py-2.5 text-[14px] text-paper-white appearance-none cursor-pointer focus:outline-none focus:border-fog"
        >
          <option value="riskScore">Sort by Risk Score</option>
          <option value="totalTransactions">Sort by Transactions</option>
          <option value="totalAmount">Sort by Turnover</option>
        </select>
      </div>

      <div className="card-elevated overflow-x-auto">
        <table className="w-full min-w-[900px]">
          <thead>
            <tr className="border-b border-chalk">
              <th className="text-left text-[12px] font-medium text-fog uppercase tracking-wider px-5 py-3">Account</th>
              <th className="text-left text-[12px] font-medium text-fog uppercase tracking-wider px-5 py-3">City</th>
              <th className="text-left text-[12px] font-medium text-fog uppercase tracking-wider px-5 py-3">Risk Score</th>
              <th className="text-left text-[12px] font-medium text-fog uppercase tracking-wider px-5 py-3">Level</th>
              <th className="text-left text-[12px] font-medium text-fog uppercase tracking-wider px-5 py-3">Turnover</th>
              <th className="text-left text-[12px] font-medium text-fog uppercase tracking-wider px-5 py-3">In/Out</th>
              <th className="text-left text-[12px] font-medium text-fog uppercase tracking-wider px-5 py-3">Mule</th>
              <th className="text-left text-[12px] font-medium text-fog uppercase tracking-wider px-5 py-3">Flags</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 50).map((account) => (
              <tr
                key={account.id}
                className="border-b border-chalk/30 hover:bg-graphite/30 transition-colors cursor-pointer"
              >
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${account.isMule ? "bg-danger/20" : "bg-graphite"}`}>
                      <Shield className={`w-4 h-4 ${account.isMule ? "text-danger" : "text-fog"}`} />
                    </div>
                    <div>
                      <p className="text-[13px] text-paper-white font-medium font-mono">{account.id}</p>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-3.5 text-[13px] text-bone">{account.city}</td>
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-2">
                    <div className="w-14 h-1.5 bg-graphite rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.min(account.riskScore, 100)}%`,
                          backgroundColor: riskColors[account.riskLevel],
                        }}
                      />
                    </div>
                    <span
                      className="text-[13px] font-medium"
                      style={{ color: riskColors[account.riskLevel] }}
                    >
                      {account.riskScore.toFixed(1)}
                    </span>
                  </div>
                </td>
                <td className="px-5 py-3.5">
                  <span
                    className="text-[11px] font-medium capitalize px-2 py-0.5 rounded-full"
                    style={{
                      color: riskColors[account.riskLevel],
                      backgroundColor: `${riskColors[account.riskLevel]}15`,
                    }}
                  >
                    {account.riskLevel}
                  </span>
                </td>
                <td className="px-5 py-3.5 text-[13px] text-bone">
                  ₹{(account.turnover / 100000).toFixed(1)}L
                </td>
                <td className="px-5 py-3.5 text-[12px] text-slate-mist">
                  {account.inDegree} / {account.outDegree}
                </td>
                <td className="px-5 py-3.5">
                  {account.isMule ? (
                    <span className="text-[11px] text-danger font-medium bg-danger/10 px-2 py-0.5 rounded-full">
                      YES
                    </span>
                  ) : (
                    <span className="text-[11px] text-slate-mist">No</span>
                  )}
                </td>
                <td className="px-5 py-3.5">
                  <div className="flex flex-wrap gap-1">
                    {account.flags.slice(0, 3).map((flag) => (
                      <span
                        key={flag}
                        className="text-[10px] text-slate-mist bg-graphite/50 px-1.5 py-0.5 rounded"
                      >
                        {flagLabels[flag] || flag}
                      </span>
                    ))}
                    {account.flags.length > 3 && (
                      <span className="text-[10px] text-slate-mist bg-graphite/50 px-1.5 py-0.5 rounded">
                        +{account.flags.length - 3}
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between mt-4">
        <p className="text-[13px] text-slate-mist">
          Showing {Math.min(50, filtered.length)} of {filtered.length.toLocaleString("en-IN")} accounts
        </p>
      </div>
    </div>
  );
}
