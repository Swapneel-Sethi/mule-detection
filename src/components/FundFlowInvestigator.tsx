"use client";

/**
 * CASE FILE — Chainalysis-Reactor-style fund-flow investigator.
 *
 * Left-to-right directed evidence chain: incoming hops on the left,
 * the focus account centre, outgoing hops on the right. Deterministic
 * layered layout (no physics), amount-labelled arrows, risk badges.
 * This mirrors how billion-dollar AML platforms present an investigation.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Card from "@/components/ui/Card";
import LoadingState from "@/components/ui/LoadingState";
import PageHeader from "@/components/ui/PageHeader";
import { formatCurrencyINR } from "@/lib/utils";

interface FlowNode {
  id: string;
  name: string;
  bank: string;
  city: string;
  isMule: boolean;
  riskLevel: "critical" | "high" | "medium";
  tier: "critical" | "high-risk" | "watchlist";
  score: number;
  degree: number;
  volumeIn: number;
  volumeOut: number;
  flags: string[];
}

interface FlowLink {
  source: string;
  target: string;
  amount: number;
  count: number;
  flagged: boolean;
}

interface FlowSnapshot {
  nodes: FlowNode[];
  links: FlowLink[];
}

const COL_WIDTH = 300;
const ROW_HEIGHT = 96;
const DEPTHS = 2;

const TIER_COLOR: Record<FlowNode["tier"], string> = {
  critical: "#ef4562",
  "high-risk": "#f2a35c",
  watchlist: "#65a9fa",
};

interface Placed {
  node: FlowNode;
  column: number; // −depth…+depth, 0 = focus
  row: number;
}

export default function FundFlowInvestigator() {
  const [snapshot, setSnapshot] = useState<FlowSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [hoverEdge, setHoverEdge] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/graph/mule-galaxy", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<FlowSnapshot>;
      })
      .then((data) => {
        setSnapshot(data);
        // Default focus: highest-score critical account — the strongest story.
        const seed = [...data.nodes].sort((a, b) => b.score - a.score)[0];
        setFocusId(seed?.id ?? null);
        setLoading(false);
      })
      .catch((caught) => {
        if (!(caught instanceof DOMException && caught.name === "AbortError")) {
          setError(caught instanceof Error ? caught.message : "Failed to load");
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, []);

  const nodeById = useMemo(
    () => new Map((snapshot?.nodes ?? []).map((node) => [node.id, node])),
    [snapshot]
  );

  const adjacency = useMemo(() => {
    const map = new Map<string, { other: string; link: FlowLink }[]>();
    for (const link of snapshot?.links ?? []) {
      if (!map.has(link.source)) map.set(link.source, []);
      if (!map.has(link.target)) map.set(link.target, []);
      map.get(link.source)!.push({ other: link.target, link });
      map.get(link.target)!.push({ other: link.source, link });
    }
    return map;
  }, [snapshot]);

  /**
   * Reactor layout: BFS outward from the focus — incoming corridors become
   * negative columns, outgoing positive. Within each column, accounts are
   * stacked by total transacted value so the biggest counterparties sit top.
   */
  const placed = useMemo<(Placed & { x: number; y: number })[]>(() => {
    if (!focusId || !snapshot) return [];
    const focus = nodeById.get(focusId);
    if (!focus) return [];

    const byColumn = new Map<number, FlowNode[]>();
    const seen = new Set<string>([focusId]);
    let frontier: string[] = [focusId];
    for (let depth = 1; depth <= DEPTHS; depth += 1) {
      const next: string[] = [];
      for (const id of frontier) {
        const entries = [...(adjacency.get(id) ?? [])].sort(
          (a, b) => b.link.amount - a.link.amount
        );
        for (const { other } of entries) {
          if (seen.has(other)) continue;
          seen.add(other);
          const node = nodeById.get(other);
          if (!node) continue;
          // Direction relative to focus: did money flow toward focus (incoming)
          // or away (outgoing)? Compare against the connecting edge.
          const towardsFocus = adjacency.get(other)?.some(
            (entry) => entry.other === id && entry.link.target === id && entry.link.source === other
          );
          const column = towardsFocus ? -depth : depth;
          if (!byColumn.has(column)) byColumn.set(column, []);
          byColumn.get(column)!.push(node);
          next.push(other);
        }
      }
      frontier = next;
    }

    const result: (Placed & { x: number; y: number })[] = [
      { node: focus, column: 0, row: 0, x: 0, y: 0 },
    ];
    for (const [column, nodes] of byColumn) {
      const sorted = [...nodes].sort((a, b) => b.score - a.score);
      sorted.forEach((node, index) => {
        result.push({
          node,
          column,
          row: index,
          x: column * COL_WIDTH,
          y: (index - (sorted.length - 1) / 2) * ROW_HEIGHT,
        });
      });
    }
    return result;
  }, [adjacency, focusId, nodeById, snapshot]);

  const positionById = useMemo(
    () => new Map(placed.map((p) => [p.node.id, p])),
    [placed]
  );

  /** Only edges whose BOTH endpoints survived placement render. */
  const visibleLinks = useMemo(() => {
    type Endpoint = { node: FlowNode; x: number; y: number };
    const rows: { link: FlowLink; from: Endpoint; to: Endpoint; key: string }[] = [];
    for (const link of snapshot?.links ?? []) {
      if (flaggedOnly && !link.flagged) continue;
      const a = positionById.get(link.source);
      const b = positionById.get(link.target);
      if (!a || !b || a.column === b.column) continue;
      const [from, to] = a.column <= b.column ? [a, b] : [b, a];
      rows.push({ link, from, to, key: `${link.source}->${link.target}` });
    }
    return rows.sort((a, b) => a.link.amount - b.link.amount);
  }, [flaggedOnly, positionById, snapshot]);

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2 || !snapshot) return [];
    return snapshot.nodes
      .filter((node) => node.id.toLowerCase().includes(q) || node.name.toLowerCase().includes(q))
      .slice(0, 6);
  }, [query, snapshot]);

  const canvasWidth = (DEPTHS * 2 + 1) * COL_WIDTH;
  const maxRows = useMemo(
    () => Math.max(4, ...[...new Set(placed.map((p) => p.column))].map((c) => placed.filter((p) => p.column === c).length)),
    [placed]
  );
  const canvasHeight = maxRows * ROW_HEIGHT + 160;

  const handleSelect = useCallback((id: string) => {
    setFocusId(id);
    setQuery("");
  }, []);

  const stats = useMemo(() => {
    if (!focusId) return null;
    const inc = visibleLinks.filter((row) => row.to.node.id === focusId);
    const out = visibleLinks.filter((row) => row.from.node.id === focusId);
    return {
      inAmount: inc.reduce((sum, row) => sum + row.link.amount, 0),
      outAmount: out.reduce((sum, row) => sum + row.link.amount, 0),
      inCount: inc.length,
      outCount: out.length,
    };
  }, [focusId, visibleLinks]);

  if (error) {
    return (
      <div>
        <PageHeader title="Case File" subtitle="Directed fund-flow investigation" />
        <Card className="flex min-h-[560px] items-center justify-center">
          <p className="font-mono text-sm text-red-300">{error}</p>
        </Card>
      </div>
    );
  }
  if (loading || !snapshot) {
    return (
      <div>
        <PageHeader title="Case File" subtitle="Directed fund-flow investigation" />
        <Card className="flex min-h-[560px] items-center justify-center">
          <LoadingState message="Assembling the evidence chain…" />
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Case File" subtitle="Directed fund-flow investigation | sources → suspect → cash-outs" />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative">
          <input
            aria-label="Focus investigation on an account"
            className="w-72 rounded-sm border border-frost/10 bg-surface-1 bg-transparent px-3 py-1.5 font-mono text-[10px] text-bone outline-none placeholder:text-ash/70"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && suggestions[0]) handleSelect(suggestions[0].id);
              if (event.key === "Escape") setQuery("");
            }}
            placeholder="Focus on account ID…"
          />
          {suggestions.length > 0 && (
            <div className="absolute left-0 top-full z-20 mt-1 w-80 rounded-sm border border-frost/15 bg-void/97 shadow-xl backdrop-blur">
              {suggestions.map((node) => (
                <button
                  key={node.id}
                  onClick={() => handleSelect(node.id)}
                  className="flex w-full items-center justify-between gap-2 border-b border-frost/5 px-3 py-1.5 text-left last:border-b-0 hover:bg-surface-2"
                >
                  <span className="truncate font-mono text-[10px] text-bone">{node.id}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: TIER_COLOR[node.tier] }} />
                    <span className="rounded-sm bg-surface-2 px-1 font-mono text-[9px] text-ash">{node.score.toFixed(0)}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={() => setFlaggedOnly((value) => !value)}
          className={`rounded-sm border px-3 py-1.5 font-mono text-[10px] uppercase ${flaggedOnly ? "border-risk-critical/60 bg-risk-critical/10 text-risk-critical" : "border-frost/10 text-ash hover:text-bone"}`}
        >
          Flagged corridors only
        </button>
        {stats && (
          <div className="ml-auto flex gap-3 font-mono text-[10px] uppercase text-ash">
            <span>In <span className="text-risk-critical">{formatCurrencyINR(stats.inAmount)}</span> ({stats.inCount})</span>
            <span>Out <span className="text-sky-300">{formatCurrencyINR(stats.outAmount)}</span> ({stats.outCount})</span>
          </div>
        )}
      </div>

      <Card className="overflow-x-auto">
        <svg width={canvasWidth} height={canvasHeight} className="mx-auto block" role="img" aria-label="Directed fund-flow evidence chain">
          <defs>
            <marker id="arrow-flag" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="#ef4562" />
            </marker>
            <marker id="arrow-plain" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="#7f95ad" />
            </marker>
          </defs>

          {/* Column captions */}
          {[...new Set(placed.map((p) => p.column))].sort((a, b) => a - b).map((column) => (
            <text
              key={column}
              x={canvasWidth / 2 + column * COL_WIDTH}
              y={28}
              textAnchor="middle"
              className="fill-[#888888] font-mono"
              fontSize={10}
            >
              {column === 0 ? "FOCUS ACCOUNT" : column < 0 ? `SOURCE HOP ${-column}` : `CASH-OUT HOP ${column}`}
            </text>
          ))}

          {/* Edges */}
          {visibleLinks.map(({ link, from, to, key }) => {
            const x1 = canvasWidth / 2 + from.x + 128;
            const y1 = canvasHeight / 2 + from.y;
            const x2 = canvasWidth / 2 + to.x - 132;
            const y2 = canvasHeight / 2 + to.y;
            const midX = (x1 + x2) / 2;
            const hot = hoverEdge === key;
            const stroke = link.flagged ? "#ef4562" : "#7f95ad";
            return (
              <g key={key} opacity={hot ? 1 : link.flagged ? 0.75 : 0.35}>
                <path
                  d={`M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={link.flagged ? (hot ? 3 : 1.8) : hot ? 2.4 : 1}
                  markerEnd={link.flagged ? "url(#arrow-flag)" : "url(#arrow-plain)"}
                />
                {(link.amount > 500_000 || hot) && (
                  <text x={midX} y={(y1 + y2) / 2 - 6} textAnchor="middle" fontSize={9} fill={stroke} className="font-mono">
                    {formatCurrencyINR(link.amount)}
                  </text>
                )}
                <path
                  d={`M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={14}
                  onMouseEnter={() => setHoverEdge(key)}
                  onMouseLeave={() => setHoverEdge(null)}
                />
              </g>
            );
          })}

          {/* Nodes */}
          {placed.map(({ node, x, y }) => {
            const isFocus = node.id === focusId;
            const px = canvasWidth / 2 + x;
            const py = canvasHeight / 2 + y;
            const color = TIER_COLOR[node.tier];
            return (
              <g key={node.id} transform={`translate(${px}, ${py})`} onClick={() => handleSelect(node.id)} className="cursor-pointer">
                {isFocus && <rect x={-136} y={-30} width={272} height={60} rx={8} fill="none" stroke={color} strokeWidth={1.4} strokeDasharray="5 3" />}
                <rect x={-130} y={-26} width={260} height={52} rx={7} fill="#0b101b" stroke={color} strokeOpacity={isFocus ? 0.9 : 0.45} strokeWidth={1.1} />
                <circle cx={-114} cy={0} r={5} fill={color} />
                <text x={-100} y={-4} fontSize={11} fill="#e8f0ff" className="font-mono" fontWeight={600}>
                  {node.id.length > 22 ? `${node.id.slice(0, 21)}…` : node.id}
                </text>
                <text x={-100} y={12} fontSize={9} fill="#888888" className="font-mono">
                  {node.bank} · {node.city} · {node.flags.length} flags
                </text>
                <rect x={86} y={-14} width={36} height={17} rx={3} fill={color} fillOpacity={0.16} />
                <text x={104} y={-2} fontSize={9} fill={color} textAnchor="middle" className="font-mono">
                  {node.score.toFixed(0)}
                </text>
              </g>
            );
          })}
        </svg>
      </Card>

      <p className="mt-2 font-mono text-[10px] text-ash/70">
        Evidence-chain layout · click any card to re-focus the investigation on it · red arrows = flagged corridors ·
        score badge = ML risk · amounts label on hover or high-value legs
      </p>

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["Focused Account", focusId ?? "—"],
          ["Sources Traced", String(placed.filter((p) => p.column < 0).length)],
          ["Cash-outs Traced", String(placed.filter((p) => p.column > 0).length)],
          ["Flagged Corridors", String(visibleLinks.filter((row) => row.link.flagged).length)],
        ].map(([label, value]) => (
          <Card key={label}>
            <p className="mb-2 font-mono text-[11px] uppercase text-ash">{label}</p>
            <p className="truncate font-mono text-sm text-bone">{value}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
