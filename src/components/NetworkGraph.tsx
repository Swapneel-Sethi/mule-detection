"use client";

import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { useFirestoreData } from "@/lib/useFirestoreData";
import type { DataSet, Edge, Network, Node, Options } from "vis-network/standalone";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import LoadingState from "@/components/ui/LoadingState";

// ─── Graph Limits ──────────────────────────────────────────────────────────

const MAX_NODES = 200;
const NEIGHBOR_BUDGET = 100;
const MAX_EDGES = 800;

// ─── Edge Colors ───────────────────────────────────────────────────────────

const EDGE_COLORS = {
  mule: "#ff4444",
  uncertain: "#ffaa44",
  safe: "#4488ff",
  default: "#555555",
};

function getEdgeColor(fromMule: boolean, toMule: boolean, fromRisk: number, toRisk: number): string {
  if (fromMule || toMule) return EDGE_COLORS.mule;
  if (fromRisk >= 60 || toRisk >= 60) return EDGE_COLORS.mule;
  if (fromRisk >= 40 || toRisk >= 40) return EDGE_COLORS.uncertain;
  return EDGE_COLORS.safe;
}

// ─── Graph Builder ─────────────────────────────────────────────────────────

function buildGraphData(
  accounts: ReturnType<typeof useFirestoreData>["accounts"],
  transactions: ReturnType<typeof useFirestoreData>["transactions"],
  filterMode: "mules" | "high-risk" | "all"
) {
  let coreAccounts: typeof accounts;
  if (filterMode === "mules") {
    coreAccounts = accounts.filter((a) => a.isMule);
  } else if (filterMode === "high-risk") {
    coreAccounts = accounts.filter((a) => a.isMule && a.riskScore >= 70);
  } else {
    coreAccounts = accounts.filter((a) => a.isMule || a.riskScore >= 55);
  }

  coreAccounts.sort((a, b) => b.riskScore - a.riskScore);
  if (coreAccounts.length > MAX_NODES) coreAccounts = coreAccounts.slice(0, MAX_NODES);

  const coreIds = new Set(coreAccounts.map((a) => a.id));
  const allAccountMap = new Map(accounts.map((a) => [a.id, a]));

  const nodeMap = new Map<string, {
    id: string; label: string; name: string; riskScore: number;
    isMule: boolean; isCore: boolean;
  }>();

  for (const a of coreAccounts) {
    nodeMap.set(a.id, {
      id: a.id, label: `${a.name}\n${a.id}`, name: a.name,
      riskScore: a.riskScore, isMule: a.isMule, isCore: true,
    });
  }

  const graphEdges: { from: string; to: string; flagged: boolean; amount: number }[] = [];
  const edgeSet = new Set<string>();

  for (const txn of transactions) {
    const fromIsCore = coreIds.has(txn.from);
    const toIsCore = coreIds.has(txn.to);
    if (!fromIsCore && !toIsCore) continue;

    for (const cid of [txn.from, txn.to]) {
      if (!nodeMap.has(cid) && nodeMap.size < MAX_NODES + NEIGHBOR_BUDGET) {
        const acc = allAccountMap.get(cid);
        nodeMap.set(cid, {
          id: cid, label: `${acc?.name ?? cid}\n${cid}`, name: acc?.name ?? cid,
          riskScore: acc?.riskScore ?? 0, isMule: acc?.isMule ?? false, isCore: false,
        });
      }
    }

    const edgeKey = `${txn.from}->${txn.to}`;
    if (edgeSet.has(edgeKey)) continue;
    edgeSet.add(edgeKey);
    if (graphEdges.length >= MAX_EDGES) break;

    const fromAcc = allAccountMap.get(txn.from);
    const toAcc = allAccountMap.get(txn.to);
    graphEdges.push({
      from: txn.from, to: txn.to,
      flagged: txn.flagged || fromAcc?.isMule || toAcc?.isMule || false,
      amount: txn.amount,
    });
  }

  return {
    graphNodes: Array.from(nodeMap.values()),
    displayEdges: graphEdges,
    filteredCount: coreAccounts.length,
    totalCount: accounts.length,
    muleCount: coreAccounts.filter((a) => a.isMule).length,
    highRiskCount: accounts.filter((a) => a.isMule && a.riskScore >= 70).length,
  };
}

// ─── Component ─────────────────────────────────────────────────────────────

interface GraphNodeData {
  id: string; riskScore: number; isMule: boolean; isCore: boolean;
}

export default function NetworkGraph() {
  const containerRef = useRef<HTMLDivElement>(null);
  const networkRef = useRef<Network | null>(null);
  const { accounts, transactions } = useFirestoreData();
  const [graphStats, setGraphStats] = useState({ nodes: 0, edges: 0, flaggedEdges: 0 });
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [filterMode, setFilterMode] = useState<"mules" | "high-risk" | "all">("all");
  const [isStabilized, setIsStabilized] = useState(false);

  const { graphNodes, displayEdges, filteredCount, totalCount, muleCount, highRiskCount } = useMemo(() => {
    return buildGraphData(accounts, transactions, filterMode);
  }, [accounts, transactions, filterMode]);

  const accountMap = useMemo(() => {
    const map = new Map<string, ReturnType<typeof useFirestoreData>["accounts"][0]>();
    for (const a of accounts) map.set(a.id, a);
    return map;
  }, [accounts]);

  const nodeDataMap = useMemo(() => {
    const map = new Map<string, GraphNodeData>();
    for (const n of graphNodes) map.set(n.id, n);
    return map;
  }, [graphNodes]);

  const getAccountName = useCallback((id: string) => accountMap.get(id)?.name || id, [accountMap]);

  // ─── Network Init ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!containerRef.current || accounts.length === 0) return;
    let cancelled = false;

    async function init() {
      const vis = await import("vis-network/standalone");
      if (cancelled || !containerRef.current) return;

      // ── Nodes: white circles with labels (like the old version) ──────
      const visNodes: Node[] = graphNodes.map((n) => {
        const isHighRisk = n.riskScore >= 60 || n.isMule;
        const isNeighbor = !n.isCore;
        return {
          id: n.id,
          label: n.label,
          color: {
            background: "#000000",
            border: isHighRisk ? "#ffffff" : "#555555",
            highlight: { background: "#222222", border: "#ffffff" },
          },
          font: {
            color: isNeighbor ? "#666666" : "#cccccc",
            size: isNeighbor ? 8 : 11,
            face: "JetBrains Mono, monospace",
          },
          size: isHighRisk ? (isNeighbor ? 10 : 18) : 8,
          borderWidth: isHighRisk ? 2 : 1,
          borderWidthSelected: 3,
          shape: "circle" as const,
          mass: isNeighbor ? 1 : 2,
          title: `${n.name}\n${n.id}\nRisk: ${n.riskScore.toFixed(1)}%${n.isMule ? "\n[MULE]" : ""}`,
        };
      });

      // ── Edges: colored by risk (mule/uncertain/safe) ─────────────────
      const visEdges: Edge[] = displayEdges.map((e) => {
        const fromNd = nodeDataMap.get(e.from);
        const toNd = nodeDataMap.get(e.to);
        const fromMule = fromNd?.isMule ?? false;
        const toMule = toNd?.isMule ?? false;
        const fromRisk = fromNd?.riskScore ?? 0;
        const toRisk = toNd?.riskScore ?? 0;
        const isFlagged = e.flagged || fromMule || toMule;

        return {
          id: `${e.from}->${e.to}`,
          from: e.from,
          to: e.to,
          color: isFlagged
            ? (fromMule || toMule ? EDGE_COLORS.mule : EDGE_COLORS.uncertain)
            : EDGE_COLORS.safe,
          width: isFlagged ? 1.5 : 0.8,
          arrows: { to: { enabled: true, scaleFactor: 0.5 } },
          smooth: { enabled: true, type: "continuous" as const, roundness: 0.2 },
        };
      });

      const nodesDs = new vis.DataSet(visNodes);
      const edgesDs = new vis.DataSet(visEdges);

      // ── Physics: Barnes-Hut for clean layout ─────────────────────────
      const options: Options = {
        nodes: {
          font: { color: "#cccccc", size: 11, face: "JetBrains Mono, monospace" },
          borderWidth: 2,
          borderWidthSelected: 3,
          shape: "circle",
          color: {
            background: "#000000",
            border: "#ffffff",
            highlight: { background: "#222222", border: "#ffffff" },
          },
        },
        edges: {
          smooth: { enabled: true, type: "continuous", roundness: 0.2 },
          arrows: { to: { enabled: true, scaleFactor: 0.5, type: "arrow" } },
          color: { color: "#555555", highlight: "#ffffff" },
          width: 0.8,
        },
        physics: {
          enabled: true,
          solver: "barnesHut",
          barnesHut: {
            gravitationalConstant: -3000,
            centralGravity: 0.1,
            springLength: 200,
            springConstant: 0.02,
            damping: 0.09,
            avoidOverlap: 0.5,
          },
          stabilization: { iterations: 250, updateInterval: 25, fit: true },
        },
        interaction: {
          hover: true,
          tooltipDelay: 200,
          zoomView: true,
          dragView: true,
          multiselect: false,
          selectConnectedEdges: true,
          dragNodes: true,
        },
        layout: { improvedLayout: true, hierarchical: false },
        autoResize: true,
      };

      const network = new vis.Network(containerRef.current, { nodes: nodesDs, edges: edgesDs }, options);
      networkRef.current = network;

      // ── After stabilization, re-enable physics on drag only ──────────
      network.on("stabilizationIterationsDone", () => {
        if (cancelled) return;
        network.setOptions({ physics: { enabled: false } });
        network.fit();
        setIsStabilized(true);
      });

      network.on("dragStart", () => {
        network.setOptions({
          physics: {
            enabled: true,
            solver: "barnesHut",
            barnesHut: { gravitationalConstant: -1000, centralGravity: 0.05, springLength: 200, springConstant: 0.01, damping: 0.1 },
            maxVelocity: 30,
          },
        });
      });

      network.on("dragEnd", () => {
        network.setOptions({ physics: { enabled: false } });
        network.fit();
      });

      // ── Click: highlight connections ─────────────────────────────────
      network.on("click", (params: { nodes: string[] }) => {
        if (params.nodes.length > 0) {
          setSelectedAccount(params.nodes[0]);
        } else {
          setSelectedAccount(null);
        }
      });

      network.on("doubleClick", (params: { nodes: string[] }) => {
        if (params.nodes.length > 0) {
          setSelectedAccount(params.nodes[0]);
          setPanelOpen(true);
        }
      });

      setGraphStats({
        nodes: graphNodes.length,
        edges: displayEdges.length,
        flaggedEdges: displayEdges.filter((e) => e.flagged).length,
      });
    }

    init();
    return () => {
      cancelled = true;
      networkRef.current?.destroy();
      networkRef.current = null;
      setIsStabilized(false);
    };
  }, [accounts, transactions, filterMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Panel ─────────────────────────────────────────────────────────────

  const selectedAccountData = selectedAccount ? accountMap.get(selectedAccount) : null;
  const accountTransactions = useMemo(() => {
    if (!selectedAccount) return [];
    return transactions
      .filter((t) => t.from === selectedAccount || t.to === selectedAccount)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [selectedAccount, transactions]);

  // ─── Render ────────────────────────────────────────────────────────────

  return (
    <div className="p-8 max-w-[1400px] mx-auto">
      <PageHeader
        title="Network Graph"
        subtitle="Click node to highlight connections. Double-click for transaction history."
      />

      {/* Controls */}
      <div className="flex items-center gap-6 mb-5">
        <div className="flex items-center gap-1 bg-surface-1 border border-frost/10 rounded-sm p-1">
          {[
            { value: "high-risk" as const, label: "High Risk", count: highRiskCount },
            { value: "mules" as const, label: "Mules", count: muleCount },
            { value: "all" as const, label: "All", count: filteredCount },
          ].map((mode) => (
            <button
              key={mode.value}
              onClick={() => { setFilterMode(mode.value); setSelectedAccount(null); setPanelOpen(false); }}
              className={`font-mono text-[10px] tracking-[-0.02em] px-3 py-1 rounded-[2px] transition-default ${
                filterMode === mode.value ? "bg-frost text-void" : "text-ash hover:text-bone"
              }`}
            >
              {mode.label} {filterMode === mode.value && `(${mode.count})`}
            </button>
          ))}
        </div>

        {!isStabilized && (
          <span className="font-mono text-[10px] text-ash animate-pulse">Layout stabilizing...</span>
        )}

        <div className="ml-auto flex items-center gap-5">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full border border-charcoal bg-void" />
            <span className="font-mono text-[10px] tracking-[-0.02em] text-ash">Low</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full border border-frost bg-void" />
            <span className="font-mono text-[10px] tracking-[-0.02em] text-ash">Medium</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full border border-bone bg-void" />
            <span className="font-mono text-[10px] tracking-[-0.02em] text-ash">High</span>
          </div>
          <div className="flex items-center gap-2 ml-4">
            <span className="w-4 h-[1px]" style={{ background: EDGE_COLORS.mule }} />
            <span className="font-mono text-[10px] tracking-[-0.02em] text-ash">Mule</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-4 h-[1px]" style={{ background: EDGE_COLORS.uncertain }} />
            <span className="font-mono text-[10px] tracking-[-0.02em] text-ash">Uncertain</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-4 h-[1px]" style={{ background: EDGE_COLORS.safe }} />
            <span className="font-mono text-[10px] tracking-[-0.02em] text-ash">Safe</span>
          </div>
        </div>
      </div>

      {/* Graph */}
      <div style={{ position: "relative", width: "100%" }}>
        {accounts.length === 0 ? (
          <Card className="flex items-center justify-center h-[650px]">
            <LoadingState />
          </Card>
        ) : (
          <div
            ref={containerRef}
            style={{
              width: "100%",
              height: "650px",
              backgroundColor: "#000000",
              borderRadius: "8px",
            }}
            role="img"
            aria-label="Interactive network graph showing account connections."
          />
        )}

        {/* Detail Panel */}
        <div
          className={`absolute top-0 right-0 h-full w-[380px] bg-void border-l border-frost/10 rounded-r-lg transition-transform duration-300 ease-out overflow-hidden ${
            panelOpen ? "translate-x-0" : "translate-x-full"
          }`}
        >
          {selectedAccountData && (
            <div className="h-full flex flex-col">
              <div className="p-5 border-b border-frost/10">
                <div className="flex items-center justify-between mb-3">
                  <span className="font-mono text-[12px] text-bone">{selectedAccountData.id}</span>
                  <button onClick={() => setPanelOpen(false)} className="font-mono text-[10px] text-ash hover:text-bone">Close</button>
                </div>
                <p className="font-mono text-[10px] text-ash mb-1">{selectedAccountData.name}</p>
                <div className="flex items-center gap-4 mt-2">
                  <span className="font-mono text-[10px] text-ash">Risk: <span className="text-bone">{selectedAccountData.riskScore.toFixed(0)}%</span></span>
                  <span className="font-mono text-[10px] text-ash">Bank: <span className="text-bone">{selectedAccountData.bank}</span></span>
                  {selectedAccountData.isMule && <span className="font-mono text-[10px] px-1.5 py-0.5 rounded-[2px] bg-white/20 text-white">MULE</span>}
                </div>
                {selectedAccountData.flags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {selectedAccountData.flags.map((f) => (
                      <span key={f} className="font-mono text-[9px] text-ash bg-charcoal/30 px-1.5 py-0.5 rounded-[2px]">{f}</span>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex-1 overflow-y-auto p-5">
                <p className="font-mono text-[10px] text-ash uppercase mb-4">Transaction History ({accountTransactions.length})</p>
                {accountTransactions.length > 0 ? (
                  <div className="space-y-3">
                    {accountTransactions.map((txn) => (
                      <div key={txn.id} className="border border-frost/10 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-mono text-[10px] text-ash">{txn.id}</span>
                          <span className="font-mono text-[10px] text-ash">
                            {new Date(txn.timestamp).toLocaleString("en-IN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-[11px]">
                          <span className="font-mono text-bone">{getAccountName(txn.from)}</span>
                          <span className="font-mono text-ash">&rarr;</span>
                          <span className="font-mono text-bone">{getAccountName(txn.to)}</span>
                        </div>
                        <div className="flex items-center justify-between mt-1">
                          <span className={`font-mono text-[12px] ${txn.flagged ? "text-bone" : "text-ash"}`}>₹{txn.amount.toLocaleString("en-IN")}</span>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[9px] text-ash uppercase">{txn.type}</span>
                            {txn.flagged && <span className="font-mono text-[9px] px-1 py-0.5 rounded-[2px] bg-white/20 text-white">Flagged</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <div className="flex-1 h-[1px] bg-charcoal rounded-full overflow-hidden">
                            <div className="h-full bg-bone rounded-full" style={{ width: `${txn.riskScore}%` }} />
                          </div>
                          <span className="font-mono text-[9px] text-ash">{Math.round(txn.riskScore)}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="font-mono text-[10px] text-ash">No transactions found</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="mt-4 grid grid-cols-4 gap-5">
        {[
          { label: "Nodes", value: graphStats.nodes },
          { label: "Edges", value: graphStats.edges },
          { label: "Flagged", value: graphStats.flaggedEdges },
          { label: "Mode", value: filterMode === "all" ? "All" : filterMode === "mules" ? "Mules" : "High Risk" },
        ].map((m) => (
          <Card key={m.label}>
            <p className="font-mono text-[10px] tracking-[-0.02em] text-ash uppercase mb-1">{m.label}</p>
            <p className="font-mono text-[20px] tracking-[-0.02em] text-bone">{m.value}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
