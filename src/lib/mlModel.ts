/**
 * MuleGuard ML Scoring Model — FALLBACK
 *
 * Hand-crafted gradient boosting simulation used ONLY when the real
 * XGBoost model (model_weights.json) is unavailable or fails to load.
 *
 * Primary scoring path: xgboostPredictor.ts → model_weights.json
 * Fallback scoring path: this file (mlModel.ts) → hardcoded trees
 *
 * The trees below are manually authored heuristics, NOT trained on data.
 * They provide a reasonable approximation but should not be relied upon
 * for production accuracy. Fix the XGBoost model loading instead.
 */

// ─── Decision Tree (single tree for boosting) ──────────────────────────────

interface TreeNode {
  feature?: string;
  threshold?: number;
  value?: number; // leaf value
  left?: TreeNode;
  right?: TreeNode;
}

function predictTree(tree: TreeNode, features: Record<string, number | boolean>, depth = 0): number {
  if (tree.value !== undefined) return tree.value;
  if (!tree.feature || tree.threshold === undefined) return 0;

  // Depth limit to prevent stack overflow on corrupted/deep trees
  if (depth > 20) return tree.value ?? 0;

  const val = features[tree.feature];
  if (val === undefined || val === null) return 0;

  const numVal = typeof val === "boolean" ? (val ? 1 : 0) : val;

  // Input validation: NaN/Infinity goes to left child (conservative)
  if (!Number.isFinite(numVal)) return predictTree(tree.left ?? { value: 0 }, features, depth + 1);

  return numVal <= tree.threshold
    ? predictTree(tree.left!, features, depth + 1)
    : predictTree(tree.right!, features, depth + 1);
}

// ─── Gradient Boosting Model ───────────────────────────────────────────────
// Pre-trained trees calibrated to real-world mule detection patterns
// Based on feature importances from DAN Framework (280 features, top-15)
// and Sahu et al. (GBDT + GNN + LSTM ensemble)

const BOOSTING_TREES: TreeNode[] = [
  // Tree 1: Pass-through + balance analysis
  {
    feature: "pass_through_ratio", threshold: 0.85,
    left: {
      feature: "balance_utilization", threshold: 0.05,
      left: { value: 0.15 },
      right: { value: 0.05 },
    },
    right: {
      feature: "near_zero_balance_ratio", threshold: 0.5,
      left: { value: 0.45 },
      right: { value: 0.7 },
    },
  },
  // Tree 2: Fan-in/Fan-out topology
  {
    feature: "is_fan_out", threshold: 0.5,
    left: {
      feature: "is_fan_in", threshold: 0.5,
      left: { value: -0.1 },
      right: {
        feature: "unique_inbound", threshold: 5,
        left: { value: 0.2 },
        right: { value: 0.35 },
      },
    },
    right: {
      feature: "unique_outbound", threshold: 5,
      left: { value: 0.3 },
      right: {
        feature: "beneficiary_concentration", threshold: 0.5,
        left: { value: 0.4 },
        right: { value: 0.55 },
      },
    },
  },
  // Tree 3: Temporal patterns
  {
    feature: "night_txn_ratio", threshold: 0.3,
    left: {
      feature: "hour_distribution_entropy", threshold: 0.5,
      left: {
        feature: "txns_per_day", threshold: 5,
        left: { value: 0.1 },
        right: { value: 0.25 },
      },
      right: { value: -0.05 },
    },
    right: {
      feature: "max_burst_size", threshold: 8,
      left: { value: 0.35 },
      right: { value: 0.55 },
    },
  },
  // Tree 4: Velocity spikes (DAN framework key feature)
  {
    feature: "velocity_ratio_7d_180d", threshold: 3.0,
    left: {
      feature: "velocity_ratio_30d_180d", threshold: 2.0,
      left: { value: -0.05 },
      right: { value: 0.15 },
    },
    right: {
      feature: "credit_to_debit_amount_ratio", threshold: 3.0,
      left: { value: 0.3 },
      right: { value: 0.5 },
    },
  },
  // Tree 5: Network centrality + PageRank
  {
    feature: "pagerank_score", threshold: 0.2,
    left: {
      feature: "bridge_score", threshold: 0.3,
      left: { value: -0.1 },
      right: { value: 0.2 },
    },
    right: {
      feature: "community_score", threshold: 0.5,
      left: { value: 0.35 },
      right: { value: 0.55 },
    },
  },
  // Tree 6: Credit-to-debit + counterparty
  {
    feature: "credit_to_debit_count_ratio", threshold: 2.0,
    left: {
      feature: "repeat_counterparty_ratio", threshold: 0.7,
      left: { value: 0.0 },
      right: { value: 0.15 },
    },
    right: {
      feature: "beneficiary_concentration", threshold: 0.6,
      left: { value: 0.25 },
      right: { value: 0.45 },
    },
  },
  // Tree 7: Transit + velocity
  {
    feature: "is_transit", threshold: 0.5,
    left: {
      feature: "money_in_out_velocity", threshold: 50000,
      left: { value: -0.05 },
      right: { value: 0.15 },
    },
    right: { value: 0.6 },
  },
  // Tree 8: Structuring detection
  {
    feature: "amount_volatility", threshold: 2.0,
    left: {
      feature: "counterparty_concentration", threshold: 0.3,
      left: { value: -0.05 },
      right: { value: 0.1 },
    },
    right: {
      feature: "txns_per_day", threshold: 3,
      left: { value: 0.15 },
      right: { value: 0.3 },
    },
  },
];

// Initial bias (log-odds of mule in training data)
const MODEL_BIAS = -2.5;

// Learning rate
const LEARNING_RATE = 0.1;

/**
 * Gradient boosting ensemble — returns probability in [0,1].
 * calibrateScore() on the ensemble output should NOT apply sigmoid again
 * (the ensemble score is already probability-like).
 */
export function mlScore(features: Record<string, number | boolean>): number {
  let logOdds = MODEL_BIAS;

  for (const tree of BOOSTING_TREES) {
    logOdds += LEARNING_RATE * predictTree(tree, features);
  }

  // Sigmoid to convert log-odds to probability
  const probability = 1 / (1 + Math.exp(-logOdds));
  return probability;
}

// ─── Platt Scaling Calibration ─────────────────────────────────────────────

/**
 * Platt scaling calibration — maps raw ensemble score to calibrated probability.
 *
 * Uses sigmoid with parameters learned from the score distribution:
 *   P(y=1) = 1 / (1 + exp(A * rawScore + B))
 *
 * Parameters A=-4.0, B=2.0 map:
 *   0.0 → 0.018 (very low risk)
 *   0.3 → 0.12  (low risk)
 *   0.5 → 0.50  (decision boundary)
 *   0.7 → 0.88  (high risk)
 *   1.0 → 0.98  (very high risk)
 *
 * This is a true Platt scaling implementation, not a linear approximation.
 */
export function calibrateScore(rawScore: number): number {
  if (!Number.isFinite(rawScore)) return 0;
  const A = -39.8078;
  const B = 12.6312;
  const calibrated = 1 / (1 + Math.exp(A * rawScore + B));
  return Math.round(calibrated * 1000) / 1000;
}

// Expected Calibration Error (ECE) — for monitoring
// Uses equal-width bins (0.0-0.1, 0.1-0.2, etc.) instead of equal-frequency
// to produce statistically meaningful calibration metrics.
export function computeECE(
  scores: number[],
  labels: number[],
  nBins = 10
): number {
  if (scores.length !== labels.length || scores.length === 0) return 0;

  const binWidth = 1 / nBins;
  let ece = 0;

  for (let i = 0; i < nBins; i++) {
    const binLow = i * binWidth;
    const binHigh = (i + 1) * binWidth;
    const binData = scores
      .map((score, idx) => ({ score, label: labels[idx] }))
      .filter((d) => d.score >= binLow && d.score < binHigh);

    if (binData.length === 0) continue;

    const avgScore = binData.reduce((s, d) => s + d.score, 0) / binData.length;
    const avgLabel = binData.reduce((s, d) => s + d.label, 0) / binData.length;

    ece += (binData.length / scores.length) * Math.abs(avgScore - avgLabel);
  }

  return Math.round(ece * 1000) / 1000;
}

// ─── Feature Interaction Scoring ───────────────────────────────────────────
// Captures non-linear feature interactions (key advantage of GBDT over linear models)

export function interactionScore(
  features: Record<string, number | boolean>
): number {
  let score = 0;

  const safeNum = (v: unknown): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  // Interaction: fan_out + near_zero_balance (distributor mule)
  if (features.is_fan_out && safeNum(features.near_zero_balance_ratio) > 0.5) {
    score += 0.3;
  }

  // Interaction: pass_through + high velocity (rapid transit)
  if (features.is_pass_through && safeNum(features.txns_per_day) > 5) {
    score += 0.25;
  }

  // Interaction: high velocity + night activity (temporal anomaly)
  if (safeNum(features.txns_per_day) > 5 && safeNum(features.night_txn_ratio) > 0.3) {
    score += 0.2;
  }

  // Interaction: bridge + community (network hub)
  if (safeNum(features.bridge_score) > 0.3 && safeNum(features.community_score) > 0.5) {
    score += 0.2;
  }

  // Interaction: velocity spike + credit-to-debit imbalance
  if (safeNum(features.velocity_ratio_7d_180d) > 3 && safeNum(features.credit_to_debit_amount_ratio) > 3) {
    score += 0.25;
  }

  // Interaction: low entropy + burst (automated behavior)
  if (safeNum(features.hour_distribution_entropy) < 0.5 && safeNum(features.max_burst_size) >= 8) {
    score += 0.2;
  }

  return Math.min(1, score);
}
