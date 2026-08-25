# Threshold + Calibration Audit — Mule Guard Account Scores

**Generated:** 2026-08-25T17:22:17  
**Data:** `predictions.json` + `truth.json` · **400 accounts** (100 mules / 300 legit, prevalence 25.00%)  
**Models loaded during scoring:** True (account trees=200, txn trees=200)  
**Score audited:** `risk_score` (0–100 display value = 100 × Platt-calibrated score, the variable every
app threshold acts on). Raw model `ml_score` reported alongside for comparison.

> Source lines (detectionEngine.ts): verdict `calibratedScore >= 0.551` (L1520); bands medium/high/critical
> at 0.551/0.640/0.671 (L1524–1527); `critical_risk` red-flag flag at `>= 0.70` (L1544). transactionScorer.ts
> FLAG_THRESHOLD = 55.1 (L24). No app files were modified.

## 1. Score distribution analysis

### 1a. Per-class summary (`risk_score`, 0–100)

| Statistic | True mules (n=100) | Legit (n=300) |
|---|---:|---:|
| min | 2.8 | 0.9 |
| p5 | 2.8 | 2.5 |
| p25 | 26.5 | 4.1 |
| median | 70.9 | 46.0 |
| p75 | 70.9 | 70.9 |
| p95 | 92.2 | 72.3 |
| max | 98.5 | 97.1 |
| mean | 53.8 | 39.4 |
| std | 31.7 | 32.4 |

### 1b. Histogram (bin width 5)

| Bin | Mules | Legit | Total | Mule share |
|---|---:|---:|---:|---:|
| [0, 5) | 22 | 126 | 148 | 14.86% |
| [5, 10) | 0 | 0 | 0 | — |
| [10, 15) | 0 | 1 | 1 | 0.00% |
| [15, 20) | 0 | 2 | 2 | 0.00% |
| [20, 25) | 3 | 0 | 3 | 100.00% |
| [25, 30) | 3 | 2 | 5 | 60.00% |
| [30, 35) | 2 | 0 | 2 | 100.00% |
| [35, 40) | 1 | 4 | 5 | 20.00% |
| [40, 45) | 1 | 11 | 12 | 8.33% |
| [45, 50) | 5 | 10 | 15 | 33.33% |
| [50, 55) | 2 | 6 | 8 | 25.00% |
| [55, 60) | 5 | 6 | 11 | 45.45% |
| [60, 65) | 3 | 4 | 7 | 42.86% |
| [65, 70) | 2 | 0 | 2 | 100.00% |
| [70, 75) | 28 | 115 | 143 | 19.58% |
| [75, 80) | 2 | 3 | 5 | 40.00% |
| [80, 85) | 2 | 2 | 4 | 50.00% |
| [85, 90) | 8 | 7 | 15 | 53.33% |
| [90, 95) | 10 | 0 | 10 | 100.00% |
| [95, 100] | 1 | 1 | 2 | 50.00% |

### 1c. Decile buckets (width 10)

| Decile | Mules | Legit | Total | Actual mule fraction | Mean predicted prob (score/100) |
|---|---:|---:|---:|---:|---:|
| [0, 10) | 22 | 126 | 148 | 0.149 | 0.033 |
| [10, 20) | 0 | 3 | 3 | 0.000 | 0.167 |
| [20, 30) | 6 | 2 | 8 | 0.750 | 0.265 |
| [30, 40) | 3 | 4 | 7 | 0.429 | 0.358 |
| [40, 50) | 6 | 21 | 27 | 0.222 | 0.454 |
| [50, 60) | 7 | 12 | 19 | 0.368 | 0.558 |
| [60, 70) | 5 | 4 | 9 | 0.556 | 0.633 |
| [70, 80) | 30 | 118 | 148 | 0.203 | 0.712 |
| [80, 90) | 10 | 9 | 19 | 0.526 | 0.873 |
| [90, 100] | 11 | 1 | 12 | 0.917 | 0.934 |

### 1d. Separation & overlap

- Legit score range: [0.9, 97.1] · Mule score range: [2.8, 98.5]
- Clean gap (legit.max → mule.min): **NONE — distributions overlap**
- Overlap-zone size (accounts with risk_score in [0.9, 97.1] where both classes occur): see histogram; 99 mule(s) sit at-or-below the highest legit (97.1); 278 legit sit at-or-above the lowest mule (2.8).
- Pairwise inversions (legit scored ≥ a mule): **13065 / 30000** pairs (43.5%) — the direct measure of ranking overlap.
- Of these, **4037 pairs are exact ties** (same score, different truth). Strict AUC (ties = losses) ≈ 0.5645 vs tie-adjacent AUC 0.6318 — a large share of the apparent discrimination is tie-breaking credit.
- **Saturation:** 256 of 400 accounts sit on score plateaus shared by ≥20 accounts (largest: exactly **70.9**, shared by 138). The Platt sigmoid is clipping most of the population into a few discrete values.

## 2. Decision-threshold sweep (risk_score ≥ t)

| t | Flagged | TP | FP | FN | TN | Precision | Recall | F1 | MCC | Accuracy | FPR |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 0 | 400 | 100 | 300 | 0 | 0 | 0.2500 | 1.0000 | 0.4000 | n/a | 0.2500 | 1.0000 |
| 5 | 252 | 78 | 174 | 22 | 126 | 0.3095 | 0.7800 | 0.4432 | 0.1794 | 0.5100 | 0.5800 |
| 10 | 252 | 78 | 174 | 22 | 126 | 0.3095 | 0.7800 | 0.4432 | 0.1794 | 0.5100 | 0.5800 |
| 15 | 251 | 78 | 173 | 22 | 127 | 0.3108 | 0.7800 | 0.4444 | 0.1821 | 0.5125 | 0.5767 |
| 20 | 249 | 78 | 171 | 22 | 129 | 0.3133 | 0.7800 | 0.4470 | 0.1876 | 0.5175 | 0.5700 |
| 25 | 246 | 75 | 171 | 25 | 129 | 0.3049 | 0.7500 | 0.4335 | 0.1602 | 0.5100 | 0.5700 |
| 30 | 241 | 72 | 169 | 28 | 131 | 0.2988 | 0.7200 | 0.4223 | 0.1386 | 0.5075 | 0.5633 |
| 35 | 239 | 70 | 169 | 30 | 131 | 0.2929 | 0.7000 | 0.4130 | 0.1207 | 0.5025 | 0.5633 |
| 40 | 234 | 69 | 165 | 31 | 135 | 0.2949 | 0.6900 | 0.4132 | 0.1230 | 0.5100 | 0.5500 |
| 45 | 222 | 68 | 154 | 32 | 146 | 0.3063 | 0.6800 | 0.4224 | 0.1452 | 0.5350 | 0.5133 |
| 50 | 207 | 63 | 144 | 37 | 156 | 0.3043 | 0.6300 | 0.4104 | 0.1300 | 0.5475 | 0.4800 |
| 55 | 199 | 61 | 138 | 39 | 162 | 0.3065 | 0.6100 | 0.4080 | 0.1299 | 0.5575 | 0.4600 |
| 60 | 188 | 56 | 132 | 44 | 168 | 0.2979 | 0.5600 | 0.3889 | 0.1041 | 0.5600 | 0.4400 |
| 65 | 181 | 53 | 128 | 47 | 172 | 0.2928 | 0.5300 | 0.3772 | 0.0899 | 0.5625 | 0.4267 |
| 70 | 179 | 51 | 128 | 49 | 172 | 0.2849 | 0.5100 | 0.3656 | 0.0726 | 0.5575 | 0.4267 |
| 75 | 36 | 23 | 13 | 77 | 287 | 0.6389 | 0.2300 | 0.3382 | 0.2824 | 0.7750 | 0.0433 |
| 80 | 31 | 21 | 10 | 79 | 290 | 0.6774 | 0.2100 | 0.3206 | 0.2861 | 0.7775 | 0.0333 |
| 85 | 27 | 19 | 8 | 81 | 292 | 0.7037 | 0.1900 | 0.2992 | 0.2819 | 0.7775 | 0.0267 |
| 90 | 12 | 11 | 1 | 89 | 299 | 0.9167 | 0.1100 | 0.1964 | 0.2708 | 0.7750 | 0.0033 |
| 95 | 2 | 1 | 1 | 99 | 299 | 0.5000 | 0.0100 | 0.0196 | 0.0409 | 0.7500 | 0.0033 |
| 100 | 0 | 0 | 0 | 100 | 300 | n/a | 0.0000 | n/a | n/a | 0.7500 | 0.0000 |

### 2a. Optimal operating point vs current config

- Best F1 on the step‑5 grid: **t = 20** → P 0.3133 / R 0.7800 / F1 **0.4470** (flags 249 of 400).
- Best MCC on the same grid (tie‑aware alternative objective): **t = 80** → P 0.6774 / R 0.2100 / F1 0.3206 / **MCC 0.2861** (flags 31).
- Best F1 at any score boundary (fine scan): **t = 19.5** → P 0.3133 / R 0.7800 / F1 **0.4470**.

> ⚠️ **Score saturation warning:** the calibrated score saturates into huge tie plateaus — the single most common exact score is shared by a large block of accounts, so thresholds that land inside a plateau move hundreds of accounts at once and AUC is inflated by tie-breaking credit. See §6.
| Config | Threshold (0–100) | Flagged | Precision | Recall | F1 | ΔF1 vs best-grid |
|---|---:|---:|---:|---:|---:|---:|
| **App verdict `is_mule` (current)** | ≥ 55.1 | 199 | 0.3065 | 0.6100 | 0.4080 | -0.0390 |
| High band boundary (current) | ≥ 64.0 | 181 | 0.2928 | 0.5300 | 0.3772 | -0.0698 |
| Critical band boundary (current) | ≥ 67.1 | 181 | 0.2928 | 0.5300 | 0.3772 | -0.0698 |
| **Red line** (`critical_risk`) (current) | ≥ 70.0 | 179 | 0.2849 | 0.5100 | 0.3656 | -0.0814 |
| **Optimal (step‑5 grid)** | ≥ 20 | 249 | 0.3133 | 0.7800 | **0.4470** | 0.0000 |
| Optimal (any boundary) | ≥ 19.5 | 249 | 0.3133 | 0.7800 | **0.4470** | 0.0000 |

## 3. Calibration check — is a '70' really ~70% a mule?

| Score decile | n | Mean predicted prob | Actual mule fraction | Gap (pred − actual) |
|---|---:|---:|---:|---:|
| [0, 10) | 148 | 0.033 | 0.149 | -0.115 |
| [10, 20) | 3 | 0.167 | 0.000 | 0.167 |
| [20, 30) | 8 | 0.265 | 0.750 | -0.485 |
| [30, 40) | 7 | 0.358 | 0.429 | -0.071 |
| [40, 50) | 27 | 0.454 | 0.222 | 0.232 |
| [50, 60) | 19 | 0.558 | 0.368 | 0.189 |
| [60, 70) | 9 | 0.633 | 0.556 | 0.077 |
| [70, 80) | 148 | 0.712 | 0.203 | 0.509 |
| [80, 90) | 19 | 0.873 | 0.526 | 0.347 |
| [90, 100] | 12 | 0.934 | 0.917 | 0.017 |

- **Expected Calibration Error (ECE, 10 equal-width bins): 0.2867** · Brier score: **0.2733** (baseline always-0.25 predictor: 0.1875).
- Around **a '70'**: 142 account(s) within ±2.5 pts of 70.0 → empirical mule fraction **0.204** vs nominal 0.70.
- Around **the 55.1 verdict cut**: 9 account(s) within ±2.5 pts of 55.1 → empirical mule fraction **0.556** vs nominal 0.55.
- Around **the 67.1 critical cut**: 2 account(s) within ±2.5 pts of 67.1 → empirical mule fraction **1.000** vs nominal 0.67.

## 4. Comparison with scripts/auto_calibrate_thresholds.py methodology

The script learns cutoffs from **percentiles of the mule score distribution**: critical = mule p75,
high = mule p50, medium = mule p25, flagged = mule p10 (plus a Youden‑J binary optimum). Applied to THIS data:

- Mule percentiles (risk_score scale): p10=4.0 p25=26.5 p50=70.9 p75=70.9 p90=92.2
- Youden‑J optimum: 20.6 (J=0.2100)

| Level (script semantics) | Cutoff on this data | Flagged | Precision | Recall | F1 |
|---|---:|---:|---:|---:|---:|
| flagged ← mule p10 | ≥ 4.0 | 323 | 0.2786 | 0.9000 | 0.4255 |
| medium ← mule p25 | ≥ 26.5 | 246 | 0.3049 | 0.7500 | 0.4335 |
| high ← mule p50 | ≥ 70.9 | 179 | 0.2849 | 0.5100 | 0.3656 |
| critical ← mule p75 | ≥ 70.9 | 179 | 0.2849 | 0.5100 | 0.3656 |
| Youden‑J | ≥ 20.6 | 249 | 0.3133 | 0.7800 | 0.4470 |

**Would the percentile approach have picked different cutoffs? YES** It would set high≈70.9 vs app 64.0, critical≈70.9 vs app 67.1, decision line≈4.0 vs app 55.1 (all on the 0–100 scale). Note: because the script derives cutoffs purely from mule percentiles, it ignores where legit scores end — if legits overlap those regions, its cutoffs trade precision for recall blindly. See caveat below.

**Structural failure of the percentile method under score saturation:** p50 = p75 = 70.9 — half the mule distribution sits on ONE exact plateau value, so the 'high' and 'critical' cutoffs collapse to the same number and high-vs-critical banding becomes meaningless. The method also has no notion of false positives: its decision line lands at mule-p10 ≈ 4.0, which flags 323 accounts at precision 0.2786. Its own Youden‑J fallback (20.6) happens to agree with the F1/MCC optimum here.

## 5. Recommended threshold configuration

| Parameter | Current (app) | F1-optimal | MCC-optimal (precision-leaning alt.) | ΔF1 (current → F1-opt) | Note |
|---|---:|---:|---:|---:|---|
| Verdict / decision line (`is_mule`) | ≥ 55.1 | ≥ 20 | ≥ 80 | +0.0390 | F1-opt flags 249/400 @ P 0.313; MCC-opt flags 31/400 @ P 0.677 |
| Red line (`critical_risk` flag) | ≥ 70.0 | — | ≥ 80 if used as a decision line | −0.0814 vs optimum | currently sits inside the 70.9 plateau: 179 flagged, only 51 true mules (P≈0.28) — a poor action trigger |
| High band boundary | ≥ 64.0 | ≥ 26.5? | ≥ 70.9 (percentile method) | — | banding is UI triage, not a decision; current 64.0 splits no population meaningfully |
| Critical band boundary | ≥ 67.1 | — | ≥ 92.2 for a high-purity tier | — | at ≥90 precision is 0.92 on this set (12 accounts) |

## 6. Honest calibration verdict

- **Calibration is POOR**: ECE = 0.2867. Predicted probabilities do NOT match observed frequencies — **a '70' is NOT a 70% chance of being a mule** (empirical mule fraction near 70 is ~0.20); a '20' is more mule-like (~0.75) than the score implies. The score is a decision variable, not a probability.
- Discrimination: AUC 0.6318 (tie-inflated; strict-tie AUC ≈ 0.5645), raw ml_score AUC 0.4983 ≈ chance. Ranking power is weak-to-moderate and comes almost entirely from the behavioral/graph ensemble, not the XGBoost model output.
- **Root cause — score saturation:** the Platt sigmoid (A=−39.8, B=12.6 around raw≈0.32) clips nearly everything to ~0, ~0.41 or ~1: 256/400 accounts share a plateau score with ≥19 others (largest plateau = exactly 70.9, 138 accounts). Between plateaus the threshold sweep is nearly flat, so 'optimal threshold' mostly means 'which plateau to include' — a coarse lever, and any reported optimum carries plateau-boundary luck.
- F1 vs MCC disagree on direction: F1 peaks LOW (t≈20, high recall, precision barely above the 25% prevalence) while MCC peaks HIGH (t≈80, fewer but cleaner flags). If the red line drives analyst action/cost, prefer the MCC view; if it is an early-warning triage list, the F1 view is defensible.
- Thresholds optimized on this same 400-account blind set are **in-sample**: expect some optimism vs deployment. Treat the numbers as directional and re-validate on a second holdout before shipping.

## Reproduction

```bash
cd "C:\MISCELLANEOUS PROJECTS\SIH_2026\1"
npx tsx audit/mltest/evaluate.ts \
  --input audit/mltest/mltest_input.json --truth audit/mltest/truth.json --out audit/mltest/RESULTS.md
python audit/mltest/threshold_analysis.py
```

*This audit reads `predictions.json` produced by the unmodified app pipeline; it modifies nothing in the app.*
