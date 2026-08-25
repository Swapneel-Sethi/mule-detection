# VERIFY-D3-5 [GRAPHS-VIZ VERIFY - READ-ONLY]

Re-run of `raw/D3-5.md` numeric integrity checks against CURRENT artifacts, 2026-08-25 ~23:57 IST.
Method: python replication of `src/app/api/graph/mule-galaxy/route.ts` build logic over `public/accounts_dataset.json` + `public/transactions_synthetic.json`; no bulk data printed; no files edited.

## Artifact state (actual, post-regeneration)

| File | Size | Mtime | Note |
|---|---|---|---|
| public/accounts_dataset.json | 92,482,105 B | Aug 25 23:36 | regenerated AFTER the D3-5 audit |
| public/transactions_synthetic.json | 17,974,714 B | Aug 23 23:28 | unchanged |

Galaxy payload has NO static artifact in `public/` — it is runtime-built by `route.ts` (module-level `cachedPayload`). Verification therefore simulates that exact logic.

## Headline: every measured number reproduces the audit baseline EXACTLY

The regeneration produced statistically identical output; all findings remain numerically valid.

## Counts

- accounts_dataset records **105,501**; transactions records **99,952**
- Simulated galaxy payload: **nodes=8,578 links=7,952 mules=1,962 highRisk=6,616 totalVolume=258,359,658.00 flaggedVolume=258,344,425.33** (identical to audit)
- Node universe = flagged predicate exactly: `is_mule==True ∨ risk_level∈{critical,high}` → 8,578 (= nodes); ≠ 105,501 total **by design** ("ML-flagged accounts")
- Partition: Active-Mules 1,962 + Watchlist 6,616 = **8,578 = nodes** ✓
- Score branches: `cal×100: 8578, cal>1: 0, fallback: 0` (calibrated_score max 0.856 → >1 branch dead, still true)
- Degree-0 nodes: **53 / 8,578** (unchanged); corridors pre-cap 7,952 = 7,941 flagged + 11 unflagged; txns skipped by both-flagged predicate: 92,000; MAX_LINKS cap not approached (7,952 < 40,000)

## Referential integrity — PASS

- Txn endpoints: **99,952/99,952 resolve** against all 105,501 account ids (unres src=0, tgt=0); self-loops **0**
- Galaxy link endpoints ⊆ node ids: **True by construction** (7,952/7,952); self-loop links **0**
- account_id blank **0**, duplicate **0**, unique 105,501

## Score ranges — PASS, zero >100 survivors anywhere

| Field | n | min | max | >100 | <0 |
|---|---|---|---|---|---|
| accounts.risk_score | 105,501 | 5.3 | 85.6 | 0 | 0 |
| accounts.calibrated_score | 105,501 | 0.053 | 0.856 | 0 | 0 |
| accounts.ml_score | 105,501 | 0.262 | 0.466 | 0 | 0 |
| accounts.graph_score | 105,501 | 0 | 5 | 0 | 0 |
| accounts.hub_score | 105,501 | −1.02e−26 | 1.99e−05 | 0 | **1** |
| accounts.authority_score | 105,501 | −1.51e−22 | 0.1068 | 0 | **1** |
| txn.riskScore | 99,952 | 0.10 | 100.00 | **0** | 0 |
| node.score (clamped) | 8,578 | 56.0 | 85.6 | 0 | 0 |

- Mixed txn riskScore scale survives: **(0,1]: 7,469 · >1: 92,483** (max exactly 100.00) — D4#29 still open, no viz impact (galaxy route never reads txn riskScore)
- Negative-HITS epsilon rows persist in the regenerated artifact, same accounts: **ACC000175DA hub=−1.0221e−26**, **ACC00000761 authority=−1.5087e−22** — harmless today, breaks any future ≥0 invariant

## Timestamps — PASS

- bad timestamps **0**; suffix census 99,952/99,952 `.000Z`; **180 distinct days, 2026-01-01..2026-06-29** (matches payload lastDay range, distinct=180); UTC-date bucketing policy split vs IST charts unchanged

## ID formats — PASS

- Accounts: `ACC*` **98,500** + legacy `ACM*` **7,001**; ACM batch is again **exactly** the 7,001 rows missing `account_age_days` (D4#23 tie-in intact); txns `TXN*` **99,952**; blanks/dups 0

## Finding status at HEAD (source re-inspection)

| Finding | Status |
|---|---|
| [P2 REGRESSION] data-local highRisk inverted (always 0) | **FIXED by another agent** — `route.ts:171-179` now `mules = is_mule && severityTier`, `highRisk = total − mules`, computed over `flaggedAccounts` (`route.ts:128`) → yields 1,962 / 6,616 on current data = galaxy meta.highRisk ✓ |
| [P1] route.ts:49 module-level `cachedPayload`, no TTL/stampede guard; `generatedAt` dead field | **STILL PRESENT** — route.ts byte-identical to audited state |
| [P2] MuleGalaxy.tsx radiusCache survives reloads (A22) | **FIXED by another agent** — `radiusCache.clear()` added in fetch effect at MuleGalaxy.tsx:521 |
| [P3] dead `cal>1` branch / redundant validLinks filter / unconsumed totalVolume | STILL PRESENT (numbers above confirm deadness) |
| [P3] 53 degree-0 isolated dots (#27) | STILL PRESENT (re-measured 53) |
| [P3] mixed txn riskScore scale (D4#29) | STILL PRESENT (7,469 rows ≤1.0) |
| [P3 NEW] `lastDay` actually earliest day | STILL PRESENT (route.ts:31-32 docstring says "Earliest"; min-day logic line 105) |
| [P3 NEW] corridor day bucketed UTC vs IST split (A12) | STILL PRESENT (all stamps `.000Z`) |
| [P3 NEW] negative HITS epsilon rows | STILL PRESENT (rows listed above) |

Stale graph artifacts (`network_graph*`, `bipartite*`, `hypergraph*.json`) remain ABSENT from `public/`. Working tree at verify time had unrelated modifications by other agents: `scripts/recompute_ml_scores.py`, `src/app/api/data-local/route.ts`, `src/components/DashboardContent.tsx`.

## VERDICT

Data-integrity slice: **CLEAN** — counts, referential integrity, score ranges (no >100), ID formats all pass on the regenerated artifact; all audit measurements reproduce exactly. Remaining defects are code-side (P1 cache staleness et al.) owned by other lines; two were already fixed by other agents before this verify.
