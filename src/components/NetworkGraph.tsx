"use client";

import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { useFirestoreData } from "@/lib/useFirestoreData";
import type { DataSet, Edge, Network, Node, Options } from "vis-network/standalone";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import LoadingState from "@/components/ui/LoadingState";

// ─── Performance Limits ────────────────────────────────────────────────────

const MAX_NODES = 200;
const NEIGHBOR_BUDGET = 100;
const MAX_EDGES = 800;

// ─── Node Color Palette ────────────────────────────────────────────────────

const NODE_COLORS = {
  critical: { bg: "#dc2626", border: "#ef4444" },
  high:     { bg: "#ea580c", border: "#f97316" },
  medium:   { bg: "#ca8a04", border: "#eab308" },
  low:      { bg: "#16a34a", border: "#22c55e" },
  safe:     { bg: "#0d9488", border: "#14b8a6" },
  mule:     { bg: "#dc2626", border: "#ff6b6b" },
  neighbor: { bg: "#374151", border: "#6b7280" },
};

const EDGE_COLORS = {
  mule:      "#ef4444",
  flagged:   "#f97316",
  safe:      "#22c55e",
  default:   "#4b5563",
};

// ─── Helpers ───────────────────────────────────────────────────────────────

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
  if (isNeighbor) return 5;
  if (isMule) return 16 + Math.min(riskScore / 12, 6);
  if (riskScore >= 70) return 14;
  if (riskScore >= 55) return 11;
  if (riskScore >= 40) return 9;
  return 6;
}

function getEdgeWidth(amount: number, flagged: boolean): number {
  if (flagged) return Math.min(0.8 + Math.log10(Math.max(amount, 1)) * 0.3, 3);
  return 0.4;
}

function getEdgeColor(fromRisk: number, fromMule: boolean, toRisk: number, toMule: boolean, flagged: boolean): string {
  if (fromMule || toMule) return EDGE_COLORS.mule;
  if (flagged) return EDGE_COLORS.flagged;
  return EDGE_COLORS.safe;
}

// ─── Graph Builder ─────────────────────────────────────────────────────────

function buildGraphData(
  accounts: ReturnType<typeof useFirestoreData>["accounts"],
  transactions: ReturnType<typeof useFirestoreData>["transactions"],
  filterMode: "mules" | "high-risk"
) {
  let coreAccounts = filterMode === "mules"
    ? accounts.filter((a) => a.isMule)
    : accounts.filter((a) => a.riskScore >= 55 || a.isMule);

  coreAccounts.sort((a, b) => b.riskScore - a.riskScore);
  if (coreAccounts.length > MAX_NODES) coreAccounts = coreAccounts.slice(0, MAX_NODES);

  const nodeMap = new Map<string, { id: string; riskScore: number; isMule: boolean; isCore: boolean }>();
  for (const a of coreAccounts) {
    nodeMap.set(a.id, { id: a.id, riskScore: a.riskScore, isMule: a.isMule, isCore: true });
  }

  const allAccountMap = new Map(accounts.map((a) => [a.id, a]));
  const graphEdges: { from: string; to: string; flagged: boolean; amount: number }[] = [];
  const edgeSet = new Set<string>();

  for (const txn of transactions) {
    const fromIsCore = nodeMap.has(txn.from);
    const toIsCore = nodeMap.has(txn.to);
    if (!fromIsCore && !toIsCore) continue;

    for (const cid of [txn.from, txn.to]) {
      const isCore = cid === txn.from ? fromIsCore : toIsCore;
      if (!isCore && !nodeMap.has(cid) && nodeMap.size < MAX_NODES + NEIGHBOR_BUDGET) {
        const acc = allAccountMap.get(cid);
        nodeMap.set(cid, {
          id: cid,
          riskScore: acc?.riskScore ?? 50,
          isMule: acc?.isMule ?? false,
          isCore: false,
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
      from: txn.from,
      to: txn.to,
      flagged: txn.flagged || fromAcc?.isMule || toAcc?.isMule || false,
      amount: txn.amount,
    });
  }

  return {
    graphNodes: Array.from(nodeMap.values()),
    displayEdges: graphEdges,
    filteredCount: coreAccounts.length,
    totalCount: accounts.length,
  };
}

// ─── Component ─────────────────────────────────────────────────────────────

interface GraphNodeData { id: string; riskScore: number; isMule: boolean; isCore: boolean; }

export default function NetworkGraph() {
  const containerRef = useRef<HTMLDivElement>(null);
  const networkRef = useRef<Network | null>(null);
  const { accounts, transactions } = useFirestoreData();
  const [graphStats, setGraphStats] = useState({ nodes: 0, edges: 0, flaggedEdges: 0 });
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [filterMode, setFilterMode] = useState<"mules" | "high-risk">("high-risk");
  const [isStabilized, setIsStabilized] = useState(false);

  const { graphNodes, displayEdges, filteredCount, totalCount } = useMemo(() => {
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

  // ─── Network Init (runs once per data change) ──────────────────────────

  useEffect(() => {
    if (!containerRef.current || accounts.length === 0) return;
    let cancelled = false;

    async function init() {
      const vis = await import("vis-network/standalone");
      if (cancelled || !containerRef.current) return;

      // Build vis-compatible data
      const visNodes: Node[] = graphNodes.map((n) => {
        const color = getNodeColor(n.riskScore, n.isMule, !n.isCore);
        return {
          id: n.id,
          color: { background: color.bg, border: color.border, highlight: { background: color.bg, border: "#ffffff" } },
          font: { color: "#d1d5db", size: n.isCore ? 10 : 7, face: "JetBrains Mono, monospace", strokeWidth: 2, strokeColor: "#000000" },
          size: getNodeSize(n.riskScore, n.isMule, !n.isCore),
          borderWidth: n.isMule ? 3 : 1.5,
          shape: "dot" as const,
          mass: n.isCore ? 2 : 1,
          title: `${n.id}\nRisk: ${n.riskScore.toFixed(1)}%${n.isMule ? "\n[MULE]" : ""}`,
        };
      });

      const visEdges: Edge[] = displayEdges.map((e) => {
        const fromNode = nodeDataMap.get(e.from);
        const toNode = nodeDataMap.get(e.to);
        const isFlagged = e.flagged || fromNode?.isMule || toNode?.isMule || false;
        return {
          id: `${e.from}->${e.to}`,
          from: e.from,
          to: e.to,
          color: isFlagged ? EDGE_COLORS.flagged : EDGE_COLORS.default,
          width: getEdgeWidth(e.amount, isFlagged),
          smooth: { enabled: true, type: "continuous" as const, roundness: 0.15 },
        };
      });

      const nodesDs = new vis.DataSet(visNodes);
      const edgesDs = new vis.DataSet(visEdges);

      // Physics: run once for layout, then disable permanently
      const options: Options = {
        nodes: {
          font: { color: "#d1d5db", size: 10, face: "JetBrains Mono, monospace", strokeWidth: 2, strokeColor: "#000000" },
          borderWidth: 2,
          shape: "dot",
          scaling: { min: 4, max: 24 },
        },
        edges: {
          smooth: { enabled: true, type: "continuous", roundness: 0.15 },
          color: { color: "#4b5563", highlight: "#ffffff" },
          width: 0.5,
        },
        physics: {
          enabled: true,
          solver: "forceAtlas2Based",
          forceAtlas2Based: {
            gravitationalConstant: -60,
            centralGravity: 0.012,
            springLength: 150,
            springConstant: 0.03,
            damping: 0.5,
            avoidOverlap: 0.6,
          },
          stabilization: { iterations: 200, updateInterval: 50, fit: true },
          maxVelocity: 40,
          minVelocity: 0.2,
        },
        interaction: {
          hover: true,
          tooltipDelay: 200,
          zoomView: true,
          dragView: true,
          multiselect: false,
          selectConnectedEdges: false,
          dragNodes: true,
          hideEdgesOnDrag: false,
          hideNodesOnDrag: false,
          keyboard: false,
        },
        layout: { improvedLayout: true, hierarchical: false },
        autoResize: true,
      };

      const network = new vis.Network(containerRef.current, { nodes: nodesDs, edges: edgesDs }, options);
      networkRef.current = network;

      // After initial layout, disable physics permanently
      network.once("stabilizationIterationsDone", () => {
        if (cancelled) return;
        network.setOptions({ physics: { enabled: false } });
        network.fit({ animation: { duration: 400, easingFunction: "easeInOutQuad" } });
        setIsStabilized(true);
      });

      // ─── Click: only update selected node + neighbors (no full forEach) ──
      let lastClickTime = 0;
      network.on("click", (params: { nodes: string[] }) => {
        const now = Date.now();
        if (now - lastClickTime < 100) return; // debounce 100ms
        lastClickTime = now;

        if (params.nodes.length > 0) {
          const nodeId = params.nodes[0];
          // Find connected edges
          const connectedEdges = displayEdges.filter((e) => e.from === nodeId || e.to === nodeId);
          const connectedIds = new Set<string>([nodeId, ...connectedEdges.flatMap((e) => [e.from, e.to])]);

          // Update ONLY affected nodes (max ~50 updates instead of 300+)
          const nodeUpdates: Partial<Node>[] = [];
          nodesDs.forEach((node) => {
            const id = node.id as string;
            const isSelected = id === nodeId;
            const isConnected = connectedIds.has(id);
            if (!isSelected && !isConnected) return; // skip unchanged nodes

            const nd = nodeDataMap.get(id);
            let color: { background: string; border: string; highlight: { background: string; border: string } } | undefined;
            if (isSelected) {
              color = { background: "#ffffff", border: "#ffffff", highlight: { background: "#ffffff", border: "#ffffff" } };
            } else if (isConnected) {
              const c = getNodeColor(nd?.riskScore ?? 0, nd?.isMule ?? false, !nd?.isCore);
              color = { background: c.bg, border: c.border, highlight: { background: c.bg, border: "#ffffff" } };
            }
            if (!color) return;

            nodeUpdates.push({
              id,
              color,
              font: { color: isSelected ? "#000000" : isConnected ? "#ffffff" : "#6b7280", size: isSelected ? 14 : 11 },
              size: isSelected ? 22 : isConnected ? getNodeSize(nd?.riskScore ?? 0, nd?.isMule ?? false, !nd?.isCore) : undefined,
            });
          });
          if (nodeUpdates.length > 0) nodesDs.update(nodeUpdates);

          // Update ONLY affected edges (max ~20 updates)
          const edgeUpdates: Partial<Edge>[] = [];
          edgesDs.forEach((edge) => {
            const e = edge as unknown as { id: string; from: string; to: string };
            const isRelated = e.from === nodeId || e.to === nodeId;
            if (!isRelated) return;
            const fromNd = nodeDataMap.get(e.from);
            const toNd = nodeDataMap.get(e.to);
            edgeUpdates.push({
              id: e.id,
              color: getEdgeColor(fromNd?.riskScore ?? 0, fromNd?.isMule ?? false, toNd?.riskScore ?? 0, toNd?.isMule ?? false, true),
              width: 3,
            } as Partial<Edge>);
          });
          if (edgeUpdates.length > 0) edgesDs.update(edgeUpdates);

          // Dim unrelated nodes
          const dimUpdates: Partial<Node>[] = [];
          nodesDs.forEach((node) => {
            const id = node.id as string;
            if (!connectedIds.has(id)) {
              dimUpdates.push({ id } as Partial<Node>);
            }
          });
          if (dimUpdates.length > 0) nodesDs.update(dimUpdates);

          const dimEdgeUpdates: { id: string; color: string; width: number }[] = [];
          edgesDs.forEach((edge) => {
            const e = edge as unknown as { id: string; from: string; to: string };
            if (e.from !== nodeId && e.to !== nodeId) {
              dimEdgeUpdates.push({ id: e.id, color: "#1f2937", width: 0.2 });
            }
          });
          if (dimEdgeUpdates.length > 0) edgesDs.update(dimEdgeUpdates);

          setSelectedAccount(nodeId);
        } else {
          // Click on empty space — reset all to default
          resetVisuals(nodesDs, edgesDs);
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

  // ─── Reset Visuals (called on empty-space click) ───────────────────────

  const resetVisuals = useCallback((nodesDs: DataSet<Node, "id">, edgesDs: DataSet<Edge, "id">) => {
    const nodeUpdates: Partial<Node>[] = [];
    nodesDs.forEach((node) => {
      const id = node.id as string;
      const nd = nodeDataMap.get(id);
      if (!nd) return;
      const color = getNodeColor(nd.riskScore, nd.isMule, !nd.isCore);
      nodeUpdates.push({
        id,
        color: { background: color.bg, border: color.border, highlight: { background: color.bg, border: "#ffffff" } },
        font: { color: "#d1d5db", size: nd.isCore ? 10 : 7 },
        size: getNodeSize(nd.riskScore, nd.isMule, !nd.isCore),
      });
    });
    nodesDs.update(nodeUpdates);

    const edgeUpdates: Partial<Edge>[] = [];
    edgesDs.forEach((edge) => {
      const e = edge as unknown as { id: string; from: string; to: string };
      const fromNd = nodeDataMap.get(e.from);
      const toNd = nodeDataMap.get(e.to);
      const isFlagged = fromNd?.isMule || toNd?.isMule || false;
      const edgeData = displayEdges.find((de) => `${de.from}->${de.to}` === e.id);
      edgeUpdates.push({
        id: e.id,
        color: isFlagged ? EDGE_COLORS.flagged : EDGE_COLORS.default,
        width: getEdgeWidth(edgeData?.amount ?? 1000, isFlagged),
      } as Partial<Edge>);
    });
    edgesDs.update(edgeUpdates);
  }, [nodeDataMap, displayEdges]);

  // ─── Panel Data ────────────────────────────────────────────────────────

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

      {/* Controls */}
      <div className="flex items-center gap-6 mb-4">
        <div className="flex items-center gap-1 bg-surface-1 border border-frost/10 rounded-sm p-1">
          {[
            { value: "high-risk", label: "High Risk" },
            { value: "mules", label: "Mules Only" },
          ].map((mode) => (
            <button
              key={mode.value}
              onClick={() => { setFilterMode(mode.value as "mules" | "high-risk"); setSelectedAccount(null); setPanelOpen(false); }}
              className={`font-mono text-[10px] tracking-[-0.02em] px-3 py-1 rounded-[2px] transition-default ${
                filterMode === mode.value ? "bg-frost text-void" : "text-ash hover:text-bone"
              }`}
            >
              {mode.label} {filterMode === mode.value && `(${filteredCount}/${totalCount})`}
            </button>
          ))}
        </div>

        {!isStabilized && (
          <span className="font-mono text-[10px] text-ash animate-pulse">Layout stabilizing...</span>
        )}

        <div className="ml-auto flex items-center gap-4">
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
            <span className="w-3 h-3 rounded-full" style={{ background: NODE_COLORS.mule.bg }} />
            <span className="font-mono text-[10px] text-ash">Mule</span>
          </div>
          <div className="w-px h-3 bg-frost/20" />
          <div className="flex items-center gap-2">
            <span className="w-4 h-0.5 rounded" style={{ background: EDGE_COLORS.mule }} />
            <span className="font-mono text-[10px] text-ash">Mule</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-4 h-0.5 rounded" style={{ background: EDGE_COLORS.safe }} />
            <span className="font-mono text-[10px] text-ash">Safe</span>
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
              backgroundColor: "#0a0a0a",
              borderRadius: "8px",
              border: "1px solid rgba(255,255,255,0.05)",
            }}
            role="img"
            aria-label="Interactive network graph showing high-risk and mule account connections."
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
                  <span className="font-mono text-[12px] tracking-[-0.02em] text-bone">{selectedAccountData.id}</span>
                  <button
                    onClick={() => { setPanelOpen(false); }}
                    className="font-mono text-[10px] tracking-[-0.02em] text-ash hover:text-bone transition-default"
                  >
                    Close
                  </button>
                </div>
                <p className="font-mono text-[10px] tracking-[-0.02em] text-ash mb-1">{selectedAccountData.name}</p>
                <div className="flex items-center gap-4 mt-2">
                  <span className="font-mono text-[10px] text-ash">
                    Risk: <span className="text-bone">{selectedAccountData.riskScore.toFixed(0)}%</span>
                  </span>
                  <span className="font-mono text-[10px] text-ash">
                    Bank: <span className="text-bone">{selectedAccountData.bank}</span>
                  </span>
                  {selectedAccountData.isMule && (
                    <span className="font-mono text-[10px] px-1.5 py-0.5 rounded-[2px] bg-red-500/20 text-red-400">MULE</span>
                  )}
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
                <p className="font-mono text-[10px] text-ash uppercase mb-4">
                  Transaction History ({accountTransactions.length})
                </p>
                {accountTransactions.length > 0 ? (
                  <div className="space-y-3">
                    {accountTransactions.map((txn) => {
                      const isOutgoing = txn.from === selectedAccount;
                      return (
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
                            <span className={`font-mono text-[12px] ${txn.flagged ? "text-bone" : "text-ash"}`}>
                              ₹{txn.amount.toLocaleString("en-IN")}
                            </span>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-[9px] text-ash uppercase">{txn.type}</span>
                              {txn.flagged && (
                                <span className="font-mono text-[9px] px-1 py-0.5 rounded-[2px] bg-red-500/20 text-red-400">Flagged</span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <div className="flex-1 h-[1px] bg-charcoal rounded-full overflow-hidden">
                              <div className="h-full bg-bone rounded-full" style={{ width: `${txn.riskScore}%` }} />
                            </div>
                            <span className="font-mono text-[9px] text-ash">{Math.round(txn.riskScore)}%</span>
                          </div>
                        </div>
                      );
                    })}
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
      <div className="mt-4 grid grid-cols-3 gap-5">
        {[
          { label: "Nodes", value: graphStats.nodes },
          { label: "Edges", value: graphStats.edges },
          { label: "Flagged", value: graphStats.flaggedEdges },
        ].map((m) => (
          <Card key={m.label}>
            <p className="font-mono text-[10px] text-ash uppercase mb-1">{m.label}</p>
            <p className="font-mono text-[20px] text-bone">{m.value}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
