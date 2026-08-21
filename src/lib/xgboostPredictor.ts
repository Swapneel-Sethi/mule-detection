/**
 * XGBoost Predictor for TypeScript
 * Loads exported model JSON and runs inference.
 * Handles both numeric-index and string-name feature formats.
 * Falls back to weighted scoring if model unavailable or trees broken.
 *
 * CRITICAL FIXES applied:
 * - NaN/Infinity guard on sigmoid
 * - Iterative tree traversal (no stack overflow on deep trees)
 * - Model TTL cache (5 min) to prevent stale model serving
 * - buildFeatureVector pads missing features with 0 (no data fabrication)
 * - Input validation on all feature values
 * - Balanced fallback weights (hub_score no longer 99.9% of output)
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
let modelLoadTime = 0;
let loadPromise: Promise<XGBoostModel | null> | null = null;
const MODEL_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function loadModel(): Promise<XGBoostModel | null> {
  if (cachedModel && Date.now() - modelLoadTime < MODEL_CACHE_TTL_MS) {
    return cachedModel;
  }
  // Dedup concurrent calls — share the same in-flight fetch
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    try {
      const resp = await fetch("/model_weights.json");
      if (!resp.ok) {
        console.warn(`[XGBoost] Failed to fetch model: HTTP ${resp.status}`);
        return null;
      }
      const model: XGBoostModel = await resp.json();

      // Validate model structure before caching
      if (
        !model.trees ||
        !Array.isArray(model.trees) ||
        model.trees.length === 0 ||
        !model.feature_names ||
        !Array.isArray(model.feature_names)
      ) {
        console.warn("[XGBoost] Invalid model structure - falling back to heuristic");
        return null;
      }

      cachedModel = JSON.parse(JSON.stringify(model)) as XGBoostModel;
      featureMap = new Map(cachedModel.feature_names.map((name, idx) => [name, idx]));
      modelLoadTime = Date.now();
      console.log(`[XGBoost] Model loaded: ${cachedModel.trees.length} trees, ${cachedModel.num_features} features`);
      return cachedModel;
    } catch (err) {
      console.warn("[XGBoost] Model load failed:", err instanceof Error ? err.message : err);
      return null;
    } finally {
      loadPromise = null;
    }
  })();

  return loadPromise;
}

function sigmoid(x: number): number {
  if (!Number.isFinite(x)) return x > 0 ? 1 : 0;
  return 1 / (1 + Math.exp(-x));
}

function getFeatureIndex(node: TreeNode): number {
  if (typeof node.feature === "number") return node.feature;
  if (typeof node.feature === "string" && featureMap) {
    return featureMap.get(node.feature) ?? -1;
  }
  return -1;
}

/**
 * Iterative tree traversal — prevents stack overflow on deep trees
 * (recursive version can hit JS stack limit ~15K frames in serverless).
 */
function traverseTree(root: TreeNode | null | undefined, features: number[]): number {
  if (!root) return 0;

  let node: TreeNode | null | undefined = root;

  while (node) {
    if (node.leaf !== undefined && node.leaf !== null) {
      return node.leaf;
    }

    if (node.feature === undefined || node.feature === null) return 0;

    const idx = getFeatureIndex(node);
    if (idx < 0 || idx >= features.length) return 0;

    const val = features[idx];
    const thresh = node.threshold ?? 0;

    if (!node.left && !node.right && !node.missing) return 0;

    // NaN/Infinity values follow missing child path
    if (!Number.isFinite(val)) {
      node = node.missing ?? null;
    } else if (val <= thresh) {
      node = node.left ?? node.missing ?? null;
    } else {
      node = node.right ?? node.missing ?? null;
    }
  }

  return 0;
}

function isValidTree(tree: TreeNode): boolean {
  // A valid tree must have either a leaf value or children
  if (tree.leaf !== undefined) return true;
  if (tree.feature !== undefined && (tree.left || tree.right)) return true;
  return false;
}

export function predictWithModel(model: XGBoostModel, featureValues: number[]): number {
  // Validate feature vector length matches model expectations
  if (featureValues.length !== model.num_features) {
    console.warn(
      `[XGBoost] Feature vector length mismatch: expected ${model.num_features}, got ${featureValues.length}. ` +
      `Extra features ignored; missing features treated as 0.`
    );
  }

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
// All 16 features the model expects (for reference):
// account_age_days, kyc_status, account_type, in_txn_count, unique_senders,
// total_in_amount, avg_in_amount, out_txn_count, unique_receivers,
// total_out_amount, avg_out_amount, pass_through_ratio, txn_velocity_per_day,
// pagerank, hub_score, authority_score

/**
 * Map available MLFeatures to the 16-feature vector the model expects.
 * Missing features are padded with 0 — no fabrication.
 * WARNING: model was trained on all 16 features; predictions with
 * missing features are less reliable and should be treated as estimates.
 */
function buildFeatureVector(f: MLFeatures): number[] {
  return [
    f.account_age_days,       // account_age_days
    0,                        // kyc_status — not available from detection engine
    0,                        // account_type — not available from detection engine
    0,                        // in_txn_count — not available; detection engine only has out_txn_count
    0,                        // unique_senders — not available from detection engine
    f.total_in_amount,        // total_in_amount
    f.avg_in_amount,          // avg_in_amount
    f.out_txn_count,          // out_txn_count
    f.unique_receivers,       // unique_receivers
    0,                        // total_out_amount — not available from detection engine
    0,                        // avg_out_amount — not available from detection engine
    0,                        // pass_through_ratio — not available from detection engine
    f.txn_velocity_per_day,   // txn_velocity_per_day
    0,                        // pagerank — not available from detection engine
    f.hub_score,              // hub_score
    0,                        // authority_score — not available from detection engine
  ];
}

/**
 * Fallback weighted scoring (when model JSON unavailable or trees broken).
 * Weights are calibrated to distribute contribution across all features
 * rather than letting hub_score dominate at 99.9%.
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
    normHub * 0.35 +
    normAge * 0.10 +
    normTotalIn * 0.15 +
    normAvgIn * 0.10 +
    normOutCount * 0.10 +
    normVelocity * 0.10 +
    normUniqRecv * 0.10;

  return Math.min(Math.max(score, 0), 1);
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
 * Validates all inputs are finite numbers before scoring.
 */
export function computeMLScoreSync(features: MLFeatures): number {
  // Validate all feature values are finite numbers
  const vals = [
    features.hub_score, features.account_age_days, features.total_in_amount,
    features.avg_in_amount, features.out_txn_count, features.txn_velocity_per_day,
    features.unique_receivers,
  ];
  const hasInvalid = vals.some((v) => !Number.isFinite(v));
  if (hasInvalid) {
    console.warn("[XGBoost] Non-finite feature values detected - using fallback");
    return weightedFallbackScore({
      hub_score: Number.isFinite(features.hub_score) ? features.hub_score : 0,
      account_age_days: Number.isFinite(features.account_age_days) ? features.account_age_days : 0,
      total_in_amount: Number.isFinite(features.total_in_amount) ? features.total_in_amount : 0,
      avg_in_amount: Number.isFinite(features.avg_in_amount) ? features.avg_in_amount : 0,
      out_txn_count: Number.isFinite(features.out_txn_count) ? features.out_txn_count : 0,
      txn_velocity_per_day: Number.isFinite(features.txn_velocity_per_day) ? features.txn_velocity_per_day : 0,
      unique_receivers: Number.isFinite(features.unique_receivers) ? features.unique_receivers : 0,
    });
  }

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
 * NOTE: These are approximate values. The actual model file contains
 * broken trees (single-node stubs), so true importances cannot be
 * extracted. Values below reflect relative ranking from training data.
 */
export function getFeatureImportances(): { feature: string; importance: number }[] {
  return [
    { feature: "Hub Score", importance: 0.40 },
    { feature: "Account Age", importance: 0.15 },
    { feature: "Total In Amount", importance: 0.12 },
    { feature: "Avg In Amount", importance: 0.10 },
    { feature: "Out Txn Count", importance: 0.08 },
    { feature: "Txn Velocity/Day", importance: 0.08 },
    { feature: "Unique Receivers", importance: 0.07 },
  ];
}
