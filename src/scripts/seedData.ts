/**
 * Deterministic seed data generator.
 * Uses a seeded PRNG (mulberry32) so the same seed always produces the same data.
 * No Firebase imports here — the API route handles database writes.
 */

export interface SeedAccount {
  account_id: string;
  name: string;
  bank: string;
  city: string;
  risk_score: number;
  risk_level: string;
  total_turnover: number;
  a_balance: number;
  age_days: number;
  is_mule: boolean;
  flags: string[];
  mule_type: string;
  features: Record<string, number | boolean>;
  reasons: string[];
}

export interface SeedTransaction {
  transaction_id: string;
  from_account: string;
  to_account: string;
  amount: number;
  timestamp: string;
  type: string;
  flagged: boolean;
  risk_score: number;
}

export interface SeedAlert {
  id: string;
  type: string;
  severity: string;
  title: string;
  description: string;
  accounts: string[];
  timestamp: string;
  status: string;
  transactions: string[];
}

export interface SeedBundle {
  accounts: SeedAccount[];
  transactions: SeedTransaction[];
  alerts: SeedAlert[];
}

// Deterministic PRNG (mulberry32)
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
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

const CITIES = [
  "Mumbai", "Delhi", "Bengaluru", "Chennai", "Kolkata",
  "Hyderabad", "Pune", "Ahmedabad", "Jaipur", "Lucknow",
];

const TXN_TYPES = ["transfer", "payment", "withdrawal", "deposit"];
const FLAG_TYPES = ["rapid_movement", "fan_in", "fan_out", "circular_transfer", "dormant_account", "high_value", "multiple_banks", "new_account"];
const SEVERITIES = ["critical", "high", "medium", "low"];
const STATUSES = ["new", "investigating", "resolved", "dismissed"];

export function generateSeed(seed = 42): SeedBundle {
  const rng = mulberry32(seed);
  const rand = (min: number, max: number) => Math.floor(rng() * (max - min + 1)) + min;
  const pick = <T>(arr: T[]): T => arr[Math.floor(rng() * arr.length)];

  // --- Accounts ---
  const accounts: SeedAccount[] = [];
  for (let i = 0; i < 20; i++) {
    const riskScore = Math.round(rng() * 1000) / 10;
    const riskLevel =
      riskScore >= 80 ? "critical" :
      riskScore >= 60 ? "high" :
      riskScore >= 40 ? "medium" : "low";

    const isMule = riskScore >= 70;
    const flags: string[] = [];
    if (isMule) flags.push("confirmed_mule");
    if (riskScore >= 40) flags.push(pick(FLAG_TYPES));

    accounts.push({
      account_id: `ACC${String(i + 1).padStart(4, "0")}`,
      name: ACCOUNT_NAMES[i % ACCOUNT_NAMES.length],
      bank: BANKS[i % BANKS.length],
      city: CITIES[i % CITIES.length],
      risk_score: riskScore,
      risk_level: riskLevel,
      total_turnover: rand(50000, 5000000),
      a_balance: rand(500, 200000),
      age_days: rand(30, 720),
      is_mule: isMule,
      flags,
      mule_type: isMule ? pick(["distributor", "aggregator", "pass_through"]) : "",
      features: {
        in_degree: rand(1, 15),
        out_degree: rand(1, 15),
        is_fan_in: rng() > 0.7,
        is_fan_out: rng() > 0.7,
        is_transit: rng() > 0.8,
        near_zero_balance_ratio: rng() > 0.9 ? 0.95 : 0,
        money_in_out_velocity: rand(1000, 100000),
        clustering_coefficient: Math.round(rng() * 100) / 100,
        betweenness_centrality: Math.round(rng() * 10000) / 10000,
      },
      reasons: isMule ? ["High composite risk score", "Confirmed mule pattern"] : [],
    });
  }

  // --- Transactions ---
  const transactions: SeedTransaction[] = [];
  for (let i = 0; i < 80; i++) {
    const fromIdx = rand(0, accounts.length - 1);
    let toIdx = rand(0, accounts.length - 1);
    while (toIdx === fromIdx) toIdx = rand(0, accounts.length - 1);

    const riskScore = Math.round(rng() * 1000) / 10;
    const h = rand(0, 23);
    const m = rand(0, 59);
    const d = rand(1, 15);

    transactions.push({
      transaction_id: `TXN${String(i + 1).padStart(6, "0")}`,
      from_account: accounts[fromIdx].account_id,
      to_account: accounts[toIdx].account_id,
      amount: rand(1000, 500000),
      timestamp: `2026-08-${String(d).padStart(2, "0")}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`,
      type: pick(TXN_TYPES),
      flagged: riskScore > 70,
      risk_score: riskScore,
    });
  }

  // --- Alerts ---
  const alertData = [
    { type: "rapid_movement", title: "Rapid Fund Movement Detected", description: "Account ACC0003 received and forwarded ₹4,50,000 within 12 minutes across 3 intermediary accounts." },
    { type: "fan_in", title: "Multiple Inbound Transfers to Single Account", description: "7 distinct accounts transferred funds to ACC0007 within a 2-hour window, totaling ₹12,30,000." },
    { type: "fan_out", title: "Single Account Dispersing to Multiple Recipients", description: "ACC0012 distributed ₹8,75,000 to 9 unrelated accounts within 45 minutes." },
    { type: "circular_transfer", title: "Circular Transfer Pattern Identified", description: "Funds traced through ACC0001 → ACC0005 → ACC0009 → ACC0001 loop totaling ₹3,20,000." },
    { type: "behavioral_change", title: "Sudden Behavioral Anomaly", description: "ACC0015 showed a 340% increase in transaction volume after 6 months of dormancy." },
    { type: "dormant_activation", title: "Dormant Account Reactivation", description: "ACC0018 activated after 11 months of inactivity with a high-value transfer of ₹2,50,000." },
    { type: "rapid_movement", title: "Layering Pattern Detected", description: "Funds moved through 5 accounts in under 30 minutes, obscuring the origin of ₹6,80,000." },
    { type: "fan_in", title: "Concentration Risk", description: "ACC0010 accumulated ₹15,00,000 from 12 different accounts within 48 hours." },
  ];

  const alerts: SeedAlert[] = alertData.map((a, i) => ({
    id: `ALT${String(i + 1).padStart(4, "0")}`,
    type: a.type,
    severity: SEVERITIES[i % SEVERITIES.length],
    title: a.title,
    description: a.description,
    accounts: [accounts[i % accounts.length].account_id, accounts[(i + 3) % accounts.length].account_id],
    timestamp: new Date(2026, 7, 15 - i, 10 + i, i * 7).toISOString(),
    status: STATUSES[i % STATUSES.length],
    transactions: [`TXN${String(i + 1).padStart(6, "0")}`],
  }));

  return { accounts, transactions, alerts };
}
