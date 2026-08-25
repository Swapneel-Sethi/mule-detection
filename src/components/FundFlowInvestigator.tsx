"use client";

/**
 * CASE FILE — full-network directed fund-flow board.
 *
 * EVERY flagged account appears, auto-layered left-to-right by money-flow
 * topology: pure sources on the left, laundering intermediates centre,
 * cash-out sinks right. Rendered on Canvas2D with pan/zoom so the whole
 * network stays explorable. Clicking an account drills into its Reactor-style
 * evidence chain (the neighbourhood layout), with one click back to the full net.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

const CARD_W = 158;
const CARD_H = 36;
const ROW_GAP = 7;
const COL_GAP = 96;
const MAX_ROWS_PER_BLOCK = 56; // wrap tall columns into side-by-side blocks

const TIER_COLOR: Record<FlowNode["tier"], string> = {
  critical: "#ef4562",
  "high-risk": "#f2a35c",
  watchlist: "#65a9fa",
};

interface PlacedCard {
  node: FlowNode;
  x: number; // content coords (centre)
  y: number;
  layer: number;
  block: number;
}

export default function FundFlowInvestigator() {
  const [snapshot, setSnapshot] = useState<FlowSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null); // null = FULL NETWORK
  const [query, setQuery] = useState("");
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [hover, setHover] = useState<{ node: FlowNode; cx: number; cy: number } | null>(null);

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sizeRef = useRef({ w: 1200, h: 720 });
  const viewRef = useRef({ x: 0, y: 0, k: 1 }); // pan + zoom (screen = content*k + pan)
  const dragRef = useRef<{ sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null);
  const cardsRef = useRef<PlacedCard[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/graph/mule-galaxy", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<FlowSnapshot>;
      })
      .then((data) => {
        setSnapshot(data);
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

  /** Directed adjacency restricted to outgoing edges. */
  const outAdj = useMemo(() => {
    const map = new Map<string, FlowLink[]>();
    for (const link of snapshot?.links ?? []) {
      if (!map.has(link.source)) map.set(link.source, []);
      map.get(link.source)!.push(link);
    }
    return map;
  }, [snapshot]);

  /**
   * Topological-ish layering of the WHOLE flagged subgraph: accounts with no
   * incoming corridors are layer-0 pure sources; everyone else sits one layer
   * past their deepest feeder. Cycle members that are never reached fall into
   * the final layer + 1. This is what makes the full net read left-to-right.
   */
  const layerOfAll = useMemo(() => {
    const map = new Map<string, number>();
    if (!snapshot) return map;
    const inDeg = new Map<string, number>();
    for (const link of snapshot.links) {
      inDeg.set(link.target, (inDeg.get(link.target) ?? 0) + 1);
    }
    let frontier: string[] = snapshot.nodes
      .filter((node) => (inDeg.get(node.id) ?? 0) === 0)
      .map((node) => node.id);
    let depth = 0;
    frontier.forEach((id) => map.set(id, 0));
    while (frontier.length) {
      depth += 1;
      const next: string[] = [];
      for (const id of frontier) {
        for (const link of outAdj.get(id) ?? []) {
          if (!map.has(link.target)) {
            map.set(link.target, depth);
            next.push(link.target);
          }
        }
      }
      frontier = next;
    }
    const fallbackDepth = depth + 1;
    for (const node of snapshot.nodes) {
      if (!map.has(node.id)) map.set(node.id, fallbackDepth);
    }
    return map;
  }, [outAdj, snapshot]);

  /** Full-network placements: every account, wrapped blocks per layer. */
  const networkCards = useMemo<PlacedCard[]>(() => {
    if (!snapshot) return [];
    const byLayer = new Map<number, FlowNode[]>();
    for (const node of snapshot.nodes) {
      const layer = layerOfAll.get(node.id) ?? 0;
      if (!byLayer.has(layer)) byLayer.set(layer, []);
      byLayer.get(layer)!.push(node);
    }
    const result: PlacedCard[] = [];
    const layers = [...byLayer.keys()].sort((a, b) => a - b);
    for (const layer of layers) {
      const sorted = [...byLayer.get(layer)!].sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
      const rowCount = Math.ceil(sorted.length / MAX_ROWS_PER_BLOCK);
      sorted.forEach((node, index) => {
        const block = Math.floor(index / MAX_ROWS_PER_BLOCK);
        const row = index % MAX_ROWS_PER_BLOCK;
        const colInBlock = Math.floor(block / rowCount);
        const rowInBlock = block % rowCount;
        result.push({
          node,
          layer,
          block,
          x: layer * (CARD_W + COL_GAP) + colInBlock * (CARD_W + 46),
          y: rowInBlock * (CARD_H + ROW_GAP) - ((rowCount * (CARD_H + ROW_GAP)) / 2),
        });
      });
    }
    return result;
  }, [layerOfAll, snapshot]);

  /** Chain placements for focus mode (Reactor-style neighbourhood). */
  const chainCards = useMemo<PlacedCard[]>(() => {
    if (!focusId || !snapshot) return [];
    const focus = nodeById.get(focusId);
    if (!focus) return [];
    const byColumn = new Map<number, FlowNode[]>();
    const seen = new Set<string>([focusId]);
    // Reactor-style neighbourhood: direct in-neighbours (col −1), the focus
    // itself (0), direct out-neighbours (+1).
    const incoming: FlowNode[] = [];
    const outgoing: FlowNode[] = [];
    for (const link of snapshot.links) {
      if (link.target === focusId) {
        const n = nodeById.get(link.source);
        if (n && !seen.has(n.id)) { seen.add(n.id); incoming.push(n); }
      }
      if (link.source === focusId) {
        const n = nodeById.get(link.target);
        if (n && !seen.has(n.id)) { seen.add(n.id); outgoing.push(n); }
      }
    }
    byColumn.set(-1, incoming.sort((a, b) => b.score - a.score));
    byColumn.set(1, outgoing.sort((a, b) => b.score - a.score));
    const result: PlacedCard[] = [{ node: focus, x: 0, y: 0, layer: 0, block: 0 }];
    for (const [column, list] of byColumn) {
      list.forEach((node, index) => {
        result.push({
          node,
          layer: column,
          block: 0,
          x: column * (CARD_W + COL_GAP + 60),
          y: (index - (list.length - 1) / 2) * (CARD_H + 14),
        });
      });
    }
    return result;
  }, [focusId, nodeById, snapshot]);

  const cards = focusId ? chainCards : networkCards;

  // Keep the draw-loop's card list in sync (refs must not be written during render).
  useEffect(() => {
    cardsRef.current = cards;
  }, [cards]);

  const positionById = useMemo(() => new Map(cards.map((c) => [c.node.id, c])), [cards]);

  const edges = useMemo(() => {
    if (!snapshot) return [];
    const rows: { link: FlowLink; ax: number; ay: number; bx: number; by: number }[] = [];
    for (const link of snapshot.links) {
      if (flaggedOnly && !link.flagged) continue;
      const a = positionById.get(link.source);
      const b = positionById.get(link.target);
      if (!a || !b || (a.x === b.x && a.y === b.y)) continue;
      rows.push({ link, ax: a.x, ay: a.y, bx: b.x, by: b.y });
    }
    return rows;
  }, [flaggedOnly, positionById, snapshot]);

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2 || !snapshot) return [];
    return snapshot.nodes
      .filter((node) => node.id.toLowerCase().includes(q) || node.name.toLowerCase().includes(q))
      .slice(0, 6);
  }, [query, snapshot]);

  /** Fit view to content bounds. */
  const fitView = useCallback(() => {
    const list = cardsRef.current;
    const { w, h } = sizeRef.current;
    if (!list.length || !w) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const c of list) {
      minX = Math.min(minX, c.x - CARD_W / 2); maxX = Math.max(maxX, c.x + CARD_W / 2);
      minY = Math.min(minY, c.y - CARD_H / 2); maxY = Math.max(maxY, c.y + CARD_H / 2);
    }
    const pad = 48;
    const k = Math.min((w - pad * 2) / (maxX - minX), (h - pad * 2) / (maxY - minY), 2.2);
    viewRef.current.k = Math.max(k, 0.04);
    viewRef.current.x = w / 2 - ((minX + maxX) / 2) * viewRef.current.k;
    viewRef.current.y = h / 2 - ((minY + maxY) / 2) * viewRef.current.k;
  }, []);

  /** Main render — canvas redraw on any relevant change. */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !snapshot) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const { width, height } = canvas.getBoundingClientRect();
    sizeRef.current = { w: width, h: height };
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);

    const { x: vx, y: vy, k } = viewRef.current;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#05070d";
    ctx.fillRect(0, 0, width, height);
    ctx.translate(vx, vy);
    ctx.scale(k, k);

    const viewL = -vx / k, viewT = -vy / k, viewR = viewL + width / k, viewB = viewT + height / k;

    // Edges first (under cards). Straight lines + cheap alpha; culled.
    ctx.lineWidth = 1 / k;
    for (const e of edges) {
      const x1 = e.ax + CARD_W / 2, y1 = e.ay, x2 = e.bx - CARD_W / 2, y2 = e.by;
      if ((x1 < viewL && x2 < viewL) || (x1 > viewR && x2 > viewR) || (y1 < viewT && y2 < viewT) || (y1 > viewB && y2 > viewB)) continue;
      if (e.link.flagged) ctx.strokeStyle = "rgba(239,69,98,.55)";
      else ctx.strokeStyle = "rgba(127,149,173,.18)";
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.bezierCurveTo((x1 + x2) / 2, y1, (x1 + x2) / 2, y2, x2, y2);
      ctx.stroke();
    }

    // Cards (culled).
    const showText = k > 0.28;
    for (const c of cardsRef.current) {
      const cx = c.x - CARD_W / 2, cy = c.y - CARD_H / 2;
      if (cx > viewR || cx + CARD_W < viewL || cy > viewB || cy + CARD_H < viewT) continue;
      const color = TIER_COLOR[c.node.tier];
      ctx.fillStyle = "#0b101b";
      ctx.strokeStyle = color;
      ctx.globalAlpha = c.node.id === focusId ? 1 : 0.85;
      ctx.lineWidth = c.node.id === focusId ? 2 / k : 1 / k;
      ctx.beginPath();
      ctx.roundRect(cx, cy, CARD_W, CARD_H, 6);
      ctx.fill(); ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(cx + 12, cy + CARD_H / 2, 4, 0, Math.PI * 2);
      ctx.fill();
      if (showText) {
        ctx.fillStyle = "#e8f0ff";
        ctx.font = `600 ${11}px JetBrains Mono, monospace`;
        ctx.fillText(c.node.id.slice(0, 17), cx + 22, cy + 15);
        ctx.fillStyle = "#888888";
        ctx.font = `9px JetBrains Mono, monospace`;
        ctx.fillText(`${c.node.bank} · ${c.node.flags.length} flags`, cx + 22, cy + 29);
        ctx.strokeStyle = color;
        ctx.strokeRect(cx + CARD_W - 38, cy + 8, 30, 16);
        ctx.fillStyle = color;
        ctx.font = `9px JetBrains Mono, monospace`;
        ctx.fillText(c.node.score.toFixed(0), cx + CARD_W - 33, cy + 20);
      }
    }

    // Layer captions.
    ctx.fillStyle = "#888888";
    ctx.font = `10px JetBrains Mono, monospace`;
    if (!focusId) {
      const seen = new Set<number>();
      for (const c of cardsRef.current) {
        if (seen.has(c.layer)) continue;
        seen.add(c.layer);
        const caption =
          c.layer === 0 ? "SOURCES" :
          c.layer === Math.max(...seen) ? "" : `LAYER ${c.layer}`;
        if (!caption) continue;
        ctx.fillText(caption, c.x - CARD_W / 2, c.y - (MAX_ROWS_PER_BLOCK * (CARD_H + ROW_GAP)) / 2 - 14);
      }
    } else {
      ctx.fillText("SOURCES", -CARD_W / 2 + (-1) * (CARD_W + COL_GAP + 60) - CARD_W / 2, -110);
      ctx.fillText("FOCUS", -70, -110);
      ctx.fillText("CASH-OUTS", CARD_W / 2 + COL_GAP + 20, -110);
    }
  }, [cards, edges, flaggedOnly, focusId, snapshot]);

  // Refit whenever the layout identity changes.
  useEffect(() => {
    fitView();
  }, [fitView, focusId, networkCards]);

  // Resize handling.
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const observer = new ResizeObserver(() => {
      // Trigger redraw via a benign state-independent path: re-run draw by
      // dispatching a custom event the effect listens to would be heavier;
      // simplest correct approach is forcing a repaint through requestAnimationFrame.
      requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
    });
    observer.observe(wrap);
    return () => observer.disconnect();
  }, []);

  const screenToContent = useCallback((sx: number, sy: number) => {
    const { x, y, k } = viewRef.current;
    return { x: (sx - x) / k, y: (sy - y) / k };
  }, []);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = { sx: event.clientX, sy: event.clientY, ox: viewRef.current.x, oy: viewRef.current.y, moved: false };
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = event.clientX - drag.sx;
    const dy = event.clientY - drag.sy;
    if (!drag.moved && Math.hypot(dx, dy) > 4) drag.moved = true;
    if (drag.moved) {
      viewRef.current.x = drag.ox + dx;
      viewRef.current.y = drag.oy + dy;
      // Redraw synchronously (cheap enough; avoids state churn per frame).
      const evt = new Event("galaxy-redraw");
      window.dispatchEvent(evt);
    }
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag || drag.moved) return;
    // Click → hit-test cards.
    const rect = event.currentTarget.getBoundingClientRect();
    const sx = event.clientX - rect.left;
    const sy = event.clientY - rect.top;
    const pt = screenToContent(sx, sy);
    const hit = cardsRef.current.find(
      (c) => Math.abs(pt.x - c.x) <= CARD_W / 2 && Math.abs(pt.y - c.y) <= CARD_H / 2
    );
    if (hit) {
      setFocusId(hit.node.id);
      setQuery("");
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  useEffect(() => {
    const handler = () => {
      // Re-run the draw effect by bumping a dependency-free repaint trigger.
      setHover((current) => (current ? { ...current } : current));
    };
    const redraw = () => {
      // Force synchronous canvas repaint with current refs.
      const canvas = canvasRef.current;
      if (canvas) window.dispatchEvent(new Event("resize"));
      void canvas;
      setHover((current) => (current ? current : current));
      void handler;
    };
    window.addEventListener("galaxy-redraw", redraw);
    return () => window.removeEventListener("galaxy-redraw", redraw);
  }, []);

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const sx = event.clientX - rect.left;
    const sy = event.clientY - rect.top;
    const factor = Math.exp(-event.deltaY * 0.0016);
    const nextK = Math.min(Math.max(viewRef.current.k * factor, 0.03), 6);
    viewRef.current.x = sx - ((sx - viewRef.current.x) * nextK) / viewRef.current.k;
    viewRef.current.y = sy - ((sy - viewRef.current.y) * nextK) / viewRef.current.k;
    viewRef.current.k = nextK;
    window.dispatchEvent(new Event("galaxy-redraw"));
  };

  const focusNode = useCallback((id: string) => {
    setFocusId(id);
    setQuery("");
  }, []);

  const focus = focusId ? nodeById.get(focusId) ?? null : null;

  const stats = useMemo(() => {
    if (!snapshot) return null;
    const inc = focusId ? snapshot.links.filter((l) => l.target === focusId) : [];
    const out = focusId ? snapshot.links.filter((l) => l.source === focusId) : [];
    return {
      inAmount: inc.reduce((sum, l) => sum + l.amount, 0),
      outAmount: out.reduce((sum, l) => sum + l.amount, 0),
      inCount: inc.length,
      outCount: out.length,
      layers: new Set(networkCards.map((c) => c.layer)).size,
    };
  }, [focusId, networkCards, snapshot]);

  if (error) {
    return (
      <div>
        <PageHeader title="Case File" subtitle="Directed fund-flow network" />
        <Card className="flex min-h-[560px] items-center justify-center">
          <p className="font-mono text-sm text-red-300">{error}</p>
        </Card>
      </div>
    );
  }
  if (loading || !snapshot) {
    return (
      <div>
        <PageHeader title="Case File" subtitle="Directed fund-flow network" />
        <Card className="flex min-h-[560px] items-center justify-center">
          <LoadingState message="Layering the entire network…" />
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Case File" subtitle={`Directed fund-flow network · ${snapshot.nodes.length.toLocaleString("en-IN")} accounts · sources → intermediates → cash-outs`} />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative">
          <input
            aria-label="Find an account"
            className="w-72 rounded-sm border border-frost/10 bg-surface-1 bg-transparent px-3 py-1.5 font-mono text-[10px] text-bone outline-none placeholder:text-ash/70"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && suggestions[0]) focusNode(suggestions[0].id);
              if (event.key === "Escape") setQuery("");
            }}
            placeholder="Find account ID…"
          />
          {suggestions.length > 0 && (
            <div className="absolute left-0 top-full z-20 mt-1 w-80 rounded-sm border border-frost/15 bg-void/97 shadow-xl backdrop-blur">
              {suggestions.map((node) => (
                <button
                  key={node.id}
                  onClick={() => focusNode(node.id)}
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
        {focusId && (
          <button
            onClick={() => setFocusId(null)}
            className="rounded-sm border border-frost/15 px-3 py-1.5 font-mono text-[10px] uppercase text-bone"
          >
            ← Full network ({snapshot.nodes.length.toLocaleString("en-IN")})
          </button>
        )}
        {focusId && stats && (
          <div className="ml-auto flex gap-3 font-mono text-[10px] uppercase text-ash">
            <span>In <span className="text-risk-critical">{formatCurrencyINR(stats.inAmount)}</span> ({stats.inCount})</span>
            <span>Out <span className="text-sky-300">{formatCurrencyINR(stats.outAmount)}</span> ({stats.outCount})</span>
          </div>
        )}
        {!focusId && stats && (
          <div className="ml-auto font-mono text-[10px] uppercase text-ash">{stats.layers} flow layers</div>
        )}
      </div>

      <Card className="p-0">
        <div
          ref={wrapRef}
          className="relative h-[72vh] min-h-[560px] w-full cursor-grab touch-none select-none active:cursor-grabbing"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onWheel={handleWheel}
        >
          <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
          <div className="pointer-events-none absolute left-4 top-4 rounded-md border border-white/5 bg-black/75 px-3 py-2 backdrop-blur">
            <p className="font-mono text-[11px] uppercase text-ash">{focusId ? "Evidence chain" : "Entire network"}</p>
            <p className="font-display text-lg text-bone">{cards.length.toLocaleString("en-IN")}</p>
            <p className="font-mono text-[11px] text-ash">accounts shown</p>
          </div>
          {hover && (
            <div
              className="pointer-events-none absolute z-10 rounded-md border border-white/10 bg-black/90 px-3 py-2 backdrop-blur"
              style={{ left: hover.cx + 14, top: hover.cy + 12, maxWidth: "240px" }}
            >
              <p className="font-mono text-[10px] font-semibold text-bone">{hover.node.id}</p>
              <p className="mt-0.5 font-mono text-[9px] uppercase text-ash">{hover.node.bank} · {hover.node.city}</p>
              <p className="mt-1 font-mono text-[9px]" style={{ color: TIER_COLOR[hover.node.tier] }}>
                score {hover.node.score.toFixed(1)} · {hover.node.flags.length} flags · {hover.node.isMule ? "MULE" : "watch"}
              </p>
            </div>
          )}
        </div>
      </Card>

      <p className="mt-2 font-mono text-[10px] text-ash/70">
        Every flagged account is on this board, layered by money-flow topology (left = pure sources, right = cash-outs) ·
        drag to pan · wheel to zoom deep · click any card to open its personal evidence chain · red arrows = flagged corridors ·
        Esc or “Full network” returns to the complete board
      </p>

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["Mode", focusId ? `Chain: ${focusId}` : "Full network"],
          ["Accounts On Board", cards.length.toLocaleString("en-IN")],
          ["Flagged Corridors", edges.filter((row) => row.link.flagged).length.toLocaleString("en-IN")],
          ["Flow Layers", String(stats?.layers ?? 0)],
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
