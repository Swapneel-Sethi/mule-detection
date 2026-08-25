"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import LoadingState from "@/components/ui/LoadingState";

type GraphMode = "highRisk" | "mules";

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

interface GraphModeSnapshot {
  label: string;
  coreIds: string[];
  nodeIds: string[];
  edges: GraphTransaction[];
  layout: Record<string, [number, number]>;
}

interface GraphSnapshot {
  version: number;
  generatedAt: string;
  source: {
    accountsDataset: number;
    transactionsDataset: number;
  };
  accounts: Record<string, GraphAccount>;
  modes: Record<GraphMode, GraphModeSnapshot>;
}

interface GraphNode extends GraphAccount {
  isCore: boolean;
  degree: number;
}

interface ViewState {
  x: number;
  y: number;
  scale: number;
}

const CANVAS_HEIGHT = 760;
const MIN_SCALE = 0.15;
const MAX_SCALE = 16000;
const MAX_DPR = 2;
const MODES: { value: GraphMode; label: string }[] = [
  { value: "highRisk", label: "High Risk" },
  { value: "mules", label: "Mules" },
];

function formatINR(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

function calculateBounds(nodes: GraphNode[], layout: Record<string, [number, number]>) {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const node of nodes) {
    const position = layout[node.id];
    if (!position) continue;
    minX = Math.min(minX, position[0]);
    minY = Math.min(minY, position[1]);
    maxX = Math.max(maxX, position[0]);
    maxY = Math.max(maxY, position[1]);
  }

  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  return { minX, minY, maxX, maxY };
}

export default function NetworkGraph() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewRef = useRef<ViewState>({ x: 0, y: 0, scale: 1 });
  const dragStateRef = useRef({ active: false, moved: false, lastX: 0, lastY: 0 });
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{
    startDistance: number;
    startScale: number;
    startMidX: number;
    startMidY: number;
    startX: number;
    startY: number;
  } | null>(null);
  const drawFrameRef = useRef(0);
  const drawRef = useRef<() => void>(() => {});
  const pendingViewRef = useRef<ViewState | null>(null);
  const viewFrameRef = useRef(0);

  const [snapshot, setSnapshot] = useState<GraphSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<GraphMode>("highRisk");
  const [showContext, setShowContext] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewportSize, setViewportSize] = useState({ width: 0, height: CANVAS_HEIGHT });
  const [view, setView] = useState<ViewState>({ x: 0, y: 0, scale: 1 });
  const [dpr, setDpr] = useState(MAX_DPR);

  // Drag, wheel and pinch can emit far more view updates than display frames.
  // Coalescing them into one setState per rAF caps redraws at the refresh rate
  // instead of the input-event rate.
  const scheduleView = (next: ViewState) => {
    viewRef.current = next;
    pendingViewRef.current = next;
    if (viewFrameRef.current) return;
    viewFrameRef.current = window.requestAnimationFrame(() => {
      viewFrameRef.current = 0;
      if (pendingViewRef.current) setView(pendingViewRef.current);
    });
  };

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function loadSnapshot() {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch("/network_graph.json", {
          signal: controller.signal,
          cache: "force-cache",
        });
        if (!response.ok) throw new Error(`Dataset HTTP ${response.status}`);
        const data = (await response.json()) as GraphSnapshot;
        if (!cancelled) setSnapshot(data);
      } catch (caught) {
        if (!cancelled && !(caught instanceof DOMException && caught.name === "AbortError")) {
          setError(caught instanceof Error ? caught.message : "Unable to load graph dataset");
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

  const modeData = snapshot?.modes[mode];

  const nodes = useMemo<GraphNode[]>(() => {
    if (!snapshot || !modeData) return [];
    const result: GraphNode[] = [];
    const coreSet = new Set(modeData.coreIds);
    const degrees = new Map<string, number>();

    for (const edge of modeData.edges) {
      degrees.set(edge.from, (degrees.get(edge.from) ?? 0) + 1);
      degrees.set(edge.to, (degrees.get(edge.to) ?? 0) + 1);
    }

    for (const id of modeData.nodeIds) {
      const account = snapshot.accounts[id];
      if (!account) continue;
      result.push({ ...account, isCore: coreSet.has(id), degree: degrees.get(id) ?? 0 });
    }

    return result.sort(
      (a, b) => Number(b.isCore) - Number(a.isCore) || b.degree - a.degree
    );
  }, [snapshot, modeData]);

  const visibleNodes = useMemo(
    () => (showContext ? nodes : nodes.filter((node) => node.isCore)),
    [nodes, showContext]
  );

  const adjacency = useMemo(() => {
    const map = new Map<string, GraphTransaction[]>();
    if (!modeData) return map;
    for (const edge of modeData.edges) {
      const fromEdges = map.get(edge.from) ?? [];
      const toEdges = map.get(edge.to) ?? [];
      fromEdges.push(edge);
      toEdges.push(edge);
      map.set(edge.from, fromEdges);
      map.set(edge.to, toEdges);
    }
    return map;
  }, [modeData]);

  const searchMatches = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (query.length < 2) return new Set<string>();
    return new Set(
      visibleNodes
        .filter(
          (node) =>
            node.id.toLowerCase().includes(query) ||
            node.name.toLowerCase().includes(query) ||
            node.bank.toLowerCase().includes(query) ||
            node.city.toLowerCase().includes(query)
        )
        .slice(0, 100)
        .map((node) => node.id)
    );
  }, [searchQuery, visibleNodes]);

  const fitView = useCallback(
    (
      nextModeData: GraphModeSnapshot | undefined = modeData,
      nextNodes: GraphNode[] = visibleNodes,
      size = viewportSize
    ) => {
      if (!nextModeData || size.width === 0 || nextNodes.length === 0) return;
      const bounds = calculateBounds(nextNodes, nextModeData.layout);
      const spanX = Math.max(bounds.maxX - bounds.minX, 0.02);
      const spanY = Math.max(bounds.maxY - bounds.minY, 0.02);
      const padding = 64;
      const scale = Math.min(
        (size.width - padding * 2) / spanX,
        (size.height - padding * 2) / spanY
      );
      const centerX = (bounds.minX + bounds.maxX) / 2;
      const centerY = (bounds.minY + bounds.maxY) / 2;
      const nextState = {
        scale,
        x: size.width / 2 - centerX * scale,
        y: size.height / 2 - centerY * scale,
      };
      viewRef.current = nextState;
      setView(nextState);
    },
    [modeData, visibleNodes, viewportSize]
  );

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => fitView());
    return () => window.cancelAnimationFrame(frame);
  }, [fitView]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resizeObserver = new ResizeObserver(() => {
      setViewportSize({ width: canvas.clientWidth, height: canvas.clientHeight });
    });
    resizeObserver.observe(canvas);
    return () => resizeObserver.disconnect();
  }, [loading, error]);

  // Dragging the window onto a different monitor changes devicePixelRatio
  // without touching layout, so ResizeObserver never fires. Watch it via the
  // resize signal (also covers browser zoom) and bail out when unchanged.
  useEffect(() => {
    const syncDpr = () => {
      const next = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      setDpr((current) => (current === next ? current : next));
    };
    syncDpr();
    window.addEventListener("resize", syncDpr);
    return () => window.removeEventListener("resize", syncDpr);
  }, []);

  // Per-frame derived indexes. Rebuilding a ~10k-entry map, filtering ~10k
  // edges and fully sorting the node list on every redraw (i.e. every
  // pointermove) dominated the frame budget; derive them once per dataset.
  const nodeById = useMemo(
    () => new Map(visibleNodes.map((node) => [node.id, node])),
    [visibleNodes]
  );

  const drawableEdges = useMemo(() => {
    if (!modeData) return [];
    return modeData.edges.filter(
      (edge) => nodeById.has(edge.from) && nodeById.has(edge.to)
    );
  }, [modeData, nodeById]);

  const baseLabelledIds = useMemo(() => {
    if (!showLabels) return [] as string[];
    return [...nodeById.values()]
      .sort((a, b) => b.degree + Number(b.isCore) * 20 - (a.degree + Number(a.isCore) * 20))
      .slice(0, 48)
      .map((node) => node.id);
  }, [nodeById, showLabels]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !modeData || viewportSize.width === 0) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const ctx = context;
    const nodeLayout = modeData.layout;

    // Assigning canvas.width/height reallocates the backing store even when
    // the value is unchanged, so only touch it on an actual DPR/size change.
    const targetWidth = Math.floor(viewportSize.width * dpr);
    if (canvas.width !== targetWidth) canvas.width = targetWidth;
    const targetHeight = Math.floor(viewportSize.height * dpr);
    if (canvas.height !== targetHeight) canvas.height = targetHeight;

    const focusIds = new Set<string>();
    if (selectedId) focusIds.add(selectedId);
    if (hoveredId) focusIds.add(hoveredId);
    const connectedIds = new Set<string>();
    for (const id of focusIds) {
      for (const edge of adjacency.get(id) ?? []) {
        connectedIds.add(edge.from);
        connectedIds.add(edge.to);
      }
    }

    const labelledIds = new Set<string>(baseLabelledIds);
    for (const id of [selectedId, hoveredId]) if (id) labelledIds.add(id);
    for (const id of searchMatches) labelledIds.add(id);

    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    const background = context.createLinearGradient(0, 0, viewportSize.width, viewportSize.height);
    background.addColorStop(0, "#04060b");
    background.addColorStop(0.55, "#050910");
    background.addColorStop(1, "#020408");
    context.fillStyle = background;
    context.fillRect(0, 0, viewportSize.width, viewportSize.height);

    context.translate(view.x, view.y);
    context.scale(view.scale, view.scale);
    const lineWidth = 1 / view.scale;

    // Viewport culling: skip primitives entirely outside the visible rect
    // (plus a screen-proportional margin). Without this every redraw stroked
    // all ~10k edges regardless of zoom level.
    const cullPad = 48 / view.scale;
    const cullMinX = -view.x / view.scale - cullPad;
    const cullMinY = -view.y / view.scale - cullPad;
    const cullMaxX = (viewportSize.width - view.x) / view.scale + cullPad;
    const cullMaxY = (viewportSize.height - view.y) / view.scale + cullPad;
    const inView = (position: readonly [number, number]) =>
      position[0] >= cullMinX &&
      position[0] <= cullMaxX &&
      position[1] >= cullMinY &&
      position[1] <= cullMaxY;

    const ordinaryPaths: GraphTransaction[] = [];
    const flaggedPaths: GraphTransaction[] = [];
    const highlightedPaths: GraphTransaction[] = [];
    for (const edge of drawableEdges) {
      const from = nodeLayout[edge.from];
      const to = nodeLayout[edge.to];
      if (!from || !to) continue;
      const isHighlighted =
        focusIds.has(edge.from) ||
        focusIds.has(edge.to);
      if (!isHighlighted && !inView(from) && !inView(to)) continue;
      if (isHighlighted) highlightedPaths.push(edge);
      else if (edge.flagged) flaggedPaths.push(edge);
      else ordinaryPaths.push(edge);
    }

    function strokeBatch(edges: GraphTransaction[], style: string, widthMultiplier: number) {
      ctx.strokeStyle = style;
      ctx.lineWidth = lineWidth * widthMultiplier;
      ctx.beginPath();
      for (const edge of edges) {
        const from = nodeLayout[edge.from];
        const to = nodeLayout[edge.to];
        if (!inView(from) && !inView(to)) continue;
        ctx.moveTo(from[0], from[1]);
        ctx.lineTo(to[0], to[1]);
      }
      ctx.stroke();
    }

    context.lineCap = "round";
    strokeBatch(ordinaryPaths, "rgba(88, 108, 130, 0.17)", 0.65);
    strokeBatch(flaggedPaths, "rgba(255, 68, 88, 0.24)", 0.75);
    strokeBatch(highlightedPaths, "rgba(125, 211, 252, 0.78)", 1.25);

    context.fillStyle = "rgba(82, 99, 118, 0.72)";
    for (const node of visibleNodes) {
      if (node.isCore) continue;
      const position = modeData.layout[node.id];
      if (!position) continue;
      if (!inView(position)) continue;
      context.beginPath();
      context.arc(position[0], position[1], 0.0022, 0, Math.PI * 2);
      context.fill();
    }

    for (const node of visibleNodes) {
      if (!node.isCore) continue;
      const position = modeData.layout[node.id];
      if (!position) continue;
      if (!inView(position)) continue;
      const radius = 0.0032 + Math.min(node.degree, 24) * 0.00018;
      context.beginPath();
      context.arc(position[0], position[1], radius, 0, Math.PI * 2);
      context.fillStyle = node.riskLevel === "critical" ? "#ff4a5e" : "#ff9c42";
      context.fill();
    }

    context.lineWidth = lineWidth;
    for (const node of visibleNodes) {
      const isFocus = focusIds.has(node.id);
      const isConnected = connectedIds.has(node.id);
      const isMatch = searchMatches.has(node.id);
      if (!isFocus && !isConnected && !isMatch) continue;
      const position = modeData.layout[node.id];
      if (!position) continue;
      if (!inView(position)) continue;
      const radius = node.isCore ? 0.0032 + Math.min(node.degree, 24) * 0.00018 : 0.0028;
      context.beginPath();
      context.arc(position[0], position[1], radius + 0.0022, 0, Math.PI * 2);
      context.strokeStyle = isFocus
        ? "#ffffff"
        : isMatch
          ? "#a3e635"
          : "rgba(125, 211, 252, 0.55)";
      context.stroke();
    }

    if (labelledIds.size > 0) {
      context.font = `${11 / view.scale}px ui-monospace, SFMono-Regular, Menlo, monospace`;
      context.textAlign = "center";
      context.textBaseline = "middle";
      for (const id of labelledIds) {
        const node = nodeById.get(id);
        const position = modeData.layout[id];
        if (!node || !position) continue;
        if (!inView(position)) continue;
        const label = node.id.length > 16 ? `${node.id.slice(0, 14)}…` : node.id;
        const textY = position[1] - (node.isCore ? 0.008 : 0.006);
        const metrics = context.measureText(label);
        context.fillStyle = "rgba(2, 6, 12, 0.78)";
        context.fillRect(
          position[0] - metrics.width / 2 - 3 / view.scale,
          textY - 8 / view.scale,
          metrics.width + 6 / view.scale,
          15 / view.scale
        );
        context.fillStyle = focusIds.has(id) ? "#ffffff" : "#dbeafe";
        context.fillText(label, position[0], textY);
      }
    }
  }, [
    adjacency,
    baseLabelledIds,
    dpr,
    drawableEdges,
    hoveredId,
    modeData,
    nodeById,
    searchMatches,
    selectedId,
    view,
    viewportSize,
  ]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !modeData) return;

    const findNodeAt = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      const currentView = viewRef.current;
      const worldX = (clientX - rect.left - currentView.x) / currentView.scale;
      const worldY = (clientY - rect.top - currentView.y) / currentView.scale;
      const threshold = 9 / currentView.scale;
      let closest: GraphNode | null = null;
      let shortestDistance = threshold;
      for (const node of visibleNodes) {
        const position = modeData.layout[node.id];
        if (!position) continue;
        const distance = Math.hypot(position[0] - worldX, position[1] - worldY);
        if (distance <= shortestDistance) {
          shortestDistance = distance;
          closest = node;
        }
      }
      return closest;
    };

    const pointerPos = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };

    const trackedPoints = () => [...pointersRef.current.values()];

    const applyPinch = () => {
      const start = pinchRef.current;
      const points = trackedPoints();
      if (!start || points.length < 2) return;
      const [a, b] = points;
      const distance = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const midX = (a.x + b.x) / 2;
      const midY = (a.y + b.y) / 2;
      const nextScale = Math.min(
        Math.max(start.startScale * (distance / start.startDistance), MIN_SCALE),
        MAX_SCALE
      );
      // Anchor the world point under the gesture-start midpoint so the pinch
      // simultaneously pans (midpoint drift) and scales about the fingers.
      const worldX = (start.startMidX - start.startX) / start.startScale;
      const worldY = (start.startMidY - start.startY) / start.startScale;
      scheduleView({
        scale: nextScale,
        x: midX - worldX * nextScale,
        y: midY - worldY * nextScale,
      });
    };

    const endGesture = (event: PointerEvent) => {
      pointersRef.current.delete(event.pointerId);
      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
    };

    const handlePointerDown = (event: PointerEvent) => {
      const point = pointerPos(event);
      pointersRef.current.set(event.pointerId, point);
      canvas.setPointerCapture(event.pointerId);
      if (pointersRef.current.size === 2) {
        const [a, b] = trackedPoints();
        pinchRef.current = {
          startDistance: Math.hypot(a.x - b.x, a.y - b.y) || 1,
          startScale: viewRef.current.scale,
          startMidX: (a.x + b.x) / 2,
          startMidY: (a.y + b.y) / 2,
          startX: viewRef.current.x,
          startY: viewRef.current.y,
        };
        // Suspend single-finger pan and suppress the tap-select that would
        // otherwise fire when the gesture fingers lift.
        dragStateRef.current.active = false;
        dragStateRef.current.moved = true;
        canvas.style.cursor = "grabbing";
      } else if (pointersRef.current.size === 1) {
        dragStateRef.current = { active: true, moved: false, lastX: point.x, lastY: point.y };
      }
    };

    const handlePointerMove = (event: PointerEvent) => {
      const point = pointerPos(event);
      if (pointersRef.current.has(event.pointerId)) {
        pointersRef.current.set(event.pointerId, point);
      }
      if (pinchRef.current) {
        if (pointersRef.current.size >= 2) applyPinch();
        return;
      }

      const drag = dragStateRef.current;
      if (!drag.active) {
        const node = findNodeAt(event.clientX, event.clientY);
        setHoveredId(node?.id ?? null);
        canvas.style.cursor = node ? "pointer" : "grab";
        return;
      }

      const dx = point.x - drag.lastX;
      const dy = point.y - drag.lastY;
      if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true;
      drag.lastX = point.x;
      drag.lastY = point.y;
      const previous = viewRef.current;
      scheduleView({ ...previous, x: previous.x + dx, y: previous.y + dy });
      canvas.style.cursor = "grabbing";
    };

    const handlePointerUp = (event: PointerEvent) => {
      endGesture(event);
      if (pinchRef.current) {
        if (pointersRef.current.size < 2) {
          pinchRef.current = null;
          const survivor = trackedPoints()[0];
          if (survivor) {
            // Re-anchor pan on the remaining finger so the view never jumps.
            dragStateRef.current = { active: true, moved: true, lastX: survivor.x, lastY: survivor.y };
          } else {
            dragStateRef.current.active = false;
            canvas.style.cursor = "grab";
          }
        }
        return;
      }

      const drag = dragStateRef.current;
      drag.active = false;
      canvas.style.cursor = "grab";
      if (drag.moved) return;
      const node = findNodeAt(event.clientX, event.clientY);
      setSelectedId(node?.id ?? null);
      setPanelOpen(Boolean(node));
    };

    const handlePointerCancel = (event: PointerEvent) => {
      endGesture(event);
      if (pointersRef.current.size < 2) pinchRef.current = null;
      if (pointersRef.current.size === 0) {
        dragStateRef.current.active = false;
        canvas.style.cursor = "grab";
      }
    };

    const handleDoubleClick = (event: MouseEvent) => {
      const node = findNodeAt(event.clientX, event.clientY);
      if (!node) return;
      setSelectedId(node.id);
      setPanelOpen(true);
      const rect = canvas.getBoundingClientRect();
      const position = modeData.layout[node.id];
      const nextScale = Math.min(viewRef.current.scale * 2.5, MAX_SCALE);
      const next = {
        scale: nextScale,
        x: rect.width / 2 - position[0] * nextScale,
        y: rect.height / 2 - position[1] * nextScale,
      };
      viewRef.current = next;
      setView(next);
    };

    const handleWheel = (event: WheelEvent) => {
      // Only hijack the wheel for deliberate zoom (Ctrl/cmd + wheel, or a
      // two-finger pinch which browsers report with ctrlKey=true). Plain
      // wheel keeps scrolling the page.
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const pointerX = event.clientX - rect.left;
      const pointerY = event.clientY - rect.top;
      const previous = viewRef.current;
      const worldX = (pointerX - previous.x) / previous.scale;
      const worldY = (pointerY - previous.y) / previous.scale;
      const nextScale = Math.min(
        Math.max(previous.scale * Math.exp(-event.deltaY * 0.0016), MIN_SCALE),
        MAX_SCALE
      );
      scheduleView({
        scale: nextScale,
        x: pointerX - worldX * nextScale,
        y: pointerY - worldY * nextScale,
      });
    };

    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("pointerup", handlePointerUp);
    canvas.addEventListener("pointercancel", handlePointerCancel);
    canvas.addEventListener("dblclick", handleDoubleClick);
    canvas.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      canvas.removeEventListener("pointerdown", handlePointerDown);
      canvas.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("pointerup", handlePointerUp);
      canvas.removeEventListener("pointercancel", handlePointerCancel);
      canvas.removeEventListener("dblclick", handleDoubleClick);
      canvas.removeEventListener("wheel", handleWheel);
    };
  }, [modeData, visibleNodes]);

  const selectedAccount = selectedId ? snapshot?.accounts[selectedId] ?? null : null;

  const selectedTransactions = useMemo(() => {
    if (!selectedId) return [];
    return (adjacency.get(selectedId) ?? [])
      .slice()
      .sort((a, b) => String(b.timestamp ?? "").localeCompare(String(a.timestamp ?? "")))
      .slice(0, 80);
  }, [adjacency, selectedId]);

  const locateSearch = () => {
    const first = searchMatches.values().next().value as string | undefined;
    if (!first || !modeData) return;
    const position = modeData.layout[first];
    if (!position) return;
    setSelectedId(first);
    setPanelOpen(true);
    const nextScale = Math.min(
      Math.max(viewRef.current.scale, viewportSize.width / 2),
      MAX_SCALE
    );
    const next = {
      scale: nextScale,
      x: viewportSize.width / 2 - position[0] * nextScale,
      y: viewportSize.height / 2 - position[1] * nextScale,
    };
    viewRef.current = next;
    setView(next);
  };

  const zoomBy = (factor: number) => {
    const previous = viewRef.current;
    const nextScale = Math.min(
      Math.max(previous.scale * factor, MIN_SCALE),
      MAX_SCALE
    );
    const centerX = viewportSize.width / 2;
    const centerY = viewportSize.height / 2;
    const worldX = (centerX - previous.x) / previous.scale;
    const worldY = (centerY - previous.y) / previous.scale;
    const next = {
      scale: nextScale,
      x: centerX - worldX * nextScale,
      y: centerY - worldY * nextScale,
    };
    viewRef.current = next;
    setView(next);
  };

  const panBy = (dx: number, dy: number) => {
    const previous = viewRef.current;
    const next = { ...previous, x: previous.x + dx, y: previous.y + dy };
    viewRef.current = next;
    setView(next);
  };

  const handleCanvasKeyDown = (event: KeyboardEvent<HTMLCanvasElement>) => {
    const step = event.shiftKey ? 180 : 64;
    switch (event.key) {
      case "ArrowLeft":
        panBy(-step, 0);
        break;
      case "ArrowRight":
        panBy(step, 0);
        break;
      case "ArrowUp":
        panBy(0, -step);
        break;
      case "ArrowDown":
        panBy(0, step);
        break;
      case "+":
      case "=":
        zoomBy(1.25);
        break;
      case "-":
      case "_":
        zoomBy(0.8);
        break;
      case "Escape":
        setSelectedId(null);
        setHoveredId(null);
        setPanelOpen(false);
        setSearchQuery("");
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  const stats = useMemo(
    () => ({
      flaggedEdges: modeData?.edges.filter((edge) => edge.flagged).length ?? 0,
    }),
    [modeData]
  );

  if (loading || error || !snapshot || !modeData) {
    return (
      <div className="p-8 max-w-[1600px] mx-auto">
        <PageHeader title="Network Graph" subtitle="Full synthetic-dataset topology" />
        <Card className="flex min-h-[720px] flex-col items-center justify-center gap-4">
          {error ? (
            <>
              <p className="font-mono text-sm text-red-300">{error}</p>
              <button
                onClick={() => window.location.reload()}
                className="font-mono text-xs text-ash hover:text-bone"
              >
                Retry
              </button>
            </>
          ) : (
            <>
              <LoadingState />
              <p className="font-mono text-xs text-ash">Loading exact network topology…</p>
            </>
          )}
        </Card>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-[1700px] mx-auto">
      <PageHeader
        title="Network Graph"
        subtitle={`${modeData.label} topology · generated from all ${snapshot.source.accountsDataset.toLocaleString("en-IN")} accounts`}
      />

      <div className="flex flex-wrap items-center gap-4 mb-5">
        <div className="flex items-center gap-1 bg-surface-1 border border-frost/10 rounded-sm p-1">
          {MODES.map((item) => (
            <button
              key={item.value}
              onClick={() => {
                setMode(item.value);
                setSelectedId(null);
                setHoveredId(null);
                setPanelOpen(false);
              }}
              className={`font-mono text-[10px] tracking-[-0.02em] px-3 py-1 rounded-[2px] transition-default ${
                mode === item.value ? "bg-frost text-void" : "text-ash hover:text-bone"
              }`}
            >
              {item.label} · {snapshot.modes[item.value].coreIds.length.toLocaleString("en-IN")}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 bg-surface-1 border border-frost/10 rounded-sm p-1">
          <button
            onClick={() => setShowContext((value) => !value)}
            className={`font-mono text-[10px] px-3 py-1 rounded-[2px] ${showContext ? "bg-charcoal text-bone" : "text-ash hover:text-bone"}`}
          >
            Context
          </button>
          <button
            onClick={() => setShowLabels((value) => !value)}
            className={`font-mono text-[10px] px-3 py-1 rounded-[2px] ${showLabels ? "bg-charcoal text-bone" : "text-ash hover:text-bone"}`}
          >
            Labels
          </button>
        </div>

        <div className="flex items-center gap-2 bg-surface-1 border border-frost/10 rounded-sm px-3 py-1.5">
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && locateSearch()}
            placeholder="Search ID, name, bank, city"
            className="w-52 bg-transparent font-mono text-[10px] text-bone outline-none placeholder:text-ash"
          />
          {searchMatches.size > 0 && (
            <button onClick={locateSearch} className="font-mono text-[10px] text-signal-green hover:text-bone">
              Locate {searchMatches.size}+
            </button>
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
          className="block touch-none bg-black outline-none focus-visible:ring-1 focus-visible:ring-frost/40"
          role="img"
          aria-label="Interactive mule account network graph. Keyboard: arrow keys pan, shift+arrows pan faster, plus/minus zoom, escape clears selection and search."
          tabIndex={0}
          onKeyDown={handleCanvasKeyDown}
        />

        <div className="absolute left-4 bottom-4 flex flex-wrap gap-4 rounded-md bg-black/65 px-4 py-3 backdrop-blur-sm border border-white/5">
          {[
            { label: "Critical-risk mule", color: "#ff4a5e" },
            { label: "Other confirmed mule", color: "#ff9c42" },
            { label: "Linked context", color: "#526376" },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
              <span className="font-mono text-[11px] uppercase tracking-wide text-ash">{item.label}</span>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <span className="w-4 h-px bg-sky-300" />
            <span className="font-mono text-[11px] uppercase tracking-wide text-ash">Selected flow</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-4 h-px" style={{ backgroundColor: "#ff4458" }} />
            <span className="font-mono text-[11px] uppercase tracking-wide text-ash">Flagged txn</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full border-2" style={{ borderColor: "#ffffff" }} />
            <span className="font-mono text-[11px] uppercase tracking-wide text-ash">Selected node</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full border-2" style={{ borderColor: "rgba(125, 211, 252, 0.55)" }} />
            <span className="font-mono text-[11px] uppercase tracking-wide text-ash">Connected node</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full border-2" style={{ borderColor: "#a3e635" }} />
            <span className="font-mono text-[11px] uppercase tracking-wide text-ash">Search match</span>
          </div>
        </div>

        <div
          className={`absolute top-0 right-0 h-full w-[380px] max-w-full bg-void/95 border-l border-frost/10 transition-transform duration-300 ease-out overflow-hidden backdrop-blur ${
            panelOpen && selectedAccount ? "translate-x-0" : "translate-x-full"
          }`}
        >
          {selectedAccount && (
            <div className="h-full flex flex-col">
              <div className="p-5 border-b border-frost/10">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-mono text-xs text-bone">{selectedAccount.id}</p>
                    <p className="font-mono text-[10px] text-ash mt-1">{selectedAccount.name}</p>
                  </div>
                  <button
                    onClick={() => {
                      setSelectedId(null);
                      setPanelOpen(false);
                    }}
                    className="font-mono text-[10px] text-ash hover:text-bone"
                  >
                    Close
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3 mt-4">
                  {[
                    { label: "Risk", value: `${selectedAccount.riskScore.toFixed(1)}%` },
                    { label: "Degree", value: (adjacency.get(selectedAccount.id)?.length ?? 0).toLocaleString("en-IN") },
                    { label: "Bank", value: selectedAccount.bank },
                    { label: "City", value: selectedAccount.city },
                  ].map((item) => (
                    <div key={item.label}>
                      <p className="font-mono text-[11px] uppercase tracking-wide text-ash">{item.label}</p>
                      <p className="font-mono text-[11px] text-bone mt-1">{item.value}</p>
                    </div>
                  ))}
                </div>
                {selectedAccount.flags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-4">
                    {selectedAccount.flags.map((flag) => (
                      <span key={flag} className="font-mono text-[11px] text-ash bg-charcoal/40 px-1.5 py-0.5 rounded-[2px]">
                        {flag}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex-1 overflow-y-auto p-5">
                <p className="font-mono text-[10px] uppercase tracking-wide text-ash mb-4">
                  Transactions · {selectedTransactions.length}
                </p>
                {selectedTransactions.map((txn) => {
                  const incoming = txn.to === selectedAccount.id;
                  return (
                    <div key={txn.id} className="border border-frost/10 rounded-lg p-3 mb-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-mono text-[10px] text-ash">{txn.id}</span>
                        <span className="font-mono text-[11px] uppercase text-ash">{txn.type}</span>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] font-mono">
                        <span className={incoming ? "text-ash" : "text-bone"}>{txn.from}</span>
                        <span className="text-sky-300">&rarr;</span>
                        <span className={incoming ? "text-bone" : "text-ash"}>{txn.to}</span>
                      </div>
                      <div className="flex items-center justify-between mt-3">
                        <span className={`font-mono text-xs ${txn.flagged ? "text-red-300" : "text-bone"}`}>
                          {formatINR(txn.amount)}
                        </span>
                        <div className="flex items-center gap-2">
                          {txn.flagged && (
                            <span className="font-mono text-[11px] uppercase text-red-200 bg-red-500/15 px-1.5 py-0.5 rounded-[2px]">
                              Flagged
                            </span>
                          )}
                          <span className="font-mono text-[11px] text-ash">{Math.round(txn.riskScore)}%</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {selectedTransactions.length === 0 && (
                  <p className="font-mono text-[10px] text-ash">No transactions found.</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        {[
          { label: "Dataset Accounts", value: snapshot.source.accountsDataset.toLocaleString("en-IN") },
          { label: "Dataset Txns", value: snapshot.source.transactionsDataset.toLocaleString("en-IN") },
          { label: "Core Accounts", value: modeData.coreIds.length.toLocaleString("en-IN") },
          { label: "Rendered Nodes", value: visibleNodes.length.toLocaleString("en-IN") },
          { label: "Exact Edges", value: modeData.edges.length.toLocaleString("en-IN") },
          { label: "Flagged Edges", value: stats.flaggedEdges.toLocaleString("en-IN") },
        ].map((item) => (
          <Card key={item.label}>
            <p className="font-mono text-[11px] uppercase tracking-wide text-ash mb-2">{item.label}</p>
            <p className="font-mono text-lg text-bone">{item.value}</p>
          </Card>
        ))}
      </div>

      <Card className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="font-mono text-[10px] text-ash">
          Sync verified · {modeData.edges.length.toLocaleString("en-IN")} incident transactions extracted from{" "}
          {snapshot.source.transactionsDataset.toLocaleString("en-IN")} records
        </p>
        <p className="font-mono text-[10px] text-ash/70">
          Keys: Tab to canvas · arrows pan (Shift = large step) · +/− zoom · Esc clears selection &amp; search ·
          ctrl+wheel or pinch zooms
        </p>
        <p className="font-mono text-[11px] text-ash/70">
          Generated {new Date(snapshot.generatedAt).toLocaleString("en-IN")}
        </p>
      </Card>
    </div>
  );
}
