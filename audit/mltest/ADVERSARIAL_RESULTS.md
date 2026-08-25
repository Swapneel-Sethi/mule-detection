# ADVERSARIAL RESULTS — Mule Guard ML Validation

**Generated:** 2026-08-25T13:29:42.040Z · **models_loaded:** true

Pipeline: `detectionEngine.runDetection()` via `node --experimental-strip-types` + fetch shim (`public/model_weights.json`).

## Verdict table — crash / NaN robustness + headline metrics

| Dataset | Accounts | Txns | Crash | NaN scores | TP | FP | TN | FN | Runtime(ms) | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|
| base | 400 | 4247 | no | 0 | 89 | 241 | 59 | 11 | 1138 | OK |
| borderline | 610 | 4715 | no | 0 | 24 | 0 | 0 | 6 | 1206 | OK |
| traps | 587 | 4559 | no | 0 | 0 | 14 | 11 | 0 | 3700 | OK |
| malformed | 430 | 8501 | no | 0 | 0 | 0 | 0 | 0 | 10669 | OK |

## Borderline mules (true positives just under thresholds)

**Detected 24/30 = 80%** (misses = FN). Lower = more threshold-gaming succeeds.

| Account | Archetype | Calibrated score | Truth |
|---|---|---|---|
| ADV014298371 | structuring_two_per_band | 0.934 | mule |
| ADV014509580 | structuring_two_per_band | 0.934 | mule |
| ADV014095184 | structuring_two_per_band | 0.937 | mule |
| ADV014402778 | structuring_two_per_band | 0.937 | mule |
| ADV014195503 | structuring_two_per_band | 0.938 | mule |
| ADV014344912 | structuring_two_per_band | 0.939 | mule |

## Traps — legit accounts that look mule-ish (false-positive stress)

**False-positives: 14/25 = 56%** of traps flagged as mules. High = poor precision on legit-looking-mule-ish behavior.

| Account | Trap archetype | Calibrated score | Truth |
|---|---|---|---|
| ADV100533878 | one_burst_then_silence | 0.853 | legit |
| ADV100439291 | one_burst_then_silence | 0.849 | legit |
| ADV100240948 | one_burst_then_silence | 0.845 | legit |
| ADV100322136 | one_burst_then_silence | 0.839 | legit |
| ADV100024901 | one_burst_then_silence | 0.838 | legit |
| ADV100191892 | one_burst_then_silence | 0.832 | legit |
| ADV100714283 | one_burst_then_silence | 0.829 | legit |
| ADV100646160 | one_burst_then_silence | 0.822 | legit |
| ADV130293024 | many_small_donors | 0.59 | legit |
| ADV130157038 | many_small_donors | 0.589 | legit |
| ADV130736819 | many_small_donors | 0.564 | legit |
| ADV130313911 | many_small_donors | 0.559 | legit |
| ADV130054470 | many_small_donors | 0.558 | legit |
| ADV130624787 | many_small_donors | 0.558 | legit |

## Malformed input — robustness detail

- Crash: **no**
- Non-finite scores: **none**
- Accounts scored: 430, txns scored: 8501, runtime 10669ms
- Verdict: pipeline survived null balances / negative & zero amounts / zero-txn accounts / absurd velocity without crashing or emitting NaN.

## 3 worst failure cases per dataset

### base

| Account | Key features (archetype) | Predicted calibrated | Truth |
|---|---|---|---|
| TST000135 | none | 0.913 | legit |
| TST000254 | none | 0.912 | legit |
| TST000271 | none | 0.911 | legit |

### borderline

| Account | Key features (archetype) | Predicted calibrated | Truth |
|---|---|---|---|
| ADV014298371 | structuring_two_per_band | 0.934 | mule |
| ADV014509580 | structuring_two_per_band | 0.934 | mule |
| ADV014095184 | structuring_two_per_band | 0.937 | mule |

### traps

| Account | Key features (archetype) | Predicted calibrated | Truth |
|---|---|---|---|
| ADV100533878 | one_burst_then_silence | 0.853 | legit |
| ADV100439291 | one_burst_then_silence | 0.849 | legit |
| ADV100240948 | one_burst_then_silence | 0.845 | legit |

### malformed

_No misclassifications recorded for labeled accounts._

## Method notes

- Each variant = full copy of base dataset + injected accounts/txns, scored as ONE graph so community/PageRank features see the complete network.
- Injected ids are prefixed `ADV`; per-variant labels live in `variants/<name>_labels.json` (same shape as `truth.json`).
- Borderline design targets: fan-in exactly 6 senders (thr ≥3, crit ≥7); fan-out exactly 7 receivers (crit ≥8); transit turnover 49k (<50k thr, <500k alt-arm) with balance<1000 and >20 txns; pass-through ratio in (0.8,1.2) but balance kept ≥12% of inflow (thr wants <10%); structuring only 2 txns per band (needs ≥3).
- Trap designs: monthly salary-in/rent-out pass-through shape; single-day high-velocity burst then silence; crowdfunding-style many small senders.