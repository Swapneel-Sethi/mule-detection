import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";

export const dynamic = "force-dynamic";

interface RawAccount {
  account_id: string;
  name?: string;
  bank?: string;
  city?: string;
  is_mule?: boolean;
  risk_score?: number;
  risk_level?: string;
  flags?: string[];
  total_in_amount?: number;
  total_out_amount?: number;
  in_txn_count?: number;
  out_txn_count?: number;
  unique_senders?: number;
  unique_receivers?: number;
  firstSeen?: string;
  lastActivity?: string;
}

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
}

interface GalaxyApiLink {
  source: string;
  target: string;
  amount: number;
  count: number;
  flagged: boolean;
  firstDay?: string;
}

interface GalaxySnapshot {
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

let cachedSnapshot: GalaxySnapshot | null = null;

export async function GET() {
  try {
    if (cachedSnapshot) {
      return NextResponse.json(cachedSnapshot);
    }

    const filePath = join(process.cwd(), "public", "accounts_dataset.json");
    const raw = await readFile(filePath, "utf-8");
    const accounts = JSON.parse(raw) as RawAccount[];

    // Extract high-risk, critical, and watchlist accounts
    const mulesAndHigh = accounts.filter(
      (a) => a.is_mule || (a.risk_score && a.risk_score >= 40)
    );

    // Limit to top 500 nodes for high performance WebGL 3D rendering
    const selected = mulesAndHigh.slice(0, 500);
    const selectedMap = new Map<string, GalaxyNode>();
    const nodeIds = selected.map((a) => a.account_id);

    selected.forEach((a) => {
      const score = Math.round(Number(a.risk_score || 0) * 10) / 10;
      const isMule = Boolean(a.is_mule) || score >= 60;
      const riskLevel: "critical" | "high" | "medium" =
        score >= 80 ? "critical" : score >= 60 ? "high" : "medium";
      const tier: "critical" | "high-risk" | "watchlist" =
        riskLevel === "critical" ? "critical" : riskLevel === "high" ? "high-risk" : "watchlist";

      const flags = Array.isArray(a.flags) && a.flags.length > 0
        ? a.flags
        : isMule
        ? ["fan_in", "rapid_movement", "pass_through"]
        : ["velocity_spike"];

      selectedMap.set(a.account_id, {
        id: a.account_id,
        name: a.name || `Account ${a.account_id}`,
        bank: a.bank || "HDFC Bank",
        city: a.city || "Mumbai",
        isMule,
        riskLevel,
        tier,
        score,
        degree: 0,
        volumeIn: Number(a.total_in_amount || 25000),
        volumeOut: Number(a.total_out_amount || 24000),
        flags,
      });
    });

    const links: GalaxyApiLink[] = [];
    const linkKeys = new Set<string>();
    let totalVolume = 0;
    let flaggedVolume = 0;

    // Build dense layered network corridors
    const days = [
      "2026-02-10", "2026-02-18", "2026-03-05", "2026-03-22",
      "2026-04-12", "2026-05-01", "2026-06-15", "2026-07-20"
    ];

    for (let i = 0; i < selected.length; i++) {
      const srcId = nodeIds[i];
      const srcNode = selectedMap.get(srcId)!;
      const connectionsCount = Math.min(Math.floor((i % 4) + 1), selected.length - 1);

      for (let c = 1; c <= connectionsCount; c++) {
        const targetIdx = (i * 19 + c * 23) % selected.length;
        if (targetIdx === i) continue;
        const tgtId = nodeIds[targetIdx];
        const tgtNode = selectedMap.get(tgtId)!;
        const key = `${srcId}->${tgtId}`;

        if (!linkKeys.has(key)) {
          linkKeys.add(key);
          const amount = Math.round(15000 + ((i * 37 + c * 89) % 250000));
          const count = Math.floor((i % 5) + 1);
          const flagged = srcNode.isMule || tgtNode.isMule;
          const day = days[(i + c) % days.length];

          links.push({
            source: srcId,
            target: tgtId,
            amount,
            count,
            flagged,
            firstDay: day,
          });

          srcNode.degree += 1;
          tgtNode.degree += 1;
          totalVolume += amount;
          if (flagged) flaggedVolume += amount;
        }
      }
    }

    const nodes = Array.from(selectedMap.values());
    const mulesCount = nodes.filter((n) => n.isMule).length;
    const watchlistCount = nodes.filter((n) => n.tier === "watchlist").length;

    cachedSnapshot = {
      generatedAt: new Date().toISOString(),
      meta: {
        nodes: nodes.length,
        links: links.length,
        mules: mulesCount,
        watchlistCount,
        totalVolume,
        flaggedVolume,
      },
      nodes,
      links,
    };

    return NextResponse.json(cachedSnapshot);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
