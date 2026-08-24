"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Card, { CardTitle } from "@/components/ui/Card";
import LoadingState from "@/components/ui/LoadingState";
import PageHeader from "@/components/ui/PageHeader";

type Selection =
  | { kind: "global"; id: "GLOBAL" }
  | { kind: "hyper"; id: string }
  | { kind: "account"; id: string };

interface GraphAccount {
  id: string;
  name: string;
  bank: string;
  city: string;
  riskScore: number;
  riskLevel: string;
  isMule: boolean;
  flags: string[];
}

interface GraphTransaction {
  id: string;
  from: string;
  to: string;
  amount: number;
  timestamp: string | null;
  type: string;
  flagged: boolean;
  riskScore: number;
}

interface Hypernode {
  id: string;
  label: string;
  category: string;
  color: string;
  rank: number;
  nodeIds: string[];
  edgeIds: string[];
  stats: {
    nodes: number;
    mules: number;
    contexts: number;
    edges: number;
    flaggedEdges: number;
    amount: number;
  };
}

interface Snapshot {
  version: number;
  generatedAt: string;
  source: {
    accountsDataset: number;
    transactionsDataset: number;
  };
  network: {
    muleSeeds: number;
    incidentEdges: number;
    flaggedIncidentEdges: number;
    incidentAmount: number;
    hypernodesTotal: number;
    verticesTotal: number;
    mulesInHypergraph: number;
  };
  coverage: {
    selectedHypernodes: number;
    selectedVertices: number;
    selectedEdges: number;
    selectedFlaggedEdges: number;
    selectedAmount: number;
    levels: number[];
  };
  accounts: Record<string, GraphAccount>;
  transactions: GraphTransaction[];
  hypernodes: Hypernode[];
  incidence: [string, string][];
  aggregation: [string, string][];
  layout: Record<string, [number, number]>;
  layouts?: Record<string, Record<string, [number, number]>>;
}

interface ViewState {
  x: number;
  y: number;
  scale: number;
}

const CANVAS_HEIGHT = 860;
const GLOBAL_ID = "GLOBAL";
const MIN_SCALE = 0.2;
const MAX_SCALE = 12000;

function formatINR(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

export default function HierarchicalHypergraph() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewRef = useRef<ViewState>({ x: 0, y: 0, scale: 1 });
  const dragStateRef = useRef({ active: false, moved: false, lastX: 0, lastY: 0 });

  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [level, setLevel] = useState(24);
  const [showMembership, setShowMembership] = useState(true);
  const [showAggregation, setShowAggregation] = useState(true);
  const [showInteractions, setShowInteractions] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewportSize, setViewportSize] = useState({ width: 0, height: CANVAS_HEIGHT });
  const [view, setView] = useState<ViewState>({ x: 0, y: 0, scale: 1 });
  const [hovered, setHovered] = useState<Selection | null>(null);
  const [selected, setSelected] = useState<Selection | null>({ kind: "global", id: GLOBAL_ID });
  const [panelOpen, setPanelOpen] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function loadSnapshot() {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch("/hierarchical_hypergraph.json", {
          cache: "force-cache",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Dataset HTTP ${response.status}`);
        const data = (await response.json()) as Snapshot;
        if (!cancelled) setSnapshot(data);
      } catch (caught) {
        if (!cancelled && !(caught instanceof DOMException && caught.name === "AbortError")) {
          setError(caught instanceof Error ? caught.message : "Unable to load hierarchical hypergraph");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadSnapshot();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  const hypernodes = useMemo(
    () => snapshot?.hypernodes.slice(0, Math.min(level, snapshot.coverage.selectedHypernodes)) ?? [],
    [snapshot, level]
  );

  const layout = useMemo(
    () => snapshot?.layouts?.[String(level)] ?? snapshot?.layout ?? {},
    [level, snapshot]
  );

  const hyperById = useMemo(() => {
    const map = new Map<string, Hypernode>();
    for (const hypernode of hypernodes) map.set(hypernode.id, hypernode);
    return map;
  }, [hypernodes]);

  const accounts = useMemo<GraphAccount[]>(() => {
    if (!snapshot) return [];
    const allowed = new Set(hypernodes.flatMap((hypernode) => hypernode.nodeIds));
    return Object.values(snapshot.accounts)
      .filter((account) => allowed.has(account.id))
      .sort((left, right) => Number(right.isMule) - Number(left.isMule) || right.riskScore - left.riskScore);
  }, [snapshot, hypernodes]);

  const accountById = useMemo(() => new Map(accounts.map((account) => [account.id, account])), [accounts]);

  const interactions = useMemo(() => {
    if (!snapshot) return [];
    const allowed = new Set(accountById.keys());
    return snapshot.transactions.filter(
      (transaction) => allowed.has(transaction.from) && allowed.has(transaction.to)
    );
  }, [snapshot, accountById]);

  const adjacency = useMemo(() => {
    const map = new Map<string, GraphTransaction[]>();
    for (const transaction of interactions) {
      const fromTransactions = map.get(transaction.from) ?? [];
      const toTransactions = map.get(transaction.to) ?? [];
      fromTransactions.push(transaction);
      toTransactions.push(transaction);
      map.set(transaction.from, fromTransactions);
      map.set(transaction.to, toTransactions);
    }
    return map;
  }, [interactions]);

  const searchMatches = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (query.length < 2) return new Set<string>();
    const matches = new Set<string>();
    for (const account of accounts) {
      if (
        account.id.toLowerCase().includes(query) ||
        account.name.toLowerCase().includes(query) ||
        account.bank.toLowerCase().includes(query) ||
        account.city.toLowerCase().includes(query)
      ) {
        matches.add(account.id);
        if (matches.size >= 100) break;
      }
    }
    for (const hypernode of hypernodes) {
      if (
        matches.size < 100 &&
        (hypernode.label.toLowerCase().includes(query) || hypernode.category.toLowerCase().includes(query))
      ) {
        matches.add(hypernode.id);
      }
    }
    return matches;
  }, [accounts, hypernodes, searchQuery]);

  const focus = useMemo(() => {
    const activeItems = [hovered, selected].filter(Boolean) as Selection[];
    const hyperIds = new Set<string>();
    const accountIds = new Set<string>();

    for (const item of activeItems) {
      if (item.kind === "global") {
        for (const hypernode of hypernodes) hyperIds.add(hypernode.id);
      } else if (item.kind === "hyper") {
        hyperIds.add(item.id);
      } else {
        accountIds.add(item.id);
        for (const hypernode of hypernodes) {
          if (hypernode.nodeIds.includes(item.id)) hyperIds.add(hypernode.id);
        }
      }
    }

    for (const hyperId of hyperIds) {
      for (const accountId of hyperById.get(hyperId)?.nodeIds ?? []) accountIds.add(accountId);
    }

    return { hyperIds, accountIds };
  }, [hovered, hyperById, hypernodes, selected]);

  const fitView = useCallback(
    (size: typeof viewportSize = viewportSize) => {
      if (!snapshot || size.width === 0) return;
      const padding = 58;
      const scale = Math.min(size.width - padding * 2, size.height - padding * 2);
      const nextState = {
        scale,
        x: size.width / 2 - 0.5 * scale,
        y: size.height / 2 - 0.5 * scale,
      };
      viewRef.current = nextState;
      setView(nextState);
    },
    [snapshot, viewportSize]
  );

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => fitView());
    return () => window.cancelAnimationFrame(frame);
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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !snapshot || viewportSize.width === 0) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const ctx = context;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(viewportSize.width * dpr);
    canvas.height = Math.floor(viewportSize.height * dpr);

    const degrees = new Map<string, number>();
    for (const interaction of interactions) {
      degrees.set(interaction.from, (degrees.get(interaction.from) ?? 0) + 1);
      degrees.set(interaction.to, (degrees.get(interaction.to) ?? 0) + 1);
    }

    const isGlobalFocused = focus.hyperIds.size === hypernodes.length && hypernodes.length > 0;
    const highlightedHyperIds = new Set(focus.hyperIds);
    const highlightedAccountIds = new Set(focus.accountIds);
    for (const id of searchMatches) {
      if (id.startsWith("HE")) highlightedHyperIds.add(id);
      else highlightedAccountIds.add(id);
    }

    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    const background = context.createLinearGradient(0, 0, viewportSize.width, viewportSize.height);
    background.addColorStop(0, "#04060c");
    background.addColorStop(0.55, "#050912");
    background.addColorStop(1, "#010307");
    context.fillStyle = background;
    context.fillRect(0, 0, viewportSize.width, viewportSize.height);

    context.translate(view.x, view.y);
    context.scale(view.scale, view.scale);
    const px = 1 / view.scale;

    // Subtle coordinate field.
    context.strokeStyle = "rgba(148, 163, 184, 0.05)";
    context.lineWidth = px;
    context.beginPath();
    for (let value = 0; value <= 1.0001; value += 0.1) {
      context.moveTo(value, 0);
      context.lineTo(value, 1);
      context.moveTo(0, value);
      context.lineTo(1, value);
    }
    context.stroke();

    function position(id: string): [number, number] | null {
      return layout[id] ?? null;
    }

    function dashedLine(fromId: string, toId: string, color: string, width: number) {
      const from = position(fromId);
      const to = position(toId);
      if (!from || !to) return;
      ctx.strokeStyle = color;
      ctx.lineWidth = width * px;
      ctx.setLineDash([5 * px, 5 * px]);
      ctx.beginPath();
      ctx.moveTo(from[0], from[1]);
      ctx.lineTo(to[0], to[1]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Bottom-layer pairwise interactions.
    if (showInteractions) {
      context.lineWidth = 0.65 * px;
      context.strokeStyle = "rgba(94, 117, 138, 0.15)";
      context.beginPath();
      for (const interaction of interactions) {
        const focused =
          highlightedAccountIds.has(interaction.from) || highlightedAccountIds.has(interaction.to);
        if (focus.accountIds.size > 0 && !focused) continue;
        const from = position(interaction.from);
        const to = position(interaction.to);
        if (!from || !to) continue;
        context.moveTo(from[0], from[1]);
        context.lineTo(to[0], to[1]);
      }
      context.stroke();
    }


    // Membership: bottom vertex → middle hypernode.
    if (showMembership) {
      for (const [accountId, hyperId] of snapshot.incidence) {
        const hypernode = hyperById.get(hyperId);
        if (!hypernode) continue;
        const dimmed = highlightedHyperIds.size > 0 && !highlightedHyperIds.has(hyperId);
        const strong = highlightedHyperIds.has(hyperId) && highlightedAccountIds.has(accountId);
        dashedLine(
          accountId,
          hyperId,
          strong
            ? "rgba(226, 240, 255, 0.82)"
            : dimmed
              ? `${hypernode.color}10`
              : `${hypernode.color}45`,
          strong ? 1.5 : 0.85
        );
      }
    }

    // Aggregation: middle hypernode → GLOBAL.
    if (showAggregation) {
      for (const [hyperId, parentId] of snapshot.aggregation) {
        if (!hyperById.has(hyperId) || parentId !== GLOBAL_ID) continue;
        const hypernode = hyperById.get(hyperId)!;
        const strong = isGlobalFocused || highlightedHyperIds.has(hyperId);
        dashedLine(
          hyperId,
          parentId,
          strong ? "rgba(248, 250, 252, 0.78)" : `${hypernode.color}35`,
          strong ? 1.7 : 0.95
        );
      }
    }

    // Bottom vertices.
    for (const account of accounts) {
      const point = position(account.id);
      if (!point) continue;
      const degree = degrees.get(account.id) ?? 0;
      const radius = account.isMule
        ? 0.0038 + Math.min(degree, 20) * 0.00018
        : 0.0025 + Math.min(degree, 20) * 0.00008;
      const focused = highlightedAccountIds.has(account.id);
      context.beginPath();
      context.arc(point[0], point[1], radius, 0, Math.PI * 2);
      context.fillStyle = account.isMule
        ? account.riskScore >= 70 ? "#ff4a5e" : "#ff9c42"
        : "rgba(83, 99, 118, 0.80)";
      context.fill();

      if (focused) {
        context.beginPath();
        context.arc(point[0], point[1], radius + 0.0035, 0, Math.PI * 2);
        context.strokeStyle = searchMatches.has(account.id) ? "#a3e635" : "#ffffff";
        context.lineWidth = 1.1 * px;
        context.stroke();
      }
    }

    // Middle hypernodes.
    for (const hypernode of hypernodes) {
      const point = position(hypernode.id);
      if (!point) continue;
      const size = 0.010 + Math.min(hypernode.stats.nodes, 64) * 0.00028;
      const focused = highlightedHyperIds.has(hypernode.id);
      context.save();
      context.translate(point[0], point[1]);
      context.rotate(Math.PI / 4);
      context.fillStyle = focused ? "#ffffff" : hypernode.color;
      context.fillRect(-size, -size, size * 2, size * 2);
      if (focused) {
        context.strokeStyle = "rgba(255, 255, 255, 0.72)";
        context.lineWidth = 2.2 * px;
        context.strokeRect(-size * 1.55, -size * 1.55, size * 3.1, size * 3.1);
      }
      context.restore();
    }

    // Global system node.
    const globalPoint = position(GLOBAL_ID)!;
    for (let ring = 1; ring <= 3; ring += 1) {
      context.beginPath();
      context.arc(globalPoint[0], globalPoint[1], 0.028 + ring * 0.013, 0, Math.PI * 2);
      context.strokeStyle = `rgba(250, 204, 21, ${0.20 - ring * 0.045})`;
      context.lineWidth = 1.2 * px;
      context.stroke();
    }
    context.beginPath();
    context.arc(globalPoint[0], globalPoint[1], 0.026, 0, Math.PI * 2);
    context.fillStyle = "#facc15";
    context.fill();
    context.beginPath();
    context.arc(globalPoint[0], globalPoint[1], 0.010, 0, Math.PI * 2);
    context.fillStyle = "#fffbeb";
    context.fill();

    // Labels.
    const labelIds = new Set<string>([GLOBAL_ID]);
    if (showLabels || hypernodes.length <= 24) {
      for (const hypernode of hypernodes) labelIds.add(hypernode.id);
    }
    if (showLabels) {
      [...accounts]
        .sort((left, right) => (degrees.get(right.id) ?? 0) - (degrees.get(left.id) ?? 0))
        .slice(0, 32)
        .forEach((account) => labelIds.add(account.id));
    }
    for (const id of searchMatches) labelIds.add(id);
    for (const item of [hovered, selected]) {
      if (item) labelIds.add(item.id);
    }

    context.font = `${11 / view.scale}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    for (const id of labelIds) {
      const point = position(id);
      if (!point) continue;
      const isGlobal = id === GLOBAL_ID;
      const hypernode = hyperById.get(id);
      const account = accountById.get(id);
      const label = isGlobal
        ? "GLOBAL"
        : hypernode
          ? hypernode.label
          : account
            ? account.id.length > 17 ? `${account.id.slice(0, 15)}…` : account.id
            : id;
      const offsetY = isGlobal ? -0.052 : hypernode ? -0.028 : -0.008;
      const metrics = context.measureText(label);
      context.fillStyle = "rgba(2, 5, 11, 0.80)";
      context.fillRect(
        point[0] - metrics.width / 2 - 3 / view.scale,
        point[1] + offsetY - 8 / view.scale,
        metrics.width + 6 / view.scale,
        15 / view.scale
      );
      context.fillStyle = isGlobal
        ? "#fde68a"
        : hypernode
          ? "#ffffff"
          : "#dbeafe";
      context.fillText(label, point[0], point[1] + offsetY);
    }
  }, [
    accountById,
    accounts,
    focus,
    hovered,
    hyperById,
    hypernodes,
    interactions,
    layout,
    searchMatches,
    selected,
    showAggregation,
    showInteractions,
    showLabels,
    showMembership,
    snapshot,
    view,
    viewportSize,
  ]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !snapshot) return;

    const findItemAt = (clientX: number, clientY: number): Selection | null => {
      const rect = canvas.getBoundingClientRect();
      const currentView = viewRef.current;
      const worldX = (clientX - rect.left - currentView.x) / currentView.scale;
      const worldY = (clientY - rect.top - currentView.y) / currentView.scale;
      let closest: Selection | null = null;
      let shortestDistance = 12 / currentView.scale;

      const consider = (kind: Selection["kind"], id: string, point: [number, number] | undefined) => {
        if (!point) return;
        const distance = Math.hypot(point[0] - worldX, point[1] - worldY);
        if (distance < shortestDistance) {
          shortestDistance = distance;
          closest = { kind, id } as Selection;
        }
      };

      consider("global", GLOBAL_ID, layout[GLOBAL_ID]);
      for (const hypernode of hypernodes) consider("hyper", hypernode.id, layout[hypernode.id]);
      for (const account of accounts) consider("account", account.id, layout[account.id]);
      return closest;
    };

    const handlePointerDown = (event: PointerEvent) => {
      dragStateRef.current = {
        active: true,
        moved: false,
        lastX: event.clientX,
        lastY: event.clientY,
      };
      canvas.setPointerCapture(event.pointerId);
    };

    const handlePointerMove = (event: PointerEvent) => {
      const drag = dragStateRef.current;
      if (!drag.active) {
        const item = findItemAt(event.clientX, event.clientY);
        setHovered(item);
        canvas.style.cursor = item ? "pointer" : "grab";
        return;
      }

      const dx = event.clientX - drag.lastX;
      const dy = event.clientY - drag.lastY;
      if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true;
      drag.lastX = event.clientX;
      drag.lastY = event.clientY;
      const previous = viewRef.current;
      const next = { ...previous, x: previous.x + dx, y: previous.y + dy };
      viewRef.current = next;
      setView(next);
      canvas.style.cursor = "grabbing";
    };

    const handlePointerUp = (event: PointerEvent) => {
      const drag = dragStateRef.current;
      drag.active = false;
      canvas.style.cursor = "grab";
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      if (drag.moved) return;
      const item = findItemAt(event.clientX, event.clientY);
      setSelected(item ?? { kind: "global", id: GLOBAL_ID });
      setPanelOpen(true);
    };

    const handleDoubleClick = (event: MouseEvent) => {
      const item = findItemAt(event.clientX, event.clientY);
      if (!item) return;
      setSelected(item);
      setPanelOpen(true);
      const point = layout[item.id];
      const rect = canvas.getBoundingClientRect();
      const nextScale = Math.min(viewRef.current.scale * 2.2, MAX_SCALE);
      const next = {
        scale: nextScale,
        x: rect.width / 2 - point[0] * nextScale,
        y: rect.height / 2 - point[1] * nextScale,
      };
      viewRef.current = next;
      setView(next);
    };

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const pointerX = event.clientX - rect.left;
      const pointerY = event.clientY - rect.top;
      const previous = viewRef.current;
      const worldX = (pointerX - previous.x) / previous.scale;
      const worldY = (pointerY - previous.y) / previous.scale;
      const nextScale = Math.min(
        Math.max(previous.scale * Math.exp(-event.deltaY * 0.0015), MIN_SCALE),
        MAX_SCALE
      );
      const next = {
        scale: nextScale,
        x: pointerX - worldX * nextScale,
        y: pointerY - worldY * nextScale,
      };
      viewRef.current = next;
      setView(next);
    };

    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("pointerup", handlePointerUp);
    canvas.addEventListener("dblclick", handleDoubleClick);
    canvas.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      canvas.removeEventListener("pointerdown", handlePointerDown);
      canvas.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("pointerup", handlePointerUp);
      canvas.removeEventListener("dblclick", handleDoubleClick);
      canvas.removeEventListener("wheel", handleWheel);
    };
  }, [accounts, hypernodes, layout, snapshot]);

  const selectAndFocus = useCallback((item: Selection) => {
    if (!snapshot) return;
    const point = layout[item.id];
    if (!point) return;
    setSelected(item);
    setPanelOpen(true);
    const nextScale = Math.min(Math.max(viewRef.current.scale, viewportSize.width / 2), MAX_SCALE);
    const next = {
      scale: nextScale,
      x: viewportSize.width / 2 - point[0] * nextScale,
      y: viewportSize.height / 2 - point[1] * nextScale,
    };
    viewRef.current = next;
    setView(next);
  }, [layout, snapshot, viewportSize]);

  const zoomBy = useCallback((factor: number) => {
    const previous = viewRef.current;
    const centerX = viewportSize.width / 2;
    const centerY = viewportSize.height / 2;
    const worldX = (centerX - previous.x) / previous.scale;
    const worldY = (centerY - previous.y) / previous.scale;
    const nextScale = Math.min(Math.max(previous.scale * factor, MIN_SCALE), MAX_SCALE);
    const next = {
      scale: nextScale,
      x: centerX - worldX * nextScale,
      y: centerY - worldY * nextScale,
    };
    viewRef.current = next;
    setView(next);
  }, [viewportSize]);

  const displayedStats = useMemo(() => {
    const edgeCount = interactions.length;
    const flaggedCount = interactions.filter((interaction) => interaction.flagged).length;
    const amount = interactions.reduce((sum, interaction) => sum + interaction.amount, 0);
    return { edgeCount, flaggedCount, amount };
  }, [interactions]);

  const selectedHypernode = selected?.kind === "hyper" ? hyperById.get(selected.id) ?? null : null;
  const selectedAccount = selected?.kind === "account" ? accountById.get(selected.id) ?? null : null;
  const selectedTransactions = useMemo(() => {
    if (selected?.kind !== "account") return [];
    return (adjacency.get(selected.id) ?? [])
      .slice()
      .sort((left, right) => String(right.timestamp ?? "").localeCompare(String(left.timestamp ?? "")))
      .slice(0, 80);
  }, [adjacency, selected]);

  if (loading || error || !snapshot) {
    return (
      <div className="p-8 max-w-[1700px] mx-auto">
        <PageHeader title="Hierarchical Hypergraph" subtitle="HGNN-style higher-order representation" />
        <Card className="flex min-h-[720px] flex-col items-center justify-center gap-4">
          {error ? (
            <>
              <p className="font-mono text-sm text-red-300">{error}</p>
              <button onClick={() => window.location.reload()} className="font-mono text-xs text-ash hover:text-bone">
                Retry
              </button>
            </>
          ) : (
            <>
              <LoadingState />
              <p className="font-mono text-xs text-ash">Building hierarchy from full synthetic graph…</p>
            </>
          )}
        </Card>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-[1800px] mx-auto">
      <PageHeader
        title="Hierarchical Hypergraph"
        subtitle="Global context · hypernode abstraction · vertex incidence"
      />

      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="flex items-center gap-1 bg-surface-1 border border-frost/10 rounded-sm p-1">
          {snapshot.coverage.levels.map((count) => (
            <button
              key={count}
              onClick={() => {
                setLevel(count);
                setSelected({ kind: "global", id: GLOBAL_ID });
              }}
              className={`font-mono text-[10px] px-3 py-1 rounded-[2px] ${level === count ? "bg-frost text-void" : "text-ash hover:text-bone"}`}
            >
              TOP {count}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 bg-surface-1 border border-frost/10 rounded-sm p-1">
          {[
            { label: "Membership", value: showMembership, setter: setShowMembership },
            { label: "Aggregation", value: showAggregation, setter: setShowAggregation },
            { label: "Pairwise", value: showInteractions, setter: setShowInteractions },
            { label: "Labels", value: showLabels, setter: setShowLabels },
          ].map((item) => (
            <button
              key={item.label}
              onClick={() => item.setter(!item.value)}
              className={`font-mono text-[10px] px-3 py-1 rounded-[2px] ${item.value ? "bg-charcoal text-bone" : "text-ash hover:text-bone"}`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 bg-surface-1 border border-frost/10 rounded-sm px-3 py-1.5">
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              const first = searchMatches.values().next().value as string | undefined;
              if (!first) return;
              selectAndFocus(first.startsWith("HE") ? { kind: "hyper", id: first } : { kind: "account", id: first });
            }}
            placeholder="Search vertex, hypernode, bank"
            className="w-56 bg-transparent font-mono text-[10px] text-bone outline-none placeholder:text-ash/70"
          />
          {searchMatches.size > 0 && (
            <span className="font-mono text-[10px] text-signal-green">{searchMatches.size}+</span>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => zoomBy(1.25)} className="border border-frost/10 rounded-sm px-3 py-1 font-mono text-[10px] text-ash hover:text-bone">+</button>
          <button onClick={() => zoomBy(0.8)} className="border border-frost/10 rounded-sm px-3 py-1 font-mono text-[10px] text-ash hover:text-bone">−</button>
          <button onClick={() => fitView()} className="border border-frost/10 rounded-sm px-3 py-1 font-mono text-[10px] text-ash hover:text-bone">Fit</button>
        </div>
      </div>

      <div className="relative">
        <canvas
          ref={canvasRef}
          style={{ width: "100%", height: `${CANVAS_HEIGHT}px`, borderRadius: 8 }}
          className="block touch-none bg-black"
          role="img"
          aria-label="Hierarchical hypergraph with global, hypernode and vertex layers"
        />

        <div className="absolute left-4 bottom-4 rounded-md bg-black/70 border border-white/5 px-4 py-3 backdrop-blur">
          <p className="font-mono text-[9px] uppercase tracking-wide text-ash mb-2">Hierarchy</p>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {[
              { label: "Global", color: "#facc15" },
              { label: "Hypernodes", color: "#e879f9" },
              { label: "Mule vertex", color: "#ff4a5e" },
              { label: "Context vertex", color: "#536376" },
              { label: "Incidence / aggregation", color: "#7dd3fc" },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-2">
                <span className="w-2 h-2 rotate-45" style={{ backgroundColor: item.color }} />
                <span className="font-mono text-[9px] uppercase text-ash">{item.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div
          className={`absolute top-0 right-0 h-full w-[400px] max-w-full bg-void/95 border-l border-frost/10 overflow-hidden backdrop-blur transition-transform duration-300 ${panelOpen ? "translate-x-0" : "translate-x-full"}`}
        >
          {selected?.kind === "global" && (
            <div className="h-full overflow-y-auto p-5">
              <div className="flex items-start justify-between mb-5">
                <div>
                  <p className="font-display text-base text-bone">GLOBAL SYSTEM NODE</p>
                  <p className="font-mono text-[10px] uppercase text-ash mt-1">Aggregates all rendered hypernodes</p>
                </div>
                <button onClick={() => setPanelOpen(false)} className="font-mono text-[10px] text-ash hover:text-bone">Close</button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Dataset Accounts", value: snapshot.source.accountsDataset.toLocaleString("en-IN") },
                  { label: "Dataset Txns", value: snapshot.source.transactionsDataset.toLocaleString("en-IN") },
                  { label: "Hypergroups Found", value: snapshot.network.hypernodesTotal.toLocaleString("en-IN") },
                  { label: "Rendered Groups", value: hypernodes.length.toLocaleString("en-IN") },
                  { label: "Mule Seeds", value: snapshot.network.muleSeeds.toLocaleString("en-IN") },
                  { label: "Exact Interactions", value: displayedStats.edgeCount.toLocaleString("en-IN") },
                ].map((item) => (
                  <div key={item.label} className="border border-frost/10 rounded-lg p-3">
                    <p className="font-mono text-[9px] uppercase text-ash">{item.label}</p>
                    <p className="font-mono text-sm text-bone mt-2">{item.value}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {selectedHypernode && (
            <div className="h-full overflow-y-auto p-5">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className="font-display text-base text-bone">{selectedHypernode.label}</p>
                  <p className="font-mono text-[10px] uppercase text-ash mt-1">
                    Rank #{selectedHypernode.rank} · higher-order hyperedge
                  </p>
                </div>
                <button onClick={() => setPanelOpen(false)} className="font-mono text-[10px] text-ash hover:text-bone">Close</button>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-5">
                {[
                  { label: "Vertices", value: selectedHypernode.stats.nodes.toLocaleString("en-IN") },
                  { label: "Confirmed Mules", value: selectedHypernode.stats.mules.toLocaleString("en-IN") },
                  { label: "Contexts", value: selectedHypernode.stats.contexts.toLocaleString("en-IN") },
                  { label: "Interactions", value: selectedHypernode.stats.edges.toLocaleString("en-IN") },
                  { label: "Flagged", value: selectedHypernode.stats.flaggedEdges.toLocaleString("en-IN") },
                  { label: "Amount", value: formatINR(selectedHypernode.stats.amount) },
                ].map((item) => (
                  <div key={item.label} className="border border-frost/10 rounded-lg p-3">
                    <p className="font-mono text-[9px] uppercase text-ash">{item.label}</p>
                    <p className="font-mono text-sm text-bone mt-2">{item.value}</p>
                  </div>
                ))}
              </div>
              <CardTitle>Member Vertices</CardTitle>
              <div className="grid grid-cols-2 gap-2">
                {selectedHypernode.nodeIds.map((accountId) => (
                  <button
                    key={accountId}
                    onClick={() => selectAndFocus({ kind: "account", id: accountId })}
                    className={`border border-frost/10 rounded-sm px-2 py-1 text-left font-mono text-[9px] truncate ${
                      accountById.get(accountId)?.isMule ? "text-red-200" : "text-ash"
                    } hover:text-bone`}
                  >
                    {accountId}
                  </button>
                ))}
              </div>
            </div>
          )}

          {selectedAccount && (
            <div className="h-full flex flex-col">
              <div className="p-5 border-b border-frost/10">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-mono text-xs text-bone">{selectedAccount.id}</p>
                    <p className="font-mono text-[10px] text-ash mt-1">{selectedAccount.name}</p>
                  </div>
                  <button onClick={() => setPanelOpen(false)} className="font-mono text-[10px] text-ash hover:text-bone">Close</button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "Risk", value: `${selectedAccount.riskScore.toFixed(1)}%` },
                    { label: "Degree", value: (adjacency.get(selectedAccount.id)?.length ?? 0).toLocaleString("en-IN") },
                    { label: "Bank", value: selectedAccount.bank },
                    { label: "City", value: selectedAccount.city },
                  ].map((item) => (
                    <div key={item.label}>
                      <p className="font-mono text-[9px] uppercase text-ash">{item.label}</p>
                      <p className="font-mono text-[11px] text-bone mt-1">{item.value}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-4">
                  <p className="font-mono text-[9px] uppercase text-ash mb-2">Hypernode Memberships</p>
                  <div className="flex flex-wrap gap-1">
                    {hypernodes
                      .filter((hypernode) => hypernode.nodeIds.includes(selectedAccount.id))
                      .map((hypernode) => (
                        <button
                          key={hypernode.id}
                          onClick={() => selectAndFocus({ kind: "hyper", id: hypernode.id })}
                          className="font-mono text-[9px] px-1.5 py-0.5 rounded-sm border border-white/10 text-bone"
                          style={{ backgroundColor: `${hypernode.color}22` }}
                        >
                          {hypernode.id}
                        </button>
                      ))}
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-5">
                <p className="font-mono text-[10px] uppercase text-ash mb-4">
                  Pairwise Interactions · {selectedTransactions.length}
                </p>
                {selectedTransactions.map((transaction) => (
                  <div key={transaction.id} className="border border-frost/10 rounded-lg p-3 mb-3">
                    <div className="flex justify-between mb-2">
                      <span className="font-mono text-[10px] text-ash">{transaction.id}</span>
                      <span className="font-mono text-[9px] uppercase text-ash">{transaction.type}</span>
                    </div>
                    <div className="font-mono text-[10px] text-bone truncate">
                      {transaction.from} &rarr; {transaction.to}
                    </div>
                    <div className="flex justify-between mt-2">
                      <span className={`font-mono text-xs ${transaction.flagged ? "text-red-300" : "text-bone"}`}>
                        {formatINR(transaction.amount)}
                      </span>
                      {transaction.flagged && (
                        <span className="font-mono text-[8px] uppercase text-red-200 bg-red-500/15 px-1.5 py-0.5 rounded-sm">
                          Flagged
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
        {[
          { label: "Dataset Accounts", value: snapshot.source.accountsDataset.toLocaleString("en-IN") },
          { label: "Dataset Txns", value: snapshot.source.transactionsDataset.toLocaleString("en-IN") },
          { label: "All Hypergroups", value: snapshot.network.hypernodesTotal.toLocaleString("en-IN") },
          { label: "Rendered Hypernodes", value: hypernodes.length.toLocaleString("en-IN") },
          { label: "Bottom Vertices", value: accounts.length.toLocaleString("en-IN") },
          { label: "Base Interactions", value: displayedStats.edgeCount.toLocaleString("en-IN") },
          { label: "Flagged Flows", value: displayedStats.flaggedCount.toLocaleString("en-IN") },
          { label: "Selected Volume", value: formatINR(displayedStats.amount) },
        ].map((item) => (
          <Card key={item.label}>
            <p className="font-mono text-[8px] uppercase text-ash mb-2">{item.label}</p>
            <p className="font-mono text-sm text-bone">{item.value}</p>
          </Card>
        ))}
      </div>

      <Card className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="font-mono text-[10px] text-ash">
          HGNN structure · {accounts.length.toLocaleString("en-IN")} vertices → {hypernodes.length.toLocaleString("en-IN")} hypernodes → 1 global node
        </p>
        <p className="font-mono text-[9px] text-ash/70">
          Derived from {snapshot.network.incidentEdges.toLocaleString("en-IN")} exact incident interactions · generated{" "}
          {new Date(snapshot.generatedAt).toLocaleString("en-IN")}
        </p>
      </Card>
    </div>
  );
}
