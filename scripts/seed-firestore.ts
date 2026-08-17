/**
 * Firestore Seed Script (standalone runner)
 * Run: npx tsx scripts/seed-firestore.ts
 *
 * Uses FIREBASE_SERVICE_ACCOUNT_KEY from environment (or GOOGLE_APPLICATION_CREDENTIALS).
 */

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { generateSeed } from "../src/scripts/seedData";

// Reuse existing app if already initialized (e.g., by test harness)
const app = getApps().length
  ? getApps()[0]
  : initializeApp({
      credential: process.env.FIREBASE_SERVICE_ACCOUNT_KEY
        ? cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY))
        : undefined,
      projectId: "mule-detection-model",
    });

const db = getFirestore(app);

async function seed() {
  console.log("Seeding Firestore for project: mule-detection-model...");

  const { accounts, transactions, alerts } = generateSeed();

  console.log(`Seeding ${accounts.length} accounts...`);
  const accountsBatch = db.batch();
  accounts.forEach((a) => {
    const ref = db.collection("accounts").doc(a.account_id);
    accountsBatch.set(ref, { ...a, updatedAt: FieldValue.serverTimestamp() });
  });
  await accountsBatch.commit();
  console.log("Accounts seeded.");

  console.log(`Seeding ${transactions.length} transactions...`);
  const txBatch = db.batch();
  transactions.forEach((t) => {
    const ref = db.collection("transactions").doc(t.transaction_id);
    txBatch.set(ref, { ...t, updatedAt: FieldValue.serverTimestamp() });
  });
  await txBatch.commit();
  console.log("Transactions seeded.");

  console.log(`Seeding ${alerts.length} alerts...`);
  const alertsBatch = db.batch();
  alerts.forEach((a) => {
    const ref = db.collection("alerts").doc(a.id);
    alertsBatch.set(ref, { ...a, updatedAt: FieldValue.serverTimestamp() });
  });
  await alertsBatch.commit();
  console.log("Alerts seeded.");

  console.log("✅ Firestore seeding complete!");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seeding failed:", err);
  process.exit(1);
});
