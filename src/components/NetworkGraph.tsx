"use client";

import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { useFirestoreData } from "@/lib/useFirestoreData";
import type { DataSet, Edge, Network, Node, Options } from "vis-network/standalone";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import LoadingState from "@/components/ui/LoadingState";

// ─── Graph Limits ──────────────────────────────────────────────────────────

const MAX_NODES = 300;
const NEIGHBOR_BUDGET = 300;
const MAX_EDGES = 1500;

// ─── Node Style ────────────────────────────────────────────────────────────

function getNodeStyle(riskScore: number, isMule: boolean, isNeighbor: boolean) {
  if (isNeighbor) {
    // Counterparty accounts — teal/green to contrast with red mules
    return { bg: "#0d9488", border: "#2dd4bf", size: 5 };
  }
  if (isMule && riskScore >= 70) {
    // Critical mule — big red
    return { bg: "#dc2626", border: "#f87171", size: 16 };
  }
  if (isMule && riskScore >= 55) {
    // High risk mule — orange-red
    return { bg: "#ea580c", border: "#fb923c", size: 12 };
  }
  if (isMule) {
    // Regular mule — orange
    return { bg: "#f97316", border: "#fdba74", size: 10 };
  }
  // Non-mule (shouldn't appear as core, but just in case)
  return { bg: "#0d9488", border: "#2dd4bf", size: 6 };
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

  // Build node map with core + counterparty neighbors
  const nodeMap = new Map<string, {
    id: string; label: string; riskScore: number;
    isMule: boolean; isCore: boolean; bank: string;
  }>();

  for (const a of coreAccounts) {
    nodeMap.set(a.id, {
      id: a.id, label: a.id, riskScore: a.riskScore,
      isMule: a.isMule, isCore: true, bank: a.bank,
    });
  }

  // Build edges — transactions touching core nodes, pull in counterparties
  const graphEdges: { from: string; to: string; flagged: boolean; amount: number }[] = [];
  const edgeSet = new Set<string>();

  for (const txn of transactions) {
    const fromIsCore = coreIds.has(txn.from);
    const toIsCore = coreIds.has(txn.to);
    if (!fromIsCore && !toIsCore) continue;

    // Pull in counterparties as neighbor nodes
    for (const cid of [txn.from, txn.to]) {
      if (!nodeMap.has(cid) && nodeMap.size < MAX_NODES + NEIGHBOR_BUDGET) {
        const acc = allAccountMap.get(cid);
        nodeMap.set(cid, {
          id: cid, label: cid,
          riskScore: acc?.riskScore ?? 0,
          isMule: acc?.isMule ?? false,
          isCore: false,
          bank: acc?.bank ?? "",
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
    muleCount: coreAccounts.filter((a) => a.isMule).length,
    highRiskCount: accounts.filter((a) => a.isMule && a.riskScore >= 70).length,
  };
}

// ─── Component ─────────────────────────────────────────────────────────────

interface GraphNodeData {
  id: string; riskScore: number; isMule: boolean; isCore: boolean; bank: string;
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

      // ── Build vis data ────────────────────────────────────────────────
      const visNodes: Node[] = graphNodes.map((n) => {
        const style = getNodeStyle(n.riskScore, n.isMule, !n.isCore);
        return {
          id: n.id,
          label: n.isCore ? n.label : "",
          color: {
            background: style.bg,
            border: style.border,
            highlight: { background: style.bg, border: "#ffffff" },
          },
          font: {
            color: "#9ca3af",
            size: n.isCore ? (n.isMule ? 10 : 8) : 0,
            face: "JetBrains Mono, monospace",
            strokeWidth: 2,
            strokeColor: "#000000",
          },
          size: style.size,
          borderWidth: n.isMule ? 2 : 1,
          shape: "dot" as const,
          mass: n.isCore ? (n.isMule ? 2.5 : 1) : 0.5,
          title: `${n.id}\nRisk: ${n.riskScore.toFixed(1)}%\n${n.isMule ? "[MULE]" : "[COUNTERPARTY]"}\n${n.bank}`,
        };
      });

      const visEdges: Edge[] = displayEdges.map((e) => {
        const fromNd = nodeDataMap.get(e.from);
        const toNd = nodeDataMap.get(e.to);
        const fromMule = fromNd?.isMule ?? false;
        const toMule = toNd?.isMule ?? false;
        const bothMules = fromMule && toMule;
        const eitherMule = fromMule || toMule;

        let edgeColor = "#22c55e"; // safe (both counterparties)
        let edgeWidth = 0.3;
        if (bothMules) { edgeColor = "#ef4444"; edgeWidth = Math.min(0.6 + Math.log10(Math.max(e.amount, 1)) * 0.2, 2); }
        else if (eitherMule) { edgeColor = "#f97316"; edgeWidth = 0.5; }

        return {
          id: `${e.from}->${e.to}`,
          from: e.from,
          to: e.to,
          color: edgeColor,
          width: edgeWidth,
          smooth: { enabled: true, type: "continuous" as const, roundness: 0.1 },
          arrows: bothMules ? { to: { enabled: true, scaleFactor: 0.2 } } : undefined,
        };
      });

      const nodesDs = new vis.DataSet(visNodes);
      const edgesDs = new vis.DataSet(visEdges);

      // ── Physics ───────────────────────────────────────────────────────
      const options: Options = {
        nodes: {
          font: { color: "#9ca3af", size: 10, face: "JetBrains Mono, monospace", strokeWidth: 2, strokeColor: "#000000" },
          borderWidth: 2,
          shape: "dot",
          scaling: { min: 3, max: 22 },
        },
        edges: {
          smooth: { enabled: true, type: "continuous", roundness: 0.1 },
          color: { color: "#4b5563" },
          width: 0.5,
        },
        physics: {
          enabled: true,
          solver: "forceAtlas2Based",
          forceAtlas2Based: {
            gravitationalConstant: -40,
            centralGravity: 0.005,
            springLength: 80,
            springConstant: 0.012,
            damping: 0.3,
            avoidOverlap: 0.3,
          },
          stabilization: { iterations: 100, updateInterval: 40, fit: true },
          maxVelocity: 20,
          minVelocity: 0.1,
        },
        interaction: {
          hover: true,
          tooltipDelay: 200,
          zoomView: true,
          dragView: true,
          multiselect: false,
          selectConnectedEdges: false,
          dragNodes: true,
        },
        layout: { improvedLayout: true, hierarchical: false },
        autoResize: true,
      };

      const network = new vis.Network(containerRef.current, { nodes: nodesDs, edges: edgesDs }, options);
      networkRef.current = network;

      // Freeze physics after layout
      network.once("stabilizationIterationsDone", () => {
        if (cancelled) return;
        network.setOptions({ physics: { enabled: false } });
        network.fit({ animation: { duration: 500, easingFunction: "easeInOutQuad" } });
        setIsStabilized(true);
      });

      // ── Click: highlight selected node + connections ──────────────────
      let lastClickTime = 0;
      network.on("click", (params: { nodes: string[] }) => {
        const now = Date.now();
        if (now - lastClickTime < 150) return;
        lastClickTime = now;

        if (params.nodes.length > 0) {
          const nodeId = params.nodes[0];
          const connectedEdges = displayEdges.filter((e) => e.from === nodeId || e.to === nodeId);
          const connectedIds = new Set<string>([nodeId, ...connectedEdges.flatMap((e) => [e.from, e.to])]);

          // Update only affected nodes
          const nodeUpdates: { id: string; color: object; font: object; size: number; borderWidth: number }[] = [];
          nodesDs.forEach((node) => {
            const id = node.id as string;
            const isSelected = id === nodeId;
            const isConnected = connectedIds.has(id);
            const nd = nodeDataMap.get(id);

            if (isSelected) {
              nodeUpdates.push({
                id,
                color: { background: "#ffffff", border: "#ffffff", highlight: { background: "#ffffff", border: "#ffffff" } },
                font: { color: "#ffffff", size: 14, strokeWidth: 0 },
                size: 22,
                borderWidth: 3,
              });
            } else if (isConnected) {
              const s = getNodeStyle(nd?.riskScore ?? 0, nd?.isMule ?? false, !nd?.isCore);
              nodeUpdates.push({
                id,
                color: { background: s.bg, border: "#ffffff", highlight: { background: s.bg, border: "#ffffff" } },
                font: { color: "#ffffff", size: 10, strokeWidth: 0 },
                size: s.size + 3,
                borderWidth: 2,
              });
            } else {
              nodeUpdates.push({
                id,
                color: { background: "#111827", border: "#1f2937", highlight: { background: "#1f2937", border: "#374151" } },
                font: { color: "#374151", size: 6 },
                size: 3,
                borderWidth: 0.5,
              });
            }
          });
          nodesDs.update(nodeUpdates);

          // Update only affected edges
          const edgeUpdates: { id: string; color: string; width: number }[] = [];
          edgesDs.forEach((edge) => {
            const e = edge as unknown as { id: string; from: string; to: string };
            const isRelated = e.from === nodeId || e.to === nodeId;
            edgeUpdates.push({
              id: e.id,
              color: isRelated ? "#ffffff" : "#111827",
              width: isRelated ? 2.5 : 0.1,
            });
          });
          edgesDs.update(edgeUpdates);

          setSelectedAccount(nodeId);
        } else {
          resetAll(nodesDs, edgesDs);
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

  // ─── Reset visuals ─────────────────────────────────────────────────────

  const resetAll = useCallback((nodesDs: DataSet<Node, "id">, edgesDs: DataSet<Edge, "id">) => {
    const nodeUpdates: { id: string; color: object; font: object; size: number; borderWidth: number }[] = [];
    nodesDs.forEach((node) => {
      const id = node.id as string;
      const nd = nodeDataMap.get(id);
      if (!nd) return;
      const s = getNodeStyle(nd.riskScore, nd.isMule, !nd.isCore);
      nodeUpdates.push({
        id,
        color: { background: s.bg, border: s.border, highlight: { background: s.bg, border: "#ffffff" } },
        font: { color: "#9ca3af", size: nd.isCore ? (nd.isMule ? 10 : 8) : 0 },
        size: s.size,
        borderWidth: nd.isMule ? 2 : 1,
      });
    });
    nodesDs.update(nodeUpdates);

    const edgeUpdates: { id: string; color: string; width: number }[] = [];
    edgesDs.forEach((edge) => {
      const e = edge as unknown as { id: string; from: string; to: string };
      const fromNd = nodeDataMap.get(e.from);
      const toNd = nodeDataMap.get(e.to);
      const fromMule = fromNd?.isMule ?? false;
      const toMule = toNd?.isMule ?? false;
      const bothMules = fromMule && toMule;
      const eitherMule = fromMule || toMule;
      const edgeData = displayEdges.find((de) => `${de.from}->${de.to}` === e.id);
      let edgeColor = "#22c55e";
      let edgeWidth = 0.3;
      if (bothMules) { edgeColor = "#ef4444"; edgeWidth = Math.min(0.6 + Math.log10(Math.max(edgeData?.amount ?? 1000, 1)) * 0.2, 2); }
      else if (eitherMule) { edgeColor = "#f97316"; edgeWidth = 0.5; }
      edgeUpdates.push({ id: e.id, color: edgeColor, width: edgeWidth });
    });
    edgesDs.update(edgeUpdates);
  }, [nodeDataMap, displayEdges]);

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
        subtitle="Click to highlight connections. Double-click for transaction history."
      />

      {/* Controls */}
      <div className="flex items-center gap-6 mb-4">
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

        <div className="ml-auto flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full" style={{ background: "#dc2626" }} />
            <span className="font-mono text-[10px] text-ash">Critical Mule</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full" style={{ background: "#ea580c" }} />
            <span className="font-mono text-[10px] text-ash">Mule</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full" style={{ background: "#0d9488" }} />
            <span className="font-mono text-[10px] text-ash">Counterparty</span>
          </div>
          <div className="w-px h-3 bg-frost/20" />
          <div className="flex items-center gap-1.5">
            <span className="w-4 h-0.5 rounded" style={{ background: "#ef4444" }} />
            <span className="font-mono text-[10px] text-ash">Mule→Mule</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-4 h-0.5 rounded" style={{ background: "#f97316" }} />
            <span className="font-mono text-[10px] text-ash">Mule→Other</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-4 h-0.5 rounded" style={{ background: "#22c55e" }} />
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
            aria-label="Interactive network graph showing mule and high-risk account connections."
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
                  {selectedAccountData.isMule && <span className="font-mono text-[10px] px-1.5 py-0.5 rounded-[2px] bg-red-500/20 text-red-400">MULE</span>}
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
                            {txn.flagged && <span className="font-mono text-[9px] px-1 py-0.5 rounded-[2px] bg-red-500/20 text-red-400">Flagged</span>}
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
          { label: "Flagged Edges", value: graphStats.flaggedEdges },
          { label: "Mule Nodes", value: graphNodes.filter((n) => n.isMule).length },
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
