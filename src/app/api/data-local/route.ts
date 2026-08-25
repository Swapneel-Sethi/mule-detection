import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";

export const dynamic = "force-dynamic";

// Datasets are immutable artifacts, so parsed results cache for the process
// lifetime (same policy as /api/analytics). Concurrent cold-start requests
// share one in-flight load; a failed load is never cached — its error
// propagates so GET answers 503 and the next request retries from disk.
type Dataset = Record<string, unknown>[];
const datasetCache = new Map<string, Dataset>();
const pendingLoads = new Map<string, Promise<Dataset>>();

const MAX_ALERTS = 500;

function loadDataset(file: string): Promise<Dataset> {
  const hit = datasetCache.get(file);
  if (hit) return Promise.resolve(hit);
  const existing = pendingLoads.get(file);
  if (existing) return existing;
  const pending = readFile(join(process.cwd(), "public", file), "utf-8")
    .then((raw) => {
      const parsed = JSON.parse(raw) as Dataset;
      datasetCache.set(file, parsed);
      return parsed;
    })
    .catch((error: unknown) => {
      console.error(`[api/data-local] failed to load ${file}:`, error);
      throw error;
    })
    .finally(() => {
      // Successes now live in datasetCache; clearing the pending slot after a
      // failure frees it so the next request retries instead of replaying the
      // rejected promise forever.
      pendingLoads.delete(file);
    });
  pendingLoads.set(file, pending);
  return pending;
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
    // Only known enum values pass through; anything else degrades to the
    // unfiltered default instead of silently matching nothing.
    const RISK_LEVELS = ["critical", "high", "medium", "low"];
    const riskRaw = searchParams.get("risk") || "";
    const riskFilter = RISK_LEVELS.includes(riskRaw) ? riskRaw : "";
    // Cap query length — it drives a substring scan over every flagged row.
    const searchQuery = (searchParams.get("q") || "").slice(0, 100);
    const includeTransactions = searchParams.get("transactions") === "true";
    const includeAlerts = searchParams.get("alerts") === "true";

    let allAccounts: Dataset;
    let allTransactions: Dataset;
    let allAlerts: Dataset;
    try {
      [allAccounts, allTransactions, allAlerts] = await Promise.all([
        loadDataset("accounts_dataset.json"),
        loadDataset("transactions_synthetic.json"),
        loadDataset("alerts_synthetic.json"),
      ]);
    } catch {
      // The read/parse error is already logged in loadDataset. Surface the
      // failure instead of an empty success-shaped payload; nothing was
      // cached, so the client's next request retries.
      return NextResponse.json(
        { error: "Local dataset temporarily unavailable" },
        { status: 503 }
      );
    }

    // Base flagged universe: confirmed mules + high-risk (potential mule) accounts
    const isHighRisk = (r: Record<string, unknown>) =>
      r.risk_level === "critical" || r.risk_level === "high";
    const flaggedAccounts = allAccounts.filter((r) => r.is_mule === true || isHighRisk(r));

    // Category narrows the flagged set into disjoint, honestly named views:
    // "mule" = confirmed mules regardless of severity;
    // "high" = high/critical-risk potential mules that are not yet confirmed.
    // Unknown values fall back to "all" rather than silently matching nothing.
    const CATEGORY_VALUES = ["all", "mule", "high"];
    const categoryRaw = searchParams.get("category") || "all";
    const category = CATEGORY_VALUES.includes(categoryRaw) ? categoryRaw : "all";
    let filteredAccounts = flaggedAccounts;
    if (category === "mule") {
      filteredAccounts = flaggedAccounts.filter((r) => r.is_mule === true);
    } else if (category === "high") {
      filteredAccounts = flaggedAccounts.filter((r) => r.is_mule !== true && isHighRisk(r));
    }

    if (riskFilter) {
      // riskFilter is whitelist-validated above, so raw equality is safe.
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

    const SORTABLE_FIELDS = new Set(["risk_score", "account_age_days", "in_txn_count", "out_txn_count", "total_in_amount", "total_out_amount", "calibrated_score", "ml_score"]);
    const sortField = sortBy === "risk" ? "risk_score" : (SORTABLE_FIELDS.has(sortBy) ? sortBy : "risk_score");
    filteredAccounts.sort((a, b) => {
      const av = Number(a[sortField]) || 0;
      const bv = Number(b[sortField]) || 0;
      return order === "asc" ? av - bv : bv - av;
    });

    const total = filteredAccounts.length;
    const start = (page - 1) * limit;
    const accounts = filteredAccounts.slice(start, start + limit);

    // Filter transactions: return all flagged transactions + any involving returned accounts.
    // Skipped entirely unless requested — the double scan over ~100k rows is not free.
    let filteredTransactions: Record<string, unknown>[] = [];
    if (includeTransactions) {
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
      filteredTransactions = Array.from(txnMap.values());
    }

    // Alerts: small dataset — return all when requested; client-side filtering handles scope.
    // The cap is made visible to clients via alertsTotal/hasMoreAlerts below.
    const filteredAlerts = includeAlerts ? allAlerts.slice(0, MAX_ALERTS) : [];

    const stats = computeStats(flaggedAccounts, allAlerts, allTransactions);
    stats.totalInDataset = allAccounts.length;

    return NextResponse.json({
      accounts,
      transactions: includeTransactions ? filteredTransactions : [],
      alerts: includeAlerts ? filteredAlerts : [],
      // Makes the MAX_ALERTS cap above observable instead of silent.
      alertsTotal: allAlerts.length,
      hasMoreAlerts: includeAlerts && allAlerts.length > filteredAlerts.length,
      stats,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: start + limit < total,
      },
      source: "local",
      datasetScope: {
        accounts: "full source snapshot",
        transactions: "server-safe synthetic sample (all pattern rows + sampled clean rows)",
      },
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
  // Disjoint categories matching /api/analytics exactly so Dashboard
  // and Analytics always show identical numbers.
  const isSeverityTier = (r: Record<string, unknown>) =>
    r.risk_level === "critical" || r.risk_level === "high";
  const mules = accounts.filter(
    (a) => a.is_mule === true && isSeverityTier(a)
  ).length;
  const highRisk = total - mules;
  let totalTurnover = 0;
  let totalRisk = 0;

  // Flagged transaction rows (flagged === true) touching the flagged account
  // universe — exactly the predicate /api/analytics uses for its Flagged
  // Turnover figure, so Dashboard and Analytics agree. Unflagged rows that
  // merely touch a flagged account are excluded, and account aggregate fields
  // are not used here (they describe the full source snapshot, not the txn
  // sample).
  const flaggedIds = new Set(accounts.map((a) => String(a.account_id)));
  for (const txn of transactions) {
    if (txn.flagged !== true) continue;
    if (!flaggedIds.has(String(txn.from)) && !flaggedIds.has(String(txn.to))) continue;
    totalTurnover += toFinite(txn.amount);
  }

  for (const a of accounts) {
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
    else if (status === "resolved") resolvedAlerts++;
  }

  const avgRisk = total > 0 ? Math.round((totalRisk / total) * 10) / 10 : 0;

  return {
    totalAccounts: total,
    flaggedAccounts: mules + highRisk,
    muleCount: mules,
    highRiskCount: highRisk,
    totalVolume: totalTurnover,
    avgRiskScore: avgRisk,
    activeAlerts,
    resolvedAlerts,
    // Distinct transaction rows in the dataset (matches /api/analytics definition),
    // not the sum of per-account in/out counts which double-counts each hop.
    totalTransactions: transactions.length,
    // Flagged subset of those rows — part of the stats shape consumers are
    // typed against (useLocalData derives it from mockData's stats), so
    // this route must always provide it.
    flaggedTransactions: transactions.filter((t) => t.flagged === true).length,
    totalInDataset: 0,
  };
}
