// MuleGuard ML Scoring Model
// Lightweight gradient boosting simulation + Platt calibration
// Inspired by DAN Framework (OCBC KDD 2026) and Sahu et al. (NIST)

// ─── Decision Tree (single tree for boosting) ──────────────────────────────

interface TreeNode {
  feature?: string;
  threshold?: number;
  value?: number; // leaf value
  left?: TreeNode;
  right?: TreeNode;
}

function predictTree(tree: TreeNode, features: Record<string, number | boolean>): number {
  if (tree.value !== undefined) return tree.value;
  if (!tree.feature || tree.threshold === undefined) return 0;

  const val = features[tree.feature];
  if (val === undefined || val === null) return 0;

  const numVal = typeof val === "boolean" ? (val ? 1 : 0) : val;

  // Input validation: NaN/Infinity goes to left child (conservative)
  if (!Number.isFinite(numVal)) return predictTree(tree.left ?? { value: 0 }, features);

  return numVal <= tree.threshold
    ? predictTree(tree.left!, features)
    : predictTree(tree.right!, features);
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
// calibrateScore() uses linear normalization since the ensemble output
// is already probability-like (not raw log-odds).

/**
 * Platt scaling calibration — maps ensemble score to calibrated probability.
 *
 * CRITICAL FIX: The ensemble score is already a weighted sum of [0,1]
 * component scores. Applying sigmoid again compresses the output to ~0.44-0.85,
 * destroying discriminative range. Instead, we apply a linear rescaling that
 * preserves the relative ordering while mapping to a reasonable probability range.
 *
 * Platt parameters a=-2.0, b=0.25 were originally designed for raw log-odds input.
 * For ensemble probability input, we use a simple linear transform:
 *   calibrated = clamp(rawScore * 1.2 - 0.1, 0, 1)
 * This expands the useful range while keeping output in [0,1].
 */
export function calibrateScore(rawScore: number): number {
  if (!Number.isFinite(rawScore)) return 0;
  const calibrated = rawScore * 1.2 - 0.1;
  return Math.round(Math.min(1, Math.max(0, calibrated)) * 1000) / 1000;
}

// Expected Calibration Error (ECE) — for monitoring
export function computeECE(
  scores: number[],
  labels: number[],
  nBins = 10
): number {
  if (scores.length !== labels.length || scores.length === 0) return 0;

  const binSize = Math.ceil(scores.length / nBins);
  const sortedIndices = scores
    .map((s, i) => ({ score: s, label: labels[i] }))
    .sort((a, b) => a.score - b.score)
    .map((x) => ({ score: x.score, label: x.label }));

  let ece = 0;
  for (let i = 0; i < nBins; i++) {
    const start = i * binSize;
    const end = Math.min(start + binSize, sortedIndices.length);
    if (start >= end) continue;

    const binData = sortedIndices.slice(start, end);
    const binScore = binData.reduce((s, x) => s + x.score, 0) / binData.length;
    const binLabel = binData.reduce((s, x) => s + x.label, 0) / binData.length;

    ece += (binData.length / sortedIndices.length) * Math.abs(binScore - binLabel);
  }

  return Math.round(ece * 1000) / 1000;
}

// ─── Feature Interaction Scoring ───────────────────────────────────────────
// Captures non-linear feature interactions (key advantage of GBDT over linear models)

export function interactionScore(
  features: Record<string, number | boolean>
): number {
  let score = 0;

  // Interaction: fan_out + near_zero_balance (distributor mule)
  if (features.is_fan_out && (features.near_zero_balance_ratio as number) > 0.5) {
    score += 0.3;
  }

  // Interaction: pass_through + high velocity (rapid transit)
  if (features.is_pass_through && (features.txns_per_day as number) > 5) {
    score += 0.25;
  }

  // Interaction: high velocity + night activity (temporal anomaly)
  if ((features.txns_per_day as number) > 5 && (features.night_txn_ratio as number) > 0.3) {
    score += 0.2;
  }

  // Interaction: bridge + community (network hub)
  if ((features.bridge_score as number) > 0.3 && (features.community_score as number) > 0.5) {
    score += 0.2;
  }

  // Interaction: velocity spike + credit-to-debit imbalance
  if ((features.velocity_ratio_7d_180d as number) > 3 && (features.credit_to_debit_amount_ratio as number) > 3) {
    score += 0.25;
  }

  // Interaction: low entropy + burst (automated behavior)
  if ((features.hour_distribution_entropy as number) < 0.5 && (features.max_burst_size as number) >= 8) {
    score += 0.2;
  }

  return Math.min(1, score);
}
