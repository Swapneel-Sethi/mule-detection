# Graph Report - mule-detection  (2026-08-24)

## Corpus Check
- 91 files · ~10,118,600 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 650 nodes · 897 edges · 50 communities (39 shown, 11 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 5 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `0320789e`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- detectionEngine.ts
- SIH 2026 - MuleGuard Comprehensive Audit Report
- main.py
- mockData.ts
- compilerOptions
- transactionXgboost.ts
- devDependencies
- dependencies
- train_transaction_model.py
- seedData.ts
- DashboardContent.tsx
- xgboostPredictor.ts
- multi-agent-orchestration.skill
- rateLimit.ts
- recompute_ml_scores.py
- useFirestoreData
- analytics/route.ts
- import-csv-to-firestore.js
- layout.tsx
- muleSeed.ts
- Money Mule Detection: Current State-of-the-Art and Best Practices Research Report
- generate_all_synthetic_data
- route.ts
- MekaVerse Design Tokens Documentation
- orchestration.sh
- generate-synthetic-data.ts
- validate_framework.py
- combine_ml_params.py
- rebuild_full.py
- README.md
- parse_hour
- build_real_mules.py
- convert_csv_transactions.py
- train_meta_learner.py
- error.tsx
- vercel.json
- AGENTS.md
- eslint.config.mjs
- orchestrate.sh
- next.config.ts
- postcss.config.mjs
- auto_calibrate_thresholds.py

## God Nodes (most connected - your core abstractions)
1. `runDetection()` - 36 edges
2. `compilerOptions` - 16 edges
3. `useFirestoreData()` - 14 edges
4. `SIH 2026 - MuleGuard Comprehensive Audit Report` - 12 edges
5. `MuleDetectionEngine` - 11 edges
6. `DirectedGraph` - 10 edges
7. `Money Mule Detection: Current State-of-the-Art and Best Practices Research Report` - 9 edges
8. `calculateRiskScores()` - 8 edges
9. `extractEnhancedFeatures()` - 8 edges
10. `getUserLocale()` - 8 edges

## Surprising Connections (you probably didn't know these)
- `useFirestoreData()` --indirect_call--> `mapAlert()`  [INFERRED]
  src/lib/useFirestoreData.ts → src/lib/normalizers.ts
- `useFirestoreData()` --indirect_call--> `normalizeAccount()`  [INFERRED]
  src/lib/useFirestoreData.ts → src/lib/normalizers.ts
- `seed()` --calls--> `generateSeed()`  [EXTRACTED]
  scripts/seed-firestore.ts → src/scripts/seedData.ts
- `runDetection()` --calls--> `scoreAllTransactions()`  [EXTRACTED]
  src/lib/detectionEngine.ts → src/lib/transactionScorer.ts
- `runDetection()` --calls--> `computeMLScoreSync()`  [EXTRACTED]
  src/lib/detectionEngine.ts → src/lib/xgboostPredictor.ts

## Import Cycles
- None detected.

## Communities (50 total, 11 thin omitted)

### Community 0 - "detectionEngine.ts"
Cohesion: 0.06
Nodes (57): Account, Alert, calculateRiskScores(), centralityApproximation(), computeBehavioralScore(), computeBetweennessCentrality(), computeClustering(), computeCommunityScore() (+49 more)

### Community 1 - "SIH 2026 - MuleGuard Comprehensive Audit Report"
Cohesion: 0.04
Nodes (47): 10. SIH 2026 CLEARANCE STATUS, 1. FIRESTORE SECURITY RULES, 2. FIREBASE CONFIGURATION, 3. DEPLOYMENT CONFIGURATIONS, 4. DESIGN SYSTEM COMPLIANCE (MekaVerse), 5. API ROUTES AUDIT, 6. CODE QUALITY & TECHNICAL DEBT, 7. GITHUB STATUS (+39 more)

### Community 2 - "main.py"
Cohesion: 0.07
Nodes (31): Account, Alert, get_account(), get_accounts(), get_alerts(), get_centrality(), get_communities(), get_graph() (+23 more)

### Community 3 - "mockData.ts"
Cohesion: 0.07
Nodes (33): Account, accountNames, accounts, Alert, alerts, banks, flagTypes, GraphEdge (+25 more)

### Community 4 - "compilerOptions"
Cohesion: 0.07
Nodes (28): dom, dom.iterable, esnext, **/*.mts, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules (+20 more)

### Community 5 - "transactionXgboost.ts"
Cohesion: 0.14
Nodes (25): AccountData, buildRiskFactors(), clamp(), extractTransactionFeatures(), initTransactionModel(), safeNum(), scoreAllTransactions(), scoreTransaction() (+17 more)

### Community 6 - "devDependencies"
Cohesion: 0.08
Nodes (25): eslint, eslint-config-next, devDependencies, eslint, eslint-config-next, tailwindcss, @tailwindcss/postcss, @types/node (+17 more)

### Community 7 - "dependencies"
Cohesion: 0.09
Nodes (23): firebase, firebase-admin, lucide-react, next, dependencies, firebase, firebase-admin, lucide-react (+15 more)

### Community 8 - "train_transaction_model.py"
Cohesion: 0.12
Nodes (21): Path, export_model(), extract_tree(), Export trained XGBoost model to JSON for TypeScript inference. Run this after…, Recursively extract tree structure from XGBoost booster., count_nodes(), evaluate(), export_model() (+13 more)

### Community 9 - "seedData.ts"
Cohesion: 0.14
Nodes (15): db, seed(), ACCOUNT_NAMES, BANKS, CITIES, FLAG_TYPES, generateSeed(), mulberry32() (+7 more)

### Community 10 - "DashboardContent.tsx"
Cohesion: 0.07
Nodes (24): AnalyticsContent(), AnalyticsData, CHART_COLORS, DashboardContent(), safeStat(), colorMap, Plot, SankeyChartProps (+16 more)

### Community 11 - "xgboostPredictor.ts"
Cohesion: 0.22
Nodes (15): buildFeatureVector(), computeMLScore(), computeMLScoreSync(), countSplitFeatures(), getFeatureImportances(), getFeatureIndex(), isValidTree(), loadModel() (+7 more)

### Community 12 - "multi-agent-orchestration.skill"
Cohesion: 0.15
Nodes (12): Claude Code frontend phase, Configuration, Connects Claude Code, OpenCode, Kimi Code, and Hermes Agent, Entry point, Hermes Agent analysis phase, Hermes Agent integration synthesis, Kimi Code ML/Data Science phase, Main orchestration function (+4 more)

### Community 13 - "rateLimit.ts"
Cohesion: 0.22
Nodes (11): Bucket, buckets, evictStale(), getClientKey(), lastEviction, rateLimit(), RateLimitResult, NOTE: On serverless (Vercel), each function instance has its own memory, so (+3 more)

### Community 14 - "recompute_ml_scores.py"
Cohesion: 0.27
Nodes (11): build_feature_vector(), get_feature_index(), load_model(), main(), platt_scale(), predict(), True Platt scaling: P(y=1) = 1 / (1 + exp(A * raw + B)), Iterative tree traversal. (+3 more)

### Community 15 - "useFirestoreData"
Cohesion: 0.07
Nodes (32): AccountsContent(), RISK_OPTIONS, AlertsContent(), buildGraphData(), EDGE_COLORS, NetworkGraph(), TransactionsContent(), Button (+24 more)

### Community 16 - "analytics/route.ts"
Cohesion: 0.67
Nodes (3): computeAnalytics(), dynamic, GET()

### Community 17 - "import-csv-to-firestore.js"
Cohesion: 0.31
Nodes (10): commitWithRetry(), computeFlags(), computeMLScore(), fs, main(), parseCSV(), parseCSVLine(), path (+2 more)

### Community 18 - "layout.tsx"
Cohesion: 0.25
Nodes (6): inter, jetbrainsMono, metadata, navItems, Sidebar(), SidebarOverlay()

### Community 20 - "muleSeed.ts"
Cohesion: 0.18
Nodes (9): AccountDef, ACCOUNTS, ALERTS, MuleSeedAccount, MuleSeedAlert, MuleSeedBundle, MuleSeedTransaction, TRANSACTIONS (+1 more)

### Community 21 - "Money Mule Detection: Current State-of-the-Art and Best Practices Research Report"
Cohesion: 0.20
Nodes (9): 1. Advanced Detection Methodologies, 2. Feature Engineering and Temporal Aspects, 3. Implementation Framework and Operational Best Practices, 4. Regulatory Landscape and Performance Expectations, Executive Summary, Key Takeaways, Methodology, Money Mule Detection: Current State-of-the-Art and Best Practices Research Report (+1 more)

### Community 25 - "generate_all_synthetic_data"
Cohesion: 0.36
Nodes (7): generate_alerts(), generate_all_synthetic_data(), generate_network_transfers(), generate_transactions(), Generate realistic transactions between accounts, Generate network-style transfers between accounts, Generate alerts based on suspicious patterns

### Community 27 - "route.ts"
Cohesion: 0.43
Nodes (7): computeStats(), dynamic, GET(), loadAccounts(), loadAlerts(), loadTransactions(), toFinite()

### Community 28 - "MekaVerse Design Tokens Documentation"
Cohesion: 0.29
Nodes (6): 🎨 Color Palette, MekaVerse Design Tokens Documentation, 📂 Organization, 📐 Spacing System, 🔤 Typography, 🎭 UI Components

### Community 29 - "orchestration.sh"
Cohesion: 0.52
Nodes (6): main(), run_claude_code(), run_hermes(), run_kimi(), run_opencode(), orchestration.sh script

### Community 30 - "generate-synthetic-data.ts"
Cohesion: 0.38
Nodes (6): Alert, generateSyntheticData(), getRandomDate(), RawAccount, Transaction, weightedRandomChoice()

### Community 31 - "validate_framework.py"
Cohesion: 0.47
Nodes (5): check_directory(), check_file(), main(), Check if a file exists and is readable., Check if a directory exists.

### Community 34 - "combine_ml_params.py"
Cohesion: 0.50
Nodes (3): platt_nll(), platt_sigmoid(), Task 3: Combine and export ml_params.json…

### Community 35 - "rebuild_full.py"
Cohesion: 0.50
Nodes (4): assign_bank(), make_acm_row(), Full dataset rebuild for 100% referential integrity. Fixes: 1. ALL ACM IDs from…, Derive bank from ACC partners. Fallback: hash-based assignment.

### Community 36 - "README.md"
Cohesion: 0.50
Nodes (3): Deploy on Vercel, Getting Started, Learn More

### Community 38 - "parse_hour"
Cohesion: 0.67
Nodes (3): main(), parse_hour(), Extract hour from ISO timestamp string.

## Knowledge Gaps
- **231 isolated node(s):** `RISK_OPTIONS`, `CHART_COLORS`, `AnalyticsData`, `Account`, `Alert` (+226 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **11 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `useFirestoreData()` connect `useFirestoreData` to `DashboardContent.tsx`, `mockData.ts`?**
  _High betweenness centrality (0.004) - this node is a cross-community bridge._
- **Why does `dependencies` connect `dependencies` to `devDependencies`?**
  _High betweenness centrality (0.004) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `useFirestoreData()` (e.g. with `mapAlert()` and `normalizeAccount()`) actually correct?**
  _`useFirestoreData()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `RISK_OPTIONS`, `CHART_COLORS`, `AnalyticsData` to the rest of the system?**
  _231 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `detectionEngine.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.058496853017400964 - nodes in this community are weakly interconnected._
- **Should `SIH 2026 - MuleGuard Comprehensive Audit Report` be split into smaller, more focused modules?**
  _Cohesion score 0.041666666666666664 - nodes in this community are weakly interconnected._
- **Should `main.py` be split into smaller, more focused modules?**
  _Cohesion score 0.07308970099667775 - nodes in this community are weakly interconnected._