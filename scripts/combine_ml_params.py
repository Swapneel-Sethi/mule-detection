"""
Task 3: Combine and export ml_params.json
------------------------------------------
Merges learned weights, thresholds, Platt scaling, and ML normalization.
"""

import json
import numpy as np
from scipy.optimize import minimize

# ─── Load data ───────────────────────────────────────────────────────────────

with open("public/accounts_dataset.json", "r") as f:
    accounts = json.load(f)

scores = np.array([a["calibrated_score"] for a in accounts])
labels = np.array([1 if a["is_mule"] else 0 for a in accounts])
ml_raw = np.array([a.get("ml_score", 0) for a in accounts])

# ─── Load learned results ───────────────────────────────────────────────────

with open("scripts/_learned_weights.json", "r") as f:
    weights_data = json.load(f)

with open("scripts/_learned_thresholds.json", "r") as f:
    thresholds_data = json.load(f)

# ─── Fit Platt scaling from data ────────────────────────────────────────────

# Current Platt: sigmoid(A*x + B) with A=-4.0, B=2.0
# We'll fit optimal A, B using the calibrated_score as the "raw" input
# to map to true labels.

def platt_sigmoid(x, A, B):
    return 1 / (1 + np.exp(A * x + B))

def platt_nll(params, x, y):
    A, B = params
    p = platt_sigmoid(x, A, B)
    p = np.clip(p, 1e-7, 1 - 1e-7)
    return -np.mean(y * np.log(p) + (1 - y) * np.log(1 - p))

# Fit Platt on the ensemble scores (calibrated_score is post-Platt,
# but we refit to find optimal A, B)
# Use raw risk_score normalized as the "raw ensemble score"
def norm(arr):
    mn, mx = arr.min(), arr.max()
    return (arr - mn) / (mx - mn) if mx > mn else np.zeros_like(arr)

raw_ensemble = norm(np.array([a.get("risk_score", 0) for a in accounts]))

result = minimize(platt_nll, x0=[-4.0, 2.0], args=(raw_ensemble, labels),
                  method="Nelder-Mead", options={"maxiter": 1000})
platt_A, platt_B = result.x

print(f"Platt scaling: A={platt_A:.4f}, B={platt_B:.4f}")
print(f"  old: A=-4.0, B=2.0")

# Verify calibration
calibrated = platt_sigmoid(raw_ensemble, platt_A, platt_B)
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

output_path = "public/ml_params.json"
with open(output_path, "w") as f:
    json.dump(ml_params, f, indent=2)

print(f"\n{'='*60}")
print(f"Wrote {output_path}:")
print(json.dumps(ml_params, indent=2))

# ─── Summary ────────────────────────────────────────────────────────────────

print(f"\n{'='*60}")
print("REPORT:")

print(f"\n1. ENSEMBLE WEIGHTS:")
print(f"   Old: {weights_data['old_weights']}")
print(f"   New: {weights_data['ensemble_weights']}")
print(f"   Note: ML score perfectly separates classes (AUC=1.0 alone)")
print(f"   ML capped at 0.40, remaining split: 66% behavioral, 34% community")

print(f"\n2. THRESHOLDS:")
print(f"   Old: {thresholds_data['old_thresholds']}")
print(f"   New: {thresholds_data['thresholds']}")
print(f"   Key change: critical 0.70 -> 0.671 (captures top 25% of mules)")
print(f"   high 0.50 -> 0.640 (captures top 50% of mules)")

print(f"\n3. PLATT SCALING:")
print(f"   Old: A=-4.0, B=2.0")
print(f"   New: A={platt_A:.4f}, B={platt_B:.4f}")

print(f"\n4. ML NORMALIZATION:")
print(f"   Old: [0.25, 0.50]")
print(f"   New: [{ml_min:.4f}, {ml_max:.4f}]")

print(f"\n5. CROSS-VALIDATION:")
print(f"   Old weights CV AUC: {weights_data['old_cv_auc']}")
print(f"   New weights CV AUC: {weights_data['cv_auc']}")
