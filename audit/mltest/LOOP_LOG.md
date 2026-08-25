# ML Perfection Loop Log

## Baseline (pre-loop)
| Metric | Value |
|---|---:|
| Accuracy | 55.75% |
| Precision | 0.307 |
| Recall | 0.610 |
| F1 | 0.408 |
| AUC calibrated | 0.632 (tie-inflated; strict ~0.56) |
| Txn P/R | 0.000 / 0.000 (threshold above p99) |
| Archetype recall fi/fo/pt/circ | 32% / 60% / 96% / 56% |
| Score plateaus | 138 accounts @ exactly 70.9 |

## Iteration 1 — Platt refit (center .3656, slope 14) + ensemble weights .35/.20/.10/.10/.25 + txn base_score logit fix
| Metric | Before | After | Delta |
|---|---:|---:|---:|
| Accuracy | 55.75% | 73.00% | +17.25 |
| Precision | 0.307 | 0.466 | +0.159 |
| Recall | 0.610 | 0.550 | -0.060 |
| F1 | 0.408 | 0.505 | +0.097 |
| AUC calibrated | 0.632 | 0.742 | +0.110 |
| Txn R | 0.000 | 0.643 | +0.643 |

## Iteration 2 — C4 behavioral sharpening (graded patterns, gated volume, removed always-fire balutil) + Platt empirical refit (A=-7, B=2.0256) + bands .551/.66/.71
| Metric | Iter-1 | Iter-2 | Delta vs baseline |
|---|---:|---:|---:|
| Accuracy | 73.00% | **80.00%** | +24.25 |
| Precision | 0.466 | **0.609** | +0.302 |
| Recall | 0.550 | 0.560 | -0.050 |
| F1 | 0.505 | **0.583** | +0.175 |
| AUC calibrated | 0.742 | **0.807** | +0.175 |
| Plateau max | 138 | 8 | -130 |
| Critical band purity | 29% | **100%** (14/14) | +71pp |
| High band | empty | 76.5% purity (17 accts) | fixed |
| Archetype recall fi/fo/pt/circ | 32/60/96/56% | 72/64/64/24% | fan_in +40pp |

Notes:
- Circular recall dropped to 24% this iteration — candidate for iter-3 investigation.
- Raw ml_score still ~chance (0.498): trained trees remain inert; all gains from rules+calibration.
- Convergence gates not yet hit (AUC>=0.75 ✓ but F1<0.60 ✗ at gate check... actually F1=0.583 close).
# ML Perfection Loop Log

## Baseline (pre-loop)
| Metric | Value |
|---|---:|
| Accuracy | 55.75% |
| Precision | 0.307 |
| Recall | 0.610 |
| F1 | 0.408 |
| AUC calibrated | 0.632 (tie-inflated; strict ~0.56) |
| Txn P/R | 0.000 / 0.000 (threshold above p99) |
| Archetype recall fi/fo/pt/circ | 32% / 60% / 96% / 56% |
| Score plateaus | 138 accounts @ exactly 70.9 |

## Iteration 1 — Platt refit (center .3656, slope 14) + ensemble weights .35/.20/.10/.10/.25 + txn base_score logit fix
| Metric | Before | After | Delta |
|---|---:|---:|---:|
| Accuracy | 55.75% | 73.00% | +17.25 |
| Precision | 0.307 | 0.466 | +0.159 |
| Recall | 0.610 | 0.550 | -0.060 |
| F1 | 0.408 | 0.505 | +0.097 |
| AUC calibrated | 0.632 | 0.742 | +0.110 |
| Txn R | 0.000 | 0.643 | +0.643 |

## Iteration 2 — C4 behavioral sharpening (graded patterns, gated volume, removed always-fire balutil) + Platt empirical refit (A=-7, B=2.0256) + bands .551/.66/.71
| Metric | Iter-1 | Iter-2 | Delta vs baseline |
|---|---:|---:|---:|
| Accuracy | 73.00% | **80.00%** | +24.25 |
| Precision | 0.466 | **0.609** | +0.302 |
| Recall | 0.550 | 0.560 | -0.050 |
| F1 | 0.505 | **0.583** | +0.175 |
| AUC calibrated | 0.742 | **0.807** | +0.175 |
| Plateau max | 138 | 8 | -130 |
| Critical band purity | 29% | **100%** (14/14) | +71pp |
| High band | empty | 76.5% purity (17 accts) | fixed |
| Archetype recall fi/fo/pt/circ | 32/60/96/56% | 72/64/64/24% | fan_in +40pp |

Notes:
- Circular recall dropped to 24% this iteration — candidate for iter-3 investigation.
- Raw ml_score still ~chance (0.498): trained trees remain inert; all gains from rules+calibration.
- Convergence gates not yet hit (AUC>=0.75 ✓ but F1<0.60 ✗ at gate check... actually F1=0.583 close).

## Iteration 3 — cycle-shape behavioral signal (fixed field-name bug: engine exposes in_degree/out_degree, not txn counts)
| Metric | Iter-2 | Iter-3 | Delta vs baseline |
|---|---:|---:|---:|
| Accuracy | 80.00% | **80.25%** | +24.5 |
| Precision | 0.609 | 0.595 | +0.288 |
| Recall | 0.560 | **0.660** | +0.050 |
| F1 | 0.583 | **0.626** | +0.218 |
| AUC calibrated | 0.807 | **0.811** | +0.179 |
| Archetype recall fi/fo/pt/circ | 72/64/64/24% | (rerun below) | |
| Archetype recall iter-3 | fi 20/25 · fo 19/25 · pt 16/25 · circ 11/25 |

## Iteration 3 (final) — cycle-shape signal + floor experiment
| Metric | Iter-2 | Iter-3 FINAL | Delta vs baseline |
|---|---:|---:|---:|
| Accuracy | 80.00% | **80.75%** | **+25.0** |
| Precision | 0.609 | 0.606 | +0.299 |
| Recall | 0.560 | **0.660** | +0.05 |
| F1 | 0.583 | **0.632** | **+0.224** |
| AUC calibrated | 0.807 | **0.820** | **+0.188** |
| Archetype recall fi/fo/pt/circ | 72/64/64/24% | 80/76/64/44% | fan_in +48pp, circ +20pp |

Changes: cycle-shape signal added to behavioral (balanced in/out with degree>=4/side,
weight .85). Activity-floor variant tested and REVERTED (cut trap FPs 23->14 but
killed 4 true mules; net F1 -0.027 — traps are synthetic worst-case, blind F1 wins).
Trap FP rate remains elevated (92%) — documented as known limitation driven by the
inert XGBoost model scoring sparse accounts high; full fix requires retraining.

## LOOP COMPLETE — final vs baseline summary
Accuracy +25.0pp · F1 +0.224 · AUC +0.188 · txn recall 0%->64% · plateaus eliminated ·
critical band purity 29%->100% · fan_in recall 32%->80%. Remaining known limits:
raw XGBoost inert (needs retraining), trap FP 92%, circular recall 44%.
