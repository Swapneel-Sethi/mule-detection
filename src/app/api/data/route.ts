import { NextResponse } from "next/server";
import { getFirestoreAdmin } from "@/lib/firebaseAdmin";
import { normalizeAccount, mapAlert, computeStats } from "@/lib/normalizers";

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
    const alerts = alertsSnap.docs.map((doc) => mapAlert({ id: doc.id, ...doc.data() } as Record<string, unknown>));
    const stats = computeStats(accounts, alerts);

    return NextResponse.json({ accounts, alerts, stats });
  } catch (error: unknown) {
    console.error("Data fetch error:", error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
