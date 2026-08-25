"""
Auto-Calibrate Thresholds
-------------------------
Learns optimal risk-level thresholds from the calibrated_score distribution.
Uses mule score percentiles for meaningful level separation.

Usage: python scripts/auto_calibrate_thresholds.py   (paths are __file__-anchored;
runs from any CWD)
Output: scripts/_learned_thresholds.json (consumed by scripts/combine_ml_params.py).
NOTE: nothing reads these values automatically. Production bands are hardcoded
independently in src/lib/detectionEngine.ts (critical>=0.71, high>=0.66,
medium/is_mule>=0.551) and mirrored in scripts/recompute_ml_scores.py, while the
shipped public/ml_params.json holds an older set (0.671/0.64/0.551/0.551) with
stale Platt A/B — the sinks DISAGREE at HEAD. After recalibrating, propagate ONE
consistent set to every sink manually and regenerate ml_params.json via
scripts/combine_ml_params.py.
"""

import json
import os

import numpy as np
from sklearn.metrics import roc_curve

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ACCOUNTS_PATH = os.path.join(BASE, "public", "accounts_dataset.json")
OUTPUT_PATH = os.path.join(BASE, "scripts", "_learned_thresholds.json")

# ─── Load data ───────────────────────────────────────────────────────────────

with open(ACCOUNTS_PATH, "r") as f:
    accounts = json.load(f)

scores = np.array([a["calibrated_score"] for a in accounts])
labels = np.array([1 if a["is_mule"] else 0 for a in accounts])
n_mules = labels.sum()

if n_mules == 0:
    raise SystemExit("No mule accounts found in dataset; cannot calibrate thresholds.")

print(f"Loaded {len(accounts)} accounts, {n_mules} mules ({n_mules/len(labels)*100:.2f}%)")

mule_scores = scores[labels == 1]
non_mule_scores = scores[labels == 0]

print(f"\nScore distributions:")
print(f"  Mules:     [{mule_scores.min():.4f}, {mule_scores.max():.4f}], mean={mule_scores.mean():.4f}, median={np.median(mule_scores):.4f}")
print(f"  Non-mules: [{non_mule_scores.min():.4f}, {non_mule_scores.max():.4f}], mean={non_mule_scores.mean():.4f}")
print(f"  Separation gap: {mule_scores.min() - non_mule_scores.max():.4f}")

# ─── Old thresholds ─────────────────────────────────────────────────────────

OLD = {"critical": 0.70, "high": 0.50, "medium": 0.30, "flagged": 0.40}

print(f"\nOLD thresholds: {OLD}")
for level, th in OLD.items():
    preds = (scores >= th).astype(int)
    n = preds.sum()
    if n > 0:
        tp = ((preds==1)&(labels==1)).sum()
        p = tp/n; r = tp/n_mules
        f1 = 2*p*r/(p+r) if (p+r) else 0
        print(f"  {level:10s} (th={th:.2f}): n={n:6d}, P={p:.4f}, R={r:.4f}, F1={f1:.4f}")

# ─── Youden's J (binary optimal) ───────────────────────────────────────────

fpr, tpr, thresh_roc = roc_curve(labels, scores)
j = tpr - fpr
j_idx = np.argmax(j)
youden_th = thresh_roc[j_idx]
print(f"\nYouden's J: threshold={youden_th:.4f}, J={j[j_idx]:.4f}")

# ─── Calibrated score percentiles for mules ────────────────────────────────

p10 = np.percentile(mule_scores, 10)
p25 = np.percentile(mule_scores, 25)
p50 = np.percentile(mule_scores, 50)
p75 = np.percentile(mule_scores, 75)
p90 = np.percentile(mule_scores, 90)

print(f"\nMule score percentiles: p10={p10:.4f}, p25={p25:.4f}, p50={p50:.4f}, p75={p75:.4f}, p90={p90:.4f}")

# ─── Threshold strategy ────────────────────────────────────────────────────

# Percentile-based design: cut the mule score distribution so each level keeps
# a meaningful share of true mules:
#   critical: top 25% of mules  → p75 of mule scores
#   high:     top 50% of mules  → p50 of mule scores (median)
#   medium:   top 75% of mules  → p25 of mule scores
#   flagged:  bottom 10% still caught → p10 of mule scores
#
# Safe thresholds must sit inside the separation gap between the non-mule
# score max and the mule score min printed above; verify the gap before
# trusting the output on a recalibrated dataset.

new_thresholds = {
    "critical": round(float(p75), 4),   # Top 25% of mules
    "high": round(float(p50), 4),       # Median mule (top 50%)
    "medium": round(float(p25), 4),     # Bottom 25% of mules still caught
    "flagged": round(float(p10), 4),    # Bottom 10% of mules still caught
}

print(f"\nNEW thresholds (percentile-based):")
for level, th in new_thresholds.items():
    preds = (scores >= th).astype(int)
    n = preds.sum()
    if n > 0:
        tp = ((preds==1)&(labels==1)).sum()
        p = tp/n; r = tp/n_mules
        f1 = 2*p*r/(p+r) if (p+r) else 0
        print(f"  {level:10s} (th={th:.4f}): n={n:6d}, P={p:.4f}, R={r:.4f}, F1={f1:.4f}")

# ─── Comparison ────────────────────────────────────────────────────────────

print(f"\n{'='*60}")
print(f"{'Level':10s} {'Old':>8s} {'New':>8s} {'Delta':>8s}")
print("-" * 40)
for level in ["critical", "high", "medium", "flagged"]:
    o = OLD[level]
    n = new_thresholds[level]
    print(f"{level:10s} {o:8.4f} {n:8.4f} {n-o:+8.4f}")

# ─── Sanity checks ───────────────────────────────────────────────────────────

# The percentile design degenerates when mule scores bunch together (e.g.
# p10≈p25≈p50≈p75 collapses every band into ~one value). Fail loudly instead
# of exporting collapsed bands downstream.
EPS = 0.01  # minimum meaningful gap between adjacent bands
clean_max = float(non_mule_scores.max())

problems = []
for lower, upper in [("flagged", "medium"), ("medium", "high"), ("high", "critical")]:
    gap = new_thresholds[upper] - new_thresholds[lower]
    if gap < EPS:
        problems.append(
            f"{upper} ({new_thresholds[upper]:.4f}) - {lower} ({new_thresholds[lower]:.4f})"
            f" gap {gap:.4f} < EPS={EPS}"
        )
if new_thresholds["flagged"] <= clean_max:
    problems.append(
        f"flagged ({new_thresholds['flagged']:.4f}) <= non-mule max ({clean_max:.4f});"
        f" clean accounts would flood the flagged band"
    )

if problems:
    print("\nERROR: degenerate threshold calibration — refusing to export:")
    for p in problems:
        print(f"  - {p}")
    raise SystemExit(1)

print(f"\nSanity checks passed: inter-band gaps >= {EPS}; flagged > clean max {clean_max:.4f}")

# ─── Export ──────────────────────────────────────────────────────────────────

print(f"\nFinal thresholds:\n{json.dumps(new_thresholds, indent=2)}")

with open(OUTPUT_PATH, "w") as f:
    json.dump({
        "thresholds": new_thresholds,
        "old_thresholds": OLD,
        "youden_j_threshold": round(float(youden_th), 4),
        "mule_percentiles": {
            "p10": round(float(p10), 4),
            "p25": round(float(p25), 4),
            "p50": round(float(p50), 4),
            "p75": round(float(p75), 4),
            "p90": round(float(p90), 4),
        },
        "note": "Thresholds derived from mule calibrated_score percentiles of the "
                "current dataset; values are data-dependent — re-check the "
                "non-mule/mule separation gap before reusing."
    }, f, indent=2)

print(f"Saved to {OUTPUT_PATH}")
