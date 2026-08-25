# Graph Report - 1  (2026-08-25)

## Corpus Check
- 112 files · ~10,259,720 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 855 nodes · 1121 edges · 73 communities (56 shown, 17 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 5 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `a56590b0`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- detectionEngine.ts
- DashboardContent.tsx
- main.py
- compilerOptions
- UI/UX Flaws Analysis — MuleGuard Dashboard
- devDependencies
- dependencies
- train_transaction_model.py
- Trunk CI UI style guide
- SIH 2026 - MuleGuard Comprehensive Audit Report
- NetworkGraph.tsx
- mockData.ts
- transactionXgboost.ts
- CRITICAL
- seedData.ts
- utils.ts
- xgboostPredictor.ts
- multi-agent-orchestration.skill
- rateLimit.ts
- recompute_ml_scores.py
- generate_hierarchical_hypergraph.py
- import-csv-to-firestore.js
- layout.tsx
- muleSeed.ts
- build_layout
- Money Mule Detection: Current State-of-the-Art and Best Practices Research Report
- generate_bipartite_network.py
- generate_all_synthetic_data
- data-local/route.ts
- MekaVerse Design Tokens Documentation
- orchestration.sh
- scripts
- generate-synthetic-data.ts
- validate_framework.py
- vercel.json
- combine_ml_params.py
- rebuild_full.py
- package.json
- README.md
- parse_hour
- analytics/route.ts
- AGENTS.md
- build_real_mules.py
- convert_csv_transactions.py
- train_meta_learner.py
- error.tsx
- mule-detection/vercel.json
- graphify.js
- eslint.config.mjs
- orchestrate.sh
- next.config.ts
- plotly.js
- react
- recharts
- postcss.config.mjs
- auto_calibrate_thresholds.py
- Work State
- ui_ux_flaws.md

## God Nodes (most connected - your core abstractions)
1. `UI/UX Flaws Analysis — MuleGuard Dashboard` - 54 edges
2. `Trunk CI UI style guide` - 51 edges
3. `runDetection()` - 36 edges
4. `compilerOptions` - 16 edges
5. `useFirestoreData()` - 12 edges
6. `SIH 2026 - MuleGuard Comprehensive Audit Report` - 12 edges
7. `MuleDetectionEngine` - 11 edges
8. `DirectedGraph` - 10 edges
9. `CRITICAL` - 9 edges
10. `Money Mule Detection: Current State-of-the-Art and Best Practices Research Report` - 9 edges

## Surprising Connections (you probably didn't know these)
- `useFirestoreData()` --indirect_call--> `normalizeAccount()`  [INFERRED]
  mule-detection/src/lib/useFirestoreData.ts → mule-detection/src/lib/normalizers.ts
- `useFirestoreData()` --indirect_call--> `mapAlert()`  [INFERRED]
  mule-detection/src/lib/useFirestoreData.ts → mule-detection/src/lib/normalizers.ts
- `runDetection()` --calls--> `scoreAllTransactions()`  [EXTRACTED]
  mule-detection/src/lib/detectionEngine.ts → mule-detection/src/lib/transactionScorer.ts
- `runDetection()` --calls--> `computeMLScoreSync()`  [EXTRACTED]
  mule-detection/src/lib/detectionEngine.ts → mule-detection/src/lib/xgboostPredictor.ts
- `useFirestoreData()` --calls--> `computeStats()`  [EXTRACTED]
  mule-detection/src/lib/useFirestoreData.ts → mule-detection/src/lib/normalizers.ts

## Import Cycles
- None detected.

## Communities (73 total, 17 thin omitted)

### Community 0 - "detectionEngine.ts"
Cohesion: 0.06
Nodes (57): Account, Alert, calculateRiskScores(), centralityApproximation(), computeBehavioralScore(), computeBetweennessCentrality(), computeClustering(), computeCommunityScore() (+49 more)

### Community 1 - "DashboardContent.tsx"
Cohesion: 0.06
Nodes (34): AccountsContent(), RISK_OPTIONS, AlertsContent(), DashboardContent(), safeStat(), TransactionsContent(), Button, ButtonProps (+26 more)

### Community 2 - "main.py"
Cohesion: 0.07
Nodes (31): BaseModel, get, Account, Alert, get_account(), get_accounts(), get_alerts(), get_centrality() (+23 more)

### Community 3 - "compilerOptions"
Cohesion: 0.07
Nodes (28): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+20 more)

### Community 4 - "UI/UX Flaws Analysis — MuleGuard Dashboard"
Cohesion: 0.04
Nodes (53): Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant (+45 more)

### Community 5 - "devDependencies"
Cohesion: 0.12
Nodes (17): eslint, eslint-config-next, devDependencies, eslint, eslint-config-next, tailwindcss, @tailwindcss/postcss, @types/node (+9 more)

### Community 6 - "dependencies"
Cohesion: 0.12
Nodes (17): firebase, firebase-admin, lucide-react, dependencies, firebase, firebase-admin, lucide-react, next (+9 more)

### Community 7 - "train_transaction_model.py"
Cohesion: 0.12
Nodes (21): export_model(), extract_tree(), Export trained XGBoost model to JSON for TypeScript inference. Run this after…, Recursively extract tree structure from XGBoost booster., count_nodes(), evaluate(), export_model(), extract_features() (+13 more)

### Community 8 - "Trunk CI UI style guide"
Cohesion: 0.04
Nodes (51): Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant (+43 more)

### Community 9 - "SIH 2026 - MuleGuard Comprehensive Audit Report"
Cohesion: 0.04
Nodes (47): 10. SIH 2026 CLEARANCE STATUS, 1. FIRESTORE SECURITY RULES, 2. FIREBASE CONFIGURATION, 3. DEPLOYMENT CONFIGURATIONS, 4. DESIGN SYSTEM COMPLIANCE (MekaVerse), 5. API ROUTES AUDIT, 6. CODE QUALITY & TECHNICAL DEBT, 7. GITHUB STATUS (+39 more)

### Community 10 - "NetworkGraph.tsx"
Cohesion: 0.06
Nodes (32): AnalyticsContent(), AnalyticsData, CHART_COLORS, PATTERN_LINES, formatINR(), GraphAccount, GraphTransaction, HierarchicalHypergraph() (+24 more)

### Community 11 - "mockData.ts"
Cohesion: 0.07
Nodes (33): Account, accountNames, accounts, Alert, alerts, banks, flagTypes, GraphEdge (+25 more)

### Community 12 - "transactionXgboost.ts"
Cohesion: 0.14
Nodes (25): AccountData, buildRiskFactors(), clamp(), extractTransactionFeatures(), initTransactionModel(), safeNum(), scoreAllTransactions(), scoreTransaction() (+17 more)

### Community 13 - "CRITICAL"
Cohesion: 0.10
Nodes (19): C1 — Learning rate applied twice to already-shrunk leaves, C2 — Transaction model adds base_score=0.5 into log-odds space, C3 — The XGBoost models never actually run at runtime, C4 — Label leakage end-to-end; AUC = 1.000000 is an artifact, C5 — "calibrated_score" means three different things; thresholds are applied to the wrong one, C6 — Train/serve feature mismatch (account model), C7 — Meta-learner weights don't correspond to the components they multiply, C8 — Dataset regeneration scripts overwrite calibrated fields with one hand formula (+11 more)

### Community 14 - "seedData.ts"
Cohesion: 0.14
Nodes (15): db, seed(), ACCOUNT_NAMES, BANKS, CITIES, FLAG_TYPES, generateSeed(), mulberry32() (+7 more)

### Community 15 - "utils.ts"
Cohesion: 0.21
Nodes (10): StatCard(), StatCardProps, formatCurrency(), formatCurrencyFull(), formatDate(), formatNumber(), formatNumberFull(), formatPercent() (+2 more)

### Community 16 - "xgboostPredictor.ts"
Cohesion: 0.22
Nodes (15): buildFeatureVector(), computeMLScore(), computeMLScoreSync(), countSplitFeatures(), getFeatureImportances(), getFeatureIndex(), isValidTree(), loadModel() (+7 more)

### Community 17 - "multi-agent-orchestration.skill"
Cohesion: 0.15
Nodes (12): Claude Code frontend phase, Configuration, Connects Claude Code, OpenCode, Kimi Code, and Hermes Agent, Entry point, Hermes Agent analysis phase, Hermes Agent integration synthesis, Kimi Code ML/Data Science phase, Main orchestration function (+4 more)

### Community 18 - "rateLimit.ts"
Cohesion: 0.22
Nodes (11): Bucket, buckets, evictStale(), getClientKey(), lastEviction, rateLimit(), RateLimitResult, NOTE: On serverless (Vercel), each function instance has its own memory, so (+3 more)

### Community 19 - "recompute_ml_scores.py"
Cohesion: 0.27
Nodes (11): build_feature_vector(), get_feature_index(), load_model(), main(), platt_scale(), predict(), True Platt scaling: P(y=1) = 1 / (1 + exp(A * raw + B)), Iterative tree traversal. (+3 more)

### Community 20 - "generate_hierarchical_hypergraph.py"
Cohesion: 0.33
Nodes (10): classify_component(), compact_account(), compact_transaction(), layout_component(), main(), normalize(), Any, Build an HGNN-style hierarchical hypergraph from the complete synthetic data.… (+2 more)

### Community 21 - "import-csv-to-firestore.js"
Cohesion: 0.31
Nodes (10): commitWithRetry(), computeFlags(), computeMLScore(), fs, main(), parseCSV(), parseCSVLine(), path (+2 more)

### Community 22 - "layout.tsx"
Cohesion: 0.25
Nodes (6): inter, jetbrainsMono, metadata, navItems, Sidebar(), SidebarOverlay()

### Community 23 - "muleSeed.ts"
Cohesion: 0.18
Nodes (9): AccountDef, ACCOUNTS, ALERTS, MuleSeedAccount, MuleSeedAlert, MuleSeedBundle, MuleSeedTransaction, TRANSACTIONS (+1 more)

### Community 24 - "build_layout"
Cohesion: 0.31
Nodes (9): Layout, build_layout(), component_layout(), main(), pack_components(), Any, Build a compact, deployment-safe graph snapshot from the complete synthetic…, Pack component circles into one compact, non-overlapping canvas. (+1 more)

### Community 25 - "Money Mule Detection: Current State-of-the-Art and Best Practices Research Report"
Cohesion: 0.20
Nodes (9): 1. Advanced Detection Methodologies, 2. Feature Engineering and Temporal Aspects, 3. Implementation Framework and Operational Best Practices, 4. Regulatory Landscape and Performance Expectations, Executive Summary, Key Takeaways, Methodology, Money Mule Detection: Current State-of-the-Art and Best Practices Research Report (+1 more)

### Community 26 - "generate_bipartite_network.py"
Cohesion: 0.33
Nodes (8): brandes_betweenness(), build_layout(), compact_account(), main(), Any, Construct an exact bipartite financial-crime network from the synthetic…, Exact directed Brandes centrality for the selected bipartite graph., Constrained force-directed bipartite layout with fixed parallel columns.

### Community 27 - "generate_all_synthetic_data"
Cohesion: 0.36
Nodes (7): generate_alerts(), generate_all_synthetic_data(), generate_network_transfers(), generate_transactions(), Generate realistic transactions between accounts, Generate network-style transfers between accounts, Generate alerts based on suspicious patterns

### Community 28 - "data-local/route.ts"
Cohesion: 0.43
Nodes (7): computeStats(), dynamic, GET(), loadAccounts(), loadAlerts(), loadTransactions(), toFinite()

### Community 29 - "MekaVerse Design Tokens Documentation"
Cohesion: 0.29
Nodes (6): 🎨 Color Palette, MekaVerse Design Tokens Documentation, 📂 Organization, 📐 Spacing System, 🔤 Typography, 🎭 UI Components

### Community 30 - "orchestration.sh"
Cohesion: 0.52
Nodes (6): main(), run_claude_code(), run_hermes(), run_kimi(), run_opencode(), orchestration.sh script

### Community 31 - "scripts"
Cohesion: 0.29
Nodes (7): scripts, build, data:hypergraph, data:network, dev, lint, start

### Community 32 - "generate-synthetic-data.ts"
Cohesion: 0.38
Nodes (6): Alert, generateSyntheticData(), getRandomDate(), RawAccount, Transaction, weightedRandomChoice()

### Community 33 - "validate_framework.py"
Cohesion: 0.47
Nodes (5): check_directory(), check_file(), main(), Check if a file exists and is readable., Check if a directory exists.

### Community 34 - "vercel.json"
Cohesion: 0.18
Nodes (10): buildCommand, devCommand, framework, github, autoAlias, enabled, org, silent (+2 more)

### Community 35 - "combine_ml_params.py"
Cohesion: 0.50
Nodes (3): platt_nll(), platt_sigmoid(), Task 3: Combine and export ml_params.json…

### Community 36 - "rebuild_full.py"
Cohesion: 0.50
Nodes (4): assign_bank(), make_acm_row(), Full dataset rebuild for 100% referential integrity. Fixes: 1. ALL ACM IDs from…, Derive bank from ACC partners. Fallback: hash-based assignment.

### Community 37 - "package.json"
Cohesion: 0.50
Nodes (3): name, private, version

### Community 38 - "README.md"
Cohesion: 0.50
Nodes (3): Deploy on Vercel, Getting Started, Learn More

### Community 40 - "parse_hour"
Cohesion: 0.67
Nodes (3): main(), parse_hour(), Extract hour from ISO timestamp string.

### Community 41 - "analytics/route.ts"
Cohesion: 0.67
Nodes (3): computeAnalytics(), dynamic, GET()

## Knowledge Gaps
- **374 isolated node(s):** `orchestrate.sh script`, `eslintConfig`, `nextConfig`, `name`, `version` (+369 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **17 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `UI/UX Flaws Analysis — MuleGuard Dashboard` connect `UI/UX Flaws Analysis — MuleGuard Dashboard` to `Trunk CI UI style guide`, `Work State`?**
  _High betweenness centrality (0.012) - this node is a cross-community bridge._
- **Why does `LoadingState()` connect `DashboardContent.tsx` to `NetworkGraph.tsx`?**
  _High betweenness centrality (0.004) - this node is a cross-community bridge._
- **What connects `orchestrate.sh script`, `eslintConfig`, `nextConfig` to the rest of the system?**
  _374 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `detectionEngine.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.058496853017400964 - nodes in this community are weakly interconnected._
- **Should `DashboardContent.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.06298701298701298 - nodes in this community are weakly interconnected._
- **Should `main.py` be split into smaller, more focused modules?**
  _Cohesion score 0.07308970099667775 - nodes in this community are weakly interconnected._
- **Should `compilerOptions` be split into smaller, more focused modules?**
  _Cohesion score 0.06896551724137931 - nodes in this community are weakly interconnected._