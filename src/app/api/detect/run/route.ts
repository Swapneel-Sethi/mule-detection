import { NextResponse } from "next/server";
import { getFirestoreAdmin, getFieldValue } from "@/lib/firebaseAdmin";
import { runDetection, type Account, type Transaction } from "@/lib/detectionEngine";

export const dynamic = "force-dynamic";

/**
 * Server-side proxy for /api/detect.
 * Runs the same pipeline directly — no self-referencing HTTP, no auth needed.
 */
export async function POST() {
  const t0 = Date.now();

  try {
    const db = await getFirestoreAdmin();
    const FieldValue = await getFieldValue();

    const [accountsSnap, transactionsSnap] = await Promise.all([
      db.collection("accounts").limit(200).get(),
      db.collection("transactions").limit(500).get(),
    ]);

    const rawAccounts: Account[] = accountsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Account);
    const rawTransactions: Transaction[] = transactionsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as unknown as Transaction);

    if (rawAccounts.length === 0) {
      return NextResponse.json({ error: "No accounts found. Seed data first." }, { status: 400 });
    }

    const { updatedAccounts, alerts, summary } = runDetection(rawAccounts, rawTransactions);

    for (let i = 0; i < updatedAccounts.length; i += 100) {
      const chunk = updatedAccounts.slice(i, i + 100);
      const batch = db.batch();
      for (const account of chunk) {
        const ref = db.collection("accounts").doc(account.id);
        batch.set(ref, {
          risk_score: account.risk_score,
          risk_level: account.risk_level,
          is_mule: account.is_mule,
          flags: account.flags,
          reasons: account.reasons,
          mule_type: account.mule_type,
          features: account.features,
          behavioral_score: account.behavioral_score,
          graph_score: account.graph_score,
          temporal_score: account.temporal_score,
          pagerank_score: account.pagerank_score,
          community_score: account.community_score,
          bridge_score: account.bridge_score,
          ml_score: account.ml_score,
          calibrated_score: account.calibrated_score,
          explanation: account.explanation,
          detection_updated: FieldValue.serverTimestamp(),
        }, { merge: true });
      }
      await batch.commit();
    }

    for (let i = 0; i < alerts.length; i += 100) {
      const chunk = alerts.slice(i, i + 100);
      const alertBatch = db.batch();
      for (const alert of chunk) {
        const { id, ...data } = alert;
        alertBatch.set(db.collection("alerts").doc(id), { ...data, updatedAt: FieldValue.serverTimestamp() });
      }
      await alertBatch.commit();
    }

    return NextResponse.json({
      success: true,
      summary,
      accounts_updated: updatedAccounts.length,
      alerts_created: alerts.length,
      duration_ms: Date.now() - t0,
    });
  } catch (error: unknown) {
    console.error("Detection error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
