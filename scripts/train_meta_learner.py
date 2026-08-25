"""
Meta-Learner (Stacking) for Ensemble Weights
---------------------------------------------
Learns optimal ensemble weights from the 6 component scores.

NOTE: earlier dataset snapshots had ml_score perfectly separating mule/non-mule
(meta-learner collapsing to ML_MODEL weight=1.0). Separability is now COMPUTED
from the loaded data and recorded as ml_score_separable — do not assume it.
We produce two outputs:
  1. Raw optimal: uncapped NNLS proportions (mathematically optimal in-sample)
  2. Practical blend: capped ML + proportional non-ML (production-ready)
"""

import json
from pathlib import Path

import numpy as np
from scipy.optimize import nnls
from sklearn.model_selection import StratifiedKFold
from sklearn.metrics import roc_auc_score

ROOT = Path(__file__).resolve().parent.parent
ACC_PATH = ROOT / "public" / "accounts_dataset.json"
OUT_PATH = ROOT / "scripts" / "_learned_weights.json"

# ─── Load data ───────────────────────────────────────────────────────────────

with open(ACC_PATH, "r") as f:
    accounts = json.load(f)

print(f"Loaded {len(accounts)} accounts")

# ─── Extract & normalize features ────────────────────────────────────────────

def norm(arr):
    mn, mx = arr.min(), arr.max()
    return (arr - mn) / (mx - mn) if mx > mn else np.zeros_like(arr)

RAW = {
    "BEHAVIORAL": np.array([a.get("behavioral_score", 0) for a in accounts]),
    "GRAPH": np.array([a.get("graph_score", 0) for a in accounts]),
    "TEMPORAL": np.array([a.get("txn_velocity_per_day", 0) for a in accounts]),
    "COMMUNITY": np.array([a.get("risk_score", 0) for a in accounts]),
    "ML_MODEL": np.array([a.get("ml_score", 0) for a in accounts]),
}
y = np.array([1 if a["is_mule"] else 0 for a in accounts])

fnames = ["BEHAVIORAL", "GRAPH", "TEMPORAL", "COMMUNITY", "ML_MODEL", "INTERACTION"]
fnames5 = ["BEHAVIORAL", "GRAPH", "TEMPORAL", "COMMUNITY", "INTERACTION"]


def build_X(idx):
    """Stack [b, g, t, c, m, b*g], min-max normalized over rows in idx ONLY.

    Normalizing per fold keeps held-out min/max out of training; a global
    normalize-then-split leaks test-set scale into every CV estimate.
    """
    b = norm(RAW["BEHAVIORAL"][idx])
    g = norm(RAW["GRAPH"][idx])
    t = norm(RAW["TEMPORAL"][idx])
    c = norm(RAW["COMMUNITY"][idx])
    m = norm(RAW["ML_MODEL"][idx])
    return np.column_stack([b, g, t, c, m, b * g])


def x5(mat):
    """The 5 non-ML columns [b, g, t, c, b*g] of a build_X matrix.

    Mirrors the original 5-component design: ML_MODEL excluded, the
    behavioral-graph interaction included.
    """
    return mat[:, [0, 1, 2, 3, 5]]


all_idx = np.arange(len(y))
X_full = build_X(all_idx)

print(f"Mules: {y.sum()}/{len(y)} ({y.mean()*100:.2f}%)")

cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)

# ─── Baseline ───────────────────────────────────────────────────────────────

OLD = np.array([0.25, 0.20, 0.15, 0.10, 0.20, 0.10])
old_auc = roc_auc_score(y, X_full @ OLD)
old_cv = [roc_auc_score(y[t], build_X(t) @ OLD) for _, t in cv.split(X_full, y)]

print(f"\nOLD: AUC={old_auc:.6f}, CV={np.mean(old_cv):.6f}±{np.std(old_cv):.6f}")

# ─── 5-component (non-ML signals) ──────────────────────────────────────────

w5, _ = nnls(x5(X_full), y)
w5 = w5 / w5.sum() if w5.sum() > 0 else np.ones(5) / 5

cv5 = []
for tr, te in cv.split(X_full, y):
    wf, _ = nnls(x5(build_X(tr)), y[tr])
    wf = wf / wf.sum() if wf.sum() > 0 else np.ones(5) / 5
    cv5.append(roc_auc_score(y[te], x5(build_X(te)) @ wf))

auc5 = roc_auc_score(y, x5(X_full) @ w5)
print(f"\n5-comp NNLS: {dict(zip(fnames5, np.round(w5, 4)))}")
print(f"  AUC={auc5:.6f}, CV={np.mean(cv5):.6f}±{np.std(cv5):.6f}")

# ─── Production weights: capped ML + proportional non-ML ────────────────────

print(f"\n{'='*60}")
print("PRODUCTION ENSEMBLE WEIGHTS:")

# ML was dominant on earlier snapshots; whether it still is depends on the
# loaded data (see the computed ml_score_separable flag below). In production
# we want defense-in-depth: ML gets high weight but other signals matter for
# edge cases, interpretability, and robustness.

# Strategy: ML_MODEL gets 0.40 (capped regardless of its learned dominance),
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
    w5f, _ = nnls(x5(build_X(tr)), y[tr])
    p = w5f / w5f.sum() if w5f.sum() > 0 else np.ones(5) / 5
    pw = np.array([p[0]*NON_ML_BUDGET, p[1]*NON_ML_BUDGET, p[2]*NON_ML_BUDGET,
                   p[3]*NON_ML_BUDGET, ML_CAP, p[4]*NON_ML_BUDGET])
    pw = pw / pw.sum()
    final_cv.append(roc_auc_score(y[te], build_X(te) @ pw))

print(f"  ML_MODEL capped at {ML_CAP}")
print(f"  Non-ML proportions from NNLS: {dict(zip(fnames5, np.round(non_ml_props, 4)))}")
print(f"\n  FINAL weights: {dict(zip(fnames, np.round(final_w, 4)))}")
print(f"  AUC: {final_auc:.6f} (old: {old_auc:.6f})")
print(f"  CV:  {np.mean(final_cv):.6f}±{np.std(final_cv):.6f}")

# ─── Threshold analysis ─────────────────────────────────────────────────────

print(f"\n{'='*60}")
# In-sample only — thresholds derived here are fit on all labeled accounts.
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

# Separability is a property of the loaded snapshot — compute, don't assert.
ml_clean = RAW["ML_MODEL"][y == 0]
ml_mule = RAW["ML_MODEL"][y == 1]
separable = bool(ml_clean.max() < ml_mule.min())
if separable:
    note = (
        f"ML score perfectly separates classes "
        f"(clean [{ml_clean.min():.3f}, {ml_clean.max():.3f}] vs "
        f"mule [{ml_mule.min():.3f}, {ml_mule.max():.3f}]). "
        f"ML capped at {ML_CAP:.2f} for production robustness."
    )
else:
    note = (
        f"ML score classes OVERLAP on this snapshot "
        f"(clean max {ml_clean.max():.3f} >= mule min {ml_mule.min():.3f}; "
        f"clean [{ml_clean.min():.3f}, {ml_clean.max():.3f}] vs "
        f"mule [{ml_mule.min():.3f}, {ml_mule.max():.3f}]). "
        f"Perfect-separation assumptions do not hold; ML capped at {ML_CAP:.2f}."
    )

with open(OUT_PATH, "w") as f:
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
        "ml_score_separable": separable,
        "note": note
    }, f, indent=2)

print(f"Saved to {OUT_PATH}")
