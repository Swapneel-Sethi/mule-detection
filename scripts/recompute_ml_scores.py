#!/usr/bin/env python3
"""
Recompute ml_score and calibrated_score for all accounts using the actual
XGBoost model weights. Reads model_weights.json and accounts_dataset.json,
runs inference on each account, min-max normalizes the raw score to [0, 1]
(same ML_SCORE_MIN/MAX constants as detectionEngine.ts), and overwrites the
dataset with real model outputs.

NOTE: this script must run from the project root (paths are relative), or via
an interpreter whose CWD is the project root.
"""
import json
import math
import time

MODEL_PATH = "public/model_weights.json"
ACCOUNTS_PATH = "public/accounts_dataset.json"
OUTPUT_PATH = "public/accounts_dataset.json"

# Min-max normalization range (must match detectionEngine.ts ML_SCORE_MIN/MAX)
ML_SCORE_MIN = 0.262
ML_SCORE_MAX = 0.466


def sigmoid(x):
    if not math.isfinite(x):
        return 1.0 if x > 0 else 0.0
    return 1.0 / (1.0 + math.exp(-x))


def load_model(path):
    with open(path, "r") as f:
        model = json.load(f)
    feature_map = {name: idx for idx, name in enumerate(model["feature_names"])}
    print(f"Model loaded: {model['num_trees']} trees, {model['num_features']} features")
    print(f"Features: {model['feature_names']}")
    return model, feature_map


def get_feature_index(node, feature_map):
    feat = node.get("feature")
    if feat is None:
        return -1
    if isinstance(feat, (int, float)):
        return int(feat)
    if isinstance(feat, str):
        return feature_map.get(feat, -1)
    return -1


def traverse_tree(node, features, feature_map):
    """Iterative tree traversal."""
    while node is not None:
        if "leaf" in node and node["leaf"] is not None:
            return node["leaf"]
        if "feature" not in node or node["feature"] is None:
            return 0
        idx = get_feature_index(node, feature_map)
        if idx < 0 or idx >= len(features):
            return 0
        val = features[idx]
        thresh = node.get("threshold", 0)
        left = node.get("left")
        right = node.get("right")
        missing = node.get("missing")
        if left is None and right is None and missing is None:
            return 0
        if not math.isfinite(val):
            node = missing
        elif val <= thresh:
            node = left if left is not None else missing
        else:
            node = right if right is not None else missing
    return 0


def predict(model, feature_vec, feature_map):
    # NOTE: leaf values are multiplied by learning_rate here. This intentionally
    # DIVERGES from xgboostPredictor.ts (which sums post-eta dump leaves as-is):
    # XGBoost get_dump() output already includes shrinkage, so the raw model
    # probability saturates near 0/1 on this dataset, while the shipped
    # ml_score range and the ML_SCORE_MIN/MAX normalization constants above
    # were fit to this eta-rescaled distribution. Changing either side requires
    # recalibrating ML_SCORE_MIN/MAX and the risk thresholds together.
    log_odds = model["base_score"]
    for tree in model["trees"]:
        log_odds += traverse_tree(tree, feature_vec, feature_map) * model["learning_rate"]
    return sigmoid(log_odds)


def _num(value, default=0.0):
    """Coerce a dataset value to float (kyc_status/account_type are stored as
    strings like "0"/"1"/"2"; math.isfinite would raise TypeError on them)."""
    if isinstance(value, bool) or value is None:
        return float(default)
    try:
        n = float(value)
    except (TypeError, ValueError):
        return float(default)
    return n if math.isfinite(n) else float(default)


def build_feature_vector(acc):
    """Build the 16-feature vector from an account record.

    Input divergences vs detectionEngine.ts (which recomputes features from the
    live graph and hardcodes kyc_status=1, account_type=0, age fallback 365):
    here we feed the dataset's stored aggregates directly.
    """
    in_txn = _num(acc.get("in_txn_count", 0))
    out_txn = _num(acc.get("out_txn_count", 0))
    total_in = _num(acc.get("total_in_amount", 0))
    total_out = _num(acc.get("total_out_amount", 0))
    return [
        _num(acc.get("account_age_days", 365)),     # account_age_days
        _num(acc.get("kyc_status", 1)),              # kyc_status (dataset: "0"/"1")
        _num(acc.get("account_type", 0)),            # account_type (dataset: "0"/"1"/"2")
        in_txn,                                      # in_txn_count
        _num(acc.get("unique_senders", acc.get("in_txn_count", 0))),  # unique_senders
        total_in,                                    # total_in_amount
        total_in / in_txn if in_txn > 0 else 0,     # avg_in_amount
        out_txn,                                     # out_txn_count
        _num(acc.get("unique_receivers", acc.get("out_txn_count", 0))),  # unique_receivers
        total_out,                                   # total_out_amount
        total_out / out_txn if out_txn > 0 else 0,  # avg_out_amount
        _num(acc.get("pass_through_ratio", 0)),      # pass_through_ratio
        _num(acc.get("txn_velocity_per_day", 0)),    # txn_velocity_per_day
        _num(acc.get("pagerank", 0)),                # pagerank
        _num(acc.get("hub_score", 0)),               # hub_score
        _num(acc.get("authority_score", 0)),         # authority_score
    ]


def main():
    print("Loading model...")
    model, feature_map = load_model(MODEL_PATH)

    print(f"Loading accounts from {ACCOUNTS_PATH}...")
    with open(ACCOUNTS_PATH, "r") as f:
        accounts = json.load(f)
    print(f"Loaded {len(accounts)} accounts")

    # Verify model trees
    valid_trees = sum(1 for t in model["trees"] if "leaf" in t or ("feature" in t and ("left" in t or "right" in t)))
    print(f"Valid trees: {valid_trees}/{model['num_trees']}")

    start = time.time()
    updated = 0
    scores = []
    for i, acc in enumerate(accounts):
        vec = build_feature_vector(acc)
        ml_raw = predict(model, vec, feature_map)
        old_ml = acc.get("ml_score", 0)
        old_cal = acc.get("calibrated_score", 0)
        acc["ml_score"] = round(ml_raw * 1000) / 1000
        # Normalize to [0,1] for ensemble contribution (matches detectionEngine.ts)
        ml_normalized = max(0, min(1, (ml_raw - ML_SCORE_MIN) / (ML_SCORE_MAX - ML_SCORE_MIN)))
        acc["calibrated_score"] = round(ml_normalized * 1000) / 1000
        # Risk level must match TypeScript thresholds (detectionEngine.ts
        # ITER-2 band retune: critical >= 0.71, high >= 0.66, medium >= 0.551)
        if ml_normalized >= 0.71:
            acc["risk_level"] = "critical"
        elif ml_normalized >= 0.66:
            acc["risk_level"] = "high"
        elif ml_normalized >= 0.551:
            acc["risk_level"] = "medium"
        else:
            acc["risk_level"] = "low"
        # is_mule must match TypeScript logic (detectionEngine.ts: calibratedScore >= 0.551)
        acc["is_mule"] = ml_normalized >= 0.551
        scores.append(ml_raw)
        if abs(old_ml - acc["ml_score"]) > 0.01 or abs(old_cal - acc["calibrated_score"]) > 0.01:
            updated += 1
        if (i + 1) % 10000 == 0:
            elapsed = time.time() - start
            rate = (i + 1) / elapsed
            eta = (len(accounts) - i - 1) / rate
            print(f"  {i+1}/{len(accounts)} ({rate:.0f}/s, ETA {eta:.0f}s)")

    elapsed = time.time() - start
    print(f"\nDone in {elapsed:.1f}s ({len(accounts)/elapsed:.0f} accounts/s)")
    print(f"Updated ml_score for {updated}/{len(accounts)} accounts")

    # Stats
    scores.sort()
    print(f"ML score range: {scores[0]:.4f} - {scores[-1]:.4f}")
    print(f"ML score mean: {sum(scores)/len(scores):.4f}")
    print(f"ML score median: {scores[len(scores)//2]:.4f}")

    # Risk distribution — derived from the risk_level actually written above,
    # so the reported counts match the stored field
    by_level = {"critical": 0, "high": 0, "medium": 0, "low": 0}
    for a in accounts:
        by_level[a["risk_level"]] = by_level.get(a["risk_level"], 0) + 1
    print(f"Risk distribution (calibrated): critical={by_level['critical']}, "
          f"high={by_level['high']}, medium={by_level['medium']}, low={by_level['low']}")

    # Verify a few ACM accounts
    acm_scores = [a["ml_score"] for a in accounts if str(a.get("account_id", "")).startswith("ACM")]
    if acm_scores:
        print(f"ACM accounts: count={len(acm_scores)}, mean_ml={sum(acm_scores)/len(acm_scores):.4f}, "
              f"min={min(acm_scores):.4f}, max={max(acm_scores):.4f}")

    print(f"\nSaving to {OUTPUT_PATH}...")
    with open(OUTPUT_PATH, "w") as f:
        json.dump(accounts, f)
    print("Saved successfully")


if __name__ == "__main__":
    main()
