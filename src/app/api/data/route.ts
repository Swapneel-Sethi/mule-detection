import { NextResponse } from "next/server";
import { getFirestoreAdmin } from "@/lib/firebaseAdmin";
import { normalizeAccount, mapAlert, computeStats } from "@/lib/normalizers";

export const dynamic = "force-dynamic";

export const maxDuration = 30;

function sanitizeError(error: unknown): string {
  const msg = error instanceof Error ? error.message : "Unknown error";
  // Blocklist more sensitive patterns — not just FIREBASE/firestore
  const sensitivePatterns = [
    "FIREBASE", "firestore", "project", "credential", "IAM", "gcp",
    "service_account", "private_key", "token", "secret",
  ];
  for (const pattern of sensitivePatterns) {
    if (msg.toLowerCase().includes(pattern.toLowerCase())) {
      return "Data fetch failed. Please try again.";
    }
  }
  return msg;
}

export async function GET(request: Request) {
  try {
    const db = await getFirestoreAdmin();
    const { searchParams } = new URL(request.url);

    const limitParam = parseInt(searchParams.get("limit") || "200");
    const limit = Math.min(Math.max(limitParam, 1), 10000);
    const page = Math.max(parseInt(searchParams.get("page") || "1"), 1);
    const sortBy = searchParams.get("sort") || "risk_score";
    const order = searchParams.get("order") || "desc";
    const riskFilter = searchParams.get("risk") || "";
    const searchQuery = searchParams.get("q") || "";

    let query: FirebaseFirestore.Query = db.collection("accounts");

    if (riskFilter) {
      query = query.where("risk_level", "==", riskFilter);
    }

    const orderField = sortBy === "risk" ? "risk_score" : sortBy;
    query = query.orderBy(orderField, order === "asc" ? "asc" : "desc");

    const offset = (page - 1) * limit;
    if (offset > 0) {
      const offsetSnap = await query.limit(offset).get();
      const lastDoc = offsetSnap.docs[offsetSnap.docs.length - 1];
      if (lastDoc) {
        query = query.startAfter(lastDoc);
      }
    }

    const [accountsSnap, alertsSnap] = await Promise.all([
      query.limit(limit).get(),
      db.collection("alerts").limit(100).get(),
    ]);

    let totalCount = accountsSnap.size;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const countRef = db.collection("accounts") as any;
      if (typeof countRef.count === "function") {
        const countSnap = await countRef.count().get();
        totalCount = countSnap.data().count;
      }
    } catch (countErr) {
      console.warn("Count query failed, using snapshot size:", countErr);
      totalCount = Math.max(500, accountsSnap.size);
    }

    let accounts = accountsSnap.docs.map((doc: FirebaseFirestore.QueryDocumentSnapshot) =>
      normalizeAccount({ id: doc.id, ...doc.data() } as Record<string, unknown>)
    );

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      accounts = accounts.filter(
        (a: ReturnType<typeof normalizeAccount>) =>
          a.id.toLowerCase().includes(q) ||
          a.name.toLowerCase().includes(q) ||
          a.bank.toLowerCase().includes(q)
      );
    }

    const alerts = alertsSnap.docs.map((doc: FirebaseFirestore.QueryDocumentSnapshot) =>
      mapAlert({ id: doc.id, ...doc.data() } as Record<string, unknown>)
    );

    const stats = computeStats(accounts, alerts);
    stats.totalAccounts = totalCount;

    return NextResponse.json({
      accounts,
      alerts,
      stats,
      pagination: {
        page,
        limit,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limit),
        hasMore: offset + limit < totalCount,
      },
    });
  } catch (error: unknown) {
    console.error("Data fetch error:", error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
