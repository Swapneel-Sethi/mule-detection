/**
 * Transaction-level XGBoost predictor.
 * Loads the trained transaction model (200 trees, 16 features) and runs inference.
 * Falls back to the weighted heuristic if the model JSON is unavailable.
 */

interface TreeNode {
  leaf?: number;
  feature?: number | string;
  threshold?: number;
  left?: TreeNode | null;
  right?: TreeNode | null;
  missing?: TreeNode | null;
}

interface TransactionModel {
  version: string;
  /** Artifact layout version — see EXPECTED_TXN_SCHEMA_VERSION below. */
  schema_version?: number;
  num_features: number;
  feature_names: string[];
  num_trees: number;
  base_score: number;
  learning_rate: number;
  objective: string;
  trees: TreeNode[];
}

/**
 * Transaction-model artifact schema this code was written against (M13).
 * Kept separate from the account-side constant on purpose: the two artifacts
 * use opposite base_score conventions (probability 0.5 fallback vs raw
 * intercept ≈0.08) and this module must be re-checked against BOTH whenever
 * either exporter changes. A shared constant would let one side's retrain
 * silently validate the other.
 */
const EXPECTED_TXN_SCHEMA_VERSION = 1;

function warnTxnSchemaMismatch(model: { schema_version?: number }): void {
  if ((model.schema_version ?? 1) !== EXPECTED_TXN_SCHEMA_VERSION) {
    console.warn(
      `[TxnXGBoost] transaction_model.json schema_version ${model.schema_version ?? "missing"} != expected ${EXPECTED_TXN_SCHEMA_VERSION} — ` +
        `artifact layout may differ from this runtime; verify feature order and base_score convention before trusting scores.`
    );
  }
}


let cachedModel: TransactionModel | null = null;
let featureMap: Map<string, number> | null = null;
let modelLoadTime = 0;
let loadPromise: Promise<TransactionModel | null> | null = null;
const MODEL_CACHE_TTL_MS = 5 * 60 * 1000;

export async function loadTransactionModel(): Promise<TransactionModel | null> {
  if (cachedModel && Date.now() - modelLoadTime < MODEL_CACHE_TTL_MS) {
    return cachedModel;
  }
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    try {
      const resp = await fetch("/transaction_model.json");
      if (!resp.ok) {
        console.warn(`[TxnXGBoost] Failed to fetch model: HTTP ${resp.status}`);
        return null;
      }
      const model: TransactionModel = await resp.json();

      if (
        !model.trees ||
        !Array.isArray(model.trees) ||
        model.trees.length === 0 ||
        !model.feature_names ||
        !Array.isArray(model.feature_names)
      ) {
        console.warn("[TxnXGBoost] Invalid model structure - falling back to heuristic");
        return null;
      }

      cachedModel = JSON.parse(JSON.stringify(model)) as TransactionModel;
      featureMap = new Map(cachedModel.feature_names.map((name, idx) => [name, idx]));
      modelLoadTime = Date.now();
      warnTxnSchemaMismatch(cachedModel);
      console.log(`[TxnXGBoost] Model loaded: ${cachedModel.trees.length} trees, ${cachedModel.num_features} features`);
      return cachedModel;
    } catch (err) {
      console.warn("[TxnXGBoost] Model load failed:", err instanceof Error ? err.message : err);
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
 * Convert an XGBoost `base_score` (exported as a probability) to log-odds.
 *
 * Root-cause fix (ml_audit.md C2): XGBoost adds `logit(base_score)` to the
 * summed tree margin — for the default base_score=0.5 that contribution is
 * exactly 0. The exporter (scripts/train_transaction_model.py:302-306) falls
 * back to writing the raw probability 0.5 when the booster attr is missing,
 * and this module used to add that 0.5 DIRECTLY into log-odds space via
 * `sigmoid(logOdds + 0.5)`, biasing every prediction up by ~+12 probability
 * points and distorting/compressing the score scale relative to training-time
 * `predict_proba`. Converting through logit() restores exact train/serve
 * parity. Guard: outside (0,1) the logit is undefined — contribute 0, which
 * also matches the account model export that stores base_score=0.0.
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

    // Non-finite values follow the missing branch; when the exporter omitted
    // `missing`, fall through to its default child instead of terminating.
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
  if (tree.leaf !== undefined) return true;
  if (tree.feature !== undefined && (tree.left || tree.right)) return true;
  return false;
}

function predict(model: TransactionModel, featureValues: number[]): number {
  if (featureValues.length !== model.num_features) {
    console.warn(
      `[TxnXGBoost] Feature vector length mismatch: expected ${model.num_features}, got ${featureValues.length}.`
    );
  }

  let logOdds = 0;
  for (const tree of model.trees) {
    if (isValidTree(tree)) {
      // Exported leaves already include shrinkage — no extra eta multiply.
      // Deliberately UNLIKE xgboostPredictor.ts (which applies an extra
      // learning_rate factor to match the account-side pipeline): the
      // FLAG_THRESHOLD in transactionScorer.ts was derived against THIS
      // exact output distribution, so rescaling here would invalidate it.
      logOdds += traverseTree(tree, featureValues);
    }
  }
  // C2 fix: base_score is a probability — add its LOGIT to the margin
  // (XGBoost semantics), not the raw probability (see baseScoreLogOdds).
  return sigmoid(logOdds + baseScoreLogOdds(model.base_score));
}

// ─── Transaction Feature Interface ──────────────────────────────────────────

export interface TransactionFeatures {
  amount: number;
  amount_log: number;
  sender_calibrated_score: number;
  receiver_calibrated_score: number;
  sender_hub_score: number;
  receiver_hub_score: number;
  sender_velocity: number;
  receiver_velocity: number;
  amount_ratio: number;
  sender_risk: number;
  receiver_risk: number;
  risk_product: number;
  hour_of_day: number;
  is_night: number;
  is_weekend: number;
  amount_x_sender_risk: number;
}

function buildFeatureVector(f: TransactionFeatures): number[] {
  return [
    f.amount,
    f.amount_log,
    f.sender_calibrated_score,
    f.receiver_calibrated_score,
    f.sender_hub_score,
    f.receiver_hub_score,
    f.sender_velocity,
    f.receiver_velocity,
    f.amount_ratio,
    f.sender_risk,
    f.receiver_risk,
    f.risk_product,
    f.hour_of_day,
    f.is_night,
    f.is_weekend,
    f.amount_x_sender_risk,
  ];
}

/**
 * Fallback heuristic when transaction model JSON is unavailable.
 */
function weightedFallback(f: TransactionFeatures): number {
  const base = 0.45 * f.sender_calibrated_score + 0.55 * f.receiver_calibrated_score;
  const amountBoost = Math.min(f.amount / 100000, 1) * 0.15;
  const riskBoost = f.risk_product * 0.10;
  const nightBoost = f.is_night * 0.05;
  return Math.min(Math.max((base + amountBoost + riskBoost + nightBoost) * 100, 0), 100);
}

// ─── Public API ─────────────────────────────────────────────────────────────

/** Static importances shown when the model is unavailable or unusable. */
const DEFAULT_IMPORTANCES: { feature: string; importance: number }[] = [
  { feature: "amount_x_sender_risk", importance: 0.392 },
  { feature: "amount", importance: 0.279 },
  { feature: "amount_log", importance: 0.107 },
  { feature: "receiver_risk", importance: 0.063 },
  { feature: "receiver_calibrated_score", importance: 0.050 },
];

/**
 * Synchronous transaction risk scoring — uses trained model if loaded,
 * falls back to weighted heuristic.
 */
export function computeTransactionRiskSync(features: TransactionFeatures): number {
  // Sync path cannot await a fetch — kick off a (deduplicated) load so later
  // calls use the trained model; initTransactionModel() has no callers today,
  // so without this the model would never leave the fallback heuristic.
  // This must also fire once the cache goes stale, or MODEL_CACHE_TTL_MS
  // could never expire; the current call just uses whatever is cached.
  if (!cachedModel || Date.now() - modelLoadTime >= MODEL_CACHE_TTL_MS) {
    void loadTransactionModel();
  }

  const vals = Object.values(features);
  const hasInvalid = vals.some((v) => !Number.isFinite(v));
  if (hasInvalid) {
    const safe = { ...features } as Record<string, number>;
    for (const key of Object.keys(features)) {
      if (!Number.isFinite(safe[key])) safe[key] = 0;
    }
    return weightedFallback(safe as unknown as TransactionFeatures);
  }

  if (cachedModel && cachedModel.trees.length > 0 && featureMap) {
    const validTrees = cachedModel.trees.filter(isValidTree);
    if (validTrees.length > cachedModel.trees.length * 0.5) {
      const vec = buildFeatureVector(features);
      return Math.round(predict(cachedModel, vec) * 1000) / 10;
    }
  }
  return weightedFallback(features);
}

/**
 * Async transaction risk scoring — loads model first, then predicts.
 */
export async function computeTransactionRisk(features: TransactionFeatures): Promise<number> {
  await loadTransactionModel();
  return computeTransactionRiskSync(features);
}

/**
 * Get feature importances from the trained transaction model.
 */
export function getTransactionFeatureImportances(): { feature: string; importance: number }[] {
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
  // Guard against a model whose splits use numeric indices instead of names
  // (countSplitFeatures only counts string features) — mirror xgboostPredictor.
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
