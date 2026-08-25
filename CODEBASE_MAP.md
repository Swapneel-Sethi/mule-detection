# MuleGuard — Codebase Architecture Map

> Repo: `Swapneel-Sethi/mule-detection` · Generated 2026-08-25
> Monorepo root `C:\MISCELLANEOUS PROJECTS\SIH_2026\1` contains config + Python graph tooling;
> the actual web app lives in **`mule-detection/`** (Next.js 16.3.1 App Router, React 19, TypeScript).

---

## 0. Top-Level Layout

```
1/                                  ← outer git repo (branch: master)
├── mule-detection/                 ← INNER git repo (branch: main) — the Next.js app
│   ├── src/{app,components,lib,scripts}/
│   ├── scripts/                    ← data-pipeline & ML training scripts
│   ├── backend/main.py             ← standalone FastAPI Graph-ML service
│   ├── public/*.json               ← ALL runtime data (~92 MB accounts_dataset.json!)
│   ├── SIH_AUDIT_REPORT.md         ← superseded audit snapshot (see audit/wave2/)
│   ├── transactions_1m (1) (1).csv ← 73 MB raw source dataset (gitignored via *.csv)
│   └── next.config.ts, vercel.json
├── build_graph.py, detect_mule.py, ast_extract.py,
│   merge_extract.py, health_check.py, print_detect.py   ← "graphify" code-graph pipeline
├── graphify-out/                   ← generated codebase knowledge graph (graph.html/json)
├── audit/wave2/                    ← CURRENT findings (remediation digests)
├── ml_audit.md                     ← superseded ML-bug digest (see audit/wave2/)
├── ui_ux_flaws.md, session-ses_ffa6.md
└── PROJECTS/SIH_2026/1/            ← stray partial copy of mule-detection/src (dead weight)
```

**⚠️ Nested-repo gotcha:** `mule-detection/` is its own git repo embedded in the outer one
(gitlink, not a submodule). Outer repo tracks branch `master`; inner tracks `main`. Both remotes
point at the same GitHub URL. Commits/pushes must happen inside `mule-detection/`.

---

## 1. Next.js App (`mule-detection/`)

### Routes (`src/app/`) — all thin wrappers rendering client components

| Route | File | Purpose |
|---|---|---|
| `/` | `src/app/page.tsx` → `DashboardContent` | KPI dashboard: stat cards, risk distribution, top-risk accounts, recent alerts |
| `/accounts` | `src/app/accounts/page.tsx` → `AccountsContent` | Filterable/sortable account table (risk levels, search) |
| `/transactions` | `src/app/transactions/page.tsx` → `TransactionsContent` | Flagged transaction table w/ risk scores |
| `/alerts` | `src/app/alerts/page.tsx` → `AlertsContent` | Alert triage list (severity, status) |
| `/analytics` | `src/app/analytics/page.tsx` → `AnalyticsContent` | Charts: volume-by-day, patterns timeline, Sankey money flows, circular paths, top banks |
| `/graph` | `src/app/graph/page.tsx` → `MuleGalaxy` | 3D force-directed galaxy of ML-flagged mule accounts + money-flow corridors |

Supporting app files: `layout.tsx` (root shell: Inter + JetBrains Mono fonts, `<Sidebar/>`, skip-nav, MuleGuard metadata), `error.tsx`, `global-error.tsx`, `loading.tsx`, `not-found.tsx`, `globals.css`.

### API Routes (`src/app/api/`)

| Endpoint | Purpose |
|---|---|
| `GET /api/data-local` | **Primary data endpoint.** Reads + caches `public/accounts_dataset.json`, `public/transactions_synthetic.json`, `public/alerts_synthetic.json` from disk. Filters to `is_mule===true \|\| risk_level∈{critical,high}`, supports `page/limit/sort/order/category/risk/q/transactions/alerts` params, computes stats server-side, returns `{accounts, transactions, alerts, stats, pagination}` |
| `GET /api/analytics` | Precomputes (module-cached) analytics aggregates from same 3 JSON files: bank counts, pattern flags, FANIN/FANOUT/PASSTHROUGH/CIRCULAR turnover, Sankey flows, daily volume, hourly alerts, top-20 cycles |
| `GET /api/alerts/count` | Lightweight active-alert count (badge polling) |
| `GET /api/graph/mule-galaxy` | Builds + caches the nodes/links payload `MuleGalaxy` renders on `/graph` |

All four routes: `export const dynamic = "force-dynamic"`.

### Key Components (`src/components/`)
- `DashboardContent.tsx`, `AccountsContent.tsx`, `TransactionsContent.tsx`, `AlertsContent.tsx`, `AnalyticsContent.tsx` — page bodies; first four all consume `useLocalData()`.
- `Sidebar.tsx` / `SidebarOverlay.tsx` — fixed left nav (/, /accounts, /transactions, /graph, /alerts, /analytics).
- `MuleGalaxy.tsx` — 3D force-directed galaxy (`3d-force-graph` + three.js); fetches `/api/graph/mule-galaxy`.
- `SankeyChart.tsx` — Plotly Sankey for analytics money flows.
- `ui/*` — design-system primitives: `Button`, `Card`, `DataTable`, `EmptyState`, `ErrorState`, `FilterBar`, `LoadingState`, `PageHeader`, `RiskBadge`, `Skeleton`, `StatCard`.

### Lib modules (`src/lib/`)
- **`useLocalData.ts`** — THE data layer. Client hook fetching `/api/data-local?page=&limit=1000&sort=risk_score&order=desc&transactions=true&alerts=true&category=`; abortable, paginated (`loadMore`/`setPage`). On failure keeps any real data already loaded and shows an error banner — never falls back to demo data.
- **`normalizers.ts`** — maps raw snake_case records → `MappedAccount` (camelCase incl. behavioralScore, graphScore, temporalScore, pagerankScore…), `mapAlert`, `computeStats`.
- **`mockData.ts`** — legacy demo shapes; not imported at runtime (only its types are re-used by `useLocalData.ts`).
- **`detectionEngine.ts`** (~1,844 lines) — research-backed scoring engine v4 (DAN Framework, GNN ensembles, Markov temporal, PageRank anomaly propagation). Orchestrates everything below.
- **`xgboostPredictor.ts` / `transactionXgboost.ts`** — TS inference over exported tree models fetched from `/model_weights.json` and `/transaction_model.json` (5-min cache). Models lazy-preload on the first sync call — residual cold-start race, see Quirks.
- **`mlModel.ts`** — hand-authored gradient-boost *fallback* trees used when real XGBoost fails to load.
- **`transactionScorer.ts`** — per-txn risk scoring (16 features; heuristic fallback built in).
- **`markovModel.ts`** — behavioral state-transition modeling (MuleTrack-inspired).
- **`reportGenerator.ts`** — analyst compliance reports (DAN-style).
- **`rateLimit.ts`** — in-memory fixed-window limiter (**per serverless instance**).
- **`utils.ts`** — locale-aware formatters (`formatCurrencyINR` etc.).

### Middleware / Proxy
`src/proxy.ts` (Next 16 convention — replaces `middleware.ts`). Matcher `/api/:path*`: per-IP rate limiting via `rateLimit.ts` (120 req/min default; 429 + `Retry-After`/`X-RateLimit-*` headers). No auth middleware exists — the app has **no login/auth flow**.

### Styling System
Tailwind CSS **v4** (CSS-first, `@theme inline` in `src/app/globals.css`; `@tailwindcss/postcss`). Custom monochrome tokens: `void/bone/charcoal/frost/ash/surface-{1,2}`, semantic `risk-{critical,high,medium,low}`, chart accents per pattern (fanin/passthrough/circular/fanout), fluid type scale via `clamp()`. Fonts: Inter (`--font-display`), JetBrains Mono (`--font-mono`). Design spec: `design-tokens.md`.

---

## 2. Data Flow

```
CSV (transactions_1m…) ──► mule-detection/scripts/*.py|ts ──► public/*.json
                                                                  │
Browser ──fetch──► /api/data-local, /api/analytics ◄──fs read+cache─┘
   │                        (Node runtime, force-dynamic)
   └──useLocalData() ──► normalizeAccount/mapAlert ──► pages
              │ on error
              └──► error banner (real data kept if any was loaded)
/graph ──fetch──► /api/graph/mule-galaxy ◄──fs read+cache── public/*.json
ML runtime ──fetch──► /model_weights.json, /transaction_model.json (static assets)
```

### External database fully removed
No removed-provider client/Admin SDK in `package.json`, no managed-database rules or seeding
scripts, no provider config anywhere in the tree. The web layer reads **only local
JSON files** via `/api/*`. Two harmless name echoes remain: `DashboardContent.tsx`
still string-compares `source === "managed-db"`, and `src/scripts/seedData.ts`
mentions the removed provider in a comment.

---

## 3. Root-Level Python Scripts

These are **NOT about financial mules** — they are a pipeline for the third-party **`graphify`** library that builds a *knowledge graph of this codebase* (nodes = files/symbols; output in `graphify-out/`, rendered to `graph.html`). Run order:

| Script | Does |
|---|---|
| `detect_mule.py` | `graphify.detect.detect('mule-detection')` → file inventory → `.graphify_detect.json` |
| `ast_extract.py` | AST extraction of code files → `.graphify_ast.json` |
| `merge_extract.py` | Merges AST + semantic extraction (+hyperedges) → `.graphify_extract.json` |
| `build_graph.py` | Builds NetworkX graph, clusters communities, finds god-nodes/surprises, writes `graphify-out/graph.json` + `GRAPH_REPORT.md` (refuses to shrink existing graph) |
| `health_check.py` | Diagnostics: dangling/self-loop/collapsed edges → OK/warn |
| `print_detect.py` | Pretty-printer for detect summary |
| `detect_step.py` | Same as `detect_mule.py` but rooted at `.` |

Relation to web app: **documentation/introspection only** — no runtime coupling. However, `AGENTS.md` release rules mandate `graphify update .` before every release commit, and `.gitattributes` gives `graphify-out/graph.json` a custom `merge=graphify` driver. (`ml_audit.md` — now superseded by `audit/wave2/` — documented separate, real ML issues.)

### App-side pipeline (`mule-detection/scripts/`) — feeds the UI
- `convert_csv_transactions.py`, `generate_dataset_json.py`, `generate_synthetic_data.py`, `generate-synthetic-data.ts`, `rebuild_full.py`, `build_real_mules.py` → produce/rebuild `public/*_dataset.json` etc. with referential integrity.
- `train_transaction_model.py`, `export_xgboost.py`, `convert_model.py`, `train_meta_learner.py`, `auto_calibrate_thresholds.py`, `combine_ml_params.py`, `recompute_ml_scores.py`, `recompute_transaction_scores.py` → train/calibrate XGBoost + export weights the TS predictor loads.
- `visualize_sankey.py` → offline Sankey PNG.

### `backend/main.py`
Standalone FastAPI + NetworkX + scikit-learn "Graph ML Analysis Engine". Not wired into the Next app (no fetches to it); separate `requirements.txt`.

---

## 4. Infra / Config

### `mule-detection/package.json`
Scripts: `dev`, `build` (`next build`), `start`, `lint` (`eslint src`), `typecheck` (`tsc --noEmit`).
Deps: `next@16.3.1`, `react/react-dom@19.2.8`, `3d-force-graph` + `three`, `lucide-react`, `plotly.js` + `react-plotly.js`, `recharts`. Dev: Tailwind v4, ESLint 9, TS 5.
Root `package-lock.json` is an empty stub — the real lockfile is inside `mule-detection/`.

### `mule-detection/next.config.ts`
- **No `output: "export"` anymore** (was added for Netlify in commit `6ae1238`, later removed) → standard server build required for the API routes.
- Pins `turbopack.root` to the app dir so ancestor lockfiles can't hijack the build.
- Global security headers incl. strict CSP (`connect-src 'self'`), X-Frame-Options DENY, HSTS, Permissions-Policy. No `serverExternalPackages`, no image `remotePatterns`.

### Deployment configs
- **Vercel is the only deploy target** (`.vercel/project.json` linked; app `vercel.json` = `{"framework":"nextjs","rewrites":[]}`).
- Netlify/removed-provider configs (`netlify.toml`, provider config, database rules, project selector) were removed from the app and the outer root during remediation — they no longer exist anywhere in the tree.

### CI
No GitHub Actions workflows remain — the broken dual-deploy workflow was removed during remediation. Branches: local `main` ↔ `origin/main`; stray `origin/master` + `origin/gh-pages` also exist.

---

## 5. Environment Variables (names only)

Application code reads almost nothing: the only custom var is `TRUST_PROXY`
(`src/lib/rateLimit.ts`; set to `"true"` to rate-limit by `X-Forwarded-For`). All
former provider vars (public client settings and service-account secrets),
route tokens (`SEED_ROUTE_TOKEN`, `DETECT_ROUTE_TOKEN`) and
database limit overrides are obsolete — nothing reads them, and the CI/deploy
secret list went away with the removed workflow.

⚠️ Secrets sitting in working tree (gitignored but present locally): `mule-detection/.env.local`, `.env.vercel.local`, generated service-account key files. Never print or commit these.

---

## 6. Known Quirks & Traps

1. **ML calibration minefield (mostly defused)** — the superseded `ml_audit.md` drove fixes now at HEAD: C2 fixed (`baseScoreLogOdds()` replaces the raw 0.5 log-odds add) and C3 mostly fixed (both models lazy-preload via `void loadModel()` on first sync call — small cold-start race only). C1's ×learning_rate stays on the account side **deliberately**: serving-contract parity with `recompute_ml_scores.py` (commented in `xgboostPredictor.ts`). Thresholds now live on a probability scale (`FLAG_THRESHOLD = 0.3`). Still read `audit/wave2/` before touching scores.
2. **Error banners, not demo data**: `useLocalData` failures surface an error banner and keep any real rows already loaded — there is no silent `mockData.ts` fallback anymore. Don't reintroduce one.
3. **Static-export history, not present state**: `output:"export"` existed for Netlify and was removed; API routes require a Node server. Don't reintroduce it.
4. **Dual/nested git repos**: outer `master`, inner `main`, both → same GitHub repo; `git status` at root shows `mule-detection` as a dirty gitlink. Plus a dead copy at `PROJECTS/SIH_2026/1/`.
5. **Massive JSON payloads**: `public/accounts_dataset.json` ≈ 92 MB loaded (then module-cached) per serverless cold start; `synthetic_dataset.json` ≈ 294 MB (gitignored); 73 MB CSV inside `mule-detection/`. Cold starts and repo size are pain points.
6. **`AGENTS.md` release automation**: every change requires `graphify update .` + build + commit + push + Vercel deploy; Next 16 auto-writes agent-rules blocks into `AGENTS.md` — keep them committed. Also: **this Next.js version (16) differs from training-data conventions** (`middleware` → `proxy.ts`, `LayoutProps<""/>`, docs in `node_modules/next/dist/docs/`).
7. **Rate limiting is in-memory per instance** — fine for hackathon, not global; Redis needed at scale.
8. **No authentication anywhere in the app** — everything is public behind rate limits.
9. **Root config drift resolved by deletion**: the stale root deployment/database configuration copies were removed during remediation. Only an empty root `package-lock.json` stub persists — the outer dir is not an npm workspace.
10. **Naming trap**: root `detect_mule.py` detects *project files* for the graphify code-graph, not financial mules. (The legacy data hook was renamed `useLocalData()` during remediation; it never used a managed cloud database.)
