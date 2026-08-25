"""
Train a transaction-level XGBoost model and export it to JSON for TypeScript inference.

Loads transactions_synthetic.json + accounts_dataset.json, engineers 16 per-transaction
features, trains XGBoost, evaluates, and exports to public/transaction_model.json.

Usage:
    python scripts/train_transaction_model.py
"""

import json
import math
from datetime import datetime
from pathlib import Path

import numpy as np
from xgboost import XGBClassifier
from sklearn.base import clone
from sklearn.model_selection import cross_val_score, StratifiedGroupKFold
from sklearn.metrics import classification_report, roc_auc_score, confusion_matrix

# ── Paths ────────────────────────────────────────────────────────────────────

ROOT = Path(__file__).resolve().parent.parent
TXN_PATH = ROOT / "public" / "transactions_synthetic.json"
ACC_PATH = ROOT / "public" / "accounts_dataset.json"
OUTPUT_PATH = ROOT / "public" / "transaction_model.json"

# ── Feature names (16 total) ────────────────────────────────────────────────
#
# SERVING CONTRACT: this list, its order, and the formulas in extract_features()
# are mirrored by the TypeScript consumers src/lib/transactionScorer.ts and
# src/lib/transactionXgboost.ts. The trainer is the source of truth — any change
# here (e.g. is_night = hour < 6, amount_ratio = amount / (total_in + 1)) must
# be applied there in the same release or train/serve parity breaks.

FEATURE_NAMES = [
    "amount",
    "amount_log",
    "sender_calibrated_score",
    "receiver_calibrated_score",
    "sender_hub_score",
    "receiver_hub_score",
    "sender_velocity",
    "receiver_velocity",
    "amount_ratio",
    "sender_risk",
    "receiver_risk",
    "risk_product",
    "hour_of_day",
    "is_night",
    "is_weekend",
    "amount_x_sender_risk",
]


# ── Data loading ─────────────────────────────────────────────────────────────

def load_data():
    print("Loading transactions...")
    with open(TXN_PATH) as f:
        txns = json.load(f)
    print(f"  Loaded {len(txns):,} transactions")

    print("Loading accounts...")
    with open(ACC_PATH) as f:
        accs = json.load(f)
    print(f"  Loaded {len(accs):,} accounts")

    acc_map = {a["account_id"]: a for a in accs}
    return txns, acc_map


# ── Feature engineering ──────────────────────────────────────────────────────

def extract_features(txns, acc_map):
    """Extract 16 per-transaction features, labels, and account-group ids."""
    features = []
    labels = []
    groups = []
    skipped = 0

    for txn in txns:
        sender_id = txn.get("from", txn.get("from_account", ""))
        receiver_id = txn.get("to", txn.get("to_account", ""))
        amount = float(txn.get("amount", 0))

        sender = acc_map.get(sender_id, {})
        receiver = acc_map.get(receiver_id, {})

        # Skip if amount is missing/zero (shouldn't happen but defensive)
        if amount <= 0:
            skipped += 1
            continue

        # Parse timestamp
        ts = txn.get("timestamp", "")
        try:
            dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
            hour = dt.hour
            weekday = dt.weekday()  # 0=Mon, 6=Sun
        except Exception:
            hour = 12
            weekday = 0

        # Account scores with defaults
        sender_cal = float(sender.get("calibrated_score", 0.3) or 0.3)
        receiver_cal = float(receiver.get("calibrated_score", 0.3) or 0.3)
        sender_hub = float(sender.get("hub_score", 0) or 0)
        receiver_hub = float(receiver.get("hub_score", 0) or 0)
        sender_vel = float(sender.get("txn_velocity_per_day", 0) or 0)
        receiver_vel = float(receiver.get("txn_velocity_per_day", 0) or 0)
        sender_risk_raw = float(sender.get("risk_score", 10) or 10)
        receiver_risk_raw = float(receiver.get("risk_score", 10) or 10)

        # Derived features
        sender_risk_norm = sender_risk_raw / 100.0
        receiver_risk_norm = receiver_risk_raw / 100.0
        sender_total_in = float(sender.get("total_in_amount", 0) or 0)
        amount_ratio = amount / (sender_total_in + 1.0)

        row = [
            amount,                                          # 0  amount
            np.log1p(amount),                                # 1  amount_log
            sender_cal,                                      # 2  sender_calibrated_score
            receiver_cal,                                    # 3  receiver_calibrated_score
            sender_hub,                                      # 4  sender_hub_score
            receiver_hub,                                    # 5  receiver_hub_score
            sender_vel,                                      # 6  sender_velocity
            receiver_vel,                                    # 7  receiver_velocity
            amount_ratio,                                    # 8  amount_ratio
            sender_risk_norm,                                # 9  sender_risk
            receiver_risk_norm,                              # 10 receiver_risk
            sender_risk_norm * receiver_risk_norm,           # 11 risk_product
            hour,                                            # 12 hour_of_day
            1 if 0 <= hour < 6 else 0,                      # 13 is_night
            1 if weekday >= 5 else 0,                       # 14 is_weekend
            amount * sender_risk_norm,                       # 15 amount_x_sender_risk
        ]
        features.append(row)
        labels.append(1 if txn.get("flagged", False) else 0)
        # Group by endpoint pair so CV folds never share an account
        groups.append(f"{sender_id}|{receiver_id}")

    if skipped:
        print(f"  Skipped {skipped} transactions with invalid amounts")

    return (
        np.array(features, dtype=np.float32),
        np.array(labels, dtype=np.int32),
        np.array(groups),
    )


# ── Model training ───────────────────────────────────────────────────────────

def train_model(X, y):
    """Train XGBoost classifier with tuned hyperparameters."""
    neg = int((y == 0).sum())
    pos = int((y == 1).sum())
    scale = neg / max(pos, 1)
    print(f"\nClass distribution: {pos:,} flagged / {neg:,} clean (ratio 1:{scale:.1f})")

    model = XGBClassifier(
        n_estimators=200,
        max_depth=6,
        learning_rate=0.1,
        subsample=0.8,
        colsample_bytree=0.8,
        min_child_weight=5,
        reg_alpha=0.1,
        reg_lambda=1.0,
        scale_pos_weight=scale,
        objective="binary:logistic",
        eval_metric="auc",
        tree_method="hist",
        random_state=42,
        n_jobs=-1,
    )

    print("\nTraining XGBoost (200 trees, depth=6, lr=0.1)...")
    model.fit(X, y)
    print("Training complete.")
    return model


# ── Evaluation ───────────────────────────────────────────────────────────────

def evaluate(model, X, y, groups):
    """Grouped cross-validation plus a true held-out evaluation.

    Folds are split by endpoint-account group: without grouping, the same
    account appears in both train and test folds (accounts repeat across many
    transactions) and CV AUC is inflated by near-duplicate rows.
    """
    print("\n" + "=" * 60)
    print("EVALUATION")
    print("=" * 60)

    # 5-fold group-stratified cross-validation AUC
    cv = StratifiedGroupKFold(n_splits=5, shuffle=True, random_state=42)
    cv_scores = cross_val_score(model, X, y, groups=groups, cv=cv, scoring="roc_auc", n_jobs=-1)
    print(f"\n5-Fold Grouped-CV AUC: {cv_scores.mean():.6f} ± {cv_scores.std():.6f}")
    print(f"  Per-fold:    {[f'{s:.6f}' for s in cv_scores]}")

    # Held-out evaluation on one unseen group split (never trained on)
    train_idx, test_idx = next(cv.split(X, y, groups=groups))
    heldout = clone(model).fit(X[train_idx], y[train_idx])
    y_prob = heldout.predict_proba(X[test_idx])[:, 1]
    y_pred = (y_prob >= 0.5).astype(int)
    y_test = y[test_idx]

    print(f"\nHeld-out ROC-AUC: {roc_auc_score(y_test, y_prob):.6f}")
    print("\nClassification Report on held-out fold (threshold=0.5):")
    print(classification_report(y_test, y_pred, target_names=["clean", "flagged"]))

    cm = confusion_matrix(y_test, y_pred)
    print("Confusion Matrix (held-out fold):")
    print(f"  TN={cm[0,0]:,}  FP={cm[0,1]:,}")
    print(f"  FN={cm[1,0]:,}  TP={cm[1,1]:,}")

    # Feature importances
    importances = model.feature_importances_
    print("\nFeature Importances (gain):")
    for name, imp in sorted(zip(FEATURE_NAMES, importances), key=lambda x: -x[1]):
        bar = "#" * int(imp * 50)
        print(f"  {name:<32s} {imp:.4f}  {bar}")

    return cv_scores


# ── JSON export ──────────────────────────────────────────────────────────────

def resolve_base_score(booster):
    """Return the model's base_score as a probability in [0, 1].

    The TypeScript consumer (src/lib/transactionXgboost.ts) converts
    base_score to log-odds before adding it to the summed tree margin, so the
    exported value must be a probability. booster.attr("base_score") is None
    on modern XGBoost; the authoritative value lives in save_config under
    learner_model_param.base_score (e.g. "[4.99E-1]"). A value outside (0, 1)
    cannot be a probability — treat it as margin space and squash it.
    """
    raw = None
    try:
        cfg = json.loads(booster.save_config())
        # xgboost serializes this value bracketed, e.g. "[8.0066666E-2]"
        raw_text = cfg["learner"]["learner_model_param"]["base_score"]
        raw = float(str(raw_text).strip("[] \t"))
    except Exception:
        raw = None
    if raw is None:
        attr = booster.attr("base_score")
        raw = float(attr) if attr is not None else None
    if raw is None:
        return 0.5
    if 0.0 < raw < 1.0:
        return raw
    if not math.isfinite(raw):
        return 0.5
    return 1.0 / (1.0 + math.exp(-raw))


def parse_xgboost_json(tree_str):
    """Parse one XGBoost JSON-format tree dump into nested tree nodes.

    Node shape matches what src/lib/transactionXgboost.ts traverses:
    internal {feature, threshold, left, right, missing}, leaves {leaf: value}.
    Uses dump_format="json" for structure fidelity. NOTE: XGBoost serializes
    split thresholds at ~9 significant digits in every Python-visible form
    (text dump, json dump, trees_to_dataframe), so exported thresholds are
    quantized vs the model's internal float32 — measured impact is < 0.01
    percentage points of probability on boundary rows.
    """
    root = json.loads(tree_str)

    def build(node):
        if "leaf" in node:
            return {"leaf": node["leaf"]}
        yes_id = node["yes"]
        miss_id = node.get("missing", yes_id)
        kids = {c["nodeid"]: c for c in node.get("children", [])}
        return {
            "feature": node["split"],  # string name (booster.feature_names is set)
            "threshold": node["split_condition"],
            "left": build(kids[yes_id]),
            "right": build(kids[node["no"]]),
            # Omit the missing branch when it duplicates the yes branch
            "missing": build(kids[miss_id]) if miss_id != yes_id and miss_id in kids else None,
        }

    return build(root)


def export_model(model, feature_names, output_path):
    """Export trained XGBoost model to JSON for TypeScript inference."""
    booster = model.get_booster()
    # Set feature names on the booster so dumps use string names
    booster.feature_names = feature_names
    dumps = booster.get_dump(dump_format="json")

    trees = []
    total_nodes = 0
    for tree_dump in dumps:
        tree = parse_xgboost_json(tree_dump)
        trees.append(tree)
        total_nodes += count_nodes(tree)

    base_score = resolve_base_score(booster)

    model_data = {
        "version": "1.0",
        "num_features": len(feature_names),
        "feature_names": feature_names,
        "num_trees": len(trees),
        "base_score": base_score,
        "learning_rate": model.get_params()["learning_rate"],
        "objective": "binary:logistic",
        "trees": trees,
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w") as f:
        json.dump(model_data, f)

    print(f"\nExported {len(trees)} trees ({total_nodes:,} nodes) to {output_path}")

    # Also export feature importances for the dashboard
    importances = dict(zip(feature_names, [float(x) for x in model.feature_importances_]))
    imp_path = output_path.parent / "transaction_feature_importances.json"
    with open(imp_path, "w") as f:
        json.dump(importances, f, indent=2)
    print(f"Feature importances exported to {imp_path}")

    return len(trees), total_nodes


def count_nodes(node):
    """Count total nodes in a tree."""
    if "leaf" in node:
        return 1
    c = 1
    if node.get("left"):
        c += count_nodes(node["left"])
    if node.get("right"):
        c += count_nodes(node["right"])
    if node.get("missing"):
        c += count_nodes(node["missing"])
    return c


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    print("=" * 60)
    print("Transaction-Level XGBoost Training Pipeline")
    print("=" * 60)

    # 1. Load data
    txns, acc_map = load_data()

    # 2. Extract features
    print("\nExtracting 16 transaction-level features...")
    X, y, groups = extract_features(txns, acc_map)
    print(f"  Feature matrix: {X.shape}")
    print(f"  Labels: {y.shape}  (flagged={y.sum():,})")
    print(f"  Account groups: {len(set(groups)):,}")

    # 3. Train
    model = train_model(X, y)

    # 4. Evaluate (group-aware CV + held-out fold)
    cv_scores = evaluate(model, X, y, groups)

    # 5. Export
    print("\n" + "=" * 60)
    print("EXPORT")
    print("=" * 60)
    num_trees, total_nodes = export_model(model, FEATURE_NAMES, OUTPUT_PATH)

    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    print(f"  CV AUC:              {cv_scores.mean():.6f} ± {cv_scores.std():.6f}")
    print(f"  Trees exported:      {num_trees}")
    print(f"  Total nodes:         {total_nodes:,}")
    print(f"  Features:            {len(FEATURE_NAMES)}")
    print(f"  Model file:          {OUTPUT_PATH}")
    print(f"  Feature importances: {OUTPUT_PATH.parent / 'transaction_feature_importances.json'}")
    print("=" * 60)


if __name__ == "__main__":
    main()
