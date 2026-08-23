"use client";

import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { useFirestoreData } from "@/lib/useFirestoreData";
import type { DataSet, Edge, Network, Node, Options } from "vis-network/standalone";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import LoadingState from "@/components/ui/LoadingState";
import EmptyState from "@/components/ui/EmptyState";

// ─── Node Color Palette ────────────────────────────────────────────────────

const NODE_COLORS = {
  critical: { bg: "#dc2626", border: "#ef4444", highlight: "#fca5a5" },
  high:     { bg: "#ea580c", border: "#f97316", highlight: "#fdba74" },
  medium:   { bg: "#ca8a04", border: "#eab308", highlight: "#fde047" },
  low:      { bg: "#16a34a", border: "#22c55e", highlight: "#86efac" },
  safe:     { bg: "#0d9488", border: "#14b8a6", highlight: "#5eead4" },
  mule:     { bg: "#dc2626", border: "#ff6b6b", highlight: "#ffb3b3" },
  neighbor: { bg: "#374151", border: "#6b7280", highlight: "#9ca3af" },
};

const EDGE_COLORS = {
  mule:      "#ef4444",
  flagged:   "#f97316",
  uncertain: "#eab308",
  safe:      "#22c55e",
  default:   "#4b5563",
};

const MAX_NODES = 500;
const NEIGHBOR_BUDGET = 400;
const MAX_EDGES = 3000;

// ─── Risk → Color Mapping ──────────────────────────────────────────────────

function getNodeColor(riskScore: number, isMule: boolean, isNeighbor: boolean) {
  if (isNeighbor) return NODE_COLORS.neighbor;
  if (isMule) return NODE_COLORS.mule;
  if (riskScore >= 70) return NODE_COLORS.critical;
  if (riskScore >= 55) return NODE_COLORS.high;
  if (riskScore >= 40) return NODE_COLORS.medium;
  if (riskScore >= 25) return NODE_COLORS.low;
  return NODE_COLORS.safe;
}

function getNodeSize(riskScore: number, isMule: boolean, isNeighbor: boolean): number {
  if (isNeighbor) return 6;
  if (isMule) return 18 + Math.min(riskScore / 10, 8);
  if (riskScore >= 70) return 16;
  if (riskScore >= 55) return 13;
  if (riskScore >= 40) return 10;
  return 7;
}

function getEdgeColor(
  fromRisk: number, fromMule: boolean,
  toRisk: number, toMule: boolean,
  flagged: boolean
): string {
  if (fromMule || toMule) return EDGE_COLORS.mule;
  if (flagged) return EDGE_COLORS.flagged;
  if (fromRisk >= 60 || toRisk >= 60) return EDGE_COLORS.uncertain;
  return EDGE_COLORS.safe;
}

function getEdgeWidth(amount: number, flagged: boolean): number {
  if (flagged) return Math.min(1 + Math.log10(Math.max(amount, 1)) * 0.5, 4);
  return Math.min(0.3 + Math.log10(Math.max(amount, 1)) * 0.15, 1.5);
}

// ─── Graph Builder ─────────────────────────────────────────────────────────

function buildGraphData(
  accounts: ReturnType<typeof useFirestoreData>["accounts"],
  transactions: ReturnType<typeof useFirestoreData>["transactions"],
  filterMode: "all" | "mules" | "high-risk"
) {
  let coreAccounts = [...accounts];
  if (filterMode === "mules") {
    coreAccounts = accounts.filter((a) => a.isMule);
  } else if (filterMode === "high-risk") {
    coreAccounts = accounts.filter((a) => a.riskScore >= 55 || a.isMule);
  }
  coreAccounts.sort((a, b) => b.riskScore - a.riskScore);
  if (coreAccounts.length > MAX_NODES) {
    coreAccounts = coreAccounts.slice(0, MAX_NODES);
  }

  const nodeMap = new Map<string, GraphNode>();
  for (const a of coreAccounts) {
    nodeMap.set(a.id, {
      id: a.id,
      label: a.id,
      riskScore: a.riskScore,
      isMule: a.isMule,
      isCore: true,
    });
  }

  const allAccountMap = new Map(accounts.map((a) => [a.id, a]));

  const graphEdges: GraphEdge[] = [];
  const edgeSet = new Set<string>();

  for (const txn of transactions) {
    const fromId = txn.from;
    const toId = txn.to;
    const fromIsCore = nodeMap.has(fromId);
    const toIsCore = nodeMap.has(toId);
    if (!fromIsCore && !toIsCore) continue;

    for (const [cid, isCore] of [[fromId, fromIsCore], [toId, toIsCore]] as const) {
      if (!isCore && !nodeMap.has(cid) && nodeMap.size < MAX_NODES + NEIGHBOR_BUDGET) {
        const acc = allAccountMap.get(cid);
        nodeMap.set(cid, {
          id: cid,
          label: cid,
          riskScore: acc?.riskScore ?? 50,
          isMule: acc?.isMule ?? false,
          isCore: false,
        });
      }
    }

    const edgeKey = `${fromId}->${toId}`;
    if (edgeSet.has(edgeKey)) continue;
    edgeSet.add(edgeKey);
    if (graphEdges.length >= MAX_EDGES) break;

    const fromAccount = allAccountMap.get(fromId);
    const toAccount = allAccountMap.get(toId);

    graphEdges.push({
      from: fromId,
      to: toId,
      flagged: txn.flagged || fromAccount?.isMule || toAccount?.isMule || false,
      amount: txn.amount,
      type: txn.type,
    });
  }

  return {
    graphNodes: Array.from(nodeMap.values()),
    displayEdges: graphEdges,
    filteredCount: coreAccounts.length,
    totalCount: accounts.length,
  };
}

// ─── Types ─────────────────────────────────────────────────────────────────

interface GraphNode {
  id: string;
  label: string;
  riskScore: number;
  isMule: boolean;
  isCore?: boolean;
}

interface GraphEdge {
  from: string;
  to: string;
  flagged: boolean;
  amount?: number;
  type?: string;
}

// ─── Component ─────────────────────────────────────────────────────────────

export default function NetworkGraph() {
  const containerRef = useRef<HTMLDivElement>(null);
  const networkRef = useRef<Network | null>(null);
  const nodesRef = useRef<DataSet<Node, "id"> | null>(null);
  const edgesRef = useRef<DataSet<Edge, "id"> | null>(null);
  const { accounts, transactions, source } = useFirestoreData();
  const [graphStats, setGraphStats] = useState({ nodes: 0, edges: 0, flaggedEdges: 0 });
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [filterMode, setFilterMode] = useState<"all" | "mules" | "high-risk">("high-risk");

  const { graphNodes, displayEdges, filteredCount, totalCount } = useMemo(() => {
    return buildGraphData(accounts, transactions, filterMode);
  }, [accounts, transactions, filterMode]);

  const accountsKey = useMemo(() => accounts.map((a) => `${a.id}:${a.riskScore}:${a.isMule}`).join(","), [accounts]);
  const txKey = useMemo(() => transactions.length, [transactions]);

  const accountMap = useMemo(() => {
    const map = new Map<string, ReturnType<typeof useFirestoreData>["accounts"][0]>();
    for (const a of accounts) map.set(a.id, a);
    return map;
  }, [accounts]);

  const getAccountName = useCallback((id: string) => accountMap.get(id)?.name || id, [accountMap]);

  const handleNodeClick = useCallback((nodeId: string) => {
    if (!nodesRef.current || !edgesRef.current) return;

    const connectedEdges = displayEdges.filter((e) => e.from === nodeId || e.to === nodeId);
    const connectedIds = new Set<string>();
    connectedIds.add(nodeId);
    for (const e of connectedEdges) {
      connectedIds.add(e.from);
      connectedIds.add(e.to);
    }

    nodesRef.current.forEach((node) => {
      const id = node.id as string;
      const account = accountMap.get(id);
      const isSelected = id === nodeId;
      const isConnected = connectedIds.has(id);
      const isNeighbor = !account;
      let color: { background: string; border: string; highlight: { background: string; border: string } };
      if (isSelected) {
        color = { background: "#ffffff", border: "#ffffff", highlight: { background: "#ffffff", border: "#ffffff" } };
      } else if (isConnected) {
        const c = getNodeColor(account?.riskScore ?? 0, account?.isMule ?? false, isNeighbor);
        color = { background: c.bg, border: c.border, highlight: { background: c.highlight, border: "#ffffff" } };
      } else {
        color = { background: "#1f2937", border: "#374151", highlight: { background: "#374151", border: "#6b7280" } };
      }
      nodesRef.current!.update({
        id,
        color,
        font: { color: isSelected ? "#000000" : isConnected ? "#ffffff" : "#6b7280", size: isSelected ? 14 : isConnected ? 11 : 8 },
        size: isSelected ? 24 : isConnected ? getNodeSize(account?.riskScore ?? 0, account?.isMule ?? false, isNeighbor) : 5,
        opacity: isSelected || isConnected ? 1 : 0.2,
      } as Partial<Node>);
    });

    edgesRef.current.forEach((edge) => {
      const e = edge as unknown as { id: string; from: string; to: string };
      const isRelated = e.from === nodeId || e.to === nodeId;
      let edgeColor = "#1f2937";
      if (isRelated) {
        const fromAccount = accountMap.get(e.from);
        const toAccount = accountMap.get(e.to);
        edgeColor = getEdgeColor(
          fromAccount?.riskScore ?? 0, fromAccount?.isMule ?? false,
          toAccount?.riskScore ?? 0, toAccount?.isMule ?? false, true
        );
      }
      edgesRef.current!.update({
        id: e.id,
        color: edgeColor,
        width: isRelated ? 3 : 0.3,
        opacity: isRelated ? 1 : 0.1,
      } as Partial<Edge>);
    });

    setSelectedAccount(nodeId);
  }, [displayEdges, accountMap]);

  const handleNodeDoubleClick = useCallback((nodeId: string) => {
    setSelectedAccount(nodeId);
    setPanelOpen(true);
  }, []);

  const resetGraph = useCallback(() => {
    if (!nodesRef.current || !edgesRef.current) return;

    nodesRef.current.forEach((node) => {
      const id = node.id as string;
      const account = accountMap.get(id);
      const isNeighbor = !account;
      const riskScore = account?.riskScore ?? 0;
      const isMule = account?.isMule ?? false;
      const color = getNodeColor(riskScore, isMule, isNeighbor);
      nodesRef.current!.update({
        id,
        color: { background: color.bg, border: color.border, highlight: { background: color.highlight, border: "#ffffff" } },
        font: { color: "#d1d5db", size: isNeighbor ? 8 : 10 },
        size: getNodeSize(riskScore, isMule, isNeighbor),
        opacity: 1,
      } as Partial<Node>);
    });

    edgesRef.current.forEach((edge) => {
      const e = edge as unknown as { id: string; from: string; to: string };
      const fromAccount = accountMap.get(e.from);
      const toAccount = accountMap.get(e.to);
      const fromFlagged = fromAccount?.isMule || (fromAccount?.riskScore ?? 0) >= 55;
      const toFlagged = toAccount?.isMule || (toAccount?.riskScore ?? 0) >= 55;
      const amount = displayEdges.find((de) => `${de.from}->${de.to}` === e.id)?.amount ?? 1000;
      edgesRef.current!.update({
        id: e.id,
        color: fromFlagged || toFlagged ? EDGE_COLORS.flagged : EDGE_COLORS.safe,
        width: getEdgeWidth(amount, fromFlagged || toFlagged),
        opacity: 0.8,
      } as Partial<Edge>);
    });

    setSelectedAccount(null);
  }, [accountMap, displayEdges]);

  // ─── Network Initialization ────────────────────────────────────────────

  useEffect(() => {
    if (!containerRef.current || accounts.length === 0) return;
    let cancelled = false;

    async function init() {
      const vis = await import("vis-network/standalone");
      if (cancelled || !containerRef.current) return;

      const visNodes: DataSet<Node, "id"> = new vis.DataSet<Node, "id">(
        graphNodes.map((n) => {
          const color = getNodeColor(n.riskScore, n.isMule, !n.isCore);
          return {
            id: n.id,
            label: n.label,
            color: { background: color.bg, border: color.border, highlight: { background: color.highlight, border: "#ffffff" } },
            font: { color: "#d1d5db", size: n.isCore ? 10 : 8, face: "JetBrains Mono, monospace", strokeWidth: 3, strokeColor: "#000000" },
            size: getNodeSize(n.riskScore, n.isMule, !n.isCore),
            borderWidth: n.isMule ? 3 : 2,
            shape: "dot",
            mass: n.isCore ? (n.isMule ? 3 : 2) : 1,
            title: `${n.id}\nRisk: ${n.riskScore.toFixed(1)}%${n.isMule ? "\n[MLE]" : ""}`,
          };
        })
      );

      const visEdges: DataSet<Edge, "id"> = new vis.DataSet<Edge, "id">(
        displayEdges.map((e) => {
          const fromAccount = accountMap.get(e.from);
          const toAccount = accountMap.get(e.to);
          const fromFlagged = fromAccount?.isMule || (fromAccount?.riskScore ?? 0) >= 55;
          const toFlagged = toAccount?.isMule || (toAccount?.riskScore ?? 0) >= 55;
          const isFlagged = fromFlagged || toFlagged || e.flagged;
          return {
            id: `${e.from}->${e.to}`,
            from: e.from,
            to: e.to,
            color: isFlagged ? EDGE_COLORS.flagged : EDGE_COLORS.safe,
            width: getEdgeWidth(e.amount ?? 1000, isFlagged),
            arrows: { to: { enabled: true, scaleFactor: 0.3 } },
            smooth: { enabled: true, type: "continuous", roundness: 0.2 },
            opacity: isFlagged ? 0.9 : 0.5,
          };
        })
      );

      nodesRef.current = visNodes;
      edgesRef.current = visEdges;

      const options: Options = {
        nodes: {
          font: { color: "#d1d5db", size: 10, face: "JetBrains Mono, monospace", strokeWidth: 3, strokeColor: "#000000" },
          borderWidth: 2,
          borderWidthSelected: 3,
          shape: "dot",
          scaling: { min: 4, max: 30 },
        },
        edges: {
          smooth: { enabled: true, type: "continuous", roundness: 0.2 },
          arrows: { to: { enabled: true, scaleFactor: 0.3, type: "arrow" } },
          color: { color: "#4b5563", highlight: "#ffffff" },
          scaling: { min: 0.3, max: 4 },
        },
        physics: {
          enabled: true,
          solver: "forceAtlas2Based",
          forceAtlas2Based: {
            gravitationalConstant: -80,
            centralGravity: 0.015,
            springLength: 180,
            springConstant: 0.04,
            damping: 0.6,
            avoidOverlap: 0.8,
          },
          stabilization: {
            iterations: 300,
            updateInterval: 25,
            fit: true,
          },
          maxVelocity: 50,
          minVelocity: 0.1,
        },
        interaction: {
          hover: true,
          tooltipDelay: 150,
          zoomView: true,
          dragView: true,
          multiselect: false,
          selectConnectedEdges: false,
          dragNodes: true,
          hideEdgesOnDrag: true,
          hideNodesOnDrag: false,
        },
        layout: {
          improvedLayout: true,
          hierarchical: false,
        },
        autoResize: true,
      };

      const network = new vis.Network(containerRef.current, { nodes: visNodes, edges: visEdges }, options);
      networkRef.current = network;

      network.on("stabilizationIterationsDone", () => {
        if (cancelled) return;
        network.setOptions({ physics: { enabled: false } });
        network.fit({ animation: { duration: 500, easingFunction: "easeInOutQuad" } });
      });

      network.on("dragStart", () => {
        network.setOptions({
          physics: {
            enabled: true,
            solver: "forceAtlas2Based",
            forceAtlas2Based: { gravitationalConstant: -40, centralGravity: 0.01, springLength: 200, springConstant: 0.05, damping: 0.7 },
            maxVelocity: 30,
            minVelocity: 0.1,
          },
        });
      });

      network.on("dragEnd", () => {
        network.setOptions({ physics: { enabled: false } });
        network.fit({ animation: { duration: 300, easingFunction: "easeInOutQuad" } });
      });

      network.on("click", (params: { nodes: string[] }) => {
        if (params.nodes.length > 0) {
          handleNodeClick(params.nodes[0]);
        } else {
          resetGraph();
        }
      });

      network.on("doubleClick", (params: { nodes: string[] }) => {
        if (params.nodes.length > 0) {
          handleNodeDoubleClick(params.nodes[0]);
        }
      });

      const handleWindowResize = () => {
        if (networkRef.current) {
          networkRef.current.redraw();
          networkRef.current.fit({ animation: false });
        }
      };
      window.addEventListener("resize", handleWindowResize);

      setGraphStats({
        nodes: graphNodes.length,
        edges: displayEdges.length,
        flaggedEdges: displayEdges.filter((e) => e.flagged).length,
      });

      return () => {
        window.removeEventListener("resize", handleWindowResize);
      };
    }

    init();
    return () => {
      cancelled = true;
      networkRef.current?.destroy();
      networkRef.current = null;
    };
  }, [accountsKey, txKey, graphNodes, displayEdges, handleNodeClick, handleNodeDoubleClick, resetGraph]);

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
        subtitle="Click to highlight connections. Double-click for transaction history."
      />

      {/* Controls Bar */}
      <div className="flex items-center gap-6 mb-4">
        <div className="flex items-center gap-1 bg-surface-1 border border-frost/10 rounded-sm p-1">
          {[
            { value: "high-risk", label: "High Risk" },
            { value: "mules", label: "Mules Only" },
            { value: "all", label: "All" },
          ].map((mode) => (
            <button
              key={mode.value}
              onClick={() => setFilterMode(mode.value as "all" | "mules" | "high-risk")}
              className={`font-mono text-[10px] tracking-[-0.02em] px-3 py-1 rounded-[2px] transition-default ${
                filterMode === mode.value ? "bg-frost text-void" : "text-ash hover:text-bone"
              }`}
            >
              {mode.label} {filterMode === mode.value && filteredCount > 0 && `(${filteredCount}/${totalCount})`}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-4">
          {/* Node Legend */}
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full" style={{ background: NODE_COLORS.critical.bg }} />
            <span className="font-mono text-[10px] text-ash">Critical</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full" style={{ background: NODE_COLORS.high.bg }} />
            <span className="font-mono text-[10px] text-ash">High</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full" style={{ background: NODE_COLORS.medium.bg }} />
            <span className="font-mono text-[10px] text-ash">Medium</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full" style={{ background: NODE_COLORS.low.bg }} />
            <span className="font-mono text-[10px] text-ash">Low</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full" style={{ background: NODE_COLORS.mule.bg, boxShadow: `0 0 6px ${NODE_COLORS.mule.border}` }} />
            <span className="font-mono text-[10px] text-ash">Mule</span>
          </div>
          <div className="w-px h-3 bg-frost/20" />
          <div className="flex items-center gap-2">
            <span className="w-4 h-0.5 rounded" style={{ background: EDGE_COLORS.mule }} />
            <span className="font-mono text-[10px] text-ash">Mule Txn</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-4 h-0.5 rounded" style={{ background: EDGE_COLORS.safe }} />
            <span className="font-mono text-[10px] text-ash">Safe Txn</span>
          </div>
        </div>
      </div>

      {/* Graph Container */}
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
              backgroundColor: "#0a0a0a",
              borderRadius: "8px",
              border: "1px solid rgba(255,255,255,0.05)",
            }}
            role="img"
            aria-label="Interactive network graph showing account connections. Nodes represent accounts colored by risk level. Edges represent transactions."
          />
        )}

        {/* Account Detail Panel */}
        <div
          className={`absolute top-0 right-0 h-full w-[380px] bg-void border-l border-frost/10 rounded-r-lg transition-transform duration-300 ease-out overflow-hidden ${
            panelOpen ? "translate-x-0" : "translate-x-full"
          }`}
        >
          {selectedAccountData && (
            <div className="h-full flex flex-col">
              <div className="p-5 border-b border-frost/10">
                <div className="flex items-center justify-between mb-3">
                  <span className="font-mono text-[12px] tracking-[-0.02em] text-bone">{selectedAccountData.id}</span>
                  <button
                    onClick={() => { setPanelOpen(false); resetGraph(); }}
                    className="font-mono text-[10px] tracking-[-0.02em] text-ash hover:text-bone transition-default"
                  >
                    Close
                  </button>
                </div>
                <p className="font-mono text-[10px] tracking-[-0.02em] text-ash mb-1">{selectedAccountData.name}</p>
                <div className="flex items-center gap-4 mt-2">
                  <span className="font-mono text-[10px] tracking-[-0.02em] text-ash">
                    Risk: <span className="text-bone">{selectedAccountData.riskScore.toFixed(0)}%</span>
                  </span>
                  <span className="font-mono text-[10px] tracking-[-0.02em] text-ash">
                    Bank: <span className="text-bone">{selectedAccountData.bank}</span>
                  </span>
                  {selectedAccountData.isMule && (
                    <span className="font-mono text-[10px] tracking-[-0.02em] px-1.5 py-0.5 rounded-[2px] bg-red-500/20 text-red-400">
                      MULE
                    </span>
                  )}
                </div>
                {selectedAccountData.flags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {selectedAccountData.flags.map((f) => (
                      <span key={f} className="font-mono text-[9px] tracking-[-0.02em] text-ash bg-charcoal/30 px-1.5 py-0.5 rounded-[2px]">
                        {f}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex-1 overflow-y-auto p-5">
                <p className="font-mono text-[10px] tracking-[-0.02em] text-ash uppercase mb-4">
                  Transaction History ({accountTransactions.length})
                </p>
                {accountTransactions.length > 0 ? (
                  <div className="space-y-3">
                    {accountTransactions.map((txn) => {
                      const isOutgoing = txn.from === selectedAccount;
                      return (
                        <div key={txn.id} className="border border-frost/10 rounded-lg p-3">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-mono text-[10px] tracking-[-0.02em] text-ash">{txn.id}</span>
                            <span className="font-mono text-[10px] tracking-[-0.02em] text-ash">
                              {new Date(txn.timestamp).toLocaleString("en-IN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-[11px]">
                            <span className="font-mono text-bone">{isOutgoing ? getAccountName(txn.from) : getAccountName(txn.from)}</span>
                            <span className="font-mono text-ash">&rarr;</span>
                            <span className="font-mono text-bone">{isOutgoing ? getAccountName(txn.to) : getAccountName(txn.to)}</span>
                          </div>
                          <div className="flex items-center justify-between mt-1">
                            <span className={`font-mono text-[12px] tracking-[-0.02em] ${txn.flagged ? "text-bone" : "text-ash"}`}>
                              ₹{txn.amount.toLocaleString("en-IN")}
                            </span>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-[9px] tracking-[-0.02em] text-ash uppercase">{txn.type}</span>
                              {txn.flagged && (
                                <span className="font-mono text-[9px] tracking-[-0.02em] px-1 py-0.5 rounded-[2px] bg-red-500/20 text-red-400">
                                  Flagged
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <div className="flex-1 h-[1px] bg-charcoal rounded-full overflow-hidden">
                              <div className="h-full bg-bone rounded-full" style={{ width: `${txn.riskScore}%` }} />
                            </div>
                            <span className="font-mono text-[9px] tracking-[-0.02em] text-ash">{Math.round(txn.riskScore)}%</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="font-mono text-[10px] tracking-[-0.02em] text-ash">No transactions found</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Stats Cards */}
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
