"""
Export trained XGBoost model to JSON for TypeScript inference.
Run this after training your model in Colab/Jupyter.

Usage:
    python scripts/export_xgboost.py

Produces:
    public/model_weights.json  -- tree structure + metadata
                                  (served at /model_weights.json by
                                  src/lib/xgboostPredictor.ts)
"""

import json
import math
import re
from pathlib import Path

try:
    import xgboost as xgb
except ImportError:
    raise SystemExit("Install xgboost: pip install xgboost")

ROOT = Path(__file__).resolve().parent.parent


def extract_tree(raw, tree_index):
    """Convert one XGBoost JSON-format dump tree into the consumer's shape.

    get_dump(dump_format="json") returns a NESTED object per tree
    ({nodeid, split, split_condition, yes, no, missing, children: [...]}) —
    not a flat list. Output nodes follow the schema consumed by
    src/lib/xgboostPredictor.ts: internal {feature, threshold, left, right,
    missing}, leaves {leaf, tree}.
    """
    def conv(node):
        if "leaf" in node:
            return {"leaf": float(node["leaf"]), "tree": tree_index}

        yes_id = node["yes"]
        no_id = node["no"]
        miss_id = node.get("missing", yes_id)
        kids = {c["nodeid"]: c for c in node.get("children", [])}

        def child(cid):
            return conv(kids[cid]) if cid in kids else None

        # "split" is the feature NAME when the booster has feature_names set,
        # otherwise a synthetic "f<index>" string — normalize that back to a
        # numeric index (the consumer resolves both forms).
        feat = node["split"]
        if isinstance(feat, str):
            m = re.fullmatch(r"f(\d+)", feat)
            feature = int(m.group(1)) if m else feat
        else:
            feature = int(feat)
        return {
            "feature": feature,
            "threshold": float(node["split_condition"]),
            "left": child(yes_id),
            "right": child(no_id),
            "missing": child(miss_id) if miss_id != yes_id else None,
        }

    return conv(raw)


def resolve_base_score_margin(model):
    """Return base_score in MARGIN (log-odds) space for the consumer.

    src/lib/xgboostPredictor.ts adds model.base_score directly to the summed
    tree margin, so the exported value must be log-odds, not a probability.
    booster.attr / sklearn params return None on modern XGBoost; the
    authoritative value lives in save_config learner_model_param.base_score,
    stored there as a PROBABILITY on XGBoost >= 2.1 (e.g. "[4.99E-1]") —
    convert via logit. Values outside (0, 1) cannot be probabilities and are
    assumed to already be margins.
    """
    try:
        cfg = json.loads(model.get_booster().save_config())
        # xgboost serializes this value bracketed, e.g. "[8.0066666E-2]"
        raw_text = cfg["learner"]["learner_model_param"]["base_score"]
        raw = float(str(raw_text).strip("[] \t"))
    except Exception:
        try:
            raw = float(model.base_score)
        except (TypeError, ValueError):
            return 0.0
    if not math.isfinite(raw):
        return 0.0
    if 0.0 < raw < 1.0:
        return math.log(raw / (1.0 - raw))
    return raw


def export_model(model: xgb.XGBClassifier, feature_names: list, output_path: Path):
    booster = model.get_booster()
    dumps = booster.get_dump(dump_format="json")

    trees = []
    for i, tree_str in enumerate(dumps):
        tree = extract_tree(json.loads(tree_str), i)
        if tree:
            trees.append(tree)

    base_score = resolve_base_score_margin(model)

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

    DATA_DIR = ROOT / "dataset_output"
    df = pd.read_csv(DATA_DIR / "ml_features_100k.csv")

    X = df.drop(columns=["account_id", "is_mule"])
    y = df["is_mule"]
    feature_names = list(X.columns)

    neg_count = (y == 0).sum()
    pos_count = (y == 1).sum()
    scale_weight = neg_count / pos_count if pos_count else 1.0

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

    output = ROOT / "public" / "model_weights.json"
    export_model(model, feature_names, output)
