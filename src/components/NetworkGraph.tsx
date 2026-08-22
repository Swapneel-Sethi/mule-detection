"use client";

import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { useFirestoreData } from "@/lib/useFirestoreData";
import type { DataSet, Edge, Network, Node, Options } from "vis-network/standalone";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import LoadingState from "@/components/ui/LoadingState";
import EmptyState from "@/components/ui/EmptyState";

interface GraphNode {
  id: string;
  label: string;
  riskScore: number;
  isMule: boolean;
  initialX?: number;
  initialY?: number;
}

interface GraphEdge {
  from: string;
  to: string;
  flagged: boolean;
  amount?: number;
  type?: string;
}

const EDGE_COLORS = {
  mule: "#ff4444",
  safe: "#4488ff",
  uncertain: "#ffaa44",
  default: "#444444",
  defaultFlagged: "#ff4444",
};

function getEdgeColor(fromRisk: number, fromMule: boolean, toRisk: number, toMule: boolean): string {
  if (fromMule || toMule) return EDGE_COLORS.mule;
  if (fromRisk >= 60 || toRisk >= 60) return EDGE_COLORS.mule;
  if (fromRisk >= 40 || toRisk >= 40) return EDGE_COLORS.uncertain;
  return EDGE_COLORS.safe;
}

const MAX_NODES = 500;
const MAX_EDGES = 2000;

function buildGraphData(
  accounts: ReturnType<typeof useFirestoreData>["accounts"],
  transactions: ReturnType<typeof useFirestoreData>["transactions"],
  filterMode: "all" | "mules" | "high-risk" = "high-risk"
) {
  let filteredAccounts = [...accounts];

  if (filterMode === "mules") {
    filteredAccounts = accounts.filter((a) => a.isMule);
  } else if (filterMode === "high-risk") {
    filteredAccounts = accounts.filter((a) => a.riskScore >= 70 || a.isMule);
  }

  if (filteredAccounts.length > MAX_NODES) {
    filteredAccounts = filteredAccounts
      .sort((a, b) => b.riskScore - a.riskScore)
      .slice(0, MAX_NODES);
  }

  const graphNodes: GraphNode[] = filteredAccounts.map((a) => ({
    id: a.id,
    label: `${a.name}\n${a.id}`,
    riskScore: a.riskScore,
    isMule: a.isMule,
  }));

  const accountIds = new Set(filteredAccounts.map((a) => a.id));
  const accountMap = new Map(filteredAccounts.map((a) => [a.id, a]));

  const graphEdges: GraphEdge[] = [];
  const edgeSet = new Set<string>();

  for (const txn of transactions) {
    const fromId = txn.from;
    const toId = txn.to;
    if (!accountIds.has(fromId) || !accountIds.has(toId)) continue;

    const edgeKey = `${fromId}->${toId}`;
    if (edgeSet.has(edgeKey)) continue;
    edgeSet.add(edgeKey);

    if (graphEdges.length >= MAX_EDGES) break;

    const fromAccount = accountMap.get(fromId);
    const toAccount = accountMap.get(toId);
    const fromMule = fromAccount?.isMule || false;
    const toMule = toAccount?.isMule || false;

    graphEdges.push({
      from: fromId,
      to: toId,
      flagged: txn.flagged || fromMule || toMule,
      amount: txn.amount,
      type: txn.type,
    });
  }

  return { graphNodes, displayEdges: graphEdges, filteredCount: filteredAccounts.length, totalCount: accounts.length };
}

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
    const result = buildGraphData(accounts, transactions, filterMode);
    // Add initial positions in a spiral layout to prevent overlap
    const nodeCount = result.graphNodes.length;
    const baseRadius = Math.max(300, Math.min(800, nodeCount * 0.8));
    
    const nodesWithPositions = result.graphNodes.map((n, i) => {
      // Spiral layout for better distribution
      const angle = (i / Math.max(1, nodeCount)) * 2 * Math.PI * 3; // 3 rotations
      const radius = baseRadius * (0.5 + (i / nodeCount) * 0.5); // Spiral outward
      const offsetX = (Math.random() - 0.5) * 80;
      const offsetY = (Math.random() - 0.5) * 80;
      return {
        ...n,
        initialX: Math.cos(angle) * radius + offsetX,
        initialY: Math.sin(angle) * radius + offsetY,
      };
    });
    return { graphNodes: nodesWithPositions, displayEdges: result.displayEdges, filteredCount: result.filteredCount, totalCount: result.totalCount };
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
    const nodeEdges = displayEdges.filter((e) => e.from === nodeId || e.to === nodeId);
    const connectedIds = new Set<string>();
    connectedIds.add(nodeId);
    for (const e of nodeEdges) {
      connectedIds.add(e.from);
      connectedIds.add(e.to);
    }

    if (nodesRef.current && edgesRef.current) {
      nodesRef.current.forEach((node) => {
        const id = node.id as string;
        const account = accountMap.get(id);
        const isConnected = connectedIds.has(id);
        const isSelected = id === nodeId;
        nodesRef.current!.update({
          id,
          color: {
            background: isSelected ? "#ffffff" : isConnected ? "#222222" : "#000000",
            border: isSelected
              ? "#ffffff"
              : isConnected
                ? (account?.isMule ? EDGE_COLORS.mule : account && account.riskScore >= 60 ? EDGE_COLORS.mule : EDGE_COLORS.safe)
                : "#444345",
            highlight: { background: "#333333", border: "#ffffff" },
          },
          font: { color: isSelected ? "#000000" : isConnected ? "#ffffff" : "#b8bab9", size: isSelected ? 12 : 10 },
          size: isSelected ? 22 : isConnected ? 16 : undefined,
        } as Partial<Node>);
      });

      edgesRef.current.forEach((edge) => {
        const e = edge as unknown as { id: string; from: string; to: string };
        const isRelated = e.from === nodeId || e.to === nodeId;

        if (isRelated) {
          const fromAccount = accountMap.get(e.from);
          const toAccount = accountMap.get(e.to);
          if (fromAccount && toAccount) {
            const color = getEdgeColor(fromAccount.riskScore, fromAccount.isMule, toAccount.riskScore, toAccount.isMule);
            edgesRef.current!.update({ id: e.id, color, width: 2.5 } as Partial<Edge>);
          }
        } else {
          edgesRef.current!.update({ id: e.id, color: EDGE_COLORS.default, width: 0.5 } as Partial<Edge>);
        }
      });
    }

    setSelectedAccount(nodeId);
  }, [displayEdges, accountMap]);

  const handleNodeDoubleClick = useCallback((nodeId: string) => {
    setSelectedAccount(nodeId);
    setPanelOpen(true);
  }, []);

  const resetGraph = useCallback(() => {
    if (nodesRef.current && edgesRef.current) {
      nodesRef.current.forEach((node) => {
        const id = node.id as string;
        const account = accountMap.get(id);
        nodesRef.current!.update({
          id,
          color: {
            background: "#000000",
            border: account && account.riskScore >= 60 ? "#ffffff" : "#444345",
            highlight: { background: "#222222", border: "#ffffff" },
          },
          font: { color: "#b8bab9", size: 10 },
          size: account && account.riskScore >= 60 ? 18 : 12,
        } as Partial<Node>);
      });

      edgesRef.current.forEach((edge) => {
        const e = edge as unknown as { id: string; from: string; to: string };
        const fromAccount = accountMap.get(e.from);
        const toAccount = accountMap.get(e.to);
        const isFlagged = (fromAccount?.isMule || toAccount?.isMule || (fromAccount?.riskScore ?? 0) >= 60 || (toAccount?.riskScore ?? 0) >= 60);
        edgesRef.current!.update({
          id: e.id,
          color: isFlagged ? EDGE_COLORS.defaultFlagged : EDGE_COLORS.default,
          width: isFlagged ? 1.5 : 0.5,
        } as Partial<Edge>);
      });
    }
    setSelectedAccount(null);
  }, [accountMap]);

  useEffect(() => {
    if (!containerRef.current || accounts.length === 0) return;
    let cancelled = false;

    async function init() {
      const vis = await import("vis-network/standalone");
      if (cancelled || !containerRef.current) return;

       const visNodes: DataSet<Node, "id"> = new vis.DataSet<Node, "id">(
        graphNodes.map((n) => {
          const isHighRisk = n.riskScore >= 60 || n.isMule;
          return {
            id: n.id,
            label: n.label,
            x: n.initialX,
            y: n.initialY,
            color: {
              background: isHighRisk ? "#ffffff20" : "#000000",
              border: isHighRisk ? "#ffffff" : "#444345",
              highlight: { background: "#ffffff40", border: "#ffffff" },
            },
            font: { color: isHighRisk ? "#ffffff" : "#b8bab9", size: 10, face: "JetBrains Mono, monospace" },
            size: isHighRisk ? 16 : 10,
            borderWidth: isHighRisk ? 2 : 1,
            shape: "circle",
            mass: isHighRisk ? 2 : 1,
          };
        })
      );

      const visEdges: DataSet<Edge, "id"> = new vis.DataSet<Edge, "id">(
        displayEdges.map((e) => ({
          id: `${e.from}->${e.to}`,
          from: e.from,
          to: e.to,
          color: e.flagged ? EDGE_COLORS.defaultFlagged : EDGE_COLORS.default,
          width: e.flagged ? 1.5 : 0.5,
          arrows: { to: { enabled: true, scaleFactor: 0.5 } },
          smooth: { enabled: true, type: "curvedCW", roundness: 0.2 },
        }))
      );

      nodesRef.current = visNodes;
      edgesRef.current = visEdges;

        const options: Options = {
        nodes: { 
          font: { color: "#b8bab9", size: 10, face: "JetBrains Mono, monospace" },
          size: 12,
          borderWidth: 1,
          borderWidthSelected: 2,
        },
        edges: {
          smooth: { enabled: true, type: "continuous", roundness: 0.5 },
          arrows: { to: { enabled: true, scaleFactor: 0.5, type: "arrow" } },
          width: 0.5,
          color: { color: "#444444", highlight: "#ffffff" },
        },
        physics: {
          enabled: true,
          solver: "repulsion",
          repulsion: {
            centralGravity: 0.0,
            springLength: 200,
            springConstant: 0.01,
            nodeDistance: 200,
            damping: 0.09,
          },
          stabilization: { iterations: 500, updateInterval: 25, fit: true },
          adaptiveTimestep: true,
          minVelocity: 0.01,
          maxVelocity: 100,
        },
        interaction: { 
          hover: true, 
          tooltipDelay: 200, 
          zoomView: true, 
          dragView: true, 
          multiselect: false, 
          selectConnectedEdges: false, 
          dragNodes: true,
          keyboard: { enabled: true, speed: { x: 10, y: 10, zoom: 0.02 }, bindToWindow: false }
        },
        layout: { improvedLayout: false, randomSeed: 42 },
      };

      const network = new vis.Network(containerRef.current, { nodes: visNodes, edges: visEdges }, options);
      networkRef.current = network;

      // Disable physics after stabilization to prevent nodes drifting off-screen
      network.on("stabilizationIterationsDone", () => {
        network.setOptions({ physics: { enabled: false } });
        network.fit({ animation: { duration: 500, easingFunction: "easeInOutQuad" } });
      });

      // Re-enable physics temporarily when dragging, then disable again
      network.on("dragStart", () => {
        network.setOptions({ 
          physics: { 
            enabled: true, 
            solver: "forceAtlas2Based", 
            forceAtlas2Based: { gravitationalConstant: -50, centralGravity: 0.01, springLength: 200, springConstant: 0.05, damping: 0.9 },
            maxVelocity: 50,
            minVelocity: 0.01,
          } 
        });
      });

      network.on("dragEnd", () => {
        network.setOptions({ physics: { enabled: false } });
        
        if (containerRef.current) {
          const canvasWidth = containerRef.current.offsetWidth;
          const canvasHeight = containerRef.current.offsetHeight;
          const margin = 100;
          
          nodesRef.current?.forEach((node) => {
            const id = node.id as string;
            const position = network.getPositions(id);
            if (position[id]) {
              const pos = position[id];
              if (pos.x < -canvasWidth / 2 - margin) pos.x = -canvasWidth / 2 - margin;
              if (pos.x > canvasWidth / 2 + margin) pos.x = canvasWidth / 2 + margin;
              if (pos.y < -canvasHeight / 2 - margin) pos.y = -canvasHeight / 2 - margin;
              if (pos.y > canvasHeight / 2 + margin) pos.y = canvasHeight / 2 + margin;
              nodesRef.current?.update({ id, x: pos.x, y: pos.y });
            }
          });
        }
        
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

      setGraphStats({ nodes: graphNodes.length, edges: displayEdges.length, flaggedEdges: displayEdges.filter((e) => e.flagged).length });
    }

    init();
    return () => { cancelled = true; networkRef.current?.destroy(); };
  }, [accountsKey, txKey, graphNodes, displayEdges, handleNodeClick, handleNodeDoubleClick, resetGraph]);

  const selectedAccountData = selectedAccount ? accountMap.get(selectedAccount) : null;
  const accountTransactions = useMemo(() => {
    if (!selectedAccount) return [];
    return transactions
      .filter((t) => t.from === selectedAccount || t.to === selectedAccount)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [selectedAccount, transactions]);

  return (
    <div className="p-8 max-w-[1200px] mx-auto relative">
      <PageHeader
        title="Network Graph"
        subtitle="Click node to highlight connections. Double-click for transaction history."
      />

      <div className="flex items-center gap-6 mb-5">
        <div className="flex items-center gap-2 bg-surface-1 border border-frost/10 rounded-sm p-1">
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
            <span className="w-4 h-[1px] edge-mule" />
            <span className="font-mono text-[10px] tracking-[-0.02em] text-ash">Mule</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-4 h-[1px] edge-uncertain" />
            <span className="font-mono text-[10px] tracking-[-0.02em] text-ash">Uncertain</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-4 h-[1px] edge-safe" />
            <span className="font-mono text-[10px] tracking-[-0.02em] text-ash">Safe</span>
          </div>
        </div>
      </div>

      <div className="relative">
        {accounts.length === 0 ? (
          <Card className="flex items-center justify-center min-h-[600px]">
            <EmptyState message="No graph data available" />
          </Card>
        ) : (
          <div 
            ref={containerRef} 
            className="w-full border border-frost/10 rounded-lg bg-surface-1 min-h-[600px]" 
            role="img" 
            aria-label="Interactive network graph showing account connections. Nodes represent accounts colored by risk level. Edges represent transactions. Click nodes to highlight connections. Double-click for transaction history."
          />
        )}

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
                    <span className="font-mono text-[10px] tracking-[-0.02em] px-1.5 py-0.5 rounded-[2px] bg-white/20 text-white">
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
                                <span className="font-mono text-[9px] tracking-[-0.02em] px-1 py-0.5 rounded-[2px] bg-white/20 text-white">
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
