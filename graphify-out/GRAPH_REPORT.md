# Graph Report - mule-detection  (2026-08-26)

## Corpus Check
- 94 files · ~2,297,830 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 757 nodes · 1036 edges · 71 communities (53 shown, 18 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 8 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `47c06712`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- detectionEngine.ts
- SIH 2026 - MuleGuard Comprehensive Audit Report
- main.py
- devDependencies
- compilerOptions
- transactionXgboost.ts
- dependencies
- train_transaction_model.py
- MuleGalaxy.tsx
- useLocalData.ts
- seedData.ts
- normalizers.ts
- DataTable.tsx
- TransactionsContent.tsx
- xgboostPredictor.ts
- ErrorState.tsx
- AccountsContent.tsx
- AlertsContent.tsx
- verify_constellation_tmp.py
- mockData.ts
- SankeyChart.tsx
- mule-galaxy/route.ts
- rateLimit.ts
- multi-agent-orchestration.skill
- recompute_ml_scores.py
- PlotlyStatic
- MuleGuard ML Model Report
- muleSeed.ts
- Money Mule Detection: Current State-of-the-Art and Best Practices Research Report
- layout.tsx
- generate_synthetic_data.py
- data-local/route.ts
- MekaVerse Design Tokens Documentation
- orchestration.sh
- generate-synthetic-data.ts
- validate_framework.py
- combine_ml_params.py
- rebuild_full.py
- AGENTS.md
- README.md
- generate_dataset_json.py
- parse_hour
- analytics/route.ts
- build_real_mules.py
- convert_csv_transactions.py
- train_meta_learner.py
- count/route.ts
- RiskBadge.tsx
- vercel.json
- Design Tokens
- eslint.config.mjs
- Multi-Agent Orchestration Skill
- orchestrate.sh
- next.config.ts
- postcss.config.mjs
- Next.js Logo
- Money Mule Detection Research Report
- auto_calibrate_thresholds.py
- Backend Requirements
- File Icon
- Globe Icon
- Window Icon

## God Nodes (most connected - your core abstractions)
1. `runDetection()` - 36 edges
2. `compilerOptions` - 16 edges
3. `useLocalData()` - 13 edges
4. `SIH 2026 - MuleGuard Comprehensive Audit Report` - 12 edges
5. `MuleDetectionEngine` - 11 edges
6. `DirectedGraph` - 10 edges
7. `computeTransactionRiskSync()` - 9 edges
8. `computeMLScoreSync()` - 9 edges
9. `Money Mule Detection: Current State-of-the-Art and Best Practices Research Report` - 9 edges
10. `MuleGalaxy()` - 8 edges

## Surprising Connections (you probably didn't know these)
- `SIH 2026 Audit Report` --semantically_similar_to--> `Design Tokens`  [INFERRED] [semantically similar]
  SIH_AUDIT_REPORT.md → design-tokens.md
- `useLocalData()` --indirect_call--> `normalizeAccount()`  [INFERRED]
  src/lib/useLocalData.ts → src/lib/normalizers.ts
- `AccountsContent()` --calls--> `useLocalData()`  [EXTRACTED]
  src/components/AccountsContent.tsx → src/lib/useLocalData.ts
- `AlertsContent()` --calls--> `useLocalData()`  [EXTRACTED]
  src/components/AlertsContent.tsx → src/lib/useLocalData.ts
- `DashboardContent()` --calls--> `useLocalData()`  [EXTRACTED]
  src/components/DashboardContent.tsx → src/lib/useLocalData.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Multi-Agent Orchestration Flow** — hermes_orchestrator_config, hermes_multi_agent_skill, agents [EXTRACTED 0.90]
- **UI Asset Collection** — public_file, public_globe, public_window [INFERRED 0.80]

## Communities (71 total, 18 thin omitted)

### Community 0 - "detectionEngine.ts"
Cohesion: 0.06
Nodes (57): Account, Alert, calculateRiskScores(), centralityApproximation(), computeBehavioralScore(), computeBetweennessCentrality(), computeClustering(), computeCommunityScore() (+49 more)

### Community 1 - "SIH 2026 - MuleGuard Comprehensive Audit Report"
Cohesion: 0.04
Nodes (47): 10. SIH 2026 CLEARANCE STATUS, 1. FIRESTORE SECURITY RULES, 2. FIREBASE CONFIGURATION, 3. DEPLOYMENT CONFIGURATIONS, 4. DESIGN SYSTEM COMPLIANCE (MekaVerse), 5. API ROUTES AUDIT, 6. CODE QUALITY & TECHNICAL DEBT, 7. GITHUB STATUS (+39 more)

### Community 2 - "main.py"
Cohesion: 0.06
Nodes (39): Any, Account, AccountsResponse, Alert, AlertsResponse, _compute_patterns(), get_account(), get_accounts() (+31 more)

### Community 3 - "devDependencies"
Cohesion: 0.11
Nodes (19): eslint, eslint-config-next, devDependencies, eslint, eslint-config-next, tailwindcss, @tailwindcss/postcss, @types/node (+11 more)

### Community 4 - "compilerOptions"
Cohesion: 0.07
Nodes (28): dom, dom.iterable, esnext, **/*.mts, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules (+20 more)

### Community 5 - "transactionXgboost.ts"
Cohesion: 0.12
Nodes (29): AccountData, buildRiskFactors(), clamp(), extractTransactionFeatures(), FLAG_THRESHOLD, initTransactionModel(), NOTE: re-derive per-regime whenever features or the model JSON change —, safeNum() (+21 more)

### Community 6 - "dependencies"
Cohesion: 0.07
Nodes (28): lucide-react, next, dependencies, 3d-force-graph, lucide-react, next, plotly.js, react (+20 more)

### Community 7 - "train_transaction_model.py"
Cohesion: 0.10
Nodes (25): Path, export_model(), extract_tree(), Export trained XGBoost model to JSON for TypeScript inference. Run this after…, Convert one XGBoost JSON-format dump tree into the consumer's shape.…, Return base_score in MARGIN (log-odds) space for the consumer.…, resolve_base_score_margin(), count_nodes() (+17 more)

### Community 8 - "MuleGalaxy.tsx"
Cohesion: 0.05
Nodes (41): metadata, metadata, metadata, AnalyticsContent(), AnalyticsData, CHART_COLORS, PATTERN_DOT_COLORS, PATTERN_LINES (+33 more)

### Community 9 - "useLocalData.ts"
Cohesion: 0.17
Nodes (14): computeStats(), mapAlert(), MappedAccount, Alert, ApiTransaction, DataState, DEFAULT_PAGINATION, EMPTY_STATS (+6 more)

### Community 10 - "seedData.ts"
Cohesion: 0.15
Nodes (13): ACCOUNT_NAMES, BANKS, CITIES, FLAG_TYPES, generateSeed(), mulberry32(), SeedAccount, SeedAlert (+5 more)

### Community 11 - "normalizers.ts"
Cohesion: 0.18
Nodes (13): AccountStatus, AlertStatus, firstFinite(), MappedAlert, nonNeg(), normalizeAccount(), RawAccount, RawAlert (+5 more)

### Community 12 - "DataTable.tsx"
Cohesion: 0.18
Nodes (11): Column, DataTable(), DataTableProps, defaultRender(), defaultIcons, EmptyState(), EmptyStateProps, Skeleton() (+3 more)

### Community 13 - "TransactionsContent.tsx"
Cohesion: 0.22
Nodes (6): metadata, TransactionsContent(), FilterBar(), FilterBarProps, FilterConfig, FilterOption

### Community 14 - "xgboostPredictor.ts"
Cohesion: 0.21
Nodes (16): baseScoreLogOdds(), buildFeatureVector(), computeMLScore(), computeMLScoreSync(), countSplitFeatures(), getFeatureImportances(), getFeatureIndex(), isValidTree() (+8 more)

### Community 15 - "ErrorState.tsx"
Cohesion: 0.22
Nodes (8): Button, ButtonProps, ButtonSize, ButtonVariant, sizeClasses, variantClasses, ErrorState(), ErrorStateProps

### Community 16 - "AccountsContent.tsx"
Cohesion: 0.28
Nodes (5): metadata, AccountsContent(), RISK_OPTIONS, LoadingState(), LoadingStateProps

### Community 17 - "AlertsContent.tsx"
Cohesion: 0.32
Nodes (4): metadata, AlertsContent(), PageHeader(), PageHeaderProps

### Community 19 - "mockData.ts"
Cohesion: 0.10
Nodes (15): Account, accountNames, accounts, Alert, alerts, banks, flagTypes, GraphEdge (+7 more)

### Community 20 - "SankeyChart.tsx"
Cohesion: 0.27
Nodes (8): Plot, formatINR(), hexToRgb(), PATTERN_COLORS, PATTERN_ORDER, Plot, SankeyChart(), SankeyChartProps

### Community 21 - "mule-galaxy/route.ts"
Cohesion: 0.21
Nodes (11): AccountRecord, compactFlags(), dynamic, GalaxyLink, GalaxyNode, GalaxyPayload, GET(), isHighRiskLevel() (+3 more)

### Community 22 - "rateLimit.ts"
Cohesion: 0.21
Nodes (12): Bucket, buckets, evictStale(), getClientKey(), insertWithCap(), lastEviction, rateLimit(), RateLimitResult (+4 more)

### Community 23 - "multi-agent-orchestration.skill"
Cohesion: 0.17
Nodes (11): Claude Code frontend phase, Configuration, Connects Claude Code, OpenCode, Kimi Code, and Hermes Agent, Entry point, Hermes Agent analysis phase, Hermes Agent integration synthesis, Kimi Code ML/Data Science phase, Main orchestration function (+3 more)

### Community 24 - "recompute_ml_scores.py"
Cohesion: 0.24
Nodes (12): build_feature_vector(), get_feature_index(), load_model(), main(), _num(), predict(), Build the 16-feature vector from an account record. Input divergences vs…, Iterative tree traversal. (+4 more)

### Community 25 - "PlotlyStatic"
Cohesion: 0.22
Nodes (3): plotly.js/lib/core, plotly.js/lib/sankey, PlotlyStatic

### Community 26 - "MuleGuard ML Model Report"
Cohesion: 0.33
Nodes (5): Account XGBoost, Dataset integrity checks, MuleGuard ML Model Report, Score calibration note, Transaction XGBoost

### Community 27 - "muleSeed.ts"
Cohesion: 0.18
Nodes (9): AccountDef, ACCOUNTS, ALERTS, MuleSeedAccount, MuleSeedAlert, MuleSeedBundle, MuleSeedTransaction, TRANSACTIONS (+1 more)

### Community 29 - "Money Mule Detection: Current State-of-the-Art and Best Practices Research Report"
Cohesion: 0.20
Nodes (9): 1. Advanced Detection Methodologies, 2. Feature Engineering and Temporal Aspects, 3. Implementation Framework and Operational Best Practices, 4. Regulatory Landscape and Performance Expectations, Executive Summary, Key Takeaways, Methodology, Money Mule Detection: Current State-of-the-Art and Best Practices Research Report (+1 more)

### Community 30 - "layout.tsx"
Cohesion: 0.22
Nodes (7): inter, jetbrainsMono, metadata, viewport, navItems, Sidebar(), SidebarOverlay()

### Community 31 - "generate_synthetic_data.py"
Cohesion: 0.36
Nodes (7): generate_alerts(), generate_all_synthetic_data(), generate_network_transfers(), generate_transactions(), Generate alerts based on suspicious patterns, Generate network-style transfers between accounts, Generate realistic transactions between accounts

### Community 32 - "data-local/route.ts"
Cohesion: 0.43
Nodes (7): computeStats(), dynamic, GET(), loadAccounts(), loadAlerts(), loadTransactions(), toFinite()

### Community 35 - "MekaVerse Design Tokens Documentation"
Cohesion: 0.29
Nodes (6): 🎨 Color Palette, MekaVerse Design Tokens Documentation, 📂 Organization, 📐 Spacing System, 🔤 Typography, 🎭 UI Components

### Community 36 - "orchestration.sh"
Cohesion: 0.52
Nodes (6): main(), run_claude_code(), run_hermes(), run_kimi(), run_opencode(), orchestration.sh script

### Community 37 - "generate-synthetic-data.ts"
Cohesion: 0.32
Nodes (7): Alert, generateSyntheticData(), getRandomDate(), NOTE: scripts/convert_csv_transactions.py writes an alternative, larger, RawAccount, Transaction, weightedRandomChoice()

### Community 38 - "validate_framework.py"
Cohesion: 0.47
Nodes (5): check_directory(), check_file(), main(), Check if a file exists and is readable., Check if a directory exists.

### Community 39 - "combine_ml_params.py"
Cohesion: 0.50
Nodes (3): platt_nll(), platt_sigmoid(), Task 3: Combine and export ml_params.json…

### Community 40 - "rebuild_full.py"
Cohesion: 0.50
Nodes (4): assign_bank(), make_acm_row(), Full dataset rebuild for 100% referential integrity. Fixes: 1. ALL ACM IDs from…, Derive bank from ACC partners. Fallback: stable hash-based assignment.

### Community 42 - "README.md"
Cohesion: 0.50
Nodes (3): Deploy on Vercel, Getting Started, Learn More

### Community 43 - "generate_dataset_json.py"
Cohesion: 0.40
Nodes (3): compute_score(), Salted MD5 digest as an int — unlike hash(), stable across processes., stable_digest()

### Community 44 - "parse_hour"
Cohesion: 0.67
Nodes (3): main(), parse_hour(), Extract hour from ISO timestamp string.

### Community 45 - "analytics/route.ts"
Cohesion: 0.33
Nodes (8): canonicalFlag(), computeAnalytics(), datasetCache, dynamic, GET(), loadDataset(), PATTERN_PRIORITY, patternsForFlags()

### Community 47 - "convert_csv_transactions.py"
Cohesion: 0.40
Nodes (3): normalize_timestamp(), Convert transactions_1m (1) (1).csv -> public/transactions_synthetic.json CSV…, Normalize a CSV timestamp to UTC ISO-8601 ("...Z") for JS Date parsing. Source…

### Community 48 - "train_meta_learner.py"
Cohesion: 0.33
Nodes (6): build_X(), norm(), Meta-Learner (Stacking) for Ensemble Weights…, Stack [b, g, t, c, m, b*g], min-max normalized over rows in idx ONLY.…, The 5 non-ML columns [b, g, t, c, b*g] of a build_X matrix. Mirrors the…, x5()

### Community 56 - "next.config.ts"
Cohesion: 0.50
Nodes (3): nextConfig, projectRoot, NOTE: 'unsafe-eval' is required by plotly.js at runtime;

## Knowledge Gaps
- **285 isolated node(s):** `orchestrate.sh script`, `eslintConfig`, `projectRoot`, `nextConfig`, `name` (+280 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **18 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `LoadingState()` connect `AccountsContent.tsx` to `MuleGalaxy.tsx`, `AlertsContent.tsx`, `TransactionsContent.tsx`?**
  _High betweenness centrality (0.004) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `useLocalData()` (e.g. with `mapAlert()` and `normalizeAccount()`) actually correct?**
  _`useLocalData()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `orchestrate.sh script`, `eslintConfig`, `projectRoot` to the rest of the system?**
  _285 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `detectionEngine.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05974124809741248 - nodes in this community are weakly interconnected._
- **Should `SIH 2026 - MuleGuard Comprehensive Audit Report` be split into smaller, more focused modules?**
  _Cohesion score 0.041666666666666664 - nodes in this community are weakly interconnected._
- **Should `main.py` be split into smaller, more focused modules?**
  _Cohesion score 0.06352941176470588 - nodes in this community are weakly interconnected._
- **Should `devDependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.10526315789473684 - nodes in this community are weakly interconnected._