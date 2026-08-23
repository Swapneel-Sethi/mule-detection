#!/usr/bin/env python3
"""
Recompute ml_score and calibrated_score for all accounts using the actual
XGBoost model weights. Reads model_weights.json and accounts_dataset.json,
runs inference on each account, applies Platt scaling, and overwrites the
dataset with real model outputs.
"""
import json
import math
import sys
import time

MODEL_PATH = "public/model_weights.json"
ACCOUNTS_PATH = "public/accounts_dataset.json"
OUTPUT_PATH = "public/accounts_dataset.json"

# Platt scaling parameters (must match mlModel.ts calibrateScore)
PLATT_A = -4.0
PLATT_B = 2.0
ML_SCORE_MIN = 0.25
ML_SCORE_MAX = 0.50


def sigmoid(x):
    if not math.isfinite(x):
        return 1.0 if x > 0 else 0.0
    return 1.0 / (1.0 + math.exp(-x))


def platt_scale(raw_score):
    """True Platt scaling: P(y=1) = 1 / (1 + exp(A * raw + B))"""
    if not math.isfinite(raw_score):
        return 0.0
    cal = 1.0 / (1.0 + math.exp(PLATT_A * raw_score + PLATT_B))
    return round(cal * 1000) / 1000


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
    log_odds = model["base_score"]
    for tree in model["trees"]:
        log_odds += traverse_tree(tree, feature_vec, feature_map) * model["learning_rate"]
    return sigmoid(log_odds)


def build_feature_vector(acc):
    """Build the 16-feature vector from an account record."""
    in_txn = acc.get("in_txn_count", 0)
    out_txn = acc.get("out_txn_count", 0)
    total_in = acc.get("total_in_amount", 0)
    total_out = acc.get("total_out_amount", 0)
    return [
        acc.get("account_age_days", 365),          # account_age_days
        acc.get("kyc_status", 1),                   # kyc_status (default: verified)
        acc.get("account_type", 0),                 # account_type (default: savings)
        in_txn,                                      # in_txn_count
        acc.get("unique_senders", in_txn),           # unique_senders
        total_in,                                    # total_in_amount
        total_in / in_txn if in_txn > 0 else 0,     # avg_in_amount
        out_txn,                                     # out_txn_count
        acc.get("unique_receivers", out_txn),        # unique_receivers
        total_out,                                   # total_out_amount
        total_out / out_txn if out_txn > 0 else 0,  # avg_out_amount
        acc.get("pass_through_ratio", 0),            # pass_through_ratio
        acc.get("txn_velocity_per_day", 0),          # txn_velocity_per_day
        acc.get("pagerank", 0),                       # pagerank
        acc.get("hub_score", 0),                     # hub_score
        acc.get("authority_score", 0),               # authority_score
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
        ml_calibrated = platt_scale(ml_raw)
        old_ml = acc.get("ml_score", 0)
        old_cal = acc.get("calibrated_score", 0)
        acc["ml_score"] = round(ml_raw * 1000) / 1000
        # Normalize to [0,1] for ensemble contribution (matches detectionEngine.ts)
        ml_normalized = max(0, min(1, (ml_raw - ML_SCORE_MIN) / (ML_SCORE_MAX - ML_SCORE_MIN)))
        acc["calibrated_score"] = round(ml_normalized * 1000) / 1000
        # Risk level must match TypeScript thresholds (0.70/0.50/0.30)
        if ml_normalized >= 0.70:
            acc["risk_level"] = "critical"
        elif ml_normalized >= 0.50:
            acc["risk_level"] = "high"
        elif ml_normalized >= 0.30:
            acc["risk_level"] = "medium"
        else:
            acc["risk_level"] = "low"
        # is_mule must match TypeScript logic (calibratedScore >= 0.50)
        acc["is_mule"] = ml_normalized >= 0.50
        scores.append(ml_raw)
        if abs(old_ml - ml_raw) > 0.01 or abs(old_cal - ml_calibrated) > 0.01:
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

    # Count by risk level using calibrated score
    critical = sum(1 for a in accounts if a["calibrated_score"] >= 0.75)
    high = sum(1 for a in accounts if 0.55 <= a["calibrated_score"] < 0.75)
    medium = sum(1 for a in accounts if 0.35 <= a["calibrated_score"] < 0.55)
    low = sum(1 for a in accounts if a["calibrated_score"] < 0.35)
    print(f"Risk distribution (calibrated): critical={critical}, high={high}, medium={medium}, low={low}")

    # Verify a few ACM accounts
    acm_scores = [a["ml_score"] for a in accounts if a.get("is_mule") == "ACM"]
    if acm_scores:
        print(f"ACM accounts: count={len(acm_scores)}, mean_ml={sum(acm_scores)/len(acm_scores):.4f}, "
              f"min={min(acm_scores):.4f}, max={max(acm_scores):.4f}")

    print(f"\nSaving to {OUTPUT_PATH}...")
    with open(OUTPUT_PATH, "w") as f:
        json.dump(accounts, f)
    print("Saved successfully")


if __name__ == "__main__":
    main()
