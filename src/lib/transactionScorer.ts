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
 *
 * Feature formulas below MUST stay byte-for-byte equivalent to
 * scripts/train_transaction_model.py:extract_features — the trees were fit
 * on that exact function, and any drift here silently degrades inference
 * (verified by train-corpus replay; see FLAG_THRESHOLD note).
 */

import {
  computeTransactionRiskSync,
  type TransactionFeatures,
} from "./transactionXgboost";

// ─── Constants ─────────────────────────────────────────────────────────────

/**
 * ML-driven flagging threshold on the 0–100 risk score scale.
 *
 * HISTORY — percentile-of-model-scores (iteration-1 recalibration): the
 * originally shipped 55.1 was inherited from account-side score percentiles
 * and sat ABOVE the transaction model's entire output range as measured in
 * the leak-safe blind setup, so it flagged nothing despite the model's
 * ranking AUC ≈ 0.80. After fixing the C2 base_score bug in
 * transactionXgboost.ts (sigmoid(logOdds + logit(base_score)) instead of
 * sigmoid(logOdds + 0.5)), 0.3 was derived as the ~p36 point of the
 * positive-class distribution of that (now historical) measurement:
 * repo-root audit/mltest, 4247 labeled txns, 600 truly flagged, with
 * sender/receiver calibrated_score/risk_score STRIPPED from the input:
 *   ALL txns : p50=0.0  p90=1.6  p95=5.6  p99=12.6  max=66.3
 *   TRUE-POS : p50=0.5  p75=1.5  p90=5.6  p99=15.5  max=66.3
 *   ⇒ recall 64.3%, precision 33.6%, 1148/4247 = 27.0% flagged.
 *
 * POST-PARITY-FIX REALITY (feature formulas now mirror
 * scripts/train_transaction_model.py exactly — UTC hours, night < 6,
 * amount/(total_in+1), training defaults for missing fields), measured by
 * train-corpus replay and re-running the probe logic:
 * - Full-field inputs (production wiring — detectionEngine passes raw
 *   dataset accounts, which always carry these fields): scores are
 *   saturated/bimodal (train-corpus replay over all 99,952 rows: p50≈0.0,
 *   p90≈97; in-sample AUC 0.9999). Here 0.3 means "flag any non-zero margin" (prob ≥ ~0.0025
 *   after 1-dp rounding) ⇒ ~13–18% flagged at ≥54% in-sample precision,
 *   ~99.9% recall.
 * - Leak-stripped probe inputs: the scorer now imputes training defaults
 *   (0.3 / 0.1) for the stripped fields, so the historical low-score
 *   distribution no longer reproduces; t=0.3 gives 1992/4247 = 46.9%
 *   flagged, precision 0.273, recall 0.907.
 * The value 0.3 is kept because it remains a sane operating point in the
 * production regime and preserves ranking order (AUC is threshold-free);
 * absolute precision/recall claims are only valid per-regime as above.
 *
 * NOTE: re-derive per-regime whenever features or the model JSON change —
 * via audit/mltest/txn_threshold_probe.ts (stripped) or a full-field train
 * replay — since the two regimes now diverge.
 *
 * ARTIFACT STATUS (resolved — was "ARTIFACT DEBT"): public/transaction_model.json
 * now ships the true training intercept, base_score 0.0800667 (trainer
 * resolve_base_score), and transactionXgboost.ts applies it correctly via
 * baseScoreLogOdds — logit(0.0800667) ≈ −2.4414 nats added to the summed tree
 * margin, exactly as training-time predict_proba does. FLAG_THRESHOLD=0.3 was
 * derived against THIS distribution; if the artifact is ever re-exported
 * (base_score, features, or trees change), re-derive FLAG_THRESHOLD via
 * audit/mltest/txn_threshold_probe.ts or a full-field train replay and ship
 * threshold + artifact in the SAME release. Never patch one side alone.
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

/**
 * Mirror the trainer's account-score coercion (_num): the default applies
 * ONLY when the field is absent (undefined/null) or non-numeric/non-finite —
 * an explicit 0 is kept verbatim. Applied ONLY to fields whose training
 * default is non-zero (calibrated_score, risk_score); zero-default fields
 * coerce to the same result either way.
 */
function trainNum(v: unknown, fallback: number): number {
  if (v === undefined || v === null) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

// ─── Feature Extraction ────────────────────────────────────────────────────

/**
 * Extract the 16 features the trained transaction XGBoost model expects.
 * Each formula mirrors scripts/train_transaction_model.py:extract_features.
 */
function extractTransactionFeatures(
  txn: TransactionInput,
  sender: AccountData,
  receiver: AccountData
): TransactionFeatures {
  // Training parsed the Z-suffixed timestamps as tz-aware datetimes and read
  // .hour/.weekday() off them — i.e. UTC wall-clock time. getHours()/getDay()
  // would silently shift every temporal feature by the host's timezone, so
  // use the UTC getters. Invalid timestamps fall back to the same hour=12,
  // weekday=0 defaults the training script uses (its except branch).
  const txnTime = new Date(txn.timestamp);
  const validTime = Number.isFinite(txnTime.getTime());
  const hour = validTime ? txnTime.getUTCHours() : 12;
  const day = validTime ? txnTime.getUTCDay() : 0;
  // Training: `1 if 0 <= hour < 6 else 0` — hours 0–5 inclusive.
  const isNight = hour < 6 ? 1 : 0;
  const isWeekend = day === 0 || day === 6 ? 1 : 0;

  // ── Amount features ──────────────────────────────────────────────────
  // Training: amount / (total_in_amount + 1.0) with NO rounding. The +1
  // matters for the ~22% of dataset accounts with total_in_amount = 0, where
  // training saw ratio ≈ amount; a `totalIn > 0 ? amount/totalIn : 0` variant
  // feeds that population a completely different feature value.
  const senderTotalIn = safeNum(sender.total_in_amount);
  const amountRatio = txn.amount / (senderTotalIn + 1);

  // ── Account risk features ────────────────────────────────────────────
  // Missing-field defaults mirror the training script (calibrated_score→0.3,
  // risk_score→10 before /100 normalization); trainNum defaults only absent
  // fields and keeps explicit zeros, mirroring the trainer's _num().
  const senderCalibrated = clamp(trainNum(sender.calibrated_score, 0.3), 0, 1);
  const receiverCalibrated = clamp(trainNum(receiver.calibrated_score, 0.3), 0, 1);
  const senderRisk = clamp(trainNum(sender.risk_score, 10) / 100, 0, 1);
  const receiverRisk = clamp(trainNum(receiver.risk_score, 10) / 100, 0, 1);
  const riskProduct = senderRisk * receiverRisk;

  // ── Hub scores ───────────────────────────────────────────────────────
  // hub_score only — pagerank/pagerank_score are different centrality
  // measures; substituting them silently fed the trees a feature value that
  // never existed at training time. Absent hub_score → 0 (safeNum).
  const senderHub = clamp(safeNum(sender.hub_score), 0, 1);
  const receiverHub = clamp(safeNum(receiver.hub_score), 0, 1);

  // ── Velocity ─────────────────────────────────────────────────────────
  const senderVelocity = safeNum(sender.txn_velocity_per_day);
  const receiverVelocity = safeNum(receiver.txn_velocity_per_day);

  // ── Derived features ─────────────────────────────────────────────────
  const amountLog = Math.log(1 + txn.amount);
  const amountXSenderRisk = txn.amount * senderRisk;

  return {
    amount: txn.amount,
    amount_log: amountLog,
    sender_calibrated_score: senderCalibrated,
    receiver_calibrated_score: receiverCalibrated,
    sender_hub_score: senderHub,
    receiver_hub_score: receiverHub,
    sender_velocity: senderVelocity,
    receiver_velocity: receiverVelocity,
    amount_ratio: amountRatio,
    sender_risk: senderRisk,
    receiver_risk: receiverRisk,
    risk_product: riskProduct,
    hour_of_day: hour,
    is_night: isNight,
    is_weekend: isWeekend,
    amount_x_sender_risk: amountXSenderRisk,
  };
}

/**
 * Generate human-readable risk factors from the model input features.
 * senderTotalIn is the sender's total inflow used for amount_ratio, so the
 * copy can distinguish a real share-of-inflow from the degenerate case.
 */
function buildRiskFactors(features: TransactionFeatures, senderTotalIn: number): string[] {
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
    factors.push("Night-time transaction (00:00–06:00)");
  }
  if (features.amount_ratio > 0.5) {
    // amount_ratio = amount/(total_in + 1) degenerates to ≈amount when the
    // sender has no recorded inflow, so only phrase it as a share of inflow
    // when there actually is one.
    factors.push(
      senderTotalIn > 0
        ? `Amount is ${(features.amount_ratio * 100).toFixed(0)}% of sender's total inflow`
        : `Large amount with no recorded sender inflow (${features.amount.toFixed(0)})`
    );
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
  receiverAccount: AccountData
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

  const features = extractTransactionFeatures(txn, sender, receiver);

  // Run trained XGBoost model inference
  const probability = computeTransactionRiskSync(features);
  const riskScore = Math.round(clamp(probability, 0, 100) * 10) / 10;
  const flagged = riskScore >= FLAG_THRESHOLD;
  const riskFactors = buildRiskFactors(features, safeNum(sender.total_in_amount));

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
      scoreTransaction(txn, sender, receiver)
    );
  }

  return results;
}
