import { NextResponse } from "next/server";
import { readFile, stat } from "fs/promises";
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
  /** Earliest activity day (YYYY-MM-DD, IST) across the corridor's transactions. */
  firstDay: string;
}

interface GalaxyPayload {
  meta: {
    nodes: number;
    links: number;
    mules: number;
    /** Non-mule flagged accounts (tier "watchlist"). */
    watchlistCount: number;
    flaggedVolume: number;
  };
  nodes: GalaxyNode[];
  links: GalaxyLink[];
}

const ACCOUNTS_PATH = join(process.cwd(), "public", "accounts_dataset.json");
const TRANSACTIONS_PATH = join(process.cwd(), "public", "transactions_synthetic.json");

// The payload only changes when the source datasets regenerate, so browsers
// and the CDN may serve a copy for 5 minutes and revalidate stale copies in
// the background for up to an hour instead of forcing a fresh multi-MB
// download on every request. Error responses always bypass this with no-store.
const CACHE_CONTROL = "public, max-age=300, stale-while-revalidate=3600";

// The build parses ~110 MB of JSON, so the finished payload is cached and
// rebuilt only when either source dataset's mtime/size signature changes or
// CACHE_TTL_MS elapses. Rebuilds run in the background while the previous
// payload keeps serving (stale-while-recompute), and concurrent requests share
// one in-flight build instead of each re-parsing the files.
const CACHE_TTL_MS = 60_000;

interface CacheEntry {
  payload: GalaxyPayload;
  signature: string;
  builtAt: number;
}

let cachedEntry: CacheEntry | null = null;
let inflight: Promise<void> | null = null;

/** mtime/size signature of both source datasets — changes when they regenerate. */
async function sourceSignature(): Promise<string> {
  const [accounts, transactions] = await Promise.all([
    stat(ACCOUNTS_PATH),
    stat(TRANSACTIONS_PATH),
  ]);
  return `${accounts.mtimeMs}|${accounts.size}|${transactions.mtimeMs}|${transactions.size}`;
}

async function buildPayload(): Promise<GalaxyPayload> {
  const [accounts, transactions] = await Promise.all([
    readFile(ACCOUNTS_PATH, "utf-8").then((raw) => JSON.parse(raw) as AccountRecord[]),
    readFile(TRANSACTIONS_PATH, "utf-8").then((raw) => JSON.parse(raw) as TransactionRecord[]),
  ]);

  // This predicate intentionally mirrors /api/data-local.
  const flaggedAccounts = accounts.filter(
    (account) => account.is_mule === true || isHighRiskLevel(account)
  );
  // Node ids below reuse the same text() default, so link endpoints always
  // resolve to real node ids even if an account_id were ever missing.
  const accountIds = new Set(flaggedAccounts.map((account) => text(account.account_id)));

  type Aggregate = { amount: number; count: number; flagged: boolean; firstDay: string };
  const aggregated = new Map<string, Aggregate>();

  for (const transaction of transactions) {
    const source = text(transaction.from, "");
    const target = text(transaction.to, "");
    if (!source || !target || !accountIds.has(source) || !accountIds.has(target)) continue;

    const key = `${source}\u0000${target}`;
    const day = istDay(transaction.timestamp);
    const existing = aggregated.get(key) ?? { amount: 0, count: 0, flagged: false, firstDay: "" };
    existing.amount += number(transaction.amount);
    existing.count += 1;
    existing.flagged ||= transaction.flagged === true;
    // Scrubber semantics: a corridor stays lit from its FIRST activity onward,
    // so track the earliest day seen on the aggregate. Days are bucketed in
    // IST (the product's timezone), matching the sibling views.
    if (day && (!existing.firstDay || day < existing.firstDay)) existing.firstDay = day;
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

  const nodes: GalaxyNode[] = flaggedAccounts.map((account) => {
    const id = text(account.account_id);
    const normalizedLevel = riskLevel(account);
    const tier: GalaxyNode["tier"] = normalizedLevel === "critical"
      ? "critical"
      : normalizedLevel === "high"
        ? "high-risk"
        : "watchlist";
    // calibrated_score is a 0–1 probability and the UI scale is 0–100; the
    // dataset never exceeds 1 and risk_score ≡ calibrated×100, so the scale is
    // applied unconditionally (the clamp below bounds stray values).
    const score = number(account.calibrated_score) * 100;

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
    return node;
  });

  return {
    meta: {
      nodes: nodes.length,
      links: links.length,
      mules: nodes.filter((node) => node.isMule && node.riskLevel !== "medium").length,
      watchlistCount: nodes.filter((node) => node.tier === "watchlist").length,
      flaggedVolume: links.reduce((sum, link) => sum + (link.flagged ? link.amount : 0), 0),
    },
    nodes,
    links,
  };
}

function text(value: unknown, fallback = "Unknown"): string {
  const parsed = String(value ?? "").trim();
  return parsed || fallback;
}

function number(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

type RiskLevel = GalaxyNode["riskLevel"];

// Single normalization site for risk_level so the universe filter and node
// building can never disagree on casing/whitespace again.
function riskLevel(account: AccountRecord): RiskLevel {
  const level = text(account.risk_level, "").toLowerCase();
  return level === "critical" || level === "high" ? level : "medium";
}

function isHighRiskLevel(account: AccountRecord): boolean {
  return riskLevel(account) !== "medium";
}

function compactFlags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((flag) => String(flag).toLowerCase()).filter(Boolean)));
}

// Corridor days are bucketed in IST (the product's timezone) so the scrubber
// range agrees with the sibling views; raw UTC slices pushed 00:00–05:30 IST
// activity onto the previous day. Returns "" when unparsable.
const istDayFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function istDay(value: unknown): string {
  const parsed = new Date(String(value ?? "")).getTime();
  if (!Number.isFinite(parsed)) return "";
  try {
    return istDayFmt.format(new Date(parsed));
  } catch {
    return "";
  }
}

export async function GET() {
  try {
    const signature = await sourceSignature();
    const fresh =
      cachedEntry !== null &&
      cachedEntry.signature === signature &&
      Date.now() - cachedEntry.builtAt < CACHE_TTL_MS;

    if (!fresh && !inflight) {
      inflight = buildPayload()
        .then((payload) => {
          // Tagged with the signature observed before the build; a dataset
          // swap mid-build self-corrects on the next TTL tick.
          cachedEntry = { payload, signature, builtAt: Date.now() };
        })
        .catch((error: unknown) => {
          // Log details server-side; keep serving the previous payload rather
          // than failing requests whose stale copy is still good.
          console.error("[api/graph/mule-galaxy] build failed:", error);
        })
        .finally(() => {
          inflight = null;
        });
    }

    if (!cachedEntry) await inflight; // cold start: nothing to serve yet

    if (!cachedEntry) {
      // First build failed and no previous payload exists.
      return NextResponse.json(
        { error: "Unable to build Mule Galaxy" },
        { status: 500, headers: { "Cache-Control": "no-store" } }
      );
    }

    return NextResponse.json(cachedEntry.payload, {
      headers: { "Cache-Control": CACHE_CONTROL },
    });
  } catch (error: unknown) {
    // Log details server-side; never leak internal error text to clients.
    console.error("[api/graph/mule-galaxy] request failed:", error);
    return NextResponse.json(
      { error: "Unable to build Mule Galaxy" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
