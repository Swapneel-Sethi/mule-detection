/**
 * XGBoost Predictor for TypeScript
 * Loads exported model JSON and runs inference.
 * Falls back to weighted scoring if model JSON not available.
 */

interface TreeNode {
  leaf?: number;
  tree?: number;
  feature?: number;
  threshold?: number;
  left?: TreeNode | null;
  right?: TreeNode | null;
  missing?: TreeNode | null;
}

interface XGBoostModel {
  version: string;
  num_features: number;
  feature_names: string[];
  num_trees: number;
  base_score: number;
  learning_rate: number;
  objective: string;
  trees: TreeNode[];
}

let cachedModel: XGBoostModel | null = null;

export async function loadModel(): Promise<XGBoostModel | null> {
  if (cachedModel) return cachedModel;
  try {
    const resp = await fetch("/model_weights.json");
    if (!resp.ok) return null;
    cachedModel = await resp.json();
    return cachedModel;
  } catch {
    return null;
  }
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

function traverseTree(node: TreeNode | null | undefined, features: number[]): number {
  if (!node || node.leaf !== undefined) {
    return node?.leaf ?? 0;
  }
  const val = features[node.feature ?? 0] ?? 0;
  if (val <= (node.threshold ?? 0)) {
    return traverseTree(node.left, features);
  } else {
    return traverseTree(node.right, features);
  }
}

export function predictWithModel(model: XGBoostModel, featureValues: number[]): number {
  let logOdds = model.base_score;
  for (const tree of model.trees) {
    logOdds += traverseTree(tree, featureValues) * model.learning_rate;
  }
  return sigmoid(logOdds);
}

/**
 * ML Feature order (matches Python training):
 * 0: hub_score
 * 1: account_age_days
 * 2: total_in_amount
 * 3: avg_in_amount
 * 4: out_txn_count
 * 5: txn_velocity_per_day
 * 6: unique_receivers
 */
const FEATURE_NAMES = [
  "hub_score",
  "account_age_days",
  "total_in_amount",
  "avg_in_amount",
  "out_txn_count",
  "txn_velocity_per_day",
  "unique_receivers",
];

/**
 * Fallback weighted scoring (approximates XGBoost when model JSON unavailable).
 * Feature importances from trained model:
 *   hub_score: 12501.1 (dominant)
 *   account_age_days: 16.6
 *   total_in_amount: 1.22
 *   avg_in_amount: 0.90
 *   out_txn_count: 0.59
 *   txn_velocity_per_day: 0.55
 *   unique_receivers: 0.32
 */
function weightedFallbackScore(features: {
  hub_score: number;
  account_age_days: number;
  total_in_amount: number;
  avg_in_amount: number;
  out_txn_count: number;
  txn_velocity_per_day: number;
  unique_receivers: number;
}): number {
  // Normalize each feature to [0, 1] range based on typical synthetic data distributions
  const normHub = Math.min(features.hub_score / 0.001, 1);
  const normAge = 1 - Math.min(features.account_age_days / 3000, 1);
  const normTotalIn = Math.min(features.total_in_amount / 500000, 1);
  const normAvgIn = Math.min(features.avg_in_amount / 50000, 1);
  const normOutCount = Math.min(features.out_txn_count / 100, 1);
  const normVelocity = Math.min(features.txn_velocity_per_day / 1.0, 1);
  const normUniqRecv = Math.min(features.unique_receivers / 100, 1);

  // Weighted sum (normalized weights from feature importances)
  const score =
    normHub * 0.882 +
    normAge * 0.00012 +
    normTotalIn * 0.000009 +
    normAvgIn * 0.000006 +
    normOutCount * 0.000004 +
    normVelocity * 0.000004 +
    normUniqRecv * 0.000002;

  return Math.min(Math.max(score * 3, 0), 1);
}

export interface MLFeatures {
  hub_score: number;
  account_age_days: number;
  total_in_amount: number;
  avg_in_amount: number;
  out_txn_count: number;
  txn_velocity_per_day: number;
  unique_receivers: number;
}

/**
 * Compute ML score for an account.
 * Uses XGBoost model if available, otherwise falls back to weighted scoring.
 */
export async function computeMLScore(features: MLFeatures): Promise<number> {
  const model = await loadModel();

  if (model && model.trees.length > 0) {
    const featureArray = [
      features.hub_score,
      features.account_age_days,
      features.total_in_amount,
      features.avg_in_amount,
      features.out_txn_count,
      features.txn_velocity_per_day,
      features.unique_receivers,
    ];
    return predictWithModel(model, featureArray);
  }

  // Fallback
  return weightedFallbackScore(features);
}

/**
 * Synchronous version using fallback (for batch processing without async).
 */
export function computeMLScoreSync(features: MLFeatures): number {
  return weightedFallbackScore(features);
}

/**
 * Get feature importances for dashboard visualization.
 */
export function getFeatureImportances(): { feature: string; importance: number }[] {
  return [
    { feature: "Hub Score", importance: 12501.1 },
    { feature: "Account Age", importance: 16.6 },
    { feature: "Total In Amount", importance: 1.22 },
    { feature: "Avg In Amount", importance: 0.90 },
    { feature: "Out Txn Count", importance: 0.59 },
    { feature: "Txn Velocity/Day", importance: 0.55 },
    { feature: "Unique Receivers", importance: 0.32 },
  ];
}

export function featureArrayToMap(arr: number[]): MLFeatures {
  return {
    hub_score: arr[0] ?? 0,
    account_age_days: arr[1] ?? 0,
    total_in_amount: arr[2] ?? 0,
    avg_in_amount: arr[3] ?? 0,
    out_txn_count: arr[4] ?? 0,
    txn_velocity_per_day: arr[5] ?? 0,
    unique_receivers: arr[6] ?? 0,
  };
}
