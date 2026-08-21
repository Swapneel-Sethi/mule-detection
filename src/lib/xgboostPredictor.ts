/**
 * XGBoost Predictor for TypeScript
 * Loads exported model JSON and runs inference.
 * Handles both numeric-index and string-name feature formats.
 * Falls back to weighted scoring if model unavailable or trees broken.
 */

interface TreeNode {
  leaf?: number;
  tree?: number;
  feature?: number | string;
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
let featureMap: Map<string, number> | null = null;

export async function loadModel(): Promise<XGBoostModel | null> {
  if (cachedModel) return cachedModel;
  try {
    const resp = await fetch("/model_weights.json");
    if (!resp.ok) return null;
    cachedModel = await resp.json();
    if (cachedModel) {
      featureMap = new Map(cachedModel.feature_names.map((name, idx) => [name, idx]));
    }
    return cachedModel;
  } catch {
    return null;
  }
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

function getFeatureIndex(node: TreeNode): number {
  if (typeof node.feature === "number") return node.feature;
  if (typeof node.feature === "string" && featureMap) {
    return featureMap.get(node.feature) ?? -1;
  }
  return -1;
}

function traverseTree(node: TreeNode | null | undefined, features: number[]): number {
  if (!node) return 0;

  // Leaf node
  if (node.leaf !== undefined && node.leaf !== null) {
    return node.leaf;
  }

  // Broken/incomplete tree node (no feature, no leaf = skip)
  if (node.feature === undefined || node.feature === null) return 0;

  const idx = getFeatureIndex(node);
  if (idx < 0 || idx >= features.length) return 0;

  const val = features[idx];
  const thresh = node.threshold ?? 0;

  // If both children are null, it's a broken tree — return 0
  if (!node.left && !node.right && !node.missing) return 0;

  if (val <= thresh) {
    return node.left ? traverseTree(node.left, features) : (node.missing ? traverseTree(node.missing, features) : 0);
  } else {
    return node.right ? traverseTree(node.right, features) : (node.missing ? traverseTree(node.missing, features) : 0);
  }
}

function isValidTree(tree: TreeNode): boolean {
  // A valid tree must have either a leaf value or children
  if (tree.leaf !== undefined) return true;
  if (tree.feature !== undefined && (tree.left || tree.right)) return true;
  return false;
}

export function predictWithModel(model: XGBoostModel, featureValues: number[]): number {
  let logOdds = 0;
  for (const tree of model.trees) {
    if (isValidTree(tree)) {
      logOdds += traverseTree(tree, featureValues) * model.learning_rate;
    }
  }
  return sigmoid(logOdds + model.base_score);
}

/**
 * All 16 features the model was trained on (in order).
 */
const ALL_MODEL_FEATURES = [
  "account_age_days", "kyc_status", "account_type",
  "in_txn_count", "unique_senders", "total_in_amount", "avg_in_amount",
  "out_txn_count", "unique_receivers", "total_out_amount", "avg_out_amount",
  "pass_through_ratio", "txn_velocity_per_day", "pagerank", "hub_score", "authority_score",
];

/**
 * Map our 7 MLFeatures to the full 16-feature vector the model expects.
 */
function buildFeatureVector(f: MLFeatures): number[] {
  return [
    f.account_age_days,
    1,                              // kyc_status (assume FULL=1)
    0,                              // account_type (assume SAVINGS=0)
    f.out_txn_count,                // in_txn_count (approximate)
    Math.round(f.unique_receivers * 0.8),  // unique_senders (approximate)
    f.total_in_amount,
    f.avg_in_amount,
    f.out_txn_count,
    f.unique_receivers,
    f.total_in_amount * 0.9,        // total_out_amount (approximate)
    f.avg_in_amount * 0.9,          // avg_out_amount (approximate)
    f.total_in_amount > 0 ? (f.total_in_amount * 0.9) / f.total_in_amount : 0,  // pass_through_ratio
    f.txn_velocity_per_day,
    f.hub_score * 10000,            // pagerank (scaled)
    f.hub_score,
    f.hub_score * 0.5,              // authority_score (approximate)
  ];
}

/**
 * Fallback weighted scoring (when model JSON unavailable or trees broken).
 */
function weightedFallbackScore(features: MLFeatures): number {
  const normHub = Math.min(features.hub_score / 0.001, 1);
  const normAge = 1 - Math.min(features.account_age_days / 3000, 1);
  const normTotalIn = Math.min(features.total_in_amount / 500000, 1);
  const normAvgIn = Math.min(features.avg_in_amount / 50000, 1);
  const normOutCount = Math.min(features.out_txn_count / 100, 1);
  const normVelocity = Math.min(features.txn_velocity_per_day / 1.0, 1);
  const normUniqRecv = Math.min(features.unique_receivers / 100, 1);

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
 * Synchronous ML scoring — tries model first, falls back to weighted.
 */
export function computeMLScoreSync(features: MLFeatures): number {
  if (cachedModel && cachedModel.trees.length > 0 && featureMap) {
    const validTrees = cachedModel.trees.filter(isValidTree);
    if (validTrees.length > cachedModel.trees.length * 0.5) {
      const vec = buildFeatureVector(features);
      return predictWithModel(cachedModel, vec);
    }
  }
  return weightedFallbackScore(features);
}

/**
 * Async ML scoring — loads model first, then predicts.
 */
export async function computeMLScore(features: MLFeatures): Promise<number> {
  await loadModel();
  return computeMLScoreSync(features);
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
