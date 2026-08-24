"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  if (node.tier === "critical") return "#ff2d55";
  if (node.tier === "high-risk") return "#ff9c42";
  return "#58c4ff";
}

function nodeRadius(node: GalaxyNode): number {
  const scoreRadius = 1.15 + 3.6 * Math.sqrt(Math.max(node.score, 0) / 100);
  return scoreRadius * (0.82 + 0.18 * Math.log2(node.degree + 1));
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

  const [snapshot, setSnapshot] = useState<GalaxySnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("all");
  const [activePatterns, setActivePatterns] = useState(new Set<string>());
  const [searchQuery, setSearchQuery] = useState("");
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
          setError(caught instanceof Error ? caught.message : "Unable to load the risk galaxy");
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
        (viewMode === "mules" && node.isMule && node.riskLevel !== "medium") ||
        (viewMode === "highrisk" && node.isMule && node.riskLevel === "medium");
      const patternVisible = activePatterns.size === 0 || node.flags.some((flag) => activePatterns.has(flag));
      if (tierVisible && patternVisible) visible.add(node.id);
    }
    return visible;
  }, [activePatterns, snapshot, viewMode]);

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
    graph.linkVisibility((link) => visibleIds.has(nodeId(link.source)) && visibleIds.has(nodeId(link.target)));
    graph.refresh();
    if (engineReadyRef.current) graph.zoomToFit(650, 28);
  }, [snapshot, visibleIds]);

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

        const bloomPass = new bloomModule.UnrealBloomPass(new THREE.Vector2(width, height), 0.88, 0.58, 0.1);
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
              <div style="opacity:.72;margin-top:2px">${escapeHtml(node.bank)} · ${escapeHtml(node.city)} · ${node.score.toFixed(1)}</div>
            </div>
          `)
          .linkColor((link) => (link.flagged ? "rgba(255,45,85,.42)" : "rgba(125,180,255,.22)"))
          .linkOpacity(0.2)
          .linkWidth((link) => (link.amount > 150_000 ? 0.38 : 0))
          .linkCurvature(0.25)
          .linkResolution(4)
          .linkLabel((link) => `${escapeHtml(nodeId(link.source))} → ${escapeHtml(nodeId(link.target))} · ${escapeHtml(formatCurrencyINR(link.amount))} · ${link.count} txn`)
          .linkDirectionalParticles((link) => (link.amount >= 50_000 ? 1 : 0))
          .linkDirectionalParticleSpeed((link) => (link.amount >= 250_000 ? 0.055 : 0.03))
          .linkDirectionalParticleWidth(1.5)
          .linkDirectionalParticleColor((link) => (link.flagged ? "#ff5f7a" : "#9ad2ff"))
          .cooldownTicks(240)
          .cooldownTime(10_000)
          .warmupTicks(70)
          .enableNavigationControls(true)
          .enablePointerInteraction(true);

        const charge = graph.d3Force("charge");
        if (charge && "strength" in charge) (charge as unknown as { strength: (value: number) => unknown }).strength(-120);
        const linkForce = graph.d3Force("link");
        if (linkForce && "distance" in linkForce) (linkForce as unknown as { distance: (value: number) => unknown }).distance(30);

        graph.onNodeHover((node, previousNode) => {
          if (node?.id === previousNode?.id) return;
          hoverChanged(graph, node, galaxySnapshot.links, visibleIdsRef.current);
        });
        graph.onNodeClick((node) => {
          setSelectedNodeId(node.id);
          setPanelOpen(true);
        });
        graph.onBackgroundClick(() => {
          setSelectedNodeId(null);
          setPanelOpen(false);
        });
        graph.onEngineStop(() => {
          if (engineReadyRef.current) return;
          engineReadyRef.current = true;
          graph.zoomToFit(900, 24);
        });

        const starGeometry = new THREE.BufferGeometry();
        const positions = new Float32Array(3500 * 3);
        for (let index = 0; index < positions.length; index += 3) {
          const radius = 700 + Math.random() * 900;
          const theta = Math.random() * Math.PI * 2;
          const phi = Math.acos(2 * Math.random() - 1);
          positions[index] = radius * Math.sin(phi) * Math.cos(theta);
          positions[index + 1] = radius * Math.cos(phi);
          positions[index + 2] = radius * Math.sin(phi) * Math.sin(theta);
        }
        starGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        const stars = new THREE.Points(
          starGeometry,
          new THREE.PointsMaterial({ color: 0x8ea2ff, size: 1.5, sizeAttenuation: false, transparent: true, opacity: 0.5 })
        );
        graph.scene().add(stars);

        graph.graphData({
          nodes: galaxySnapshot.nodes.map((node) => ({ ...node })),
          links: galaxySnapshot.links.map((link) => ({ ...link })),
        });

        const controls = graph.controls() as Controls;
        controls.autoRotate = true;
        controls.autoRotateSpeed = 0.35;
        const stopRotation = () => {
          controls.autoRotate = false;
        };
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
            setFps((fpsRef.current.frames * 1000) / (now - fpsRef.current.last));
            fpsRef.current.frames = 0;
            fpsRef.current.last = now;
          }
          stars.rotation.y += 0.00012;
          frameRef.current = requestAnimationFrame(measureFps);
        };
        frameRef.current = requestAnimationFrame(measureFps);
        teardownRef.current = () => {
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
  }, [snapshot]);

  const focusSearchResult = useCallback(() => {
    const query = searchQuery.trim().toLowerCase();
    const graph = graphRef.current;
    if (!query || !graph || !snapshot) return;
    const match = snapshot.nodes.find((node) =>
      visibleIds.has(node.id) &&
      [node.id, node.name, node.bank, node.city].some((value) => value.toLowerCase().includes(query))
    );
    if (!match || typeof match.x !== "number" || typeof match.y !== "number" || typeof match.z !== "number") return;
    const camera = graph.cameraPosition();
    const dx = camera.x - match.x;
    const dy = camera.y - match.y;
    const dz = camera.z - match.z;
    const length = Math.hypot(dx, dy, dz) || 1;
    graph.cameraPosition(
      { x: match.x + dx / length * 110, y: match.y + dy / length * 110, z: match.z + dz / length * 110 },
      { x: match.x, y: match.y, z: match.z },
      850
    );
    setSelectedNodeId(match.id);
    setPanelOpen(true);
  }, [searchQuery, snapshot, visibleIds]);

  const zoomCamera = useCallback((factor: number) => {
    const graph = graphRef.current;
    if (!graph) return;
    const camera = graph.cameraPosition();
    graph.cameraPosition({ x: camera.x * factor, y: camera.y * factor, z: camera.z * factor });
  }, []);

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
    { label: "Mules", value: snapshot?.meta.mules.toLocaleString("en-IN") ?? "0" },
    { label: "High-Risk", value: snapshot?.meta.highRisk.toLocaleString("en-IN") ?? "0" },
    { label: "Flagged Volume", value: formatCurrencyINR(snapshot?.meta.flaggedVolume ?? 0) },
    { label: "FPS", value: fps.toFixed(1) },
  ];

  if (error) {
    return (
      <div>
        <PageHeader title="Mule Galaxy" subtitle="GPU risk universe · ML-flagged accounts" />
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
        <PageHeader title="Mule Galaxy" subtitle="GPU risk universe · ML-flagged accounts" />
        <Card className="flex min-h-[640px] items-center justify-center"><LoadingState message="Constructing the GPU risk universe…" /></Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Mule Galaxy" subtitle="GPU risk universe · ML-flagged accounts · live money-flow vectors" />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-sm border border-frost/10 bg-surface-1 p-1">
          {([["all", "ALL"], ["mules", "MULES ONLY"], ["highrisk", "HIGH-RISK ONLY"]] as const).map(([value, label]) => (
            <button key={value} onClick={() => setViewMode(value)} className={`rounded-[2px] px-3 py-1 font-mono text-[10px] ${viewMode === value ? "bg-frost text-void" : "text-ash hover:text-bone"}`}>{label}</button>
          ))}
        </div>
        <input
          aria-label="Search the risk galaxy"
          className="w-56 rounded-sm border border-frost/10 bg-surface-1 px-3 py-1.5 bg-transparent font-mono text-[10px] text-bone outline-none placeholder:text-ash/70"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && focusSearchResult()}
          placeholder="Search account / bank / city"
        />
        <div className="ml-auto flex items-center gap-1 rounded-sm border border-frost/10 bg-surface-1 p-1">
          <button onClick={() => zoomCamera(0.8)} className="px-3 py-1 font-mono text-[10px] text-ash">+</button>
          <button onClick={() => zoomCamera(1.25)} className="px-3 py-1 font-mono text-[10px] text-ash">−</button>
          <button onClick={() => graphRef.current?.zoomToFit(750, 24)} className="px-3 py-1 font-mono text-[10px] text-ash">RE-CENTER</button>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="font-mono text-[9px] uppercase text-ash">Patterns</span>
        {patternCounts.slice(0, 12).map(({ pattern, count }) => (
          <button key={pattern} onClick={() => togglePattern(pattern)} className={`rounded-full border px-2 py-1 font-mono text-[9px] uppercase ${activePatterns.has(pattern) ? "border-signal-green/50 bg-signal-green/10 text-signal-green" : "border-frost/10 bg-surface-1 text-ash"}`}>
            {pattern.replaceAll("_", " ")} · {count.toLocaleString("en-IN")}
          </button>
        ))}
      </div>

      <div
        className="relative w-full overflow-hidden rounded-lg border border-frost/10"
        style={{ height: CANVAS_HEIGHT, background: "radial-gradient(circle at 50% 44%, rgba(34,68,124,.30) 0%, rgba(6,12,24,.92) 46%, #010208 100%)" }}
      >
        <div ref={mountRef} className="absolute inset-0" />
        <div className="pointer-events-none absolute left-4 top-4 rounded-md border border-white/5 bg-black/70 px-3 py-2 backdrop-blur">
          <p className="font-mono text-[9px] uppercase text-ash">ML Risk Universe</p>
          <p className="font-display text-lg text-bone">{visibleIds.size.toLocaleString("en-IN")}</p>
          <p className="font-mono text-[9px] text-ash">vertices in current view</p>
        </div>

        <div className="absolute bottom-4 left-4 rounded-md border border-white/5 bg-black/70 px-4 py-3 backdrop-blur">
          <p className="mb-2 font-mono text-[9px] uppercase text-ash">Legend</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            {[["Critical mule", "#ff2d55"], ["High-risk mule", "#ff9c42"], ["Watchlist mule", "#58c4ff"], ["Flagged flow", "#ff5f7a"], ["Suspicious flow", "#9ad2ff"]].map(([label, color]) => (
              <div key={label} className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                <span className="font-mono text-[9px] uppercase text-ash">{label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className={`absolute right-0 top-0 h-full w-[400px] max-w-full overflow-y-auto border-l border-frost/10 bg-void/95 backdrop-blur transition-transform duration-300 ${panelOpen ? "translate-x-0" : "translate-x-full"}`}>
          {!selectedNode ? (
            <div className="p-5">
              <div className="mb-4 flex justify-between"><div><p className="font-display text-base text-bone">NETWORK SUMMARY</p></div><button onClick={() => setPanelOpen(false)} className="font-mono text-[10px] text-ash">Close</button></div>
              <div className="grid grid-cols-2 gap-3">
                {stats.slice(0, 5).map((item) => (
                  <div key={item.label} className="rounded-lg border border-frost/10 p-3"><p className="font-mono text-[9px] uppercase text-ash">{item.label}</p><p className="mt-2 font-mono text-sm text-bone">{item.value}</p></div>
                ))}
              </div>
            </div>
          ) : (
            <div className="p-5">
              <div className="mb-4 flex justify-between"><div><p className="font-display text-base text-bone">{selectedNode.id}</p><p className="mt-1 font-mono text-[10px] uppercase text-ash">{selectedNode.tier.replace("-", " ")}</p></div><button onClick={() => setPanelOpen(false)} className="font-mono text-[10px] text-ash">Close</button></div>
              <div className="mb-5 grid grid-cols-2 gap-3">
                {[["Score", `${selectedNode.score.toFixed(1)}%`], ["Degree", selectedNode.degree.toLocaleString("en-IN")], ["Bank", selectedNode.bank], ["City", selectedNode.city], ["Volume In", formatCurrencyINR(selectedNode.volumeIn)], ["Volume Out", formatCurrencyINR(selectedNode.volumeOut)]].map(([label, value]) => (
                  <div key={label} className="rounded-lg border border-frost/10 p-3"><p className="font-mono text-[9px] uppercase text-ash">{label}</p><p className="mt-2 truncate font-mono text-sm text-bone">{value}</p></div>
                ))}
              </div>
              <CardTitle>Pattern Flags</CardTitle>
              <div className="mb-5 flex flex-wrap gap-2">
                {selectedNode.flags.map((flag) => <span key={flag} className="rounded-full border border-frost/10 bg-surface-1 px-2 py-1 font-mono text-[9px] uppercase text-ash">{flag.replaceAll("_", " ")}</span>)}
              </div>
              <CardTitle>Outgoing Flows</CardTitle>
              <div className="mb-5 space-y-2">
                {selectedFlows.outgoing.map((link) => (
                  <button key={`out-${link.source}-${link.target}`} onClick={() => setSelectedNodeId(link.target)} className="w-full rounded-lg border border-frost/10 p-3 text-left">
                    <div className="flex justify-between font-mono text-[10px] text-ash"><span>{link.target}</span><span>{link.count}×</span></div>
                    <div className="mt-1 font-mono text-xs text-bone">{formatCurrencyINR(link.amount)}</div>
                  </button>
                ))}
              </div>
              <CardTitle>Incoming Flows</CardTitle>
              <div className="space-y-2">
                {selectedFlows.incoming.map((link) => (
                  <button key={`in-${link.source}-${link.target}`} onClick={() => setSelectedNodeId(link.source)} className="w-full rounded-lg border border-frost/10 p-3 text-left">
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
            <p className="mb-2 font-mono text-[8px] uppercase text-ash">{item.label}</p>
            <p className="font-mono text-sm text-bone">{item.value}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
