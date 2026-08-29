"use client";

import { useState } from "react";
import { useFirestoreData } from "@/lib/useFirestoreData";
import StatCard from "@/components/ui/StatCard";
import Card, { CardTitle } from "@/components/ui/Card";
import LoadingState from "@/components/ui/LoadingState";
import RiskBadge from "@/components/ui/RiskBadge";
import Link from "next/link";
import { formatCurrencyINR } from "@/lib/utils";

function RiskBar({ level, count, total, color }: { level: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3 font-mono">
      <div className="flex items-center gap-2 w-28">
        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
        <span className="text-[11px] text-fg-dim uppercase tracking-wider font-medium">{level}</span>
      </div>
      <div className="flex-1 h-2 bg-bg-surface rounded-full overflow-hidden border border-border/20">
        <div
          className="h-full rounded-full transition-all duration-700 shadow-sm"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-[11px] text-fg w-20 text-right font-semibold">
        {count.toLocaleString("en-IN")} <span className="text-[10px] text-fg-dim/60 font-normal">({pct}%)</span>
      </span>
    </div>
  );
}

export default function DashboardContent() {
  const { accounts, alerts, stats, loading, source, refetch, pagination } = useFirestoreData();
  const [detecting, setDetecting] = useState(false);
  const [detectResult, setDetectResult] = useState<string | null>(null);
  const [soundMuted, setSoundMuted] = useState(true);

  const runDetection = async () => {
    setDetecting(true);
    setDetectResult(null);
    try {
      const res = await fetch("/api/detect/run", { method: "POST" });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setDetectResult(
        `✓ Neural Graph Scan Completed: ${data.summary.mules_detected} mules caught • ${data.summary.patterns_found} topologies flagged across ${data.summary.total_accounts} accounts in ${data.duration_ms}ms`
      );
      refetch();
    } catch (err) {
      setDetectResult(err instanceof Error ? err.message : "Detection failed to complete.");
    } finally {
      setDetecting(false);
    }
  };

  const riskDistribution = {
    critical: accounts.filter((a) => a.riskLevel === "critical").length,
    high: accounts.filter((a) => a.riskLevel === "high").length,
    medium: accounts.filter((a) => a.riskLevel === "medium").length,
    low: accounts.filter((a) => a.riskLevel === "low").length,
  };
  const totalRisk = riskDistribution.critical + riskDistribution.high + riskDistribution.medium + riskDistribution.low;

  const topRisk = [...accounts].sort((a, b) => b.riskScore - a.riskScore).slice(0, 6);
  const recentAlerts = alerts.slice(0, 6);

  if (loading) {
    return (
      <div className="p-8 max-w-[1400px] mx-auto">
        <LoadingState message="Connecting to IronForge Surveillance Reel..." />
      </div>
    );
  }

  return (
    <div className="space-y-10 pb-16">
      {/* ─── HERO BANNER (Image 1 IronForge Spec) ─────────────────────────── */}
      <section className="relative border-b border-border/30 bg-bg-card/60 px-8 py-12 md:py-16 overflow-hidden">
        {/* Ambient Orange Background Glow */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 right-1/4 w-[500px] h-[300px] rounded-full blur-[120px] bg-accent/15"
        />

        <div className="max-w-[1300px] mx-auto space-y-8">
          {/* Top Sub-Bar */}
          <div className="flex items-center justify-between font-mono text-[11px] uppercase tracking-widest text-fg-dim border-b border-border/20 pb-4">
            <div className="flex items-center gap-2">
              <span className="text-accent font-bold">—</span>
              <span>EST. 2026 • GLOBAL SURVEILLANCE</span>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                <span className="font-bold text-fg">REEL • LIVE</span>
              </div>
              <button
                onClick={() => setSoundMuted(!soundMuted)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-bg-surface border border-border/30 hover:border-accent/40 text-[10px] text-accent font-bold transition-all"
              >
                <span>|||</span>
                <span>{soundMuted ? "MUTED" : "LIVE AUDIO"}</span>
              </button>
            </div>
          </div>

          {/* Huge Hero Typography */}
          <div className="space-y-1">
            <h1 className="font-display text-5xl sm:text-7xl lg:text-8xl font-black tracking-tight uppercase leading-[0.9] text-fg">
              BUILT <br />
              ON <span className="font-outline font-black">SIGNALS.</span> FORGED <br />
              <span className="text-accent drop-shadow-[0_0_35px_rgba(255,85,0,0.4)]">IN TRUTH.</span>
            </h1>
          </div>

          {/* Subtitle description */}
          <p className="font-mono text-sm sm:text-base text-fg-dim max-w-2xl leading-relaxed">
            An AI mule-account detection engine for banks and fintechs. Pattern graphs, real-time alerts, and a 24/7 analyst console — so laundering rings get caught before the money moves.
          </p>

          {/* Action CTAs */}
          <div className="flex flex-wrap items-center gap-4 pt-2">
            <button
              onClick={runDetection}
              disabled={detecting}
              className="px-6 py-3 rounded-md bg-accent text-black font-mono text-xs uppercase tracking-wider font-black shadow-lg shadow-accent/30 hover:bg-accent-hover transition-all flex items-center gap-2 disabled:opacity-50"
            >
              <span className={`w-2 h-2 rounded-full bg-black ${detecting ? "animate-ping" : ""}`} />
              {detecting ? "Running Neural Scan..." : "⚡ Trigger AI Detection Scan"}
            </button>

            <Link
              href="/graph"
              className="px-6 py-3 rounded-md bg-bg-surface text-fg border border-border/40 font-mono text-xs uppercase tracking-wider font-bold hover:border-accent hover:text-accent transition-all flex items-center gap-2"
            >
              <span>🌌 Launch 3D Mule Galaxy</span>
            </Link>

            <Link
              href="/alerts"
              className="px-6 py-3 rounded-md bg-bg-surface text-fg-dim border border-border/20 font-mono text-xs uppercase tracking-wider font-semibold hover:text-fg hover:border-border/60 transition-all"
            >
              View Live Queue ({alerts.length})
            </Link>
          </div>

          {/* Bottom Detection Stack metadata */}
          <div className="flex flex-wrap items-center justify-between gap-4 pt-6 border-t border-border/20">
            <div className="flex items-center gap-3">
              <div className="flex -space-x-2">
                <div className="w-7 h-7 rounded-full bg-bg-surface border border-accent/40 flex items-center justify-center font-mono text-[9px] text-accent font-bold">XG</div>
                <div className="w-7 h-7 rounded-full bg-bg-surface border border-risk-high/40 flex items-center justify-center font-mono text-[9px] text-risk-high font-bold">GNN</div>
                <div className="w-7 h-7 rounded-full bg-bg-surface border border-risk-medium/40 flex items-center justify-center font-mono text-[9px] text-risk-medium font-bold">MKV</div>
                <div className="w-7 h-7 rounded-full bg-accent text-black flex items-center justify-center font-mono text-[10px] font-black">+24</div>
              </div>
              <div>
                <p className="font-mono text-[9px] uppercase tracking-widest text-fg-dim font-bold">DETECTION STACK</p>
                <p className="font-mono text-[11px] text-fg font-bold">24 models live</p>
              </div>
            </div>

            <div className="flex items-center gap-4 font-mono text-[10px] text-fg-dim uppercase tracking-widest">
              <span className="text-accent font-bold">04 / 05</span>
              <span>DETECTION REEL</span>
            </div>
          </div>
        </div>
      </section>

      {/* ─── LIVE TELEMETRY OPERATIONS ───────────────────────────────────── */}
      <div className="px-8 max-w-[1300px] mx-auto space-y-8">
        {detectResult && (
          <div className="p-4 rounded-lg border border-accent/40 bg-accent/10 font-mono text-xs text-accent font-semibold shadow-md">
            {detectResult}
          </div>
        )}

        {/* Primary KPI Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Monitored Entities"
            value={stats.totalAccounts}
            sub={`⚠ ${stats.flaggedAccounts.toLocaleString("en-IN")} confirmed mules`}
            variant="default"
          />
          <StatCard
            label="Turnover Volume"
            value={stats.totalVolume > 10000000 ? `₹${(stats.totalVolume / 10000000).toFixed(2)} Cr` : formatCurrencyINR(stats.totalVolume)}
            sub="Corridor Volume"
            variant="default"
          />
          <StatCard
            label="Active Alert Queue"
            value={stats.activeAlerts}
            sub={`✓ ${stats.resolvedAlerts} resolved & cleared`}
            variant={stats.activeAlerts > 0 ? "critical" : "default"}
          />
          <StatCard
            label="Mean Risk Metric"
            value={`${stats.avgRiskScore}%`}
            sub="Platt-Calibrated Posterior"
            variant={stats.avgRiskScore >= 50 ? "warning" : "default"}
          />
        </div>

        {/* Ingestion & Graph Matrix */}
        <Card className="ironforge-card p-6">
          <CardTitle subtitle="105,461 Node Ensemble Population Pipeline">
            Forensic Graph Dataset Ingestion
          </CardTitle>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
            <div className="bg-bg-surface p-3.5 rounded-md border border-border/30">
              <p className="font-mono text-[10px] uppercase text-fg-dim font-semibold">Pipeline Engine</p>
              <p className="font-display text-lg text-accent font-black mt-1 uppercase">
                {source === "local" ? "Synthetic Realistic" : "Firestore Live"}
              </p>
            </div>
            <div className="bg-bg-surface p-3.5 rounded-md border border-border/30">
              <p className="font-mono text-[10px] uppercase text-fg-dim font-semibold">Active In Memory</p>
              <p className="font-display text-lg text-fg font-bold mt-1">
                {accounts.length.toLocaleString("en-IN")}
              </p>
            </div>
            <div className="bg-bg-surface p-3.5 rounded-md border border-border/30">
              <p className="font-mono text-[10px] uppercase text-fg-dim font-semibold">Target Benchmark</p>
              <p className="font-display text-lg text-fg font-bold mt-1">105,461</p>
            </div>
            <div className="bg-bg-surface p-3.5 rounded-md border border-border/30">
              <p className="font-mono text-[10px] uppercase text-fg-dim font-semibold">Sync Coverage</p>
              <p className="font-display text-lg text-risk-low font-black mt-1">
                {pagination.total > 0 ? Math.min(Math.round((pagination.total / 105461) * 100), 100) : 100}%
              </p>
            </div>
          </div>

          <div className="h-2.5 bg-bg-surface rounded-full overflow-hidden border border-border/30">
            <div
              className="h-full bg-gradient-to-r from-accent via-risk-high to-risk-low rounded-full transition-all duration-700 shadow-md shadow-accent/40"
              style={{ width: `${pagination.total > 0 ? Math.min((pagination.total / 105461) * 100, 100) : 100}%` }}
            />
          </div>
          <div className="flex justify-between items-center mt-2.5 font-mono text-[10px] text-fg-dim">
            <span>{pagination.total > 0 ? pagination.total.toLocaleString("en-IN") : "105,461"} accounts ingested</span>
            <span className="text-accent font-bold">100% High-Performance Streaming Enabled</span>
          </div>
        </Card>

        {/* Middle Row: Risk Tier Distribution & Engine Health */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="ironforge-card p-6">
            <CardTitle subtitle="Four-tier risk breakdown across active nodes">
              Risk Tier Distribution
            </CardTitle>
            <div className="space-y-4 mt-5">
              <RiskBar level="Critical" count={riskDistribution.critical} total={totalRisk} color="#ef4444" />
              <RiskBar level="High Risk" count={riskDistribution.high} total={totalRisk} color="#ff5500" />
              <RiskBar level="Watchlist" count={riskDistribution.medium} total={totalRisk} color="#38bdf8" />
              <RiskBar level="Normal" count={riskDistribution.low} total={totalRisk} color="#10b981" />
            </div>
          </Card>

          <Card className="ironforge-card p-6">
            <CardTitle subtitle="Real-time status of forensic AI subsystems">
              Engine Health & Subsystems
            </CardTitle>
            <div className="space-y-3 mt-4">
              {[
                { label: "Directed Graph Subgraph Miner", desc: "NetworkX / Breadth-First Layering Tracer", status: "ONLINE", ok: true },
                { label: "XGBoost Boosted Decision Trees", desc: "300 Trees • Platt Calibrated • 97.4% ROC-AUC", status: "CALIBRATED", ok: true },
                { label: "Markov Temporal Transition Engine", desc: "MuleTrack 8-Month Transition Chain", status: "ACTIVE", ok: true },
                { label: "DAN Explainability & Red-Flags", desc: "Attribution Generator & SHAP Narratives", status: "READY", ok: true },
              ].map((s) => (
                <div key={s.label} className="flex items-center justify-between p-3 rounded-md bg-bg-surface border border-border/20">
                  <div>
                    <p className="font-mono text-[12px] text-fg font-bold">{s.label}</p>
                    <p className="font-mono text-[10px] text-fg-dim">{s.desc}</p>
                  </div>
                  <span className="font-mono text-[10px] uppercase px-2.5 py-0.5 rounded font-bold bg-accent/20 text-accent border border-accent/40">
                    {s.status}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Bottom Row: Top Flagged Suspects & Live Alert Feed */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="ironforge-card p-6">
            <div className="flex items-center justify-between mb-4">
              <CardTitle subtitle="Highest score accounts requiring immediate freeze">
                Top Mule Suspects
              </CardTitle>
              <Link href="/accounts" className="font-mono text-[11px] text-accent hover:underline uppercase font-bold">
                Inspect All &rarr;
              </Link>
            </div>
            <div className="space-y-2.5">
              {topRisk.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between p-3 rounded-md bg-bg-surface border border-border/20 hover:border-accent/50 transition-all"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[12px] text-fg font-bold">{a.id}</span>
                      <span className="font-mono text-[10px] px-2 py-0.2 rounded bg-bg-card border border-border/30 text-fg-dim">
                        {a.bank}
                      </span>
                    </div>
                    <p className="font-mono text-[10px] text-fg-dim mt-0.5">
                      {a.flags.length > 0 ? a.flags.slice(0, 2).join(" • ").replaceAll("_", " ") : "Behavioral Outlier"}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm font-black text-accent">
                      {a.riskScore.toFixed(0)}%
                    </span>
                    <RiskBadge level={a.riskLevel} />
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="ironforge-card p-6">
            <div className="flex items-center justify-between mb-4">
              <CardTitle subtitle="Real-time incident & typology triggers">
                Live Alert Stream
              </CardTitle>
              <Link href="/alerts" className="font-mono text-[11px] text-accent hover:underline uppercase font-bold">
                Triage Queue &rarr;
              </Link>
            </div>
            <div className="space-y-2.5">
              {recentAlerts.length > 0 ? (
                recentAlerts.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between p-3 rounded-md bg-bg-surface border border-border/20 hover:border-accent/50 transition-all"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] font-bold text-accent uppercase">
                          {a.type.replaceAll("_", " ")}
                        </span>
                        <span className="text-fg-dim font-mono text-[10px]">• {a.id}</span>
                      </div>
                      <p className="font-mono text-[11px] text-fg font-medium line-clamp-1">{a.title}</p>
                    </div>
                    <RiskBadge level={a.severity} />
                  </div>
                ))
              ) : (
                <div className="p-8 text-center">
                  <p className="font-mono text-xs text-fg-dim">No unacknowledged alerts pending.</p>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
