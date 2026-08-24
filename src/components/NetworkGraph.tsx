"use client";

import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { useFirestoreData } from "@/lib/useFirestoreData";
import type { Network, Node, Edge, Options } from "vis-network/standalone";
import { DataSet } from "vis-data";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import LoadingState from "@/components/ui/LoadingState";

const MAX_NODES = 250;
const MAX_EDGES = 1500;

const EDGE_COLORS = {
  mule: "#ff3333",
  uncertain: "#ff9944",
  safe: "#556688",
};

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
    id: string; name: string; riskScore: number;
    isMule: boolean; isCore: boolean; txnCount: number;
  }>();

  for (const a of coreAccounts) {
    nodeMap.set(a.id, {
      id: a.id, name: a.name,
      riskScore: a.riskScore, isMule: a.isMule, isCore: true, txnCount: 0,
    });
  }

  const txnCountMap = new Map<string, number>();
  for (const txn of transactions) {
    txnCountMap.set(txn.from, (txnCountMap.get(txn.from) ?? 0) + 1);
    txnCountMap.set(txn.to, (txnCountMap.get(txn.to) ?? 0) + 1);
  }

  for (const [id, node] of nodeMap) {
    node.txnCount = txnCountMap.get(id) ?? 0;
  }

  const graphEdges: { from: string; to: string; flagged: boolean; amount: number }[] = [];
  const edgeSet = new Set<string>();

  for (const txn of transactions) {
    const fromIsCore = coreIds.has(txn.from);
    const toIsCore = coreIds.has(txn.to);
    if (!fromIsCore && !toIsCore) continue;

    for (const cid of [txn.from, txn.to]) {
      if (!nodeMap.has(cid) && nodeMap.size < MAX_NODES) {
        const acc = allAccountMap.get(cid);
        nodeMap.set(cid, {
          id: cid, name: acc?.name ?? cid,
          riskScore: acc?.riskScore ?? 0, isMule: acc?.isMule ?? false,
          isCore: false, txnCount: txnCountMap.get(cid) ?? 0,
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
    muleCount: coreAccounts.filter((a) => a.isMule).length,
    highRiskCount: accounts.filter((a) => a.isMule && a.riskScore >= 70).length,
  };
}

function assignCircularPositions(
  nodes: { id: string; riskScore: number; isMule: boolean; isCore: boolean; txnCount: number }[],
  edges: { from: string; to: string; flagged: boolean }[]
) {
  const positions = new Map<string, { x: number; y: number }>();

  const coreNodes = nodes.filter((n) => n.isCore);
  const neighborNodes = nodes.filter((n) => !n.isCore);

  // Tier 1: Top 5 highest-risk as "global" hub nodes at center
  const hubNodes = coreNodes.slice(0, Math.min(5, coreNodes.length));
  const hubRadius = 60;
  hubNodes.forEach((n, i) => {
    const angle = (i / hubNodes.length) * 2 * Math.PI - Math.PI / 2;
    positions.set(n.id, { x: Math.cos(angle) * hubRadius, y: Math.sin(angle) * hubRadius });
  });

  // Tier 2: Remaining core nodes in middle ring, grouped by transaction count
  const midNodes = coreNodes.slice(hubNodes.length);
  const midRadius = 280;
  midNodes.forEach((n, i) => {
    const angle = (i / midNodes.length) * 2 * Math.PI - Math.PI / 2;
    const jitter = (n.txnCount % 3) * 15;
    positions.set(n.id, {
      x: Math.cos(angle) * (midRadius + jitter),
      y: Math.sin(angle) * (midRadius + jitter),
    });
  });

  // Tier 3: Neighbor nodes in outer ring, positioned near their most-connected core node
  const coreEdgeMap = new Map<string, string[]>();
  for (const e of edges) {
    if (coreEdgeMap.has(e.from)) coreEdgeMap.get(e.from)!.push(e.to);
    if (coreEdgeMap.has(e.to)) coreEdgeMap.get(e.to)!.push(e.from);
  }

  const outerRadius = 440;
  const groups = new Map<string, typeof neighborNodes>();
  for (const n of neighborNodes) {
    const connectedCores = coreEdgeMap.get(n.id) ?? [];
    const nearestCore = connectedCores.find((c) => positions.has(c)) ?? hubNodes[0]?.id ?? "";
    if (!groups.has(nearestCore)) groups.set(nearestCore, []);
    groups.get(nearestCore)!.push(n);
  }

  let globalAngle = 0;
  for (const [coreId, group] of groups) {
    const corePos = positions.get(coreId) ?? { x: 0, y: 0 };
    const baseAngle = Math.atan2(corePos.y, corePos.x);
    const spread = Math.PI * 0.15;

    group.forEach((n, i) => {
      const angle = baseAngle + (i - group.length / 2) * (spread / Math.max(group.length, 1));
      positions.set(n.id, {
        x: Math.cos(angle) * outerRadius + (Math.random() - 0.5) * 40,
        y: Math.sin(angle) * outerRadius + (Math.random() - 0.5) * 40,
      });
    });
    globalAngle += spread;
  }

  // Unassigned neighbors get placed in a catch-all outer ring
  let catchup = 0;
  for (const n of neighborNodes) {
    if (!positions.has(n.id)) {
      const angle = (catchup / Math.max(neighborNodes.length, 1)) * 2 * Math.PI;
      positions.set(n.id, {
        x: Math.cos(angle) * (outerRadius + 60),
        y: Math.sin(angle) * (outerRadius + 60),
      });
      catchup++;
    }
  }

  return positions;
}

export default function NetworkGraph() {
  const containerRef = useRef<HTMLDivElement>(null);
  const networkRef = useRef<Network | null>(null);
  const { accounts, transactions } = useFirestoreData();
  const [graphStats, setGraphStats] = useState({ nodes: 0, edges: 0, flaggedEdges: 0 });
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [filterMode, setFilterMode] = useState<"mules" | "high-risk" | "all">("high-risk");
  const [isStabilized, setIsStabilized] = useState(false);

  const { graphNodes, displayEdges, filteredCount, muleCount, highRiskCount } = useMemo(() => {
    return buildGraphData(accounts, transactions, filterMode);
  }, [accounts, transactions, filterMode]);

  const accountMap = useMemo(() => {
    const map = new Map<string, ReturnType<typeof useFirestoreData>["accounts"][0]>();
    for (const a of accounts) map.set(a.id, a);
    return map;
  }, [accounts]);

  const getAccountName = useCallback((id: string) => accountMap.get(id)?.name || id, [accountMap]);

  useEffect(() => {
    if (!containerRef.current || accounts.length === 0) return;
    let cancelled = false;

    async function init() {
      const { Network: VisNetwork, DataSet: VisDataSet } = await import("vis-network/standalone");
      if (cancelled || !containerRef.current) return;

      const positions = assignCircularPositions(graphNodes, displayEdges);

      const visNodes: Node[] = graphNodes.map((n) => {
        const isHub = n.isCore && graphNodes.indexOf(n) < 5;
        const isMid = n.isCore && !isHub;
        const isNeighbor = !n.isCore;

        let bgColor = "#0a0a0a";
        let borderColor = "#2a2a2a";
        let borderWidth = 1;
        let nodeSize = 5;
        let fontSize = 0;
        let fontColor = "#444444";

        if (isHub) {
          bgColor = "#000000";
          borderColor = "#ff2222";
          borderWidth = 3;
          nodeSize = 28;
          fontSize = 12;
          fontColor = "#ffffff";
        } else if (isMid) {
          bgColor = "#050505";
          borderColor = "#ff4444";
          borderWidth = 2;
          nodeSize = 14;
          fontSize = 9;
          fontColor = "#999999";
        } else if (n.riskScore >= 40) {
          bgColor = "#080808";
          borderColor = "#ff6644";
          borderWidth = 1;
          nodeSize = 7;
        }

        const pos = positions.get(n.id) ?? { x: 0, y: 0 };

        return {
          id: n.id,
          label: fontSize > 0 ? `${n.name}\n${n.id}` : "",
          color: {
            background: bgColor,
            border: borderColor,
            highlight: { background: "#111111", border: "#ffffff" },
          },
          font: {
            color: fontColor,
            size: fontSize,
            face: "JetBrains Mono, monospace",
            strokeWidth: 0,
          },
          size: nodeSize,
          borderWidth,
          borderWidthSelected: 3,
          shape: "circle" as const,
          x: pos.x,
          y: pos.y,
          fixed: { x: true, y: true },
          title: `${n.name}\n${n.id}\nRisk: ${n.riskScore.toFixed(1)}%${n.isMule ? "\n[MULE]" : ""}\nTxns: ${n.txnCount}`,
        };
      });

      const visEdges: Edge[] = displayEdges.map((e) => {
        const fromNode = graphNodes.find((n) => n.id === e.from);
        const toNode = graphNodes.find((n) => n.id === e.to);
        const fromMule = fromNode?.isMule ?? false;
        const toMule = toNode?.isMule ?? false;
        const isFlagged = e.flagged || fromMule || toMule;

        const fromHub = fromNode && graphNodes.indexOf(fromNode) < 5;
        const toHub = toNode && graphNodes.indexOf(toNode) < 5;
        const isHubEdge = fromHub || toHub;

        let color = EDGE_COLORS.safe;
        let width = 0.4;
        let opacity = 0.3;

        if (isFlagged) {
          color = fromMule || toMule ? EDGE_COLORS.mule : EDGE_COLORS.uncertain;
          width = isHubEdge ? 2 : 1;
          opacity = isHubEdge ? 0.8 : 0.5;
        } else if (isHubEdge) {
          width = 0.8;
          opacity = 0.4;
        }

        return {
          id: `${e.from}->${e.to}`,
          from: e.from,
          to: e.to,
          color: { color, highlight: "#ffffff", opacity },
          width,
          smooth: { enabled: true, type: "continuous" as const, roundness: 0.2 },
          arrows: { to: { enabled: false, scaleFactor: 0.3 } },
        };
      });

      const nodes = new VisDataSet(visNodes);
      const edges = new VisDataSet(visEdges);

      const options: Options = {
        nodes: {
          font: { color: "#cccccc", size: 11, face: "JetBrains Mono, monospace", strokeWidth: 0 },
          borderWidth: 2,
          borderWidthSelected: 3,
          shape: "circle",
          color: {
            background: "#000000",
            border: "#ffffff",
            highlight: { background: "#1a1a1a", border: "#ffffff" },
          },
        },
        edges: {
          smooth: { enabled: true, type: "continuous", roundness: 0.2 },
          color: { color: "#333333", highlight: "#ffffff", opacity: 0.5 },
          width: 0.8,
        },
        physics: {
          enabled: false,
        },
        interaction: {
          hover: true,
          tooltipDelay: 150,
          zoomView: true,
          dragView: true,
          multiselect: false,
          selectConnectedEdges: true,
          dragNodes: false,
          hideEdgesOnDrag: false,
          hideEdgesOnZoom: false,
          navigationButtons: false,
          keyboard: false,
        },
        layout: {
          improvedLayout: false,
          hierarchical: false,
        },
        autoResize: true,
      };

      const network = new VisNetwork(containerRef.current, { nodes, edges }, options);
      networkRef.current = network;

      network.once("afterDrawing", () => {
        if (cancelled) return;
        network.fit({ animation: false });
        setIsStabilized(true);
      });

      setTimeout(() => {
        if (!cancelled) {
          network.fit({ animation: false });
          setIsStabilized(true);
        }
      }, 500);

      network.on("click", (params: { nodes: string[] }) => {
        if (cancelled) return;
        setSelectedAccount(params.nodes.length > 0 ? params.nodes[0] : null);
      });

      network.on("doubleClick", (params: { nodes: string[] }) => {
        if (cancelled) return;
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

  const selectedAccountData = selectedAccount ? accountMap.get(selectedAccount) : null;
  const accountTransactions = useMemo(() => {
    if (!selectedAccount) return [];
    return transactions
      .filter((t) => t.from === selectedAccount || t.to === selectedAccount)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 50);
  }, [selectedAccount, transactions]);

  return (
    <div className="p-8 max-w-[1600px] mx-auto">
      <PageHeader
        title="Network Graph"
        subtitle="Click node to highlight connections. Double-click for transaction history."
      />

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
          <span className="font-mono text-[10px] text-ash animate-pulse">Rendering...</span>
        )}

        <div className="ml-auto flex items-center gap-5">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full" style={{ background: "#2a2a2a" }} />
            <span className="font-mono text-[10px] text-ash">Low</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full" style={{ background: "#ff6644" }} />
            <span className="font-mono text-[10px] text-ash">Medium</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full" style={{ background: "#ff2222" }} />
            <span className="font-mono text-[10px] text-ash">High</span>
          </div>
          <div className="w-px h-3 bg-charcoal mx-1" />
          <div className="flex items-center gap-2">
            <span className="w-4 h-[1.5px]" style={{ background: EDGE_COLORS.mule }} />
            <span className="font-mono text-[10px] text-ash">Mule</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-4 h-[1.5px]" style={{ background: EDGE_COLORS.uncertain }} />
            <span className="font-mono text-[10px] text-ash">Uncertain</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-4 h-[1.5px]" style={{ background: EDGE_COLORS.safe }} />
            <span className="font-mono text-[10px] text-ash">Safe</span>
          </div>
        </div>
      </div>

      <div style={{ position: "relative", width: "100%" }}>
        {accounts.length === 0 ? (
          <Card className="flex items-center justify-center h-[750px]">
            <LoadingState />
          </Card>
        ) : (
          <div
            ref={containerRef}
            style={{ width: "100%", height: "750px", backgroundColor: "#000000", borderRadius: "8px" }}
            role="img"
            aria-label="Interactive network graph"
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
