"use client";

import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { useFirestoreData } from "@/lib/useFirestoreData";
import type { Network, Node, Edge, Options } from "vis-network/standalone";
import { DataSet } from "vis-data";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import LoadingState from "@/components/ui/LoadingState";

const MAX_NODES = 200;
const MAX_EDGES = 2000;

const EDGE_COLORS = {
  mule: "#ff3333",
  uncertain: "#ff9944",
  safe: "#556677",
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
    isMule: boolean; isCore: boolean;
  }>();

  for (const a of coreAccounts) {
    nodeMap.set(a.id, {
      id: a.id, name: a.name,
      riskScore: a.riskScore, isMule: a.isMule, isCore: true,
    });
  }

  const graphEdges: { from: string; to: string; flagged: boolean }[] = [];
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
          riskScore: acc?.riskScore ?? 0, isMule: acc?.isMule ?? false, isCore: false,
        });
      }
    }

    const edgeKey = `${txn.from}->${txn.to}`;
    if (edgeSet.has(edgeKey)) continue;
    edgeSet.add(edgeKey);
    if (graphEdges.length >= MAX_EDGES) break;

    graphEdges.push({
      from: txn.from, to: txn.to,
      flagged: txn.flagged,
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

      // Place all nodes in a perfect circle
      const radius = 300;
      const visNodes: Node[] = graphNodes.map((n, i) => {
        const angle = (i / graphNodes.length) * 2 * Math.PI - Math.PI / 2;
        const isHigh = n.riskScore >= 70 || n.isMule;

        return {
          id: n.id,
          label: "",
          color: {
            background: isHigh ? "#cc3300" : "#996600",
            border: isHigh ? "#ff4422" : "#cc8800",
            highlight: { background: "#ffffff", border: "#ffffff" },
          },
          size: 12,
          borderWidth: 1,
          borderWidthSelected: 2,
          shape: "circle" as const,
          x: Math.cos(angle) * radius,
          y: Math.sin(angle) * radius,
          fixed: { x: true, y: true },
          title: `${n.name}\n${n.id}\nRisk: ${n.riskScore.toFixed(1)}%${n.isMule ? "\n[MULE]" : ""}`,
        };
      });

      const visEdges: Edge[] = displayEdges.map((e) => {
        return {
          id: `${e.from}->${e.to}`,
          from: e.from,
          to: e.to,
          color: { color: "#445566", highlight: "#88aacc", opacity: 0.6 },
          width: 0.8,
          smooth: false,
          arrows: { to: { enabled: false } },
        };
      });

      const nodes = new VisDataSet(visNodes);
      const edges = new VisDataSet(visEdges);

      const options: Options = {
        nodes: {
          font: { color: "#cccccc", size: 11, face: "JetBrains Mono, monospace", strokeWidth: 0 },
          borderWidth: 1,
          borderWidthSelected: 2,
          shape: "circle",
          color: {
            background: "#cc3300",
            border: "#ff4422",
            highlight: { background: "#ffffff", border: "#ffffff" },
          },
        },
        edges: {
          color: { color: "#445566", highlight: "#88aacc", opacity: 0.6 },
          width: 0.8,
          smooth: false,
        },
        physics: { enabled: false },
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
        },
        layout: { improvedLayout: false, hierarchical: false },
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
      }, 300);

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
            <span className="w-3 h-3 rounded-full" style={{ background: "#996600", border: "1px solid #cc8800" }} />
            <span className="font-mono text-[10px] text-ash">Low</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full" style={{ background: "#cc3300", border: "1px solid #ff4422" }} />
            <span className="font-mono text-[10px] text-ash">High</span>
          </div>
          <div className="w-px h-3 bg-charcoal mx-1" />
          <div className="flex items-center gap-2">
            <span className="w-4 h-[1px]" style={{ background: "#445566" }} />
            <span className="font-mono text-[10px] text-ash">Edge</span>
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
