import { NextResponse } from "next/server";
import { getFirestoreAdmin, getFieldValue } from "@/lib/firebaseAdmin";
import { runDetection, type Account, type Transaction } from "@/lib/detectionEngine";
import { requireWriteToken } from "@/lib/apiAuth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function sanitizeError(error: unknown): string {
  const msg = error instanceof Error ? error.message : "Unknown error";
  if (msg.includes("FIREBASE") || msg.includes("firestore") || msg.includes("project") || msg.includes("private_key")) {
    return "Detection service error. Please try again.";
  }
  return msg;
}

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 2, delayMs = 3000): Promise<T> {
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

export async function POST(request: Request) {
  const t0 = Date.now();

  const guard = requireWriteToken(request, "DETECT_ROUTE_TOKEN");
  if (guard) return guard;

  try {
    const db = await getFirestoreAdmin();
    const FieldValue = await getFieldValue();

    let body: Record<string, unknown> = {};
    try {
      body = await request.json();
    } catch {}

    const mode = (body.mode as string) || "full";
    const skipDetection = body.skip_detection === true;

    if (skipDetection) {
      return NextResponse.json({
        success: true,
        summary: { mode: "skip", message: "Detection skipped — using pre-computed ML scores." },
        duration_ms: Date.now() - t0,
      });
    }

    let accountLimit = 500;
    let txnLimit = 2000;
    if (mode === "sample") {
      accountLimit = 200;
      txnLimit = 500;
    } else if (mode === "batch") {
      accountLimit = 1000;
      txnLimit = 5000;
    }

    const [accountsSnap, transactionsSnap] = await Promise.all([
      db.collection("accounts").limit(accountLimit).get(),
      db.collection("transactions").limit(txnLimit).get(),
    ]);

    const rawAccounts: Account[] = accountsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Account);
    const rawTransactions: Transaction[] = transactionsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as unknown as Transaction);

    if (rawAccounts.length === 0) {
      return NextResponse.json({ error: "No accounts found. Seed data first." }, { status: 400 });
    }

    const { updatedAccounts, alerts, summary } = runDetection(rawAccounts, rawTransactions);

    for (let i = 0; i < updatedAccounts.length; i += 450) {
      const chunk = updatedAccounts.slice(i, i + 450);
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
      });
    }

    for (let i = 0; i < alerts.length; i += 450) {
      const chunk = alerts.slice(i, i + 450);
      await withRetry(async () => {
        const alertBatch = db.batch();
        for (const alert of chunk) {
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
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
