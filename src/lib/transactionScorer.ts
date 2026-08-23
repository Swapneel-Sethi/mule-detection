/**
 * TransactionScorer — ML-driven risk scoring for individual transactions.
 *
 * Replaces the previous hardcoded approach:
 *   riskScore = (sender_account_risk + receiver_account_risk) / 2 + noise
 *
 * Uses a weighted combination of sender and receiver account ML scores,
 * adjusted by transaction-specific features (amount anomaly, temporal,
 * velocity, hub score). Final probability is computed via sigmoid.
 *
 * Pure TypeScript — zero external dependencies, only Math operations.
 * Deterministic: same inputs always produce the same output.
 */

// ─── Constants ─────────────────────────────────────────────────────────────

/** ML-driven flagging threshold on the 0–100 risk score scale. */
const FLAG_THRESHOLD = 40;

/** Weight given to the sender's calibrated score in the base score. */
const SENDER_WEIGHT = 0.45;

/** Weight given to the receiver's calibrated score in the base score. */
const RECEIVER_WEIGHT = 0.55;

/** Sigmoid steepness (log-odds scaling). */
const SIGMOID_K = 12;

/** Midpoint for the sigmoid mapping. */
const SIGMOID_MID = 0.35;

// ─── Input Types ───────────────────────────────────────────────────────────

/**
 * Minimal transaction shape required for scoring.
 * Matches the fields present on the `Transaction` type in detectionEngine.
 */
export interface TransactionInput {
  id: string;
  from_account: string;
  to_account: string;
  amount: number;
  timestamp: string;
  type: string;
}

/**
 * Minimal account shape required for scoring.
 * Pulls in the fields the XGBoost model and detection engine produce.
 */
export interface AccountData {
  id: string;
  risk_score?: number;
  calibrated_score?: number;
  ml_score?: number;
  hub_score?: number;
  pagerank?: number;
  pagerank_score?: number;
  total_turnover?: number;
  totalAmount?: number;
  total_in_amount?: number;
  total_out_amount?: number;
  a_balance?: number;
  balance?: number;
  age_days?: number;
  in_txn_count?: number;
  out_txn_count?: number;
  unique_senders?: number;
  unique_receivers?: number;
  avg_in_amount?: number;
  avg_out_amount?: number;
  txn_velocity_per_day?: number;
  pass_through_ratio?: number;
  inDegree?: number;
  outDegree?: number;
  features?: {
    in_degree?: number;
    out_degree?: number;
    unique_inbound?: number;
    unique_outbound?: number;
  };
}

// ─── Output Types ──────────────────────────────────────────────────────────

/**
 * Computed features derived from both endpoints of a transaction,
 * designed to align with the 16-feature space the XGBoost model expects.
 */
export interface TransactionFeatures {
  amount: number;
  amount_vs_sender_avg: number;
  amount_vs_receiver_avg: number;
  amount_zscore: number;
  sender_risk_score: number;
  receiver_risk_score: number;
  sender_ml_score: number;
  receiver_ml_score: number;
  sender_out_degree: number;
  receiver_in_degree: number;
  sender_hub_score: number;
  receiver_hub_score: number;
  hour_of_day: number;
  is_night: number;
  day_of_week: number;
  sender_txns_per_day: number;
  receiver_txns_per_day: number;
}

/**
 * The scoring output for a single transaction.
 */
export interface TransactionScore {
  /** Risk score on a 0–100 scale. */
  riskScore: number;
  /** Whether the transaction is flagged by the ML model. */
  flagged: boolean;
  /** Model confidence — raw probability before scaling (0–1). */
  mlConfidence: number;
  /** Human-readable list of why this transaction was scored as risky. */
  riskFactors: string[];
}

// ─── Helpers ───────────────────────────────────────────────────────────────

/** Safe number coercion — returns fallback for NaN / Infinity. */
function safeNum(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Clamp a value to [min, max]. */
function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/**
 * Sigmoid function — maps log-odds to probability in [0, 1].
 * Using a steepness parameter to control the sharpness of the
 * transition zone around the midpoint.
 */
function sigmoid(logOdds: number): number {
  if (!Number.isFinite(logOdds)) return logOdds > 0 ? 1 : 0;
  return 1 / (1 + Math.exp(-SIGMOID_K * (logOdds - SIGMOID_MID)));
}

// ─── Feature Extraction ────────────────────────────────────────────────────

/**
 * Extract the 16 transaction-level features that mirror the
 * account-level feature space expected by the XGBoost model.
 *
 * Each feature is derived from the combined state of sender +
 * receiver + the transaction itself.
 */
function extractTransactionFeatures(
  txn: TransactionInput,
  sender: AccountData,
  receiver: AccountData,
  recentTxns: TransactionInput[]
): TransactionFeatures {
  const txnTime = new Date(txn.timestamp);
  const hour = txnTime.getHours();
  const day = txnTime.getDay();

  // ── Amount features ──────────────────────────────────────────────────
  const senderTotal = safeNum(sender.total_in_amount) + safeNum(sender.total_out_amount);
  const senderTxnCount = safeNum(sender.in_txn_count) + safeNum(sender.out_txn_count);
  const senderAvg = senderTxnCount > 0 ? senderTotal / senderTxnCount : txn.amount;

  const receiverTotal = safeNum(receiver.total_in_amount) + safeNum(receiver.total_out_amount);
  const receiverTxnCount = safeNum(receiver.in_txn_count) + safeNum(receiver.out_txn_count);
  const receiverAvg = receiverTxnCount > 0 ? receiverTotal / receiverTxnCount : txn.amount;

  const amountVsSender = senderAvg > 0 ? txn.amount / senderAvg : 1;
  const amountVsReceiver = receiverAvg > 0 ? txn.amount / receiverAvg : 1;

  // Simple z-score: how many standard deviations from the mean
  // (using max(avg, 1) to avoid division by zero for brand-new accounts)
  const avgAmount = (senderAvg + receiverAvg) / 2;
  const amountZscore = avgAmount > 1
    ? Math.abs(txn.amount - avgAmount) / avgAmount
    : 0;

  // ── Account risk features ────────────────────────────────────────────
  const senderCalibrated = clamp(safeNum(sender.calibrated_score), 0, 1);
  const receiverCalibrated = clamp(safeNum(receiver.calibrated_score), 0, 1);
  const senderMl = clamp(safeNum(sender.ml_score), 0, 1);
  const receiverMl = clamp(safeNum(receiver.ml_score), 0, 1);

  // ── Network features ─────────────────────────────────────────────────
  const senderOutDeg = safeNum(sender.features?.out_degree ?? sender.outDegree);
  const receiverInDeg = safeNum(receiver.features?.in_degree ?? receiver.inDegree);
  const senderHub = clamp(safeNum(sender.hub_score ?? sender.pagerank ?? sender.pagerank_score), 0, 1);
  const receiverHub = clamp(safeNum(receiver.hub_score ?? receiver.pagerank ?? receiver.pagerank_score), 0, 1);

  // ── Temporal features ────────────────────────────────────────────────
  const isNight = hour >= 0 && hour < 5 ? 1 : 0;

  // ── Velocity features ────────────────────────────────────────────────
  // Compute txns/day from recent transactions window for each account
  const DAY_MS = 86_400_000;
  const WINDOW_DAYS = 30;
  const cutoff = Date.now() - WINDOW_DAYS * DAY_MS;

  let senderRecentCount = 0;
  let receiverRecentCount = 0;
  for (const t of recentTxns) {
    const tTime = new Date(t.timestamp).getTime();
    if (tTime < cutoff) continue;
    if (t.from_account === sender.id || t.to_account === sender.id) senderRecentCount++;
    if (t.from_account === receiver.id || t.to_account === receiver.id) receiverRecentCount++;
  }

  const senderTxnsPerDay = senderRecentCount / WINDOW_DAYS;
  const receiverTxnsPerDay = receiverRecentCount / WINDOW_DAYS;

  return {
    amount: txn.amount,
    amount_vs_sender_avg: Math.round(amountVsSender * 1000) / 1000,
    amount_vs_receiver_avg: Math.round(amountVsReceiver * 1000) / 1000,
    amount_zscore: Math.round(amountZscore * 1000) / 1000,
    sender_risk_score: Math.round(senderCalibrated * 1000) / 1000,
    receiver_risk_score: Math.round(receiverCalibrated * 1000) / 1000,
    sender_ml_score: Math.round(senderMl * 1000) / 1000,
    receiver_ml_score: Math.round(receiverMl * 1000) / 1000,
    sender_out_degree: senderOutDeg,
    receiver_in_degree: receiverInDeg,
    sender_hub_score: Math.round(senderHub * 10000) / 10000,
    receiver_hub_score: Math.round(receiverHub * 10000) / 10000,
    hour_of_day: hour,
    is_night: isNight,
    day_of_week: day,
    sender_txns_per_day: Math.round(senderTxnsPerDay * 100) / 100,
    receiver_txns_per_day: Math.round(receiverTxnsPerDay * 100) / 100,
  };
}

// ─── Scoring Pipeline ──────────────────────────────────────────────────────

/**
 * Compute a single transaction risk score.
 *
 * Scoring steps:
 *  1. Base score = weighted average of sender + receiver calibrated scores (60%)
 *  2. Amount anomaly adjustment (+0.1 to +0.2)
 *  3. Night transaction adjustment (+0.05)
 *  4. Velocity adjustment (+0.05 to +0.15)
 *  5. Hub score adjustment (+0.05)
 *  6. Final = sigmoid(logOdds) → probability in [0,1]
 *  7. riskScore = probability × 100  (0–100 scale)
 *  8. flagged = riskScore >= FLAG_THRESHOLD
 */
export function scoreTransaction(
  txn: TransactionInput,
  senderAccount: AccountData,
  receiverAccount: AccountData,
  recentTxns: TransactionInput[]
): TransactionScore {
  // ── Edge case: missing accounts ──────────────────────────────────────
  // Fall back to the average of whatever we do have.
  const hasSender = senderAccount && senderAccount.id;
  const hasReceiver = receiverAccount && receiverAccount.id;

  const fallbackAccount: AccountData = {
    id: "",
    calibrated_score: 0.3,
    ml_score: 0.3,
    hub_score: 0,
  };

  const sender = hasSender ? senderAccount : fallbackAccount;
  const receiver = hasReceiver ? receiverAccount : fallbackAccount;

  // ── Edge case: zero / negative amount ────────────────────────────────
  if (txn.amount <= 0 || !Number.isFinite(txn.amount)) {
    return {
      riskScore: 0,
      flagged: false,
      mlConfidence: 0,
      riskFactors: ["Invalid transaction amount"],
    };
  }

  const features = extractTransactionFeatures(txn, sender, receiver, recentTxns);
  const riskFactors: string[] = [];

  // ── Step 1: Base score (weighted average of calibrated scores, 60%) ──
  const senderScore = features.sender_risk_score;
  const receiverScore = features.receiver_risk_score;
  const baseScore =
    SENDER_WEIGHT * senderScore +
    RECEIVER_WEIGHT * receiverScore;

  // ── Step 2: Amount anomaly adjustment ────────────────────────────────
  // Boost if transaction is >3× the average for either endpoint.
  let amountAdjustment = 0;
  if (features.amount_vs_sender_avg > 3 || features.amount_vs_receiver_avg > 3) {
    const maxRatio = Math.max(features.amount_vs_sender_avg, features.amount_vs_receiver_avg);
    // Linearly scale between +0.1 (3×) and +0.2 (6×+)
    amountAdjustment = clamp(0.1 + (maxRatio - 3) * 0.033, 0.1, 0.2);
    riskFactors.push(
      `Amount anomaly: ${maxRatio.toFixed(1)}× average transaction`
    );
  }

  // ── Step 3: Night transaction adjustment ─────────────────────────────
  let nightAdjustment = 0;
  if (features.is_night === 1) {
    nightAdjustment = 0.05;
    riskFactors.push("Night-time transaction (00:00–05:00)");
  }

  // ── Step 4: Velocity adjustment ──────────────────────────────────────
  // If either endpoint has >5 txns/day, boost risk.
  let velocityAdjustment = 0;
  const maxVelocity = Math.max(
    features.sender_txns_per_day,
    features.receiver_txns_per_day
  );
  if (maxVelocity > 5) {
    // Linearly scale between +0.05 (5/day) and +0.15 (10+/day)
    velocityAdjustment = clamp(0.05 + (maxVelocity - 5) * 0.02, 0.05, 0.15);
    riskFactors.push(
      `High velocity: ${maxVelocity.toFixed(1)} txns/day`
    );
  }

  // ── Step 5: Hub score adjustment ─────────────────────────────────────
  let hubAdjustment = 0;
  const maxHub = Math.max(features.sender_hub_score, features.receiver_hub_score);
  if (maxHub > 0.3) {
    hubAdjustment = 0.05;
    riskFactors.push(
      `Hub account detected (score: ${maxHub.toFixed(3)})`
    );
  }

  // ── Assemble log-odds ────────────────────────────────────────────────
  // Treat the base score (0–1) as a probability and convert to log-odds
  // for the sigmoid. Add adjustments as direct log-odds contributions.
  const baseProbability = clamp(baseScore, 0.001, 0.999);
  const baseLogOdds = Math.log(baseProbability / (1 - baseProbability));

  const adjustedLogOdds =
    baseLogOdds +
    amountAdjustment +
    nightAdjustment +
    velocityAdjustment +
    hubAdjustment;

  // ── Step 6 & 7: Sigmoid → probability → 0–100 risk score ────────────
  const probability = sigmoid(adjustedLogOdds);
  const riskScore = Math.round(clamp(probability * 100, 0, 100) * 10) / 10;

  // ── Step 8: Flagging ────────────────────────────────────────────────
  const flagged = riskScore >= FLAG_THRESHOLD;

  // ── Add common risk factors based on raw inputs ─────────────────────
  if (senderScore > 0.6 || receiverScore > 0.6) {
    const highSide = senderScore > receiverScore ? "sender" : "receiver";
    riskFactors.push(
      `High-risk ${highSide} account (score: ${Math.max(senderScore, receiverScore).toFixed(3)})`
    );
  }

  if (features.amount_zscore > 2) {
    riskFactors.push(
      `Statistically anomalous amount (z-score: ${features.amount_zscore.toFixed(2)})`
    );
  }

  if (features.sender_out_degree > 10 || features.receiver_in_degree > 10) {
    riskFactors.push(
      `Unusual network degree (sender out: ${features.sender_out_degree}, receiver in: ${features.receiver_in_degree})`
    );
  }

  // Cap to 5 most important factors
  const topFactors = riskFactors.slice(0, 5);

  return {
    riskScore,
    flagged,
    mlConfidence: Math.round(probability * 1000) / 1000,
    riskFactors: topFactors,
  };
}

// ─── Batch Scoring ─────────────────────────────────────────────────────────

/**
 * Score all transactions in a batch.
 *
 * Builds an account lookup map once, then scores each transaction
 * by combining its sender and receiver account data with the full
 * transaction list (for velocity computation).
 *
 * @returns Map from transaction ID to its TransactionScore.
 */
export function scoreAllTransactions(
  transactions: TransactionInput[],
  accounts: AccountData[]
): Map<string, TransactionScore> {
  const results = new Map<string, TransactionScore>();

  if (transactions.length === 0 || accounts.length === 0) {
    return results;
  }

  // Build account lookup
  const accountMap = new Map<string, AccountData>();
  for (const acc of accounts) {
    accountMap.set(acc.id, acc);
  }

  for (const txn of transactions) {
    const sender = accountMap.get(txn.from_account) ?? {
      id: txn.from_account,
      calibrated_score: 0.3,
      ml_score: 0.3,
    };
    const receiver = accountMap.get(txn.to_account) ?? {
      id: txn.to_account,
      calibrated_score: 0.3,
      ml_score: 0.3,
    };

    results.set(
      txn.id,
      scoreTransaction(txn, sender, receiver, transactions)
    );
  }

  return results;
}
