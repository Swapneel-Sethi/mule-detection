# Wave-3 Pre-Work: Root-Cause Analysis (fan-in weakness + score structure)

**Author:** orchestrator (main session) · **Date:** Aug 25, 2026
**Inputs:** `predictions.json` + `truth.json` from the baseline blind run.

## 1. The ensemble has only ONE working component

Per-component discrimination (mean mule vs mean legit, from `predictions.json`):

| component | mule_mean | legit_mean | delta | discriminates? |
|---|---:|---:|---:|---|
| behavioral_score | 0.613 | 0.593 | +0.020 | NO |
| ml_score | 0.000 | 0.000 | 0.000 | NO (model never fires) |
| calibrated_score | 0.538 | 0.394 | +0.144 | YES (the ONLY one) |

`ml_score = 0.0 for every account` — the account XGBoost outputs near-0 probability
for the ENTIRE blind set (not just FPs). Combined with its AUC ≈ 0.498, conclusion:
**the trained trees are inert on this feature distribution; all detection comes from
the rule layer via `calibrateScore`.**

`behavioral_score` barely separates (+0.02): both populations average ~0.6 because
`computeBehavioralScore()` averages whatever signals fire — legit high-volume
merchants trip velocity/balance signals as easily as mules trip pattern signals.

## 2. The 70.9 plateau

138 of 400 accounts share `calibrated_score == 0.709` exactly — 27 mules, 111 legit
(19.6% precision inside the "critical" band). This is the Platt sigmoid's saturation:
any raw ensemble value in a wide input band maps to ~0.709. Consequences:

- risk_level bands (0.551/0.640/0.671) land inside plateaus → band membership is a coin toss
- threshold sweeps show cliff jumps of ±100 accounts for Δt=0.001
- strict-tie AUC collapses toward 0.56 vs tie-friendly 0.63

## 3. Fan-in misses decompose into two distinct groups

17 missed fan-in mules split cleanly:

**Group A — engine never fires (7 accounts, calibrated ≈ 0.028–0.041).**
These have `unique_senders < 3` or their inbound edges were pruned by the scorer's
endpoint filtering. No detector can catch what the graph doesn't contain. Fix must
be in the DATASET GENERATOR (ensure ≥3 senders cash in within windows), not the model.

**Group B — fires but verdict says no (10 accounts, calibrated 0.24–0.47).**
Behavioral fired (0.58–0.60) but the saturated calibration pushed them below the
0.551 cliff. With a non-saturated mapping these become true borderline positives.

## 4. Implications for the fix loop (Wave 3 brief)

1. **Calibration repair is the single highest-leverage change** — it fixes the plateau,
   un-buries Group B fan-ins, and restores meaning to bands/thresholds.
2. **Re-weighting the ensemble cannot help much while behavioral is non-discriminative**
   (+0.02). Weight reshuffle alone moves deck chairs. Any weight change should be
   paired with sharpening WHICH signals count (pattern signals vs volume signals).
3. **Group A needs generator-side repair**, then re-evaluation — otherwise fan-in
   recall is capped at ~32% no matter what the model does.
4. **The raw ml_score being identically 0** suggests either (a) features fall outside
   the trees' trained split ranges entirely, or (b) base_score/logistic path saturates.
   Worth one probe before any retraining decision: feed a known-mule-shaped feature
   vector directly to `computeMLScoreSync` and inspect intermediate logOdds.

## 5. Reproduce

```bash
cd "C:\MISCELLANEOUS PROJECTS\SIH_2026\1"
python audit/mltest/wave3_prereq_analysis.py   # (analysis embedded above, numbers from predictions.json)
npx tsx audit/mltest/evaluate.ts --input audit/mltest/mltest_input.json \
  --txns audit/mltest/mltest_transactions.json --truth audit/mltest/truth.json \
  --out audit/mltest/RESULTS.md
```
