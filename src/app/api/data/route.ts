import { NextResponse } from "next/server";
import { getFirestoreAdmin } from "@/lib/firebaseAdmin";

export const dynamic = "force-dynamic";

function normalizeAccount(raw: Record<string, unknown>, docId: string): Record<string, unknown> {
  const isFirestoreSchema = "risk_score" in raw || "is_mule" in raw || "features" in raw;

  if (isFirestoreSchema) {
    const f = (raw.features || {}) as Record<string, unknown>;
    const level = String(raw.risk_level || "LOW").toUpperCase();
    const riskLevel = level === "HIGH" ? "high" : level === "MEDIUM" ? "medium" : level === "CRITICAL" ? "critical" : "low";
    const flags: string[] = [];
    if (f.is_fan_in) flags.push("fan_in");
    if (f.is_fan_out) flags.push("fan_out");
    if (f.is_transit) flags.push("transit");
    if (raw.is_mule) flags.push("confirmed_mule");
    if ((f.near_zero_balance_ratio as number) > 0.8) flags.push("near_zero_balance");
    if ((f.money_in_out_velocity as number) > 50000) flags.push("high_velocity");

    return {
      id: raw.account_id || docId,
      name: raw.account_id || docId,
      bank: raw.city || "Unknown",
      riskScore: raw.risk_score || 0,
      riskLevel,
      totalTransactions: ((f.in_degree as number) || 0) + ((f.out_degree as number) || 0),
      totalAmount: raw.total_turnover || 0,
      firstSeen: raw.age_days ? `${raw.age_days}d ago` : "N/A",
      lastActivity: "",
      flags,
      status: raw.is_mule ? "under_review" : "active",
      isMule: !!raw.is_mule,
      city: raw.city || "Unknown",
      muleType: raw.mule_type || "",
      turnover: raw.total_turnover || 0,
      balance: raw.a_balance || 0,
      reasons: raw.reasons || [],
      inDegree: (f.in_degree as number) || 0,
      outDegree: (f.out_degree as number) || 0,
    };
  }

  // Old/mock format — fill in missing MappedAccount fields
  return {
    id: raw.id || docId,
    name: raw.name || docId,
    bank: raw.bank || "Unknown",
    riskScore: raw.riskScore || 0,
    riskLevel: raw.riskLevel || "low",
    totalTransactions: raw.totalTransactions || 0,
    totalAmount: raw.totalAmount || 0,
    firstSeen: raw.firstSeen || "N/A",
    lastActivity: raw.lastActivity || "",
    flags: raw.flags || [],
    status: raw.status || "active",
    isMule: raw.isMule ?? false,
    city: raw.bank || "Unknown",
    muleType: raw.muleType || "",
    turnover: raw.totalAmount || 0,
    balance: raw.balance || 0,
    reasons: raw.reasons || [],
    inDegree: raw.inDegree || 0,
    outDegree: raw.outDegree || 0,
  };
}

export async function GET() {
  try {
    const db = await getFirestoreAdmin();

    const [accountsSnap, alertsSnap] = await Promise.all([
      db.collection("accounts").limit(200).get(),
      db.collection("alerts").limit(100).get(),
    ]);

    const accounts = accountsSnap.docs.map((doc) => normalizeAccount(doc.data() as Record<string, unknown>, doc.id));
    const alerts = alertsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

    const flaggedAccounts = accounts.filter((a) => (a.riskScore as number) >= 60).length;
    const totalVolume = accounts.reduce((sum, a) => sum + ((a.turnover as number) || (a.totalAmount as number) || 0), 0);
    const avgRiskScore = accounts.length
      ? Math.round((accounts.reduce((sum: number, a) => sum + (a.riskScore as number), 0) / accounts.length) * 10) / 10
      : 0;

    return NextResponse.json({
      accounts,
      alerts,
      stats: {
        totalAccounts: accounts.length,
        flaggedAccounts,
        totalTransactions: accounts.reduce((sum, a) => sum + ((a.totalTransactions as number) || 0), 0),
        flaggedTransactions: accounts.filter((a) => (a.riskScore as number) >= 60).length,
        totalVolume,
        activeAlerts: alerts.filter((a: Record<string, unknown>) => a.status === "new" || a.status === "investigating").length,
        resolvedAlerts: alerts.filter((a: Record<string, unknown>) => a.status === "resolved").length,
        avgRiskScore,
      },
    });
  } catch (error: unknown) {
    console.error("Data fetch error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
