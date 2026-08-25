import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";

export const dynamic = "force-dynamic";

type AccountRecord = Record<string, unknown>;
type TransactionRecord = Record<string, unknown>;

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

interface GalaxyLink {
  source: string;
  target: string;
  amount: number;
  count: number;
  flagged: boolean;
  /** Earliest activity day (YYYY-MM-DD) across the corridor's transactions. */
  lastDay: string;
}

interface GalaxyPayload {
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
  links: GalaxyLink[];
}

let cachedPayload: GalaxyPayload | null = null;

async function loadJson<T>(filename: string): Promise<T[]> {
  const raw = await readFile(join(process.cwd(), "public", filename), "utf-8");
  return JSON.parse(raw) as T[];
}

function text(value: unknown, fallback = "Unknown"): string {
  const parsed = String(value ?? "").trim();
  return parsed || fallback;
}

function number(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isHighRiskLevel(account: AccountRecord): boolean {
  return account.risk_level === "critical" || account.risk_level === "high";
}

function compactFlags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((flag) => String(flag).toLowerCase()).filter(Boolean)));
}

export async function GET() {
  try {
    if (!cachedPayload) {
      const accounts = await loadJson<AccountRecord>("accounts_dataset.json");
      const transactions = await loadJson<TransactionRecord>("transactions_synthetic.json");

      // This predicate intentionally mirrors /api/data-local.
      const flaggedAccounts = accounts.filter(
        (account) => account.is_mule === true || isHighRiskLevel(account)
      );
      // Same text() default as node building below, so link endpoints always
      // resolve to real node ids even if an account_id were ever missing.
      const accountIds = new Set(flaggedAccounts.map((account) => text(account.account_id)));

      type Aggregate = { amount: number; count: number; flagged: boolean; lastDay: string };
      const aggregated = new Map<string, Aggregate>();

      for (const transaction of transactions) {
        const source = text(transaction.from, "");
        const target = text(transaction.to, "");
        if (!source || !target || !accountIds.has(source) || !accountIds.has(target)) continue;

        const key = `${source}\u0000${target}`;
        const day = text(transaction.timestamp, "").slice(0, 10);
        const existing = aggregated.get(key) ?? { amount: 0, count: 0, flagged: false, lastDay: day };
        existing.amount += number(transaction.amount);
        existing.count += 1;
        existing.flagged ||= transaction.flagged === true;
        // Scrubber semantics: a corridor stays lit from its FIRST activity onward,
        // so track the earliest day seen on the aggregate.
        if (day && (!existing.lastDay || day < existing.lastDay)) existing.lastDay = day;
        aggregated.set(key, existing);
      }

      let links: GalaxyLink[] = Array.from(aggregated.entries()).map(([key, value]) => {
        const [source, target] = key.split("\u0000");
        return { source, target, ...value };
      });
      links.sort((left, right) => right.amount - left.amount || left.source.localeCompare(right.source));

      // The production dataset currently fits comfortably below this cap. The
      // cap protects future datasets without dropping vertices.
      const MAX_LINKS = 40_000;
      if (links.length > MAX_LINKS) links = links.slice(0, MAX_LINKS);

      const degrees = new Map<string, number>();
      for (const link of links) {
        degrees.set(link.source, (degrees.get(link.source) ?? 0) + 1);
        degrees.set(link.target, (degrees.get(link.target) ?? 0) + 1);
      }

      const nodeById = new Map<string, GalaxyNode>();
      const nodes: GalaxyNode[] = flaggedAccounts.map((account) => {
        const id = text(account.account_id);
        const level = text(account.risk_level, "medium").toLowerCase();
        const normalizedLevel = level === "critical" || level === "high" ? level : "medium";
        const tier: GalaxyNode["tier"] = normalizedLevel === "critical"
          ? "critical"
          : normalizedLevel === "high"
            ? "high-risk"
            : "watchlist";
        const calibrated = number(account.calibrated_score);
        const fallbackScore = number(account.risk_score);
        const score = calibrated > 1 ? calibrated : calibrated > 0 ? calibrated * 100 : fallbackScore;

        const node: GalaxyNode = {
          id,
          name: text(account.name, id),
          bank: text(account.bank),
          city: text(account.city),
          isMule: account.is_mule === true,
          riskLevel: normalizedLevel,
          tier,
          score: Math.round(Math.min(Math.max(score, 0), 100) * 10) / 10,
          degree: degrees.get(id) ?? 0,
          volumeIn: Math.round(number(account.total_in_amount) * 100) / 100,
          volumeOut: Math.round(number(account.total_out_amount) * 100) / 100,
          flags: compactFlags(account.flags),
        };
        nodeById.set(id, node);
        return node;
      });

      const validLinks = links.filter(
        (link) => nodeById.has(link.source) && nodeById.has(link.target)
      );

      cachedPayload = {
        generatedAt: new Date().toISOString(),
        meta: {
          nodes: nodes.length,
          links: validLinks.length,
          mules: nodes.filter((node) => node.isMule && node.riskLevel !== "medium").length,
          highRisk: nodes.filter((node) => node.tier === "watchlist").length,
          totalVolume: validLinks.reduce((sum, link) => sum + link.amount, 0),
          flaggedVolume: validLinks.reduce(
            (sum, link) => sum + (link.flagged ? link.amount : 0),
            0
          ),
        },
        nodes,
        links: validLinks,
      };
    }

    return NextResponse.json(cachedPayload, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error: unknown) {
    // Log details server-side; never leak internal error text to clients.
    console.error("[api/graph/mule-galaxy] build failed:", error);
    return NextResponse.json(
      { error: "Unable to build Mule Galaxy" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
