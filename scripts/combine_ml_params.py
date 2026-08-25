"""
Task 3: Combine and export ml_params.json
------------------------------------------
Merges learned weights, thresholds, Platt scaling, and ML normalization.
"""

import json
from pathlib import Path

import numpy as np
from scipy.optimize import minimize

ROOT = Path(__file__).resolve().parent.parent
ACC_PATH = ROOT / "public" / "accounts_dataset.json"
WEIGHTS_PATH = ROOT / "scripts" / "_learned_weights.json"
THRESHOLDS_PATH = ROOT / "scripts" / "_learned_thresholds.json"
OUTPUT_PATH = ROOT / "public" / "ml_params.json"

FNAMES = ["BEHAVIORAL", "GRAPH", "TEMPORAL", "COMMUNITY", "ML_MODEL", "INTERACTION"]

# ─── Load data ───────────────────────────────────────────────────────────────

with open(ACC_PATH, "r") as f:
    accounts = json.load(f)

labels = np.array([1 if a["is_mule"] else 0 for a in accounts])
ml_raw = np.array([a.get("ml_score", 0) for a in accounts])

# ─── Load learned results ───────────────────────────────────────────────────

with open(WEIGHTS_PATH, "r") as f:
    weights_data = json.load(f)

with open(THRESHOLDS_PATH, "r") as f:
    thresholds_data = json.load(f)

# ─── Fit Platt scaling from data ────────────────────────────────────────────

# Consumers apply sigmoid(A*x + B) to the WEIGHTED ENSEMBLE score
# (see src/lib/detectionEngine.ts -> mlModel.calibrateScore), so A, B must be
# fitted against that same quantity: sum(w_i * normalized_component_i) rebuilt
# here with the exact normalization used by train_meta_learner.py.

def platt_sigmoid(x, A, B):
    return 1 / (1 + np.exp(A * x + B))

def platt_nll(params, x, y):
    A, B = params
    p = platt_sigmoid(x, A, B)
    p = np.clip(p, 1e-7, 1 - 1e-7)
    return -np.mean(y * np.log(p) + (1 - y) * np.log(1 - p))

def norm(arr):
    mn, mx = arr.min(), arr.max()
    return (arr - mn) / (mx - mn) if mx > mn else np.zeros_like(arr)

components = {
    "BEHAVIORAL": norm(np.array([a.get("behavioral_score", 0) for a in accounts])),
    "GRAPH": norm(np.array([a.get("graph_score", 0) for a in accounts])),
    "TEMPORAL": norm(np.array([a.get("txn_velocity_per_day", 0) for a in accounts])),
    "COMMUNITY": norm(np.array([a.get("risk_score", 0) for a in accounts])),
    "ML_MODEL": norm(ml_raw),
}
components["INTERACTION"] = components["BEHAVIORAL"] * components["GRAPH"]

weights = weights_data["ensemble_weights"]
missing = [k for k in FNAMES if k not in weights]
if missing:
    raise SystemExit(f"ensemble_weights missing components: {missing}")
ensemble_score = sum(weights[k] * components[k] for k in FNAMES)

result = minimize(platt_nll, x0=[-4.0, 2.0], args=(ensemble_score, labels),
                  method="Nelder-Mead", options={"maxiter": 1000})
platt_A, platt_B = result.x
if not (np.isfinite(platt_A) and np.isfinite(platt_B)):
    print("WARNING: Platt fit diverged; falling back to legacy A=-4.0, B=2.0")
    platt_A, platt_B = -4.0, 2.0

print(f"Platt scaling: A={platt_A:.4f}, B={platt_B:.4f}")
print("  old: A=-4.0, B=2.0")

# Verify calibration
print(f"  P(mule|score=0.0): {platt_sigmoid(0, platt_A, platt_B):.4f}")
print(f"  P(mule|score=0.5): {platt_sigmoid(0.5, platt_A, platt_B):.4f}")
print(f"  P(mule|score=1.0): {platt_sigmoid(1, platt_A, platt_B):.4f}")

# ─── ML score normalization ────────────────────────────────────────────────

ml_min = float(ml_raw.min())
ml_max = float(ml_raw.max())
print(f"\nML score range: [{ml_min:.4f}, {ml_max:.4f}]")
print(f"  old normalization: [0.25, 0.50]")

# ─── Build final export ─────────────────────────────────────────────────────

ml_params = {
    "ensemble_weights": weights_data["ensemble_weights"],
    "thresholds": thresholds_data["thresholds"],
    "platt_scaling": {
        "A": round(float(platt_A), 4),
        "B": round(float(platt_B), 4),
    },
    "ml_score_normalization": {
        "min": round(ml_min, 4),
        "max": round(ml_max, 4),
    },
    "_meta": {
        "method": weights_data["method"],
        "ensemble_auc": weights_data["auc"],
        "ensemble_cv_auc": weights_data["cv_auc"],
        "old_ensemble_auc": weights_data["old_auc"],
        "old_weights": weights_data["old_weights"],
        "old_thresholds": thresholds_data["old_thresholds"],
        "youden_j_threshold": thresholds_data["youden_j_threshold"],
        "ml_score_separable": weights_data["ml_score_separable"],
    }
}

# ─── Write to public/ml_params.json ─────────────────────────────────────────

with open(OUTPUT_PATH, "w") as f:
    json.dump(ml_params, f, indent=2)

print(f"\n{'='*60}")
print(f"Wrote {OUTPUT_PATH}:")
print(json.dumps(ml_params, indent=2))

# ─── Summary ────────────────────────────────────────────────────────────────

non_ml = weights_data["non_ml_proportions"]
top_non_ml = sorted(non_ml.items(), key=lambda kv: -kv[1])

th_new = thresholds_data["thresholds"]
th_old = thresholds_data["old_thresholds"]

print(f"\n{'='*60}")
print("REPORT:")

print(f"\n1. ENSEMBLE WEIGHTS:")
print(f"   Old: {weights_data['old_weights']}")
print(f"   New: {weights_data['ensemble_weights']}")
separable = weights_data.get("ml_score_separable")
if separable:
    print("   Note: ML score perfectly separates classes on this snapshot")
else:
    print(f"   Note: ML score classes overlap on this snapshot "
          f"(see ml_score_separable={separable})")
print(f"   ML capped at {weights_data.get('ml_cap', 'n/a')}; non-ML split: "
      + ", ".join(f"{k} {v*100:.0f}%" for k, v in top_non_ml))

print(f"\n2. THRESHOLDS:")
for k in ("critical", "high", "medium", "flagged"):
    if k in th_old and k in th_new:
        print(f"   {k}: {th_old[k]} -> {th_new[k]}")

print(f"\n3. PLATT SCALING:")
print(f"   Old: A=-4.0, B=2.0")
print(f"   New: A={platt_A:.4f}, B={platt_B:.4f}")

print(f"\n4. ML NORMALIZATION:")
print(f"   Old: [0.25, 0.50]")
print(f"   New: [{ml_min:.4f}, {ml_max:.4f}]")

print(f"\n5. CROSS-VALIDATION:")
print(f"   Old weights CV AUC: {weights_data['old_cv_auc']}")
print(f"   New weights CV AUC: {weights_data['cv_auc']}")
