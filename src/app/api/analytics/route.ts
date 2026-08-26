import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";

export const dynamic = "force-dynamic";

// Canonical fraud patterns and the flag vocabulary that maps to them.
// Shared by the bar chart (txnByPattern) and the Sankey (sankeyAgg) so both
// views always agree on how a transaction is attributed.
function canonicalFlag(lower: string): string | null {
  if (lower === "fanin_receiver" || lower === "fan_in") return "FANIN";
  if (lower === "pass_through" || lower === "pass_through_pattern" || lower === "passthrough" || lower === "layering_chain") return "PASSTHROUGH";
  if (lower === "circular_loop" || lower === "circular") return "CIRCULAR";
  if (lower === "fanout_source" || lower === "fan_out") return "FANOUT";
  return null;
}

/** Deduped canonical patterns for an account's flags — synonyms collapse to one entry. */
function patternsForFlags(flags: string[]): Set<string> {
  const out = new Set<string>();
  for (const f of flags) {
    const c = canonicalFlag(String(f).toLowerCase());
    if (c) out.add(c);
  }
  return out;
}

const PATTERN_PRIORITY = ["FANIN", "FANOUT", "CIRCULAR", "PASSTHROUGH"];

// Single-bucket attribution shared by txnByPattern and the Sankey: priority
// order breaks ties among an endpoint pair's matched patterns so each
// transaction lands in exactly one bucket — the bar chart and the diagram
// reconcile with each other and with Flagged Turnover instead of
// multi-attributing amounts across patterns.
function patternForTxn(
  fromAcct: Record<string, unknown> | undefined,
  matched: Set<string>
): string {
  for (const p of PATTERN_PRIORITY) {
    if (matched.has(p)) return p;
  }
  const fromLevel = String(fromAcct?.risk_level || "low");
  if (fromLevel === "critical" || fromLevel === "high") return "PASSTHROUGH";
  return "OTHER";
}

// Datasets are static build artifacts under public/, so the parsed arrays are
// cached for the process lifetime — re-reading and re-parsing ~118 MB of JSON
// on a TTL tick bought nothing: the files cannot change without a redeploy.
// (Freshness of the AGGREGATES below is governed by CACHE_TTL_MS instead.)
const datasetCache = new Map<string, Record<string, unknown>[]>();
// Concurrent cold-start requests share one in-flight load (same policy as
// /api/data-local): without this, N simultaneous first hits each re-parse
// ~118 MB of JSON. Failures clear their slot so the next request retries.
const pendingLoads = new Map<string, Promise<Record<string, unknown>[]>>();
async function loadDataset(name: string): Promise<Record<string, unknown>[]> {
  const hit = datasetCache.get(name);
  if (hit) return hit;
  const existing = pendingLoads.get(name);
  if (existing) return existing;
  const pending = readFile(join(process.cwd(), "public", name), "utf-8")
    .then((raw) => {
      const parsed = JSON.parse(raw) as Record<string, unknown>[];
      datasetCache.set(name, parsed);
      return parsed;
    })
    .finally(() => {
      // Successes now live in datasetCache; clearing the pending slot after a
      // failure frees it so the next request retries instead of replaying the
      // rejected promise forever.
      pendingLoads.delete(name);
    });
  pendingLoads.set(name, pending);
  return pending;
}

// Aggregates are cached per-process and rebuilt only when CACHE_TTL_MS
// elapses. Rebuilds run in the background while the previous payload keeps
// serving (stale-while-recompute), so no request pays the multi-second parse
// cost in its own path; concurrent requests share one in-flight rebuild.
const CACHE_TTL_MS = 5 * 60_000;

// Two freshness layers, by design: this CDN header lets the edge serve a copy
// for 60s and refresh in the background for up to 300s more, while the
// in-process CACHE_TTL_MS above governs when THIS route recomputes. They are
// independent budgets — a CDN hit never reaches the module cache, and a
// module-cache hit may legitimately be older than 60s (it reports that via
// `_stale`). Do not "fix" one to match the other without deciding which
// layer should own freshness.
const CACHE_CONTROL = "public, s-maxage=60, stale-while-revalidate=300";

let cachedData: { payload: Record<string, unknown>; builtAt: number } | null = null;
let inflightRebuild: Promise<void> | null = null;

// Cold-start dedupe: concurrent first hits share ONE build promise. Without
// this, simultaneous cold requests each pass the !cachedData check and race
// through the full multi-second load/compute redundantly.
let coldStartPromise: Promise<Record<string, unknown>> | null = null;

function ensureColdStart(): Promise<Record<string, unknown>> {
  if (!coldStartPromise) {
    coldStartPromise = computeAnalytics().catch((error: unknown) => {
      // Free the slot so the next request retries instead of replaying the
      // rejection forever.
      coldStartPromise = null;
      throw error;
    });
  }
  return coldStartPromise;
}

async function computeAnalytics(): Promise<Record<string, unknown>> {
  if (cachedData) return cachedData.payload;

  const [allAccountsRaw, transactionsRaw, alertsRaw] = await Promise.all([
    loadDataset("accounts_dataset.json"),
    loadDataset("transactions_synthetic.json"),
    loadDataset("alerts_synthetic.json"),
  ]);

  // Filter to mule + high risk (potential mule) accounts only
  const accountsRaw = allAccountsRaw.filter((a) => {
    const isMule = a.is_mule === true;
    const isHighRisk = a.risk_level === "critical" || a.risk_level === "high";
    return isMule || isHighRisk;
  });

  const totalAccounts = accountsRaw.length;
  const totalTransactions = transactionsRaw.length;
  const totalAlerts = alertsRaw.length;

  // Disjoint category counts matching /api/data-local so Dashboard, Accounts
  // and Analytics never disagree: "Mule" = every confirmed mule in the
  // flagged universe regardless of severity tier; "High Risk" = the remaining
  // non-mule accounts inside the severity tier (potential mules).
  const isSeverityTier = (r: Record<string, unknown>) =>
    r.risk_level === "critical" || r.risk_level === "high";
  const muleCount = accountsRaw.filter((a) => a.is_mule === true).length;
  const highRiskCount = accountsRaw.filter(
    (a) => a.is_mule !== true && isSeverityTier(a)
  ).length;

  const riskCounts = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const a of accountsRaw) {
    const level = String(a.risk_level || "low");
    if (level in riskCounts) riskCounts[level as keyof typeof riskCounts]++;
  }

  const flaggedTransactions = transactionsRaw.filter((t) => t.flagged === true).length;

  const bankCounts: Record<string, number> = {};
  for (const a of accountsRaw) {
    const bank = String(a.bank || "Unknown");
    bankCounts[bank] = (bankCounts[bank] || 0) + 1;
  }
  const bankData = Object.entries(bankCounts)
    .map(([bank, count]) => ({ bank, count }))
    .sort((a, b) => b.count - a.count);

  const flagCounts: Record<string, number> = {};
  for (const a of accountsRaw) {
    const flags = Array.isArray(a.flags) ? a.flags : [];
    for (const f of flags) {
      flagCounts[f] = (flagCounts[f] || 0) + 1;
    }
  }
  const patternData = Object.entries(flagCounts)
    .map(([pattern, count]) => ({ pattern, count }))
    .sort((a, b) => b.count - a.count);

  const acctMap = new Map<string, Record<string, unknown>>();
  for (const a of allAccountsRaw) {
    acctMap.set(String(a.account_id), a);
  }

  const flaggedUniverseIds = new Set(accountsRaw.map((a) => String(a.account_id)));

  const flaggedTxns = transactionsRaw.filter((t) => t.flagged === true) as Record<string, unknown>[];

  let totalTurnover = 0;
  for (const txn of flaggedTxns) {
    if (!flaggedUniverseIds.has(String(txn.from || "")) && !flaggedUniverseIds.has(String(txn.to || ""))) continue;
    totalTurnover += Number(txn.amount) || 0;
  }

  const txnByPattern: Record<string, number> = {};
  for (const txn of flaggedTxns) {
    const fromId = String(txn.from || "");
    const toId = String(txn.to || "");
    if (!flaggedUniverseIds.has(fromId) && !flaggedUniverseIds.has(toId)) continue;
    const fromAcct = acctMap.get(fromId);
    const toAcct = acctMap.get(toId);
    const fromFlags = Array.isArray(fromAcct?.flags) ? fromAcct!.flags as string[] : [];
    const toFlags = Array.isArray(toAcct?.flags) ? toAcct!.flags as string[] : [];
    const matched = new Set<string>([...patternsForFlags(fromFlags), ...patternsForFlags(toFlags)]);
    const pattern = patternForTxn(fromAcct, matched);
    txnByPattern[pattern] = (txnByPattern[pattern] || 0) + (Number(txn.amount) || 0);
  }

  const moneyFlows: Record<string, number> = {};
  for (const txn of flaggedTxns) {
    const fromId = String(txn.from || "");
    const toId = String(txn.to || "");
    if (!flaggedUniverseIds.has(fromId) && !flaggedUniverseIds.has(toId)) continue;
    const fromAcct = acctMap.get(fromId);
    const toAcct = acctMap.get(toId);
    const fromLevel = String(fromAcct?.risk_level || "low");
    const toLevel = String(toAcct?.risk_level || "low");
    const key = `${fromLevel}->${toLevel}`;
    moneyFlows[key] = (moneyFlows[key] || 0) + (Number(txn.amount) || 0);
  }
  const moneyFlowData = Object.entries(moneyFlows).map(([key, amount]) => {
    const [from, to] = key.split("->");
    return { from, to, amount, amountInLakhs: amount / 100000 };
  });

  // Day bucketing must match the hourly chart below: IST, not raw UTC slices
  // (near-midnight events previously landed on different days in adjacent charts).
  const istDayFmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  // Returns YYYY-MM-DD (IST) for a timestamp string, or "" when unparsable.
  // The full date is the internal key so same month-days never merge across
  // years and lexicographic order stays chronological; payloads strip to
  // MM-DD only at the render boundary below.
  const istDayKey = (ts: string): string => {
    const parsed = new Date(ts).getTime();
    if (!Number.isFinite(parsed)) return "";
    try {
      return istDayFmt.format(new Date(parsed));
    } catch {
      return "";
    }
  };

  // Volume by day covers flagged transactions touching the flagged universe —
  // the same population as the turnover and pattern charts above.
  const volumeByDayMap: Record<string, { volume: number; count: number }> = {};
  for (const txn of flaggedTxns) {
    const fromId = String(txn.from || "");
    const toId = String(txn.to || "");
    if (!flaggedUniverseIds.has(fromId) && !flaggedUniverseIds.has(toId)) continue;
    const ts = String(txn.timestamp || "");
    const day = istDayKey(ts);
    if (!day) continue;
    if (!volumeByDayMap[day]) volumeByDayMap[day] = { volume: 0, count: 0 };
    volumeByDayMap[day].volume += Number(txn.amount) || 0;
    volumeByDayMap[day].count += 1;
  }
  const volumeByDay = Object.entries(volumeByDayMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, d]) => ({
      day: day.slice(5), // MM-DD for display; sorted by full YYYY-MM-DD
      volumeInLakhs: d.volume / 100000,
      transactions: d.count,
    }));

  const hourlyAlertsMap: Record<number, number> = {};
  for (let h = 0; h < 24; h++) hourlyAlertsMap[h] = 0;
  // Bucket by IST hour so the "Hourly Alert Distribution" matches the
  // audience's timezone instead of the server's UTC clock.
  const istHourFmt = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "numeric",
    hourCycle: "h23",
  });
  for (const alert of alertsRaw) {
    const ts = String(alert.timestamp || "");
    if (!ts) continue;
    const parsed = new Date(ts).getTime();
    if (!Number.isFinite(parsed)) continue; // malformed timestamp → skip, not NaN-bucket
    try {
      const hour = Number(istHourFmt.format(new Date(parsed)));
      if (Number.isInteger(hour) && hour >= 0 && hour <= 23) {
        hourlyAlertsMap[hour] += 1;
      }
    } catch {
      /* unformattable date — skip */
    }
  }
  const hourlyAlerts = Object.entries(hourlyAlertsMap).map(([hour, count]) => ({
    hour: `${String(hour).padStart(2, "0")}:00`,
    alerts: count,
  }));

  // Daily alert counts mapped onto the page's 4 canonical patterns (same
  // vocabulary as the Sankey), so page-wide pattern filtering is consistent.
  // The shipped generator vocabulary has no `circular` type (actual types:
  // rapid_movement, fan_in, fan_out, behavioral_change), so the CIRCULAR line
  // is fed solely by behavioral_change — a behavior signal standing in for
  // the cycle topology, not evidence of circular flow. `dormant_activation`
  // is an activity-state signal with no flow topology, so it has no bucket
  // here.
  const alertPatternMap: Record<string, string> = {
    fan_in: "FANIN",
    fan_out: "FANOUT",
    rapid_movement: "PASSTHROUGH",
    behavioral_change: "CIRCULAR",
    circular: "CIRCULAR",
  };
  const CANONICAL_PATTERNS = ["FANIN", "FANOUT", "PASSTHROUGH", "CIRCULAR"];
  const dayPatternCounts: Record<string, Record<string, number>> = {};
  for (const alert of alertsRaw) {
    const ts = String(alert.timestamp || "");
    if (!ts) continue;
    const dayKey = istDayKey(ts);
    if (!dayKey) continue;
    if (!dayPatternCounts[dayKey]) {
      dayPatternCounts[dayKey] = {};
      for (const p of CANONICAL_PATTERNS) dayPatternCounts[dayKey][p] = 0;
    }
    const canonical = alertPatternMap[String(alert.type || "")];
    if (canonical) dayPatternCounts[dayKey][canonical]++;
  }
  const patternTimeData = Object.entries(dayPatternCounts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, counts]) => {
      const row: Record<string, string | number> = { day: day.slice(5) }; // MM-DD display
      for (const p of CANONICAL_PATTERNS) row[p] = counts[p] || 0;
      return row;
    });

  const circularPathSet = new Set<string>();
  const circularPaths: { from: string; via: string; to: string; amount: number }[] = [];
  const txnByFrom = new Map<string, Set<string>>();
  const amountByEdge = new Map<string, number>();
  for (const txn of transactionsRaw) {
    const f = String(txn.from || "");
    const t = String(txn.to || "");
    if (!f || !t) continue;
    if (!txnByFrom.has(f)) txnByFrom.set(f, new Set());
    txnByFrom.get(f)!.add(t);
    const edgeKey = `${f}->${t}`;
    amountByEdge.set(edgeKey, (amountByEdge.get(edgeKey) || 0) + (Number(txn.amount) || 0));
  }
  for (const txn of transactionsRaw) {
    const from = String(txn.from || "");
    const via = String(txn.to || "");
    if (!flaggedUniverseIds.has(from) && !flaggedUniverseIds.has(via)) continue;
    const targets = txnByFrom.get(via) || new Set();
    for (const mid of targets) {
      const backTargets = txnByFrom.get(mid) || new Set();
      if (backTargets.has(from)) {
        // Canonical orientation: each directed 3-cycle is discovered from all
        // three of its starting points, so dedupe on the rotation that begins
        // at the lexicographically smallest id. Direction is preserved —
        // from→via→mid→from stays intact instead of being alphabetized into
        // a path that may not exist as an edge.
        const legs = [
          [from, via],
          [via, mid],
          [mid, from],
        ];
        let anchor = 0;
        for (let i = 1; i < 3; i++) {
          if (legs[i][0] < legs[anchor][0]) anchor = i;
        }
        const oriented = [legs[anchor], legs[(anchor + 1) % 3], legs[(anchor + 2) % 3]];
        const key = oriented.map(([f]) => f).join("->");
        if (!circularPathSet.has(key)) {
          circularPathSet.add(key);
          // Corridor volume: lifetime sum of the cycle's three DIRECTED edges
          // only, read from per-pair aggregates in the canonical direction
          // (a->b and b->a are distinct aggregates). Reverse-direction money
          // on the same pairs is not part of this cycle.
          const legSum =
            (amountByEdge.get(`${oriented[0][0]}->${oriented[0][1]}`) || 0) +
            (amountByEdge.get(`${oriented[1][0]}->${oriented[1][1]}`) || 0) +
            (amountByEdge.get(`${oriented[2][0]}->${oriented[2][1]}`) || 0);
          circularPaths.push({
            from: oriented[0][0],
            via: oriented[0][1],
            to: oriented[1][1],
            amount: legSum,
          });
        }
      }
    }
  }

  // Aggregate per (source, destination, pattern) keyed by FULL account ids —
  // slice(-6) labels collide across accounts (4 colliding groups exist in the
  // flagged universe) and would silently merge distinct nodes. Compact
  // display labels are derived afterwards, lengthened only within colliding
  // groups so every node stays unique.
  const sankeyAgg = new Map<string, number>();
  for (const txn of flaggedTxns) {
    const fromId = String(txn.from || "");
    const toId = String(txn.to || "");
    if (!flaggedUniverseIds.has(fromId) && !flaggedUniverseIds.has(toId)) continue;
    const fromAcct = acctMap.get(fromId);
    const toAcct = acctMap.get(toId);
    const fromFlags = Array.isArray(fromAcct?.flags) ? fromAcct!.flags as string[] : [];
    const toFlags = Array.isArray(toAcct?.flags) ? toAcct!.flags as string[] : [];
    const matched = new Set<string>([...patternsForFlags(fromFlags), ...patternsForFlags(toFlags)]);
    // Same single-bucket attribution as txnByPattern above; '|' is a safe
    // separator because account ids are hex.
    const pattern = patternForTxn(fromAcct, matched);
    const key = `${fromId}|${toId}|${pattern}`;
    sankeyAgg.set(key, (sankeyAgg.get(key) || 0) + (Number(txn.amount) || 0));
  }

  // Shortest distinguishing suffix per endpoint id: starts at the displayed
  // 6 chars, grows only inside colliding groups (terminates because distinct
  // ids eventually differ within their full length).
  const endpointIds = new Set<string>();
  for (const key of sankeyAgg.keys()) {
    const [fromId, toId] = key.split("|");
    endpointIds.add(fromId);
    endpointIds.add(toId);
  }
  const labelOf = new Map<string, string>();
  let pendingGroups: string[][] = [[...endpointIds]];
  for (let len = 6; pendingGroups.length > 0; len += 2) {
    const collided: string[][] = [];
    for (const group of pendingGroups) {
      const bySuffix = new Map<string, string[]>();
      for (const id of group) {
        const sfx = id.slice(-len);
        const bucket = bySuffix.get(sfx);
        if (bucket) bucket.push(id);
        else bySuffix.set(sfx, [id]);
      }
      for (const bucket of bySuffix.values()) {
        if (bucket.length === 1) labelOf.set(bucket[0], bucket[0].slice(-len));
        else collided.push(bucket);
      }
    }
    pendingGroups = collided;
  }

  // Ship every aggregated flow uncapped: client-side totals (filter chip,
  // legend) must reconcile with the bar chart and Flagged Turnover instead of
  // describing a censored top-20 subset. Heaviest-first so the UI can cap
  // display without hiding what exists.
  const sankeyFlows: { from: string; to: string; amount: number; pattern: string }[] = [];
  for (const [key, amount] of sankeyAgg) {
    const [fromId, toId, pattern] = key.split("|");
    sankeyFlows.push({
      from: labelOf.get(fromId) || fromId,
      to: labelOf.get(toId) || toId,
      amount,
      pattern,
    });
  }
  sankeyFlows.sort((a, b) => b.amount - a.amount);

  const result: Record<string, unknown> = {
    totalAccounts,
    totalTransactions,
    totalAlerts,
    // Disjoint category counts matching /api/data-local (see note above) —
    // these drive the Mule vs High Risk charts so every page shows identical
    // numbers.
    muleCount,
    highRiskCount,
    // Owner definition: "Alerts" KPI = accounts warranting review = confirmed
    // mules + high-risk potentials — NOT the event-row count in totalAlerts.
    alertAccounts: muleCount + highRiskCount,
    riskCounts,
    flaggedTransactions,
    totalTurnover,
    bankData,
    patternData,
    txnByPattern,
    moneyFlowData,
    volumeByDay,
    hourlyAlerts,
    patternTimeData,
    // Cap is observable: circularTotal reports the full cycle count so a
    // client rendering "top 10" can say so honestly.
    circularTotal: circularPaths.length,
    circularPaths: circularPaths.slice(0, 10),
    sankeyFlows,
    allAccountsTotal: allAccountsRaw.length,
  };

  cachedData = { payload: result, builtAt: Date.now() };
  return result;
}

export async function GET() {
  try {
    // Stale-while-recompute: a fresh cache answers instantly; an expired one
    // keeps serving the previous payload (marked stale) while a background
    // rebuild runs. Only a cold start with no payload at all awaits
    // computation, so no warm request ever blocks on a re-parse.
    const now = Date.now();
    if (!cachedData) {
      // Concurrent cold starts coalesce onto the shared promise above; only
      // the first caller pays the build cost.
      const payload = await ensureColdStart();
      return NextResponse.json(payload, { headers: { "Cache-Control": CACHE_CONTROL } });
    }
    if (now - cachedData.builtAt >= CACHE_TTL_MS && !inflightRebuild) {
      // Rebuild failure keeps the stale-but-good payload serving; the error is
      // logged here so the background rejection is never silent.
      inflightRebuild = (async () => {
        try {
          await computeAnalytics();
        } catch (error: unknown) {
          console.error("[api/analytics] background rebuild failed:", error);
        } finally {
          inflightRebuild = null;
        }
      })();
    }
    return NextResponse.json(
      now - cachedData.builtAt >= CACHE_TTL_MS
        ? { ...cachedData.payload, _stale: true }
        : cachedData.payload,
      { headers: { "Cache-Control": CACHE_CONTROL } }
    );
  } catch (error: unknown) {
    // Log details server-side; never leak internal error text to clients.
    console.error("[api/analytics] computation failed:", error);
    return NextResponse.json(
      { error: "Failed to compute analytics" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
