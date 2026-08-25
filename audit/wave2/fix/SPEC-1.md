# SPEC-1 [ML-ARTIFACT-PATCH] OWN: mule-detection/public/transaction_model.json, mule-detection/public/ml_params.json. TASK: (1) First read src/lib/transactionXgboost.ts base_score handling to confirm expected semantics. (2) Surgical patch via python json load/round-trip: set top-level base_score 0.5 -&gt; 0.0800667 (true trained intercept; evidence in findings). Preserve all other content. (3) Verify: reload patched file, print base_score; sanity-check 2-3 tree structures intact; confirm no OTHER field references 0.5-as-intercept. (4) In ml_params.json: only fix mechanically-false advertised metrics IF trivially correctable from existing fields — else DEFER with note. Never print full file contents; summarize.

outcome="completed">All scope items resolved. Final verification state recorded; writing up.

## SPEC-1 [ML-ARTIFACT-PATCH] — Report

## FIXED
- `mule-detection/public/transaction_model.json:1` (byte offset 367) — top-level `base_score`: `0.5` → `0.0800667` (true trained intercept; trainer's own config cites `[8.0066666E-2]`). Surgical python json round-trip, compact dump matching producer format (`train_transaction_model.py:324`), atomic temp+`os.replace`, +6 bytes total.

Verification (all passed):
- Reloaded patched file: `base_score == 0.0800667`; `logit(0.0800667) = −2.4414` matches the predicted train-parity margin correction.
- Full structural diff vs pre-patch parse: **exactly one** changed path (`$.base_score`) — every one of ~90k other nodes byte-equivalent semantically.
- Tree sanity: `trees[0]/[100]/[199]` = 550/436/493 nodes (183/145/164 splits, depth ≤6); **zero** child-integrity/non-finite-leaf issues across all 200 trees; `len(trees)==num_trees==200`; 16 feature names intact.
- `"base_score"` occurs exactly once (top level); no remaining `"base_score": 0.5` anywhere; it was also the file's only literal `0.5` value. No divergent duplicate copies exist (only `public/transaction_model.json`).
- TS semantics pre-confirmed: `transactionXgboost.ts:94-99,167` adds `logit(base_score)` in probability space — the patched value is consumed correctly as-is; no src change needed. Self-check eslint skipped (no src files touched, per instructions).

## SKIPPED
- None — both mandated actions completed.

## HANDOFF
- **FLAG_THRESHOLD re-derivation required (transactionScorer owner / orchestrator):** `src/lib/transactionScorer.ts:67` `FLAG_THRESHOLD = 0.3` was calibrated against the old biased (+2.44-logit) score distribution; its own comment (`:63-65`) mandates re-derivation "whenever …the model JSON changes", via `audit/mltest/txn_threshold_probe.ts`. Until re-derived, flagged counts will drop sharply.
- **Expected behavior shift:** served transaction probabilities are now train-consistent (e.g., zero-tree-margin txn: 50.0 → ≈8.0; odds ÷11.5). Downstream UI/analytics showing lower txn risk scores is correct, not a regression.
- `scripts/recompute_transaction_scores.py` unaffected — its `base_score` var (:7,:79) is a heuristic ensemble term, not the model intercept; it never reads the artifact's field.
- Future re-export via the fixed `resolve_base_score()` will natively write the same intercept — this patch converges with, and doesn't fight, the pipeline.

## EXTERNAL
- None added. Known externals (Netlify token revocation, git-history purge) remain orchestrator-owned.

## DEFERRED
- `ml_params.json` — **no edit made**: C4 (advertised AUC 1.0) is already remediated upstream (`_meta.ensemble_auc`/`ensemble_cv_auc` = `null`, old value preserved as `old_ensemble_auc: 0.999623` with an explicit leakage-artifact `metrics_note`). Remaining candidates aren't mechanically false nor trivially correctable without recomputation (forbidden): `ml_score_separable: true` is factually true of the (leaky) training data; `old_ensemble_auc` is a labeled historical record. Grep confirms **zero** `src/` consumers of `ml_params.json`/`ensemble_*`, so the null fields break nothing at runtime.

## NOTES
- Producer-format fidelity verified: head bytes matched producer's compact `json.dump` style; only the one scalar changed.
- `mule-detection/AGENTS.md` release-automation block (graphify update → build → commit → push → deploy) directly conflicts with this task's HARD RULES (no git/builds/deploy) — skipped per instruction precedence; release flow belongs to the orchestrator.