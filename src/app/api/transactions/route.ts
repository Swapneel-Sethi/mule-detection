import { NextResponse } from "next/server";
import { loadDataset } from "@/lib/datasets";

export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
// Account ids in the dataset are "ACC"/"ACM" + alphanumeric suffixes; the
// cap only guards against junk strings driving full-dataset scans.
const MAX_ID_LENGTH = 64;

/**
 * GET /api/transactions?id=<account_id>&limit=&offset=
 *
 * Full transaction history for one account (both directions), newest first,
 * paginated. Powers the Accounts page detail drawer.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = (searchParams.get("id") || "").trim().slice(0, MAX_ID_LENGTH);
    if (!id) {
      return NextResponse.json({ error: "Missing required ?id=<account_id>" }, { status: 400 });
    }

    const toInt = (raw: string | null, fallback: number): number => {
      const n = parseInt(raw ?? "", 10);
      return Number.isFinite(n) ? n : fallback;
    };
    const limit = Math.min(Math.max(toInt(searchParams.get("limit"), DEFAULT_LIMIT), 1), MAX_LIMIT);
    const offset = Math.max(toInt(searchParams.get("offset"), 0), 0);

    const [accounts, transactions] = await Promise.all([
      loadDataset("accounts_dataset.json"),
      loadDataset("transactions_synthetic.json"),
    ]);

    const exists = accounts.some((a) => String(a.account_id ?? "") === id);
    if (!exists) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    // Both directions, newest first. Timestamps share one ISO-like format in
    // the artifact, so lexicographic order equals chronological order.
    const matched = transactions.filter(
      (t) => String(t.from ?? "") === id || String(t.to ?? "") === id
    );
    matched.sort((a, b) => String(b.timestamp ?? "").localeCompare(String(a.timestamp ?? "")));

    const page = matched.slice(offset, offset + limit);
    return NextResponse.json(
      {
        accountId: id,
        total: matched.length,
        limit,
        offset,
        hasMore: offset + page.length < matched.length,
        transactions: page,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error: unknown) {
    console.error("[api/transactions] request failed:", error);
    return NextResponse.json({ error: "Failed to load transactions" }, { status: 500 });
  }
}
