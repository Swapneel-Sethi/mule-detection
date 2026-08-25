/**
 * Regenerates public/transactions_synthetic.json AND public/alerts_synthetic.json
 * as a matched pair — every alert.transactions entry points at a transaction
 * generated in the same run.
 *
 * Deterministic: seeded mulberry32(42) plus a fixed generation window anchored
 * at --as-of=<ISO date> (default: the dataset horizon, i.e. max account
 * lastActivity, clamped either way). Repeated runs emit identical output.
 *
 * NOTE: scripts/convert_csv_transactions.py writes an alternative, larger
 * transactions_synthetic.json from the raw CSV. Running it invalidates the
 * transaction references inside any existing alerts_synthetic.json — re-run
 * this script afterwards to restore a consistent pair.
 */

import { readFile, rename, writeFile } from "fs/promises";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

// Anchored to this script's location (like the Python siblings), not the
// caller's cwd.
const PUBLIC_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "public");

interface RawAccount {
  account_id: string;
  name: string;
  bank: string;
  city: string;
  account_age_days?: number; // absent on ACM confirmed-mule rows — see effectiveAgeDays
  kyc_status: string;
  account_type: string;
  is_mule: boolean;
  risk_score: number;
  risk_level: string;
  flags: string[];
  status: string;
  in_txn_count: number;
  unique_senders: number;
  total_in_amount: number;
  avg_in_amount: number;
  out_txn_count: number;
  unique_receivers: number;
  total_out_amount: number;
  avg_out_amount: number;
  pass_through_ratio: number;
  txn_velocity_per_day: number;
  pagerank: number;
  hub_score: number;
  authority_score: number;
  inDegree: number;
  outDegree: number;
  totalTransactions: number;
  totalAmount: number;
  turnover: number;
  balance: number;
  behavioral_score: number;
  graph_score: number;
  ml_score: number;
  calibrated_score: number;
  reasons: string[];
  firstSeen: string;
  lastActivity: string;
}

interface Transaction {
  id: string;
  from: string;
  to: string;
  amount: number;
  timestamp: string;
  // Payment-rail vocabulary shared with scripts/convert_csv_transactions.py
  // (CSV "mode" column) and the Transactions UI type filter.
  type: "upi" | "imps" | "neft" | "rtgs";
  flagged: boolean;
  riskScore: number;
}

interface Alert {
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

// Deterministic PRNG (mulberry32) seeded with the repo-convention seed 42 so
// repeated runs emit identical output, like the Python sibling generators.
const SEED = 42;
let prngState = SEED >>> 0;
function rand(): number {
  prngState = (prngState + 0x6d2b79f5) | 0;
  let t = Math.imul(prngState ^ (prngState >>> 15), 1 | prngState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

const DAY_MS = 24 * 60 * 60 * 1000;

// Pipeline convention: unflagged transactions never exceed ~40 risk (the
// shipped artifact tops out at 38.3). The previous >70 cutoff silently emitted
// unflagged rows up to 70 and broke that invariant on regeneration.
const FLAG_RISK_CUTOFF = 40;

// Pinned locale so ₹ grouping doesn't depend on the generating host's ICU locale.
const INR = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" });

// Fields every downstream computation dereferences; validated on load so schema
// drift fails loudly instead of surfacing as silent NaN/null output.
const REQUIRED_ACCOUNT_FIELDS: (keyof RawAccount)[] = [
  "account_id", "bank", "city", "risk_level", "is_mule", "risk_score",
  "avg_in_amount", "avg_out_amount", "txn_velocity_per_day", "pass_through_ratio",
  "unique_senders", "unique_receivers", "total_in_amount", "total_out_amount",
  "totalTransactions", "firstSeen", "lastActivity",
];

function validateAccounts(accounts: unknown): asserts accounts is RawAccount[] {
  if (!Array.isArray(accounts) || accounts.length === 0) {
    throw new Error("accounts_dataset.json: expected a non-empty JSON array");
  }
  accounts.forEach((acc, i) => {
    const record = acc as RawAccount;
    for (const field of REQUIRED_ACCOUNT_FIELDS) {
      if (record[field] === undefined) {
        throw new Error(`accounts_dataset.json[${i}]: missing "${String(field)}"`);
      }
    }
    if (Number.isNaN(Date.parse(record.firstSeen)) || Number.isNaN(Date.parse(record.lastActivity))) {
      throw new Error(`accounts_dataset.json[${i}]: unparsable firstSeen/lastActivity`);
    }
  });
}

// ACM confirmed-mule rows lack account_age_days; derive their age from firstSeen.
function effectiveAgeDays(acc: RawAccount, asOfMs: number): number {
  if (typeof acc.account_age_days === "number") return acc.account_age_days;
  return Math.max(0, Math.floor((asOfMs - Date.parse(acc.firstSeen)) / DAY_MS));
}

function getRandomDate(startMs: number, endMs: number): Date {
  return new Date(startMs + rand() * (endMs - startMs));
}

function weightedRandomChoice<T>(items: T[], weights: Float64Array): T {
  if (items.length === 0) throw new Error("weightedRandomChoice: empty input");
  const totalWeight = weights[weights.length - 1];
  const random = rand() * totalWeight;
  let low = 0, high = weights.length - 1;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (weights[mid] < random) low = mid + 1;
    else high = mid;
  }
  return items[low];
}

// Most-recent-first evidence selection, tie-broken by id for determinism.
function recentTxns(txns: Transaction[], limit: number): Transaction[] {
  return [...txns]
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp) || a.id.localeCompare(b.id))
    .slice(0, limit);
}

// Anchor each alert just after its newest referenced transaction (+1h), like
// the seed generators; fall back to the account's own lastActivity when the
// run produced no transactions for it.
function alertTimestamp(evidence: Transaction[], fallbackIso: string): string {
  if (evidence.length === 0) return fallbackIso;
  return new Date(Date.parse(evidence[0].timestamp) + 60 * 60 * 1000).toISOString();
}

// Atomic replace: API loaders swallow parse errors into empty datasets, so a
// truncated in-place write would surface as "no data" instead of an error.
async function writeFileAtomic(filePath: string, data: string): Promise<void> {
  const tmpPath = `${filePath}.tmp`;
  await writeFile(tmpPath, data);
  await rename(tmpPath, filePath);
}

async function generateSyntheticData() {
  console.log("Loading accounts dataset...");
  const filePath = join(PUBLIC_DIR, "accounts_dataset.json");
  const raw = await readFile(filePath, "utf-8");
  const accounts: unknown = JSON.parse(raw);
  validateAccounts(accounts);
  console.log(`Loaded ${accounts.length} accounts`);

  const allAccountIds = accounts.map(a => a.account_id);
  const accountsById = new Map(accounts.map(a => [a.account_id, a]));

  // Pre-compute cumulative weights for O(log n) selection
  const weights = new Float64Array(allAccountIds.length);
  let cumWeight = 0;
  for (let i = 0; i < allAccountIds.length; i++) {
    const acc = accountsById.get(allAccountIds[i])!;
    let w = 1;
    if (acc.is_mule) w = 5;
    else if (acc.risk_level === "critical") w = 4;
    else if (acc.risk_level === "high") w = 3;
    else if (acc.risk_level === "medium") w = 2;
    cumWeight += w;
    weights[i] = cumWeight;
  }

  // High-risk pool feeds both the circular-pair seeding below and the circular
  // alert family; defined before generation because cycle seeding needs it.
  const highRiskAccounts = accounts.filter(a => a.risk_level === "critical" || a.risk_level === "high" || a.is_mule);

  // Payment rails with cumulative weights mirroring the mode distribution in
  // transactions_1m (1) (1).csv (UPI ~60%, IMPS ~25%, NEFT ~10%, RTGS ~5%).
  const railTypes: Transaction["type"][] = ["upi", "imps", "neft", "rtgs"];
  const railWeights = new Float64Array([0.6, 0.85, 0.95, 1.0]);

  // Deterministic window anchored at --as-of (default: the dataset horizon,
  // i.e. max account lastActivity) and clamped to that horizon either way, so
  // transactions never postdate the accounts snapshot — the chronology
  // inversion class repaired by audit D4 #5.
  const asOfArg = process.argv.find(a => a.startsWith("--as-of="));
  const asOfMs = asOfArg ? Date.parse(asOfArg.slice("--as-of=".length)) : NaN;
  if (asOfArg && Number.isNaN(asOfMs)) {
    throw new Error(`Invalid --as-of value: ${asOfArg}`);
  }
  const horizonMs = accounts.reduce((m, a) => Math.max(m, Date.parse(a.lastActivity)), 0);
  const endDateMs = Number.isNaN(asOfMs) ? horizonMs : Math.min(asOfMs, horizonMs);
  const startDateMs = endDateMs - 180 * DAY_MS;
  console.log(`Window: ${new Date(startDateMs).toISOString()} .. ${new Date(endDateMs).toISOString()} (dataset horizon ${new Date(horizonMs).toISOString()})`);

  // Generate transactions
  const TARGET_TRANSACTIONS = 8000;
  // Deliberate reciprocal a→b/b→a pairs between high-risk candidates: chance
  // reciprocity inside an 8k-txn universe over 105k accounts is effectively
  // zero, which left the circular alert family permanently empty (0 in the
  // shipped artifact).
  const CYCLE_PAIRS = 30;
  console.log(`Generating ${TARGET_TRANSACTIONS} synthetic transactions...`);
  const transactions: Transaction[] = [];

  const buildTxn = (fromId: string, toId: string): Transaction => {
    const fromAcc = accountsById.get(fromId)!;
    const toAcc = accountsById.get(toId)!;

    const avgAmount = (fromAcc.avg_out_amount + toAcc.avg_in_amount) / 2;
    const baseAmount = avgAmount > 0 ? avgAmount : 10000;
    const variance = fromAcc.is_mule ? 0.1 : 0.5;
    // Keep paise (2dp) like the CSV converter does, instead of flooring to whole rupees.
    const amount = Math.round(baseAmount * (1 + (rand() - 0.5) * variance) * 100) / 100;

    const combinedRisk = (fromAcc.risk_score + toAcc.risk_score) / 2;
    const typeRisk = fromAcc.is_mule || toAcc.is_mule ? 20 : 0;
    const velocityRisk = fromAcc.txn_velocity_per_day > 0.1 ? 15 : 0;
    const passthroughRisk = fromAcc.pass_through_ratio > 10 ? 15 : 0;
    const riskScore = Math.min(100, combinedRisk + typeRisk + velocityRisk + passthroughRisk + (rand() - 0.5) * 10);

    const flagged = riskScore > FLAG_RISK_CUTOFF || fromAcc.is_mule || toAcc.is_mule;
    const type = weightedRandomChoice(railTypes, railWeights);

    return {
      id: `TXN${String(transactions.length + 1).padStart(7, "0")}`,
      from: fromId,
      to: toId,
      amount: Math.max(100, amount),
      timestamp: getRandomDate(startDateMs, endDateMs).toISOString(),
      type,
      flagged,
      riskScore: Math.round(Math.max(0, riskScore) * 10) / 10,
    };
  };

  for (let i = 0; i < TARGET_TRANSACTIONS - CYCLE_PAIRS * 2; i++) {
    const fromId = weightedRandomChoice(allAccountIds, weights);
    let toId = weightedRandomChoice(allAccountIds, weights);
    while (toId === fromId) {
      toId = weightedRandomChoice(allAccountIds, weights);
    }
    transactions.push(buildTxn(fromId, toId));
  }

  // Seed cycles among the candidates the circular detector actually scans
  // (first 30 high-risk accounts).
  const cycleCandidates = highRiskAccounts.slice(0, 30);
  for (let p = 0; p < CYCLE_PAIRS && cycleCandidates.length >= 2; p++) {
    const a = cycleCandidates[Math.floor(rand() * cycleCandidates.length)];
    let b = cycleCandidates[Math.floor(rand() * cycleCandidates.length)];
    while (b.account_id === a.account_id) {
      b = cycleCandidates[Math.floor(rand() * cycleCandidates.length)];
    }
    transactions.push(buildTxn(a.account_id, b.account_id));
    transactions.push(buildTxn(b.account_id, a.account_id));
  }

  // Build index for fast lookup
  const txnsFrom = new Map<string, Transaction[]>();
  const txnsTo = new Map<string, Transaction[]>();
  for (const txn of transactions) {
    if (!txnsFrom.has(txn.from)) txnsFrom.set(txn.from, []);
    txnsFrom.get(txn.from)!.push(txn);
    if (!txnsTo.has(txn.to)) txnsTo.set(txn.to, []);
    txnsTo.get(txn.to)!.push(txn);
  }

  console.log(`Total transactions generated: ${transactions.length}`);

  // Generate alerts - use pre-filtered arrays to avoid O(n²)
  console.log("Generating alerts...");
  const alerts: Alert[] = [];

  // Pre-filter accounts once (highRiskAccounts was hoisted above generation)
  const rapidMovers = accounts.filter(a => a.txn_velocity_per_day > 0.05 && a.pass_through_ratio > 5);
  const fanInAccounts = accounts.filter(a => a.unique_senders > 5 && a.total_in_amount > 100000);
  const fanOutAccounts = accounts.filter(a => a.unique_receivers > 5 && a.total_out_amount > 100000);
  // Age via effectiveAgeDays: confirmed-mule rows carry no account_age_days, so
  // a bare field compare would exclude all 7,001 of them from these gates.
  const dormantAccounts = accounts.filter(a => effectiveAgeDays(a, endDateMs) > 365 && a.txn_velocity_per_day > 0.01 && a.totalTransactions > 10);
  const veryDormant = accounts.filter(a => effectiveAgeDays(a, endDateMs) > 730 && a.totalTransactions < 5 && a.risk_score > 30);

  console.log(`  Rapid movers: ${rapidMovers.length}`);
  console.log(`  Fan-in candidates: ${fanInAccounts.length}`);
  console.log(`  Fan-out candidates: ${fanOutAccounts.length}`);
  console.log(`  High risk: ${highRiskAccounts.length}`);
  console.log(`  Dormant active: ${dormantAccounts.length}`);
  console.log(`  Very dormant: ${veryDormant.length}`);

  // 1. Rapid Movement
  for (let i = 0; i < Math.min(rapidMovers.length, 50); i++) {
    const acc = rapidMovers[i];
    const relatedTxns = recentTxns([...(txnsFrom.get(acc.account_id) || []), ...(txnsTo.get(acc.account_id) || [])], 5);
    alerts.push({
      id: `ALT${String(alerts.length + 1).padStart(5, "0")}`,
      type: "rapid_movement",
      severity: acc.risk_level === "critical" ? "critical" : acc.risk_level === "high" ? "high" : "medium",
      title: `Rapid Fund Movement - ${acc.account_id}`,
      description: `Account ${acc.account_id} (${acc.bank}, ${acc.city}) shows rapid fund movement with ${acc.txn_velocity_per_day.toFixed(4)} txns/day and pass-through ratio ${acc.pass_through_ratio.toFixed(2)}.`,
      accounts: [acc.account_id, ...new Set(relatedTxns.slice(0, 3).map(t => t.from === acc.account_id ? t.to : t.from))],
      timestamp: alertTimestamp(relatedTxns, acc.lastActivity),
      status: ["new", "investigating", "resolved"][Math.floor(rand() * 3)] as Alert["status"],
      transactions: relatedTxns.map(t => t.id),
    });
  }

  // 2. Fan-in
  // Description quotes lifetime dataset fields (unique_senders /
  // total_in_amount); run transactions are evidence-only — the run universe is
  // a tiny subgraph, so run-scoped counts read as "0 distinct accounts".
  for (let i = 0; i < Math.min(fanInAccounts.length, 40); i++) {
    const acc = fanInAccounts[i];
    const incomingTxns = recentTxns(txnsTo.get(acc.account_id) || [], 5);
    const uniqueSenders = [...new Set(incomingTxns.map(t => t.from))];
    alerts.push({
      id: `ALT${String(alerts.length + 1).padStart(5, "0")}`,
      type: "fan_in",
      severity: acc.risk_level === "critical" ? "critical" : acc.risk_level === "high" ? "high" : "medium",
      title: `Fan-In Pattern - ${acc.account_id}`,
      description: `Account ${acc.account_id} received funds from ${acc.unique_senders} distinct accounts totaling ${INR.format(acc.total_in_amount)}.`,
      accounts: [acc.account_id, ...uniqueSenders.slice(0, 5)],
      timestamp: alertTimestamp(incomingTxns, acc.lastActivity),
      status: ["new", "investigating", "resolved"][Math.floor(rand() * 3)] as Alert["status"],
      transactions: incomingTxns.map(t => t.id),
    });
  }

  // 3. Fan-out
  // Same lifetime-fields-in-copy rule as fan_in.
  for (let i = 0; i < Math.min(fanOutAccounts.length, 40); i++) {
    const acc = fanOutAccounts[i];
    const outgoingTxns = recentTxns(txnsFrom.get(acc.account_id) || [], 5);
    const uniqueReceivers = [...new Set(outgoingTxns.map(t => t.to))];
    alerts.push({
      id: `ALT${String(alerts.length + 1).padStart(5, "0")}`,
      type: "fan_out",
      severity: acc.risk_level === "critical" ? "critical" : acc.risk_level === "high" ? "high" : "medium",
      title: `Fan-Out Pattern - ${acc.account_id}`,
      description: `Account ${acc.account_id} dispersed ${INR.format(acc.total_out_amount)} to ${acc.unique_receivers} distinct recipient accounts.`,
      accounts: [acc.account_id, ...uniqueReceivers.slice(0, 5)],
      timestamp: alertTimestamp(outgoingTxns, acc.lastActivity),
      status: ["new", "investigating", "resolved"][Math.floor(rand() * 3)] as Alert["status"],
      transactions: outgoingTxns.map(t => t.id),
    });
  }

  // 4. Circular
  for (let i = 0; i < Math.min(highRiskAccounts.length, 30); i++) {
    const acc = highRiskAccounts[i];
    const outTxns = txnsFrom.get(acc.account_id) || [];
    const inTxns = txnsTo.get(acc.account_id) || [];
    if (outTxns.length > 0 && inTxns.length > 0) {
      const receivers = [...new Set(outTxns.map(t => t.to))];
      const senders = [...new Set(inTxns.map(t => t.from))];
      const cycleNodes = receivers.filter(r => senders.includes(r));
      if (cycleNodes.length > 0) {
        const evidence = recentTxns([...outTxns, ...inTxns], 4);
        alerts.push({
          id: `ALT${String(alerts.length + 1).padStart(5, "0")}`,
          type: "circular",
          severity: "high",
          title: `Circular Transfer Pattern - ${acc.account_id}`,
          description: `Potential circular transfer involving ${acc.account_id} and ${cycleNodes.length} intermediary accounts.`,
          accounts: [acc.account_id, ...cycleNodes.slice(0, 3)],
          timestamp: alertTimestamp(evidence, acc.lastActivity),
          status: ["new", "investigating"][Math.floor(rand() * 2)] as Alert["status"],
          transactions: evidence.map(t => t.id),
        });
      }
    }
  }

  // 5. Behavioral change
  for (let i = 0; i < Math.min(dormantAccounts.length, 25); i++) {
    const acc = dormantAccounts[i];
    const relatedTxns = recentTxns([...(txnsFrom.get(acc.account_id) || []), ...(txnsTo.get(acc.account_id) || [])], 3);
    alerts.push({
      id: `ALT${String(alerts.length + 1).padStart(5, "0")}`,
      type: "behavioral_change",
      severity: acc.risk_level === "critical" ? "critical" : "high",
      title: `Behavioral Anomaly - ${acc.account_id}`,
      description: `Account ${acc.account_id} (account age ${Math.floor(effectiveAgeDays(acc, endDateMs) / 30)}+ months) suddenly active after dormancy: ${acc.totalTransactions} transactions. Risk: ${acc.risk_score}.`,
      accounts: [acc.account_id],
      timestamp: alertTimestamp(relatedTxns, acc.lastActivity),
      status: ["new", "investigating"][Math.floor(rand() * 2)] as Alert["status"],
      transactions: relatedTxns.map(t => t.id),
    });
  }

  // 6. Dormant activation
  for (let i = 0; i < Math.min(veryDormant.length, 15); i++) {
    const acc = veryDormant[i];
    const relatedTxns = recentTxns([...(txnsFrom.get(acc.account_id) || []), ...(txnsTo.get(acc.account_id) || [])], 3);
    alerts.push({
      id: `ALT${String(alerts.length + 1).padStart(5, "0")}`,
      type: "dormant_activation",
      severity: acc.risk_level === "critical" ? "critical" : "high",
      title: `Dormant Account Reactivation - ${acc.account_id}`,
      // Copy matches the gate: <5 lifetime transactions, so "suddenly active"
      // would contradict the evidence — state the dormancy facts instead.
      description: `Account ${acc.account_id}, aged ${Math.floor(effectiveAgeDays(acc, endDateMs) / 30)}+ months, long dormant with only ${acc.totalTransactions} lifetime transactions. Risk: ${acc.risk_score}.`,
      accounts: [acc.account_id],
      timestamp: alertTimestamp(relatedTxns, acc.lastActivity),
      status: "new",
      transactions: relatedTxns.map(t => t.id),
    });
  }

  console.log(`Total alerts generated: ${alerts.length}`);

  // Compact JSON matches the Python generators' output convention (and avoids
  // ~2x size inflation on files API routes parse per cold start); writes go
  // through writeFileAtomic.
  const transactionsPath = join(PUBLIC_DIR, "transactions_synthetic.json");
  await writeFileAtomic(transactionsPath, JSON.stringify(transactions));
  console.log(`Saved transactions to ${transactionsPath}`);

  // Save alerts
  const alertsPath = join(PUBLIC_DIR, "alerts_synthetic.json");
  await writeFileAtomic(alertsPath, JSON.stringify(alerts));
  console.log(`Saved alerts to ${alertsPath}`);

  // Summary
  const flaggedTxns = transactions.filter(t => t.flagged).length;
  const alertSeverities = alerts.reduce((acc, a) => { acc[a.severity] = (acc[a.severity] || 0) + 1; return acc; }, {} as Record<string, number>);
  const alertTypes = alerts.reduce((acc, a) => { acc[a.type] = (acc[a.type] || 0) + 1; return acc; }, {} as Record<string, number>);

  console.log("\n=== GENERATION SUMMARY ===");
  console.log(`Transactions: ${transactions.length} (flagged: ${flaggedTxns})`);
  console.log(`Alerts: ${alerts.length}`);
  console.log(`Alert severities:`, alertSeverities);
  console.log(`Alert types:`, alertTypes);
}

generateSyntheticData().catch(e => { console.error(e); process.exit(1); });