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
  // Same payment channels as public/transactions_synthetic.json — this shape
  // is also the type consumers derive for real API payloads.
  type: "upi" | "imps" | "neft" | "rtgs";
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

export interface GraphNode {
  id: string;
  label: string;
  riskScore: number;
  x?: number;
  y?: number;
}

export interface GraphEdge {
  from: string;
  to: string;
  amount: number;
  flagged: boolean;
}

const accountNames = [
  "Rajesh Kumar", "Priya Sharma", "Amit Patel", "Sneha Gupta", "Vikram Singh",
  "Ananya Reddy", "Karthik Nair", "Pooja Desai", "Sanjay Mehta", "Neha Joshi",
  "Arjun Rao", "Kavita Iyer", "Ravi Teja", "Deepa Menon", "Suresh Babu",
  "Lakshmi Devi", "Ganesh Pai", "Meena Kumari", "Prakash Shetty", "Sunita Verma"
];

const banks = [
  "SBI", "HDFC Bank", "ICICI Bank", "Axis Bank", "Kotak Mahindra",
  "Punjab National Bank", "Bank of Baroda", "Canara Bank", "Union Bank", "IDBI Bank"
];

const flagTypes = [
  "rapid_movement", "fan_in", "fan_out", "circular_transfer",
  "dormant_account", "high_value", "multiple_banks", "new_account"
];

function generateAccounts(count: number): Account[] {
  const accounts: Account[] = [];
  for (let i = 0; i < count; i++) {
    const riskScore = Math.random() * 100;
    let riskLevel: Account["riskLevel"] = "low";
    if (riskScore >= 80) riskLevel = "critical";
    else if (riskScore >= 60) riskLevel = "high";
    else if (riskScore >= 40) riskLevel = "medium";

    const numFlags = Math.floor(Math.random() * 4);
    const shuffledFlags = [...flagTypes].sort(() => Math.random() - 0.5);

    accounts.push({
      id: `ACC${String(i + 1).padStart(4, "0")}`,
      name: accountNames[i % accountNames.length],
      bank: banks[i % banks.length],
      riskScore: Math.round(riskScore * 10) / 10,
      riskLevel,
      totalTransactions: Math.floor(Math.random() * 500) + 10,
      totalAmount: Math.floor(Math.random() * 5000000) + 50000,
      firstSeen: new Date(2024, Math.floor(Math.random() * 12), Math.floor(Math.random() * 28) + 1).toISOString().split("T")[0],
      lastActivity: new Date(2026, Math.floor(Math.random() * 8), Math.floor(Math.random() * 28) + 1).toISOString().split("T")[0],
      flags: shuffledFlags.slice(0, numFlags),
      status: riskScore >= 80 ? "under_review" : riskScore >= 60 ? "active" : Math.random() > 0.7 ? "frozen" : "active",
    });
  }
  return accounts;
}

function generateTransactions(accounts: Account[], count: number): Transaction[] {
  const transactions: Transaction[] = [];
  const types: Transaction["type"][] = ["upi", "imps", "neft", "rtgs"];

  for (let i = 0; i < count; i++) {
    const fromIdx = Math.floor(Math.random() * accounts.length);
    let toIdx = Math.floor(Math.random() * accounts.length);
    while (toIdx === fromIdx) toIdx = Math.floor(Math.random() * accounts.length);

    const riskScore = Math.random() * 100;
    transactions.push({
      id: `TXN${String(i + 1).padStart(6, "0")}`,
      from: accounts[fromIdx].id,
      to: accounts[toIdx].id,
      amount: Math.floor(Math.random() * 500000) + 1000,
      timestamp: new Date(2026, Math.floor(Math.random() * 8), Math.floor(Math.random() * 28) + 1, Math.floor(Math.random() * 24), Math.floor(Math.random() * 60)).toISOString(),
      type: types[Math.floor(Math.random() * types.length)],
      // Dataset semantics: transactions are flagged from a risk score of ~40
      // up (public/transactions_synthetic.json has no unflagged row above 38.3).
      flagged: riskScore >= 40,
      riskScore: Math.round(riskScore * 10) / 10,
    });
  }
  return transactions;
}

function generateAlerts(accounts: Account[], transactions: Transaction[]): Alert[] {
  const severities: Alert["severity"][] = ["critical", "high", "medium", "low"];
  const statuses: Alert["status"][] = ["new", "investigating", "resolved", "dismissed"];

  const alertData = [
    { type: "rapid_movement" as const, title: "Rapid Fund Movement Detected", description: "Account ACC0003 received and forwarded ₹4,50,000 within 12 minutes across 3 intermediary accounts." },
    { type: "fan_in" as const, title: "Multiple Inbound Transfers to Single Account", description: "7 distinct accounts transferred funds to ACC0007 within a 2-hour window, totaling ₹12,30,000." },
    { type: "fan_out" as const, title: "Single Account Dispersing to Multiple Recipients", description: "ACC0012 distributed ₹8,75,000 to 9 unrelated accounts within 45 minutes." },
    { type: "circular" as const, title: "Circular Transfer Pattern Identified", description: "Funds traced through ACC0001 → ACC0005 → ACC0009 → ACC0001 loop totaling ₹3,20,000." },
    { type: "behavioral_change" as const, title: "Sudden Behavioral Anomaly", description: "ACC0015 showed a 340% increase in transaction volume after 6 months of dormancy." },
    { type: "dormant_activation" as const, title: "Dormant Account Reactivation", description: "ACC0018 activated after 11 months of inactivity with a high-value transfer of ₹2,50,000." },
    { type: "rapid_movement" as const, title: "Layering Pattern Detected", description: "Funds moved through 5 accounts in under 30 minutes, obscuring the origin of ₹6,80,000." },
    { type: "fan_in" as const, title: "Concentration Risk", description: "ACC0010 accumulated ₹15,00,000 from 12 different accounts within 48 hours." },
  ];

  return alertData.map((a, i) => ({
    id: `ALT${String(i + 1).padStart(4, "0")}`,
    type: a.type,
    severity: severities[i % severities.length],
    title: a.title,
    description: a.description,
    accounts: [accounts[i % accounts.length].id, accounts[(i + 3) % accounts.length].id],
    timestamp: new Date(2026, 7, 15 - i, 10 + i, i * 7).toISOString(),
    status: statuses[i % statuses.length],
    transactions: [transactions[i % transactions.length].id],
  }));
}

export const accounts = generateAccounts(20);
export const transactions = generateTransactions(accounts, 80);
export const alerts = generateAlerts(accounts, transactions);

export function getGraphData() {
  const nodes: GraphNode[] = accounts.map((a) => ({
    id: a.id,
    label: a.name,
    riskScore: a.riskScore,
  }));

  const edges: GraphEdge[] = transactions.slice(0, 40).map((t) => ({
    from: t.from,
    to: t.to,
    amount: t.amount,
    flagged: t.flagged,
  }));

  return { nodes, edges };
}

export const stats = {
  totalAccounts: accounts.length,
  flaggedAccounts: accounts.filter((a) => a.riskScore >= 60).length,
  totalTransactions: transactions.length,
  flaggedTransactions: transactions.filter((t) => t.flagged).length,
  totalVolume: transactions.reduce((sum, t) => sum + t.amount, 0),
  activeAlerts: alerts.filter((a) => a.status === "new" || a.status === "investigating").length,
  resolvedAlerts: alerts.filter((a) => a.status === "resolved").length,
  avgRiskScore: Math.round((accounts.reduce((sum, a) => sum + a.riskScore, 0) / accounts.length) * 10) / 10,
};

export const riskDistribution = {
  critical: accounts.filter((a) => a.riskLevel === "critical").length,
  high: accounts.filter((a) => a.riskLevel === "high").length,
  medium: accounts.filter((a) => a.riskLevel === "medium").length,
  low: accounts.filter((a) => a.riskLevel === "low").length,
};

export const transactionTimeline = Array.from({ length: 7 }, (_, i) => ({
  date: new Date(2026, 7, 9 + i).toLocaleDateString("en-IN", { month: "short", day: "numeric" }),
  transactions: Math.floor(Math.random() * 30) + 10,
  flagged: Math.floor(Math.random() * 8),
  volume: Math.floor(Math.random() * 5000000) + 1000000,
}));

export const patternTypes = [
  { name: "Rapid Movement", count: 3, color: "#ef4444" },
  { name: "Fan-In", count: 2, color: "#eab308" },
  { name: "Fan-Out", count: 2, color: "#f97316" },
  { name: "Circular", count: 1, color: "#8b5cf6" },
  { name: "Behavioral Change", count: 1, color: "#3b82f6" },
  { name: "Dormant Reactivation", count: 1, color: "#06b6d4" },
];
