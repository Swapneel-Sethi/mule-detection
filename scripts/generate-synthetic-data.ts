import { readFile, writeFile } from "fs/promises";
import { join } from "path";

interface RawAccount {
  account_id: string;
  name: string;
  bank: string;
  city: string;
  account_age_days: number;
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
  type: "transfer" | "payment" | "withdrawal" | "deposit";
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

function getRandomDate(start: Date, end: Date): Date {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

function weightedRandomChoice<T>(items: T[], weights: Float64Array): T {
  const totalWeight = weights[weights.length - 1];
  const random = Math.random() * totalWeight;
  let low = 0, high = weights.length - 1;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (weights[mid] < random) low = mid + 1;
    else high = mid;
  }
  return items[low];
}

async function generateSyntheticData() {
  console.log("Loading accounts dataset...");
  const filePath = join(process.cwd(), "public", "accounts_dataset.json");
  const raw = await readFile(filePath, "utf-8");
  const accounts: RawAccount[] = JSON.parse(raw);
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

  // Also pre-compute receiver weights (by in_txn_count)
  const receiverWeights = new Float64Array(allAccountIds.length);
  cumWeight = 0;
  for (let i = 0; i < allAccountIds.length; i++) {
    const acc = accountsById.get(allAccountIds[i])!;
    cumWeight += Math.max(1, acc.in_txn_count);
    receiverWeights[i] = cumWeight;
  }

  const types: Transaction["type"][] = ["transfer", "payment", "withdrawal", "deposit"];
  const startDate = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);
  const endDate = new Date();

  // Generate transactions
  const TARGET_TRANSACTIONS = 8000;
  console.log(`Generating ${TARGET_TRANSACTIONS} synthetic transactions...`);
  const transactions: Transaction[] = [];

  for (let i = 0; i < TARGET_TRANSACTIONS; i++) {
    const fromId = weightedRandomChoice(allAccountIds, weights);
    let toId = weightedRandomChoice(allAccountIds, weights);
    while (toId === fromId) {
      toId = weightedRandomChoice(allAccountIds, weights);
    }

    const fromAcc = accountsById.get(fromId)!;
    const toAcc = accountsById.get(toId)!;

    const avgAmount = (fromAcc.avg_out_amount + toAcc.avg_in_amount) / 2;
    const baseAmount = avgAmount > 0 ? avgAmount : 10000;
    const variance = fromAcc.is_mule ? 0.1 : 0.5;
    const amount = Math.floor(baseAmount * (1 + (Math.random() - 0.5) * variance));

    const timestamp = getRandomDate(startDate, endDate);

    const combinedRisk = (fromAcc.risk_score + toAcc.risk_score) / 2;
    const typeRisk = fromAcc.is_mule || toAcc.is_mule ? 20 : 0;
    const velocityRisk = fromAcc.txn_velocity_per_day > 0.1 ? 15 : 0;
    const passthroughRisk = fromAcc.pass_through_ratio > 10 ? 15 : 0;
    const riskScore = Math.min(100, combinedRisk + typeRisk + velocityRisk + passthroughRisk + (Math.random() - 0.5) * 10);

    const flagged = riskScore > 70 || fromAcc.is_mule || toAcc.is_mule;

    let type: Transaction["type"] = "transfer";
    if (fromAcc.account_type === "1" && Math.random() < 0.3) type = "withdrawal";
    else if (toAcc.account_type === "1" && Math.random() < 0.3) type = "deposit";
    else if (Math.random() < 0.1) type = "payment";

    transactions.push({
      id: `TXN${String(i + 1).padStart(7, "0")}`,
      from: fromId,
      to: toId,
      amount: Math.max(100, amount),
      timestamp: timestamp.toISOString(),
      type,
      flagged,
      riskScore: Math.round(Math.max(0, riskScore) * 10) / 10,
    });
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

  // Pre-filter accounts once
  const rapidMovers = accounts.filter(a => a.txn_velocity_per_day > 0.05 && a.pass_through_ratio > 5);
  const fanInAccounts = accounts.filter(a => a.unique_senders > 5 && a.total_in_amount > 100000);
  const fanOutAccounts = accounts.filter(a => a.unique_receivers > 5 && a.total_out_amount > 100000);
  const highRiskAccounts = accounts.filter(a => a.risk_level === "critical" || a.risk_level === "high" || a.is_mule);
  const dormantAccounts = accounts.filter(a => a.account_age_days > 365 && a.txn_velocity_per_day > 0.01 && a.totalTransactions > 10);
  const veryDormant = accounts.filter(a => a.account_age_days > 730 && a.totalTransactions < 5 && a.risk_score > 30);

  console.log(`  Rapid movers: ${rapidMovers.length}`);
  console.log(`  Fan-in candidates: ${fanInAccounts.length}`);
  console.log(`  Fan-out candidates: ${fanOutAccounts.length}`);
  console.log(`  High risk: ${highRiskAccounts.length}`);
  console.log(`  Dormant active: ${dormantAccounts.length}`);
  console.log(`  Very dormant: ${veryDormant.length}`);

  // 1. Rapid Movement
  for (let i = 0; i < Math.min(rapidMovers.length, 50); i++) {
    const acc = rapidMovers[i];
    const relatedTxns = [...(txnsFrom.get(acc.account_id) || []), ...(txnsTo.get(acc.account_id) || [])].slice(0, 5);
    alerts.push({
      id: `ALT${String(alerts.length + 1).padStart(5, "0")}`,
      type: "rapid_movement",
      severity: acc.risk_level === "critical" ? "critical" : acc.risk_level === "high" ? "high" : "medium",
      title: `Rapid Fund Movement - ${acc.account_id}`,
      description: `Account ${acc.account_id} (${acc.bank}, ${acc.city}) shows rapid fund movement with ${acc.txn_velocity_per_day.toFixed(4)} txns/day and pass-through ratio ${acc.pass_through_ratio.toFixed(2)}.`,
      accounts: [acc.account_id, ...relatedTxns.slice(0, 3).map(t => t.from === acc.account_id ? t.to : t.from)],
      timestamp: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
      status: ["new", "investigating", "resolved"][Math.floor(Math.random() * 3)] as Alert["status"],
      transactions: relatedTxns.map(t => t.id),
    });
  }

  // 2. Fan-in
  for (let i = 0; i < Math.min(fanInAccounts.length, 40); i++) {
    const acc = fanInAccounts[i];
    const incomingTxns = txnsTo.get(acc.account_id) || [];
    const uniqueSenders = [...new Set(incomingTxns.map(t => t.from))];
    alerts.push({
      id: `ALT${String(alerts.length + 1).padStart(5, "0")}`,
      type: "fan_in",
      severity: acc.risk_level === "critical" ? "critical" : acc.risk_level === "high" ? "high" : "medium",
      title: `Fan-In Pattern - ${acc.account_id}`,
      description: `Account ${acc.account_id} received funds from ${uniqueSenders.length} distinct accounts totaling ₹${acc.total_in_amount.toLocaleString()}.`,
      accounts: [acc.account_id, ...uniqueSenders.slice(0, 5)],
      timestamp: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
      status: ["new", "investigating", "resolved"][Math.floor(Math.random() * 3)] as Alert["status"],
      transactions: incomingTxns.slice(0, 5).map(t => t.id),
    });
  }

  // 3. Fan-out
  for (let i = 0; i < Math.min(fanOutAccounts.length, 40); i++) {
    const acc = fanOutAccounts[i];
    const outgoingTxns = txnsFrom.get(acc.account_id) || [];
    const uniqueReceivers = [...new Set(outgoingTxns.map(t => t.to))];
    alerts.push({
      id: `ALT${String(alerts.length + 1).padStart(5, "0")}`,
      type: "fan_out",
      severity: acc.risk_level === "critical" ? "critical" : acc.risk_level === "high" ? "high" : "medium",
      title: `Fan-Out Pattern - ${acc.account_id}`,
      description: `Account ${acc.account_id} dispersed ₹${acc.total_out_amount.toLocaleString()} to ${uniqueReceivers.length} distinct recipient accounts.`,
      accounts: [acc.account_id, ...uniqueReceivers.slice(0, 5)],
      timestamp: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
      status: ["new", "investigating", "resolved"][Math.floor(Math.random() * 3)] as Alert["status"],
      transactions: outgoingTxns.slice(0, 5).map(t => t.id),
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
        alerts.push({
          id: `ALT${String(alerts.length + 1).padStart(5, "0")}`,
          type: "circular",
          severity: "high",
          title: `Circular Transfer Pattern - ${acc.account_id}`,
          description: `Potential circular transfer involving ${acc.account_id} and ${cycleNodes.length} intermediary accounts.`,
          accounts: [acc.account_id, ...cycleNodes.slice(0, 3)],
          timestamp: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
          status: ["new", "investigating"][Math.floor(Math.random() * 2)] as Alert["status"],
          transactions: [...outTxns.slice(0, 2), ...inTxns.slice(0, 2)].map(t => t.id),
        });
      }
    }
  }

  // 5. Behavioral change
  for (let i = 0; i < Math.min(dormantAccounts.length, 25); i++) {
    const acc = dormantAccounts[i];
    const relatedTxns = [...(txnsFrom.get(acc.account_id) || []), ...(txnsTo.get(acc.account_id) || [])].slice(0, 3);
    alerts.push({
      id: `ALT${String(alerts.length + 1).padStart(5, "0")}`,
      type: "behavioral_change",
      severity: acc.risk_level === "critical" ? "critical" : "high",
      title: `Behavioral Anomaly - ${acc.account_id}`,
      description: `Account ${acc.account_id} (${acc.account_age_days} days old) showed sudden activity: ${acc.totalTransactions} transactions after dormancy. Risk: ${acc.risk_score}.`,
      accounts: [acc.account_id],
      timestamp: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
      status: ["new", "investigating"][Math.floor(Math.random() * 2)] as Alert["status"],
      transactions: relatedTxns.map(t => t.id),
    });
  }

  // 6. Dormant activation
  for (let i = 0; i < Math.min(veryDormant.length, 15); i++) {
    const acc = veryDormant[i];
    const relatedTxns = [...(txnsFrom.get(acc.account_id) || []), ...(txnsTo.get(acc.account_id) || [])].slice(0, 3);
    alerts.push({
      id: `ALT${String(alerts.length + 1).padStart(5, "0")}`,
      type: "dormant_activation",
      severity: acc.risk_level === "critical" ? "critical" : "high",
      title: `Dormant Account Reactivation - ${acc.account_id}`,
      description: `Account ${acc.account_id} dormant for ${Math.floor(acc.account_age_days / 30)}+ months suddenly active with risk ${acc.risk_score}.`,
      accounts: [acc.account_id],
      timestamp: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
      status: "new",
      transactions: relatedTxns.map(t => t.id),
    });
  }

  console.log(`Total alerts generated: ${alerts.length}`);

  // Save transactions
  const transactionsPath = join(process.cwd(), "public", "transactions_synthetic.json");
  await writeFile(transactionsPath, JSON.stringify(transactions, null, 2));
  console.log(`Saved transactions to ${transactionsPath}`);

  // Save alerts
  const alertsPath = join(process.cwd(), "public", "alerts_synthetic.json");
  await writeFile(alertsPath, JSON.stringify(alerts, null, 2));
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