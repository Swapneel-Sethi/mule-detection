import { NextResponse } from "next/server";
import { getFirestoreAdmin, getFieldValue } from "@/lib/firebaseAdmin";
import { generateSeed } from "@/scripts/seedData";
import { requireWriteToken } from "@/lib/apiAuth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const REQUIRED_ENV = ["FIREBASE_SERVICE_ACCOUNT_KEY"];

export async function POST(request: Request) {
  // 1. Token-protected (skip if no token set — local/dev convenience)
  const guard = requireWriteToken(request, "SEED_ROUTE_TOKEN");
  if (guard) return guard;

  // 2. Validate environment
  const missing = REQUIRED_ENV.filter((e) => !process.env[e]);
  if (missing.length > 0) {
    return NextResponse.json(
      { error: `Missing environment variables: ${missing.join(", ")}` },
      { status: 500 }
    );
  }

  try {
    const db = await getFirestoreAdmin();
    const FieldValue = await getFieldValue();

    const { accounts, transactions, alerts } = generateSeed();

    // Batch write accounts (Firestore max 500 ops per batch)
    for (let i = 0; i < accounts.length; i += 400) {
      const batch = db.batch();
      for (const acc of accounts.slice(i, i + 400)) {
        batch.set(db.collection("accounts").doc(acc.account_id), acc);
      }
      await batch.commit();
    }

    // Batch write transactions
    for (let i = 0; i < transactions.length; i += 400) {
      const batch = db.batch();
      for (const txn of transactions.slice(i, i + 400)) {
        batch.set(db.collection("transactions").doc(txn.transaction_id), txn);
      }
      await batch.commit();
    }

    // Batch write alerts
    if (alerts.length > 0) {
      const alertBatch = db.batch();
      for (const alert of alerts) {
        const { id, ...data } = alert;
        alertBatch.set(db.collection("alerts").doc(id), { ...data, createdAt: FieldValue.serverTimestamp() });
      }
      await alertBatch.commit();
    }

    return NextResponse.json({
      success: true,
      counts: {
        accounts: accounts.length,
        transactions: transactions.length,
        alerts: alerts.length,
      },
    });
  } catch (error: unknown) {
    console.error("Seed error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
