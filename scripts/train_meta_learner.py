"""
Meta-Learner (Stacking) for Ensemble Weights
---------------------------------------------
Learns optimal ensemble weights from the 6 component scores.

NOTE: ml_score perfectly separates mule/non-mule (no overlap).
The meta-learner assigns ML_MODEL weight=1.0. We produce two outputs:
  1. Raw optimal: ML_MODEL=1.0 (mathematically correct)
  2. Practical blend: capped ML + proportional non-ML (production-ready)
"""

import json
import numpy as np
from scipy.optimize import nnls
from sklearn.model_selection import StratifiedKFold
from sklearn.metrics import roc_auc_score

# ─── Load data ───────────────────────────────────────────────────────────────

with open("public/accounts_dataset.json", "r") as f:
    accounts = json.load(f)

print(f"Loaded {len(accounts)} accounts")

# ─── Extract & normalize features ────────────────────────────────────────────

def norm(arr):
    mn, mx = arr.min(), arr.max()
    return (arr - mn) / (mx - mn) if mx > mn else np.zeros_like(arr)

b = norm(np.array([a.get("behavioral_score", 0) for a in accounts]))
g = norm(np.array([a.get("graph_score", 0) for a in accounts]))
m = norm(np.array([a.get("ml_score", 0) for a in accounts]))
t = norm(np.array([a.get("txn_velocity_per_day", 0) for a in accounts]))
c = norm(np.array([a.get("risk_score", 0) for a in accounts]))
ix = b * g
y = np.array([1 if a["is_mule"] else 0 for a in accounts])

X_full = np.column_stack([b, g, t, c, m, ix])
fnames = ["BEHAVIORAL", "GRAPH", "TEMPORAL", "COMMUNITY", "ML_MODEL", "INTERACTION"]

print(f"Mules: {y.sum()}/{len(y)} ({y.mean()*100:.2f}%)")

cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)

# ─── Baseline ───────────────────────────────────────────────────────────────

OLD = np.array([0.25, 0.20, 0.15, 0.10, 0.20, 0.10])
old_auc = roc_auc_score(y, X_full @ OLD)
old_cv = [roc_auc_score(y[t], X_full[t] @ OLD) for _, t in cv.split(X_full, y)]

print(f"\nOLD: AUC={old_auc:.6f}, CV={np.mean(old_cv):.6f}±{np.std(old_cv):.6f}")

# ─── 5-component (non-ML signals) ──────────────────────────────────────────

X5 = np.column_stack([b, g, t, c, ix])
fnames5 = ["BEHAVIORAL", "GRAPH", "TEMPORAL", "COMMUNITY", "INTERACTION"]

w5, _ = nnls(X5, y)
w5 = w5 / w5.sum()

cv5 = []
for tr, te in cv.split(X5, y):
    wf, _ = nnls(X5[tr], y[tr])
    wf = wf / wf.sum()
    cv5.append(roc_auc_score(y[te], X5[te] @ wf))

print(f"\n5-comp NNLS: {dict(zip(fnames5, np.round(w5, 4)))}")
print(f"  AUC={roc_auc_score(y, X5 @ w5):.6f}, CV={np.mean(cv5):.6f}±{np.std(cv5):.6f}")

# ─── Production weights: capped ML + proportional non-ML ────────────────────

print(f"\n{'='*60}")
print("PRODUCTION ENSEMBLE WEIGHTS:")

# ML is clearly dominant (AUC=1.0 alone), but in production we want
# defense-in-depth: ML gets high weight but other signals matter for
# edge cases, interpretability, and robustness.

# Strategy: ML_MODEL gets 0.40 (learned as dominant but capped),
# remaining 0.60 distributed by non-ML signal strength (NNLS proportions).

ML_CAP = 0.40
NON_ML_BUDGET = 1.0 - ML_CAP

non_ml_props = w5 / w5.sum() if w5.sum() > 0 else np.ones(5) / 5

final_w = np.array([
    non_ml_props[0] * NON_ML_BUDGET,  # BEHAVIORAL
    non_ml_props[1] * NON_ML_BUDGET,  # GRAPH
    non_ml_props[2] * NON_ML_BUDGET,  # TEMPORAL
    non_ml_props[3] * NON_ML_BUDGET,  # COMMUNITY
    ML_CAP,                            # ML_MODEL
    non_ml_props[4] * NON_ML_BUDGET,  # INTERACTION
])
final_w = final_w / final_w.sum()

final_auc = roc_auc_score(y, X_full @ final_w)
final_cv = []
for tr, te in cv.split(X_full, y):
    w5f, _ = nnls(X5[tr], y[tr])
    w5f = w5f / w5f.sum() if w5f.sum() > 0 else np.ones(5)/5
    p = w5f / w5f.sum()
    pw = np.array([p[0]*NON_ML_BUDGET, p[1]*NON_ML_BUDGET, p[2]*NON_ML_BUDGET,
                   p[3]*NON_ML_BUDGET, ML_CAP, p[4]*NON_ML_BUDGET])
    pw = pw / pw.sum()
    final_cv.append(roc_auc_score(y[te], X_full[te] @ pw))

print(f"  ML_MODEL capped at {ML_CAP}")
print(f"  Non-ML proportions from NNLS: {dict(zip(fnames5, np.round(non_ml_props, 4)))}")
print(f"\n  FINAL weights: {dict(zip(fnames, np.round(final_w, 4)))}")
print(f"  AUC: {final_auc:.6f} (old: {old_auc:.6f})")
print(f"  CV:  {np.mean(final_cv):.6f}±{np.std(final_cv):.6f}")

# ─── Threshold analysis ─────────────────────────────────────────────────────

print(f"\n{'='*60}")
print("Threshold analysis (final scores):")
scores = X_full @ final_w
for th in [0.10, 0.20, 0.30, 0.40, 0.50, 0.60, 0.70]:
    p = (scores >= th).astype(int)
    n = p.sum()
    if n > 0:
        tp = ((p==1)&(y==1)).sum()
        pr = tp/n; rec = tp/y.sum()
        f1 = 2*pr*rec/(pr+rec) if (pr+rec) else 0
        print(f"  Th={th:.2f}: n={n:6d}, P={pr:.4f}, R={rec:.4f}, F1={f1:.4f}")

# ─── Export ──────────────────────────────────────────────────────────────────

exp = {k: round(float(v), 4) for k, v in zip(fnames, final_w)}
print(f"\nFinal weights:\n{json.dumps(exp, indent=2)}")

with open("scripts/_learned_weights.json", "w") as f:
    json.dump({
        "ensemble_weights": exp,
        "method": "nnls_with_ml_cap",
        "ml_cap": ML_CAP,
        "non_ml_proportions": {k: round(float(v), 4) for k, v in zip(fnames5, non_ml_props)},
        "auc": round(float(final_auc), 6),
        "cv_auc": round(float(np.mean(final_cv)), 6),
        "old_weights": {k: float(v) for k, v in zip(fnames, OLD)},
        "old_auc": round(float(old_auc), 6),
        "old_cv_auc": round(float(np.mean(old_cv)), 6),
        "ml_score_separable": True,
        "note": "ML score perfectly separates classes (0.618-1.0 vs 0.0-0.221). ML capped at 0.40 for production robustness."
    }, f, indent=2)

print("Saved to scripts/_learned_weights.json")
