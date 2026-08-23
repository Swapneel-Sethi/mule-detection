"""
Train a transaction-level XGBoost model and export it to JSON for TypeScript inference.

Loads transactions_synthetic.json + accounts_dataset.json, engineers 16 per-transaction
features, trains XGBoost, evaluates, and exports to public/transaction_model.json.

Usage:
    python scripts/train_transaction_model.py
"""

import json
import sys
from pathlib import Path

import numpy as np
from xgboost import XGBClassifier
from sklearn.model_selection import cross_val_score, StratifiedKFold
from sklearn.metrics import classification_report, roc_auc_score, confusion_matrix

# ── Paths ────────────────────────────────────────────────────────────────────

ROOT = Path(__file__).resolve().parent.parent
TXN_PATH = ROOT / "public" / "transactions_synthetic.json"
ACC_PATH = ROOT / "public" / "accounts_dataset.json"
OUTPUT_PATH = ROOT / "public" / "transaction_model.json"

# ── Feature names (16 total) ────────────────────────────────────────────────

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
    """Extract 16 per-transaction features and labels."""
    features = []
    labels = []
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
            from datetime import datetime
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

    if skipped:
        print(f"  Skipped {skipped} transactions with invalid amounts")

    return np.array(features, dtype=np.float32), np.array(labels, dtype=np.int32)


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

def evaluate(model, X, y):
    """Run cross-validation and holdout-style evaluation."""
    print("\n" + "=" * 60)
    print("EVALUATION")
    print("=" * 60)

    # 5-fold stratified cross-validation AUC
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    cv_scores = cross_val_score(model, X, y, cv=cv, scoring="roc_auc", n_jobs=-1)
    print(f"\n5-Fold CV AUC: {cv_scores.mean():.6f} ± {cv_scores.std():.6f}")
    print(f"  Per-fold:    {[f'{s:.6f}' for s in cv_scores]}")

    # Full-data predictions for classification report
    y_prob = model.predict_proba(X)[:, 1]
    y_pred = (y_prob >= 0.5).astype(int)

    print(f"\nROC-AUC (full data): {roc_auc_score(y, y_prob):.6f}")
    print(f"\nClassification Report (threshold=0.5):")
    print(classification_report(y, y_pred, target_names=["clean", "flagged"]))

    cm = confusion_matrix(y, y_pred)
    print(f"Confusion Matrix:")
    print(f"  TN={cm[0,0]:,}  FP={cm[0,1]:,}")
    print(f"  FN={cm[1,0]:,}  TP={cm[1,1]:,}")

    # Feature importances
    importances = model.feature_importances_
    print(f"\nFeature Importances (gain):")
    for name, imp in sorted(zip(FEATURE_NAMES, importances), key=lambda x: -x[1]):
        bar = "#" * int(imp * 50)
        print(f"  {name:<32s} {imp:.4f}  {bar}")

    return cv_scores


# ── JSON export ──────────────────────────────────────────────────────────────

def parse_xgboost_dump(dump_str):
    """Parse XGBoost text dump into nested JSON tree nodes.

    XGBoost text format per line:
        NODE_ID:[feature<threshold] yes=ID,no=ID,missing=ID,gain=...,cover=...]
    or for leaves:
        NODE_ID:leaf=VALUE

    Returns a single root TreeNode dict.
    """
    lines = dump_str.strip().split("\n")
    nodes = {}

    for line in lines:
        line = line.strip()
        if not line:
            continue

        # Split on first colon to get node id
        colon_pos = line.index(":")
        node_id = int(line[:colon_pos])
        content = line[colon_pos + 1 :].strip()

        if "leaf=" in content:
            leaf_val = float(content.split("leaf=")[1].split()[0])
            nodes[node_id] = {"leaf": leaf_val}
        else:
            # Parse: [feature<threshold] yes=ID,no=ID,missing=ID,...
            bracket_content = content.split("]")[0].replace("[", "")
            feature_name = bracket_content.split("<")[0].strip()
            threshold = float(bracket_content.split("<")[1].strip())

            params = content.split("]")[1].strip()
            yes = int(params.split("yes=")[1].split(",")[0])
            no = int(params.split("no=")[1].split(",")[0])

            if "missing=" in params:
                missing = int(params.split("missing=")[1].split(",")[0])
            else:
                missing = yes

            nodes[node_id] = {
                "feature": feature_name,
                "threshold": threshold,
                "yes": yes,
                "no": no,
                "missing": missing,
            }

    def build_tree(idx):
        node = nodes.get(idx)
        if node is None:
            return {"leaf": 0.0}

        if "leaf" in node:
            return {"leaf": node["leaf"]}

        left = build_tree(node["yes"])
        right = build_tree(node["no"])
        missing = build_tree(node["missing"])

        # Omit missing if it points to the same child as left (common optimization)
        if missing == left:
            missing = None

        return {
            "feature": node["feature"],
            "threshold": node["threshold"],
            "left": left,
            "right": right,
            "missing": missing,
        }

    return build_tree(0)


def export_model(model, feature_names, output_path):
    """Export trained XGBoost model to JSON for TypeScript inference."""
    booster = model.get_booster()
    # Set feature names on the booster so get_dump() uses string names
    booster.feature_names = feature_names
    dumps = booster.get_dump()

    trees = []
    total_nodes = 0
    for tree_dump in dumps:
        tree = parse_xgboost_dump(tree_dump)
        trees.append(tree)
        total_nodes += count_nodes(tree)

    base_score_attr = booster.attr("base_score")
    if base_score_attr is not None:
        base_score = float(base_score_attr)
    else:
        base_score = 0.5

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
    X, y = extract_features(txns, acc_map)
    print(f"  Feature matrix: {X.shape}")
    print(f"  Labels: {y.shape}  (flagged={y.sum():,})")

    # 3. Train
    model = train_model(X, y)

    # 4. Evaluate
    cv_scores = evaluate(model, X, y)

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
