"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Card from "@/components/ui/Card";
import LoadingState from "@/components/ui/LoadingState";
import PageHeader from "@/components/ui/PageHeader";

type NodeKind = "mule" | "entity";
type FlowFilter = "all" | "confirmed" | "suspicious";

interface MuleNode {
  id: string;
  name: string;
  bank: string;
  city: string;
  riskScore: number;
  riskLevel: string;
  accountAgeDays: number;
  txnVelocityPerDay: number;
  inflowOutflowRatio: number | null;
  flags: string[];
  betweennessRaw: number;
  betweennessCentrality: number;
  degreeEntities: number;
  linkedEntityIds: string[];
  volume: number;
  isSuperConnector: boolean;
  deviceIdCount: number;
}

interface EntityNode {
  id: string;
  name: string;
  bank: string;
  city: string;
  riskScore: number;
  networkRiskScore: number;
  entityType: "Victim" | "Fraudster" | "Handler";
  degreeCentrality: number;
  degreeMules: number;
  linkedMuleIds: string[];
  volume: number;
  flaggedRatio: number;
  isStarCenter: boolean;
}

interface BipartiteEdge {
  id: string;
  muleId: string;
  entityId: string;
  from: string;
  to: string;
  frequency: number;
  amount: number;
  confirmedIllicit: boolean;
  flaggedCount: number;
  suspiciousCount: number;
  weight: number;
}

interface Snapshot {
  generatedAt: string;
  source: { accountsDataset: number; transactionsDataset: number };
  audit: {
    bipartiteEdges: number;
    internalMuleTransactionsExcluded: number;
    normalAccountTransactionsExcluded: number;
    sameSetEdgesDrawn: number;
  };
  stats: {
    muleNodes: number;
    entityNodes: number;
    directedEdges: number;
    confirmedIllicitEdges: number;
    suspiciousEdges: number;
    totalVolume: number;
    superConnectors: number;
    starCenters: number;
  };
  mules: Record<string, MuleNode>;
  entities: Record<string, EntityNode>;
  edges: BipartiteEdge[];
  layout: {
    algorithm: string;
    iterations: number;
    positions: Record<string, [number, number]>;
  };
}

interface ViewState { zoom: number; panX: number; panY: number }

const CANVAS_HEIGHT = 880;
const EDGE_PADDING = 0.075;
const MIN_ZOOM = 0.35;
const MAX_ZOOM = 24;

const formatINR = (value: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);

export default function BipartiteNetwork() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewRef = useRef<ViewState>({ zoom: 1, panX: 0, panY: 0 });
  const dragRef = useRef({ active: false, moved: false, x: 0, y: 0 });

  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [flowFilter, setFlowFilter] = useState<FlowFilter>("all");
  const [showLabels, setShowLabels] = useState(true);
  const [showArrows, setShowArrows] = useState(true);
  const [showColumns, setShowColumns] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewportSize, setViewportSize] = useState({ width: 0, height: CANVAS_HEIGHT });
  const [view, setView] = useState<ViewState>({ zoom: 1, panX: 0, panY: 0 });
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch("/bipartite_network.json", { cache: "force-cache", signal: controller.signal });
        if (!response.ok) throw new Error(`Dataset HTTP ${response.status}`);
        const data = (await response.json()) as Snapshot;
        if (!cancelled) setSnapshot(data);
      } catch (caught) {
        if (!cancelled && !(caught instanceof DOMException && caught.name === "AbortError")) {
          setError(caught instanceof Error ? caught.message : "Unable to load bipartite dataset");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  const mules = useMemo(() => Object.values(snapshot?.mules ?? {}).sort((a, b) => b.betweennessRaw - a.betweennessRaw), [snapshot]);
  const entities = useMemo(() => Object.values(snapshot?.entities ?? {}).sort((a, b) => b.degreeMules - a.degreeMules), [snapshot]);
  const muleMap = useMemo(() => new Map(mules.map((node) => [node.id, node])), [mules]);
  const entityMap = useMemo(() => new Map(entities.map((node) => [node.id, node])), [entities]);

  const edges = useMemo(() => {
    if (!snapshot) return [];
    return snapshot.edges.filter((edge) => {
      if (flowFilter === "confirmed") return edge.confirmedIllicit;
      if (flowFilter === "suspicious") return !edge.confirmedIllicit;
      return true;
    });
  }, [flowFilter, snapshot]);

  const adjacency = useMemo(() => {
    const map = new Map<string, BipartiteEdge[]>();
    for (const edge of edges) {
      const muleEdges = map.get(edge.muleId) ?? [];
      const entityEdges = map.get(edge.entityId) ?? [];
      muleEdges.push(edge);
      entityEdges.push(edge);
      map.set(edge.muleId, muleEdges);
      map.set(edge.entityId, entityEdges);
    }
    return map;
  }, [edges]);

  const visibleNodes = useMemo(() => {
    const allowed = new Set<string>();
    for (const edge of edges) {
      allowed.add(edge.muleId);
      allowed.add(edge.entityId);
    }
    return {
      mules: mules.filter((node) => allowed.has(node.id)),
      entities: entities.filter((node) => allowed.has(node.id)),
    };
  }, [edges, entities, mules]);

  const searchMatches = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (query.length < 2) return new Set<string>();
    const matches = new Set<string>();
    for (const node of [...visibleNodes.mules, ...visibleNodes.entities]) {
      if (
        node.id.toLowerCase().includes(query) ||
        node.name.toLowerCase().includes(query) ||
        node.bank.toLowerCase().includes(query) ||
        node.city.toLowerCase().includes(query)
      ) {
        matches.add(node.id);
        if (matches.size >= 100) break;
      }
    }
    return matches;
  }, [searchQuery, visibleNodes]);

  const focusIds = useMemo(() => {
    const activeId = hoveredId ?? selectedId;
    const nodes = new Set<string>();
    const neighbors = new Set<string>();
    if (activeId) {
      nodes.add(activeId);
      for (const edge of adjacency.get(activeId) ?? []) {
        neighbors.add(edge.muleId === activeId ? edge.entityId : edge.muleId);
      }
    }
    return { nodes, neighbors };
  }, [adjacency, hoveredId, selectedId]);

  const fitView = useCallback((size = viewportSize) => {
    if (!size.width) return;
    const fitted = { zoom: 1, panX: 0, panY: 0 };
    viewRef.current = fitted;
    setView(fitted);
  }, [viewportSize]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => fitView());
    return () => cancelAnimationFrame(frame);
  }, [fitView]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => {
      setViewportSize({ width: canvas.clientWidth, height: canvas.clientHeight });
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [loading, error]);

  const project = useCallback((position: [number, number], size = viewportSize, currentView = view) => ({
    x: size.width * EDGE_PADDING + position[0] * size.width * (1 - EDGE_PADDING * 2) * currentView.zoom + currentView.panX,
    y: size.height * EDGE_PADDING + position[1] * size.height * (1 - EDGE_PADDING * 2) * currentView.zoom + currentView.panY,
  }), [view, viewportSize]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !snapshot || viewportSize.width === 0) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const ctx = context;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(viewportSize.width * dpr);
    canvas.height = Math.floor(viewportSize.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const gradient = ctx.createLinearGradient(0, 0, viewportSize.width, viewportSize.height);
    gradient.addColorStop(0, "#03050a");
    gradient.addColorStop(0.55, "#050810");
    gradient.addColorStop(1, "#010306");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, viewportSize.width, viewportSize.height);

    const left = viewportSize.width * EDGE_PADDING;
    const right = viewportSize.width * (1 - EDGE_PADDING);
    const top = viewportSize.height * EDGE_PADDING;
    const bottom = viewportSize.height * (1 - EDGE_PADDING);

    if (showColumns) {
      ctx.fillStyle = "rgba(148, 163, 184, 0.03)";
      ctx.fillRect(left, top, (right - left) * 0.42, bottom - top);
      ctx.fillRect(right - (right - left) * 0.42, top, (right - left) * 0.42, bottom - top);
      ctx.strokeStyle = "rgba(148,163,184,0.08)";
      ctx.lineWidth = 1;
      ctx.strokeRect(left, top, right - left, bottom - top);
      ctx.font = "600 13px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.textAlign = "left";
      ctx.fillStyle = "rgba(255,138,138,0.82)";
      ctx.fillText("SET A · MULE ACCOUNTS", left + 14, top - 14);
      ctx.fillStyle = "rgba(125,180,255,0.82)";
      ctx.fillText("SET B · HIGH-RISK ENTITIES", right - 260, top - 14);
    }

    const positions = snapshot.layout.positions;
    const activeFocus = focusIds.nodes.size > 0;
    const drawEdges = edges.filter((edge) => positions[edge.from] && positions[edge.to]);

    for (const edge of drawEdges) {
      const from = project(positions[edge.from]);
      const to = project(positions[edge.to]);
      const highlighted =
        focusIds.nodes.has(edge.from) ||
        focusIds.nodes.has(edge.to) ||
        (focusIds.neighbors.has(edge.from) && focusIds.neighbors.has(edge.to));
      const dimmed = activeFocus && !highlighted;
      ctx.strokeStyle = edge.confirmedIllicit
        ? `rgba(34,197,94,${dimmed ? 0.06 : highlighted ? 0.85 : 0.32})`
        : `rgba(250,204,21,${dimmed ? 0.06 : highlighted ? 0.78 : 0.26})`;
      ctx.lineWidth = 0.45 + edge.weight * 2.15;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();

      if (showArrows && (!dimmed || highlighted)) {
        const angle = Math.atan2(to.y - from.y, to.x - from.x);
        const targetRadius = edge.to.startsWith("ACM")
          ? 3 + Math.sqrt(muleMap.get(edge.to)?.betweennessCentrality ?? 0) * 10
          : 3 + Math.sqrt(entityMap.get(edge.to)?.degreeCentrality ?? 0) * 10;
        const arrowX = to.x - Math.cos(angle) * (targetRadius + 2);
        const arrowY = to.y - Math.sin(angle) * (targetRadius + 2);
        const size = 4 + edge.weight * 3;
        ctx.save();
        ctx.translate(arrowX, arrowY);
        ctx.rotate(angle);
        ctx.fillStyle = edge.confirmedIllicit ? "rgba(34,197,94,0.90)" : "rgba(250,204,21,0.80)";
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-size, size / 2);
        ctx.lineTo(-size, -size / 2);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }

    const labelCandidates = new Set<string>();
    if (showLabels) {
      [...visibleNodes.mules].sort((a, b) => b.betweennessRaw - a.betweennessRaw).slice(0, 28)
        .forEach((node) => labelCandidates.add(node.id));
      [...visibleNodes.entities].sort((a, b) => b.degreeMules - a.degreeMules || b.volume - a.volume).slice(0, 28)
        .forEach((node) => labelCandidates.add(node.id));
    }
    for (const id of searchMatches) labelCandidates.add(id);
    if (hoveredId) labelCandidates.add(hoveredId);
    if (selectedId) labelCandidates.add(selectedId);

    function drawNode(id: string, kind: NodeKind) {
      const position = positions[id];
      if (!position) return;
      const point = project(position);
      const radius = kind === "mule"
        ? 3 + Math.sqrt(muleMap.get(id)?.betweennessCentrality ?? 0) * 10
        : 3 + Math.sqrt(entityMap.get(id)?.degreeCentrality ?? 0) * 10;
      const focused = focusIds.nodes.has(id) || focusIds.neighbors.has(id);
      const match = searchMatches.has(id);

      ctx.beginPath();
      ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = kind === "mule" ? "#e5484d" : "#3b82f6";
      ctx.globalAlpha = activeFocus && !focused ? 0.20 : 0.92;
      ctx.fill();
      ctx.globalAlpha = 1;

      if (kind === "mule" && muleMap.get(id)?.isSuperConnector) {
        ctx.strokeStyle = "rgba(255,214,102,0.88)";
        ctx.lineWidth = focused ? 2.4 : 1.2;
        ctx.beginPath();
        ctx.arc(point.x, point.y, radius + 2.5, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (kind === "entity" && entityMap.get(id)?.isStarCenter) {
        ctx.strokeStyle = "rgba(147,197,253,0.72)";
        ctx.lineWidth = focused ? 2.2 : 1.1;
        ctx.beginPath();
        ctx.arc(point.x, point.y, radius + 2, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (focused || match) {
        ctx.strokeStyle = match ? "#a3e635" : "#ffffff";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(point.x, point.y, radius + 4, 0, Math.PI * 2);
        ctx.stroke();
      }

      if (labelCandidates.has(id)) {
        const label = id.length > 18 ? `${id.slice(0, 16)}…` : id;
        ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const metrics = ctx.measureText(label);
        const boxWidth = metrics.width + 8;
        ctx.fillStyle = "rgba(2,5,11,0.82)";
        ctx.fillRect(point.x - boxWidth / 2, point.y - radius - 17, boxWidth, 15);
        ctx.fillStyle = focused ? "#ffffff" : "#dbeafe";
        ctx.fillText(label, point.x, point.y - radius - 9);
      }
    }

    for (const node of visibleNodes.entities) drawNode(node.id, "entity");
    for (const node of visibleNodes.mules) drawNode(node.id, "mule");
  }, [
    edges, entityMap, focusIds, hoveredId, muleMap, project, searchMatches, selectedId,
    showArrows, showColumns, showLabels, snapshot, view, viewportSize, visibleNodes,
  ]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !snapshot) return;
    const findNodeAt = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      const mouseX = clientX - rect.left;
      const mouseY = clientY - rect.top;
      let closest: string | null = null;
      let shortest = 10;
      for (const [id, position] of Object.entries(snapshot.layout.positions)) {
        const point = project(position as [number, number]);
        const distance = Math.hypot(point.x - mouseX, point.y - mouseY);
        if (distance < shortest) {
          shortest = distance;
          closest = id;
        }
      }
      return closest;
    };

    const handleDown = (event: PointerEvent) => {
      dragRef.current = { active: true, moved: false, x: event.clientX, y: event.clientY };
      canvas.setPointerCapture(event.pointerId);
    };
    const handleMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag.active) {
        setHoveredId(findNodeAt(event.clientX, event.clientY));
        canvas.style.cursor = hoveredId ? "pointer" : "grab";
        return;
      }
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true;
      drag.x = event.clientX;
      drag.y = event.clientY;
      const previous = viewRef.current;
      const next = { ...previous, panX: previous.panX + dx, panY: previous.panY + dy };
      viewRef.current = next;
      setView(next);
      canvas.style.cursor = "grabbing";
    };
    const handleUp = (event: PointerEvent) => {
      const drag = dragRef.current;
      drag.active = false;
      canvas.style.cursor = "grab";
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      if (drag.moved) return;
      const id = findNodeAt(event.clientX, event.clientY);
      setSelectedId(id);
      setPanelOpen(Boolean(id));
    };
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const pointerX = event.clientX - rect.left;
      const pointerY = event.clientY - rect.top;
      const baseX = viewportSize.width * EDGE_PADDING;
      const baseY = viewportSize.height * EDGE_PADDING;
      const spanX = viewportSize.width * (1 - EDGE_PADDING * 2);
      const spanY = viewportSize.height * (1 - EDGE_PADDING * 2);
      const previous = viewRef.current;
      const worldX = (pointerX - baseX - previous.panX) / (spanX * previous.zoom);
      const worldY = (pointerY - baseY - previous.panY) / (spanY * previous.zoom);
      const zoom = Math.min(Math.max(previous.zoom * Math.exp(-event.deltaY * 0.0015), MIN_ZOOM), MAX_ZOOM);
      const next = {
        zoom,
        panX: pointerX - baseX - worldX * spanX * zoom,
        panY: pointerY - baseY - worldY * spanY * zoom,
      };
      viewRef.current = next;
      setView(next);
    };

    canvas.addEventListener("pointerdown", handleDown);
    canvas.addEventListener("pointermove", handleMove);
    canvas.addEventListener("pointerup", handleUp);
    canvas.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      canvas.removeEventListener("pointerdown", handleDown);
      canvas.removeEventListener("pointermove", handleMove);
      canvas.removeEventListener("pointerup", handleUp);
      canvas.removeEventListener("wheel", handleWheel);
    };
  }, [hoveredId, project, snapshot, viewportSize]);

  const locateSearch = () => {
    const first = searchMatches.values().next().value as string | undefined;
    if (!first || !snapshot) return;
    const point = snapshot.layout.positions[first];
    if (!point) return;
    setSelectedId(first);
    setPanelOpen(true);
    const projected = project(point);
    const next = {
      zoom: viewRef.current.zoom,
      panX: viewRef.current.panX + viewportSize.width / 2 - projected.x,
      panY: viewRef.current.panY + viewportSize.height / 2 - projected.y,
    };
    viewRef.current = next;
    setView(next);
  };

  const selectedMule = selectedId && muleMap.has(selectedId) ? muleMap.get(selectedId)! : null;
  const selectedEntity = selectedId && entityMap.has(selectedId) ? entityMap.get(selectedId)! : null;
  const selectedEdges = selectedId ? adjacency.get(selectedId) ?? [] : [];

  if (loading || error || !snapshot) {
    return (
      <div className="p-8 max-w-[1700px] mx-auto">
        <PageHeader title="Bipartite Crime Network" subtitle="Set A · mules · Set B · high-risk entities" />
        <Card className="flex min-h-[720px] flex-col items-center justify-center gap-4">
          {error ? (
            <>
              <p className="font-mono text-sm text-red-300">{error}</p>
              <button onClick={() => window.location.reload()} className="font-mono text-xs text-ash hover:text-bone">Retry</button>
            </>
          ) : (
            <>
              <LoadingState />
              <p className="font-mono text-xs text-ash">Constructing disjoint-set topology…</p>
            </>
          )}
        </Card>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-[1800px] mx-auto">
      <PageHeader
        title="Bipartite Crime Network"
        subtitle="Force-directed · no same-set edges · exact synthetic ledger projection"
      />

      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="flex items-center gap-1 bg-surface-1 border border-frost/10 rounded-sm p-1">
          {([
            ["all", "All Flows"],
            ["confirmed", "Confirmed Illicit"],
            ["suspicious", "Suspicious"],
          ] as const).map(([value, label]) => (
            <button key={value} onClick={() => setFlowFilter(value)}
              className={`font-mono text-[10px] px-3 py-1 rounded-[2px] ${flowFilter === value ? "bg-frost text-void" : "text-ash hover:text-bone"}`}>
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 bg-surface-1 border border-frost/10 rounded-sm p-1">
          {([
            ["Labels", showLabels, setShowLabels],
            ["Arrows", showArrows, setShowArrows],
            ["Columns", showColumns, setShowColumns],
          ] as const).map(([label, value, setter]) => (
            <button key={label} onClick={() => setter(!value)}
              className={`font-mono text-[10px] px-3 py-1 rounded-[2px] ${value ? "bg-charcoal text-bone" : "text-ash hover:text-bone"}`}>
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 bg-surface-1 border border-frost/10 rounded-sm px-3 py-1.5">
          <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && locateSearch()}
            placeholder="Search account, bank, city"
            className="w-56 bg-transparent font-mono text-[10px] text-bone outline-none placeholder:text-ash/70" />
          {searchMatches.size > 0 && <button onClick={locateSearch} className="font-mono text-[10px] text-signal-green">Locate</button>}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => { const next = { ...viewRef.current, zoom: Math.min(viewRef.current.zoom * 1.25, MAX_ZOOM) }; viewRef.current = next; setView(next); }}
            className="border border-frost/10 rounded-sm px-3 py-1 font-mono text-[10px] text-ash hover:text-bone">+</button>
          <button onClick={() => { const next = { ...viewRef.current, zoom: Math.max(viewRef.current.zoom * 0.8, MIN_ZOOM) }; viewRef.current = next; setView(next); }}
            className="border border-frost/10 rounded-sm px-3 py-1 font-mono text-[10px] text-ash hover:text-bone">−</button>
          <button onClick={() => fitView()} className="border border-frost/10 rounded-sm px-3 py-1 font-mono text-[10px] text-ash hover:text-bone">Auto-fit</button>
        </div>
      </div>

      <div className="relative">
        <canvas ref={canvasRef} style={{ width: "100%", height: `${CANVAS_HEIGHT}px`, borderRadius: 8 }}
          className="block touch-none bg-black" role="img"
          aria-label="Directed bipartite network of mule accounts and high-risk entities" />

        <div className="absolute left-4 bottom-4 rounded-md bg-black/70 border border-white/5 px-4 py-3 backdrop-blur">
          <p className="font-mono text-[9px] uppercase tracking-wide text-ash mb-2">Topology</p>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {[
              { label: "Set A · Mule", color: "#e5484d" },
              { label: "Super-connector", color: "#ffd666" },
              { label: "Set B · Entity", color: "#3b82f6" },
              { label: "Star center", color: "#93c5fd" },
              { label: "Confirmed illicit", color: "#22c55e" },
              { label: "Suspicious / unverified", color: "#facc15" },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="font-mono text-[9px] uppercase text-ash">{item.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className={`absolute top-0 right-0 h-full w-[400px] max-w-full overflow-hidden border-l border-frost/10 bg-void/95 backdrop-blur transition-transform duration-300 ${panelOpen ? "translate-x-0" : "translate-x-full"}`}>
          {selectedMule && (
            <div className="h-full overflow-y-auto p-5">
              <div className="flex justify-between mb-4">
                <div><p className="font-display text-base text-bone">{selectedMule.id}</p><p className="font-mono text-[10px] uppercase text-ash mt-1">SET A · MULE ACCOUNT</p></div>
                <button onClick={() => setPanelOpen(false)} className="font-mono text-[10px] text-ash hover:text-bone">Close</button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  ["Account Age", `${selectedMule.accountAgeDays.toLocaleString("en-IN")} days`],
                  ["Velocity", `${selectedMule.txnVelocityPerDay.toFixed(4)}/day`],
                  ["Inflow / Outflow", selectedMule.inflowOutflowRatio?.toFixed(3) ?? "∞"],
                  ["Device ID Count", `${selectedMule.deviceIdCount} (modeled)`],
                  ["Betweenness", selectedMule.betweennessRaw.toFixed(3)],
                  ["Connected Entities", selectedMule.degreeEntities.toLocaleString("en-IN")],
                  ["Volume", formatINR(selectedMule.volume)],
                  ["Type", selectedMule.isSuperConnector ? "SUPER-CONNECTOR" : selectedMule.riskLevel.toUpperCase()],
                ].map(([label, value]) => (
                  <div key={label} className="border border-frost/10 rounded-lg p-3">
                    <p className="font-mono text-[9px] uppercase text-ash">{label}</p>
                    <p className="font-mono text-sm text-bone mt-2">{value}</p>
                  </div>
                ))}
              </div>
              <p className="font-mono text-[10px] uppercase text-ash mt-6 mb-3">Directed flows · {selectedEdges.length}</p>
              {selectedEdges.map((edge) => (
                <div key={edge.id} className="border border-frost/10 rounded-lg p-3 mb-2">
                  <div className="font-mono text-[10px] text-bone truncate">{edge.from} &rarr; {edge.to}</div>
                  <div className="flex justify-between mt-2 font-mono text-xs">
                    <span className={edge.confirmedIllicit ? "text-green-300" : "text-yellow-300"}>{formatINR(edge.amount)}</span>
                    <span className="text-ash">{edge.frequency} txn</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {selectedEntity && (
            <div className="h-full overflow-y-auto p-5">
              <div className="flex justify-between mb-4">
                <div><p className="font-display text-base text-bone">{selectedEntity.id}</p><p className="font-mono text-[10px] uppercase text-ash mt-1">SET B · {selectedEntity.entityType.toUpperCase()}</p></div>
                <button onClick={() => setPanelOpen(false)} className="font-mono text-[10px] text-ash hover:text-bone">Close</button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  ["Network Risk", `${selectedEntity.networkRiskScore.toFixed(1)}%`],
                  ["Source Risk", `${selectedEntity.riskScore.toFixed(1)}%`],
                  ["Geography", `${selectedEntity.city} · ${selectedEntity.bank}`],
                  ["Entity Type", selectedEntity.entityType],
                  ["Degree Centrality", selectedEntity.degreeCentrality.toFixed(3)],
                  ["Connected Mules", selectedEntity.degreeMules.toLocaleString("en-IN")],
                  ["Volume", formatINR(selectedEntity.volume)],
                  ["Role", selectedEntity.isStarCenter ? "STAR TOPOLOGY CENTER" : "LEAF ENTITY"],
                ].map(([label, value]) => (
                  <div key={label} className="border border-frost/10 rounded-lg p-3">
                    <p className="font-mono text-[9px] uppercase text-ash">{label}</p>
                    <p className="font-mono text-sm text-bone mt-2">{value}</p>
                  </div>
                ))}
              </div>
              <p className="font-mono text-[10px] uppercase text-ash mt-6 mb-3">Directed flows · {selectedEdges.length}</p>
              {selectedEdges.map((edge) => (
                <div key={edge.id} className="border border-frost/10 rounded-lg p-3 mb-2">
                  <div className="font-mono text-[10px] text-bone truncate">{edge.from} &rarr; {edge.to}</div>
                  <div className="flex justify-between mt-2 font-mono text-xs">
                    <span className={edge.confirmedIllicit ? "text-green-300" : "text-yellow-300"}>{formatINR(edge.amount)}</span>
                    <span className="text-ash">{edge.frequency} txn</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!selectedMule && !selectedEntity && (
            <div className="h-full overflow-y-auto p-5">
              <div className="flex justify-between mb-5">
                <div><p className="font-display text-base text-bone">NETWORK SUMMARY</p><p className="font-mono text-[10px] uppercase text-ash mt-1">Disjoint node sets</p></div>
                <button onClick={() => setPanelOpen(false)} className="font-mono text-[10px] text-ash hover:text-bone">Close</button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  ["Dataset Accounts", snapshot.source.accountsDataset.toLocaleString("en-IN")],
                  ["Dataset Txns", snapshot.source.transactionsDataset.toLocaleString("en-IN")],
                  ["Set A Nodes", snapshot.stats.muleNodes.toLocaleString("en-IN")],
                  ["Set B Nodes", snapshot.stats.entityNodes.toLocaleString("en-IN")],
                  ["Directed Edges", snapshot.stats.directedEdges.toLocaleString("en-IN")],
                  ["Confirmed Illicit", snapshot.stats.confirmedIllicitEdges.toLocaleString("en-IN")],
                  ["Super-connectors", snapshot.stats.superConnectors.toLocaleString("en-IN")],
                  ["Star Centers", snapshot.stats.starCenters.toLocaleString("en-IN")],
                ].map(([label, value]) => (
                  <div key={label} className="border border-frost/10 rounded-lg p-3">
                    <p className="font-mono text-[9px] uppercase text-ash">{label}</p>
                    <p className="font-mono text-sm text-bone mt-2">{value}</p>
                  </div>
                ))}
              </div>
              <p className="mt-5 font-mono text-[10px] leading-relaxed text-ash">
                Same-set transactions are excluded by definition. Audit: {snapshot.audit.internalMuleTransactionsExcluded.toLocaleString("en-IN")} mule-to-mule and{" "}
                {snapshot.audit.normalAccountTransactionsExcluded.toLocaleString("en-IN")} normal-to-normal records omitted.
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
        {[
          ["Set A", snapshot.stats.muleNodes.toLocaleString("en-IN")],
          ["Set B", snapshot.stats.entityNodes.toLocaleString("en-IN")],
          ["A→B Edges", snapshot.stats.directedEdges.toLocaleString("en-IN")],
          ["Same-set Edges", "0"],
          ["Confirmed", snapshot.stats.confirmedIllicitEdges.toLocaleString("en-IN")],
          ["Suspicious", snapshot.stats.suspiciousEdges.toLocaleString("en-IN")],
          ["Super-connectors", snapshot.stats.superConnectors.toLocaleString("en-IN")],
          ["Total Volume", formatINR(snapshot.stats.totalVolume)],
        ].map(([label, value]) => (
          <Card key={label}>
            <p className="font-mono text-[8px] uppercase text-ash mb-2">{label}</p>
            <p className="font-mono text-sm text-bone">{value}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
