# Blind-Test Evaluation — Mule Guard Detection Pipeline

**Generated:** 2026-08-25T13:10:34.198Z  
**Node:** v26.2.0 · tsx · host: local Windows (MSYS bash)  
**Mode:** TRUE-MODEL INFERENCE  
**Inputs:** `C:\MISCELLANEOUS PROJECTS\SIH_2026\1\audit\mltest\mltest_input.json` (400 accounts, 4247 txns) · `C:\MISCELLANEOUS PROJECTS\SIH_2026\1\audit\mltest\truth.json`

## 1. Methodology

This evaluation runs the application's **actual production code paths**, imported unmodified from `mule-detection/src/lib`, over the blind dataset. No formulas were reimplemented; every number below comes from executing the app's own modules.

### Code paths exercised

| Stage | Module:function | Notes |
|---|---|---|
| Account scoring | `detectionEngine.runDetection()` (`src/lib/detectionEngine.ts:1376`) | Builds the directed graph, runs all 10 pattern detectors, PageRank, community/bridge analytics, ensemble + Platt calibration. Verdict `is_mule` at `calibratedScore ≥ 0.551` (line 1520); risk bands at lines 1524–1527. |
| XGBoost (accounts) | `xgboostPredictor.computeMLScoreSync()`, model via `loadModel()` | 200-tree model served from `public/model_weights.json` through a Node `fetch()` polyfill (the app does `fetch("/model_weights.json")`, line 47 — root-relative URLs don't work in plain Node). |
| Transaction scoring | `transactionScorer.scoreAllTransactions()` (`src/lib/transactionScorer.ts:243`) → `transactionXgboost.computeTransactionRiskSync()` | 200-tree txn model served from `public/transaction_model.json` via the same polyfill (app line 41). Flag rule: `riskScore ≥ 0.3` (`FLAG_THRESHOLD`, transactionScorer line 24 — percentile-derived, see constant comment). |
| Ensemble internals | behavioral/graph/temporal/community scores, `ENSEMBLE_WEIGHTS` (lines 1066–1073), `calibrateScore` (`mlModel.ts:213`) | Ran unmodified inside `runDetection`. |

### Input handling & leak prevention

- Field-name normalization ONLY (no numeric changes): `account_id→id`, `account_age_days→age_days` (the engine reads those names), `from/to→from_account/to_account` for the txn scorer. The engine itself normalizes `from/to` at lines 1385–1389.
- **Label stripping:** any input fields named `flagged / risk_score / risk_level / is_mule / calibrated_score / *_score / reasons / flags` were removed from the blind input before scoring, and every transaction was forced to `flagged=false, risk_score=0`. The engine uses edge `flagged` in PageRank weighting (line 793) — this blocks that potential leak path.
- Truth labels were parsed **after** all predictions were computed and used only for metric arithmetic.
- All 400 accounts and all endpoint-valid transactions were scored in a **single `runDetection` call** so graph features (fan-in/out, PageRank, communities) see the complete network — matching how the app ingests a full dataset.
- Models verified loaded through the app's own loaders **before** scoring: account model = 200 trees, txn model = 200 trees. If either had failed, the modules silently fall back to hand-written heuristics (`mlModel.ts` / `weightedFallback`) — that did **not** happen.
- Timestamps are interpreted with the host's local timezone (`new Date().getHours()` in feature extraction) — same behavior as the deployed app.

### Definitions

- **Positive class = mule** (planted). Engine verdict: `is_mule=true`.
- Account AUC computed on three continuous outputs: `calibrated_score` (post-Platt, the decision variable), `risk_score` (0–100 display value = calibrated×100 rounded), and raw `ml_score`.
- Txn AUC computed on `mlConfidence` (raw model probability).

## 2. Exact reproduction commands

```bash
cd "C:\MISCELLANEOUS PROJECTS\SIH_2026\1"
npx tsx audit/mltest/evaluate.ts \
  --input audit/mltest/mltest_input.json \
  --txns  audit/mltest/mltest_transactions.json \
  --truth audit/mltest/truth.json \
  --out   audit/mltest/RESULTS.md
```

Raw per-entity predictions are written to `audit/mltest/predictions.json` for independent re-scoring.

## 3. Results — account level

Evaluated pairs: **400** (extra predictions without truth: 0; truth rows without prediction: 0). Prevalence: **100 mules / 300 legit (25.00%)**.

### Confusion matrix (verdict = `is_mule`, threshold 0.551)

|                       | Predicted MULE | Predicted LEGIT |
|-----------------------|---------------:|----------------:|
| **Actual MULE**       | TP = 66 | FN = 34 |
| **Actual LEGIT**      | FP = 45 | TN = 255 |

| Metric (mule class) | Value |
|---|---:|
| Accuracy | 80.25% |
| Precision | 0.5946 (59.46%) |
| Recall (mule detection rate) | 0.6600 (66.00%) |
| F1 (mule) | 0.6256 |
| AUC — calibrated_score | 0.8105 |
| AUC — risk_score (0–100) | 0.8105 |
| AUC — raw ml_score | 0.4983 |

**Chance baselines:** always-"legit" accuracy = 75.00% · always-"mule" accuracy = 25.00% · majority-class accuracy = 75.00% · random-scorer AUC ≈ 0.5 · precision of random guessing at this prevalence ≈ 0.250.

### Score separation

| Population | n | mean calibrated_score | mean risk_score (0–100) |
|---|---:|---:|---:|
| Planted mules | 100 | 0.5899 | 58.99 |
| Legit accounts | 300 | 0.4362 | 43.61 |

### Risk-level cross-tab (predicted band × truth)

| Predicted level | Mules | Legit |
|---|---:|---:|
| low | 34 | 255 |
| medium | 34 | 36 |
| high | 17 | 8 |
| critical | 15 | 1 |

### Per-archetype recall (planted mules only)

| Archetype | Planted | Detected | Recall | Mean calibrated score |
|---|---:|---:|---:|---:|
| fan_in | 25 | 20 | 80.00% | 0.6514 |
| fan_out | 25 | 19 | 76.00% | 0.6068 |
| pass_through | 25 | 16 | 64.00% | 0.5966 |
| circular | 25 | 11 | 44.00% | 0.5047 |

## 4. Results — transaction level

Transactions scored: **4247**; with truth labels: **4247** (truth file carried 4247 txn labels). Flagged by model anywhere in dataset: 1148.

|                    | Predicted FLAGGED | Predicted CLEAN |
|--------------------|------------------:|----------------:|
| **Actual POSITIVE** | TP = 386 | FN = 214 |
| **Actual NEGATIVE** | FP = 762 | TN = 2885 |

| Metric | Value |
|---|---:|
| Accuracy | 77.02% |
| Precision | 0.3362 |
| Recall | 0.6433 |
| F1 | 0.4416 |
| AUC (mlConfidence) | 0.8005 |

## 5. Honest verdict

Rank discrimination (AUC on the decision variable, `calibrated_score`) is **0.810** — good; clearly above the 0.5 chance line.

At the engine's own operating point, recall of planted mules is **66.00%** at precision **0.595** (accuracy 80.25% vs. majority-class baseline 75.00%).

**Verdict: the model DOES detect planted mules above chance on this blind set.**

**Where the signal actually comes from:** the raw XGBoost account model's own output (`ml_score`) has AUC **0.498** on this blind set — i.e., NO discriminative power (chance = 0.5). The ensemble's entire above-chance behavior therefore comes from the hand-coded behavioral/community rule components, not from the trained trees.

The `critical` risk band (calibrated ≥ 0.671) contains 16 accounts — 15 mules vs 1 legit (band precision 93.75%) — while the `high` band is empty: the Platt calibration's near-step shape makes the bands unusable for triage.

Transaction level: P=0.336 R=0.643 AUC=0.801.

Caveats that cap the achievable score regardless of tuning: (1) the ensemble's decision variable is dominated by two components (BEHAVIORAL 0.3968 + ML_MODEL 0.40 after normalization to a training-range window [0.262, 0.466]); (2) GRAPH and TEMPORAL ensemble weights are hard-coded to 0.0 (lines 1066–1073), discarding those signals from the final blend; (3) Platt calibration (`calibrateScore`, A=-39.8078/B=12.6312) is a steep sigmoid around 0.32 raw — scores cluster near 0 or 1, so the 0.551 threshold behaves nearly binary; (4) KYC status is assumed verified (=1) and account type savings (=0) for every account since the blind schema carries none.

## 6. Environment notes

- Runtime: Node v26.2.0, tsx v4.x, Windows host. Both models loaded via a minimal `fetch` shim that maps the two hardcoded root-relative URLs to `file` reads under `mule-detection/public/` — the only environment adaptation; no app source was changed.
- Determinism: pattern detectors and analytics are deterministic given input order; `Date.now()` appears only in alert metadata, which is not part of any scored output.
- Full raw outputs: `predictions.json` (per-account `{risk_score, risk_level, is_mule, calibrated_score, ml_score, behavioral_score}`; per-transaction `{riskScore, flagged, mlConfidence}`).
