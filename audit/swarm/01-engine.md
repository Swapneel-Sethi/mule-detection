# Domain: DETECTION ENGINE — file `mule-detection/src/lib/detectionEngine.ts` (1844 lines)

Prior-run items living in THIS file: MASTER report DOMAIN 2 items 1-18 (rapid-movement pairing bug, beneficiary_concentration duplicate of repeat_counterparty_ratio, unbounded factor contributions x weight, generateMLAlerts riskScore>=50 gate recalibrated, dead generateAlerts removed, behavioral flags keyed on never-emitted engine flags, account-alias normalization gap, Markov comment fix, is_night off-by-one hour<5 vs <6, missing-field defaults calibrated_score 0 vs 0.3 / risk_score 0 vs 10, FLAG_THRESHOLD percentile citation) and item 38 (export path public/ alignment), plus PLATFORM themes C/D/E. Verify EACH in current code (R1), adjudicate related reported-only items (R2), then hunt your line range fresh (R3).

## [eng:L1-310] lines 1-310
Imports, types, constants, DirectedGraph class, early helpers. Read fully; skim 311-370 for context. R1-check constants against APP/public/ml_params.json + APP/scripts/_learned_weights.json; ensemble weights {BEHAVIORAL .3968, GRAPH 0, TEMPORAL 0, COMMUNITY .2032, ML_MODEL .40, INTERACTION 0} sum exactly 1.0? zero-weight dead branches? thresholds .551/.640/.671 consistent with ml_params + code? Platt A/B: master says code slope ~7 B~2.0256 while ml_params.json still claims A=-39.8078/B=12.6312 STALE (open item #44) — confirm which side is truth now.

## [eng:L311-620] lines 311-620
Pattern detectors part 1. Full read. R1: detectRapidMovement node-pairing fix present? self-transfer handling aligned across detectors?

## [eng:L621-930] lines 621-930
Pattern detectors part 2. Full read. R1: pattern-name strings vs api/analytics sankey labels FANIN/FANOUT/CIRCULAR/PASSTHROUGH and UI chips; pass_through_pattern canonical mapping route-side AND data-side both landed?

## [eng:L931-1240] lines 931-1240
Risk propagation (heuristic PageRank w/ flagged-edge anomaly weight), sampled betweenness (Fisher-Yates), BFS communities. Full read. Degenerate-graph guards (reported-only: PageRank zeros on degenerate graphs)? communityId gaps?

## [eng:L1241-1844] lines 1241-1844
Feature assembly (~50 features), ensemble scoring, generateMLAlerts, runDetection orchestration, exports. Full read. R1: feature vector length = claimed 16? alert cap 200? Date.now() ID nondeterminism? R2: THEME D says runDetection has ZERO callers (UI reads precomputed JSON) — verify still true; is the dormant Markov import referenced? dead duplicate accountAgeDays gone?

## [eng:XCHECK] cross-cutting (Grep-driven, not linear)
(a) every export of detectionEngine.ts -> who imports it (Grep src) — dead exports list; (b) numeric literals duplicated in transactionScorer/xgboostPredictor/analytics routes that must match engine constants (FLAG_THRESHOLD, normalization windows [.262,.466], tier cutoffs); (c) alert type vocabulary emitted vs what AlertsContent/RiskBadge/analytics alertPatternMap consume (circular/dormant_activation omission was reported-only); (d) comments contradicting code introduced by prior fixes.
