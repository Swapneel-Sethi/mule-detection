"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import Card, { CardTitle } from "@/components/ui/Card";
import LoadingState from "@/components/ui/LoadingState";
import PageHeader from "@/components/ui/PageHeader";
import { formatCurrencyINR } from "@/lib/utils";
import type { ForceGraph3DInstance } from "3d-force-graph";

interface GalaxyNode {
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

interface GalaxyApiLink {
  source: string;
  target: string;
  amount: number;
  count: number;
  flagged: boolean;
  /** Earliest activity day (YYYY-MM-DD) across the corridor's transactions. */
  lastDay?: string;
}

interface GalaxyLink extends Omit<GalaxyApiLink, "source" | "target"> {
  source: string | GalaxyNode;
  target: string | GalaxyNode;
}

interface GalaxySnapshot {
  generatedAt: string;
  meta: {
    nodes: number;
    links: number;
    mules: number;
    highRisk: number;
    totalVolume: number;
    flaggedVolume: number;
  };
  nodes: GalaxyNode[];
  links: GalaxyApiLink[];
}

// Only the two parameters that matter operationally: confirmed mules and
// high-risk (potential) mules. The old "ALL" mode is gone — clean accounts
// are out of scope for this view.
type ViewMode = "all" | "mules" | "highrisk";
type GraphInstance = ForceGraph3DInstance<GalaxyNode, GalaxyLink>;
type Controls = { autoRotate?: boolean; autoRotateSpeed?: number };

const CANVAS_HEIGHT = "min(78vh, 880px)";

function nodeId(value: string | GalaxyNode): string {
  return typeof value === "string" ? value : value.id;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    const entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
    return entities[char as keyof typeof entities];
  });
}

function tierColor(node: GalaxyNode, dimmed: boolean): string {
  if (dimmed) return "#182130";
  if (node.tier === "critical") return "#ef4562";
  if (node.tier === "high-risk") return "#f2a35c";
  return "#65a9fa";
}

// PERF (graph loop iter-3): memoize radius per node id — nodeVal() is re-evaluated
// by force-graph on every simulation tick for every node; sqrt+log2 per call was
// measurable across ~8.5k nodes.
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

  // Force layouts can drift away from the origin. Center on the median before
  // reshaping so the camera can safely move closer without clipping one side.
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

  // Preserve each vertex's force-derived direction while flattening depth and
  // equalizing radial density. The topology stays readable; only the empty core
  // and sparse outskirts are corrected.
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
  const bloomRef = useRef<{ setSize: (width: number, height: number) => void } | null>(null);
  const teardownRef = useRef<() => void>(() => {});
  const frameRef = useRef(0);
  const fpsRef = useRef({ last: 0, frames: 0 });
  const engineReadyRef = useRef(false);
  const highlightRef = useRef(new Set<string>());
  const visibleIdsRef = useRef(new Set<string>());
  const qualityRef = useRef({ pixelReduced: false, particlesDisabled: false });

  const [snapshot, setSnapshot] = useState<GalaxySnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("all");
  const [activePatterns, setActivePatterns] = useState(new Set<string>());
  const [searchQuery, setSearchQuery] = useState("");
  const [bankQuery, setBankQuery] = useState("");
  // Time-scrubber: null = show full history. Day index maps onto the corridor
  // day-range so the slider works without knowing calendar specifics.
  const [scrubDay, setScrubDay] = useState<number | null>(null);
  // Path-trace panel toggle (the BFS itself lives in the `tracePath` memo).
  const [traceOpen, setTraceOpen] = useState(false);
  const bankNames = useMemo(
    () => [...new Set((snapshot?.nodes ?? []).map((node) => node.bank).filter(Boolean))].sort(),
    [snapshot]
  );
  // A bank query is "active" when it fully matches one known bank (case-insensitive).
  // While typing a partial name nothing is filtered — the suggestion chips guide the user.
  const activeBank = useMemo(() => {
    const q = bankQuery.trim().toLowerCase();
    if (!q) return null;
    return bankNames.find((bank) => bank.toLowerCase() === q)
      ?? (q.length >= 3 ? bankNames.find((bank) => bank.toLowerCase().includes(q)) ?? null : null);
  }, [bankNames, bankQuery]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [fps, setFps] = useState(60);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    async function load() {
      try {
        setError(null);
        const response = await fetch("/api/graph/mule-galaxy", { signal: controller.signal });
        if (!response.ok) throw new Error(`Galaxy HTTP ${response.status}`);
        const data = await response.json() as GalaxySnapshot;
        if (!cancelled) setSnapshot(data);
      } catch (caught) {
        if (!cancelled && !(caught instanceof DOMException && caught.name === "AbortError")) {
          setError(caught instanceof Error ? caught.message : "Unable to load the network graph");
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
      .map((link) => link.lastDay)
      .filter((day): day is string => Boolean(day))
      .sort();
    if (!days.length) return null;
    return { first: days[0], last: days[days.length - 1] };
  }, [snapshot]);

  const scrubCutoffDay = useMemo(() => {
    if (scrubDay === null || !dayRange) return null;
    const start = new Date(`${dayRange.first}T00:00:00Z`).getTime();
    const end = new Date(`${dayRange.last}T00:00:00Z`).getTime();
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
        viewMode === "all" ||
        viewMode === "mules"
          ? node.isMule && node.riskLevel !== "medium"
          : node.isMule && node.riskLevel === "medium";
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

  // Follow-the-money: BFS from the selected account through flagged-first
  // corridors (depth 4). Returns ids in discovery order; rendered as a numbered
  // layering chain in the panel and highlighted in the constellation.
  const tracePath = useMemo(() => {
    if (!selectedNodeId || !snapshot) return null;
    const maxDepth = 4;
    const queue: { id: string; depth: number }[] = [{ id: selectedNodeId, depth: 0 }];
    const seen = new Set<string>([selectedNodeId]);
    const order: string[] = [selectedNodeId];
    while (queue.length) {
      const current = queue.shift()!;
      if (current.depth >= maxDepth) continue;
      for (const link of adjacency.get(current.id) ?? []) {
        for (const nextId of [link.source, link.target]) {
          if (seen.has(nextId)) continue;
          seen.add(nextId);
          order.push(nextId);
          queue.push({ id: nextId, depth: current.depth + 1 });
        }
      }
    }
    return order.length > 1 ? order : null;
  }, [adjacency, selectedNodeId, snapshot]);



  const selectedFlows = useMemo(() => {
    const links = selectedNode ? adjacency.get(selectedNode.id) ?? [] : [];
    const sortLinks = (outgoing: boolean) => links
      .filter((link) => (outgoing ? link.source === selectedNode?.id : link.target === selectedNode?.id))
      .sort((left, right) => right.amount - left.amount)
      .slice(0, 40);
    return { outgoing: sortLinks(true), incoming: sortLinks(false) };
  }, [adjacency, selectedNode]);

  useEffect(() => {
    const graph = graphRef.current;
    if (!graph || !snapshot) return;
    graph.nodeVisibility((node) => visibleIds.has(node.id));
    graph.linkVisibility((link) => {
      if (!visibleIds.has(nodeId(link.source)) || !visibleIds.has(nodeId(link.target))) return false;
      // Scrubber: corridor appears once its first activity is on/before the cutoff.
      if (scrubCutoffDay && link.lastDay && link.lastDay > scrubCutoffDay) return false;
      return true;
    });
    // Trace mode dims everything outside the traced neighbourhood.
    if (tracePath && traceOpen) {
      const traceSet = new Set(tracePath);
      graph.nodeColor((node) => tierColor(node, !traceSet.has(node.id)));
    } else {
      graph.nodeColor((node) => tierColor(node, highlightRef.current.size > 0 && !highlightRef.current.has(node.id)));
    }
    graph.refresh();
    if (engineReadyRef.current && tracePath && traceOpen) graph.zoomToFit(700, 90);
  }, [snapshot, scrubCutoffDay, traceOpen, tracePath, visibleIds]);

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
        const width = mount.clientWidth || 1200;
        const height = mount.clientHeight || 720;
        const graph = new graphModule.default(mount, {
          controlType: "orbit",
          rendererConfig: { alpha: true, antialias: false, powerPreference: "high-performance" },
        }) as unknown as GraphInstance;
        graphRef.current = graph;

        // Bloom does the softening work, so we can keep MSAA off and cap the
        // fragment shader cost before the first frame is submitted.
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
          .nodeVal((node) => Math.pow(nodeRadius(node), 3) / 0.48)
          .nodeResolution(7)
          .nodeOpacity(0.94)
          .nodeColor((node) => tierColor(node, highlightRef.current.size > 0 && !highlightRef.current.has(node.id)))
          .nodeLabel((node) => `
            <div style="font:11px JetBrains Mono,monospace;padding:7px 9px;border-radius:6px;background:rgba(3,5,10,.92);border:1px solid rgba(125,180,255,.16);color:#e8f0ff">
              <div style="font-weight:700;color:${tierColor(node, false)}">${escapeHtml(node.id)}</div>
              <div style="opacity:.72;margin-top:2px">${escapeHtml(node.bank)} | ${escapeHtml(node.city)} | ${node.score.toFixed(1)}</div>
            </div>
          `)
          .linkColor((link) => (link.flagged ? "rgba(239,69,98,.26)" : "rgba(148,163,184,.15)"))
          .linkOpacity(0.24)
          .linkWidth((link) => (link.amount > 250_000 ? 0.28 : 0))
          .linkCurvature(0.07)
          .linkResolution(3)
          .linkLabel((link) => `${escapeHtml(nodeId(link.source))} -> ${escapeHtml(nodeId(link.target))} | ${escapeHtml(formatCurrencyINR(link.amount))} | ${link.count} txn`)
          // Flow direction made readable: flagged corridors stream red particles
          // (density by amount), top-value corridors keep the blue marker.
          .linkDirectionalParticles((link) => {
            if (link.flagged) return link.amount >= particleCutoff ? 4 : 2;
            return link.amount >= particleCutoff ? 1 : 0;
          })
          .linkDirectionalParticleSpeed((link) => (link.amount >= 250_000 ? 0.035 : 0.025))
          .linkDirectionalParticleWidth(1.2)
          .linkDirectionalParticleColor((link) => (link.flagged ? "#f87171" : "#93c5fd"))
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
          hoverChanged(graph, node, galaxySnapshot.links, visibleIdsRef.current);
        });
        graph.onNodeClick((node) => {
          setSelectedNodeId(node.id);
          setTraceOpen(false);
          setPanelOpen(true);
        });
        graph.onBackgroundClick(() => {
          setSelectedNodeId(null);
          setPanelOpen(false);
        });
        graph.onEngineStop(() => {
          if (engineReadyRef.current) return;
          engineReadyRef.current = true;

          // Stretch the learned bearing slightly toward the dashboard panel's
          // own aspect. The graph remains force-directed, but the projected
          // constellation can meet both horizontal edges instead of fitting a
          // circular silhouette inside a rectangle.
          const aspect = Math.min(2.75, Math.max(0.7, (width / height) * 1.18));
          normalizeConstellation(graph.graphData().nodes as GalaxyNode[], aspect);
          graph.refresh();

          // Link meshes consume their new vertex positions on the next render
          // tick. Fitting immediately would measure the pre-reshape bounding
          // box and leave the reshaped galaxy stranded at the centre.
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

            // zoomToFit includes conservative curved-link envelopes, which can
            // leave the node cloud stranded in a small rectangle. Binary-search
            // the actual projected vertex envelope instead, then animate to it.
            const initialCamera = graph.cameraPosition();
            const initialDistance = Math.hypot(initialCamera.x, initialCamera.y, initialCamera.z) || 1;
            // Curved links bow outside their endpoint envelope, while the wide
            // panel needs a tighter horizontal budget than the vertical axis.
            const targetExtentX = (width / 2) * (1 - 0.05 * 2);
            const targetExtentY = (height / 2) * (1 - 0.095 * 2);

            const projectionOverflow = (distance: number) => {
              const scale = distance / initialDistance;
              graph.cameraPosition(
                { x: initialCamera.x * scale, y: initialCamera.y * scale, z: initialCamera.z * scale },
                { x: 0, y: 0, z: 0 }
              );
              // graph2ScreenCoords reads the camera's GPU matrices, so flush a
              // frame after each probe instead of projecting stale transforms.
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
        // Unlimited zoom in both directions: the user must be able to dive from
        // the full constellation down to individual account neighbourhoods.
        if ("minDistance" in controls) controls.minDistance = 0.5;
        if ("maxDistance" in controls) controls.maxDistance = 1e9;
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
        const introTimer = window.setTimeout(stopRotation, 7_000);
        mount.addEventListener("pointerdown", stopRotation, { passive: true });
        mount.addEventListener("wheel", stopRotation, { passive: true });

        const observer = new ResizeObserver(() => {
          const nextWidth = mount.clientWidth;
          const nextHeight = mount.clientHeight;
          if (!nextWidth || !nextHeight) return;
          graph.width(nextWidth).height(nextHeight);
          bloomPass.setSize(nextWidth, nextHeight);
          if (engineReadyRef.current) graph.zoomToFit(0, 24);
        });
        observer.observe(mount);

        fpsRef.current = { last: performance.now(), frames: 0 };
        const measureFps = () => {
          const now = performance.now();
          fpsRef.current.frames += 1;
          if (now - fpsRef.current.last >= 500) {
            const measured = (fpsRef.current.frames * 1000) / (now - fpsRef.current.last);
            setFps(measured);

            // Adaptive quality only after physics has frozen, so this never
            // changes layout. The levers are ordered by visual impact.
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
          mount.removeEventListener("pointerdown", stopRotation);
          mount.removeEventListener("wheel", stopRotation);
        };
      } catch (caught) {
        console.error("Mule Galaxy failed to initialise", caught);
        if (!disposed) setError("WebGL could not start on this device");
      }
    }

    function hoverChanged(
      graph: GraphInstance,
      hovered: GalaxyNode | null,
      links: GalaxyApiLink[],
      baseVisible: Set<string>
    ) {
      highlightRef.current = new Set<string>();
      if (hovered) {
        highlightRef.current.add(hovered.id);
        for (const link of links) {
          if (link.source === hovered.id) highlightRef.current.add(link.target);
          if (link.target === hovered.id) highlightRef.current.add(link.source);
        }
      }
      graph.nodeColor((node) => tierColor(node, highlightRef.current.size > 0 && !highlightRef.current.has(node.id)));
      graph.linkVisibility((link) => {
        const source = nodeId(link.source);
        const target = nodeId(link.target);
        if (!baseVisible.has(source) || !baseVisible.has(target)) return false;
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
        graph._destructor();
        graphRef.current = null;
      }
      bloomRef.current = null;
      engineReadyRef.current = false;
    };
  }, [particleCutoff, snapshot]);

  // Live type-ahead across id / name / bank / city of visible accounts.
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

    // Bank queries become a CLUSTER view: only that bank's accounts stay visible,
    // then the camera frames the whole cluster so its structure is readable.
    const bankMatch = bankNames.find((bank) => bank.toLowerCase().includes(query));
    if (bankMatch) {
      setBankQuery(bankMatch);
      // visibility effect below re-filters + zooms to the surviving cluster.
      window.setTimeout(() => {
        const g = graphRef.current;
        if (g && engineReadyRef.current) g.zoomToFit(750, 60);
      }, 120);
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
    const camera = graph.cameraPosition();
    graph.cameraPosition({ x: camera.x * factor, y: camera.y * factor, z: camera.z * factor });
  }, []);

  // Keyboard navigation orbits the camera about the look-at target (origin):
  // left/right change azimuth, up/down change elevation. Shift multiplies the
  // step, mirroring the shift-accelerated pan on the 2D views.
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
          const camera = graph.cameraPosition();
          const distance = Math.hypot(camera.x, camera.y, camera.z);
          if (!Number.isFinite(distance) || distance === 0) break;
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            const sign = event.key === "ArrowLeft" ? -1 : 1;
            const angle = sign * step;
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);
            graph.cameraPosition({
              x: camera.x * cos - camera.z * sin,
              y: camera.y,
              z: camera.x * sin + camera.z * cos,
            });
          } else {
            const sign = event.key === "ArrowUp" ? 1 : -1;
            const radius = Math.hypot(camera.x, camera.z);
            const elevation = Math.atan2(camera.y, radius);
            const nextElevation = Math.min(Math.max(elevation + sign * step, -1.45), 1.45);
            const nextY = distance * Math.sin(nextElevation);
            const nextRadius = distance * Math.cos(nextElevation);
            const scale = radius > 0 ? nextRadius / radius : 0;
            graph.cameraPosition({ x: camera.x * scale, y: nextY, z: camera.z * scale });
          }
          break;
        }
        case "Escape":
          setSelectedNodeId(null);
          setPanelOpen(false);
          setSearchQuery("");
          setBankQuery("");
          break;
        default:
          return;
      }
      event.preventDefault();
    },
    [zoomCamera]
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
    { label: "Watchlist", value: snapshot?.meta.highRisk.toLocaleString("en-IN") ?? "0" },
    { label: "Flagged Volume", value: formatCurrencyINR(snapshot?.meta.flaggedVolume ?? 0) },
    { label: "FPS", value: fps.toFixed(1) },
  ];

  if (error) {
    return (
      <div>
        <PageHeader title="Network Graph" subtitle="Topology-first risk graph | ML-flagged accounts" />
        <Card className="flex min-h-[640px] flex-col items-center justify-center gap-4">
          <p className="font-mono text-sm text-red-300">{error}</p>
          <button onClick={() => window.location.reload()} className="rounded-sm border border-frost/15 px-3 py-1 font-mono text-xs text-bone">Retry</button>
        </Card>
      </div>
    );
  }

  if (loading || !snapshot) {
    return (
      <div>
        <PageHeader title="Network Graph" subtitle="Topology-first risk graph | ML-flagged accounts" />
        <Card className="flex min-h-[640px] items-center justify-center"><LoadingState message="Constructing the topology-first risk graph..." /></Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Network Graph" subtitle="Topology-first risk graph | ML-flagged accounts | live money-flow vectors" />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-sm border border-frost/10 bg-surface-1 p-1">
          {([["all", "ALL FLAGGED"], ["mules", "MULE ACCOUNTS"], ["highrisk", "WATCHLIST"]] as const).map(([value, label]) => (
            <button key={value} onClick={() => setViewMode(value)} className={`rounded-[2px] px-3 py-1 font-mono text-[10px] ${viewMode === value ? "bg-frost text-void" : "text-ash hover:text-bone"}`}>{label}</button>
          ))}
        </div>
        <div className="relative">
          <input
            aria-label="Search the network graph"
            className="w-64 rounded-sm border border-frost/10 bg-surface-1 px-3 py-1.5 bg-transparent font-mono text-[10px] text-bone outline-none placeholder:text-ash/70"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                const first = searchSuggestions[0]?.node;
                if (first && !bankNames.some((b) => b.toLowerCase().includes(searchQuery.trim().toLowerCase()))) focusNode(first.id);
                else focusSearchResult();
              }
              if (event.key === "Escape") setSearchQuery("");
            }}
            placeholder="Account / name / bank / city…"
          />
          {searchSuggestions.length > 0 && (
            <div className="absolute left-0 top-full z-20 mt-1 w-72 rounded-sm border border-frost/15 bg-void/97 shadow-xl backdrop-blur">
              {searchSuggestions.map(({ node, field }) => (
                <button
                  key={node.id}
                  onClick={() => { setSearchQuery(""); focusNode(node.id); }}
                  className="flex w-full items-center justify-between gap-2 border-b border-frost/5 px-3 py-1.5 text-left last:border-b-0 hover:bg-surface-2"
                >
                  <span className="truncate font-mono text-[10px] text-bone">{node.id}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="font-mono text-[9px] uppercase text-ash">{field}</span>
                    <span className="rounded-sm bg-surface-2 px-1 font-mono text-[9px] text-ash">{node.score.toFixed(0)}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="ml-auto flex items-center gap-1 rounded-sm border border-frost/10 bg-surface-1 p-1">
          <button onClick={() => zoomCamera(0.8)} className="px-3 py-1 font-mono text-[10px] text-ash">+</button>
        <button onClick={() => zoomCamera(1.25)} className="px-3 py-1 font-mono text-[10px] text-ash">-</button>
          <button onClick={() => graphRef.current?.zoomToFit(750, 24)} className="px-3 py-1 font-mono text-[10px] text-ash">RE-CENTER</button>
        </div>
      </div>

      {bankNames.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="font-mono text-[11px] uppercase text-ash">Bank cluster</span>
          {activeBank && (
            <button
              onClick={() => setBankQuery("")}
              className="rounded-full border border-risk-critical/50 bg-risk-critical/10 px-2 py-1 font-mono text-[11px] uppercase text-risk-critical"
            >
              Clear: {activeBank} ✕
            </button>
          )}
          {bankNames.filter((bank) => bank !== activeBank).map((bank) => (
            <button
              key={bank}
              onClick={() => setBankQuery(bank)}
              className="rounded-full border border-frost/10 bg-surface-1 px-2 py-1 font-mono text-[11px] uppercase text-ash hover:text-bone"
            >
              {bank}
            </button>
          ))}
        </div>
      )}

      {dayRange && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-sm border border-frost/10 bg-surface-1 px-3 py-2">
          <span className="font-mono text-[11px] uppercase text-ash">Timeline</span>
          <input
            aria-label="Replay corridor history"
            type="range"
            min={0}
            max={100}
            value={scrubDay ?? 100}
            onChange={(event) => {
              const value = Number(event.target.value);
              setScrubDay(value >= 100 ? null : value);
            }}
            className="h-1 w-72 cursor-pointer accent-[#ef4562]"
          />
          <span className="font-mono text-[10px] text-bone">
            {scrubCutoffDay ? `through ${scrubCutoffDay}` : `${dayRange.first} → ${dayRange.last} (full)`}
          </span>
          {scrubDay !== null && (
            <button onClick={() => setScrubDay(null)} className="rounded-sm border border-frost/15 px-2 py-0.5 font-mono text-[10px] uppercase text-ash hover:text-bone">
              Reset
            </button>
          )}
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="font-mono text-[11px] uppercase text-ash">Patterns</span>
        {patternCounts.slice(0, 12).map(({ pattern, count }) => (
          <button key={pattern} onClick={() => togglePattern(pattern)} className={`rounded-full border px-2 py-1 font-mono text-[11px] uppercase ${activePatterns.has(pattern) ? "border-risk-low/50 bg-risk-low/10 text-risk-low" : "border-frost/10 bg-surface-1 text-ash"}`}>
            {pattern.replaceAll("_", " ")} | {count.toLocaleString("en-IN")}
          </button>
        ))}
      </div>

      <p className="mb-2 font-mono text-[10px] text-ash/70">
        Controls: drag rotates · wheel zooms (deep zoom supported) · search suggests accounts live — Enter flies to it;
        type a bank to isolate its cluster · select an account and press &ldquo;Follow the money&rdquo; to trace its layering chain ·
        scrub the Timeline to replay corridor history · Keys (after Tab): arrows orbit, +/− zoom, Esc clears filters
      </p>

      <div
        className="relative w-full overflow-hidden rounded-lg border border-frost/10 outline-none focus-visible:ring-1 focus-visible:ring-frost/40"
        style={{ height: CANVAS_HEIGHT, background: "radial-gradient(circle at 50% 46%, rgba(30,47,78,.34) 0%, rgba(7,11,20,.96) 52%, #020409 100%)" }}
        role="img"
        aria-label="Three-dimensional network graph of flagged accounts. Keyboard: arrow keys orbit, shift+arrows orbit faster, plus/minus zoom, escape clears selection and search."
        tabIndex={0}
        onKeyDown={handleStageKeyDown}
      >
        <div ref={mountRef} className="absolute inset-0 touch-none" />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 animate-pulse"
          style={{
            background:
              "radial-gradient(38% 26% at 22% 24%, rgba(255,45,85,.10) 0%, transparent 68%), radial-gradient(46% 30% at 76% 70%, rgba(88,196,255,.11) 0%, transparent 72%), radial-gradient(70% 58% at 50% 48%, transparent 52%, rgba(0,0,0,.72) 100%)",
          }}
        />
        <div className="pointer-events-none absolute left-4 top-4 rounded-md border border-white/5 bg-black/70 px-3 py-2 backdrop-blur">
          <p className="font-mono text-[11px] uppercase text-ash">Visible Topology</p>
          <p className="font-display text-lg text-bone">{visibleIds.size.toLocaleString("en-IN")}</p>
          <p className="font-mono text-[11px] text-ash">{activeBank ? `${activeBank} cluster` : "vertices in current view"}</p>
        </div>

        <div className="absolute bottom-4 left-4 rounded-md border border-white/5 bg-black/70 px-4 py-3 backdrop-blur">
          <p className="mb-2 font-mono text-[11px] uppercase text-ash">Legend</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            {[["Critical mule", "#ef4562"], ["High-risk mule", "#f2a35c"], ["Watchlist account", "#65a9fa"], ["Flagged corridor", "#f87171"], ["Context flow", "#93c5fd"]].map(([label, color]) => (
              <div key={label} className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                <span className="font-mono text-[11px] uppercase text-ash">{label}</span>
              </div>
            ))}
            <div className="flex items-center gap-2">
              <span className="font-mono text-[13px] leading-none text-sky-300">&rarr;</span>
              <span className="font-mono text-[11px] uppercase text-ash">Flow direction</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-[3px] w-4 rounded-full bg-slate-300" />
              <span className="font-mono text-[11px] uppercase text-ash">High-value flow</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full border border-white/20" style={{ backgroundColor: "#182130" }} />
              <span className="font-mono text-[11px] uppercase text-ash">Out-of-focus node</span>
            </div>
          </div>
        </div>

        <div className={`absolute right-0 top-0 h-full w-[400px] max-w-full overflow-y-auto border-l border-frost/10 bg-void/95 backdrop-blur transition-transform duration-300 ${panelOpen ? "translate-x-0" : "translate-x-full"}`}>
          {!selectedNode ? (
            <div className="p-5">
              <div className="mb-4 flex justify-between"><div><p className="font-display text-base text-bone">NETWORK SUMMARY</p></div><button onClick={() => setPanelOpen(false)} className="font-mono text-[10px] text-ash">Close</button></div>
              <div className="grid grid-cols-2 gap-3">
                {stats.slice(0, 5).map((item) => (
                  <div key={item.label} className="rounded-lg border border-frost/10 p-3"><p className="font-mono text-[11px] uppercase text-ash">{item.label}</p><p className="mt-2 font-mono text-sm text-bone">{item.value}</p></div>
                ))}
              </div>
            </div>
          ) : (
            <div className="p-5">
              <div className="mb-4 flex justify-between"><div><p className="font-display text-base text-bone">{selectedNode.id}</p><p className="mt-1 font-mono text-[10px] uppercase text-ash">{selectedNode.tier.replace("-", " ")}</p></div><button onClick={() => setPanelOpen(false)} className="font-mono text-[10px] text-ash">Close</button></div>
              <div className="mb-5 grid grid-cols-2 gap-3">
                {[["Score", `${selectedNode.score.toFixed(1)}%`], ["Degree", selectedNode.degree.toLocaleString("en-IN")], ["Bank", selectedNode.bank], ["City", selectedNode.city], ["Volume In", formatCurrencyINR(selectedNode.volumeIn)], ["Volume Out", formatCurrencyINR(selectedNode.volumeOut)]].map(([label, value]) => (
                  <div key={label} className="rounded-lg border border-frost/10 p-3"><p className="font-mono text-[11px] uppercase text-ash">{label}</p><p className="mt-2 truncate font-mono text-sm text-bone">{value}</p></div>
                ))}
              </div>
              <div className="mb-4 flex items-center gap-2">
                <button
                  onClick={() => setTraceOpen((open) => !open)}
                  className={`rounded-sm border px-3 py-1.5 font-mono text-[10px] uppercase ${tracePath ? "border-risk-critical/60 bg-risk-critical/10 text-risk-critical" : "border-frost/15 text-ash hover:text-bone"}`}
                >
                  {traceOpen ? "Hide money trail" : "Follow the money"}
                </button>
                {tracePath && <span className="font-mono text-[10px] text-ash">{tracePath.length} accounts traced</span>}
              </div>
              {tracePath && traceOpen && (
                <div className="mb-5 rounded-sm border border-frost/10 bg-surface-1 p-3">
                  <p className="mb-2 font-mono text-[10px] uppercase text-ash">Layering chain (BFS depth ≤ 4)</p>
                  <ol className="max-h-44 space-y-1 overflow-y-auto">
                    {tracePath.map((id, index) => (
                      <li key={id}>
                        <button onClick={() => focusNode(id)} className="flex w-full items-center gap-2 text-left hover:text-bone">
                          <span className="w-6 shrink-0 font-mono text-[9px] text-risk-critical">{index === 0 ? "◉" : `${index}.`}</span>
                          <span className="truncate font-mono text-[10px] text-bone">{id}</span>
                        </button>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
              <CardTitle>Pattern Flags</CardTitle>
              <div className="mb-5 flex flex-wrap gap-2">
                {selectedNode.flags.map((flag) => <span key={flag} className="rounded-full border border-frost/10 bg-surface-1 px-2 py-1 font-mono text-[11px] uppercase text-ash">{flag.replaceAll("_", " ")}</span>)}
              </div>
              <CardTitle>Outgoing Flows</CardTitle>
              <div className="mb-5 space-y-2">
                {selectedFlows.outgoing.map((link) => (
                  <button key={`out-${link.source}-${link.target}`} onClick={() => { setSelectedNodeId(link.target); setTraceOpen(false); }} className="w-full rounded-lg border border-frost/10 p-3 text-left">
                    <div className="flex justify-between font-mono text-[10px] text-ash"><span>{link.target}</span><span>{link.count}×</span></div>
                    <div className="mt-1 font-mono text-xs text-bone">{formatCurrencyINR(link.amount)}</div>
                  </button>
                ))}
              </div>
              <CardTitle>Incoming Flows</CardTitle>
              <div className="space-y-2">
                {selectedFlows.incoming.map((link) => (
                  <button key={`in-${link.source}-${link.target}`} onClick={() => { setSelectedNodeId(link.source); setTraceOpen(false); }} className="w-full rounded-lg border border-frost/10 p-3 text-left">
                    <div className="flex justify-between font-mono text-[10px] text-ash"><span>{link.source}</span><span>{link.count}×</span></div>
                    <div className="mt-1 font-mono text-xs text-bone">{formatCurrencyINR(link.amount)}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {stats.map((item) => (
          <Card key={item.label}>
            <p className="mb-2 font-mono text-[11px] uppercase text-ash">{item.label}</p>
            <p className="font-mono text-sm text-bone">{item.value}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
