import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";

export const dynamic = "force-dynamic";

let cachedData: Record<string, unknown> | null = null;
let cachedAt = 0;
const ANALYTICS_CACHE_TTL_MS = 5 * 60 * 1000; // regenerate after 5 min so refreshed datasets appear without redeploy

async function computeAnalytics() {
  if (cachedData && Date.now() - cachedAt < ANALYTICS_CACHE_TTL_MS) return cachedData;

  const allAccountsRaw = JSON.parse(await readFile(join(process.cwd(), "public", "accounts_dataset.json"), "utf-8")) as Record<string, unknown>[];
  const transactionsRaw = JSON.parse(await readFile(join(process.cwd(), "public", "transactions_synthetic.json"), "utf-8")) as Record<string, unknown>[];
  const alertsRaw = JSON.parse(await readFile(join(process.cwd(), "public", "alerts_synthetic.json"), "utf-8")) as Record<string, unknown>[];

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
    const allFlags = [...fromFlags, ...toFlags];

    for (const f of allFlags) {
      const lower = String(f).toLowerCase();
      if (lower === "fanin_receiver" || lower === "fan_in") {
        txnByPattern.FANIN = (txnByPattern.FANIN || 0) + (Number(txn.amount) || 0);
      } else if (lower === "pass_through" || lower === "passthrough" || lower === "layering_chain") {
        txnByPattern.PASSTHROUGH = (txnByPattern.PASSTHROUGH || 0) + (Number(txn.amount) || 0);
      } else if (lower === "circular_loop" || lower === "circular") {
        txnByPattern.CIRCULAR = (txnByPattern.CIRCULAR || 0) + (Number(txn.amount) || 0);
      } else if (lower === "fanout_source" || lower === "fan_out") {
        txnByPattern.FANOUT = (txnByPattern.FANOUT || 0) + (Number(txn.amount) || 0);
      }
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

  const volumeByDayMap: Record<string, { volume: number; count: number }> = {};
  for (const txn of transactionsRaw) {
    const fromId = String(txn.from || "");
    const toId = String(txn.to || "");
    if (!muleAcctIds.has(fromId) && !muleAcctIds.has(toId)) continue;
    const ts = String(txn.timestamp || "");
    const day = ts.slice(0, 10);
    if (!day) continue;
    if (!volumeByDayMap[day]) volumeByDayMap[day] = { volume: 0, count: 0 };
    volumeByDayMap[day].volume += Number(txn.amount) || 0;
    volumeByDayMap[day].count += 1;
  }
  const volumeByDay = Object.entries(volumeByDayMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, d]) => ({
      day: day.slice(5),
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
  const alertPatternMap: Record<string, string> = {
    fan_in: "FANIN",
    fan_out: "FANOUT",
    rapid_movement: "PASSTHROUGH",
    behavioral_change: "CIRCULAR",
  };
  const CANONICAL_PATTERNS = ["FANIN", "FANOUT", "PASSTHROUGH", "CIRCULAR"];
  const dayPatternCounts: Record<string, Record<string, number>> = {};
  for (const alert of alertsRaw) {
    const ts = String(alert.timestamp || "");
    if (!ts) continue;
    const dayKey = ts.slice(5, 10);
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
    const allFlags = [...fromFlags, ...toFlags];

    let pattern = "OTHER";
    for (const f of allFlags) {
      const lower = String(f).toLowerCase();
      if (lower === "fanin_receiver" || lower === "fan_in") { pattern = "FANIN"; break; }
      if (lower === "fanout_source" || lower === "fan_out") { pattern = "FANOUT"; break; }
      if (lower === "circular_loop") { pattern = "CIRCULAR"; break; }
      if (lower === "pass_through" || lower === "passthrough") { pattern = "PASSTHROUGH"; break; }
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
  cachedAt = Date.now();
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
      { status: 500 }
    );
  }
}
