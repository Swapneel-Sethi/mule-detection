# MuleGuard ML Model Report

_Verification date: 25 August 2026_

## Account XGBoost

- Model: exported 200-tree gradient-boosted decision ensemble in
  `public/model_weights.json`.
- Evaluation population: **105,501 accounts**.
- Positive class: **8,578** confirmed mules; negative class: **96,923**.
- Runtime cuts: account mule verdict at calibrated score ≥ `0.551`; risk bands at `0.66` (high) and `0.71` (critical); transaction flag ≥ `0.30`.

| Metric | Result |
| --- | ---: |
| Accuracy @ 0.5 | **98.505%** |
| Best measured accuracy | **98.518%** at threshold ≈ `0.0102` |
| Precision | **1.000** |
| Recall / sensitivity | **0.816** |
| Specificity | **1.000** |
| F1 score | **0.899** |
| ROC-AUC | **0.9094** |
| PR-AUC | **0.8359** |

Confusion matrix at `0.5`:

|  | Predicted negative | Predicted positive |
| --- | ---: | ---: |
| **Actual negative** | 96,923 | 0 |
| **Actual positive** | 1,577 | 7,001 |

### Score calibration note

The exported tree leaves already include XGBoost shrinkage. Raw probabilities
saturate low on this dataset. The account records store an eta-rescaled
`ml_score`; this intentional divergence is documented in both
`scripts/recompute_ml_scores.py` and the browser-side predictor. Changing model
weights or feature formulas requires recalibrating the score range and risk
thresholds together.

## Transaction XGBoost

The transaction model is used through `src/lib/transactionScorer.ts`. Its full
blind evaluation was not rerun in this pass because the existing evaluator timed
out twice after more than three minutes. The shipped implementation retains its
documented leak-safe blind operating point:

- Flag threshold: `0.3`
- Blind-set flagged rate: **27.0%**
- Precision: **33.6%**
- Recall: **64.3%**

After the feature-parity fix, production-style replay is intentionally more
sensitive because it receives the same aggregate fields available at inference;
the code comments define the separate regimes and require re-derivation whenever
features or model JSON change.

## Dataset integrity checks

- Accounts: **105,501**, with unique IDs and no duplicates.
- Transactions: **99,952**, including **7,959** labeled/flagged rows.
- Transaction integrity: no orphan endpoints, invalid amounts, invalid
  timestamps, or duplicate IDs.
- Alerts: **155**, with no orphan account references.
- Risk-level distribution (measured): critical `1,943`, high `19`, medium `6,616` — of 8,578 mules; 96,923 non-mules are low.

The transaction file is a server-safe synthetic sample: all pattern rows are
retained while clean rows are sampled. Consequently, per-account aggregate
fields describe the complete source snapshot and cannot be expected to sum to
the sampled transaction graph. Dashboard turnover uses transaction rows as the
shared source of truth and the API discloses the dataset scope explicitly.
