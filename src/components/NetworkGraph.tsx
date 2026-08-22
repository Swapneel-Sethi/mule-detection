"use client";

import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { useFirestoreData } from "@/lib/useFirestoreData";
import type {
  DataSet,
  Edge,
  Network,
  Node,
  Options,
} from "vis-network/standalone";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";

interface GraphNode {
  id: string;
  label: string;
  riskScore: number;
  isMule: boolean;
}

interface GraphEdge {
  from: string;
  to: string;
  flagged: boolean;
  amount?: number;
  type?: string;
}

const EDGE_COLORS = {
  mule: "#ef4444",
  safe: "#3b82f6",
  uncertain: "#f97316",
  default: "#ffffff12",
  defaultFlagged: "#ffffff18",
};

function getEdgeColor(
  fromRisk: number,
  fromMule: boolean,
  toRisk: number,
  toMule: boolean
): string {
  if (fromMule || toMule) return EDGE_COLORS.mule;

  if (fromRisk >= 60 || toRisk >= 60) {
    return EDGE_COLORS.mule;
  }

  if (fromRisk >= 40 || toRisk >= 40) {
    return EDGE_COLORS.uncertain;
  }

  return EDGE_COLORS.safe;
}

function buildGraphData(
  accounts: ReturnType<typeof useFirestoreData>["accounts"],
  transactions: ReturnType<typeof useFirestoreData>["transactions"]
) {
  const graphNodes: GraphNode[] = accounts.map((account) => ({
    id: account.id,
    label: `${account.name}\n${account.id}`,
    riskScore: account.riskScore,
    isMule: account.isMule,
  }));

  const accountIds = new Set(accounts.map((account) => account.id));

  const accountMap = new Map(
    accounts.map((account) => [account.id, account])
  );

  const graphEdges: GraphEdge[] = [];
  const edgeSet = new Set<string>();

  for (const txn of transactions) {
    const fromId = txn.from;
    const toId = txn.to;

    if (!accountIds.has(fromId) || !accountIds.has(toId)) {
      continue;
    }

    const edgeKey = `${fromId}->${toId}`;

    if (edgeSet.has(edgeKey)) {
      continue;
    }

    edgeSet.add(edgeKey);

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

  return {
    graphNodes,
    displayEdges: graphEdges,
  };
}

export default function NetworkGraph() {
  const containerRef = useRef<HTMLDivElement>(null);
  const networkRef = useRef<Network | null>(null);

  const nodesRef = useRef<DataSet<Node, "id"> | null>(null);
  const edgesRef = useRef<DataSet<Edge, "id"> | null>(null);

  const { accounts, transactions, source } = useFirestoreData();

  const [graphStats, setGraphStats] = useState({
    nodes: 0,
    edges: 0,
    flaggedEdges: 0,
  });

  const [selectedAccount, setSelectedAccount] = useState<string | null>(
    null
  );

  const [panelOpen, setPanelOpen] = useState(false);

  const { graphNodes, displayEdges } = useMemo(() => {
    return buildGraphData(accounts, transactions);
  }, [accounts, transactions]);

  const accountsKey = useMemo(
    () =>
      accounts
        .map(
          (account) =>
            `${account.id}:${account.riskScore}:${account.isMule}`
        )
        .join(","),
    [accounts]
  );

  const txKey = useMemo(
    () =>
      transactions
        .map(
          (txn) =>
            `${txn.id}:${txn.from}:${txn.to}:${txn.amount}:${txn.timestamp}:${txn.flagged}`
        )
        .join(","),
    [transactions]
  );

  const accountMap = useMemo(() => {
    const map = new Map<
      string,
      ReturnType<typeof useFirestoreData>["accounts"][0]
    >();

    for (const account of accounts) {
      map.set(account.id, account);
    }

    return map;
  }, [accounts]);

  const getAccountName = useCallback(
    (id: string) => {
      return accountMap.get(id)?.name || id;
    },
    [accountMap]
  );

  const handleNodeClick = useCallback(
    (nodeId: string) => {
      const nodeEdges = displayEdges.filter(
        (edge) => edge.from === nodeId || edge.to === nodeId
      );

      const connectedIds = new Set<string>();

      connectedIds.add(nodeId);

      for (const edge of nodeEdges) {
        connectedIds.add(edge.from);
        connectedIds.add(edge.to);
      }

      if (nodesRef.current && edgesRef.current) {
        const nodeUpdates: Partial<Node>[] = [];

        nodesRef.current.forEach((node) => {
          const id = node.id as string;

          const account = accountMap.get(id);

          const isSelected = id === nodeId;

          const isConnected =
            connectedIds.has(id) && !isSelected;

          let background = "#050505";
          let border = "#222222";
          let fontColor = "#333333";
          let size = 4;

          if (isSelected) {
            background = "#ef4444";
            border = "#ffffff";
            fontColor = "#ffffff";
            size = 12;
          } else if (isConnected) {
            if (
              account?.isMule ||
              (account?.riskScore ?? 0) >= 60
            ) {
              background = "#ef4444";
              border = "#ef4444";
            } else if (
              (account?.riskScore ?? 0) >= 40
            ) {
              background = "#f97316";
              border = "#f97316";
            } else {
              background = "#3b82f6";
              border = "#3b82f6";
            }

            fontColor = "#ffffff";
            size = 8;
          }

          nodeUpdates.push({
            id,

            color: {
              background,
              border,
              highlight: {
                background,
                border: "#ffffff",
              },
            },

            font: {
              color: fontColor,
              size: 8,
              face: "JetBrains Mono, monospace",
            },

            size,
          });
        });

        nodesRef.current.update(nodeUpdates);

        const edgeUpdates: Partial<Edge>[] = [];

        edgesRef.current.forEach((edge) => {
          const e = edge as unknown as {
            id: string;
            from: string;
            to: string;
          };

          const isConnected =
            e.from === nodeId || e.to === nodeId;

          if (isConnected) {
            const fromAccount = accountMap.get(e.from);
            const toAccount = accountMap.get(e.to);

            edgeUpdates.push({
              id: e.id,

              color: getEdgeColor(
                fromAccount?.riskScore ?? 0,
                fromAccount?.isMule ?? false,
                toAccount?.riskScore ?? 0,
                toAccount?.isMule ?? false
              ),

              width: 2,
            });
          } else {
            edgeUpdates.push({
              id: e.id,
              color: "#ffffff08",
              width: 0.3,
            });
          }
        });

        edgesRef.current.update(edgeUpdates);
      }

      setSelectedAccount(nodeId);
    },
    [displayEdges, accountMap]
  );

  const handleNodeDoubleClick = useCallback(
    (nodeId: string) => {
      setSelectedAccount(nodeId);
      setPanelOpen(true);
    },
    []
  );

  const resetGraph = useCallback(() => {
    if (nodesRef.current && edgesRef.current) {
      const nodeUpdates: Partial<Node>[] = [];

      nodesRef.current.forEach((node) => {
        const id = node.id as string;

        nodeUpdates.push({
          id,

          color: {
            background: "#111111",
            border: "#ffffff",

            highlight: {
              background: "#222222",
              border: "#ffffff",
            },
          },

          font: {
            color: "#ffffff",
            size: 8,
            face: "JetBrains Mono, monospace",
          },

          size: 6,
        });
      });

      nodesRef.current.update(nodeUpdates);

      const edgeUpdates: Partial<Edge>[] = [];

      edgesRef.current.forEach((edge) => {
        const e = edge as unknown as {
          id: string;
          from: string;
          to: string;
        };

        const fromAccount = accountMap.get(e.from);
        const toAccount = accountMap.get(e.to);

        const isFlagged =
          !!fromAccount?.isMule ||
          !!toAccount?.isMule ||
          (fromAccount?.riskScore ?? 0) >= 60 ||
          (toAccount?.riskScore ?? 0) >= 60;

        edgeUpdates.push({
          id: e.id,

          color: isFlagged
            ? EDGE_COLORS.defaultFlagged
            : EDGE_COLORS.default,

          width: 0.5,
        });
      });

      edgesRef.current.update(edgeUpdates);
    }

    setSelectedAccount(null);
  }, [accountMap]);

  useEffect(() => {
    if (!containerRef.current || accounts.length === 0) {
      return;
    }

    let cancelled = false;

    async function init() {
      const vis = await import("vis-network/standalone");

      if (cancelled || !containerRef.current) {
        return;
      }

      const visNodes: DataSet<Node, "id"> =
        new vis.DataSet<Node, "id">(
          graphNodes.map((node) => ({
            id: node.id,

            label: "",

            title: `${node.id} | Risk: ${Math.round(
              node.riskScore
            )}%${node.isMule ? " | MULE" : ""}`,

            color: {
              background: "#111111",
              border: "#ffffff",

              highlight: {
                background: "#222222",
                border: "#ffffff",
              },
            },

            font: {
              color: "#ffffff",
              size: 8,
              face: "JetBrains Mono, monospace",
            },

            size: 6,

            borderWidth: 1,

            shape: "dot",
          }))
        );

      const visEdges: DataSet<Edge, "id"> =
        new vis.DataSet<Edge, "id">(
          displayEdges.map((edge) => ({
            id: `${edge.from}->${edge.to}`,

            from: edge.from,

            to: edge.to,

            color: EDGE_COLORS.default,

            width: 0.5,

            arrows: {
              to: {
                enabled: true,
                scaleFactor: 0.3,
              },
            },

            smooth: false,
          }))
        );

      nodesRef.current = visNodes;
      edgesRef.current = visEdges;

      const options: Options = {
        nodes: {
          shape: "dot",

          borderWidth: 1,

          chosen: true,

          shadow: false,

          font: {
            color: "#ffffff",
            size: 8,
            face: "JetBrains Mono, monospace",
          },
        },

        edges: {
          smooth: false,

          shadow: false,

          selectionWidth: 0,

          arrows: {
            to: {
              enabled: true,
              scaleFactor: 0.3,
            },
          },
        },

        physics: {
          enabled: true,

          solver: "forceAtlas2Based",

          forceAtlas2Based: {
            gravitationalConstant: -80,
            centralGravity: 0.01,
            springLength: 90,
            springConstant: 0.04,
            damping: 0.85,
            avoidOverlap: 0.5,
          },

          stabilization: {
            enabled: true,
            iterations: 120,
            updateInterval: 25,
            onlyDynamicEdges: false,
            fit: true,
          },

          adaptiveTimestep: true,

          minVelocity: 0.5,

          maxVelocity: 30,
        },

        interaction: {
          hover: true,

          tooltipDelay: 200,

          zoomView: true,

          dragView: true,

          dragNodes: true,

          multiselect: false,

          selectConnectedEdges: false,

          navigationButtons: false,

          keyboard: false,
        },

        layout: {
          improvedLayout: false,

          randomSeed: 42,
        },
      };

      const network = new vis.Network(
        containerRef.current,
        {
          nodes: visNodes,
          edges: visEdges,
        },
        options
      );

      networkRef.current = network;

      network.once(
        "stabilizationIterationsDone",
        () => {
          if (cancelled) {
            return;
          }

          network.setOptions({
            physics: {
              enabled: false,
            },
          });

          network.fit({
            animation: {
              duration: 350,

              easingFunction: "easeInOutQuad",
            },
          });
        }
      );

      network.on(
        "click",
        (params: { nodes: string[] }) => {
          if (params.nodes.length > 0) {
            handleNodeClick(params.nodes[0]);
          } else {
            resetGraph();
          }
        }
      );

      network.on(
        "doubleClick",
        (params: { nodes: string[] }) => {
          if (params.nodes.length > 0) {
            handleNodeDoubleClick(
              params.nodes[0]
            );
          }
        }
      );

      setGraphStats({
        nodes: graphNodes.length,

        edges: displayEdges.length,

        flaggedEdges: displayEdges.filter(
          (edge) => edge.flagged
        ).length,
      });
    }

    init();

    return () => {
      cancelled = true;

      if (networkRef.current) {
        networkRef.current.destroy();

        networkRef.current = null;
      }

      nodesRef.current = null;

      edgesRef.current = null;
    };
  }, [
    accountsKey,
    txKey,
    graphNodes,
    displayEdges,
    handleNodeClick,
    handleNodeDoubleClick,
    resetGraph,
  ]);

  const selectedAccountData = selectedAccount
    ? accountMap.get(selectedAccount)
    : null;

  const accountTransactions = useMemo(() => {
    if (!selectedAccount) {
      return [];
    }

    return transactions
      .filter(
        (txn) =>
          txn.from === selectedAccount ||
          txn.to === selectedAccount
      )
      .sort(
        (a, b) =>
          new Date(b.timestamp).getTime() -
          new Date(a.timestamp).getTime()
      );
  }, [selectedAccount, transactions]);

  return (
    <div className="p-8 max-w-[1400px] mx-auto relative">
      <PageHeader
        title="Network Graph"
        subtitle="Click a node to highlight connections. Double-click for transaction history."
      />

      <div className="flex items-center gap-6 mb-5">
        {[
          {
            label: "Low",
            border: "#444345",
          },
          {
            label: "Medium",
            border: "#b8bab9",
          },
          {
            label: "High",
            border: "#ffffff",
          },
        ].map((level) => (
          <div
            key={level.label}
            className="flex items-center gap-2"
          >
            <span
              className="w-2 h-2 rounded-full border"
              style={{
                borderColor: level.border,
                background: "#000",
              }}
            />

            <span className="font-mono text-[10px] tracking-[-0.02em] text-ash">
              {level.label}
            </span>
          </div>
        ))}

        <div className="ml-auto flex items-center gap-5">
          <div className="flex items-center gap-2">
            <span
              className="w-4 h-[1px]"
              style={{
                backgroundColor:
                  EDGE_COLORS.mule,
              }}
            />

            <span className="font-mono text-[10px] tracking-[-0.02em] text-ash">
              Mule
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span
              className="w-4 h-[1px]"
              style={{
                backgroundColor:
                  EDGE_COLORS.uncertain,
              }}
            />

            <span className="font-mono text-[10px] tracking-[-0.02em] text-ash">
              Uncertain
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span
              className="w-4 h-[1px]"
              style={{
                backgroundColor:
                  EDGE_COLORS.safe,
              }}
            />

            <span className="font-mono text-[10px] tracking-[-0.02em] text-ash">
              Safe
            </span>
          </div>
        </div>
      </div>

      <div className="relative">
        {accounts.length === 0 ? (
          <Card className="flex items-center justify-center min-h-[680px]">
            <EmptyState message="No graph data available" />
          </Card>
        ) : (
          <div
            ref={containerRef}
            className="w-full border border-frost/10 rounded-lg bg-surface-1 overflow-hidden"
            style={{
              height: "680px",
            }}
          />
        )}

        <div
          className={`absolute top-0 right-0 h-full w-[380px] bg-void border-l border-frost/10 rounded-r-lg transition-transform duration-300 ease-out overflow-hidden ${
            panelOpen
              ? "translate-x-0"
              : "translate-x-full"
          }`}
        >
          {selectedAccountData && (
            <div className="h-full flex flex-col">
              <div className="p-5 border-b border-frost/10">
                <div className="flex items-center justify-between mb-3">
                  <span className="font-mono text-[12px] tracking-[-0.02em] text-bone">
                    {selectedAccountData.id}
                  </span>

                  <button
                    onClick={() => {
                      setPanelOpen(false);
                      resetGraph();
                    }}
                    className="font-mono text-[10px] tracking-[-0.02em] text-ash hover:text-bone transition-default"
                  >
                    Close
                  </button>
                </div>

                <p className="font-mono text-[10px] tracking-[-0.02em] text-ash mb-1">
                  {selectedAccountData.name}
                </p>

                <div className="flex items-center gap-4 mt-2">
                  <span className="font-mono text-[10px] tracking-[-0.02em] text-ash">
                    Risk:{" "}
                    <span className="text-bone">
                      {selectedAccountData.riskScore.toFixed(
                        0
                      )}
                      %
                    </span>
                  </span>

                  <span className="font-mono text-[10px] tracking-[-0.02em] text-ash">
                    Bank:{" "}
                    <span className="text-bone">
                      {selectedAccountData.bank}
                    </span>
                  </span>

                  {selectedAccountData.isMule && (
                    <span
                      className="font-mono text-[10px] tracking-[-0.02em] px-1.5 py-0.5 rounded-[2px]"
                      style={{
                        backgroundColor:
                          EDGE_COLORS.mule +
                          "30",

                        color:
                          EDGE_COLORS.mule,
                      }}
                    >
                      MULE
                    </span>
                  )}
                </div>

                {selectedAccountData.flags.length >
                  0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {selectedAccountData.flags.map(
                      (flag) => (
                        <span
                          key={flag}
                          className="font-mono text-[9px] tracking-[-0.02em] text-ash bg-charcoal/30 px-1.5 py-0.5 rounded-[2px]"
                        >
                          {flag}
                        </span>
                      )
                    )}
                  </div>
                )}
              </div>

              <div className="flex-1 overflow-y-auto p-5">
                <p className="font-mono text-[10px] tracking-[-0.02em] text-ash uppercase mb-4">
                  Transaction History (
                  {accountTransactions.length})
                </p>

                {accountTransactions.length >
                0 ? (
                  <div className="space-y-3">
                    {accountTransactions.map(
                      (txn) => {
                        const isOutgoing =
                          txn.from ===
                          selectedAccount;

                        return (
                          <div
                            key={txn.id}
                            className="border border-frost/10 rounded-lg p-3"
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-mono text-[10px] tracking-[-0.02em] text-ash">
                                {txn.id}
                              </span>

                              <span className="font-mono text-[10px] tracking-[-0.02em] text-ash">
                                {new Date(
                                  txn.timestamp
                                ).toLocaleString(
                                  "en-IN",
                                  {
                                    month:
                                      "short",
                                    day: "numeric",
                                    hour: "2-digit",
                                    minute:
                                      "2-digit",
                                  }
                                )}
                              </span>
                            </div>

                            <div className="flex items-center gap-2 text-[11px]">
                              <span className="font-mono text-bone">
                                {getAccountName(
                                  txn.from
                                )}
                              </span>

                              <span className="font-mono text-ash">
                                &rarr;
                              </span>

                              <span className="font-mono text-bone">
                                {getAccountName(
                                  txn.to
                                )}
                              </span>
                            </div>

                            <div className="flex items-center justify-between mt-1">
                              <span
                                className={`font-mono text-[12px] tracking-[-0.02em] ${
                                  txn.flagged
                                    ? "text-bone"
                                    : "text-ash"
                                }`}
                              >
                                ₹
                                {txn.amount.toLocaleString(
                                  "en-IN"
                                )}
                              </span>

                              <div className="flex items-center gap-2">
                                <span className="font-mono text-[9px] tracking-[-0.02em] text-ash uppercase">
                                  {txn.type}
                                </span>

                                {txn.flagged && (
                                  <span
                                    className="font-mono text-[9px] tracking-[-0.02em] px-1 py-0.5 rounded-[2px]"
                                    style={{
                                      backgroundColor:
                                        EDGE_COLORS.mule +
                                        "30",

                                      color:
                                        EDGE_COLORS.mule,
                                    }}
                                  >
                                    Flagged
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-2 mt-1">
                              <div className="flex-1 h-[1px] bg-charcoal rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-bone rounded-full"
                                  style={{
                                    width: `${Math.min(
                                      100,
                                      Math.max(
                                        0,
                                        txn.riskScore
                                      )
                                    )}%`,
                                  }}
                                />
                              </div>

                              <span className="font-mono text-[9px] tracking-[-0.02em] text-ash">
                                {Math.round(
                                  txn.riskScore
                                )}
                                %
                              </span>
                            </div>

                            {isOutgoing && (
                              <span className="sr-only">
                                Outgoing transaction
                              </span>
                            )}
                          </div>
                        );
                      }
                    )}
                  </div>
                ) : (
                  <p className="font-mono text-[10px] tracking-[-0.02em] text-ash">
                    No transactions found
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-4 gap-5">
        {[
          {
            label: "Nodes",
            value: graphStats.nodes,
          },
          {
            label: "Edges",
            value: graphStats.edges,
          },
          {
            label: "Flagged",
            value: graphStats.flaggedEdges,
          },
          {
            label: "Source",
            value:
              source === "firestore"
                ? "Live"
                : "Demo",
          },
        ].map((metric) => (
          <Card key={metric.label}>
            <p className="font-mono text-[10px] tracking-[-0.02em] text-ash uppercase mb-1">
              {metric.label}
            </p>

            <p className="font-mono text-[20px] tracking-[-0.02em] text-bone">
              {metric.value}
            </p>
          </Card>
        ))}
      </div>
    </div>
  );
}