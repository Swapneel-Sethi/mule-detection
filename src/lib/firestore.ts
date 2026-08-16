import {
  collection,
  getDocs,
  doc,
  getDoc,
  query,
  where,
  orderBy,
  limit,
  writeBatch,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "./firebase";

export interface Account {
  id: string;
  name: string;
  bank: string;
  riskScore: number;
  riskLevel: "critical" | "high" | "medium" | "low";
  totalTransactions: number;
  totalAmount: number;
  firstSeen: string;
  lastActivity: string;
  flags: string[];
  status: "active" | "frozen" | "under_review";
}

export interface Transaction {
  id: string;
  from: string;
  to: string;
  amount: number;
  timestamp: string;
  type: "transfer" | "payment" | "withdrawal" | "deposit";
  flagged: boolean;
  riskScore: number;
}

export interface Alert {
  id: string;
  type: "rapid_movement" | "fan_in" | "fan_out" | "circular" | "behavioral_change" | "dormant_activation";
  severity: "critical" | "high" | "medium" | "low";
  title: string;
  description: string;
  accounts: string[];
  timestamp: string;
  status: "new" | "investigating" | "resolved" | "dismissed";
  transactions: string[];
}

// --- Accounts ---

export async function getAccounts(): Promise<Account[]> {
  const snapshot = await getDocs(collection(db, "accounts"));
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Account));
}

export async function getAccount(id: string): Promise<Account | null> {
  const docRef = doc(db, "accounts", id);
  const docSnap = await getDoc(docRef);
  if (!docSnap.exists()) return null;
  return { id: docSnap.id, ...docSnap.data() } as Account;
}

export async function getAccountsByRisk(level: string): Promise<Account[]> {
  const q = query(collection(db, "accounts"), where("riskLevel", "==", level));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Account));
}

// --- Transactions ---

export async function getTransactions(limitCount: number = 50): Promise<Transaction[]> {
  const q = query(
    collection(db, "transactions"),
    orderBy("timestamp", "desc"),
    limit(limitCount)
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Transaction));
}

export async function getFlaggedTransactions(): Promise<Transaction[]> {
  const q = query(collection(db, "transactions"), where("flagged", "==", true));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Transaction));
}

// --- Alerts ---

export async function getAlerts(): Promise<Alert[]> {
  const snapshot = await getDocs(collection(db, "alerts"));
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Alert));
}

export async function getAlertsBySeverity(severity: string): Promise<Alert[]> {
  const q = query(collection(db, "alerts"), where("severity", "==", severity));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Alert));
}

// --- Stats ---

export async function getStats() {
  const accounts = await getAccounts();
  const transactions = await getTransactions(200);
  const alerts = await getAlerts();

  const flaggedAccounts = accounts.filter((a) => a.riskScore >= 60).length;
  const flaggedTransactions = transactions.filter((t) => t.flagged).length;
  const totalVolume = transactions.reduce((sum, t) => sum + t.amount, 0);
  const avgRiskScore = accounts.length
    ? Math.round((accounts.reduce((sum, a) => sum + a.riskScore, 0) / accounts.length) * 10) / 10
    : 0;

  return {
    totalAccounts: accounts.length,
    flaggedAccounts,
    totalTransactions: transactions.length,
    flaggedTransactions,
    totalVolume,
    activeAlerts: alerts.filter((a) => a.status === "new" || a.status === "investigating").length,
    resolvedAlerts: alerts.filter((a) => a.status === "resolved").length,
    avgRiskScore,
  };
}

// --- Seed (server-side) ---

export async function seedFirestore(data: {
  accounts: Account[];
  transactions: Transaction[];
  alerts: Alert[];
}) {
  const batch = writeBatch(db);

  data.accounts.forEach((account) => {
    const ref = doc(collection(db, "accounts"), account.id);
    batch.set(ref, { ...account, updatedAt: serverTimestamp() });
  });

  data.transactions.forEach((transaction) => {
    const ref = doc(collection(db, "transactions"), transaction.id);
    batch.set(ref, { ...transaction, updatedAt: serverTimestamp() });
  });

  data.alerts.forEach((alert) => {
    const ref = doc(collection(db, "alerts"), alert.id);
    batch.set(ref, { ...alert, updatedAt: serverTimestamp() });
  });

  await batch.commit();
}
