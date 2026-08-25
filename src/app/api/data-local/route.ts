import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";

export const dynamic = "force-dynamic";

let cachedAccounts: Record<string, unknown>[] | null = null;
let cachedTransactions: Record<string, unknown>[] | null = null;
let cachedAlerts: Record<string, unknown>[] | null = null;

async function loadAccounts(): Promise<Record<string, unknown>[]> {
  if (cachedAccounts) return cachedAccounts;
  try {
    const filePath = join(process.cwd(), "public", "accounts_dataset.json");
    const raw = await readFile(filePath, "utf-8");
    cachedAccounts = JSON.parse(raw) as Record<string, unknown>[];
  } catch {
    cachedAccounts = [];
  }
  return cachedAccounts;
}

async function loadTransactions(): Promise<Record<string, unknown>[]> {
  if (cachedTransactions) return cachedTransactions;
  try {
    const filePath = join(process.cwd(), "public", "transactions_synthetic.json");
    const raw = await readFile(filePath, "utf-8");
    cachedTransactions = JSON.parse(raw) as Record<string, unknown>[];
  } catch {
    cachedTransactions = [];
  }
  return cachedTransactions;
}

async function loadAlerts(): Promise<Record<string, unknown>[]> {
  if (cachedAlerts) return cachedAlerts;
  try {
    const filePath = join(process.cwd(), "public", "alerts_synthetic.json");
    const raw = await readFile(filePath, "utf-8");
    cachedAlerts = JSON.parse(raw) as Record<string, unknown>[];
  } catch {
    cachedAlerts = [];
  }
  return cachedAlerts;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const toInt = (raw: string | null, fallback: number): number => {
      const n = parseInt(raw ?? "", 10);
      return Number.isFinite(n) ? n : fallback;
    };
    const limit = Math.min(Math.max(toInt(searchParams.get("limit"), 200), 1), 5000);
    const page = Math.max(toInt(searchParams.get("page"), 1), 1);
    const sortBy = searchParams.get("sort") || "risk_score";
    const order = searchParams.get("order") || "desc";
    const riskFilter = searchParams.get("risk") || "";
    const searchQuery = searchParams.get("q") || "";
    const includeTransactions = searchParams.get("transactions") === "true";
    const includeAlerts = searchParams.get("alerts") === "true";

    const allAccounts = await loadAccounts();
    const allTransactions = await loadTransactions();
    const allAlerts = await loadAlerts();

    // Base flagged universe: confirmed mules + high-risk (potential mule) accounts
    const isHighRisk = (r: Record<string, unknown>) =>
      r.risk_level === "critical" || r.risk_level === "high";
    const flaggedAccounts = allAccounts.filter((r) => r.is_mule === true || isHighRisk(r));

    // Category narrows the flagged set into disjoint views:
    // "mule" = confirmed mules in the severity tier (highest scores),
    // "high" = confirmed mules below it (watchlist band, lower scores).
    const category = searchParams.get("category") || "all";
    let filteredAccounts = flaggedAccounts;
    if (category === "mule") {
      filteredAccounts = flaggedAccounts.filter((r) => r.is_mule === true && isHighRisk(r));
    } else if (category === "high") {
      filteredAccounts = flaggedAccounts.filter((r) => r.is_mule === true && !isHighRisk(r));
    }

    if (riskFilter) {
      filteredAccounts = filteredAccounts.filter((r) => r.risk_level === riskFilter);
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filteredAccounts = filteredAccounts.filter(
        (r) =>
          String(r.account_id || "").toLowerCase().includes(q) ||
          String(r.name || "").toLowerCase().includes(q) ||
          String(r.bank || "").toLowerCase().includes(q)
      );
    }

    const sortField = sortBy === "risk" ? "risk_score" : sortBy;
    filteredAccounts.sort((a, b) => {
      const av = Number(a[sortField]) || 0;
      const bv = Number(b[sortField]) || 0;
      return order === "asc" ? av - bv : bv - av;
    });

    const total = filteredAccounts.length;
    const start = (page - 1) * limit;
    const accounts = filteredAccounts.slice(start, start + limit);

    // Filter transactions: return all flagged transactions + any involving returned accounts
    const accountIds = new Set(accounts.map((a) => String(a.account_id)));
    const flaggedTransactions = allTransactions.filter((t) => t.flagged === true);
    const accountTransactions = allTransactions.filter(
      (t) => accountIds.has(String(t.from)) || accountIds.has(String(t.to))
    );
    // Merge and deduplicate
    const txnMap = new Map<string, Record<string, unknown>>();
    for (const t of [...flaggedTransactions, ...accountTransactions]) {
      txnMap.set(String(t.id), t);
    }
    const filteredTransactions = Array.from(txnMap.values());

    // Alerts: small dataset — return all when requested; client-side filtering handles scope
    const filteredAlerts = includeAlerts ? allAlerts.slice(0, 500) : [];

    const stats = computeStats(flaggedAccounts, allAlerts, allTransactions);
    stats.totalInDataset = allAccounts.length;

    return NextResponse.json({
      accounts,
      transactions: includeTransactions ? filteredTransactions : [],
      alerts: includeAlerts ? filteredAlerts : [],
      stats,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: start + limit < total,
      },
      source: "local",
    }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error: unknown) {
    // Log details server-side; never leak internal error text to clients.
    console.error("[api/data-local] request failed:", error);
    return NextResponse.json(
      { error: "Failed to load data" },
      { status: 500 }
    );
  }
}

function toFinite(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function computeStats(
  accounts: Record<string, unknown>[],
  alerts: Record<string, unknown>[],
  transactions: Record<string, unknown>[]
) {
  const total = accounts.length;
  // Disjoint categories matching the UI: "Mule" = confirmed mules in the
  // severity tier (critical/high); "highRiskCount" = confirmed mules below
  // it — both sum to the flagged total.
  const mules = accounts.filter(
    (a) =>
      a.is_mule === true && (a.risk_level === "critical" || a.risk_level === "high")
  ).length;
  const highRisk = accounts.filter(
    (a) =>
      a.is_mule === true && !(a.risk_level === "critical" || a.risk_level === "high")
  ).length;
  const riskCounts = { critical: 0, high: 0, medium: 0, low: 0 };
  let totalTurnover = 0;
  let totalRisk = 0;

  for (const a of accounts) {
    const level = String(a.risk_level || "low");
    if (level in riskCounts) riskCounts[level as keyof typeof riskCounts]++;
    totalTurnover += toFinite(a.total_in_amount) + toFinite(a.total_out_amount);
    totalRisk += toFinite(a.risk_score);
  }

  const alertSeverityCounts = { critical: 0, high: 0, medium: 0, low: 0 };
  let activeAlerts = 0;
  let resolvedAlerts = 0;
  for (const a of alerts) {
    const sev = String(a.severity || "low");
    if (sev in alertSeverityCounts) alertSeverityCounts[sev as keyof typeof alertSeverityCounts]++;
    const status = String(a.status || "").toLowerCase();
    if (status === "new" || status === "investigating") activeAlerts++;
    // Count each resolved alert exactly once — a status flag and a boolean
    // field describing the same state must not both increment the counter.
    else if (status === "resolved" || a.resolved === true) resolvedAlerts++;
  }

  const avgRisk = total > 0 ? Math.round((totalRisk / total) * 10) / 10 : 0;

  return {
    totalAccounts: total,
    flaggedAccounts: mules + highRisk,
    muleCount: mules,
    highRiskCount: highRisk,
    totalVolume: totalTurnover,
    turnover: totalTurnover,
    avgRiskScore: avgRisk,
    avgRisk,
    activeAlerts,
    resolvedAlerts,
    alertsTotal: activeAlerts,
    alertsResolved: resolvedAlerts,
    // Distinct transaction rows in the dataset (matches /api/analytics definition),
    // not the sum of per-account in/out counts which double-counts each hop.
    totalTransactions: transactions.length,
    riskDistribution: riskCounts,
    totalInDataset: 0,
  };
}
