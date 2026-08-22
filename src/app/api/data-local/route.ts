import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";

export const dynamic = "force-dynamic";

let cachedData: Record<string, unknown>[] | null = null;

async function loadDataset(): Promise<Record<string, unknown>[]> {
  if (cachedData) return cachedData;
  const filePath = join(process.cwd(), "public", "accounts_dataset.json");
  const raw = await readFile(filePath, "utf-8");
  cachedData = JSON.parse(raw) as Record<string, unknown>[];
  return cachedData;
}

function generateGraphTransactions(
  accounts: Record<string, unknown>[]
) {
  const transactions = [];
  const seen = new Set<string>();

  for (let i = 0; i < accounts.length; i++) {
    const from = String(accounts[i].account_id || "");
    if (!from) continue;

    const outDegree = Math.min(
      Number(accounts[i].unique_receivers || accounts[i].outDegree || 0),
      8
    );

    for (let j = 1; j <= outDegree; j++) {
      const targetIndex = (i * 17 + j * 13) % accounts.length;
      if (targetIndex === i) continue;

      const to = String(accounts[targetIndex].account_id || "");
      if (!to) continue;

      const key = `${from}->${to}`;
      if (seen.has(key)) continue;
      seen.add(key);

      transactions.push({
        id: `GRAPH-${transactions.length + 1}`,
        from,
        to,
        amount: Math.max(
          1000,
          Math.round(
            Number(accounts[i].avg_out_amount || 1000) +
            Number(accounts[targetIndex].avg_in_amount || 0)
          )
        ),
        type: "transfer",
        flagged:
          Boolean(accounts[i].is_mule) ||
          Boolean(accounts[targetIndex].is_mule),
      });

      if (transactions.length >= 2500) return transactions;
    }
  }

  return transactions;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "200"), 1), 5000);
    const page = Math.max(parseInt(searchParams.get("page") || "1"), 1);
    const sortBy = searchParams.get("sort") || "risk_score";
    const order = searchParams.get("order") || "desc";
    const riskFilter = searchParams.get("risk") || "";
    const searchQuery = searchParams.get("q") || "";

    const allData = await loadDataset();

    let filtered = allData;

    if (riskFilter) {
      filtered = filtered.filter((r) => r.risk_level === riskFilter);
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (r) =>
          String(r.account_id || "").toLowerCase().includes(q) ||
          String(r.name || "").toLowerCase().includes(q) ||
          String(r.bank || "").toLowerCase().includes(q)
      );
    }

    const sortField = sortBy === "risk" ? "risk_score" : sortBy;
    filtered.sort((a, b) => {
      const av = Number(a[sortField]) || 0;
      const bv = Number(b[sortField]) || 0;
      return order === "asc" ? av - bv : bv - av;
    });

    const total = filtered.length;
    const start = (page - 1) * limit;
    const accounts = filtered.slice(start, start + limit);

    const stats = computeStats(filtered);
    const transactions = generateGraphTransactions(accounts);

    return NextResponse.json({
      accounts,
      transactions,
      alerts: [],
      stats,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: start + limit < total,
      },
      source: "local",
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

function computeStats(accounts: Record<string, unknown>[]) {
  const total = accounts.length;
  const mules = accounts.filter((a) => a.is_mule === true).length;
  const riskCounts = { critical: 0, high: 0, medium: 0, low: 0 };
  let totalTurnover = 0;
  let totalRisk = 0;

  for (const a of accounts) {
    const level = String(a.risk_level || "low");
    if (level in riskCounts) riskCounts[level as keyof typeof riskCounts]++;
    totalTurnover += Number(a.total_in_amount || 0) + Number(a.total_out_amount || 0);
    totalRisk += Number(a.risk_score || 0);
  }

  return {
    totalAccounts: total,
    flaggedAccounts: mules,
    turnover: totalTurnover,
    avgRisk: total > 0 ? Math.round((totalRisk / total) * 10) / 10 : 0,
    riskDistribution: riskCounts,
    alertsTotal: 0,
    alertsResolved: 0,
  };
}
