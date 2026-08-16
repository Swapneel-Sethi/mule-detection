/**
 * Firestore Seed Script
 * Run: npx tsx scripts/seed-firestore.ts
 */

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

// Initialize Firebase Admin with default credentials
// For local dev: export GOOGLE_APPLICATION_CREDENTIALS=path/to/serviceAccountKey.json
// Or use: firebase login:cors

const firebaseConfig = {
  projectId: "mule-detection-model",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const ACCOUNT_NAMES = [
  "Rajesh Kumar", "Priya Sharma", "Amit Patel", "Sneha Gupta", "Vikram Singh",
  "Ananya Reddy", "Karthik Nair", "Pooja Desai", "Sanjay Mehta", "Neha Joshi",
  "Arjun Rao", "Kavita Iyer", "Ravi Teja", "Deepa Menon", "Suresh Babu",
  "Lakshmi Devi", "Ganesh Pai", "Meena Kumari", "Prakash Shetty", "Sunita Verma",
];

const BANKS = [
  "SBI", "HDFC Bank", "ICICI Bank", "Axis Bank", "Kotak Mahindra",
  "Punjab National Bank", "Bank of Baroda", "Canara Bank", "Union Bank", "IDBI Bank",
];

const FLAG_TYPES = [
  "rapid_movement", "fan_in", "fan_out", "circular_transfer",
  "dormant_account", "high_value", "multiple_banks", "new_account",
];

function rand(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateAccounts(count: number) {
  const accounts = [];
  for (let i = 0; i < count; i++) {
    const riskScore = Math.random() * 100;
    const riskLevel =
      riskScore >= 80 ? "critical" :
      riskScore >= 60 ? "high" :
      riskScore >= 40 ? "medium" : "low";

    accounts.push({
      id: `ACC${String(i + 1).padStart(4, "0")}`,
      name: ACCOUNT_NAMES[i % ACCOUNT_NAMES.length],
      bank: BANKS[i % BANKS.length],
      riskScore: Math.round(riskScore * 10) / 10,
      riskLevel,
      totalTransactions: rand(10, 500),
      totalAmount: rand(50000, 5000000),
      firstSeen: `2024-${String(rand(1, 12)).padStart(2, "0")}-${String(rand(1, 28)).padStart(2, "0")}`,
      lastActivity: `2026-${String(rand(1, 8)).padStart(2, "0")}-${String(rand(1, 28)).padStart(2, "0")}`,
      flags: Array.from({ length: rand(0, 3) }, () => pick(FLAG_TYPES)),
      status: riskScore >= 80 ? "under_review" : riskScore >= 60 ? "active" : Math.random() > 0.7 ? "frozen" : "active",
    });
  }
  return accounts;
}

function generateTransactions(accounts: any[], count: number) {
  const types = ["transfer", "payment", "withdrawal", "deposit"];
  const transactions = [];

  for (let i = 0; i < count; i++) {
    const fromIdx = rand(0, accounts.length - 1);
    let toIdx = rand(0, accounts.length - 1);
    while (toIdx === fromIdx) toIdx = rand(0, accounts.length - 1);

    const riskScore = Math.random() * 100;
    const h = rand(0, 23);
    const m = rand(0, 59);
    const d = rand(1, 15);

    transactions.push({
      id: `TXN${String(i + 1).padStart(6, "0")}`,
      from: accounts[fromIdx].id,
      to: accounts[toIdx].id,
      amount: rand(1000, 500000),
      timestamp: `2026-08-${String(d).padStart(2, "0")}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`,
      type: pick(types),
      flagged: riskScore > 70,
      riskScore: Math.round(riskScore * 10) / 10,
    });
  }
  return transactions;
}

function generateAlerts(accounts: any[]) {
  const alertData = [
    { type: "rapid_movement", title: "Rapid Fund Movement Detected", description: "Account ACC0003 received and forwarded ₹4,50,000 within 12 minutes across 3 intermediary accounts." },
    { type: "fan_in", title: "Multiple Inbound Transfers to Single Account", description: "7 distinct accounts transferred funds to ACC0007 within a 2-hour window, totaling ₹12,30,000." },
    { type: "fan_out", title: "Single Account Dispersing to Multiple Recipients", description: "ACC0012 distributed ₹8,75,000 to 9 unrelated accounts within 45 minutes." },
    { type: "circular", title: "Circular Transfer Pattern Identified", description: "Funds traced through ACC0001 → ACC0005 → ACC0009 → ACC0001 loop totaling ₹3,20,000." },
    { type: "behavioral_change", title: "Sudden Behavioral Anomaly", description: "ACC0015 showed a 340% increase in transaction volume after 6 months of dormancy." },
    { type: "dormant_activation", title: "Dormant Account Reactivation", description: "ACC0018 activated after 11 months of inactivity with a high-value transfer of ₹2,50,000." },
    { type: "rapid_movement", title: "Layering Pattern Detected", description: "Funds moved through 5 accounts in under 30 minutes, obscuring the origin of ₹6,80,000." },
    { type: "fan_in", title: "Concentration Risk", description: "ACC0010 accumulated ₹15,00,000 from 12 different accounts within 48 hours." },
  ];

  const severities = ["critical", "high", "medium", "low"];
  const statuses = ["new", "investigating", "resolved", "dismissed"];

  return alertData.map((a, i) => ({
    id: `ALT${String(i + 1).padStart(4, "0")}`,
    type: a.type,
    severity: severities[i % severities.length],
    title: a.title,
    description: a.description,
    accounts: [accounts[i % accounts.length].id, accounts[(i + 3) % accounts.length].id],
    timestamp: new Date(2026, 7, 15 - i, 10 + i, i * 7).toISOString(),
    status: statuses[i % statuses.length],
    transactions: [`TXN${String(i + 1).padStart(6, "0")}`],
  }));
}

async function seed() {
  console.log("Seeding Firestore for project: mule-detection-model...");

  const accounts = generateAccounts(20);
  const transactions = generateTransactions(accounts, 80);
  const alerts = generateAlerts(accounts);

  // Seed accounts
  console.log(`Seeding ${accounts.length} accounts...`);
  const accountsBatch = db.batch();
  accounts.forEach((a) => {
    const ref = db.collection("accounts").doc(a.id);
    accountsBatch.set(ref, { ...a, updatedAt: FieldValue.serverTimestamp() });
  });
  await accountsBatch.commit();
  console.log("Accounts seeded.");

  // Seed transactions
  console.log(`Seeding ${transactions.length} transactions...`);
  const txBatch = db.batch();
  transactions.forEach((t) => {
    const ref = db.collection("transactions").doc(t.id);
    txBatch.set(ref, { ...t, updatedAt: FieldValue.serverTimestamp() });
  });
  await txBatch.commit();
  console.log("Transactions seeded.");

  // Seed alerts
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
