import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";

export const dynamic = "force-dynamic";

let cachedData: Record<string, unknown> | null = null;

async function computeAnalytics() {
  if (cachedData) return cachedData;

  const accountsRaw = JSON.parse(await readFile(join(process.cwd(), "public", "accounts_dataset.json"), "utf-8")) as Record<string, unknown>[];
  const transactionsRaw = JSON.parse(await readFile(join(process.cwd(), "public", "transactions_synthetic.json"), "utf-8")) as Record<string, unknown>[];
  const alertsRaw = JSON.parse(await readFile(join(process.cwd(), "public", "alerts_synthetic.json"), "utf-8")) as Record<string, unknown>[];

  const totalAccounts = accountsRaw.length;
  const totalTransactions = transactionsRaw.length;
  const totalAlerts = alertsRaw.length;

  const muleAccounts = accountsRaw.filter((a) => a.is_mule === true).length;
  const cleanAccounts = totalAccounts - muleAccounts;

  const riskCounts = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const a of accountsRaw) {
    const level = String(a.risk_level || "low");
    if (level in riskCounts) riskCounts[level as keyof typeof riskCounts]++;
  }

  const flaggedTransactions = transactionsRaw.filter((t) => t.flagged === true).length;

  let totalTurnover = 0;
  for (const a of accountsRaw) {
    const tin = Number(a.total_in_amount) || 0;
    const tout = Number(a.total_out_amount) || 0;
    totalTurnover += tin + tout;
  }

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
  for (const a of accountsRaw) {
    acctMap.set(String(a.account_id), a);
  }

  const flaggedTxns = transactionsRaw.filter((t) => t.flagged === true) as Record<string, unknown>[];

  const txnByPattern: Record<string, number> = {};
  for (const txn of flaggedTxns) {
    const fromAcct = acctMap.get(String(txn.from));
    const toAcct = acctMap.get(String(txn.to));
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
    const fromAcct = acctMap.get(String(txn.from));
    const toAcct = acctMap.get(String(txn.to));
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
  for (const alert of alertsRaw) {
    const ts = String(alert.timestamp || "");
    if (ts) {
      const hour = new Date(ts).getHours();
      hourlyAlertsMap[hour] = (hourlyAlertsMap[hour] || 0) + 1;
    }
  }
  const hourlyAlerts = Object.entries(hourlyAlertsMap).map(([hour, count]) => ({
    hour: `${String(hour).padStart(2, "0")}:00`,
    alerts: count,
  }));

  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const alertPatternMap: Record<string, string> = {
    fan_in: "FANIN",
    pass_through: "PASSTHROUGH",
    circular: "CIRCULAR",
    circular_transfer: "CIRCULAR",
    fan_out: "FANOUT",
    rapid_movement: "PASSTHROUGH",
    structuring: "FANIN",
    layering_chain: "PASSTHROUGH",
    burst_activity: "FANOUT",
    night_owl: "CIRCULAR",
    automated_timing: "FANOUT",
    behavioral_change: "FANOUT",
  };
  const monthCounts: Record<string, Record<string, number>> = {};
  for (const m of monthNames) {
    monthCounts[m] = { FANIN: 0, PASSTHROUGH: 0, CIRCULAR: 0, FANOUT: 0 };
  }
  for (const alert of alertsRaw) {
    const ts = String(alert.timestamp || "");
    if (!ts) continue;
    const d = new Date(ts);
    const mIdx = d.getMonth();
    if (mIdx < 0 || mIdx > 11) continue;
    const mKey = monthNames[mIdx];
    const mapped = alertPatternMap[String(alert.type || "")];
    if (mapped) monthCounts[mKey][mapped]++;
  }
  const patternTimeData = monthNames
    .filter((m) => monthCounts[m].FANIN + monthCounts[m].PASSTHROUGH + monthCounts[m].CIRCULAR + monthCounts[m].FANOUT > 0)
    .map((m) => ({
      month: m,
      FANIN: monthCounts[m].FANIN,
      PASSTHROUGH: monthCounts[m].PASSTHROUGH,
      CIRCULAR: monthCounts[m].CIRCULAR,
      FANOUT: monthCounts[m].FANOUT,
    }));

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
  for (const txn of transactionsRaw) {
    const f = String(txn.from || "");
    const t = String(txn.to || "");
    if (!f || !t) continue;
    if (!txnByFrom.has(f)) txnByFrom.set(f, new Set());
    txnByFrom.get(f)!.add(t);
  }
  for (const txn of transactionsRaw) {
    const from = String(txn.from || "");
    const via = String(txn.to || "");
    const targets = txnByFrom.get(via) || new Set();
    for (const mid of targets) {
      const backTargets = txnByFrom.get(mid) || new Set();
      if (backTargets.has(from)) {
        const key = [from, via, mid].sort().join("->");
        if (!circularPathSet.has(key)) {
          circularPathSet.add(key);
          circularPaths.push({ from, via, to: mid, amount: Number(txn.amount) || 0 });
        }
      }
    }
  }

  const sankeyFlows: { from: string; to: string; amount: number; pattern: string }[] = [];
  const sankeyAgg = new Map<string, { amount: number; pattern: string }>();
  for (const txn of flaggedTxns) {
    const fromAcct = acctMap.get(String(txn.from));
    const toAcct = acctMap.get(String(txn.to));
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

    const fromLabel = String(txn.from || "").slice(-6);
    const toLabel = String(txn.to || "").slice(-6);
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

  cachedData = {
    totalAccounts,
    totalTransactions,
    totalAlerts,
    muleAccounts,
    cleanAccounts,
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
    sankeyAgg: sankeyAgg.size,
    accountsRaw: accountsRaw.slice(0, 5000),
    accountsTotal: totalAccounts,
  };

  return cachedData;
}

export async function GET() {
  try {
    const data = await computeAnalytics();
    return NextResponse.json(data);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
