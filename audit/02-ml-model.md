# Audit 02 — ML / Model Correctness (Mule Guard)

Scope: `mule-detection/` — xgboostPredictor.ts + model_weights.json, detectionEngine.ts,
scorer trio (transactionScorer / transactionXgboost / mlModel), train/serving skew
(scripts/train_transaction_model.py, auto_calibrate_thresholds.py), then markovModel.ts,
label-leakage sanity of the 99.95%/100% claim, backend/main.py liveness.
Method: static read + grep-level reasoning; no CSV recomputation. Findings appended incrementally.

## Findings

### xgboostPredictor.ts + model_weights.json

- **HIGH — Duplicate `MLFeatures` interface, partial objects can reach the 16-feature model.**
  `src/lib/xgboostPredictor.ts:164-181` declares a 16-field `MLFeatures`; lines 240-248 re-declare
  it with 7 fields (TS declaration-merging makes this legal but confusing). A caller passing the
  7-field shape passes the finiteness check (`Object.values`, :255) yet `buildFeatureVector`
  (:188-207) emits `undefined` for the missing 9 slots → traversed as "missing"/NaN inside trees,
  silently corrupting predictions.
  Fix: keep ONE explicit 16-field interface and reject/zero-fill absent fields at entry.
- **HIGH — Possible double-shrinkage of log-odds.** Line 151 multiplies each leaf by
  `model.learning_rate`; if `scripts/export_xgboost.py`/`convert_model.py` already baked eta into
  leaves or the booster's dumped margin, probabilities are systematically pulled toward base_rate
  (verify against export script — pending below).
  Fix: apply shrinkage exactly once (either at export or at inference, not both).
- **MEDIUM — Silent heuristic fallback indistinguishable from real ML score.** Load failures
  (HTTP != ok, bad JSON, broken trees) only `console.warn` (:49,:62,:72) and
  `computeMLScoreSync` (:268-275) quietly substitutes `weightedFallbackScore`. Downstream
  risk scores/UI cannot tell XGBoost output from a hard-coded heuristic.
  Fix: return `{score, source: 'model'|'fallback'}` or set a module-level flag surfaced in the API response.
- **MEDIUM — Relative fetch `/model_weights.json` breaks outside browser/static context.**
  `fetch("/model_weights.json")` (:47) fails in Node/API-route/serverless contexts (no origin),
  guaranteeing permanent silent fallback there.
  Fix: resolve via absolute URL/env base or `fs.readFile` on the public dir server-side.
- **LOW — sigmoid NaN policy implicit.** `sigmoid(±Infinity/NaN)` (:82-85): NaN>0 is false → NaN maps to 0
  (safe-by-luck); document or use explicit `Number.isNaN` branch.
- **LOW — `getFeatureImportances` mislabels fallback.** For numeric-index models `countSplitFeatures`
  (:324-332) yields nothing and hard-coded importances (:292-301) are returned while docstring claims
  "true split-based importance" (:288).
  Fix: name-map indices before claiming split-derived, else label the payload "heuristic default".
- Note: tree traversal itself is solid — iterative (:99-130), NaN→missing branch (:120), out-of-range
  feature index → 0 contribution (:112), length-mismatch warned (:141-146).



### model_weights.json — CONFIRMED CRITICAL

- **CRITICAL — The exported "XGBoost model" contains no leaves and no splits: it is inert.**
  Verified programmatically: all 200 entries in `trees[]` are a single root node
  `{feature: hub_score|account_age_days, threshold, left:null, right:null, missing:null}`;
  `"leaf"` occurs 0 times in the 20 KB file (grep count). Therefore:
  - `isValidTree()` (`xgboostPredictor.ts:132-137`) returns FALSE for every tree (no leaf, no children),
  - `predictWithModel` sums nothing → output is constant `sigmoid(0 + base_score 0.5) ≈ 0.622`
    for every account if called directly,
  - `computeMLScoreSync` sees `validTrees.length (0) > 100` false → always uses
    `weightedFallbackScore`. **No trained-model inference ever happens in the app**;
    every "ML score" shown is the hard-coded 10-term heuristic.
  Fix: re-export real trees (leaf values + child links) via a corrected export script and add a
  load-time assertion that ≥1 tree has a leaf; hard-fail loudly otherwise.
- **MEDIUM — Model JSON itself is degenerate even as data**: 200 identical stub roots
  (171×hub_score@1.7e-10, 29×account_age_days@93.0), so `getFeatureImportances` on it yields
  only those two features.
  Fix: same root cause as above; regenerate artifact.



### detectionEngine.ts — risk_score math & bands

- **CRITICAL — Platt "calibration" is a hard-coded sigmoid whose docstring lies about its constants.**
  `mlModel.ts:213-219` (invoked `detectionEngine.ts:1514`) uses A=-39.8078, B=12.6312, while its
  own docstring (:204-209) claims A=-4.0/B=2.0 mapping 0.5→0.50. Actual params map 0.317→0.50,
  0.466→0.95, 0.5→0.986, 0.551→0.997 — near-vertical mid-range, saturated above ~0.47 raw.
  Fix: re-fit A,B by logistic regression on held-out (score,label) pairs; correct the docstring.
- **CRITICAL — Decision thresholds tuned for a pipeline whose ML component never fires.**
  is_mule/risk bands 0.551/0.640/0.671 (`detectionEngine.ts:1520,:1525-1527`) were calibrated when
  `ML_MODEL:0.40` weight (:1071) multiplied real model output; with model_weights.json inert
  (see above), mlNormalized lives in a squashed band → thresholds misaligned with actual outputs.
  Fix: recalibrate thresholds after regenerating the model artifact.
- **HIGH — Ensemble zeroes 3 of 6 advertised components** (GRAPH=TEMPORAL=INTERACTION=0,
  :1066-1073); graphScore/temporalScore/interactionScore still computed per account
  (dead compute) and persisted as if meaningful; "6-component research ensemble" claim misleading.
  Fix: skip zero-weight computation or restore weights and document.
- **HIGH — Feature placeholders into the model**: `hub_score ← pagerank_score`,
  `authority_score ← betweenness_centrality` (:1486-1487). Even with a fixed artifact these two of
  16 features are proxies → train/serve skew.
  Fix: compute true HITS hub/authority scores.
- **MEDIUM — Hard-coded min-max window [0.262, 0.466]** for mlNormalized (:1495-1499); out-of-window
  scores silently clamp to 0/1; window drifts as data changes.
  Fix: ship train-time min/max inside model_weights.json instead of literals.
- **LOW — risk_score scale**: stored as round(calibrated*100*10)/10 (:1615) → 0–1000 scale;
  confirm all consumers expect that, else normalize to 0–100 in one place.
- Note: div-zero guards present (avg = count>0 ? sum/count : 0, :1478/:1482); band boundaries are
  contiguous/inclusive (no gaps/overlaps); try/catch fallback to mlScore() only on throw (:1490).

### mlModel.ts

- **HIGH — Double sigmoid.** `mlScore()` already sigmoids log-odds→probability (:184-193);
  `calibrateScore()` sigmoids again (:217). Its own comment (:181-183) says calibrateScore
  "should NOT apply sigmoid again". Compounding compresses mid-range and pushes extremes to 0/1.
  Fix: calibrate raw log-odds, or make calibrateScore affine/identity when input is a probability.

### Scorer trio — duplication & authority

- Authoritative paths: account-level ML = `xgboostPredictor.computeMLScoreSync` (called
  `detectionEngine.ts:1489`); `mlModel.mlScore` is now only a throw-catch fallback
  (`detectionEngine.ts:1490-1492`) despite its header claiming to be "the fallback" — effectively
  dead except on exceptions. Transaction-level ML = `transactionScorer.scoreTransaction` →
  `transactionXgboost.computeTransactionRiskSync`; `scoreAllTransactions` is imported by
  detectionEngine.ts:48 (used for txn alerts).
- **HIGH — transactionXgboost.ts duplicates xgboostPredictor.ts almost line-for-line**
  (sigmoid :75-78 ≈ :82-85; traverseTree :88-118 ≈ :99-129; isValidTree :120-124 ≈ :132-137;
  predict :126-140 ≈ :139-155; loader :33-73 ≈ :38-80; importances/countSplitFeatures :233-263 ≈
  :290-332). Two divergent copies of an inference engine will drift independently (already have:
  different base_score/lr defaults).
  Fix: extract one shared tree-ensemble module parameterized by model URL + feature builder.
- **MEDIUM — Output-scale inconsistency between model and fallback paths.**
  `computeTransactionRiskSync`: model path returns probability×100 (:216), heuristic path returns
  ×100 too (:192) but with completely different semantics (heuristic mixes calibrated scores, not a
  probability); callers treat both as one scale (transactionScorer.ts:225-227).
  Fix: unify return contract ({probability, source}) before scaling.
- **LOW — `recentTxns` parameter unused** in extractTransactionFeatures (transactionScorer.ts:103,
  never referenced in body) — velocity window advertised but not implemented.
  Fix: implement rolling-window velocity or drop the param.

### P2 — training/serving skew

- **HIGH — `is_night` definition differs**: training `0 <= hour < 6`
  (train_transaction_model.py:128) vs serving `hour >= 0 && hour < 5` (transactionScorer.ts:108).
  Hour-5 transactions flip feature value between train and serve.
  Fix: share one constant/window.
- **MEDIUM — `amount_ratio` formula differs**: training `amount/(total_in+1)` (py:112) vs serving
  `total_in>0 ? amount/total_in : 0` (ts:113). Diverges for small totals and zero-inflow senders.
- **MEDIUM — Missing-account defaults differ**: training defaults risk_score→10 i.e. risk_norm 0.1
  (py:105,:109) while serving safeNum-defaults risk_norm to 0 (ts:118-119); velocity/hub default 0
  in both, calibrated 0.3 in both — but only because ts hardcodes 0.3 in two places
  (transactionScorer.ts:203-208, :259-268) rather than sharing constants.
- Note: weekday conventions are actually consistent (py Mon=0 weekend>=5 ≡ js Sun=0/Sat=6); raw
  amounts un-scaled in both (trees absorb magnitude); no scaler object exists to drift.
- **auto_calibrate_thresholds.py vs TS**: script derives critical/high/medium/flagged from mule-score
  percentiles of `accounts_dataset.json.calibrated_score` (py:78-83) and writes
  scripts/_learned_thresholds.json (:109); detectionEngine.ts:1520,:1525-1527 hardcodes
  0.551/0.640/0.671 and transactionScorer.ts:24 hardcodes FLAG_THRESHOLD=55.1 — consistent numbers
  TODAY, but nothing regenerates or verifies them at build/test time.
  Fix: generate a TS constants file from _learned_thresholds.json in CI.

### markovModel.ts (P3)

- Transition matrix rows all sum to exactly 1.0 (`markovModel.ts:37-53`); zero-probability
  legitimate→…→legitimate recovery from confirmed_mule (0.0, :49) is an intentional absorbing state,
  documented. Unknown transitions fall back to uniform 1/3 instead of coin-flip/garbage (:150-155) —
  good guards; no Laplace smoothing needed given matrix is hand-authored, not frequency-estimated.
- **MEDIUM — "Temporal evolution" is fed exactly ONE observation** — the account's own freshly
  computed score (`detectionEngine.ts:1565-1568` wraps `[current]`) — so states/trend are always
  trivial ("Single observation…stable", :109-124). Output looks like analysis but is a deterministic
  echo of the score computed above it.
  Fix: feed real per-day history or hide the panel when history < 2 observations.
- **LOW — threshold drift**: `STATE_THRESHOLDS.mule_min_risk = 0.55` (:73) vs engine's is_mule
  0.551 (`detectionEngine.ts:1520`) — an account can be is_mule=true yet classified "suspicious"
  here (or vice-versa near boundary).
  Fix: import one shared THRESHOLDS module.

### Label-leakage sanity check of the 99.95% / 100% claim

Grep-level chain, no CSV recomputation needed:

1. **Labels are authored, not observed.** `scripts/build_real_mules.py:119` sets `"is_mule": True`
   for accounts it synthesizes as mules (header :17 admits it also sets high risk_score so they
   "surface at the top") and writes their `calibrated_score` itself (:145).
2. **Thresholds are fit to those labels post-hoc.** `auto_calibrate_thresholds.py:78-83` picks
   critical/high/medium/flagged as percentiles OF THE MULE SCORES; its own note (:75-76,:121)
   celebrates that classes are perfectly separated (non-mules all ≈0.141, mules 0.551–0.708).
   Choosing flagged = bottom-of-mule-range makes recall 100% **by construction** — any mule below
   the threshold would contradict how the threshold was chosen.
3. **Transaction labels are a function of the same flags.** `generate_synthetic_data.py:54-59`:
   `flagged = sender.is_mule OR receiver.is_mule OR transaction_risk>=0.75 OR amount>10000 OR rand<5%`;
   `convert_csv_transactions.py:107`: `"flagged": not is_none`. The txn model's features
   (sender_risk, receiver_risk, sender/receiver_calibrated_score, hub scores —
   `train_transaction_model.py:114-130`) are all derived from the same account risk values that
   determine the label → the label is nearly a deterministic function of visible features.
4. **The headline classification report is computed on training data.**
   `train_transaction_model.py:188-193` runs `predict_proba(X)` on the FULL fit X and prints the
   report at threshold 0.5 — no holdout split anywhere in the script (only CV-AUC is honest).
   99.95%-style numbers quoted from this output are resubstitution metrics.
5. Downstream, `is_mule` flags feed explanations/UI which feed back into persisted datasets
   consumed by later scoring runs (accounts_dataset.json ↔ detectionEngine outputs), compounding
   circularity.

### backend/main.py — dead?

- **LOW/MEDIUM — Dead code**: FastAPI service exists (`backend/main.py`, requirements.txt) but
  package.json scripts contain only next dev/build/lint/start (+ python graph generators); nothing
  in src/, netlify.toml or vercel.json references it. The dashboard never calls it.
  Fix: delete it or wire it up; do not cite it as the scoring engine.

## VERDICT

**The 99.95% / 100% claim is NOT trustworthy — it is leakage-inflated and close to tautological.**

- The 100% recall comes from fitting decision thresholds to the *score distribution of the very
  accounts labeled mule* after those labels/scores were co-authored by the same generator script
  (build_real_mules.py writes both `is_mule` and `calibrated_score`). A threshold equal to the
  minimum mule score cannot miss a mule — this measures the generator, not a detector.
- The 99.95% accuracy is a train-set resubstitution number (train_transaction_model.py evaluates
  on the data it fit), on fully synthetic transactions whose `flagged` label is a boolean function
  of account attributes the model sees as features.
- Separately, the deployed artifact chain is broken: root model_weights.json contains zero leaves;
  only public/model_weights.json is loadable; the account-model path silently degrades to a
  hand-written heuristic while the UI presents "ML scores"; Platt constants don't match their
  docstring; three of six ensemble components have zero weight.
- Expected real-world performance: unmeasured. To make the claim defensible: hold out
  time-split / ID-disjoint data, freeze thresholds before evaluation, fix the export artifact,
  and report precision/recall from data the pipeline never saw.

---

### Corrections & clarifications to earlier sections (verified after deeper artifact check)

1. **model_weights.json — refined severity.** There are TWO copies: the repo-root
   `model_weights.json` and `public/model_weights.json`. Verified by parsing:
   - ROOT copy: 200 stub nodes, `"leaf"` count = 0, no children — inert; if this file were ever
     served, every tree fails isValidTree and inference silently falls back to the heuristic.
   - PUBLIC copy (what `/model_weights.json` actually serves): real trained structure — 446 split
     nodes / 1,092 leaves, max depth 3, base_score **0.0**, learning_rate 0.1. So live account-level
     inference DOES run through trees; the CRITICAL above applies to the stale root duplicate, not
     the served file. Remaining real risks: two divergent artifacts with different base_scores in
     one repo (root=0.5 vs public=0.0) invite serving the wrong one; depth-3/200-tree model on
     mostly-placeholder features is weak but genuine.
2. **learning_rate double-shrinkage — CONFIRMED REAL for both models.**
   export_xgboost.py:51 dumps booster trees via get_dump() — XGBoost leaf values already include
   shrinkage; TS then multiplies leaves by learning_rate again (xgboostPredictor.ts:151,
   transactionXgboost.ts:136). Export script never divides by eta → probabilities over-shrunk
   toward base_rate at serve time (train/serve skew in the score itself).
3. **export_xgboost.py:63 base_score bug**: `booster.attr("base_score")` returns None under modern
   XGBoost (it's a learner attribute, not a booster attr), so it falls back to sklearn's wrapper
   default (0.5) even when the booster was trained with base_score=0 — another root-vs-public
   divergence source.
4. **train_transaction_model.py trains on the FULL dataset and exports that same model**
   (:168 fit(X,y) with no train/test split before export) — the shipped transaction_model.json has
   memorized its own evaluation set; CV-AUC is honest but the exported artifact's accuracy claim
   is not.


