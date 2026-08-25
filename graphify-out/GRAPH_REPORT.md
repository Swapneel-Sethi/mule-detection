# Graph Report - mule-detection  (2026-08-26)

## Corpus Check
- 94 files · ~2,305,404 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 771 nodes · 1126 edges · 63 communities (54 shown, 9 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 5 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `08e69328`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- detectionEngine.ts
- main.py
- useLocalData.ts
- devDependencies
- transactionXgboost.ts
- train_transaction_model.py
- compilerOptions
- DashboardContent.tsx
- MuleGalaxy.tsx
- mule-galaxy/route.ts
- rateLimit.ts
- MuleDetectionEngine
- dependencies
- xgboostPredictor.ts
- generate-synthetic-data.ts
- AccountsContent.tsx
- AlertsContent.tsx
- utils.ts
- build_real_mules.py
- multi-agent-orchestration.skill
- rebuild_full.py
- recompute_ml_scores.py
- FilterBar.tsx
- muleSeed.ts
- seedData.ts
- generate_synthetic_data.py
- analytics/route.ts
- layout.tsx
- Money Mule Detection: Current State-of-the-Art and Best Practices Research Report
- SankeyChart.tsx
- data-local/route.ts
- LoadingState.tsx
- PlotlyStatic
- MuleGuard Design Tokens
- generate_dataset_json.py
- orchestration.sh
- train_meta_learner.py
- MuleGuard ML Model Report
- validate_framework.py
- MuleGuard
- combine_ml_params.py
- next.config.ts
- parse_hour
- SIH 2026 — MuleGuard Current Audit Status
- RiskBadge.tsx
- AGENTS.md
- count/route.ts
- vercel.json
- eslint.config.mjs
- orchestrate.sh
- postcss.config.mjs
- auto_calibrate_thresholds.py
- verify_constellation_tmp.py

## God Nodes (most connected - your core abstractions)
1. `runDetection()` - 36 edges
2. `compilerOptions` - 16 edges
3. `useLocalData()` - 12 edges
4. `MuleDetectionEngine` - 11 edges
5. `DirectedGraph` - 10 edges
6. `generateSyntheticData()` - 9 edges
7. `computeTransactionRiskSync()` - 9 edges
8. `computeMLScoreSync()` - 9 edges
9. `Money Mule Detection: Current State-of-the-Art and Best Practices Research Report` - 9 edges
10. `_get_analysis()` - 8 edges

## Surprising Connections (you probably didn't know these)
- `useLocalData()` --indirect_call--> `normalizeAccount()`  [INFERRED]
  src/lib/useLocalData.ts → src/lib/normalizers.ts
- `useLocalData()` --indirect_call--> `mapAlert()`  [INFERRED]
  src/lib/useLocalData.ts → src/lib/normalizers.ts
- `AlertsContent()` --calls--> `useLocalData()`  [EXTRACTED]
  src/components/AlertsContent.tsx → src/lib/useLocalData.ts
- `DashboardContent()` --calls--> `useLocalData()`  [EXTRACTED]
  src/components/DashboardContent.tsx → src/lib/useLocalData.ts
- `MuleGalaxy()` --calls--> `formatCurrencyINR()`  [EXTRACTED]
  src/components/MuleGalaxy.tsx → src/lib/utils.ts

## Import Cycles
- None detected.

## Communities (63 total, 9 thin omitted)

### Community 0 - "detectionEngine.ts"
Cohesion: 0.06
Nodes (59): Account, Alert, calculateRiskScores(), CALIBRATED_CUTS, centralityApproximation(), computeBehavioralScore(), computeBetweennessCentrality(), computeClustering() (+51 more)

### Community 1 - "main.py"
Cohesion: 0.07
Nodes (45): Any, Account, AccountsResponse, Alert, AlertsResponse, CentralityResponse, CommunitiesResponse, _compute_patterns() (+37 more)

### Community 2 - "useLocalData.ts"
Cohesion: 0.07
Nodes (32): Account, Alert, GraphEdge, GraphNode, StatsShape, Transaction, AccountStatus, AlertStatus (+24 more)

### Community 3 - "devDependencies"
Cohesion: 0.06
Nodes (32): eslint, eslint-config-next, devDependencies, eslint, eslint-config-next, tailwindcss, @tailwindcss/postcss, @types/node (+24 more)

### Community 4 - "transactionXgboost.ts"
Cohesion: 0.12
Nodes (29): AccountData, buildRiskFactors(), clamp(), extractTransactionFeatures(), FLAG_THRESHOLD, NOTE: re-derive per-regime whenever features or the model JSON change —, safeNum(), scoreAllTransactions() (+21 more)

### Community 5 - "train_transaction_model.py"
Cohesion: 0.10
Nodes (27): Path, export_model(), extract_tree(), Export trained XGBoost model to JSON for TypeScript inference. Run this after…, Convert one XGBoost JSON-format dump tree into the consumer's shape.…, Return base_score in MARGIN (log-odds) space for the consumer.…, resolve_base_score_margin(), count_nodes() (+19 more)

### Community 6 - "compilerOptions"
Cohesion: 0.07
Nodes (28): dom, dom.iterable, esnext, **/*.mts, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules (+20 more)

### Community 7 - "DashboardContent.tsx"
Cohesion: 0.10
Nodes (18): metadata, metadata, AnalyticsContent(), AnalyticsData, CHART_COLORS, PATTERN_DOT_COLORS, PATTERN_LINES, DashboardContent() (+10 more)

### Community 8 - "MuleGalaxy.tsx"
Cohesion: 0.12
Nodes (18): metadata, Controls, escapeHtml(), GalaxyApiLink, GalaxyLink, GalaxyNode, GalaxySnapshot, GraphInstance (+10 more)

### Community 9 - "mule-galaxy/route.ts"
Cohesion: 0.14
Nodes (19): AccountRecord, ACCOUNTS_PATH, buildPayload(), CacheEntry, compactFlags(), dynamic, GalaxyLink, GalaxyNode (+11 more)

### Community 10 - "rateLimit.ts"
Cohesion: 0.16
Nodes (18): anonFallback(), Bucket, buckets, evictStale(), getClientKey(), insertWithCap(), isIdentifiedClient(), isIp() (+10 more)

### Community 11 - "MuleDetectionEngine"
Cohesion: 0.15
Nodes (9): MuleDetectionEngine, Detect accounts that receive and forward funds within a short time window., Detect multiple accounts sending to a single account., Detect a single account sending to many unrelated accounts., Detect circular transfer patterns (A→B→C→A) via depth-limited DFS. Bounding the…, Calculate betweenness centrality to find hub accounts., Detect communities/clusters in the transaction graph., Calculate heuristic graph-based risk scores. (+1 more)

### Community 12 - "dependencies"
Cohesion: 0.11
Nodes (19): lucide-react, next, dependencies, 3d-force-graph, lucide-react, next, plotly.js, react (+11 more)

### Community 13 - "xgboostPredictor.ts"
Cohesion: 0.20
Nodes (17): baseScoreLogOdds(), buildFeatureVector(), computeMLScore(), computeMLScoreSync(), countSplitFeatures(), DEFAULT_IMPORTANCES, getFeatureImportances(), getFeatureIndex() (+9 more)

### Community 14 - "generate-synthetic-data.ts"
Cohesion: 0.19
Nodes (16): Alert, alertTimestamp(), effectiveAgeDays(), generateSyntheticData(), getRandomDate(), INR, PUBLIC_DIR, rand() (+8 more)

### Community 15 - "AccountsContent.tsx"
Cohesion: 0.18
Nodes (10): metadata, metadata, AccountsContent(), RISK_OPTIONS, NOTE: resolves only the accounts page the hook fetched (top-1000 by, TransactionsContent(), FilterBar(), PageHeader() (+2 more)

### Community 16 - "AlertsContent.tsx"
Cohesion: 0.18
Nodes (11): metadata, AlertsContent(), epochMs(), Column, DataTable(), DataTableProps, defaultIcons, EmptyState() (+3 more)

### Community 17 - "utils.ts"
Cohesion: 0.25
Nodes (11): formatCurrency(), formatCurrencyFull(), formatDate(), formatNumber(), formatNumberFull(), formatPercent(), formatRelativeTime(), getUserLocale() (+3 more)

### Community 18 - "build_real_mules.py"
Cohesion: 0.21
Nodes (14): _age_days(), assign_bank(), assign_city(), make_mule_row(), make_plain_row(), Rebuild public/accounts_dataset.json with REAL mule accounts. Problem…, Deterministic across runs (Python's hash() is salted per process)., Derive bank from ACC partners. Fallback: stable hash-based assignment. (+6 more)

### Community 19 - "multi-agent-orchestration.skill"
Cohesion: 0.15
Nodes (12): Claude Code frontend phase, Configuration, Connects Claude Code, OpenCode, Kimi Code, and Hermes Agent, Entry point, Hermes Agent analysis phase, Hermes Agent integration synthesis, Kimi Code ML/Data Science phase, Main orchestration function (+4 more)

### Community 20 - "rebuild_full.py"
Cohesion: 0.22
Nodes (12): _age_days(), assign_bank(), assign_city(), make_acm_row(), Full dataset rebuild for 100% referential integrity. Fixes: 1. ALL ACM IDs from…, Deterministic across runs (Python's hash() is salted per process)., Derive bank from ACC partners. Fallback: stable hash-based assignment., Stable pseudo-assignment from cities seen on real user rows. (+4 more)

### Community 21 - "recompute_ml_scores.py"
Cohesion: 0.24
Nodes (12): build_feature_vector(), get_feature_index(), load_model(), main(), _num(), predict(), Build the 16-feature vector from an account record. Input divergences vs…, Iterative tree traversal. (+4 more)

### Community 22 - "FilterBar.tsx"
Cohesion: 0.17
Nodes (10): Button, ButtonProps, ButtonSize, ButtonVariant, sizeClasses, spinnerSizeClasses, variantClasses, FilterBarProps (+2 more)

### Community 23 - "muleSeed.ts"
Cohesion: 0.17
Nodes (12): AccountDef, ACCOUNTS, addHours(), ALERTS, generateMuleSeed(), MuleSeedAccount, MuleSeedAlert, MuleSeedBundle (+4 more)

### Community 24 - "seedData.ts"
Cohesion: 0.18
Nodes (12): ACCOUNT_NAMES, addHours(), BANKS, CITIES, FLAG_TYPES, generateSeed(), mulberry32(), SeedAccount (+4 more)

### Community 25 - "generate_synthetic_data.py"
Cohesion: 0.30
Nodes (11): generate_alerts(), generate_all_synthetic_data(), generate_network_transfers(), generate_transactions(), iso_utc(), random_rail(), Generate alerts based on suspicious patterns, Format dt as UTC ISO-8601 with a 'Z' suffix so JS Date parses it. Pipeline… (+3 more)

### Community 26 - "analytics/route.ts"
Cohesion: 0.27
Nodes (10): canonicalFlag(), computeAnalytics(), datasetCache, dynamic, GET(), loadDataset(), PATTERN_PRIORITY, patternForTxn() (+2 more)

### Community 27 - "layout.tsx"
Cohesion: 0.22
Nodes (7): inter, jetbrainsMono, metadata, viewport, navItems, Sidebar(), SidebarOverlay()

### Community 28 - "Money Mule Detection: Current State-of-the-Art and Best Practices Research Report"
Cohesion: 0.20
Nodes (9): 1. Advanced Detection Methodologies, 2. Feature Engineering and Temporal Aspects, 3. Implementation Framework and Operational Best Practices, 4. Regulatory Landscape and Performance Expectations, Executive Summary, Key Takeaways, Methodology, Money Mule Detection: Current State-of-the-Art and Best Practices Research Report (+1 more)

### Community 29 - "SankeyChart.tsx"
Cohesion: 0.27
Nodes (8): Plot, formatINR(), hexToRgb(), PATTERN_COLORS, PATTERN_ORDER, Plot, SankeyChart(), SankeyChartProps

### Community 30 - "data-local/route.ts"
Cohesion: 0.31
Nodes (8): computeStats(), Dataset, datasetCache, dynamic, GET(), loadDataset(), pendingLoads, toFinite()

### Community 31 - "LoadingState.tsx"
Cohesion: 0.25
Nodes (5): LoadingState(), LoadingStateProps, SkeletonGroup(), SkeletonProps, SkeletonVariant

### Community 32 - "PlotlyStatic"
Cohesion: 0.22
Nodes (3): plotly.js/lib/core, plotly.js/lib/sankey, PlotlyStatic

### Community 33 - "MuleGuard Design Tokens"
Cohesion: 0.25
Nodes (7): Color Palette, MuleGuard Design Tokens, Radius, Semantic scales, Spacing System, Typography, UI Components

### Community 34 - "generate_dataset_json.py"
Cohesion: 0.32
Nodes (5): compute_score(), parse_bool(), Salted MD5 digest as an int — unlike hash(), stable across processes., Lenient truthy parse — the features CSV casing/encoding is unverified, and a…, stable_digest()

### Community 35 - "orchestration.sh"
Cohesion: 0.52
Nodes (6): main(), run_claude_code(), run_hermes(), run_kimi(), run_opencode(), orchestration.sh script

### Community 36 - "train_meta_learner.py"
Cohesion: 0.33
Nodes (6): build_X(), norm(), Meta-Learner (Stacking) for Ensemble Weights…, Stack [b, g, t, c, m, b*g], min-max normalized over rows in idx ONLY.…, The 5 non-ML columns [b, g, t, c, b*g] of a build_X matrix. Mirrors the…, x5()

### Community 37 - "MuleGuard ML Model Report"
Cohesion: 0.33
Nodes (5): Account XGBoost, Dataset integrity checks, MuleGuard ML Model Report, Score calibration note, Transaction XGBoost

### Community 38 - "validate_framework.py"
Cohesion: 0.47
Nodes (5): check_directory(), check_file(), main(), Check if a file exists and is readable., Check if a directory exists.

### Community 39 - "MuleGuard"
Cohesion: 0.33
Nodes (5): API routes, Data provenance, Getting Started, MuleGuard, Stack

### Community 40 - "combine_ml_params.py"
Cohesion: 0.50
Nodes (3): platt_nll(), platt_sigmoid(), Task 3: Combine and export ml_params.json…

### Community 41 - "next.config.ts"
Cohesion: 0.50
Nodes (3): nextConfig, projectRoot, NOTE: 'unsafe-eval' is required by plotly.js at runtime;

### Community 42 - "parse_hour"
Cohesion: 0.67
Nodes (3): main(), parse_hour(), Extract hour from ISO timestamp string.

### Community 43 - "SIH 2026 — MuleGuard Current Audit Status"
Cohesion: 0.50
Nodes (3): Remaining Operational Recommendations, SIH 2026 — MuleGuard Current Audit Status, Verified Areas

## Knowledge Gaps
- **251 isolated node(s):** `orchestrate.sh script`, `eslintConfig`, `projectRoot`, `nextConfig`, `name` (+246 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `MuleDetectionEngine` connect `MuleDetectionEngine` to `main.py`?**
  _High betweenness centrality (0.006) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `useLocalData()` (e.g. with `mapAlert()` and `normalizeAccount()`) actually correct?**
  _`useLocalData()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `orchestrate.sh script`, `eslintConfig`, `projectRoot` to the rest of the system?**
  _251 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `detectionEngine.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.06259780907668232 - nodes in this community are weakly interconnected._
- **Should `main.py` be split into smaller, more focused modules?**
  _Cohesion score 0.07142857142857142 - nodes in this community are weakly interconnected._
- **Should `useLocalData.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07226890756302522 - nodes in this community are weakly interconnected._
- **Should `devDependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.06060606060606061 - nodes in this community are weakly interconnected._