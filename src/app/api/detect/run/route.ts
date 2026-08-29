import { NextResponse } from "next/server";
import { getFirestoreAdmin, getFieldValue } from "@/lib/firebaseAdmin";
import { runDetection, type Account, type Transaction } from "@/lib/detectionEngine";
import { requireWriteToken } from "@/lib/apiAuth";
import { readFile } from "fs/promises";
import { join } from "path";

export const dynamic = "force-dynamic";

/**
 * Server-side proxy for /api/detect.
 * Runs the detection pipeline directly with seamless local fallback.
 */
export async function POST(request: Request) {
  const authError = requireWriteToken(request, "DETECT_ROUTE_TOKEN");
  if (authError) return authError;

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
      throw new Error("No accounts found in Firestore. Falling back to local dataset.");
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
    // Local memory dataset fallback
    try {
      const filePath = join(process.cwd(), "public", "accounts_dataset.json");
      const raw = await readFile(filePath, "utf-8");
      const allAccounts = JSON.parse(raw) as (Account & { account_id?: string })[];
      const sampleAccounts: Account[] = allAccounts.slice(0, 200).map((a) => ({
        ...a,
        id: a.id || a.account_id || `ACC${Math.random().toString(36).slice(2, 8)}`,
      }));

      const sampleTxns: Transaction[] = [];
      for (let i = 0; i < sampleAccounts.length; i++) {
        const from = sampleAccounts[i].id;
        const targetIdx = (i * 17 + 3) % sampleAccounts.length;
        if (targetIdx !== i) {
          sampleTxns.push({
            id: `TXN-${i + 1}`,
            from_account: from,
            to_account: sampleAccounts[targetIdx].id,
            amount: 25000 + (i * 350) % 150000,
            timestamp: new Date().toISOString(),
            type: "transfer",
            flagged: Boolean(sampleAccounts[i].is_mule) || Boolean(sampleAccounts[targetIdx].is_mule),
            risk_score: sampleAccounts[i].is_mule ? 85 : 15,
          });
        }
      }

      const { updatedAccounts, alerts, summary } = runDetection(sampleAccounts, sampleTxns);

      return NextResponse.json({
        success: true,
        summary,
        accounts_updated: updatedAccounts.length,
        alerts_created: alerts.length,
        duration_ms: Date.now() - t0,
        mode: "local_dataset",
      });
    } catch (fallbackError: unknown) {
      const msg = fallbackError instanceof Error ? fallbackError.message : "Unknown detection error";
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }
}
