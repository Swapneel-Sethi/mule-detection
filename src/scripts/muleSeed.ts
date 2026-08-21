/**
 * Mule scenario seed — creates realistic mule network patterns
 * that show clear node connections in the network graph.
 *
 * Patterns created:
 *  1. Fan-in mule (5 accounts → 1 mule → 1 handler)
 *  2. Fan-out mule (1 source → 1 mule → 6 recipients)
 *  3. Circular transfer loop (A → B → C → D → A)
 *  4. Layering chain (A → B → C → D → E → mule)
 *  5. Pass-through mule (in ≈ out, near-zero balance)
 *  6. Bridge account connecting two clusters
 *  7. Dormant account reactivation
 */

export interface MuleSeedAccount {
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

export interface MuleSeedTransaction {
  transaction_id: string;
  from_account: string;
  to_account: string;
  amount: number;
  timestamp: string;
  type: string;
  flagged: boolean;
  risk_score: number;
}

export interface MuleSeedAlert {
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

export interface MuleSeedBundle {
  accounts: MuleSeedAccount[];
  transactions: MuleSeedTransaction[];
  alerts: MuleSeedAlert[];
}

// ─── Account definitions ────────────────────────────────────────────────────

type AccountDef = {
  id: string;
  name: string;
  bank: string;
  city: string;
  risk: number;
  isMule: boolean;
  muleType: string;
  balance: number;
  turnover: number;
  ageDays: number;
  flags: string[];
};

const ACCOUNTS: AccountDef[] = [
  // ── Fan-in cluster (5 senders → MULE_FANIN → HANDLER) ──
  { id: "SENDER_A1", name: "Ravi Shankar", bank: "SBI", city: "Mumbai", risk: 15, isMule: false, muleType: "", balance: 45000, turnover: 200000, ageDays: 400, flags: [] },
  { id: "SENDER_A2", name: "Priya Nair", bank: "HDFC Bank", city: "Delhi", risk: 12, isMule: false, muleType: "", balance: 32000, turnover: 150000, ageDays: 350, flags: [] },
  { id: "SENDER_A3", name: "Amit Deshmukh", bank: "ICICI Bank", city: "Pune", risk: 18, isMule: false, muleType: "", balance: 28000, turnover: 180000, ageDays: 500, flags: [] },
  { id: "SENDER_A4", name: "Sneha Kulkarni", bank: "Axis Bank", city: "Nagpur", risk: 10, isMule: false, muleType: "", balance: 55000, turnover: 120000, ageDays: 280, flags: [] },
  { id: "SENDER_A5", name: "Vikram Joshi", bank: "Kotak", city: "Nashik", risk: 14, isMule: false, muleType: "", balance: 38000, turnover: 170000, ageDays: 420, flags: [] },
  { id: "MULE_FANIN", name: "Rajesh Mule", bank: "PNB", city: "Mumbai", risk: 85, isMule: true, muleType: "aggregator", balance: 2500, turnover: 950000, ageDays: 90, flags: ["fan_in", "confirmed_mule", "near_zero_balance"], },
  { id: "HANDLER_A", name: "Sunil Handler", bank: "Bank of Baroda", city: "Delhi", risk: 78, isMule: true, muleType: "network_mule", balance: 15000, turnover: 800000, ageDays: 60, flags: ["fan_in", "confirmed_mule"] },

  // ── Fan-out cluster (SOURCE → MULE_FANOUT → 6 recipients) ──
  { id: "SOURCE_B", name: "Kiran Source", bank: "Canara Bank", city: "Bengaluru", risk: 72, isMule: true, muleType: "aggregator", balance: 8000, turnover: 650000, ageDays: 45, flags: ["fan_out", "confirmed_mule"] },
  { id: "MULE_FANOUT", name: "Deepa Distributor", bank: "Union Bank", city: "Chennai", risk: 88, isMule: true, muleType: "distributor", balance: 1200, turnover: 1200000, ageDays: 75, flags: ["fan_out", "confirmed_mule", "near_zero_balance"], },
  { id: "RECIPIENT_B1", name: "Anita Receive1", bank: "IDBI", city: "Kolkata", risk: 20, isMule: false, muleType: "", balance: 67000, turnover: 80000, ageDays: 600, flags: [] },
  { id: "RECIPIENT_B2", name: "Manoj Receive2", bank: "SBI", city: "Hyderabad", risk: 22, isMule: false, muleType: "", balance: 43000, turnover: 95000, ageDays: 520, flags: [] },
  { id: "RECIPIENT_B3", name: "Pooja Receive3", bank: "HDFC Bank", city: "Jaipur", risk: 16, isMule: false, muleType: "", balance: 72000, turnover: 60000, ageDays: 700, flags: [] },
  { id: "RECIPIENT_B4", name: "Sanjay Receive4", bank: "ICICI Bank", city: "Lucknow", risk: 19, isMule: false, muleType: "", balance: 51000, turnover: 75000, ageDays: 450, flags: [] },
  { id: "RECIPIENT_B5", name: "Kavita Receive5", bank: "Axis Bank", city: "Ahmedabad", risk: 14, isMule: false, muleType: "", balance: 88000, turnover: 45000, ageDays: 800, flags: [] },
  { id: "RECIPIENT_B6", name: "Ramesh Receive6", bank: "Kotak", city: "Pune", risk: 25, isMule: false, muleType: "", balance: 39000, turnover: 110000, ageDays: 380, flags: [] },

  // ── Circular transfer loop (C1 → C2 → C3 → C4 → C1) ──
  { id: "CYCLE_C1", name: "Neha Cycle1", bank: "SBI", city: "Mumbai", risk: 75, isMule: true, muleType: "pass_through", balance: 3000, turnover: 500000, ageDays: 120, flags: ["circular_transfer", "confirmed_mule", "near_zero_balance"], },
  { id: "CYCLE_C2", name: "Karthik Cycle2", bank: "HDFC Bank", city: "Delhi", risk: 70, isMule: true, muleType: "pass_through", balance: 4500, turnover: 480000, ageDays: 130, flags: ["circular_transfer", "confirmed_mule", "near_zero_balance"], },
  { id: "CYCLE_C3", name: "Meena Cycle3", bank: "ICICI Bank", city: "Bengaluru", risk: 68, isMule: true, muleType: "pass_through", balance: 2800, turnover: 520000, ageDays: 115, flags: ["circular_transfer", "confirmed_mule", "near_zero_balance"], },
  { id: "CYCLE_C4", name: "Ganesh Cycle4", bank: "Axis Bank", city: "Chennai", risk: 72, isMule: true, muleType: "pass_through", balance: 3500, turnover: 490000, ageDays: 108, flags: ["circular_transfer", "confirmed_mule", "near_zero_balance"], },

  // ── Layering chain (L1 → L2 → L3 → L4 → L5 → FINAL) ──
  { id: "LAYER_L1", name: "Arun Layer1", bank: "PNB", city: "Kolkata", risk: 40, isMule: false, muleType: "", balance: 95000, turnover: 300000, ageDays: 200, flags: [] },
  { id: "LAYER_L2", name: "Sunita Layer2", bank: "Bank of Baroda", city: "Hyderabad", risk: 55, isMule: false, muleType: "", balance: 12000, turnover: 350000, ageDays: 180, flags: ["rapid_movement"], },
  { id: "LAYER_L3", name: "Prakash Layer3", bank: "Canara Bank", city: "Jaipur", risk: 65, isMule: true, muleType: "pass_through", balance: 5000, turnover: 400000, ageDays: 160, flags: ["pass_through", "rapid_movement", "confirmed_mule"], },
  { id: "LAYER_L4", name: "Sita Layer4", bank: "Union Bank", city: "Lucknow", risk: 58, isMule: false, muleType: "", balance: 8000, turnover: 380000, ageDays: 145, flags: ["rapid_movement"], },
  { id: "LAYER_L5", name: "Mohit Layer5", bank: "IDBI", city: "Ahmedabad", risk: 62, isMule: true, muleType: "pass_through", balance: 3200, turnover: 420000, ageDays: 135, flags: ["pass_through", "confirmed_mule", "near_zero_balance"], },
  { id: "FINAL_MULE", name: "Vijay Final", bank: "Kotak", city: "Pune", risk: 90, isMule: true, muleType: "network_mule", balance: 1800, turnover: 850000, ageDays: 55, flags: ["layering_chain", "confirmed_mule", "near_zero_balance"], },

  // ── Pass-through mule (IN → MULE_PASS → OUT, near-zero balance) ──
  { id: "IN_SOURCE", name: "Lata InSource", bank: "SBI", city: "Mumbai", risk: 30, isMule: false, muleType: "", balance: 150000, turnover: 250000, ageDays: 500, flags: [] },
  { id: "MULE_PASS", name: "Dinesh Pass", bank: "HDFC Bank", city: "Delhi", risk: 82, isMule: true, muleType: "pass_through", balance: 800, turnover: 1500000, ageDays: 40, flags: ["pass_through", "confirmed_mule", "near_zero_balance", "high_velocity"], },
  { id: "OUT_DEST", name: "Geeta OutDest", bank: "ICICI Bank", city: "Bengaluru", risk: 28, isMule: false, muleType: "", balance: 180000, turnover: 200000, ageDays: 600, flags: [] },

  // ── Bridge account connecting two clusters ──
  { id: "CLUSTER1_A", name: "Harish C1A", bank: "Axis Bank", city: "Chennai", risk: 20, isMule: false, muleType: "", balance: 75000, turnover: 100000, ageDays: 400, flags: [] },
  { id: "CLUSTER1_B", name: "Anjali C1B", bank: "Kotak", city: "Kolkata", risk: 18, isMule: false, muleType: "", balance: 62000, turnover: 85000, ageDays: 380, flags: [] },
  { id: "BRIDGE_MULE", name: "Yogesh Bridge", bank: "PNB", city: "Hyderabad", risk: 76, isMule: true, muleType: "network_mule", balance: 5500, turnover: 700000, ageDays: 95, flags: ["bridge_account", "confirmed_mule"], },
  { id: "CLUSTER2_A", name: "Rekha C2A", bank: "Bank of Baroda", city: "Pune", risk: 22, isMule: false, muleType: "", balance: 58000, turnover: 92000, ageDays: 420, flags: [] },
  { id: "CLUSTER2_B", name: "Nitin C2B", bank: "Canara Bank", city: "Jaipur", risk: 25, isMule: false, muleType: "", balance: 47000, turnover: 78000, ageDays: 350, flags: [] },

  // ── Dormant account reactivation ──
  { id: "DORMANT", name: "Kamla Dormant", bank: "Union Bank", city: "Lucknow", risk: 60, isMule: false, muleType: "", balance: 500, turnover: 50000, ageDays: 720, flags: ["dormant_account"], },

  // ── Background legitimate accounts (noise) ──
  { id: "LEGIT_1", name: "Suresh Legit1", bank: "SBI", city: "Mumbai", risk: 8, isMule: false, muleType: "", balance: 120000, turnover: 350000, ageDays: 800, flags: [] },
  { id: "LEGIT_2", name: "Padmini Legit2", bank: "HDFC Bank", city: "Delhi", risk: 5, isMule: false, muleType: "", balance: 250000, turnover: 180000, ageDays: 900, flags: [] },
  { id: "LEGIT_3", name: "Ashok Legit3", bank: "ICICI Bank", city: "Bengaluru", risk: 12, isMule: false, muleType: "", balance: 85000, turnover: 220000, ageDays: 650, flags: [] },
  { id: "LEGIT_4", name: "Usha Legit4", bank: "Axis Bank", city: "Chennai", risk: 7, isMule: false, muleType: "", balance: 310000, turnover: 95000, ageDays: 1100, flags: [] },
  { id: "LEGIT_5", name: "Mohan Legit5", bank: "Kotak", city: "Kolkata", risk: 15, isMule: false, muleType: "", balance: 67000, turnover: 160000, ageDays: 500, flags: [] },
];

// ─── Transaction definitions ────────────────────────────────────────────────

type TxnDef = {
  from: string;
  to: string;
  amount: number;
  day: number;
  hour: number;
  minute: number;
  flagged: boolean;
  risk: number;
};

const TRANSACTIONS: TxnDef[] = [
  // ── Fan-in cluster: 5 senders → MULE_FANIN → HANDLER_A ──
  { from: "SENDER_A1", to: "MULE_FANIN", amount: 180000, day: 10, hour: 9, minute: 15, flagged: true, risk: 82 },
  { from: "SENDER_A2", to: "MULE_FANIN", amount: 150000, day: 10, hour: 9, minute: 30, flagged: true, risk: 78 },
  { from: "SENDER_A3", to: "MULE_FANIN", amount: 200000, day: 10, hour: 10, minute: 0, flagged: true, risk: 85 },
  { from: "SENDER_A4", to: "MULE_FANIN", amount: 120000, day: 10, hour: 10, minute: 15, flagged: true, risk: 75 },
  { from: "SENDER_A5", to: "MULE_FANIN", amount: 160000, day: 10, hour: 10, minute: 30, flagged: true, risk: 80 },
  { from: "MULE_FANIN", to: "HANDLER_A", amount: 780000, day: 10, hour: 11, minute: 0, flagged: true, risk: 90 },

  // ── Fan-out cluster: SOURCE_B → MULE_FANOUT → 6 recipients ──
  { from: "SOURCE_B", to: "MULE_FANOUT", amount: 600000, day: 11, hour: 14, minute: 0, flagged: true, risk: 85 },
  { from: "MULE_FANOUT", to: "RECIPIENT_B1", amount: 95000, day: 11, hour: 14, minute: 20, flagged: true, risk: 70 },
  { from: "MULE_FANOUT", to: "RECIPIENT_B2", amount: 105000, day: 11, hour: 14, minute: 25, flagged: true, risk: 72 },
  { from: "MULE_FANOUT", to: "RECIPIENT_B3", amount: 88000, day: 11, hour: 14, minute: 30, flagged: true, risk: 68 },
  { from: "MULE_FANOUT", to: "RECIPIENT_B4", amount: 112000, day: 11, hour: 14, minute: 35, flagged: true, risk: 75 },
  { from: "MULE_FANOUT", to: "RECIPIENT_B5", amount: 92000, day: 11, hour: 14, minute: 40, flagged: true, risk: 65 },
  { from: "MULE_FANOUT", to: "RECIPIENT_B6", amount: 108000, day: 11, hour: 14, minute: 45, flagged: true, risk: 73 },

  // ── Circular transfer loop (C1 → C2 → C3 → C4 → C1) ──
  { from: "CYCLE_C1", to: "CYCLE_C2", amount: 350000, day: 12, hour: 2, minute: 10, flagged: true, risk: 78 },
  { from: "CYCLE_C2", to: "CYCLE_C3", amount: 345000, day: 12, hour: 2, minute: 15, flagged: true, risk: 76 },
  { from: "CYCLE_C3", to: "CYCLE_C4", amount: 340000, day: 12, hour: 2, minute: 20, flagged: true, risk: 74 },
  { from: "CYCLE_C4", to: "CYCLE_C1", amount: 335000, day: 12, hour: 2, minute: 25, flagged: true, risk: 77 },

  // ── Layering chain (L1 → L2 → L3 → L4 → L5 → FINAL_MULE) ──
  { from: "LAYER_L1", to: "LAYER_L2", amount: 280000, day: 13, hour: 18, minute: 0, flagged: false, risk: 40 },
  { from: "LAYER_L2", to: "LAYER_L3", amount: 275000, day: 13, hour: 18, minute: 5, flagged: true, risk: 58 },
  { from: "LAYER_L3", to: "LAYER_L4", amount: 270000, day: 13, hour: 18, minute: 10, flagged: true, risk: 65 },
  { from: "LAYER_L4", to: "LAYER_L5", amount: 265000, day: 13, hour: 18, minute: 15, flagged: true, risk: 62 },
  { from: "LAYER_L5", to: "FINAL_MULE", amount: 260000, day: 13, hour: 18, minute: 20, flagged: true, risk: 88 },

  // ── Pass-through mule (IN → MULE_PASS → OUT, nearly same amount) ──
  { from: "IN_SOURCE", to: "MULE_PASS", amount: 450000, day: 14, hour: 22, minute: 30, flagged: true, risk: 80 },
  { from: "MULE_PASS", to: "OUT_DEST", amount: 445000, day: 14, hour: 22, minute: 35, flagged: true, risk: 83 },

  // ── Bridge account connecting two clusters ──
  { from: "CLUSTER1_A", to: "BRIDGE_MULE", amount: 120000, day: 15, hour: 11, minute: 0, flagged: false, risk: 30 },
  { from: "CLUSTER1_B", to: "BRIDGE_MULE", amount: 95000, day: 15, hour: 11, minute: 10, flagged: false, risk: 28 },
  { from: "BRIDGE_MULE", to: "CLUSTER2_A", amount: 110000, day: 15, hour: 12, minute: 0, flagged: true, risk: 72 },
  { from: "BRIDGE_MULE", to: "CLUSTER2_B", amount: 100000, day: 15, hour: 12, minute: 10, flagged: true, risk: 70 },

  // ── Dormant reactivation ──
  { from: "DORMANT", to: "HANDLER_A", amount: 250000, day: 16, hour: 3, minute: 45, flagged: true, risk: 65 },

  // ── Background legitimate transactions (noise) ──
  { from: "LEGIT_1", to: "LEGIT_2", amount: 45000, day: 10, hour: 10, minute: 0, flagged: false, risk: 10 },
  { from: "LEGIT_2", to: "LEGIT_3", amount: 32000, day: 11, hour: 14, minute: 30, flagged: false, risk: 8 },
  { from: "LEGIT_3", to: "LEGIT_4", amount: 28000, day: 12, hour: 9, minute: 15, flagged: false, risk: 12 },
  { from: "LEGIT_4", to: "LEGIT_5", amount: 55000, day: 13, hour: 16, minute: 0, flagged: false, risk: 7 },
  { from: "LEGIT_5", to: "LEGIT_1", amount: 40000, day: 14, hour: 11, minute: 45, flagged: false, risk: 9 },
  { from: "LEGIT_1", to: "LEGIT_3", amount: 22000, day: 15, hour: 15, minute: 20, flagged: false, risk: 6 },
  { from: "LEGIT_2", to: "LEGIT_4", amount: 38000, day: 16, hour: 10, minute: 10, flagged: false, risk: 11 },
];

// ─── Alert definitions ──────────────────────────────────────────────────────

const ALERTS: {
  id: string;
  type: string;
  severity: string;
  title: string;
  description: string;
  accounts: string[];
  dayOffset: number;
  status: string;
  txnIds: string[];
}[] = [
  {
    id: "ALT_MULE_001", type: "fan_in", severity: "critical",
    title: "Fan-In Aggregation Pattern",
    description: "5 accounts transferred ₹8,10,000 to MULE_FANIN within 90 minutes. Funds immediately forwarded to HANDLER_A.",
    accounts: ["MULE_FANIN", "HANDLER_A", "SENDER_A1", "SENDER_A2", "SENDER_A3"],
    dayOffset: 10, status: "new",
    txnIds: ["TXN000001", "TXN000002", "TXN000003", "TXN000004", "TXN000005", "TXN000006"],
  },
  {
    id: "ALT_MULE_002", type: "fan_out", severity: "critical",
    title: "Fan-Out Distribution Pattern",
    description: "MULE_FANOUT received ₹6,00,000 from SOURCE_B and distributed to 6 unrelated accounts within 25 minutes.",
    accounts: ["MULE_FANOUT", "SOURCE_B", "RECIPIENT_B1", "RECIPIENT_B2"],
    dayOffset: 11, status: "investigating",
    txnIds: ["TXN000007", "TXN000008", "TXN000009", "TXN000010", "TXN000011", "TXN000012", "TXN000013"],
  },
  {
    id: "ALT_MULE_003", type: "circular_transfer", severity: "high",
    title: "Circular Transfer Loop Detected",
    description: "Funds traced through CYCLE_C1 → CYCLE_C2 → CYCLE_C3 → CYCLE_C4 → CYCLE_C1 totaling ₹13,70,000.",
    accounts: ["CYCLE_C1", "CYCLE_C2", "CYCLE_C3", "CYCLE_C4"],
    dayOffset: 12, status: "new",
    txnIds: ["TXN000014", "TXN000015", "TXN000016", "TXN000017"],
  },
  {
    id: "ALT_MULE_004", type: "rapid_movement", severity: "high",
    title: "Layering Chain Detected",
    description: "Funds moved through 5 accounts in 20 minutes: L1→L2→L3→L4→L5→FINAL_MULE, obscuring origin of ₹2,80,000.",
    accounts: ["LAYER_L1", "LAYER_L2", "LAYER_L3", "LAYER_L4", "LAYER_L5", "FINAL_MULE"],
    dayOffset: 13, status: "investigating",
    txnIds: ["TXN000018", "TXN000019", "TXN000020", "TXN000021", "TXN000022"],
  },
  {
    id: "ALT_MULE_005", type: "rapid_movement", severity: "critical",
    title: "Pass-Through Mule Detected",
    description: "MULE_PASS received ₹4,50,000 and forwarded ₹4,45,000 within 5 minutes. Near-zero balance retention.",
    accounts: ["MULE_PASS", "IN_SOURCE", "OUT_DEST"],
    dayOffset: 14, status: "new",
    txnIds: ["TXN000023", "TXN000024"],
  },
  {
    id: "ALT_MULE_006", type: "fan_out", severity: "high",
    title: "Bridge Account Between Clusters",
    description: "BRIDGE_MULE connects two otherwise disconnected account clusters, transferring ₹2,10,000 across.",
    accounts: ["BRIDGE_MULE", "CLUSTER1_A", "CLUSTER1_B", "CLUSTER2_A", "CLUSTER2_B"],
    dayOffset: 15, status: "new",
    txnIds: ["TXN000025", "TXN000026", "TXN000027", "TXN000028"],
  },
  {
    id: "ALT_MULE_007", type: "behavioral_change", severity: "medium",
    title: "Dormant Account Reactivation",
    description: "DORMANT activated after 18 months of inactivity with a high-value transfer of ₹2,50,000 to HANDLER_A.",
    accounts: ["DORMANT", "HANDLER_A"],
    dayOffset: 16, status: "investigating",
    txnIds: ["TXN000029"],
  },
];

// ─── Generator ──────────────────────────────────────────────────────────────

export function generateMuleSeed(): MuleSeedBundle {
  const txnBase = "2026-08-";

  // Build accounts
  const accounts: MuleSeedAccount[] = ACCOUNTS.map((a) => ({
    account_id: a.id,
    name: a.name,
    bank: a.bank,
    city: a.city,
    risk_score: a.risk,
    risk_level: a.risk >= 80 ? "critical" : a.risk >= 60 ? "high" : a.risk >= 40 ? "medium" : "low",
    total_turnover: a.turnover,
    a_balance: a.balance,
    age_days: a.ageDays,
    is_mule: a.isMule,
    flags: a.flags,
    mule_type: a.muleType,
    features: {
      in_degree: 0,
      out_degree: 0,
      is_fan_in: a.flags.includes("fan_in"),
      is_fan_out: a.flags.includes("fan_out"),
      is_transit: a.flags.includes("pass_through"),
      near_zero_balance_ratio: a.flags.includes("near_zero_balance") ? 0.95 : 0,
      money_in_out_velocity: Math.round(a.turnover / Math.max(a.ageDays, 1)),
      clustering_coefficient: a.isMule ? 0.1 : 0.4,
      betweenness_centrality: a.flags.includes("bridge_account") ? 0.6 : a.isMule ? 0.3 : 0.1,

      // Additional features required by mlModel boosting trees
      pass_through_ratio: a.flags.includes("near_zero_balance") ? 0.9 : 0,
      balance_utilization: a.balance / Math.max(a.turnover, 1),
      unique_inbound: 0,
      unique_outbound: 0,
      hour_distribution_entropy: 0.8, // default moderate entropy
      max_burst_size: 1,
      velocity_ratio_7d_180d: 1.0, // default: no spike
      velocity_ratio_30d_180d: 1.0,
      credit_to_debit_amount_ratio: 1.0,
      pagerank_score: a.flags.includes("bridge_account") ? 0.6 : a.isMule ? 0.3 : 0.1,
      community_score: a.isMule ? 0.7 : 0.2,
      credit_to_debit_count_ratio: 1.0,
      repeat_counterparty_ratio: 0.1,
      beneficiary_concentration: a.flags.includes("bridge_account") ? 0.8 : a.isMule ? 0.6 : 0.2,
      amount_volatility: 1.0,
      counterparty_concentration: 0.3,
    },
    reasons: a.isMule
      ? a.flags.filter((f) => f !== "confirmed_mule").map((f) => `Pattern: ${f.replace(/_/g, " ")}`)
      : [],
  }));

  // Compute in/out degrees from transactions
  const inDeg = new Map<string, number>();
  const outDeg = new Map<string, number>();
  for (const txn of TRANSACTIONS) {
    inDeg.set(txn.to, (inDeg.get(txn.to) ?? 0) + 1);
    outDeg.set(txn.from, (outDeg.get(txn.from) ?? 0) + 1);
  }
  for (const acc of accounts) {
    acc.features.in_degree = inDeg.get(acc.account_id) ?? 0;
    acc.features.out_degree = outDeg.get(acc.account_id) ?? 0;
  }

  // Build transactions
  const transactions: MuleSeedTransaction[] = TRANSACTIONS.map((t, i) => ({
    transaction_id: `TXN${String(i + 1).padStart(6, "0")}`,
    from_account: t.from,
    to_account: t.to,
    amount: t.amount,
    timestamp: `${txnBase}${String(t.day).padStart(2, "0")}T${String(t.hour).padStart(2, "0")}:${String(t.minute).padStart(2, "0")}:00`,
    type: "transfer",
    flagged: t.flagged,
    risk_score: t.risk,
  }));

  // Build alerts
  const alerts: MuleSeedAlert[] = ALERTS.map((a) => ({
    id: a.id,
    type: a.type,
    severity: a.severity,
    title: a.title,
    description: a.description,
    accounts: a.accounts,
    timestamp: new Date(2026, 7, 10 + a.dayOffset, 12, 0).toISOString(),
    status: a.status,
    transactions: a.txnIds,
  }));

  return { accounts, transactions, alerts };
}
