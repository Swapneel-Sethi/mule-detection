import { NextResponse } from "next/server";
import { getFirestoreAdmin, FieldValue } from "@/lib/firebaseAdmin";
import { runDetection, type Account, type Transaction } from "@/lib/detectionEngine";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 1, delayMs = 3000): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      if (attempt === maxRetries) throw err;
      const isQuota = err instanceof Error && (err.message.includes("RESOURCE_EXHAUSTED") || err.message.includes("Quota"));
      if (!isQuota) throw err;
      console.log(`[detect] Retry ${attempt + 1}/${maxRetries} after ${delayMs}ms`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw new Error("Unreachable");
}

export async function POST() {
  const t0 = Date.now();
  try {
    const db = getFirestoreAdmin();

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

    // Write accounts in 2 batches (100 each) to stay under Firestore limits
    for (let i = 0; i < updatedAccounts.length; i += 100) {
      const chunk = updatedAccounts.slice(i, i + 100);
      await withRetry(async () => {
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
            detection_updated: FieldValue.serverTimestamp(),
          }, { merge: true });
        }
        await batch.commit();
      });
    }

    // Write alerts
    if (alerts.length > 0) {
      await withRetry(async () => {
        const alertBatch = db.batch();
        for (const alert of alerts) {
          const { id, ...data } = alert;
          alertBatch.set(db.collection("alerts").doc(id), { ...data, updatedAt: FieldValue.serverTimestamp() });
        }
        await alertBatch.commit();
      });
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
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
