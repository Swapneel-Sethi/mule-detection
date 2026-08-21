"use client";

import { useMemo } from "react";

interface Flow {
  source: string;
  target: string;
  amount: number;
  pattern: string;
}

interface Node {
  id: string;
  x: number;
  y: number;
  h: number;
  color: string;
  _sy?: number;
  _ty?: number;
}

interface Link {
  sx: number;
  sy: number;
  tx: number;
  ty: number;
  sw: number;
  tw: number;
  color: string;
}

const COLORS = {
  void: "#000000",
  bone: "#ffffff",
  charcoal: "#222222",
  frost: "#b8bab9",
  ash: "#444345",
  fanin: "rgba(184, 186, 185, 0.35)",
  fanout: "rgba(184, 186, 185, 0.25)",
  passthrough: "rgba(184, 186, 185, 0.30)",
  circular: "rgba(255, 255, 255, 0.20)",
};

const PATTERN_COLORS: Record<string, string> = {
  FANIN: COLORS.fanin,
  FANOUT: COLORS.fanout,
  PASSTHROUGH: COLORS.passthrough,
  CIRCULAR: COLORS.circular,
};

function generateFlows(): Flow[] {
  const flows: Flow[] = [];
  const s = (seed: number) => {
    let x = seed;
    return () => {
      x = (x * 16807 + 0) % 2147483647;
      return x / 2147483647;
    };
  };
  const rand = s(42);

  for (let i = 0; i < 3; i++) {
    const mule = `MULE_FANIN_${String(i + 1).padStart(2, "0")}`;
    const count = Math.floor(rand() * 4) + 4;
    for (let j = 0; j < count; j++) {
      flows.push({
        source: `VICTIM_${i + 1}_${String(j + 1).padStart(2, "0")}`,
        target: mule,
        amount: Math.round((rand() * 30000 + 15000) * 100) / 100,
        pattern: "FANIN",
      });
    }
  }

  for (let i = 0; i < 3; i++) {
    const mule = `MULE_FANOUT_${String(i + 1).padStart(2, "0")}`;
    const count = Math.floor(rand() * 3) + 4;
    for (let j = 0; j < count; j++) {
      flows.push({
        source: mule,
        target: `RECV_OUT_${i + 1}_${String(j + 1).padStart(2, "0")}`,
        amount: Math.round((rand() * 23000 + 12000) * 100) / 100,
        pattern: "FANOUT",
      });
    }
  }

  for (let i = 0; i < 2; i++) {
    const chain = [`SRC_${i + 1}`, `MULE_PASS_L1_${i + 1}`, `MULE_PASS_L2_${i + 1}`, `DEST_${i + 1}`];
    let amt = Math.round((rand() * 70000 + 80000) * 100) / 100;
    for (let k = 0; k < chain.length - 1; k++) {
      flows.push({ source: chain[k], target: chain[k + 1], amount: amt, pattern: "PASSTHROUGH" });
      amt *= 0.96;
    }
  }

  for (let i = 0; i < 2; i++) {
    const loop = [`LOOP_A_${i + 1}`, `LOOP_B_${i + 1}`, `LOOP_C_${i + 1}`, `LOOP_EXIT_${i + 1}`];
    let amt = Math.round((rand() * 50000 + 50000) * 100) / 100;
    for (let k = 0; k < loop.length - 1; k++) {
      flows.push({ source: loop[k], target: loop[k + 1], amount: amt, pattern: "CIRCULAR" });
      amt *= 0.95;
    }
  }

  return flows;
}

function buildSankey(flows: Flow[], width: number, height: number) {
  const nodeSet = new Set<string>();
  flows.forEach((f) => {
    nodeSet.add(f.source);
    nodeSet.add(f.target);
  });

  const incoming = new Map<string, number>();
  const outgoing = new Map<string, number>();
  flows.forEach((f) => {
    incoming.set(f.target, (incoming.get(f.target) || 0) + f.amount);
    outgoing.set(f.source, (outgoing.get(f.source) || 0) + f.amount);
  });

  const levels = new Map<string, number>();
  const nodesByLevel = new Map<number, string[]>();

  function assignLevel(node: string, level: number) {
    if (levels.has(node) && levels.get(node)! >= level) return;
    levels.set(node, level);
    if (!nodesByLevel.has(level)) nodesByLevel.set(level, []);
    if (!nodesByLevel.get(level)!.includes(node)) nodesByLevel.get(level)!.push(node);
    flows.forEach((f) => {
      if (f.source === node) assignLevel(f.target, level + 1);
    });
  }

  const roots = [...nodeSet].filter((n) => !incoming.has(n) || (incoming.get(n) || 0) === 0);
  if (roots.length === 0) roots.push([...nodeSet][0]);
  roots.forEach((r) => assignLevel(r, 0));

  nodeSet.forEach((n) => {
    if (!levels.has(n)) {
      const maxLvl = Math.max(...[...levels.values()], 0);
      assignLevel(n, maxLvl + 1);
    }
  });

  const maxLevel = Math.max(...[...levels.values()]);
  const colWidth = (width - 80) / (maxLevel + 1);
  const padY = 14;
  const nodeWidth = 12;

  const nodes: Node[] = [];
  const nodeMap = new Map<string, Node>();
  const totalVolume = new Map<string, number>();
  nodeSet.forEach((n) => {
    totalVolume.set(n, Math.max(incoming.get(n) || 0, outgoing.get(n) || 0));
  });

  for (let lvl = 0; lvl <= maxLevel; lvl++) {
    const colNodes = (nodesByLevel.get(lvl) || []).sort(
      (a, b) => (totalVolume.get(b) || 0) - (totalVolume.get(a) || 0)
    );
    const totalH = colNodes.reduce((s, n) => s + Math.max(4, Math.sqrt(totalVolume.get(n) || 1) * 0.15), 0)
      + (colNodes.length - 1) * padY;
    const startY = Math.max(10, (height - totalH) / 2);

    let y = startY;
    colNodes.forEach((n) => {
      const h = Math.max(4, Math.sqrt(totalVolume.get(n) || 1) * 0.15);
      const isMule = n.includes("MULE") || n.includes("LOOP");
      const node: Node = {
        id: n,
        x: 40 + lvl * colWidth,
        y,
        h,
        color: isMule ? COLORS.bone : COLORS.frost,
      };
      nodes.push(node);
      nodeMap.set(n, node);
      y += h + padY;
    });
  }

  const maxAmt = Math.max(...flows.map((f) => f.amount));
  const links: Link[] = flows.map((f) => {
    const sn = nodeMap.get(f.source)!;
    const tn = nodeMap.get(f.target)!;
    const ratio = f.amount / maxAmt;
    const sw = Math.max(1, ratio * 12);
    const tw = Math.max(1, ratio * 12);

    const syOffset = sn._sy || 0;
    const tyOffset = tn._ty || 0;
    sn._sy = syOffset + sw;
    tn._ty = tyOffset + tw;

    return {
      sx: sn.x + nodeWidth,
      sy: sn.y + syOffset + sw / 2,
      tx: tn.x,
      ty: tn.y + tyOffset + tw / 2,
      sw,
      tw,
      color: PATTERN_COLORS[f.pattern] || COLORS.ash,
    };
  });

  return { nodes, links };
}

export default function SankeyChart() {
  const W = 900;
  const H = 520;

  const { nodes, links } = useMemo(() => {
    const flows = generateFlows();
    const nodeSet = new Set<string>();
    flows.forEach((f) => {
      nodeSet.add(f.source);
      nodeSet.add(f.target);
    });

    const incoming = new Map<string, number>();
    const outgoing = new Map<string, number>();
    flows.forEach((f) => {
      incoming.set(f.target, (incoming.get(f.target) || 0) + f.amount);
      outgoing.set(f.source, (outgoing.get(f.source) || 0) + f.amount);
    });

    const levels = new Map<string, number>();
    const nodesByLevel = new Map<number, string[]>();

    function assignLevel(node: string, level: number) {
      if (levels.has(node) && levels.get(node)! >= level) return;
      levels.set(node, level);
      if (!nodesByLevel.has(level)) nodesByLevel.set(level, []);
      if (!nodesByLevel.get(level)!.includes(node)) nodesByLevel.get(level)!.push(node);
      flows.forEach((f) => {
        if (f.source === node) assignLevel(f.target, level + 1);
      });
    }

    const roots = [...nodeSet].filter((n) => !incoming.has(n) || (incoming.get(n) || 0) === 0);
    if (roots.length === 0) roots.push([...nodeSet][0]);
    roots.forEach((r) => assignLevel(r, 0));

    nodeSet.forEach((n) => {
      if (!levels.has(n)) {
        const maxLvl = Math.max(...[...levels.values()], 0);
        assignLevel(n, maxLvl + 1);
      }
    });

    const maxLevel = Math.max(...[...levels.values()]);
    const colWidth = (W - 120) / (maxLevel + 1);
    const padY = 14;
    const nodeWidth = 12;

    const nodes: Node[] = [];
    const nodeMap = new Map<string, Node>();
    const totalVolume = new Map<string, number>();
    nodeSet.forEach((n) => {
      totalVolume.set(n, Math.max(incoming.get(n) || 0, outgoing.get(n) || 0));
    });

    for (let lvl = 0; lvl <= maxLevel; lvl++) {
      const colNodes = (nodesByLevel.get(lvl) || []).sort(
        (a, b) => (totalVolume.get(b) || 0) - (totalVolume.get(a) || 0)
      );
      const totalH =
        colNodes.reduce(
          (s, n) => s + Math.max(4, Math.sqrt(totalVolume.get(n) || 1) * 0.15),
          0
        ) + (colNodes.length - 1) * padY;
      const startY = Math.max(10, (H - totalH) / 2);

      let y = startY;
      colNodes.forEach((n) => {
        const h = Math.max(4, Math.sqrt(totalVolume.get(n) || 1) * 0.15);
        const isMule = n.includes("MULE") || n.includes("LOOP");
        const node: Node = {
          id: n,
          x: 60 + lvl * colWidth,
          y,
          h,
          color: isMule ? COLORS.bone : COLORS.frost,
          _sy: 0,
          _ty: 0,
        };
        nodes.push(node);
        nodeMap.set(n, node);
        y += h + padY;
      });
    }

    const maxAmt = Math.max(...flows.map((f) => f.amount));
    const links: Link[] = flows.map((f) => {
      const sn = nodeMap.get(f.source)!;
      const tn = nodeMap.get(f.target)!;
      const ratio = f.amount / maxAmt;
      const sw = Math.max(1, ratio * 12);
      const tw = Math.max(1, ratio * 12);

      const syOffset = sn._sy!;
      const tyOffset = tn._ty!;
      sn._sy = syOffset + sw;
      tn._ty = tyOffset + tw;

      return {
        sx: sn.x + nodeWidth,
        sy: sn.y + syOffset + sw / 2,
        tx: tn.x,
        ty: tn.y + tyOffset + tw / 2,
        sw,
        tw,
        color: PATTERN_COLORS[f.pattern] || COLORS.ash,
      };
    });

    return { nodes, links };
  }, []);

  const legends = [
    { label: "FAN-IN", color: COLORS.fanin },
    { label: "FAN-OUT", color: COLORS.fanout },
    { label: "PASSTHROUGH", color: COLORS.passthrough },
    { label: "CIRCULAR", color: COLORS.circular },
  ];

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
        {links.map((l, i) => {
          const mx = (l.sx + l.tx) / 2;
          return (
            <path
              key={i}
              d={`M${l.sx},${l.sy} C${mx},${l.sy} ${mx},${l.ty} ${l.tx},${l.ty}`}
              fill="none"
              stroke={l.color}
              strokeWidth={l.sw}
            />
          );
        })}
        {nodes.map((n) => (
          <g key={n.id}>
            <rect x={n.x} y={n.y} width={12} height={n.h} fill={n.color} rx={1} />
            {n.h > 8 && (
              <text
                x={n.x + 16}
                y={n.y + n.h / 2}
                fill={COLORS.ash}
                fontSize={7}
                fontFamily="JetBrains Mono, monospace"
                dominantBaseline="middle"
              >
                {n.id.length > 18 ? n.id.slice(0, 16) + ".." : n.id}
              </text>
            )}
          </g>
        ))}
      </svg>
      <div className="flex gap-4 mt-3 justify-center">
        {legends.map((l) => (
          <div key={l.label} className="flex items-center gap-1.5">
            <div className="w-3 h-[6px] rounded-sm" style={{ backgroundColor: l.color }} />
            <span className="font-mono text-[9px] tracking-[-0.02em] text-ash">{l.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
