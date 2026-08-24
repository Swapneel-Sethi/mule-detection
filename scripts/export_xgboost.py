"""
Export trained XGBoost model to JSON for TypeScript inference.
Run this after training your model in Colab/Jupyter.

Usage:
    python scripts/export_xgboost.py

Produces:
    scripts/model_weights.json  -- tree structure + metadata
"""

import json
import numpy as np
from pathlib import Path

try:
    import xgboost as xgb
except ImportError:
    raise SystemExit("Install xgboost: pip install xgboost")


def extract_tree(node_dict, tree_index, node_id=0):
    """Recursively extract tree structure from XGBoost booster."""
    node = node_dict.get(node_id)
    if node is None:
        return None

    if "leaf" in node:
        return {
            "leaf": float(node["leaf"]),
            "tree": tree_index,
        }

    feat = node.get("feature", -1)
    split = float(node.get("split", 0))
    yes = node.get("yes", -1)
    no = node.get("no", -1)
    missing = node.get("missing", -1)

    return {
        "feature": int(feat),
        "threshold": split,
        "left": extract_tree(node_dict, tree_index, yes) if yes >= 0 else None,
        "right": extract_tree(node_dict, tree_index, no) if no >= 0 else None,
        "missing": extract_tree(node_dict, tree_index, missing) if missing >= 0 else None,
    }


def export_model(model: xgb.XGBClassifier, feature_names: list, output_path: Path):
    booster = model.get_booster()
    dumps = booster.get_dump(dump_format="json")

    trees = []
    for i, tree_str in enumerate(dumps):
        tree_raw = json.loads(tree_str)
        # Convert list-of-nodes to dict keyed by node id
        node_dict = {n["nodeid"]: n for n in tree_raw}
        tree = extract_tree(node_dict, i)
        if tree:
            trees.append(tree)

    # Get base score from the learner (booster.attr returns None for base_score
    # on modern XGBoost — it lives on the learner, not the booster).
    try:
        base_score = float(model.base_score)
    except (TypeError, ValueError, AttributeError):
        base_score = 0.0

    model_data = {
        "version": "1.0",
        "num_features": len(feature_names),
        "feature_names": feature_names,
        "num_trees": len(trees),
        "base_score": base_score,
        "learning_rate": model.learning_rate if hasattr(model, "learning_rate") else 0.05,
        "objective": "binary:logistic",
        "trees": trees,
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w") as f:
        json.dump(model_data, f)

    print(f"Exported {len(trees)} trees to {output_path}")
    print(f"  Features: {feature_names}")
    print(f"  Base score: {base_score}")

    # Also export feature importances for the dashboard
    importances = dict(zip(feature_names, [float(x) for x in model.feature_importances_]))
    imp_path = output_path.parent / "feature_importances.json"
    with open(imp_path, "w") as f:
        json.dump(importances, f, indent=2)
    print(f"  Feature importances exported to {imp_path}")


if __name__ == "__main__":
    from sklearn.model_selection import train_test_split
    import pandas as pd

    DATA_DIR = Path("./dataset_output")
    df = pd.read_csv(DATA_DIR / "ml_features_100k.csv")

    X = df.drop(columns=["account_id", "is_mule"])
    y = df["is_mule"]
    feature_names = list(X.columns)

    neg_count = (y == 0).sum()
    pos_count = (y == 1).sum()
    scale_weight = neg_count / pos_count

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    model = xgb.XGBClassifier(
        n_estimators=200,
        learning_rate=0.05,
        max_depth=5,
        scale_pos_weight=scale_weight,
        tree_method="hist",
        random_state=42,
    )
    model.fit(X_train, y_train)

    from sklearn.metrics import roc_auc_score
    y_prob = model.predict_proba(X_test)[:, 1]
    print(f"ROC-AUC: {roc_auc_score(y_test, y_prob):.6f}")

    output = Path("./scripts/model_weights.json")
    export_model(model, feature_names, output)
