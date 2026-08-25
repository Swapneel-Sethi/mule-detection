# MuleGuard

Mule-account detection dashboard built for SIH 2026: a Next.js App Router app that
scores synthetic banking data with a layered detection engine (heuristics +
XGBoost inference) and visualises risk on a monochrome dashboard and a 3D force
galaxy.

## Stack

- Next.js 16 (App Router, Turbopack), React 19, TypeScript strict mode
- Tailwind CSS v4 (CSS-first tokens in `src/app/globals.css`, spec in `design-tokens.md`)
- Recharts + Plotly for analytics charts, `3d-force-graph` (three.js) for `/graph`
- No database — the app reads JSON datasets from `public/` through `/api/*` routes

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Other scripts: `npm run build`, `npm run start`, `npm run lint`, `npm run typecheck`.

## Data provenance

The runtime datasets in `public/` are generated, not hand-written:
`accounts_dataset.json` (~92 MB), `transactions_synthetic.json`,
`alerts_synthetic.json` come from the Python pipeline in `scripts/`
(`generate_dataset_json.py`, `build_real_mules.py`, `generate_synthetic_data.py`,
`recompute_ml_scores.py`, …) starting from the raw CSV in this directory. ML
weights served to the browser/server (`model_weights.json`,
`transaction_model.json`) are exported by `scripts/export_xgboost.py` /
`convert_model.py` after training.

## API routes

| Endpoint | Purpose |
|---|---|
| `GET /api/data-local` | Filtered/paginated accounts + transactions + alerts + stats |
| `GET /api/analytics` | Module-cached chart aggregates (Sankey flows, cycles, volumes) |
| `GET /api/graph/mule-galaxy` | Nodes/links payload for the `/graph` galaxy view |

For the full architecture tour see `../CODEBASE_MAP.md`; for current audit
findings see `../audit/wave2/`.
