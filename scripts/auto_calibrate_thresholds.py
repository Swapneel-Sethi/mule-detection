"""
Auto-Calibrate Thresholds
-------------------------
Learns optimal risk-level thresholds from the score distribution.
Uses mule score percentiles for meaningful level separation.
"""

import json
import numpy as np
from sklearn.metrics import roc_curve, precision_recall_curve

# ─── Load data ───────────────────────────────────────────────────────────────

with open("public/accounts_dataset.json", "r") as f:
    accounts = json.load(f)

scores = np.array([a["calibrated_score"] for a in accounts])
labels = np.array([1 if a["is_mule"] else 0 for a in accounts])
n_mules = labels.sum()

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

# The calibrated_score perfectly separates classes:
#   non-mules: 0.141 (all same value)
#   mules: 0.551 - 0.708
#
# Threshold design:
#   critical: captures severe mules (top 25%) → p75 of mule scores
#   high: captures most mules (top 50%) → p50 of mule scores (median)
#   medium: captures majority of mules (top 75%) → p25 of mule scores
#   flagged: catches any mule (decision boundary) → min of mule scores

# Gap analysis: non-mule max = 0.141, mule min = 0.551
# Safe thresholds are in [0.141, 0.551] range

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

# ─── Export ──────────────────────────────────────────────────────────────────

print(f"\nFinal thresholds:\n{json.dumps(new_thresholds, indent=2)}")

with open("scripts/_learned_thresholds.json", "w") as f:
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
        "note": "Thresholds based on mule score percentiles. Non-mule scores cluster at 0.141, mule scores at 0.551-0.708."
    }, f, indent=2)

print("Saved to scripts/_learned_thresholds.json")
