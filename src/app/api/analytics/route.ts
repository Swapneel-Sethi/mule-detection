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

// Datasets are static build artifacts under public/, so both the parsed
// arrays and the computed aggregates are cached for the process lifetime —
// same strategy as /api/data-local's loaders. Re-reading and re-parsing
// ~118 MB of JSON on a TTL tick bought nothing: the files cannot change
// without a redeploy.
const datasetCache = new Map<string, Record<string, unknown>[]>();
async function loadDataset(name: string): Promise<Record<string, unknown>[]> {
  const hit = datasetCache.get(name);
  if (hit) return hit;
  const raw = await readFile(join(process.cwd(), "public", name), "utf-8");
  const parsed = JSON.parse(raw) as Record<string, unknown>[];
  datasetCache.set(name, parsed);
  return parsed;
}

let cachedData: Record<string, unknown> | null = null;

async function computeAnalytics() {
  if (cachedData) return cachedData;

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

  const muleAccounts = accountsRaw.filter((a) => a.is_mule === true).length;

  // Disjoint category counts mirroring /api/data-local's computeStats so
  // Dashboard, Accounts and Analytics never disagree. "Mule" = confirmed
  // mules in the severity tier; "High Risk" = the rest of the flagged set
  // (watchlist band). The two always sum to flaggedAccounts. NOTE: data-local
  // defines its high bucket as confirmed mules BELOW the severity tier — the
  // numbers coincide only while no critical/high non-mule accounts exist
  // (true for the current dataset); revisit both sides if that ever changes.
  const isSeverityTier = (r: Record<string, unknown>) =>
    r.risk_level === "critical" || r.risk_level === "high";
  const muleCount = accountsRaw.filter((a) => a.is_mule === true && isSeverityTier(a)).length;
  const highRiskCount = totalAccounts - muleCount;

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

  const muleAcctIds = new Set(accountsRaw.map((a) => String(a.account_id)));

  const flaggedTxns = transactionsRaw.filter((t) => t.flagged === true) as Record<string, unknown>[];

  let totalTurnover = 0;
  for (const txn of flaggedTxns) {
    if (!muleAcctIds.has(String(txn.from || "")) && !muleAcctIds.has(String(txn.to || ""))) continue;
    totalTurnover += Number(txn.amount) || 0;
  }

  const txnByPattern: Record<string, number> = {};
  for (const txn of flaggedTxns) {
    const fromId = String(txn.from || "");
    const toId = String(txn.to || "");
    if (!muleAcctIds.has(fromId) && !muleAcctIds.has(toId)) continue;
    const fromAcct = acctMap.get(fromId);
    const toAcct = acctMap.get(toId);
    const fromFlags = Array.isArray(fromAcct?.flags) ? fromAcct!.flags as string[] : [];
    const toFlags = Array.isArray(toAcct?.flags) ? toAcct!.flags as string[] : [];
    // Dedupe patterns first: a transaction with several matching flags
    // (or synonym flags on its endpoints) contributes its amount exactly
    // once per distinct pattern — never double-counted.
    const matched = new Set<string>([...patternsForFlags(fromFlags), ...patternsForFlags(toFlags)]);
    for (const pattern of matched) {
      txnByPattern[pattern] = (txnByPattern[pattern] || 0) + (Number(txn.amount) || 0);
    }
  }

  const moneyFlows: Record<string, number> = {};
  for (const txn of flaggedTxns) {
    const fromId = String(txn.from || "");
    const toId = String(txn.to || "");
    if (!muleAcctIds.has(fromId) && !muleAcctIds.has(toId)) continue;
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
  // Returns MM-DD for a timestamp string, or "" when unparsable.
  const istDayKey = (ts: string): string => {
    const parsed = new Date(ts).getTime();
    if (!Number.isFinite(parsed)) return "";
    try {
      return istDayFmt.format(new Date(parsed)).slice(5); // YYYY-MM-DD -> MM-DD
    } catch {
      return "";
    }
  };

  const volumeByDayMap: Record<string, { volume: number; count: number }> = {};
  for (const txn of transactionsRaw) {
    const fromId = String(txn.from || "");
    const toId = String(txn.to || "");
    if (!muleAcctIds.has(fromId) && !muleAcctIds.has(toId)) continue;
    const ts = String(txn.timestamp || "");
    const day = istDayKey(ts); // full YYYY-MM-DD not needed; chart shows MM-DD
    if (!day) continue;
    if (!volumeByDayMap[day]) volumeByDayMap[day] = { volume: 0, count: 0 };
    volumeByDayMap[day].volume += Number(txn.amount) || 0;
    volumeByDayMap[day].count += 1;
  }
  const volumeByDay = Object.entries(volumeByDayMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, d]) => ({
      day, // already MM-DD from istDayKey
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

  // Daily pattern data mapped to the 4 canonical fraud patterns (same
  // vocabulary as the Sankey), so page-wide pattern filtering is consistent.
  // `circular` alerts are the generator's name for the CIRCULAR topology;
  // `dormant_activation` is an activity-state signal, not a flow topology,
  // so it intentionally has no bucket here.
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
      const row: Record<string, string | number> = { day };
      for (const p of CANONICAL_PATTERNS) row[p] = counts[p] || 0;
      return row;
    });

  const topAccountsForInOut = accountsRaw
    .map((a) => ({
      name: String(a.account_id || "").slice(-6),
      incoming: Number(a.in_txn_count) || 0,
      outgoing: Number(a.out_txn_count) || 0,
    }))
    .sort((a, b) => (b.incoming + b.outgoing) - (a.incoming + a.outgoing))
    .slice(0, 20);

  const inOutData = topAccountsForInOut;

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
    if (!muleAcctIds.has(from) && !muleAcctIds.has(via)) continue;
    const targets = txnByFrom.get(via) || new Set();
    for (const mid of targets) {
      const backTargets = txnByFrom.get(mid) || new Set();
      if (backTargets.has(from)) {
        const key = [from, via, mid].sort().join("->");
        if (!circularPathSet.has(key)) {
          circularPathSet.add(key);
          // Sum all three legs so the displayed amount reflects the whole cycle.
          const legSum =
            (amountByEdge.get(`${from}->${via}`) || 0) +
            (amountByEdge.get(`${via}->${mid}`) || 0) +
            (amountByEdge.get(`${mid}->${from}`) || 0);
          circularPaths.push({ from, via, to: mid, amount: legSum });
        }
      }
    }
  }

  const sankeyAgg = new Map<string, { amount: number; pattern: string }>();
  for (const txn of flaggedTxns) {
    const fromId = String(txn.from || "");
    const toId = String(txn.to || "");
    if (!muleAcctIds.has(fromId) && !muleAcctIds.has(toId)) continue;
    const fromAcct = acctMap.get(fromId);
    const toAcct = acctMap.get(toId);
    const fromFlags = Array.isArray(fromAcct?.flags) ? fromAcct!.flags as string[] : [];
    const toFlags = Array.isArray(toAcct?.flags) ? toAcct!.flags as string[] : [];
    const matched = new Set<string>([...patternsForFlags(fromFlags), ...patternsForFlags(toFlags)]);

    // Same canonical mapping as txnByPattern; priority order breaks ties so
    // each transaction lands in exactly one Sankey bucket.
    let pattern = "OTHER";
    for (const p of PATTERN_PRIORITY) {
      if (matched.has(p)) { pattern = p; break; }
    }
    if (pattern === "OTHER") {
      const fromLevel = String(fromAcct?.risk_level || "low");
      if (fromLevel === "critical" || fromLevel === "high") pattern = "PASSTHROUGH";
    }

    const fromLabel = fromId.slice(-6);
    const toLabel = toId.slice(-6);
    const key = `${fromLabel}|${toLabel}|${pattern}`;
    const existing = sankeyAgg.get(key);
    if (existing) {
      existing.amount += Number(txn.amount) || 0;
    } else {
      sankeyAgg.set(key, { amount: Number(txn.amount) || 0, pattern });
    }
  }

  const sankeyByPattern: Record<string, { from: string; to: string; amount: number }[]> = {};
  for (const [key, val] of sankeyAgg) {
    const [from, to, pattern] = key.split("|");
    if (!sankeyByPattern[pattern]) sankeyByPattern[pattern] = [];
    sankeyByPattern[pattern].push({ from, to, amount: val.amount });
  }
  for (const pattern of Object.keys(sankeyByPattern)) {
    sankeyByPattern[pattern].sort((a, b) => b.amount - a.amount);
    sankeyByPattern[pattern] = sankeyByPattern[pattern].slice(0, 20);
  }

  const allSankeyFlows: { from: string; to: string; amount: number; pattern: string }[] = [];
  for (const [pattern, flows] of Object.entries(sankeyByPattern)) {
    for (const f of flows) allSankeyFlows.push({ ...f, pattern });
  }

  const result: Record<string, unknown> = {
    totalAccounts,
    totalTransactions,
    totalAlerts,
    muleAccounts,
    cleanAccounts: allAccountsRaw.length - accountsRaw.length,
    // Disjoint tier counts mirroring /api/data-local (see note above) — these
    // drive the Mule vs High Risk charts so every page shows identical numbers.
    muleCount,
    highRiskCount,
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
    inOutData,
    circularPaths: circularPaths.slice(0, 10),
    sankeyFlows: allSankeyFlows,
    accountsTotal: totalAccounts,
    allAccountsTotal: allAccountsRaw.length,
  };

  cachedData = result;
  return cachedData;
}

export async function GET() {
  try {
    const data = await computeAnalytics();
    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
    });
  } catch (error: unknown) {
    // Log details server-side; never leak internal error text to clients.
    console.error("[api/analytics] computation failed:", error);
    return NextResponse.json(
      { error: "Failed to compute analytics" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
