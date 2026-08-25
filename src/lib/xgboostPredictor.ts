/**
 * XGBoost Predictor for TypeScript
 * Loads exported model JSON and runs inference.
 * Handles both numeric-index and string-name feature formats.
 * Falls back to weighted scoring if model unavailable or trees broken.
 *
 * All 16 trained features are forwarded to the model.
 * Platt scaling calibration is applied post-ensemble in detectionEngine.ts.
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
  // Explicit NaN policy: NaN maps to 0 (not by accident of `NaN > 0` being
  // false); ±Infinity saturate to 1/0.
  if (Number.isNaN(x)) return 0;
  if (!Number.isFinite(x)) return x > 0 ? 1 : 0;
  return 1 / (1 + Math.exp(-x));
}

/**
 * Convert an XGBoost `base_score` (a probability) to log-odds.
 * XGBoost adds logit(base_score) to the summed tree margin; adding the raw
 * probability instead biases every prediction (same root cause as the C2 fix
 * in transactionXgboost.ts). Outside (0,1) the logit is undefined —
 * contribute 0, which is also exact for base_score=0.0 as exported today and
 * for the training default 0.5 (logit(0.5)=0).
 */
function baseScoreLogOdds(baseScore: number): number {
  if (!Number.isFinite(baseScore) || baseScore <= 0 || baseScore >= 1) {
    return 0;
  }
  return Math.log(baseScore / (1 - baseScore));
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

    // NaN/Infinity follow the missing branch; when the exporter omitted
    // `missing`, fall through to its default child instead of terminating
    // mid-tree.
    if (!Number.isFinite(val)) {
      node = node.missing ?? node.left ?? node.right ?? null;
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
      `[XGBoost] Feature vector length mismatch: expected ${model.num_features}, got ${featureValues.length}.`
    );
  }

  // Serving-contract parity: scripts/recompute_ml_scores.py — which produced
  // the shipped ml_score values in accounts_dataset.json and the
  // ML_SCORE_MIN/MAX = [0.262, 0.466] normalization band used downstream —
  // multiplies each dumped leaf value by learning_rate when summing the
  // margin. Dumped leaves are already post-shrinkage, so this is an extra
  // serving-time shrinkage, but the whole account-side calibration stack is
  // fit on that scale. Without it, live scores land entirely below the band
  // (verified empirically: 100% of accounts then normalize to 0) and disagree
  // with stored dataset scores by up to ~0.38 probability.
  const lr =
    Number.isFinite(model.learning_rate) && model.learning_rate > 0
      ? model.learning_rate
      : 1;
  let logOdds = 0;
  for (const tree of model.trees) {
    if (isValidTree(tree)) {
      logOdds += traverseTree(tree, featureValues) * lr;
    }
  }
  return sigmoid(logOdds + baseScoreLogOdds(model.base_score));
}

/**
 * All 16 features the model was trained on (in order):
 * account_age_days, kyc_status, account_type, in_txn_count, unique_senders,
 * total_in_amount, avg_in_amount, out_txn_count, unique_receivers,
 * total_out_amount, avg_out_amount, pass_through_ratio, txn_velocity_per_day,
 * pagerank, hub_score, authority_score
 */
export interface MLFeatures {
  account_age_days: number;
  kyc_status: number;
  account_type: number;
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
}

/**
 * Map all 16 features the model expects, in artifact `feature_names` order.
 * No defaults are applied here — detectionEngine.ts supplies every value,
 * including kyc_status / account_type read from dataset records.
 */
function buildFeatureVector(f: MLFeatures): number[] {
  return [
    f.account_age_days,
    f.kyc_status,
    f.account_type,
    f.in_txn_count,
    f.unique_senders,
    f.total_in_amount,
    f.avg_in_amount,
    f.out_txn_count,
    f.unique_receivers,
    f.total_out_amount,
    f.avg_out_amount,
    f.pass_through_ratio,
    f.txn_velocity_per_day,
    f.pagerank,
    f.hub_score,
    f.authority_score,
  ];
}

/**
 * Fallback weighted scoring (when model JSON unavailable or trees broken).
 * Hand-tuned normalizers over 10 of the 16 features; output range [0,1].
 */
function weightedFallbackScore(f: MLFeatures): number {
  const normHub = Math.min(f.hub_score / 0.001, 1);
  const normAge = 1 - Math.min(f.account_age_days / 3000, 1);
  const normTotalIn = Math.min(f.total_in_amount / 500000, 1);
  const normAvgIn = Math.min(f.avg_in_amount / 50000, 1);
  const normOutCount = Math.min(f.out_txn_count / 100, 1);
  const normVelocity = Math.min(f.txn_velocity_per_day / 1.0, 1);
  const normUniqRecv = Math.min(f.unique_receivers / 100, 1);
  const normTotalOut = Math.min(f.total_out_amount / 500000, 1);
  const normAvgOut = Math.min(f.avg_out_amount / 50000, 1);
  const normPassThrough = Math.min(f.pass_through_ratio / 2.0, 1);

  const score =
    normHub * 0.20 +
    normAge * 0.08 +
    normTotalIn * 0.10 +
    normAvgIn * 0.08 +
    normOutCount * 0.08 +
    normVelocity * 0.08 +
    normUniqRecv * 0.08 +
    normTotalOut * 0.10 +
    normAvgOut * 0.08 +
    normPassThrough * 0.12;

  return Math.min(Math.max(score, 0), 1);
}

/**
 * Synchronous ML scoring — tries model first, falls back to weighted.
 * Validates all inputs are finite numbers before scoring.
 */
export function computeMLScoreSync(features: MLFeatures): number {
  // This sync path cannot await a fetch — kick off a (deduplicated) load so
  // that later calls hit the real model instead of the fallback forever.
  // Nothing else invokes loadModel(), so this must also fire once the cache
  // goes stale — otherwise MODEL_CACHE_TTL_MS could never expire; the current
  // call simply uses whatever is cached while the refresh runs.
  if (!cachedModel || Date.now() - modelLoadTime >= MODEL_CACHE_TTL_MS) {
    void loadModel();
  }

  const vals = Object.values(features);
  const hasInvalid = vals.some((v) => !Number.isFinite(v));
  if (hasInvalid) {
    console.warn("[XGBoost] Non-finite feature values detected - using fallback");
    const safe = { ...features };
    for (const key of Object.keys(features) as (keyof MLFeatures)[]) {
      if (!Number.isFinite(safe[key])) {
        (safe as Record<string, number>)[key] = 0;
      }
    }
    return weightedFallbackScore(safe);
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

/** Static importances shown when the model is unavailable or unusable. */
const DEFAULT_IMPORTANCES: { feature: string; importance: number }[] = [
  { feature: "Hub Score", importance: 0.40 },
  { feature: "Account Age", importance: 0.15 },
  { feature: "Total In Amount", importance: 0.12 },
  { feature: "Avg In Amount", importance: 0.10 },
  { feature: "Out Txn Count", importance: 0.08 },
  { feature: "Txn Velocity/Day", importance: 0.08 },
  { feature: "Unique Receivers", importance: 0.07 },
];

/**
 * Get feature importances by counting how often each feature is used
 * as a split node across all trees (true split-based importance).
 */
export function getFeatureImportances(): { feature: string; importance: number }[] {
  if (!cachedModel || !featureMap) {
    return DEFAULT_IMPORTANCES;
  }

  const counts = new Map<string, number>();
  for (const tree of cachedModel.trees) {
    countSplitFeatures(tree, counts);
  }

  const total = Array.from(counts.values()).reduce((a, b) => a + b, 0) || 1;
  const result = Array.from(counts.entries())
    .map(([name, count]) => ({ feature: name, importance: count / total }))
    .sort((a, b) => b.importance - a.importance);

  return result.length > 0 ? result : DEFAULT_IMPORTANCES;
}

// Recurses left/right only: exported artifacts serialize `missing` as a
// value-identical copy of one sibling subtree, so recursing into it
// double-counted every split (skewing split-based importances).
function countSplitFeatures(node: TreeNode | null | undefined, counts: Map<string, number>): void {
  if (!node || node.leaf !== undefined) return;
  if (typeof node.feature === "string") {
    counts.set(node.feature, (counts.get(node.feature) ?? 0) + 1);
  }
  countSplitFeatures(node.left, counts);
  countSplitFeatures(node.right, counts);
}
