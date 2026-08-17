import { initializeApp, cert, App } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { NextResponse, NextRequest } from "next/server";

let firebaseApp: App | null = null;

function getFirebaseAdmin(): App {
  if (firebaseApp) return firebaseApp;

  const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!serviceAccountKey) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_KEY not set");
  }

  let serviceAccount: Record<string, string>;
  try {
    serviceAccount = JSON.parse(serviceAccountKey);
  } catch {
    throw new Error("Invalid FIREBASE_SERVICE_ACCOUNT_KEY format");
  }

  firebaseApp = initializeApp({
    credential: cert(serviceAccount),
    projectId: "mule-detection-model",
  });

  return firebaseApp;
}

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

export const maxDuration = 30;
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const seedToken = request.headers.get("x-seed-token");
    if (!seedToken || seedToken !== process.env.SEED_ROUTE_TOKEN) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const app = getFirebaseAdmin();
    const db = getFirestore(app);

    type AccountData = {
      id: string; name: string; bank: string; riskScore: number; riskLevel: string;
      totalTransactions: number; totalAmount: number; firstSeen: string; lastActivity: string;
      flags: string[]; status: string;
    };
    const accounts: AccountData[] = [];
    for (let i = 0; i < 20; i++) {
      const riskScore = Math.random() * 100;
      accounts.push({
        id: `ACC${String(i + 1).padStart(4, "0")}`,
        name: ACCOUNT_NAMES[i % ACCOUNT_NAMES.length],
        bank: BANKS[i % BANKS.length],
        riskScore: Math.round(riskScore * 10) / 10,
        riskLevel: riskScore >= 80 ? "critical" : riskScore >= 60 ? "high" : riskScore >= 40 ? "medium" : "low",
        totalTransactions: rand(10, 500),
        totalAmount: rand(50000, 5000000),
        firstSeen: `2024-${String(rand(1, 12)).padStart(2, "0")}-${String(rand(1, 28)).padStart(2, "0")}`,
        lastActivity: `2026-${String(rand(1, 8)).padStart(2, "0")}-${String(rand(1, 28)).padStart(2, "0")}`,
        flags: Array.from({ length: rand(0, 3) }, () => pick(FLAG_TYPES)),
        status: riskScore >= 80 ? "under_review" : riskScore >= 60 ? "active" : Math.random() > 0.7 ? "frozen" : "active",
      });
    }

    const types = ["transfer", "payment", "withdrawal", "deposit"];
    type TxnData = {
      id: string; from: string; to: string; amount: number; timestamp: string;
      type: string; flagged: boolean; riskScore: number;
    };
    const transactions: TxnData[] = [];
    for (let i = 0; i < 80; i++) {
      const fromIdx = rand(0, 19);
      let toIdx = rand(0, 19);
      while (toIdx === fromIdx) toIdx = rand(0, 19);
      const riskScore = Math.random() * 100;
      transactions.push({
        id: `TXN${String(i + 1).padStart(6, "0")}`,
        from: accounts[fromIdx].id,
        to: accounts[toIdx].id,
        amount: rand(1000, 500000),
        timestamp: `2026-08-${String(rand(1, 15)).padStart(2, "0")}T${String(rand(0, 23)).padStart(2, "0")}:${String(rand(0, 59)).padStart(2, "0")}:00`,
        type: pick(types),
        flagged: riskScore > 70,
        riskScore: Math.round(riskScore * 10) / 10,
      });
    }

    const severities = ["critical", "high", "medium", "low"];
    const statuses = ["new", "investigating", "resolved", "dismissed"];
    const alertTemplates = [
      { type: "rapid_movement", title: "Rapid Fund Movement Detected", description: "Account ACC0003 received and forwarded ₹4,50,000 within 12 minutes across 3 intermediary accounts." },
      { type: "fan_in", title: "Multiple Inbound Transfers to Single Account", description: "7 distinct accounts transferred funds to ACC0007 within a 2-hour window, totaling ₹12,30,000." },
      { type: "fan_out", title: "Single Account Dispersing to Multiple Recipients", description: "ACC0012 distributed ₹8,75,000 to 9 unrelated accounts within 45 minutes." },
      { type: "circular", title: "Circular Transfer Pattern Identified", description: "Funds traced through ACC0001 → ACC0005 → ACC0009 → ACC0001 loop totaling ₹3,20,000." },
      { type: "behavioral_change", title: "Sudden Behavioral Anomaly", description: "ACC0015 showed a 340% increase in transaction volume after 6 months of dormancy." },
      { type: "dormant_activation", title: "Dormant Account Reactivation", description: "ACC0018 activated after 11 months of inactivity with a high-value transfer of ₹2,50,000." },
      { type: "rapid_movement", title: "Layering Pattern Detected", description: "Funds moved through 5 accounts in under 30 minutes, obscuring the origin of ₹6,80,000." },
      { type: "fan_in", title: "Concentration Risk", description: "ACC0010 accumulated ₹15,00,000 from 12 different accounts within 48 hours." },
    ];

    const alerts = alertTemplates.map((a, i) => ({
      id: `ALT${String(i + 1).padStart(4, "0")}`,
      ...a,
      severity: severities[i % severities.length],
      accounts: [accounts[i % accounts.length].id, accounts[(i + 3) % accounts.length].id],
      timestamp: new Date(2026, 7, 15 - i, 10 + i, i * 7).toISOString(),
      status: statuses[i % statuses.length],
      transactions: [`TXN${String(i + 1).padStart(6, "0")}`],
    }));

    const batch1 = db.batch();
    accounts.forEach((a) => {
      batch1.set(db.collection("accounts").doc(a.id), { ...a, updatedAt: FieldValue.serverTimestamp() });
    });
    await batch1.commit();

    const batch2 = db.batch();
    transactions.forEach((t) => {
      batch2.set(db.collection("transactions").doc(t.id), { ...t, updatedAt: FieldValue.serverTimestamp() });
    });
    await batch2.commit();

    const batch3 = db.batch();
    alerts.forEach((a) => {
      batch3.set(db.collection("alerts").doc(a.id), { ...a, updatedAt: FieldValue.serverTimestamp() });
    });
    await batch3.commit();

    return NextResponse.json({
      success: true,
      seeded: { accounts: accounts.length, transactions: transactions.length, alerts: alerts.length },
    });
  } catch (error: unknown) {
    console.error("Seed error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
