# Graph Report - mule-detection  (2026-08-25)

## Corpus Check
- 99 files · ~10,171,167 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 730 nodes · 1008 edges · 68 communities (49 shown, 19 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 8 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `0455a21b`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- detectionEngine.ts
- SIH 2026 - MuleGuard Comprehensive Audit Report
- main.py
- devDependencies
- compilerOptions
- transactionXgboost.ts
- AnalyticsContent.tsx
- dependencies
- train_transaction_model.py
- seedData.ts
- mockData.ts
- xgboostPredictor.ts
- BipartiteNetwork.tsx
- NetworkGraph.tsx
- DashboardContent.tsx
- rateLimit.ts
- multi-agent-orchestration.skill
- recompute_ml_scores.py
- AlertsContent.tsx
- Button.tsx
- generate_hierarchical_hypergraph.py
- import-csv-to-firestore.js
- layout.tsx
- HierarchicalHypergraph.tsx
- muleSeed.ts
- build_layout
- Money Mule Detection: Current State-of-the-Art and Best Practices Research Report
- generate_bipartite_network.py
- LoadingState.tsx
- generate_all_synthetic_data
- AccountsContent.tsx
- data-local/route.ts
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
- error.tsx
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
3. `useFirestoreData()` - 12 edges
4. `SIH 2026 - MuleGuard Comprehensive Audit Report` - 12 edges
5. `MuleDetectionEngine` - 11 edges
6. `DirectedGraph` - 10 edges
7. `LoadingState()` - 9 edges
8. `Money Mule Detection: Current State-of-the-Art and Best Practices Research Report` - 9 edges
9. `scripts` - 8 edges
10. `PageHeader()` - 8 edges

## Surprising Connections (you probably didn't know these)
- `SIH 2026 Audit Report` --semantically_similar_to--> `Design Tokens`  [INFERRED] [semantically similar]
  SIH_AUDIT_REPORT.md → design-tokens.md
- `seed()` --calls--> `generateSeed()`  [EXTRACTED]
  scripts/seed-firestore.ts → src/scripts/seedData.ts
- `useFirestoreData()` --indirect_call--> `normalizeAccount()`  [INFERRED]
  src/lib/useFirestoreData.ts → src/lib/normalizers.ts
- `useFirestoreData()` --indirect_call--> `mapAlert()`  [INFERRED]
  src/lib/useFirestoreData.ts → src/lib/normalizers.ts
- `AccountsContent()` --calls--> `useFirestoreData()`  [EXTRACTED]
  src/components/AccountsContent.tsx → src/lib/useFirestoreData.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Multi-Agent Orchestration Flow** — hermes_orchestrator_config, hermes_multi_agent_skill, agents [EXTRACTED 0.90]
- **UI Asset Collection** — public_file, public_globe, public_window [INFERRED 0.80]

## Communities (68 total, 19 thin omitted)

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
Nodes (28): eslint, eslint-config-next, devDependencies, eslint, eslint-config-next, tailwindcss, @tailwindcss/postcss, @types/node (+20 more)

### Community 4 - "compilerOptions"
Cohesion: 0.07
Nodes (28): dom, dom.iterable, esnext, **/*.mts, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules (+20 more)

### Community 5 - "transactionXgboost.ts"
Cohesion: 0.14
Nodes (25): AccountData, buildRiskFactors(), clamp(), extractTransactionFeatures(), initTransactionModel(), safeNum(), scoreAllTransactions(), scoreTransaction() (+17 more)

### Community 6 - "AnalyticsContent.tsx"
Cohesion: 0.10
Nodes (18): AnalyticsContent(), AnalyticsData, CHART_COLORS, PATTERN_LINES, colorMap, Plot, SankeyChart(), SankeyChartProps (+10 more)

### Community 7 - "dependencies"
Cohesion: 0.09
Nodes (23): firebase, firebase-admin, lucide-react, next, dependencies, firebase, firebase-admin, lucide-react (+15 more)

### Community 8 - "train_transaction_model.py"
Cohesion: 0.12
Nodes (21): Path, export_model(), extract_tree(), Export trained XGBoost model to JSON for TypeScript inference. Run this after…, Recursively extract tree structure from XGBoost booster., count_nodes(), evaluate(), export_model() (+13 more)

### Community 9 - "seedData.ts"
Cohesion: 0.14
Nodes (15): db, seed(), ACCOUNT_NAMES, BANKS, CITIES, FLAG_TYPES, generateSeed(), mulberry32() (+7 more)

### Community 10 - "mockData.ts"
Cohesion: 0.07
Nodes (33): Account, accountNames, accounts, Alert, alerts, banks, flagTypes, GraphEdge (+25 more)

### Community 11 - "xgboostPredictor.ts"
Cohesion: 0.22
Nodes (15): buildFeatureVector(), computeMLScore(), computeMLScoreSync(), countSplitFeatures(), getFeatureImportances(), getFeatureIndex(), isValidTree(), loadModel() (+7 more)

### Community 12 - "BipartiteNetwork.tsx"
Cohesion: 0.16
Nodes (9): BipartiteEdge, BipartiteNetwork(), EntityNode, FlowFilter, formatINR(), MuleNode, NodeKind, Snapshot (+1 more)

### Community 13 - "NetworkGraph.tsx"
Cohesion: 0.15
Nodes (13): calculateBounds(), formatINR(), GraphAccount, GraphMode, GraphModeSnapshot, GraphNode, GraphSnapshot, GraphTransaction (+5 more)

### Community 14 - "DashboardContent.tsx"
Cohesion: 0.36
Nodes (3): DashboardContent(), safeStat(), formatCurrencyINR()

### Community 15 - "rateLimit.ts"
Cohesion: 0.22
Nodes (11): Bucket, buckets, evictStale(), getClientKey(), lastEviction, rateLimit(), RateLimitResult, NOTE: On serverless (Vercel), each function instance has its own memory, so (+3 more)

### Community 16 - "multi-agent-orchestration.skill"
Cohesion: 0.17
Nodes (11): Claude Code frontend phase, Configuration, Connects Claude Code, OpenCode, Kimi Code, and Hermes Agent, Entry point, Hermes Agent analysis phase, Hermes Agent integration synthesis, Kimi Code ML/Data Science phase, Main orchestration function (+3 more)

### Community 17 - "recompute_ml_scores.py"
Cohesion: 0.27
Nodes (11): build_feature_vector(), get_feature_index(), load_model(), main(), platt_scale(), predict(), True Platt scaling: P(y=1) = 1 / (1 + exp(A * raw + B)), Iterative tree traversal. (+3 more)

### Community 18 - "AlertsContent.tsx"
Cohesion: 0.21
Nodes (8): AlertsContent(), TransactionsContent(), FilterBar(), FilterBarProps, FilterConfig, FilterOption, LoadingState(), useFirestoreData()

### Community 19 - "Button.tsx"
Cohesion: 0.29
Nodes (6): Button, ButtonProps, ButtonSize, ButtonVariant, sizeClasses, variantClasses

### Community 20 - "generate_hierarchical_hypergraph.py"
Cohesion: 0.33
Nodes (10): classify_component(), compact_account(), compact_transaction(), layout_component(), main(), normalize(), Any, Build an HGNN-style hierarchical hypergraph from the complete synthetic data.… (+2 more)

### Community 21 - "import-csv-to-firestore.js"
Cohesion: 0.31
Nodes (10): commitWithRetry(), computeFlags(), computeMLScore(), fs, main(), parseCSV(), parseCSVLine(), path (+2 more)

### Community 22 - "layout.tsx"
Cohesion: 0.25
Nodes (6): inter, jetbrainsMono, metadata, navItems, Sidebar(), SidebarOverlay()

### Community 23 - "HierarchicalHypergraph.tsx"
Cohesion: 0.18
Nodes (11): formatINR(), GraphAccount, GraphTransaction, HierarchicalHypergraph(), dashedLine(), position(), Hypernode, Selection (+3 more)

### Community 25 - "muleSeed.ts"
Cohesion: 0.18
Nodes (9): AccountDef, ACCOUNTS, ALERTS, MuleSeedAccount, MuleSeedAlert, MuleSeedBundle, MuleSeedTransaction, TRANSACTIONS (+1 more)

### Community 26 - "build_layout"
Cohesion: 0.31
Nodes (9): Layout, build_layout(), component_layout(), main(), pack_components(), Any, Build a compact, deployment-safe graph snapshot from the complete synthetic…, Pack component circles into one compact, non-overlapping canvas. (+1 more)

### Community 27 - "Money Mule Detection: Current State-of-the-Art and Best Practices Research Report"
Cohesion: 0.20
Nodes (9): 1. Advanced Detection Methodologies, 2. Feature Engineering and Temporal Aspects, 3. Implementation Framework and Operational Best Practices, 4. Regulatory Landscape and Performance Expectations, Executive Summary, Key Takeaways, Methodology, Money Mule Detection: Current State-of-the-Art and Best Practices Research Report (+1 more)

### Community 28 - "generate_bipartite_network.py"
Cohesion: 0.33
Nodes (8): brandes_betweenness(), build_layout(), compact_account(), main(), Any, Construct an exact bipartite financial-crime network from the synthetic…, Exact directed Brandes centrality for the selected bipartite graph., Constrained force-directed bipartite layout with fixed parallel columns.

### Community 30 - "LoadingState.tsx"
Cohesion: 0.18
Nodes (11): Column, DataTable(), DataTableProps, defaultRender(), defaultIcons, EmptyState(), EmptyStateProps, LoadingStateProps (+3 more)

### Community 31 - "generate_all_synthetic_data"
Cohesion: 0.36
Nodes (7): generate_alerts(), generate_all_synthetic_data(), generate_network_transfers(), generate_transactions(), Generate realistic transactions between accounts, Generate network-style transfers between accounts, Generate alerts based on suspicious patterns

### Community 32 - "AccountsContent.tsx"
Cohesion: 0.24
Nodes (6): AccountsContent(), RISK_OPTIONS, PageHeader(), PageHeaderProps, RISK_STYLES, RiskBadge()

### Community 33 - "data-local/route.ts"
Cohesion: 0.43
Nodes (7): computeStats(), dynamic, GET(), loadAccounts(), loadAlerts(), loadTransactions(), toFinite()

### Community 34 - "MekaVerse Design Tokens Documentation"
Cohesion: 0.29
Nodes (6): 🎨 Color Palette, MekaVerse Design Tokens Documentation, 📂 Organization, 📐 Spacing System, 🔤 Typography, 🎭 UI Components

### Community 35 - "orchestration.sh"
Cohesion: 0.52
Nodes (6): main(), run_claude_code(), run_hermes(), run_kimi(), run_opencode(), orchestration.sh script

### Community 36 - "generate-synthetic-data.ts"
Cohesion: 0.38
Nodes (6): Alert, generateSyntheticData(), getRandomDate(), RawAccount, Transaction, weightedRandomChoice()

### Community 37 - "validate_framework.py"
Cohesion: 0.47
Nodes (5): check_directory(), check_file(), main(), Check if a file exists and is readable., Check if a directory exists.

### Community 39 - "combine_ml_params.py"
Cohesion: 0.50
Nodes (3): platt_nll(), platt_sigmoid(), Task 3: Combine and export ml_params.json…

### Community 40 - "rebuild_full.py"
Cohesion: 0.50
Nodes (4): assign_bank(), make_acm_row(), Full dataset rebuild for 100% referential integrity. Fixes: 1. ALL ACM IDs from…, Derive bank from ACC partners. Fallback: hash-based assignment.

### Community 44 - "README.md"
Cohesion: 0.50
Nodes (3): Deploy on Vercel, Getting Started, Learn More

### Community 46 - "parse_hour"
Cohesion: 0.67
Nodes (3): main(), parse_hour(), Extract hour from ISO timestamp string.

### Community 47 - "analytics/route.ts"
Cohesion: 0.67
Nodes (3): computeAnalytics(), dynamic, GET()

## Knowledge Gaps
- **264 isolated node(s):** `orchestrate.sh script`, `eslintConfig`, `nextConfig`, `name`, `version` (+259 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **19 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `LoadingState()` connect `AlertsContent.tsx` to `AccountsContent.tsx`, `AnalyticsContent.tsx`, `BipartiteNetwork.tsx`, `NetworkGraph.tsx`, `DashboardContent.tsx`, `HierarchicalHypergraph.tsx`, `LoadingState.tsx`?**
  _High betweenness centrality (0.006) - this node is a cross-community bridge._
- **Why does `PageHeader()` connect `AccountsContent.tsx` to `BipartiteNetwork.tsx`, `NetworkGraph.tsx`, `DashboardContent.tsx`, `AlertsContent.tsx`, `HierarchicalHypergraph.tsx`?**
  _High betweenness centrality (0.004) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `useFirestoreData()` (e.g. with `mapAlert()` and `normalizeAccount()`) actually correct?**
  _`useFirestoreData()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `orchestrate.sh script`, `eslintConfig`, `nextConfig` to the rest of the system?**
  _264 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `detectionEngine.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.058496853017400964 - nodes in this community are weakly interconnected._
- **Should `SIH 2026 - MuleGuard Comprehensive Audit Report` be split into smaller, more focused modules?**
  _Cohesion score 0.041666666666666664 - nodes in this community are weakly interconnected._
- **Should `main.py` be split into smaller, more focused modules?**
  _Cohesion score 0.07308970099667775 - nodes in this community are weakly interconnected._