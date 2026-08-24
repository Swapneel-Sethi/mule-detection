# Graph Report - mule-detection  (2026-08-25)

## Corpus Check
- 101 files · ~10,226,804 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 779 nodes · 1051 edges · 71 communities (51 shown, 20 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 8 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `ede1c5c6`
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
- seedData.ts
- NetworkGraph.tsx
- ErrorState.tsx
- xgboostPredictor.ts
- generate_hierarchical_hypergraph.py
- useFirestoreData.ts
- normalizers.ts
- mockData.ts
- mule-galaxy/route.ts
- rateLimit.ts
- multi-agent-orchestration.skill
- recompute_ml_scores.py
- plotly-partial.d.ts
- import-csv-to-firestore.js
- muleSeed.ts
- build_layout
- Money Mule Detection: Current State-of-the-Art and Best Practices Research Report
- layout.tsx
- generate_all_synthetic_data
- data-local/route.ts
- AccountsContent.tsx
- SankeyChart.tsx
- MekaVerse Design Tokens Documentation
- orchestration.sh
- generate-synthetic-data.ts
- validate_framework.py
- combine_ml_params.py
- rebuild_full.py
- AGENTS.md
- README.md
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
- TransactionsContent.tsx
- useFirestoreData
- LoadingState.tsx

## God Nodes (most connected - your core abstractions)
1. `runDetection()` - 36 edges
2. `compilerOptions` - 16 edges
3. `useFirestoreData()` - 12 edges
4. `SIH 2026 - MuleGuard Comprehensive Audit Report` - 12 edges
5. `MuleDetectionEngine` - 11 edges
6. `DirectedGraph` - 10 edges
7. `Money Mule Detection: Current State-of-the-Art and Best Practices Research Report` - 9 edges
8. `build()` - 8 edges
9. `computeTransactionRiskSync()` - 8 edges
10. `getUserLocale()` - 8 edges

## Surprising Connections (you probably didn't know these)
- `SIH 2026 Audit Report` --semantically_similar_to--> `Design Tokens`  [INFERRED] [semantically similar]
  SIH_AUDIT_REPORT.md → design-tokens.md
- `seed()` --calls--> `generateSeed()`  [EXTRACTED]
  scripts/seed-firestore.ts → src/scripts/seedData.ts
- `useFirestoreData()` --indirect_call--> `normalizeAccount()`  [INFERRED]
  src/lib/useFirestoreData.ts → src/lib/normalizers.ts
- `AccountsContent()` --calls--> `useFirestoreData()`  [EXTRACTED]
  src/components/AccountsContent.tsx → src/lib/useFirestoreData.ts
- `DashboardContent()` --calls--> `useFirestoreData()`  [EXTRACTED]
  src/components/DashboardContent.tsx → src/lib/useFirestoreData.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Multi-Agent Orchestration Flow** — hermes_orchestrator_config, hermes_multi_agent_skill, agents [EXTRACTED 0.90]
- **UI Asset Collection** — public_file, public_globe, public_window [INFERRED 0.80]

## Communities (71 total, 20 thin omitted)

### Community 0 - "detectionEngine.ts"
Cohesion: 0.06
Nodes (57): Account, Alert, calculateRiskScores(), centralityApproximation(), computeBehavioralScore(), computeBetweennessCentrality(), computeClustering(), computeCommunityScore() (+49 more)

### Community 1 - "SIH 2026 - MuleGuard Comprehensive Audit Report"
Cohesion: 0.04
Nodes (47): 10. SIH 2026 CLEARANCE STATUS, 1. FIRESTORE SECURITY RULES, 2. FIREBASE CONFIGURATION, 3. DEPLOYMENT CONFIGURATIONS, 4. DESIGN SYSTEM COMPLIANCE (MekaVerse), 5. API ROUTES AUDIT, 6. CODE QUALITY & TECHNICAL DEBT, 7. GITHUB STATUS (+39 more)

### Community 2 - "main.py"
Cohesion: 0.07
Nodes (31): Account, Alert, get_account(), get_accounts(), get_alerts(), get_centrality(), get_communities(), get_graph() (+23 more)

### Community 3 - "devDependencies"
Cohesion: 0.07
Nodes (29): eslint, eslint-config-next, devDependencies, eslint, eslint-config-next, tailwindcss, @tailwindcss/postcss, @types/node (+21 more)

### Community 4 - "compilerOptions"
Cohesion: 0.07
Nodes (28): dom, dom.iterable, esnext, **/*.mts, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules (+20 more)

### Community 5 - "transactionXgboost.ts"
Cohesion: 0.14
Nodes (25): AccountData, buildRiskFactors(), clamp(), extractTransactionFeatures(), initTransactionModel(), safeNum(), scoreAllTransactions(), scoreTransaction() (+17 more)

### Community 6 - "dependencies"
Cohesion: 0.07
Nodes (27): firebase, firebase-admin, lucide-react, next, dependencies, 3d-force-graph, firebase, firebase-admin (+19 more)

### Community 7 - "train_transaction_model.py"
Cohesion: 0.12
Nodes (21): Path, export_model(), extract_tree(), Export trained XGBoost model to JSON for TypeScript inference. Run this after…, Recursively extract tree structure from XGBoost booster., count_nodes(), evaluate(), export_model() (+13 more)

### Community 8 - "MuleGalaxy.tsx"
Cohesion: 0.05
Nodes (36): metadata, metadata, AnalyticsContent(), AnalyticsData, CHART_COLORS, PATTERN_LINES, DashboardContent(), safeStat() (+28 more)

### Community 10 - "seedData.ts"
Cohesion: 0.14
Nodes (15): db, seed(), ACCOUNT_NAMES, BANKS, CITIES, FLAG_TYPES, generateSeed(), mulberry32() (+7 more)

### Community 11 - "NetworkGraph.tsx"
Cohesion: 0.09
Nodes (21): formatINR(), GraphAccount, GraphTransaction, HierarchicalHypergraph(), dashedLine(), position(), Hypernode, Selection (+13 more)

### Community 12 - "ErrorState.tsx"
Cohesion: 0.16
Nodes (10): Button, ButtonProps, ButtonSize, ButtonVariant, sizeClasses, variantClasses, defaultIcons, EmptyState() (+2 more)

### Community 14 - "xgboostPredictor.ts"
Cohesion: 0.22
Nodes (15): buildFeatureVector(), computeMLScore(), computeMLScoreSync(), countSplitFeatures(), getFeatureImportances(), getFeatureIndex(), isValidTree(), loadModel() (+7 more)

### Community 15 - "generate_hierarchical_hypergraph.py"
Cohesion: 0.25
Nodes (13): build_circular_layout(), classify_component(), compact_account(), compact_transaction(), layout_component(), main(), partition_component(), Any (+5 more)

### Community 16 - "useFirestoreData.ts"
Cohesion: 0.24
Nodes (9): stats, computeStats(), MappedAccount, Alert, DEFAULT_PAGINATION, EMPTY_STATS, PaginationInfo, Txn (+1 more)

### Community 18 - "normalizers.ts"
Cohesion: 0.18
Nodes (12): AccountStatus, AlertStatus, MappedAlert, nonNeg(), normalizeAccount(), RawAccount, RawAlert, RiskLevel (+4 more)

### Community 19 - "mockData.ts"
Cohesion: 0.11
Nodes (14): Account, accountNames, accounts, Alert, alerts, banks, flagTypes, GraphEdge (+6 more)

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
Cohesion: 0.27
Nodes (11): build_feature_vector(), get_feature_index(), load_model(), main(), platt_scale(), predict(), True Platt scaling: P(y=1) = 1 / (1 + exp(A * raw + B)), Iterative tree traversal. (+3 more)

### Community 25 - "plotly-partial.d.ts"
Cohesion: 0.20
Nodes (4): plotly.js/lib/core, plotly.js/lib/sankey, PlotlyStatic, react-plotly.js/factory

### Community 26 - "import-csv-to-firestore.js"
Cohesion: 0.31
Nodes (10): commitWithRetry(), computeFlags(), computeMLScore(), fs, main(), parseCSV(), parseCSVLine(), path (+2 more)

### Community 27 - "muleSeed.ts"
Cohesion: 0.18
Nodes (9): AccountDef, ACCOUNTS, ALERTS, MuleSeedAccount, MuleSeedAlert, MuleSeedBundle, MuleSeedTransaction, TRANSACTIONS (+1 more)

### Community 28 - "build_layout"
Cohesion: 0.31
Nodes (9): Layout, build_layout(), component_layout(), main(), pack_components(), Any, Build a compact, deployment-safe graph snapshot from the complete synthetic…, Pack component circles into one compact, non-overlapping canvas. (+1 more)

### Community 29 - "Money Mule Detection: Current State-of-the-Art and Best Practices Research Report"
Cohesion: 0.20
Nodes (9): 1. Advanced Detection Methodologies, 2. Feature Engineering and Temporal Aspects, 3. Implementation Framework and Operational Best Practices, 4. Regulatory Landscape and Performance Expectations, Executive Summary, Key Takeaways, Methodology, Money Mule Detection: Current State-of-the-Art and Best Practices Research Report (+1 more)

### Community 30 - "layout.tsx"
Cohesion: 0.25
Nodes (7): inter, jetbrainsMono, metadata, viewport, navItems, Sidebar(), SidebarOverlay()

### Community 31 - "generate_all_synthetic_data"
Cohesion: 0.36
Nodes (7): generate_alerts(), generate_all_synthetic_data(), generate_network_transfers(), generate_transactions(), Generate realistic transactions between accounts, Generate network-style transfers between accounts, Generate alerts based on suspicious patterns

### Community 32 - "data-local/route.ts"
Cohesion: 0.43
Nodes (7): computeStats(), dynamic, GET(), loadAccounts(), loadAlerts(), loadTransactions(), toFinite()

### Community 33 - "AccountsContent.tsx"
Cohesion: 0.22
Nodes (7): metadata, AccountsContent(), RISK_OPTIONS, FilterBar(), FilterBarProps, FilterConfig, FilterOption

### Community 34 - "SankeyChart.tsx"
Cohesion: 0.27
Nodes (8): Plot, formatINR(), hexToRgb(), PATTERN_COLORS, PATTERN_ORDER, Plot, SankeyChart(), SankeyChartProps

### Community 35 - "MekaVerse Design Tokens Documentation"
Cohesion: 0.29
Nodes (6): 🎨 Color Palette, MekaVerse Design Tokens Documentation, 📂 Organization, 📐 Spacing System, 🔤 Typography, 🎭 UI Components

### Community 36 - "orchestration.sh"
Cohesion: 0.52
Nodes (6): main(), run_claude_code(), run_hermes(), run_kimi(), run_opencode(), orchestration.sh script

### Community 37 - "generate-synthetic-data.ts"
Cohesion: 0.38
Nodes (6): Alert, generateSyntheticData(), getRandomDate(), RawAccount, Transaction, weightedRandomChoice()

### Community 38 - "validate_framework.py"
Cohesion: 0.47
Nodes (5): check_directory(), check_file(), main(), Check if a file exists and is readable., Check if a directory exists.

### Community 39 - "combine_ml_params.py"
Cohesion: 0.50
Nodes (3): platt_nll(), platt_sigmoid(), Task 3: Combine and export ml_params.json…

### Community 40 - "rebuild_full.py"
Cohesion: 0.50
Nodes (4): assign_bank(), make_acm_row(), Full dataset rebuild for 100% referential integrity. Fixes: 1. ALL ACM IDs from…, Derive bank from ACC partners. Fallback: hash-based assignment.

### Community 42 - "README.md"
Cohesion: 0.50
Nodes (3): Deploy on Vercel, Getting Started, Learn More

### Community 44 - "parse_hour"
Cohesion: 0.67
Nodes (3): main(), parse_hour(), Extract hour from ISO timestamp string.

### Community 45 - "analytics/route.ts"
Cohesion: 0.67
Nodes (3): computeAnalytics(), dynamic, GET()

### Community 72 - "TransactionsContent.tsx"
Cohesion: 0.27
Nodes (6): metadata, TransactionsContent(), Column, DataTable(), DataTableProps, defaultRender()

### Community 75 - "useFirestoreData"
Cohesion: 0.24
Nodes (5): metadata, AlertsContent(), PageHeaderProps, mapAlert(), useFirestoreData()

### Community 76 - "LoadingState.tsx"
Cohesion: 0.38
Nodes (4): LoadingStateProps, Skeleton(), SkeletonGroup(), SkeletonProps

## Knowledge Gaps
- **289 isolated node(s):** `nextConfig`, `metadata`, `metadata`, `metadata`, `dynamic` (+284 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **20 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dependencies` connect `dependencies` to `devDependencies`?**
  _High betweenness centrality (0.004) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `useFirestoreData()` (e.g. with `mapAlert()` and `normalizeAccount()`) actually correct?**
  _`useFirestoreData()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `nextConfig`, `metadata`, `metadata` to the rest of the system?**
  _289 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `detectionEngine.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.058496853017400964 - nodes in this community are weakly interconnected._
- **Should `SIH 2026 - MuleGuard Comprehensive Audit Report` be split into smaller, more focused modules?**
  _Cohesion score 0.041666666666666664 - nodes in this community are weakly interconnected._
- **Should `main.py` be split into smaller, more focused modules?**
  _Cohesion score 0.07308970099667775 - nodes in this community are weakly interconnected._
- **Should `devDependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.06666666666666667 - nodes in this community are weakly interconnected._