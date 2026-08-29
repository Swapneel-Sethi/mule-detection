"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import Card, { CardTitle } from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import LoadingState from "@/components/ui/LoadingState";
import PageHeader from "@/components/ui/PageHeader";
import { formatCurrencyINR } from "@/lib/utils";
import type { ForceGraph3DInstance } from "3d-force-graph";

export interface GalaxyNode {
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
  x?: number;
  y?: number;
  z?: number;
}

export interface GalaxyApiLink {
  source: string;
  target: string;
  amount: number;
  count: number;
  flagged: boolean;
  firstDay?: string;
}

export interface GalaxyLink extends Omit<GalaxyApiLink, "source" | "target"> {
  source: string | GalaxyNode;
  target: string | GalaxyNode;
}

export interface GalaxySnapshot {
  generatedAt: string;
  meta: {
    nodes: number;
    links: number;
    mules: number;
    watchlistCount: number;
    totalVolume: number;
    flaggedVolume: number;
  };
  nodes: GalaxyNode[];
  links: GalaxyApiLink[];
}

type ViewMode = "all" | "mules" | "highrisk";
type GraphInstance = ForceGraph3DInstance<GalaxyNode, GalaxyLink>;
type Vec3 = { x: number; y: number; z: number };
type Controls = {
  autoRotate?: boolean;
  autoRotateSpeed?: number;
  target?: Vec3;
  minDistance?: number;
  maxDistance?: number;
};

const CANVAS_HEIGHT = "min(76vh, 860px)";
const PANEL_WIDTH = 400;

function nodeId(value: string | GalaxyNode): string {
  return typeof value === "string" ? value : value.id;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    const entities: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
    return entities[char] || char;
  });
}

function tierColor(node: GalaxyNode, dimmed: boolean): string {
  if (dimmed) return "#182130";
  if (node.tier === "critical") return "#ef4562";
  if (node.tier === "high-risk") return "#f2a35c";
  return "#65a9fa";
}

const radiusCache = new Map<string, number>();
function nodeRadius(node: GalaxyNode): number {
  const cached = radiusCache.get(node.id);
  if (cached !== undefined) return cached;
  const scoreRadius = 1.15 + 3.6 * Math.sqrt(Math.max(node.score, 0) / 100);
  const r = scoreRadius * (0.82 + 0.18 * Math.log2(node.degree + 1));
  if (radiusCache.size > 20000) radiusCache.clear();
  radiusCache.set(node.id, r);
  return r;
}

function normalizeConstellation(nodes: GalaxyNode[], aspect: number): void {
  if (!nodes.length) return;

  const shaped = nodes.map((node) => {
    const x = Number(node.x) || 0;
    const y = (Number(node.y) || 0) / aspect;
    const z = Number(node.z) || 0;
    return { node, x, y, z, radius: Math.hypot(x, y, z) };
  });

  for (const axis of ["x", "y", "z"] as const) {
    const values = shaped.map((item) => item[axis]).sort((left, right) => left - right);
    const midpoint = values.length >> 1;
    const center = values.length % 2
      ? values[midpoint]
      : (values[midpoint - 1] + values[midpoint]) / 2;
    for (const item of shaped) item[axis] -= center;
  }

  for (const item of shaped) item.radius = Math.hypot(item.x, item.y, item.z);
  const order = shaped
    .map((item, index) => ({ index, radius: item.radius }))
    .sort((left, right) => left.radius - right.radius);
  const maxRadius = order.at(-1)?.radius ?? 0;
  if (!Number.isFinite(maxRadius) || maxRadius <= 0) return;

  for (const [rank, item] of order.entries()) {
    const source = shaped[item.index];
    const targetRadius = maxRadius * Math.sqrt((rank + 0.5) / order.length);
    const scale = source.radius > 0 ? targetRadius / source.radius : 0;
    source.node.x = source.x * scale;
    source.node.y = source.y * scale;
    source.node.z = source.z * scale;
  }
}

export default function MuleGalaxy() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const graphRef = useRef<GraphInstance | null>(null);
  const bloomRef = useRef<{ setSize: (width: number, height: number) => void; dispose?: () => void } | null>(null);
  const teardownRef = useRef<() => void>(() => {});
  const frameRef = useRef(0);
  const fpsRef = useRef({ last: 0, frames: 0 });
  const engineReadyRef = useRef(false);
  const highlightRef = useRef(new Set<string>());
  const visibleIdsRef = useRef(new Set<string>());
  const scrubCutoffRef = useRef<string | null>(null);
  const traceIdsRef = useRef<Set<string> | null>(null);
  const qualityRef = useRef({ pixelReduced: false, particlesDisabled: false });
  const stageRef = useRef<HTMLDivElement | null>(null);
  const fpsValueRef = useRef<HTMLSpanElement | null>(null);
  const panelOpenRef = useRef(false);
  const clusterFitPendingRef = useRef(false);

  const [snapshot, setSnapshot] = useState<GalaxySnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("all");
  const [activePatterns, setActivePatterns] = useState(new Set<string>());
  const [searchQuery, setSearchQuery] = useState("");
  const [bankQuery, setBankQuery] = useState("");
  const [scrubDay, setScrubDay] = useState<number | null>(null);
  const [traceOpen, setTraceOpen] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(-1);

  const bankNames = useMemo(
    () => [...new Set((snapshot?.nodes ?? []).map((node) => node.bank).filter(Boolean))].sort(),
    [snapshot]
  );

  const activeBank = useMemo(() => {
    const q = bankQuery.trim().toLowerCase();
    if (!q) return null;
    return bankNames.find((bank) => bank.toLowerCase() === q)
      ?? (q.length >= 3 ? bankNames.find((bank) => bank.toLowerCase().includes(q)) ?? null : null);
  }, [bankNames, bankQuery]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    async function load() {
      try {
        setError(null);
        let signal = controller.signal;
        try {
          if (typeof AbortSignal !== "undefined" && "any" in AbortSignal) {
            // @ts-ignore
            signal = AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]);
          }
        } catch {
          /* Fallback */
        }
        const response = await fetch("/api/graph/mule-galaxy", { signal });
        if (!response.ok) throw new Error(`Galaxy HTTP ${response.status}`);
        const data = await response.json() as GalaxySnapshot;
        if (!data || !Array.isArray(data.nodes) || !data.meta || typeof data.meta.nodes !== "number") {
          throw new Error("Malformed galaxy payload");
        }
        if (!cancelled) setSnapshot(data);
      } catch (caught) {
        const isAbort = caught instanceof DOMException && caught.name === "AbortError";
        const isTimeout = caught instanceof DOMException && caught.name === "TimeoutError";
        if (!cancelled && !isAbort) {
          setError(isTimeout
            ? "Galaxy request timed out"
            : caught instanceof Error ? caught.message : "Unable to load the network graph");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  const particleCutoff = useMemo(() => {
    const amounts = (snapshot?.links ?? []).map((link) => link.amount).sort((left, right) => right - left);
    return amounts[Math.min(299, amounts.length - 1)] ?? Number.POSITIVE_INFINITY;
  }, [snapshot]);

  const dayRange = useMemo(() => {
    const days = (snapshot?.links ?? [])
      .map((link) => link.firstDay)
      .filter((day): day is string => typeof day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(day))
      .sort();
    if (!days.length) return null;
    return { first: days[0], last: days[days.length - 1] };
  }, [snapshot]);

  const scrubCutoffDay = useMemo(() => {
    if (scrubDay === null || !dayRange) return null;
    const start = new Date(`${dayRange.first}T00:00:00Z`).getTime();
    const end = new Date(`${dayRange.last}T00:00:00Z`).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
    return new Date(start + ((end - start) * scrubDay) / 100).toISOString().slice(0, 10);
  }, [dayRange, scrubDay]);

  const patternCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const node of snapshot?.nodes ?? []) {
      for (const flag of node.flags) counts.set(flag, (counts.get(flag) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([pattern, count]) => ({ pattern, count }))
      .sort((left, right) => right.count - left.count);
  }, [snapshot]);

  const visibleIds = useMemo(() => {
    const visible = new Set<string>();
    for (const node of snapshot?.nodes ?? []) {
      const tierVisible =
        viewMode === "all"
          ? true
          : viewMode === "mules"
            ? node.isMule && node.riskLevel !== "medium"
            : node.riskLevel === "medium";
      const patternVisible = activePatterns.size === 0 || node.flags.some((flag) => activePatterns.has(flag));
      const bankVisible = !activeBank || node.bank === activeBank;
      if (tierVisible && patternVisible && bankVisible) visible.add(node.id);
    }
    return visible;
  }, [activeBank, activePatterns, snapshot, viewMode]);

  useEffect(() => {
    visibleIdsRef.current = visibleIds;
  }, [visibleIds]);

  const adjacency = useMemo(() => {
    const map = new Map<string, GalaxyApiLink[]>();
    for (const link of snapshot?.links ?? []) {
      for (const id of [link.source, link.target]) {
        if (!map.has(id)) map.set(id, []);
        map.get(id)?.push(link);
      }
    }
    return map;
  }, [snapshot]);

  const selectedNode = useMemo(
    () => snapshot?.nodes.find((node) => node.id === selectedNodeId) ?? null,
    [selectedNodeId, snapshot]
  );

  const tracePath = useMemo(() => {
    if (!selectedNodeId || !snapshot) return null;
    const cutoff = scrubCutoffDay;
    const maxDepth = 4;
    const queue: { id: string; depth: number }[] = [{ id: selectedNodeId, depth: 0 }];
    const seen = new Set<string>([selectedNodeId]);
    const order: string[] = [selectedNodeId];
    let head = 0;
    while (head < queue.length) {
      const current = queue[head++];
      if (current.depth >= maxDepth) continue;
      for (const link of adjacency.get(current.id) ?? []) {
        if (cutoff && link.firstDay && link.firstDay > cutoff) continue;
        for (const nextId of [link.source, link.target]) {
          if (seen.has(nextId) || !visibleIds.has(nextId)) continue;
          seen.add(nextId);
          order.push(nextId);
          queue.push({ id: nextId, depth: current.depth + 1 });
        }
      }
    }
    return order.length > 1 ? order : null;
  }, [adjacency, scrubCutoffDay, selectedNodeId, snapshot, visibleIds]);

  const traceSet = useMemo(
    () => (tracePath && traceOpen ? new Set(tracePath) : null),
    [traceOpen, tracePath]
  );

  const selectedFlows = useMemo(() => {
    const links = selectedNode ? adjacency.get(selectedNode.id) ?? [] : [];
    const sortLinks = (outgoing: boolean) => {
      const ranked = links
        .filter((link) => (outgoing ? link.source === selectedNode?.id : link.target === selectedNode?.id))
        .sort((left, right) => right.amount - left.amount);
      return { top: ranked.slice(0, 40), total: ranked.length };
    };
    return { outgoing: sortLinks(true), incoming: sortLinks(false) };
  }, [adjacency, selectedNode]);

  const closePanel = useCallback(() => {
    setPanelOpen(false);
    stageRef.current?.focus({ preventScroll: true });
  }, []);

  const applyCanvasSize = useCallback((fit: boolean) => {
    const graph = graphRef.current;
    const mount = mountRef.current;
    if (!graph || !mount) return;
    const rawWidth = mount.clientWidth;
    const nextHeight = mount.clientHeight;
    if (!rawWidth || !nextHeight) return;
    const panelWidth = panelOpenRef.current ? Math.min(PANEL_WIDTH, rawWidth) : 0;
    const nextWidth = Math.max(320, rawWidth - panelWidth);
    graph.width(nextWidth).height(nextHeight);
    bloomRef.current?.setSize(nextWidth, nextHeight);
    if (fit && engineReadyRef.current) graph.zoomToFit(0, 24, (node) => visibleIdsRef.current.has(node.id));
  }, []);

  useEffect(() => {
    panelOpenRef.current = panelOpen;
    if (!graphRef.current || !engineReadyRef.current) return;
    applyCanvasSize(true);
  }, [applyCanvasSize, panelOpen]);

  useEffect(() => {
    scrubCutoffRef.current = scrubCutoffDay;
    traceIdsRef.current = traceSet;
    const graph = graphRef.current;
    if (!graph || !snapshot) return;
    graph.nodeVisibility((node) => visibleIds.has(node.id));
    graph.linkVisibility((link) => {
      if (!visibleIds.has(nodeId(link.source)) || !visibleIds.has(nodeId(link.target))) return false;
      if (scrubCutoffDay && link.firstDay && link.firstDay > scrubCutoffDay) return false;
      return true;
    });
    if (traceSet) {
      graph.nodeColor((node) => tierColor(node, !traceSet.has(node.id)));
    } else {
      graph.nodeColor((node) => tierColor(node, highlightRef.current.size > 0 && !highlightRef.current.has(node.id)));
    }
    graph.refresh();
    if (clusterFitPendingRef.current && engineReadyRef.current) {
      clusterFitPendingRef.current = false;
      window.requestAnimationFrame(() => {
        if (graphRef.current === graph) graph.zoomToFit(750, 60, (node) => visibleIds.has(node.id));
      });
    } else if (engineReadyRef.current && traceSet) {
      graph.zoomToFit(700, 90, (node) => traceSet.has(node.id));
    }
  }, [snapshot, scrubCutoffDay, traceSet, visibleIds]);

  useEffect(() => {
    let disposed = false;
    const mount = mountRef.current;
    const checkedSnapshot = snapshot;
    if (!mount || !checkedSnapshot) return;
    const galaxySnapshot: GalaxySnapshot = checkedSnapshot;

    async function build() {
      if (!mount) return;
      try {
        const [graphModule, threeModule, bloomModule, outputModule] = await Promise.all([
          import("3d-force-graph"),
          import("three"),
          import("three/examples/jsm/postprocessing/UnrealBloomPass.js"),
          import("three/examples/jsm/postprocessing/OutputPass.js"),
        ]);
        if (disposed) return;

        const THREE = threeModule;
        const rawWidth = mount.clientWidth || 1200;
        const height = mount.clientHeight || 720;
        const panelWidth = panelOpenRef.current ? Math.min(PANEL_WIDTH, rawWidth) : 0;
        const width = Math.max(320, rawWidth - panelWidth);
        const graph = new graphModule.default(mount, {
          controlType: "orbit",
          rendererConfig: { alpha: true, antialias: false, powerPreference: "high-performance" },
        }) as unknown as GraphInstance;
        graphRef.current = graph;

        const renderer = graph.renderer() as { setPixelRatio?: (value: number) => void };
        const initialDpr = Math.min(window.devicePixelRatio || 1, 1.5);
        renderer.setPixelRatio?.(initialDpr);

        const bloomPass = new bloomModule.UnrealBloomPass(
          new THREE.Vector2(Math.max(320, Math.floor(width / 2)), Math.max(200, Math.floor(height / 2))),
          0.38,
          0.35,
          0.22
        );
        graph.postProcessingComposer().addPass(bloomPass);
        graph.postProcessingComposer().addPass(new outputModule.OutputPass());
        bloomRef.current = bloomPass;

        graph
          .width(width)
          .height(height)
          .backgroundColor("rgba(0,0,0,0)")
          .showNavInfo(false)
          .nodeRelSize(0.48)
          .nodeVal((node) => Math.pow(nodeRadius(node) / 0.48, 3))
          .nodeResolution(7)
          .nodeOpacity(0.94)
          .nodeColor((node) => tierColor(node, highlightRef.current.size > 0 && !highlightRef.current.has(node.id)))
          .nodeLabel((node) => `
            <div style="font:11px JetBrains Mono,monospace;padding:7px 9px;border-radius:6px;background:rgba(7,11,20,.95);border:1px solid rgba(125,180,255,.2);color:#f1f5f9;box-shadow:0 8px 24px rgba(0,0,0,.6)">
              <div style="font-weight:700;color:${tierColor(node, false)}">${escapeHtml(node.id)}</div>
              <div style="opacity:.75;margin-top:2px">${escapeHtml(node.bank)} | ${escapeHtml(node.city)} | Risk: ${node.score.toFixed(1)}%</div>
            </div>
          `)
          .linkColor((link) => (link.flagged ? "rgba(239,69,98,.32)" : "rgba(148,163,184,.15)"))
          .linkOpacity(0.24)
          .linkWidth((link) => (link.amount >= particleCutoff ? 0.28 : 0))
          .linkCurvature(0.07)
          .linkResolution(3)
          .linkLabel((link) => `${escapeHtml(nodeId(link.source))} → ${escapeHtml(nodeId(link.target))} | ${escapeHtml(formatCurrencyINR(link.amount))} | ${link.count} txn`)
          .linkDirectionalParticles((link) => {
            if (link.flagged) return link.amount >= particleCutoff ? 4 : 2;
            return link.amount >= particleCutoff ? 1 : 0;
          })
          .linkDirectionalParticleSpeed((link) => (link.amount >= particleCutoff ? 0.035 : 0.025))
          .linkDirectionalParticleWidth(1.2)
          .linkDirectionalParticleColor((link) => (link.flagged ? "#ef4562" : "#38bdf8"))
          .cooldownTicks(240)
          .cooldownTime(10_000)
          .warmupTicks(70)
          .enableNavigationControls(true)
          .enablePointerInteraction(true);

        const charge = graph.d3Force("charge");
        if (charge && "strength" in charge) (charge as unknown as { strength: (value: number) => unknown }).strength(-105);
        const linkForce = graph.d3Force("link");
        if (linkForce && "distance" in linkForce) (linkForce as unknown as { distance: (value: number) => unknown }).distance(34);

        graph.onNodeHover((node, previousNode) => {
          if (node?.id === previousNode?.id) return;
          hoverChanged(graph, node, adjacency, visibleIdsRef.current);
        });
        graph.onNodeClick((node) => {
          setSelectedNodeId(node.id);
          setTraceOpen(false);
          setPanelOpen(true);
        });
        graph.onBackgroundClick(() => {
          setSelectedNodeId(null);
          closePanel();
        });
        graph.onEngineStop(() => {
          if (engineReadyRef.current) return;
          engineReadyRef.current = true;

          const aspect = Math.min(2.75, Math.max(0.7, (width / height) * 1.18));
          normalizeConstellation(graph.graphData().nodes as GalaxyNode[], aspect);
          graph.refresh();

          window.setTimeout(() => {
            if (disposed) return;
            const layoutNodes = graph.graphData().nodes as GalaxyNode[];
            const screenApi = graph as GraphInstance & {
              graph2ScreenCoords?: (x: number, y: number, z: number) => { x: number; y: number };
            };

            if (!layoutNodes.length || typeof screenApi.graph2ScreenCoords !== "function") {
              graph.zoomToFit(900, 24);
              return;
            }

            const initialCamera = graph.cameraPosition();
            const initialDistance = Math.hypot(initialCamera.x, initialCamera.y, initialCamera.z) || 1;
            const targetExtentX = (width / 2) * (1 - 0.05 * 2);
            const targetExtentY = (height / 2) * (1 - 0.095 * 2);

            const projectionOverflow = (distance: number) => {
              const scale = distance / initialDistance;
              graph.cameraPosition(
                { x: initialCamera.x * scale, y: initialCamera.y * scale, z: initialCamera.z * scale },
                { x: 0, y: 0, z: 0 }
              );
              graph.renderer().render(graph.scene(), graph.camera());
              let extentX = 0;
              let extentY = 0;
              for (const node of layoutNodes) {
                if (typeof node.x !== "number" || typeof node.y !== "number" || typeof node.z !== "number") continue;
                const point = screenApi.graph2ScreenCoords?.(node.x, node.y, node.z);
                if (!point) continue;
                extentX = Math.max(extentX, Math.abs(point.x - width / 2));
                extentY = Math.max(extentY, Math.abs(point.y - height / 2));
              }
              return Math.max(extentX / targetExtentX, extentY / targetExtentY);
            };

            let low = initialDistance * 0.08;
            let high = Math.max(initialDistance, projectionOverflow(initialDistance) <= 1 ? initialDistance : initialDistance * 2);
            while (projectionOverflow(high) > 1) {
              low = high;
              high *= 2;
            }
            for (let iteration = 0; iteration < 18; iteration += 1) {
              const middle = (low + high) / 2;
              if (projectionOverflow(middle) > 1) low = middle;
              else high = middle;
            }

            graph.cameraPosition(
              {
                x: initialCamera.x * (high / initialDistance),
                y: initialCamera.y * (high / initialDistance),
                z: initialCamera.z * (high / initialDistance),
              },
              { x: 0, y: 0, z: 0 },
              850
            );
          }, 90);
        });

        radiusCache.clear();
        graph.graphData({
          nodes: galaxySnapshot.nodes.map((node) => ({ ...node })),
          links: galaxySnapshot.links.map((link) => ({ ...link })),
        });

        const controls = graph.controls() as Controls & {
          minDistance?: number;
          maxDistance?: number;
          zoomSpeed?: number;
          screenSpacePanning?: boolean;
        };
        controls.autoRotate = true;
        controls.autoRotateSpeed = 0.075;
        if ("minDistance" in controls) controls.minDistance = 0.5;
        if ("maxDistance" in controls) controls.maxDistance = 1e6;
        if ("zoomSpeed" in controls) controls.zoomSpeed = 1.6;

        const cameraObj = graph.camera() as { near?: number; far?: number; updateProjectionMatrix?: () => void };
        if (typeof cameraObj.near === "number") {
          cameraObj.near = 0.01;
          cameraObj.far = 2e6;
          cameraObj.updateProjectionMatrix?.();
        }

        const stopRotation = () => {
          controls.autoRotate = false;
        };
        let pointerActive = false;
        const markPointerDown = () => {
          pointerActive = true;
          stopRotation();
        };
        const markPointerUp = () => {
          pointerActive = false;
        };
        const introTimer = window.setTimeout(stopRotation, 7_000);
        mount.addEventListener("pointerdown", markPointerDown, { passive: true });
        mount.addEventListener("pointerup", markPointerUp, { passive: true });
        mount.addEventListener("pointercancel", markPointerUp, { passive: true });
        mount.addEventListener("wheel", stopRotation, { passive: true });

        let lastRawWidth = rawWidth;
        let lastHeight = height;
        const observer = new ResizeObserver(() => {
          const nextRawWidth = mount.clientWidth;
          const nextHeight = mount.clientHeight;
          if (!nextRawWidth || !nextHeight) return;
          if (nextRawWidth === lastRawWidth && nextHeight === lastHeight) return;
          lastRawWidth = nextRawWidth;
          lastHeight = nextHeight;
          if (pointerActive) return;
          applyCanvasSize(true);
        });
        observer.observe(mount);

        const handleVisibilityChange = () => {
          if (!document.hidden) fpsRef.current = { last: performance.now(), frames: 0 };
        };
        document.addEventListener("visibilitychange", handleVisibilityChange);

        fpsRef.current = { last: performance.now(), frames: 0 };
        const measureFps = () => {
          const now = performance.now();
          fpsRef.current.frames += 1;
          if (now - fpsRef.current.last >= 500) {
            const measured = (fpsRef.current.frames * 1000) / (now - fpsRef.current.last);
            if (fpsValueRef.current) fpsValueRef.current.textContent = measured.toFixed(1);

            if (engineReadyRef.current && !qualityRef.current.pixelReduced && measured < 42) {
              qualityRef.current.pixelReduced = true;
              renderer.setPixelRatio?.(Math.min(initialDpr, 1.15));
              bloomPass.strength = 0.28;
            } else if (
              engineReadyRef.current &&
              qualityRef.current.pixelReduced &&
              !qualityRef.current.particlesDisabled &&
              measured < 28
            ) {
              qualityRef.current.particlesDisabled = true;
              graph.linkDirectionalParticles(() => 0);
            }
            fpsRef.current.frames = 0;
            fpsRef.current.last = now;
          }
          frameRef.current = requestAnimationFrame(measureFps);
        };
        frameRef.current = requestAnimationFrame(measureFps);

        teardownRef.current = () => {
          window.clearTimeout(introTimer);
          observer.disconnect();
          document.removeEventListener("visibilitychange", handleVisibilityChange);
          mount.removeEventListener("pointerdown", markPointerDown);
          mount.removeEventListener("pointerup", markPointerUp);
          mount.removeEventListener("pointercancel", markPointerUp);
          mount.removeEventListener("wheel", stopRotation);
        };

        graph.nodeVisibility((node) => visibleIdsRef.current.has(node.id));
        graph.linkVisibility((link) => {
          if (!visibleIdsRef.current.has(nodeId(link.source)) || !visibleIdsRef.current.has(nodeId(link.target))) return false;
          const cutoff = scrubCutoffRef.current;
          if (cutoff && link.firstDay && link.firstDay > cutoff) return false;
          return true;
        });
        const pendingTrace = traceIdsRef.current;
        graph.nodeColor((node) =>
          pendingTrace
            ? tierColor(node, !pendingTrace.has(node.id))
            : tierColor(node, highlightRef.current.size > 0 && !highlightRef.current.has(node.id))
        );
        graph.refresh();
      } catch (caught) {
        console.error("Mule Galaxy failed to initialise", caught);
        if (!disposed) setError("WebGL could not start on this device");
      }
    }

    function hoverChanged(
      graph: GraphInstance,
      hovered: GalaxyNode | null,
      adjacencyMap: Map<string, GalaxyApiLink[]>,
      baseVisible: Set<string>
    ) {
      highlightRef.current = new Set<string>();
      if (hovered) {
        highlightRef.current.add(hovered.id);
        for (const link of adjacencyMap.get(hovered.id) ?? []) {
          highlightRef.current.add(link.source === hovered.id ? link.target : link.source);
        }
      }
      const traceIds = traceIdsRef.current;
      graph.nodeColor((node) =>
        traceIds
          ? tierColor(node, !traceIds.has(node.id))
          : tierColor(node, highlightRef.current.size > 0 && !highlightRef.current.has(node.id))
      );
      const cutoff = scrubCutoffRef.current;
      graph.linkVisibility((link) => {
        const source = nodeId(link.source);
        const target = nodeId(link.target);
        if (!baseVisible.has(source) || !baseVisible.has(target)) return false;
        if (cutoff && link.firstDay && link.firstDay > cutoff) return false;
        return highlightRef.current.size === 0 ||
          (highlightRef.current.has(source) && highlightRef.current.has(target));
      });
    }

    void build();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameRef.current);
      teardownRef.current();
      const graph = graphRef.current;
      if (graph) {
        graph.scene().traverse((object: unknown) => {
          const item = object as { geometry?: { dispose(): void }; material?: unknown };
          item.geometry?.dispose();
          if (Array.isArray(item.material)) item.material.forEach((material) => material.dispose());
          else if (item.material instanceof Object && "dispose" in item.material) {
            (item.material as { dispose(): void }).dispose();
          }
        });
        graph.postProcessingComposer().dispose?.();
        bloomRef.current?.dispose?.();
        graph._destructor();
        graphRef.current = null;
      }
      bloomRef.current = null;
      engineReadyRef.current = false;
      qualityRef.current = { pixelReduced: false, particlesDisabled: false };
    };
  }, [adjacency, applyCanvasSize, closePanel, particleCutoff, snapshot]);

  const searchSuggestions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (q.length < 2 || !snapshot) return [];
    const hits: { node: GalaxyNode; field: string }[] = [];
    for (const node of snapshot.nodes) {
      if (!visibleIds.has(node.id)) continue;
      if (node.id.toLowerCase().includes(q)) hits.push({ node, field: "ID" });
      else if (node.name.toLowerCase().includes(q)) hits.push({ node, field: "NAME" });
      else if (node.bank.toLowerCase().includes(q)) hits.push({ node, field: "BANK" });
      else if (node.city.toLowerCase().includes(q)) hits.push({ node, field: "CITY" });
      if (hits.length >= 8) break;
    }
    return hits;
  }, [searchQuery, snapshot, visibleIds]);

  const focusNode = useCallback((targetId: string) => {
    const graph = graphRef.current;
    if (!graph || !snapshot) return;
    const match = (graph.graphData().nodes as GalaxyNode[]).find((node) => node.id === targetId);
    if (!match || typeof match.x !== "number" || typeof match.y !== "number" || typeof match.z !== "number") return;
    const camera = graph.cameraPosition();
    const dx = camera.x - match.x;
    const dy = camera.y - match.y;
    const dz = camera.z - match.z;
    const length = Math.hypot(dx, dy, dz) || 1;
    graph.cameraPosition(
      { x: match.x + dx / length * 55, y: match.y + dy / length * 55, z: match.z + dz / length * 55 },
      { x: match.x, y: match.y, z: match.z },
      900
    );
    setSelectedNodeId(match.id);
    setTraceOpen(false);
    setPanelOpen(true);
  }, [snapshot]);

  const focusSearchResult = useCallback(() => {
    const query = searchQuery.trim().toLowerCase();
    const graph = graphRef.current;
    if (!query || !graph || !snapshot) return;

    const bankMatch = bankNames.find((bank) => bank.toLowerCase().includes(query));
    if (bankMatch) {
      setBankQuery(bankMatch);
      clusterFitPendingRef.current = true;
      return;
    }

    const nodes = graph.graphData().nodes as GalaxyNode[];
    const match = nodes.find((node) =>
      visibleIds.has(node.id) &&
      [node.id, node.name].some((value) => value.toLowerCase().includes(query))
    );
    if (!match) return;
    focusNode(match.id);
  }, [bankNames, focusNode, searchQuery, snapshot, visibleIds]);

  const zoomCamera = useCallback((factor: number) => {
    const graph = graphRef.current;
    if (!graph) return;
    const controls = graph.controls() as Controls;
    const target = controls.target ?? { x: 0, y: 0, z: 0 };
    const camera = graph.cameraPosition();
    let nextX = target.x + (camera.x - target.x) * factor;
    let nextY = target.y + (camera.y - target.y) * factor;
    let nextZ = target.z + (camera.z - target.z) * factor;
    const minDistance = typeof controls.minDistance === "number" ? controls.minDistance : 0;
    const maxDistance = typeof controls.maxDistance === "number" ? controls.maxDistance : Number.POSITIVE_INFINITY;
    const radius = Math.hypot(nextX - target.x, nextY - target.y, nextZ - target.z);
    if (radius > 0) {
      const correction = Math.min(Math.max(radius, minDistance), maxDistance) / radius;
      nextX = target.x + (nextX - target.x) * correction;
      nextY = target.y + (nextY - target.y) * correction;
      nextZ = target.z + (nextZ - target.z) * correction;
    }
    graph.cameraPosition({ x: nextX, y: nextY, z: nextZ }, target);
  }, []);

  const handleStageKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const step = event.shiftKey ? 0.16 : 0.06;
      switch (event.key) {
        case "+":
        case "=":
          zoomCamera(0.8);
          break;
        case "-":
        case "_":
          zoomCamera(1.25);
          break;
        case "ArrowLeft":
        case "ArrowRight":
        case "ArrowUp":
        case "ArrowDown": {
          const graph = graphRef.current;
          if (!graph) break;
          const controls = graph.controls() as Controls;
          const target = controls.target ?? { x: 0, y: 0, z: 0 };
          const camera = graph.cameraPosition();
          const offsetX = camera.x - target.x;
          const offsetY = camera.y - target.y;
          const offsetZ = camera.z - target.z;
          const distance = Math.hypot(offsetX, offsetY, offsetZ);
          if (!Number.isFinite(distance) || distance === 0) break;
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            const sign = event.key === "ArrowLeft" ? -1 : 1;
            const angle = sign * step;
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);
            graph.cameraPosition({
              x: target.x + (offsetX * cos - offsetZ * sin),
              y: target.y + offsetY,
              z: target.z + (offsetX * sin + offsetZ * cos),
            }, target);
          } else {
            const sign = event.key === "ArrowUp" ? 1 : -1;
            const radiusXZ = Math.hypot(offsetX, offsetZ);
            const elevation = Math.atan2(offsetY, radiusXZ);
            const nextElevation = Math.min(Math.max(elevation + sign * step, -1.45), 1.45);
            const nextY = distance * Math.sin(nextElevation);
            const nextRadiusXZ = distance * Math.cos(nextElevation);
            const scale = radiusXZ > 0 ? nextRadiusXZ / radiusXZ : 0;
            graph.cameraPosition({
              x: target.x + offsetX * scale,
              y: target.y + nextY,
              z: target.z + offsetZ * scale,
            }, target);
          }
          break;
        }
        case "Escape":
          setSelectedNodeId(null);
          closePanel();
          setSearchQuery("");
          setBankQuery("");
          break;
        default:
          return;
      }
      event.preventDefault();
    },
    [closePanel, zoomCamera]
  );

  const togglePattern = useCallback((pattern: string) => {
    setActivePatterns((current) => {
      const next = new Set(current);
      if (next.has(pattern)) next.delete(pattern);
      else next.add(pattern);
      return next;
    });
  }, []);

  const stats = [
    { label: "Nodes", value: snapshot?.meta.nodes.toLocaleString("en-IN") ?? "0" },
    { label: "Links", value: snapshot?.meta.links.toLocaleString("en-IN") ?? "0" },
    { label: "Active Mules", value: snapshot?.meta.mules.toLocaleString("en-IN") ?? "0" },
    { label: "Watchlist", value: snapshot?.meta.watchlistCount.toLocaleString("en-IN") ?? "0" },
    { label: "Flagged Volume", value: formatCurrencyINR(snapshot?.meta.flaggedVolume ?? 0) },
  ];

  if (error) {
    return (
      <div className="relative min-h-[640px] flex flex-col items-center justify-center bg-bg-card/50 border border-border/20 p-6 rounded-lg">
        <PageHeader title="Network Graph" subtitle="Topology-first risk graph | ML-flagged accounts" />
        <Card className="flex min-h-[400px] w-full max-w-lg flex-col items-center justify-center gap-4 bg-bg-card border border-border/30">
          <p className="font-mono text-sm text-fg-dim">{error}</p>
          <button onClick={() => window.location.reload()} className="rounded-sm border border-border px-3 py-1 font-mono text-xs text-fg hover:bg-accent/10">Retry</button>
        </Card>
      </div>
    );
  }

  if (loading || !snapshot) {
    return (
      <div className="relative min-h-[640px] flex flex-col items-center justify-center bg-bg-card/50 border border-border/20 p-6 rounded-lg">
        <PageHeader title="Network Graph" subtitle="Topology-first risk graph | ML-flagged accounts" />
        <Card className="flex min-h-[400px] w-full items-center justify-center bg-bg-card border border-border/30">
          <LoadingState message="Constructing the 3D topology-first risk graph..." />
        </Card>
      </div>
    );
  }

  if (snapshot.links.length === 0) {
    return (
      <div className="relative min-h-[640px] flex flex-col items-center justify-center bg-bg-card/50 border border-border/20 p-6 rounded-lg">
        <PageHeader title="Network Graph" subtitle="Topology-first risk graph | ML-flagged accounts" />
        <Card className="flex min-h-[400px] w-full items-center justify-center bg-bg-card border border-border/30">
          <EmptyState message="No transaction corridors" description="This dataset produced no account-to-account flows, so there is no topology to render." />
        </Card>
      </div>
    );
  }

  return (
    <div className="relative min-h-[640px] bg-bg">
      <PageHeader title="3D Forensic Galaxy" subtitle="Topology-first risk graph • Live ML Money-Flow Vectors • 3D Constellation" />

      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {/* View mode */}
        <div className="flex items-center gap-1 rounded-md border border-border/30 bg-bg-card px-2 py-1">
          {([["all", "ALL FLAGGED"], ["mules", "MULE ACCOUNTS"], ["highrisk", "WATCHLIST"]] as const).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setViewMode(value)}
              aria-pressed={viewMode === value}
              className={`rounded px-3 py-1 font-mono text-[11px] tracking-wider transition-all ${
                viewMode === value ? "bg-accent/20 text-accent border border-accent/40 font-semibold" : "text-fg-dim hover:text-fg"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative">
          <input
            aria-label="Search the network graph"
            role="combobox"
            aria-expanded={searchSuggestions.length > 0}
            aria-controls={searchSuggestions.length > 0 ? "galaxy-search-options" : undefined}
            aria-activedescendant={activeSuggestion >= 0 ? `galaxy-option-${activeSuggestion}` : undefined}
            aria-autocomplete="list"
            className="w-64 rounded-md border border-border/30 bg-bg-card px-3 py-1.5 font-mono text-[11px] text-fg outline-none placeholder:text-fg-dim/60 focus:border-accent/60"
            value={searchQuery}
            onChange={(event) => { setSearchQuery(event.target.value); setActiveSuggestion(-1); }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                const count = searchSuggestions.length;
                if (!count) return;
                const delta = event.key === "ArrowDown" ? 1 : -1;
                setActiveSuggestion((current) => {
                  const span = count + 1;
                  const offset = (((current + 1 + delta) % span) + span) % span;
                  return offset - 1;
                });
                return;
              }
              if (event.key === "Enter") {
                const pick = searchSuggestions[activeSuggestion >= 0 ? activeSuggestion : 0]?.node;
                if (pick) focusNode(pick.id);
                else focusSearchResult();
              }
              if (event.key === "Escape") setSearchQuery("");
            }}
            placeholder="Account / name / bank / city…"
          />
          {searchSuggestions.length > 0 && (
            <ul id="galaxy-search-options" role="listbox" aria-label="Matching accounts" className="absolute left-0 top-full z-20 mt-1 w-72 overflow-hidden rounded-md border border-border/40 bg-bg-card/95 backdrop-blur shadow-2xl">
              {searchSuggestions.map(({ node, field }, index) => (
                <li
                  key={node.id}
                  role="option"
                  id={`galaxy-option-${index}`}
                  aria-selected={index === activeSuggestion}
                  className={index === activeSuggestion ? "bg-accent/15" : undefined}
                >
                  <button
                    onClick={() => { setSearchQuery(""); setActiveSuggestion(-1); focusNode(node.id); }}
                    onMouseEnter={() => setActiveSuggestion(index)}
                    className="flex w-full items-center justify-between gap-2 border-b border-border/10 px-3 py-2 text-left last:border-b-0 hover:bg-accent/10"
                  >
                    <span className="truncate font-mono text-[11px] text-fg font-medium">{node.id}</span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="font-mono text-[10px] uppercase text-fg-dim">{field}</span>
                      <span className="rounded bg-accent/20 px-1.5 py-0.5 font-mono text-[10px] text-accent font-bold">{node.score.toFixed(0)}%</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Zoom controls */}
        <div className="ml-auto flex items-center gap-1 rounded-md border border-border/30 bg-bg-card px-2 py-1">
          <button onClick={() => zoomCamera(0.8)} aria-label="Zoom in" className="px-3 py-1 font-mono text-[12px] text-fg-dim hover:text-accent font-bold">+</button>
          <button onClick={() => zoomCamera(1.25)} aria-label="Zoom out" className="px-3 py-1 font-mono text-[12px] text-fg-dim hover:text-accent font-bold">-</button>
          <button onClick={() => graphRef.current?.zoomToFit(750, 24)} className="px-3 py-1 font-mono text-[11px] text-fg-dim hover:text-accent uppercase tracking-wider">RE-CENTER</button>
        </div>
      </div>

      {/* Bank chips */}
      {bankNames.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="font-mono text-[11px] uppercase tracking-wider text-fg-dim">Bank cluster</span>
          {activeBank && (
            <button
              onClick={() => setBankQuery("")}
              className="rounded-full border border-risk-critical/60 bg-risk-critical/15 px-3 py-1 font-mono text-[11px] uppercase text-risk-critical hover:bg-risk-critical/25"
            >
              Clear: {activeBank} ✕
            </button>
          )}
          {bankNames.filter((bank) => bank !== activeBank).map((bank) => (
            <button
              key={bank}
              onClick={() => setBankQuery(bank)}
              className="rounded-full border border-border/30 bg-bg-card px-3 py-1 font-mono text-[11px] uppercase text-fg-dim hover:text-fg hover:border-accent/40"
            >
              {bank}
            </button>
          ))}
        </div>
      )}

      {/* Timeline */}
      {dayRange && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-md border border-border/30 bg-bg-card px-4 py-2.5">
          <span className="font-mono text-[11px] uppercase tracking-wider text-fg-dim">Timeline Replay</span>
          <input
            aria-label="Replay corridor history"
            aria-valuetext={scrubCutoffDay ? `through ${scrubCutoffDay}` : "full history"}
            type="range"
            min={0}
            max={100}
            value={scrubDay ?? 100}
            onChange={(event) => {
              const value = Number(event.target.value);
              setScrubDay(value >= 100 ? null : value);
            }}
            className="h-1.5 w-72 cursor-pointer accent-accent"
          />
          <span className="font-mono text-[11px] text-fg font-medium">
            {scrubCutoffDay ? `through ${scrubCutoffDay}` : `${dayRange.first} → ${dayRange.last} (full)`}
          </span>
          {scrubDay !== null && (
            <button onClick={() => setScrubDay(null)} className="rounded border border-border/40 px-2 py-0.5 font-mono text-[10px] uppercase text-fg-dim hover:text-accent">
              Reset
            </button>
          )}
        </div>
      )}

      {/* Pattern chips */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="font-mono text-[11px] uppercase tracking-wider text-fg-dim">Pattern Typologies</span>
        {patternCounts.slice(0, 10).map(({ pattern, count }) => (
          <button
            key={pattern}
            onClick={() => togglePattern(pattern)}
            aria-pressed={activePatterns.has(pattern)}
            className={`rounded-full border px-3 py-1 font-mono text-[11px] uppercase tracking-wider transition-all ${
              activePatterns.has(pattern)
                ? "border-accent/70 bg-accent/20 text-accent font-semibold"
                : "border-border/30 bg-bg-card text-fg-dim hover:text-fg hover:border-border/60"
            }`}
          >
            {pattern.replaceAll("_", " ")} ({count.toLocaleString("en-IN")})
          </button>
        ))}
      </div>

      {/* Graph canvas */}
      <div
        ref={stageRef}
        className="relative w-full overflow-hidden rounded-xl border border-border/30 outline-none focus-visible:ring-1 focus-visible:ring-accent"
        style={{
          height: CANVAS_HEIGHT,
          background: "radial-gradient(circle at 50% 46%, rgba(13,21,39,.6) 0%, rgba(7,11,20,.98) 60%, rgba(5,8,16,1) 100%)",
        }}
        role="application"
        aria-label="Three-dimensional network graph of flagged accounts"
        tabIndex={0}
        onKeyDown={handleStageKeyDown}
      >
        <div ref={mountRef} className="absolute inset-0 touch-none" />

        {/* Ambient Overlay */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(40% 30% at 20% 20%, rgba(239,69,98,.06) 0%, transparent 70%), radial-gradient(45% 35% at 80% 75%, rgba(56,189,248,.07) 0%, transparent 75%)",
          }}
        />

        {/* Top-Left HUD */}
        <div className="pointer-events-none absolute left-4 top-4 rounded-lg border border-border/30 bg-bg-card/85 px-4 py-3 backdrop-blur shadow-xl">
          <p className="font-mono text-[10px] uppercase tracking-wider text-fg-dim">Topology Scope</p>
          <p className="font-display text-xl text-fg font-bold mt-0.5">{visibleIds.size.toLocaleString("en-IN")} <span className="text-xs font-mono font-normal text-fg-dim">vertices</span></p>
          <p className="font-mono text-[11px] text-accent mt-0.5">{activeBank ? `${activeBank} Cluster` : "Global Active Network"}</p>
        </div>

        {/* Bottom-Left Legend */}
        <div className="absolute bottom-4 left-4 rounded-lg border border-border/30 bg-bg-card/85 px-4 py-3 backdrop-blur shadow-xl">
          <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-fg-dim">Risk Tiers & Flow Vectors</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            {[
              ["Critical Mule", "#ef4562"],
              ["High-Risk Node", "#f2a35c"],
              ["Watchlist Node", "#65a9fa"],
              ["Context Flow", "#38bdf8"],
            ].map(([label, color]) => (
              <div key={label} className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
                <span className="font-mono text-[11px] text-fg-dim">{label}</span>
              </div>
            ))}
            <div className="flex items-center gap-2">
              <span className="h-[3px] w-4 rounded-full" style={{ backgroundColor: "rgba(239,69,98,.4)" }} />
              <span className="font-mono text-[11px] text-fg-dim">Flagged Corridor</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[13px] leading-none text-accent">&rarr;</span>
              <span className="font-mono text-[11px] text-fg-dim">Particle Stream</span>
            </div>
          </div>
        </div>

        {/* Side Detail Panel */}
        <div
          inert={!panelOpen ? true : undefined}
          className={`absolute right-0 top-0 h-full w-[400px] max-w-full overflow-y-auto border-l border-border/30 bg-bg-card/95 backdrop-blur-md transition-transform duration-300 shadow-2xl ${
            panelOpen ? "translate-x-0" : "translate-x-full"
          }`}
        >
          {!selectedNode ? (
            <div className="p-5">
              <div className="mb-4 flex items-center justify-between border-b border-border/20 pb-3">
                <p className="font-display text-sm tracking-wider uppercase font-semibold text-fg">Network Telemetry</p>
                <button onClick={closePanel} className="rounded p-1 font-mono text-[11px] text-fg-dim hover:text-fg">Close ✕</button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {stats.slice(0, 5).map((item) => (
                  <div key={item.label} className="rounded-lg border border-border/20 bg-bg-surface p-3">
                    <p className="font-mono text-[10px] uppercase text-fg-dim">{item.label}</p>
                    <p className="mt-1 font-mono text-sm text-fg font-semibold">{item.value}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="p-5">
              <div className="mb-4 flex items-center justify-between border-b border-border/20 pb-3">
                <div>
                  <p className="font-mono text-base font-bold text-fg">{selectedNode.id}</p>
                  <span className={`inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-mono uppercase font-semibold ${
                    selectedNode.tier === "critical"
                      ? "bg-risk-critical/20 text-risk-critical border border-risk-critical/40"
                      : selectedNode.tier === "high-risk"
                      ? "bg-risk-high/20 text-risk-high border border-risk-high/40"
                      : "bg-risk-medium/20 text-risk-medium border border-risk-medium/40"
                  }`}>
                    {selectedNode.tier.replace("-", " ")}
                  </span>
                </div>
                <button onClick={closePanel} className="rounded p-1 font-mono text-[11px] text-fg-dim hover:text-fg">Close ✕</button>
              </div>

              <div className="mb-5 grid grid-cols-2 gap-2.5">
                {[
                  ["Risk Score", `${selectedNode.score.toFixed(1)}%`],
                  ["Degree", selectedNode.degree.toLocaleString("en-IN")],
                  ["Bank", selectedNode.bank],
                  ["City", selectedNode.city],
                  ["Total In", formatCurrencyINR(selectedNode.volumeIn)],
                  ["Total Out", formatCurrencyINR(selectedNode.volumeOut)],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg border border-border/20 bg-bg-surface p-2.5">
                    <p className="font-mono text-[10px] uppercase text-fg-dim">{label}</p>
                    <p className="mt-1 font-mono text-xs text-fg font-semibold">{value}</p>
                  </div>
                ))}
              </div>

              {/* Follow the money action */}
              <div className="mb-4 flex items-center gap-2">
                <button
                  onClick={() => setTraceOpen((open) => !open)}
                  disabled={!tracePath}
                  className={`w-full rounded-md border py-2 font-mono text-[11px] uppercase tracking-wider font-semibold transition-all ${
                    tracePath
                      ? "border-risk-critical/60 bg-risk-critical/15 text-risk-critical hover:bg-risk-critical/25"
                      : "border-border/30 text-fg-dim opacity-50 cursor-not-allowed"
                  }`}
                >
                  {traceOpen ? "✕ Hide Money Trail" : "⚡ Follow The Money (Trace Layering)"}
                </button>
              </div>

              {tracePath && traceOpen && (
                <div className="mb-5 rounded-lg border border-risk-critical/40 bg-risk-critical/10 p-3">
                  <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-risk-critical font-bold">Layering Hop Sequence (BFS Depth ≤ 4)</p>
                  <ol className="max-h-48 space-y-1 overflow-y-auto">
                    {tracePath.map((id, index) => (
                      <li key={id}>
                        <button onClick={() => focusNode(id)} className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left hover:bg-risk-critical/20 transition-all">
                          <span className="w-5 shrink-0 font-mono text-[10px] font-bold text-risk-critical">{index === 0 ? "★" : `${index}.`}</span>
                          <span className="truncate font-mono text-[11px] text-fg font-medium">{id}</span>
                        </button>
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              <CardTitle>Pattern Flags</CardTitle>
              <div className="mb-5 flex flex-wrap gap-1.5">
                {selectedNode.flags.map((flag) => (
                  <span key={flag} className="rounded border border-border/30 bg-bg-surface px-2.5 py-1 font-mono text-[10px] uppercase text-fg-dim font-medium">
                    {flag.replaceAll("_", " ")}
                  </span>
                ))}
              </div>

              <CardTitle>Top Outgoing Flows</CardTitle>
              <div className="mb-5 space-y-2">
                {selectedFlows.outgoing.top.map((link) => (
                  <button
                    key={`out-${link.source}-${link.target}`}
                    onClick={() => { setSelectedNodeId(link.target); setTraceOpen(false); }}
                    className="w-full rounded-lg border border-border/20 bg-bg-surface p-2.5 text-left hover:border-accent/40 transition-all"
                  >
                    <div className="flex justify-between font-mono text-[10px] text-fg-dim">
                      <span className="text-fg font-medium">{link.target}</span>
                      <span>{link.count} txns</span>
                    </div>
                    <div className="mt-1 font-mono text-xs text-accent font-semibold">{formatCurrencyINR(link.amount)}</div>
                  </button>
                ))}
                {selectedFlows.outgoing.total === 0 && (
                  <p className="font-mono text-[11px] text-fg-dim">No direct outgoing links recorded.</p>
                )}
              </div>

              <CardTitle>Top Incoming Flows</CardTitle>
              <div className="space-y-2">
                {selectedFlows.incoming.top.map((link) => (
                  <button
                    key={`in-${link.source}-${link.target}`}
                    onClick={() => { setSelectedNodeId(link.source); setTraceOpen(false); }}
                    className="w-full rounded-lg border border-border/20 bg-bg-surface p-2.5 text-left hover:border-accent/40 transition-all"
                  >
                    <div className="flex justify-between font-mono text-[10px] text-fg-dim">
                      <span className="text-fg font-medium">{link.source}</span>
                      <span>{link.count} txns</span>
                    </div>
                    <div className="mt-1 font-mono text-xs text-risk-high font-semibold">{formatCurrencyINR(link.amount)}</div>
                  </button>
                ))}
                {selectedFlows.incoming.total === 0 && (
                  <p className="font-mono text-[11px] text-fg-dim">No direct incoming links recorded.</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom KPI Bar */}
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {stats.map((item) => (
          <Card key={item.label} className="bg-bg-card border border-border/30 p-3">
            <p className="font-mono text-[10px] uppercase tracking-wider text-fg-dim">{item.label}</p>
            <p className="mt-1 font-mono text-base text-fg font-semibold">{item.value}</p>
          </Card>
        ))}
        <Card className="bg-bg-card border border-border/30 p-3">
          <p className="font-mono text-[10px] uppercase tracking-wider text-fg-dim">Render FPS</p>
          <p className="mt-1 font-mono text-base text-accent font-bold"><span ref={fpsValueRef}>60.0</span></p>
        </Card>
      </div>
    </div>
  );
}
