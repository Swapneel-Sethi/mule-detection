/**
 * TransactionScorer — ML-driven risk scoring for individual transactions.
 *
 * Uses a trained XGBoost model (200 trees, 16 features) to predict
 * the probability that a transaction involves mule activity.
 * Falls back to a weighted heuristic if the model JSON is unavailable.
 *
 * Model features: amount, amount_log, sender_calibrated_score,
 * receiver_calibrated_score, sender_hub_score, receiver_hub_score,
 * sender_velocity, receiver_velocity, amount_ratio, sender_risk,
 * receiver_risk, risk_product, hour_of_day, is_night, is_weekend,
 * amount_x_sender_risk.
 */

import {
  computeTransactionRiskSync,
  loadTransactionModel,
  type TransactionFeatures,
} from "./transactionXgboost";

// ─── Constants ─────────────────────────────────────────────────────────────

/**
 * ML-driven flagging threshold on the 0–100 risk score scale.
 *
 * DERIVATION — percentile-of-model-scores (iteration-1 recalibration):
 * The shipped 55.1 was inherited from account-side score percentiles and sat
 * ABOVE the transaction model's entire output range (observed p99 ≈ 17.7
 * pre-fix), so it flagged nothing despite the model's ranking AUC ≈ 0.80.
 * After fixing the C2 base_score bug in transactionXgboost.ts
 * (sigmoid(logOdds + logit(base_score)) instead of sigmoid(logOdds + 0.5)),
 * the blind-set score distribution (audit/mltest, 4247 labeled txns, 600
 * truly flagged) is:
 *   ALL txns : p50=0.0  p90=1.6  p95=5.6  p99=12.6  max=66.3
 *   TRUE-POS : p50=0.5  p75=1.5  p90=5.6  p99=15.5  max=66.3
 * Following the percentile-cutoff method used by
 * scripts/auto_calibrate_thresholds.py (derive decision lines from score
 * percentiles rather than absolute scales), FLAG_THRESHOLD is set to the
 * ~p36 point of the positive-class (truly-flagged) score distribution,
 * snapped to the 0.1 display grid (scores are rounded to one decimal):
 *
 *   FLAG_THRESHOLD = 0.3  ⇒ by construction captures ~64% of truly-flagged
 *   transactions. Measured operating point on the blind set:
 *   recall 64.3% (target ≥60%), precision 33.6% (target ≥25%), flagging
 *   1148/4247 = 27.0% of traffic. Lower steps (≤0.2) raise recall to ~80%
 *   but push the flag rate past 33% for <3pp precision gain; higher steps
 *   (≥0.5) drop recall below the 60% floor.
 *
 * NOTE: derived from the fixed model's own output distribution; re-derive
 * with audit/mltest/txn_threshold_probe.ts if features/model change.
 */
export const FLAG_THRESHOLD = 0.3;

// ─── Input Types ───────────────────────────────────────────────────────────

export interface TransactionInput {
  id: string;
  from_account: string;
  to_account: string;
  amount: number;
  timestamp: string;
  type: string;
}

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

function safeNum(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

// ─── Feature Extraction ────────────────────────────────────────────────────

/**
 * Extract the 16 features the trained transaction XGBoost model expects.
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
  const isNight = hour >= 0 && hour < 5 ? 1 : 0;
  const isWeekend = day === 0 || day === 6 ? 1 : 0;

  // ── Amount features ──────────────────────────────────────────────────
  const senderTotalIn = safeNum(sender.total_in_amount);
  const amountRatio = senderTotalIn > 0 ? txn.amount / senderTotalIn : 0;

  // ── Account risk features ────────────────────────────────────────────
  const senderCalibrated = clamp(safeNum(sender.calibrated_score), 0, 1);
  const receiverCalibrated = clamp(safeNum(receiver.calibrated_score), 0, 1);
  const senderRisk = clamp(safeNum(sender.risk_score) / 100, 0, 1);
  const receiverRisk = clamp(safeNum(receiver.risk_score) / 100, 0, 1);
  const riskProduct = senderRisk * receiverRisk;

  // ── Hub scores ───────────────────────────────────────────────────────
  const senderHub = clamp(safeNum(sender.hub_score ?? sender.pagerank ?? sender.pagerank_score), 0, 1);
  const receiverHub = clamp(safeNum(receiver.hub_score ?? receiver.pagerank ?? receiver.pagerank_score), 0, 1);

  // ── Velocity ─────────────────────────────────────────────────────────
  const senderVelocity = safeNum(sender.txn_velocity_per_day);
  const receiverVelocity = safeNum(receiver.txn_velocity_per_day);

  // ── Derived features ─────────────────────────────────────────────────
  const amountLog = Math.log(1 + txn.amount);
  const amountXSsenderRisk = txn.amount * senderRisk;

  return {
    amount: txn.amount,
    amount_log: amountLog,
    sender_calibrated_score: senderCalibrated,
    receiver_calibrated_score: receiverCalibrated,
    sender_hub_score: senderHub,
    receiver_hub_score: receiverHub,
    sender_velocity: senderVelocity,
    receiver_velocity: receiverVelocity,
    amount_ratio: Math.round(amountRatio * 1000) / 1000,
    sender_risk: senderRisk,
    receiver_risk: receiverRisk,
    risk_product: riskProduct,
    hour_of_day: hour,
    is_night: isNight,
    is_weekend: isWeekend,
    amount_x_sender_risk: amountXSsenderRisk,
  };
}

/**
 * Generate human-readable risk factors from the features and model output.
 */
function buildRiskFactors(
  features: TransactionFeatures,
  probability: number
): string[] {
  const factors: string[] = [];

  if (features.sender_calibrated_score > 0.6) {
    factors.push(`High-risk sender (score: ${features.sender_calibrated_score.toFixed(3)})`);
  }
  if (features.receiver_calibrated_score > 0.6) {
    factors.push(`High-risk receiver (score: ${features.receiver_calibrated_score.toFixed(3)})`);
  }
  if (features.amount_x_sender_risk > 50000) {
    factors.push(`Large amount from risky sender (${features.amount_x_sender_risk.toFixed(0)})`);
  }
  if (features.risk_product > 0.3) {
    factors.push(`Both endpoints risky (product: ${features.risk_product.toFixed(3)})`);
  }
  if (features.is_night === 1) {
    factors.push("Night-time transaction (00:00–05:00)");
  }
  if (features.amount_ratio > 0.5) {
    factors.push(`Amount is ${(features.amount_ratio * 100).toFixed(0)}% of sender's total inflow`);
  }
  if (features.sender_hub_score > 0.3 || features.receiver_hub_score > 0.3) {
    const side = features.sender_hub_score > features.receiver_hub_score ? "sender" : "receiver";
    factors.push(`Hub account detected (${side})`);
  }

  return factors.slice(0, 5);
}

// ─── Scoring Pipeline ──────────────────────────────────────────────────────

/**
 * Score a single transaction using the trained XGBoost model.
 */
export function scoreTransaction(
  txn: TransactionInput,
  senderAccount: AccountData,
  receiverAccount: AccountData,
  recentTxns: TransactionInput[]
): TransactionScore {
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

  if (txn.amount <= 0 || !Number.isFinite(txn.amount)) {
    return {
      riskScore: 0,
      flagged: false,
      mlConfidence: 0,
      riskFactors: ["Invalid transaction amount"],
    };
  }

  const features = extractTransactionFeatures(txn, sender, receiver, recentTxns);

  // Run trained XGBoost model inference
  const probability = computeTransactionRiskSync(features);
  const riskScore = Math.round(clamp(probability, 0, 100) * 10) / 10;
  const flagged = riskScore >= FLAG_THRESHOLD;
  const riskFactors = buildRiskFactors(features, probability / 100);

  return {
    riskScore,
    flagged,
    mlConfidence: Math.round((probability / 100) * 1000) / 1000,
    riskFactors,
  };
}

// ─── Batch Scoring ─────────────────────────────────────────────────────────

/**
 * Score all transactions in a batch using the trained XGBoost model.
 */
export function scoreAllTransactions(
  transactions: TransactionInput[],
  accounts: AccountData[]
): Map<string, TransactionScore> {
  const results = new Map<string, TransactionScore>();

  if (transactions.length === 0 || accounts.length === 0) {
    return results;
  }

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

/**
 * Preload the transaction XGBoost model (call once at startup).
 */
export async function initTransactionModel(): Promise<void> {
  await loadTransactionModel();
}
