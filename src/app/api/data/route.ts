import { NextResponse } from "next/server";
import { getFirestoreAdmin } from "@/lib/firebaseAdmin";
import { normalizeAccount } from "@/lib/normalizers";

export const dynamic = "force-dynamic";

function sanitizeError(error: unknown): string {
  const msg = error instanceof Error ? error.message : "Unknown error";
  if (msg.includes("FIREBASE") || msg.includes("firestore") || msg.includes("project")) {
    return "Data fetch failed. Please try again.";
  }
  return msg;
}

export async function GET() {
  try {
    const db = await getFirestoreAdmin();

    const [accountsSnap, alertsSnap] = await Promise.all([
      db.collection("accounts").limit(200).get(),
      db.collection("alerts").limit(100).get(),
    ]);

    const accounts = accountsSnap.docs.map((doc) => normalizeAccount(doc.data() as Record<string, unknown>));
    const alerts = alertsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

    const flaggedAccounts = accounts.filter((a) => a.riskScore >= 60).length;
    const totalVolume = accounts.reduce((sum, a) => sum + a.turnover, 0);
    const avgRiskScore = accounts.length
      ? Math.round((accounts.reduce((sum, a) => sum + a.riskScore, 0) / accounts.length) * 10) / 10
      : 0;

    return NextResponse.json({
      accounts,
      alerts,
      stats: {
        totalAccounts: accounts.length,
        flaggedAccounts,
        totalTransactions: accounts.reduce((sum, a) => sum + a.totalTransactions, 0),
        flaggedTransactions: alerts.filter((a: Record<string, unknown>) => a.type === "rapid_movement" || a.type === "fan_in" || a.type === "fan_out" || a.type === "circular_transfer").length,
        totalVolume,
        activeAlerts: alerts.filter((a: Record<string, unknown>) => a.status === "new" || a.status === "investigating").length,
        resolvedAlerts: alerts.filter((a: Record<string, unknown>) => a.status === "resolved").length,
        avgRiskScore,
      },
    });
  } catch (error: unknown) {
    console.error("Data fetch error:", error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
