# MuleGuard — ML Pipeline Audit (2026-08-24)

> **SUPERSEDED — 2026-08-25 remediation wave B.** Several items are resolved at HEAD:
> C2 fixed (`transactionXgboost.ts` adds `baseScoreLogOdds(base_score)`, not raw 0.5);
> C3 mostly fixed (models lazy-preload via `void loadModel()` — residual first-call race only);
> C1 kept deliberately on the account side as serving-contract parity with
> `recompute_ml_scores.py` (commented in `xgboostPredictor.ts`);
> C5 superseded by the iter-2 Platt refit (`mlModel.ts`: A=-7, B=2.0256);
> M4 recalibrated (`FLAG_THRESHOLD = 0.3`, probability scale); some H4 line refs stale.
> Current findings: `audit/wave2/`.

Scope: account XGBoost model (`public/model_weights.json`), transaction model (`public/transaction_model.json`), TypeScript inference (`src/lib/xgboostPredictor.ts`, `transactionXgboost.ts`, `transactionScorer.ts`, `mlModel.ts`, `detectionEngine.ts`), Python training/calibration scripts (`scripts/*.py`). Companion to `SIH_AUDIT_REPORT.md` (which covers security/deploy/UI, not ML).

---

## CRITICAL

### C1 — Learning rate applied twice to already-shrunk leaves
`booster.get_dump()` returns leaf values that **already include** η-shrinkage from training (visible in the artifacts: tree-0 leaves ≈ ±0.0999 ≈ 0.1 × ±1.0, decaying geometrically tree-over-tree). Every consumer multiplies by `learning_rate` again:

- `src/lib/xgboostPredictor.ts:151` — `logOdds += traverseTree(...) * model.learning_rate`
- `src/lib/transactionXgboost.ts:136` — same
- `scripts/recompute_ml_scores.py:87` — same
- `scripts/export_xgboost.py:51` exports raw dumps with no compensation, alongside `"learning_rate": …`

Effect: margins are scaled to ~1% of intended size; outputs collapse toward the base rate. The exported `ML_SCORE_MIN/MAX = [0.262, 0.466]` ("learned from training data distribution", `detectionEngine.ts:1495-1496`) is itself an artifact of this bug — the compressed band of the broken scorer, not a property of the model. Python recompute and TS share the bug, so dataset values are *consistently* wrong rather than inconsistently wrong.

Fix: remove the multiplication at all three inference sites (or divide leaves by η at export). Re-derive `ML_SCORE_MIN/MAX` afterward.

### C2 — Transaction model adds base_score=0.5 into log-odds space
XGBoost adds `logit(base_score)` to the margin; for default `base_score=0.5` that contribution is **0**. `train_transaction_model.py:302-306` falls back to exporting the raw probability `0.5` when the booster attr is absent (newer XGBoost doesn't store it as an attr); `transactionXgboost.ts:139` then adds it directly: `sigmoid(logOdds + 0.5)`.

Effect: every transaction prediction starts at σ(0.5) ≈ **62%** before any tree contributes. Combined with C1 (contributions squashed to ±~0.3), most transactions land ~45–72% → `FLAG_THRESHOLD = 55.1` (`transactionScorer.ts:24`) flags a huge share of traffic. The account model exports `base_score: 0.0`, so the two predictors disagree semantically about what `base_score` means.

Fix: export `logit(base_score)` (i.e., 0 for 0.5), or stop adding it in TS.

### C3 — The XGBoost models never actually run at runtime
Both sync entry points depend on module-level caches populated only by async loaders:

- `computeMLScoreSync()` requires `cachedModel` set by `loadModel()` (`xgboostPredictor.ts:268`)
- `computeTransactionRiskSync()` requires its cache set by `loadTransactionModel()` (`transactionXgboost.ts:212`)

Grep across `src/`: **nothing calls `loadModel()`, async `computeMLScore()`, or `initTransactionModel()` before these sync paths.** `runDetection()` calls `computeMLScoreSync` / `scoreAllTransactions` directly (`detectionEngine.ts:1489, 1644`). On every cold serverless instance the cache is null → **every account score comes from `weightedFallbackScore` and every transaction score from `weightedFallback`**, silently (the fall-through return isn't a warning path).

Fix: preload at route entry (`await loadModel()` in the detect route), or statically import the JSON into the server bundle — removes fetch + TTL entirely.

### C4 — Label leakage end-to-end; AUC = 1.000000 is an artifact
- Account labels: `y = df["is_mule"]` (`export_xgboost.py:100`). In `build_real_mules.py`, `is_mule=True` **is defined as** "appears in a CSV row tagged with a fraud pattern" — and the hand-built features (fan-in counts, `pass_through_ratio`, degree) re-encode exactly that construction. The trees confirm: effectively every split is `hub_score > 1.7e-10` → `account_age_days < 93` — "young account with zero graph metrics" = mule, because `build_real_mules.py:133-135` hard-zeros `pagerank/hub_score/authority_score` on mule rows.
- Transaction labels: `label = txn.flagged` (`train_transaction_model.py:133`), where `flagged` was assigned by the same generator whose rules produce the features (`receiver_risk`, `calibrated_score`, …).
- Downstream records admit it: `_learned_weights.json` → `ml_score_separable: true, "0.618-1.0 vs 0.0-0.221"`; `auto_calibrate_thresholds.py` prints "non-mules: 0.141 (all same value)". Perfect separation on generated data proves the generator leaked, not that the model generalizes. All reported metrics (CV AUC 1.0, Youden J, F1 tables) are in-sample on circular data.

### C5 — "calibrated_score" means three different things; thresholds are applied to the wrong one
1. **Dataset** (`recompute_ml_scores.py:141-142`): `calibrated_score := minmax(ml_raw, 0.262..0.466)` — the script computes `platt_scale(ml_raw)` and discards it (used only for change-counting, line 155).
2. **Engine** (`detectionEngine.ts:1514`): `calibrateScore(ensemble)` with Platt A=-39.8078, B=12.6312 — parameters fitted in `combine_ml_params.py:50-54` on `norm(risk_score)` (the **legacy** risk score), not on the ensemble.
3. **Docstrings**: `recompute_ml_scores.py:17-18` claims "must match mlModel.ts calibrateScore" with A=-4.0/B=2.0; `mlModel.ts:198-211` documents A=-4/B=2 while the code uses -39.8078/12.6312.

Consequence: thresholds {0.551, 0.640, 0.671} were percentiles of definition #1 but are compared against definition #2. Inverting `σ(39.81·s − 12.63) ≥ th`, the effective cut-points on the ensemble scale:

| Level | Nominal th | Effective ensemble cut |
|---|---|---|
| medium / is_mule | 0.551 | **0.3225** |
| high | 0.640 | **0.3318** |
| critical | 0.671 | **0.3352** |

A 0.013-wide band decides medium vs high vs critical — ±0.005 drift in behavioral/community components flips levels. Seeded rows carry definition #1 scores with `is_mule` from definition #1 (`recompute_ml_scores.py:144-153` derives risk purely from ml_normalized, ignoring behavioral/graph/community), so stored data and live recomputation disagree for borderline accounts.

### C6 — Train/serve feature mismatch (account model)
Runtime builds the 16-vector at `detectionEngine.ts:1471-1488`:
- `hub_score ← prScore` (normalized risk-propagation value), `authority_score ← betweenness_centrality`. Training-time `pagerank/hub/authority` were networkx-style metrics — and **zero for every positive example** (C4). Real graphs give nearly every connected account hub > 1.7e-10 → right branch → negative leaves: the learned rule fires on almost nobody at runtime.
- `kyc_status: 1, account_type: 0` are fabricated defaults; training rows had mules at `kyc_status="0", account_type="1"` (`build_real_mules.py:117-118`).

### C7 — Meta-learner weights don't correspond to the components they multiply
`train_meta_learner.py:31-40` builds columns `[behavioral_score, graph_score, txn_velocity_per_day, risk_score, ml_score, b*g]` but names them `[BEHAVIORAL, GRAPH, TEMPORAL, COMMUNITY, ML_MODEL, INTERACTION]`. The shipped `COMMUNITY: 0.2032` was fitted against legacy `risk_score`, not `computeCommunityScore()`; "TEMPORAL" was txn_velocity; "INTERACTION" was a product of two scores, not `interactionScore()`. GRAPH/TEMPORAL/INTERACTION landed at 0 and were dropped, hiding the mismatch. Weights were also fitted on the full leaked dataset (C4).

### C8 — Dataset regeneration scripts overwrite calibrated fields with one hand formula
`build_real_mules.py:97-103,142-145`: `risk_score == behavioral_score == ml_score == calibrated_score == 55 + min(28, degree·1.5) (+10 if multi-pattern)`. Any later "learning" over these columns fits noise onto a deterministic formula. `graph_score` is capped ≤5.0 vs ≤100 elsewhere, then min-max normalized away.

---

## HIGH

### H1 — Split comparison `<=` vs XGBoost's `<`
XGBoost routes `value < threshold` left. All three traversals use `val <= thresh` (`xgboostPredictor.ts:122`, `transactionXgboost.ts:110`, `recompute_ml_scores.py:77`). Integer-valued features hit exact thresholds in the dumps (`out_txn_count @ 2.0`, `unique_receivers @ 13.0`, `account_age_days @ 93.0`) — boundary samples take the wrong branch, flipping per-tree contributions.

### H2 — Inconsistent NaN policy between languages
Python follows `missing` branches for non-finite values. TypeScript abandons the model instead: any non-finite feature → warn + fallback (`xgboostPredictor.ts:256-266`) or silent zero-fill + heuristic (`transactionXgboost.ts:203-210`). One NaN discards 200 trees of work.

### H3 — Evaluation hygiene
`train_transaction_model.py:183-198`: CV AUC is legitimate (fresh clones), but the classification report/confusion matrix come from full-training-set predictions ("Full-data predictions") — optimistic by construction, printed beside CV numbers as if comparable. With C4, none of the metrics estimate production behavior.

### H4 — Dead/duplicated code paths
- `generateAlerts()` (`detectionEngine.ts:1292-1372`) with curated severity templates is **never called** — `runDetection` uses `generateMLAlerts()` (:1673), which stringifies pattern details as JSON and stamps `Date.now()` into IDs, abandoning the deterministic hash-based `ALT-` IDs.
- `analyzeTemporalEvolution` receives a single synthetic observation (`detectionEngine.ts:1565-1569`) → Markov matrix, trend detection, `days_to_suspicious` can never activate. The MuleTrack layer is dormant.
- Duplicate `MLFeatures` declarations (`xgboostPredictor.ts:164` 16-field, :240 7-field) merge silently via TS declaration merging — harmless today, a trap on first edit.

### H5 — Fallback scorers distort distributions (and are the production path)
`weightedFallbackScore` normalizes hub as `min(hub/0.001, 1)` (`xgboostPredictor.ts:214`) — saturates for any nonzero PageRank, adding +0.20 baseline for nearly everyone. Per C3 this fallback *is* the live scorer, so its quirks are production behavior.

---

## MEDIUM

- **M1**: `public/ml_params.json` is written by `combine_ml_params.py` but loaded by nothing; values were hand-copied into `detectionEngine.ts`/`mlModel.ts` and have drifted from docstrings. Consume it at runtime or delete it.
- **M2**: `computePageRank` isn't PageRank (per-iteration personalization injection, flagged-edge anomaly weighting, min-max normalization). Fine as a heuristic; the name oversells it in a SIH context where judges may probe.
- **M3**: `centralityApproximation` divides by `n*0.5`; `calculateRiskScores` averages seven features on incompatible scales (centrality×100 dominates) then ×8 — arbitrary scaling chains feeding `risk_score_graph` into features and explanations.
- **M4**: `FLAG_THRESHOLD=55.1` inherits percentile logic from account-score distributions; after C1/C2 fixes the transaction score spread changes completely and needs recalibration.
- **M5**: `getFeatureImportances()` fallback lists use display names ("Hub Score") while the live path returns feature keys — inconsistent label styling depending on whether the model loaded.

---

## WHAT'S SOLID

Pattern detectors (fan-in/out, structuring with threshold bands, cycle DFS with caps, burst/automation timing) are reasonable and bounded; iterative tree traversals avoid stack overflow; deterministic alert hashing was a good instinct; rate limiting and the proxy matcher are fine; `markovModel.ts` correctly removed its own label-leakage bug (the `isMule` parameter) with an honest comment. Problems concentrate in model export/inference fidelity and calibration bookkeeping, not surrounding engineering.

## RECOMMENDED FIX ORDER

1. **C1/C2/H1** — remove double-η, export `logit(base_score)`, use `<`. Mechanical (~30 lines across 5 files); re-export both models.
2. **C3** — preload models (static import preferred over fetch+TTL). Verify with a log line that the model path executes.
3. Re-derive `ML_SCORE_MIN/MAX` and `FLAG_THRESHOLD` from fixed-inference outputs; **C5** — pick ONE definition of `calibrated_score`, fit Platt on the quantity it calibrates, make `recompute_ml_scores.py` write what it claims.
4. **C7** — fix meta-learner column mapping, or drop the zero-weight components and present the ensemble honestly as BEHAVIORAL + COMMUNITY + ML.
5. **C4/C6** — rebuild training data without circularity (labels independent of the feature-generating rules; real graph metrics for all rows), or explicitly position the system as a rules+heuristics demonstrator and stop reporting AUC figures.
6. **H4** — wire `generateAlerts` back in (templates are better copy than JSON dumps) or delete it; feed the Markov model real history or cut it.
