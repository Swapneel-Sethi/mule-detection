"use client";

import { useFirestoreData, type MappedAccount } from "@/lib/useFirestoreData";
import { useState, useMemo } from "react";
import PageHeader from "@/components/ui/PageHeader";
import FilterBar from "@/components/ui/FilterBar";
import DataTable, { Column } from "@/components/ui/DataTable";
import RiskBadge from "@/components/ui/RiskBadge";
import LoadingState from "@/components/ui/LoadingState";
import Card from "@/components/ui/Card";
import { formatCurrencyINR } from "@/lib/utils";

const RISK_OPTIONS = [
  { value: "all", label: "All Risk Levels" },
  { value: "critical", label: "Critical Risk (80-100%)" },
  { value: "high", label: "High Risk (60-79%)" },
  { value: "medium", label: "Watchlist (40-59%)" },
  { value: "low", label: "Normal (0-39%)" },
];

const MULE_OPTIONS = [
  { value: "all", label: "All Classifications" },
  { value: "mule", label: "Mule Accounts Only" },
  { value: "safe", label: "Normal Accounts Only" },
];

export default function AccountsContent() {
  const { accounts, loading } = useFirestoreData();
  const [search, setSearch] = useState("");
  const [riskFilter, setRiskFilter] = useState("all");
  const [muleFilter, setMuleFilter] = useState("all");
  const [selectedAccount, setSelectedAccount] = useState<MappedAccount | null>(null);

  const filtered = useMemo(() => {
    let result = [...accounts];
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (a) =>
          a.id.toLowerCase().includes(q) ||
          a.name.toLowerCase().includes(q) ||
          a.bank.toLowerCase().includes(q) ||
          a.city.toLowerCase().includes(q)
      );
    }
    if (riskFilter !== "all") {
      result = result.filter((a) => a.riskLevel === riskFilter);
    }
    if (muleFilter === "mule") {
      result = result.filter((a) => a.isMule);
    } else if (muleFilter === "safe") {
      result = result.filter((a) => !a.isMule);
    }
    result.sort((a, b) => b.riskScore - a.riskScore);
    return result;
  }, [accounts, search, riskFilter, muleFilter]);

  const displayed = filtered.slice(0, 100);

  if (loading) {
    return (
      <div className="p-8 max-w-[1400px] mx-auto">
        <PageHeader title="Accounts Intelligence" subtitle="Loading forensic directory..." />
        <LoadingState message="Querying 100,000+ Account Profiles..." />
      </div>
    );
  }

  const muleCount = accounts.filter((a) => a.isMule).length;

  const columns: Column<MappedAccount>[] = [
    {
      key: "id",
      header: "Account ID & Entity",
      render: (a) => (
        <button
          onClick={() => setSelectedAccount(a)}
          className="text-left group/btn"
        >
          <span className="font-mono text-[13px] font-bold text-fg group-hover/btn:text-accent transition-colors block">
            {a.id}
          </span>
          <span className="font-mono text-[11px] text-fg-dim block">
            {a.bank} • {a.city}
          </span>
        </button>
      ),
    },
    {
      key: "riskScore",
      header: "Risk Score",
      render: (a) => {
        const color =
          a.riskScore >= 80
            ? "#ef4562"
            : a.riskScore >= 60
            ? "#f2a35c"
            : a.riskScore >= 40
            ? "#65a9fa"
            : "#10b981";
        return (
          <div className="flex items-center gap-2.5">
            <div className="w-14 h-2 bg-bg-surface rounded-full overflow-hidden border border-border/20">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${Math.min(a.riskScore, 100)}%`, backgroundColor: color }}
              />
            </div>
            <span className="font-mono text-[13px] font-bold text-fg">
              {a.riskScore.toFixed(0)}%
            </span>
          </div>
        );
      },
    },
    {
      key: "riskLevel",
      header: "Risk Tier",
      render: (a) => <RiskBadge level={a.riskLevel} />,
    },
    {
      key: "turnover",
      header: "Turnover Volume",
      render: (a) => (
        <span className="font-mono text-[12px] font-semibold text-fg">
          {formatCurrencyINR(a.turnover)}
        </span>
      ),
    },
    {
      key: "degrees",
      header: "Flow Corridors",
      render: (a) => (
        <div className="font-mono text-[11px] text-fg-dim">
          <span className="text-risk-high">{a.inDegree} in</span> • <span className="text-accent">{a.outDegree} out</span>
        </div>
      ),
    },
    {
      key: "flags",
      header: "Pattern Flags",
      render: (a) => (
        <div className="flex flex-wrap gap-1">
          {a.flags.slice(0, 2).map((flag) => (
            <span
              key={flag}
              className="font-mono text-[10px] uppercase font-medium text-accent bg-accent/10 border border-accent/20 px-2 py-0.5 rounded"
            >
              {flag.replaceAll("_", " ")}
            </span>
          ))}
          {a.flags.length > 2 && (
            <span className="font-mono text-[10px] text-fg-dim px-1 py-0.5">
              +{a.flags.length - 2}
            </span>
          )}
        </div>
      ),
    },
    {
      key: "actions",
      header: "Dossier",
      render: (a) => (
        <button
          onClick={() => setSelectedAccount(a)}
          className="font-mono text-[11px] text-accent hover:text-accent-hover font-semibold underline uppercase tracking-wider"
        >
          Inspect
        </button>
      ),
    },
  ];

  return (
    <div className="p-8 max-w-[1400px] mx-auto space-y-6">
      <PageHeader
        title="Account Surveillance & Forensics"
        subtitle={`${accounts.length.toLocaleString("en-IN")} Accounts Analyzed • ${muleCount.toLocaleString("en-IN")} Flagged Mules • XGBoost + Graph Neural Features`}
        badge="Entity Intelligence"
      />

      {/* Filter Bar */}
      <FilterBar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Filter by Account ID, Holder Name, Bank (SBI, HDFC, ICICI), City..."
        filters={[
          {
            label: "Risk Level",
            value: riskFilter,
            onChange: setRiskFilter,
            options: RISK_OPTIONS,
          },
          {
            label: "Classification",
            value: muleFilter,
            onChange: setMuleFilter,
            options: MULE_OPTIONS,
          },
        ]}
      />

      {/* Account Detail Modal / Inspection Drawer */}
      {selectedAccount && (
        <Card className="mb-6 border-accent/50 bg-bg-card/95 p-6 shadow-2xl relative">
          <button
            onClick={() => setSelectedAccount(null)}
            className="absolute right-4 top-4 font-mono text-xs text-fg-dim hover:text-fg bg-bg-surface px-2.5 py-1 rounded border border-border/30"
          >
            ✕ Close Details
          </button>
          <div className="flex flex-wrap items-center gap-4 mb-4">
            <div>
              <p className="font-mono text-xs text-accent uppercase font-bold tracking-wider">Account Forensic Dossier</p>
              <h2 className="font-display text-2xl font-bold text-fg">{selectedAccount.id} — {selectedAccount.name}</h2>
            </div>
            <RiskBadge level={selectedAccount.riskLevel} />
            {selectedAccount.isMule && (
              <span className="px-2.5 py-1 rounded bg-risk-critical/20 text-risk-critical border border-risk-critical/40 font-mono text-xs font-bold uppercase">
                CONFIRMED MULE NODE
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <div className="p-3 bg-bg-surface rounded-md border border-border/20">
              <p className="font-mono text-[10px] text-fg-dim uppercase">Bank & Location</p>
              <p className="font-mono text-xs text-fg font-bold mt-1">{selectedAccount.bank} • {selectedAccount.city}</p>
            </div>
            <div className="p-3 bg-bg-surface rounded-md border border-border/20">
              <p className="font-mono text-[10px] text-fg-dim uppercase">Cumulative Turnover</p>
              <p className="font-mono text-xs text-accent font-bold mt-1">{formatCurrencyINR(selectedAccount.turnover)}</p>
            </div>
            <div className="p-3 bg-bg-surface rounded-md border border-border/20">
              <p className="font-mono text-[10px] text-fg-dim uppercase">In / Out Degrees</p>
              <p className="font-mono text-xs text-fg font-bold mt-1">{selectedAccount.inDegree} senders / {selectedAccount.outDegree} receivers</p>
            </div>
            <div className="p-3 bg-bg-surface rounded-md border border-border/20">
              <p className="font-mono text-[10px] text-fg-dim uppercase">Calibrated Risk Score</p>
              <p className="font-mono text-sm text-risk-critical font-bold mt-1">{selectedAccount.riskScore.toFixed(1)}%</p>
            </div>
          </div>

          <div className="space-y-2">
            <p className="font-mono text-[11px] text-fg-dim uppercase tracking-wider font-semibold">Active Typology Indicators:</p>
            <div className="flex flex-wrap gap-2">
              {selectedAccount.flags.length > 0 ? (
                selectedAccount.flags.map((f) => (
                  <span key={f} className="px-2.5 py-1 rounded-full bg-accent/10 border border-accent/30 text-accent font-mono text-[11px] font-medium">
                    ⚡ {f.replaceAll("_", " ").toUpperCase()}
                  </span>
                ))
              ) : (
                <span className="font-mono text-xs text-fg-dim">No anomalous behavioral flags triggered.</span>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Main Table */}
      <DataTable
        columns={columns}
        data={displayed}
        keyField="id"
        emptyMessage="No accounts matched the applied filters."
      />

      <div className="flex items-center justify-between font-mono text-[11px] text-fg-dim pt-2">
        <span>
          Showing top {displayed.length.toLocaleString("en-IN")} sorted accounts (from {filtered.length.toLocaleString("en-IN")} matching)
        </span>
        <span>High-Performance In-Memory Index</span>
      </div>
    </div>
  );
}
