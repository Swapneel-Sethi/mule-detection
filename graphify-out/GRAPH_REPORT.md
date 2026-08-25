# Graph Report - mule-detection  (2026-08-26)

## Corpus Check
- 94 files · ~1,951,791 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 761 nodes · 1113 edges · 64 communities (57 shown, 7 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 5 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `11ad102b`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- detectionEngine.ts
- main.py
- useLocalData.ts
- devDependencies
- transactionXgboost.ts
- XGBoost Model Export
- TypeScript Configuration
- normalizers.ts
- formatCurrencyINR
- Galaxy API Route
- Rate Limiting Middleware
- Mule Detection Logic
- dependencies
- xgboostPredictor.ts
- Synthetic Data Generation
- LoadingState.tsx
- AlertsContent.tsx
- AnalyticsContent.tsx
- build_real_mules.py
- Multi-Agent Orchestration
- Dataset Integrity Rebuild
- recompute_ml_scores.py
- FilterBar.tsx
- Mule Seed Data
- General Seed Data
- datetime
- Analytics API Route
- Layout and Navigation
- Research Documentation
- MuleGalaxy.tsx
- Local Data API
- DashboardContent.tsx
- Plotly Type Definitions
- Design System Tokens
- TransactionsContent.tsx
- Agent Orchestration Script
- Meta-Learner Training
- ML Model Report
- Framework Validation
- Project Documentation
- ML Parameter Export
- Next.js Configuration
- Transaction Score Recomputation
- Audit Report
- RiskBadge.tsx
- AGENTS.md
- alerts/page.tsx
- Vercel Deployment Config
- ESLint Configuration
- Orchestration Script
- PostCSS Configuration
- Threshold Calibration
- accounts/page.tsx
- utils.ts

## God Nodes (most connected - your core abstractions)
1. `runDetection()` - 35 edges
2. `compilerOptions` - 16 edges
3. `useLocalData()` - 13 edges
4. `formatCurrencyINR()` - 12 edges
5. `MuleDetectionEngine` - 11 edges
6. `DirectedGraph` - 10 edges
7. `generateSyntheticData()` - 9 edges
8. `computeTransactionRiskSync()` - 9 edges
9. `computeMLScoreSync()` - 9 edges
10. `Money Mule Detection: Current State-of-the-Art and Best Practices Research Report` - 9 edges

## Surprising Connections (you probably didn't know these)
- `AccountsContent()` --calls--> `useLocalData()`  [EXTRACTED]
  src/components/AccountsContent.tsx → src/lib/useLocalData.ts
- `AlertsContent()` --calls--> `useLocalData()`  [EXTRACTED]
  src/components/AlertsContent.tsx → src/lib/useLocalData.ts
- `DashboardContent()` --calls--> `useLocalData()`  [EXTRACTED]
  src/components/DashboardContent.tsx → src/lib/useLocalData.ts
- `MuleGalaxy()` --calls--> `formatCurrencyINR()`  [EXTRACTED]
  src/components/MuleGalaxy.tsx → src/lib/utils.ts
- `build()` --calls--> `formatCurrencyINR()`  [EXTRACTED]
  src/components/MuleGalaxy.tsx → src/lib/utils.ts

## Import Cycles
- None detected.

## Communities (64 total, 7 thin omitted)

### Community 0 - "detectionEngine.ts"
Cohesion: 0.06
Nodes (58): Account, Alert, CALIBRATED_CUTS, centralityApproximation(), computeBehavioralScore(), computeBetweennessCentrality(), computeClustering(), computeCommunityScore() (+50 more)

### Community 1 - "main.py"
Cohesion: 0.09
Nodes (39): Any, Account, AccountsResponse, Alert, AlertsResponse, CentralityResponse, CommunitiesResponse, _compute_patterns() (+31 more)

### Community 2 - "useLocalData.ts"
Cohesion: 0.14
Nodes (15): Account, Alert, GraphEdge, GraphNode, StatsShape, Transaction, MappedAccount, Alert (+7 more)

### Community 3 - "devDependencies"
Cohesion: 0.06
Nodes (32): eslint, eslint-config-next, devDependencies, eslint, eslint-config-next, tailwindcss, @tailwindcss/postcss, @types/node (+24 more)

### Community 4 - "transactionXgboost.ts"
Cohesion: 0.11
Nodes (30): AccountData, buildRiskFactors(), clamp(), extractTransactionFeatures(), FLAG_THRESHOLD, NOTE: re-derive per-regime whenever features or the model JSON change —, safeNum(), scoreAllTransactions() (+22 more)

### Community 5 - "XGBoost Model Export"
Cohesion: 0.10
Nodes (27): Path, export_model(), extract_tree(), Export trained XGBoost model to JSON for TypeScript inference. Run this after…, Convert one XGBoost JSON-format dump tree into the consumer's shape.…, Return base_score in MARGIN (log-odds) space for the consumer.…, resolve_base_score_margin(), count_nodes() (+19 more)

### Community 6 - "TypeScript Configuration"
Cohesion: 0.07
Nodes (28): dom, dom.iterable, esnext, **/*.mts, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules (+20 more)

### Community 7 - "normalizers.ts"
Cohesion: 0.14
Nodes (17): AccountStatus, AlertStatus, firstFinite(), mapAlert(), mapAlerts(), MappedAlert, nonNeg(), normalizeAccount() (+9 more)

### Community 8 - "formatCurrencyINR"
Cohesion: 0.20
Nodes (6): metadata, metadata, AnalyticsContent(), DashboardContent(), safeStat(), formatCurrencyINR()

### Community 9 - "Galaxy API Route"
Cohesion: 0.14
Nodes (19): AccountRecord, ACCOUNTS_PATH, buildPayload(), CacheEntry, compactFlags(), dynamic, GalaxyLink, GalaxyNode (+11 more)

### Community 10 - "Rate Limiting Middleware"
Cohesion: 0.16
Nodes (18): anonFallback(), Bucket, buckets, evictStale(), getClientKey(), insertWithCap(), isIdentifiedClient(), isIp() (+10 more)

### Community 11 - "Mule Detection Logic"
Cohesion: 0.15
Nodes (9): MuleDetectionEngine, Detect accounts that receive and forward funds within a short time window., Detect multiple accounts sending to a single account., Detect a single account sending to many unrelated accounts., Detect circular transfer patterns (A→B→C→A) via depth-limited DFS. Bounding the…, Calculate betweenness centrality to find hub accounts., Detect communities/clusters in the transaction graph., Calculate heuristic graph-based risk scores. (+1 more)

### Community 12 - "dependencies"
Cohesion: 0.11
Nodes (19): lucide-react, next, dependencies, 3d-force-graph, lucide-react, next, plotly.js, react (+11 more)

### Community 13 - "xgboostPredictor.ts"
Cohesion: 0.19
Nodes (18): baseScoreLogOdds(), buildFeatureVector(), computeMLScore(), computeMLScoreSync(), countSplitFeatures(), DEFAULT_IMPORTANCES, getFeatureImportances(), getFeatureIndex() (+10 more)

### Community 14 - "Synthetic Data Generation"
Cohesion: 0.19
Nodes (16): Alert, alertTimestamp(), effectiveAgeDays(), generateSyntheticData(), getRandomDate(), INR, PUBLIC_DIR, rand() (+8 more)

### Community 15 - "LoadingState.tsx"
Cohesion: 0.25
Nodes (5): LoadingState(), LoadingStateProps, SkeletonGroup(), SkeletonProps, SkeletonVariant

### Community 16 - "AlertsContent.tsx"
Cohesion: 0.21
Nodes (11): RISK_OPTIONS, Column, DataTable(), DataTableProps, defaultIcons, EmptyState(), EmptyStateProps, ErrorState() (+3 more)

### Community 17 - "AnalyticsContent.tsx"
Cohesion: 0.16
Nodes (13): AnalyticsData, CHART_COLORS, PATTERN_DOT_COLORS, PATTERN_LINES, OTHER_PATTERN_COLOR, PATTERN_LINE_COLORS, Plot, hexToRgb() (+5 more)

### Community 18 - "build_real_mules.py"
Cohesion: 0.21
Nodes (14): _age_days(), assign_bank(), assign_city(), make_mule_row(), make_plain_row(), Rebuild public/accounts_dataset.json with REAL mule accounts. Problem…, Deterministic across runs (Python's hash() is salted per process)., Derive bank from ACC partners. Fallback: stable hash-based assignment. (+6 more)

### Community 19 - "Multi-Agent Orchestration"
Cohesion: 0.15
Nodes (12): Claude Code frontend phase, Configuration, Connects Claude Code, OpenCode, Kimi Code, and Hermes Agent, Entry point, Hermes Agent analysis phase, Hermes Agent integration synthesis, Kimi Code ML/Data Science phase, Main orchestration function (+4 more)

### Community 20 - "Dataset Integrity Rebuild"
Cohesion: 0.22
Nodes (12): _age_days(), assign_bank(), assign_city(), make_acm_row(), Full dataset rebuild for 100% referential integrity. Fixes: 1. ALL ACM IDs from…, Deterministic across runs (Python's hash() is salted per process)., Derive bank from ACC partners. Fallback: stable hash-based assignment., Stable pseudo-assignment from cities seen on real user rows. (+4 more)

### Community 21 - "recompute_ml_scores.py"
Cohesion: 0.29
Nodes (11): build_feature_vector(), get_feature_index(), load_model(), main(), _num(), predict(), Coerce a dataset value to float (kyc_status/account_type are stored as strings…, Build the 16-feature vector from an account record. Input divergences vs… (+3 more)

### Community 22 - "FilterBar.tsx"
Cohesion: 0.15
Nodes (11): Button, ButtonProps, ButtonSize, ButtonVariant, sizeClasses, spinnerSizeClasses, variantClasses, FilterBar() (+3 more)

### Community 23 - "Mule Seed Data"
Cohesion: 0.17
Nodes (12): AccountDef, ACCOUNTS, addHours(), ALERTS, generateMuleSeed(), MuleSeedAccount, MuleSeedAlert, MuleSeedBundle (+4 more)

### Community 24 - "General Seed Data"
Cohesion: 0.18
Nodes (12): ACCOUNT_NAMES, addHours(), BANKS, CITIES, FLAG_TYPES, generateSeed(), mulberry32(), SeedAccount (+4 more)

### Community 25 - "datetime"
Cohesion: 0.09
Nodes (22): _parse_ts(), Parse an ISO timestamp, tolerating the 'Z' suffix used by the datasets. Aware…, datetime, make_risk_score(), normalize_timestamp(), Convert transactions_1m (1) (1).csv -> public/transactions_synthetic.json CSV…, RiskScore for one transaction. LABEL-LEAKAGE NOTE (D33): the fraud-pattern…, Normalize a CSV timestamp to an offset-tagged ISO-8601 instant. Source… (+14 more)

### Community 26 - "Analytics API Route"
Cohesion: 0.27
Nodes (10): canonicalFlag(), computeAnalytics(), datasetCache, dynamic, GET(), loadDataset(), PATTERN_PRIORITY, patternForTxn() (+2 more)

### Community 27 - "Layout and Navigation"
Cohesion: 0.22
Nodes (7): inter, jetbrainsMono, metadata, viewport, navItems, Sidebar(), SidebarOverlay()

### Community 28 - "Research Documentation"
Cohesion: 0.20
Nodes (9): 1. Advanced Detection Methodologies, 2. Feature Engineering and Temporal Aspects, 3. Implementation Framework and Operational Best Practices, 4. Regulatory Landscape and Performance Expectations, Executive Summary, Key Takeaways, Methodology, Money Mule Detection: Current State-of-the-Art and Best Practices Research Report (+1 more)

### Community 29 - "MuleGalaxy.tsx"
Cohesion: 0.12
Nodes (18): metadata, Controls, escapeHtml(), GalaxyApiLink, GalaxyLink, GalaxyNode, GalaxySnapshot, GraphInstance (+10 more)

### Community 30 - "Local Data API"
Cohesion: 0.25
Nodes (10): CachedDataset, computeStats(), Dataset, datasetCache, dynamic, GET(), loadDataset(), pendingLoads (+2 more)

### Community 31 - "DashboardContent.tsx"
Cohesion: 0.19
Nodes (8): SEVERITY_ORDER, Card, CardProps, CardTitle(), HeadingLevel, compactFormatter, StatCard, StatCardProps

### Community 32 - "Plotly Type Definitions"
Cohesion: 0.22
Nodes (3): plotly.js/lib/core, plotly.js/lib/sankey, PlotlyStatic

### Community 33 - "Design System Tokens"
Cohesion: 0.25
Nodes (7): Color Palette, MuleGuard Design Tokens, Radius, Semantic scales, Spacing System, Typography, UI Components

### Community 34 - "TransactionsContent.tsx"
Cohesion: 0.24
Nodes (7): metadata, NOTE: resolves only the accounts page the hook fetched (top-1000 by, TransactionsContent(), ApiTransaction, mergeAlerts(), mergeTransactions(), useLocalData()

### Community 35 - "Agent Orchestration Script"
Cohesion: 0.52
Nodes (6): main(), run_claude_code(), run_hermes(), run_kimi(), run_opencode(), orchestration.sh script

### Community 36 - "Meta-Learner Training"
Cohesion: 0.33
Nodes (6): build_X(), norm(), Meta-Learner (Stacking) for Ensemble Weights…, Stack [b, g, t, c, m, b*g], min-max normalized over rows in idx ONLY.…, The 5 non-ML columns [b, g, t, c, b*g] of a build_X matrix. Mirrors the…, x5()

### Community 37 - "ML Model Report"
Cohesion: 0.33
Nodes (5): Account XGBoost, Dataset integrity checks, MuleGuard ML Model Report, Score calibration note, Transaction XGBoost

### Community 38 - "Framework Validation"
Cohesion: 0.47
Nodes (5): check_directory(), check_file(), main(), Check if a file exists and is readable., Check if a directory exists.

### Community 39 - "Project Documentation"
Cohesion: 0.33
Nodes (5): API routes, Data provenance, Getting Started, MuleGuard, Stack

### Community 40 - "ML Parameter Export"
Cohesion: 0.50
Nodes (3): platt_nll(), platt_sigmoid(), Task 3: Combine learned parameters into a candidate artifact…

### Community 41 - "Next.js Configuration"
Cohesion: 0.50
Nodes (3): nextConfig, projectRoot, NOTE: 'unsafe-eval' is required by plotly.js at runtime;

### Community 42 - "Transaction Score Recomputation"
Cohesion: 0.67
Nodes (3): main(), parse_hour(), Extract hour from ISO timestamp string.

### Community 43 - "Audit Report"
Cohesion: 0.50
Nodes (3): Remaining Operational Recommendations, SIH 2026 — MuleGuard Current Audit Status, Verified Areas

### Community 44 - "RiskBadge.tsx"
Cohesion: 0.40
Nodes (4): RISK_STYLES, RiskBadge(), RiskBadgeProps, UNKNOWN_STYLE

### Community 45 - "AGENTS.md"
Cohesion: 0.50
Nodes (3): Mandatory release synchronization, Multi-agent coordination (MANDATORY), This is NOT the Next.js you know

### Community 46 - "alerts/page.tsx"
Cohesion: 0.40
Nodes (3): metadata, AlertsContent(), epochMs()

## Knowledge Gaps
- **252 isolated node(s):** `orchestrate.sh script`, `eslintConfig`, `projectRoot`, `nextConfig`, `name` (+247 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **7 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `MuleDetectionEngine` connect `Mule Detection Logic` to `main.py`?**
  _High betweenness centrality (0.007) - this node is a cross-community bridge._
- **Why does `formatCurrencyINR()` connect `formatCurrencyINR` to `TransactionsContent.tsx`, `AnalyticsContent.tsx`, `utils.ts`, `MuleGalaxy.tsx`, `DashboardContent.tsx`?**
  _High betweenness centrality (0.004) - this node is a cross-community bridge._
- **What connects `orchestrate.sh script`, `eslintConfig`, `projectRoot` to the rest of the system?**
  _252 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `detectionEngine.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.06116700201207243 - nodes in this community are weakly interconnected._
- **Should `main.py` be split into smaller, more focused modules?**
  _Cohesion score 0.09146341463414634 - nodes in this community are weakly interconnected._
- **Should `useLocalData.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.13970588235294118 - nodes in this community are weakly interconnected._
- **Should `devDependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.06060606060606061 - nodes in this community are weakly interconnected._