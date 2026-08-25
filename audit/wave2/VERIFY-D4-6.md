# VERIFY-D4-6 — Machine verification of synthetic-data artifacts (read-only)

- Run: 2026-08-25T20:00:50Z, method: single-pass python `json.load` + full-population census (no sampling shortcuts, no file >10MB printed). No source files edited.
- Artifacts pinned by sha256:
  - `mule-detection/public/accounts_dataset.json` — 92,482,105 bytes — `880d4720b5db790d5fe37838fee511245ac512a42250794da01733ce60457c69`
  - `mule-detection/public/alerts_synthetic.json` — 60,850 bytes — `2582abb8a85eabfca6d290c6c16ea1c198fcace273ba94b9412f44f3e5fc24d2`
- Consumers cross-checked: `src/app/api/data-local/route.ts`, `src/lib/normalizers.ts`, `src/components/DashboardContent.tsx`, `src/components/AlertsContent.tsx`, `src/lib/mlModel.ts`, `src/lib/xgboostPredictor.ts`.

## Verdict summary

Artifact-level contract with `route.ts` **PASSES**: top-level arrays, exact field names, enum casing, score ranges, id uniqueness, referential integrity, kyc presence, ISO dates all clean. The three P2 data-quality defects from D4-6 and most P3s are **still present in the current artifact bytes**; two src-side P3s have already been fixed at HEAD by code changes (not artifact changes).

## A. Schema vs route expectations

- Both files are JSON arrays of objects: accounts n=105,501; alerts n=155. Matches route's `JSON.parse as Record<string, unknown>[]` cast.
- Route-touched field names present on every account row (105,501/105,501): `account_id, name, bank, risk_level, risk_score, is_mule, flags, reasons, in_txn_count, out_txn_count, total_in_amount, total_out_amount, calibrated_score, ml_score, pass_through_ratio, txn_velocity_per_day, graph_score, pagerank, firstSeen, lastActivity`.
- Extra keys on all rows (harmless, consumed via normalizer): `avg_in_amount, avg_out_amount, balance, behavioral_score, city, hub_score, inDegree, outDegree, status, totalAmount, totalTransactions, turnover, unique_receivers, unique_senders`.
- `explanation` key: present on **0** rows (normalizers maps to `null`; type allows it).
- Alert keys on 155/155 exactly: `id, type, severity, title, description, accounts[], timestamp, status, transactions[]`. No `resolved` boolean anywhere.

## B. Enumerations & casing

- `risk_level` (accounts): all lowercase, `{low: 96,923; medium: 6,616; high: 19; critical: 1,943}` — inside route/normalizer vocab.
- Banding non-overlapping vs `risk_score`: low 5.3–28.3 · medium 56.0–63.7 · high 64.8–66.1 · critical 67.2–85.6.
- `severity` (alerts): `{medium: 129, high: 25, critical: 1}`; `low` 0, `info` 0.
- `status` (alerts): `{new: 61, investigating: 46, resolved: 48}`; `dismissed` 0.
- `type` (alerts): rapid_movement 50, fan_in 40, fan_out 40, behavioral_change 25.
- `kyc_status`: strings `'1'`×83,542 / `'0'`×21,959 (matches xgboostPredictor numeric-coercion usage). `account_type`: `'0'`×69,004 / `'1'`×26,717 / `'2'`×9,780.

## C. Scores & ranges

- `risk_score`: numeric on 105,501/105,501, range 5.3–85.6, zero outside 0–100.
- `is_mule`: strict boolean on 105,501/105,501 (no 0/1) — True 8,578 / False 96,923 (by family: ACC 1,577 T / 96,923 F; ACM 7,001 T / 0 F).
- `calibrated_score`: 105,501 numeric, 0.053–0.856. `ml_score`: 105,501 numeric, 0.262–0.466.

## D. Identity & referential integrity

- Account ids unique: 105,501/105,501, 0 dupes. Families: ACC 98,500 / ACM 7,001.
- Alert ids unique 155/155. Alert→account refs: 171 distinct ids cited, **0 dangling**; 41 cited accounts are mules.
- Alert `transactions[]`: empty on 155/155 (documented stripping).

## E. Dates

- `firstSeen`: ISO `YYYY-MM-DD` on 105,461; empty string `""` on exactly **40** ACM mule rows — all 40 also lack `account_age_days` and `explanation`, so `normalizers.ts:186-197` falls through to `firstSeen = ""`. No missing keys, no epoch/other formats.
- `lastActivity`: hardcoded `"2026-08-22"` on **98,500** rows (= entire ACC family); 182 distinct values overall, real spread only on ACM.
- Invalid months (00/13+): 0. `lastActivity < firstSeen` inversions: 0. Alert timestamps: ISO-8601 UTC on 155/155, range 2026-08-15T13:48:45.840Z → 2026-08-22T11:49:12.086Z.

## F. Counts vs UI-quoted numbers

- `DashboardContent.tsx:53` fallback `105501` == measured total 105,501 ✓.
- `AccountsContent.tsx:47` comment "8,578-account All Flagged view" == measured `is_mule:true` count 8,578, and flagged universe (mule ∪ crit/high) is also exactly 8,578 because **all 19 `high` + 1,943 `critical` rows are mules** (critical/high non-mules = 0) ✓.
- Route `computeStats` now counts `muleCount = is_mule && (critical|high)` = 1,962 and Dashboard fallback (`DashboardContent.tsx:54-63`) uses the identical severe-only formula → the two definitions agree at HEAD.

## G. Data-quality defects re-measured (vs D4-6.md findings)

| Finding | Status at current bytes |
|---|---|
| [P2] `pass_through_ratio` epsilon-divide blowup | CONFIRMED: buckets ≤1: 17,751 · 1–100: 65,334 · 100–1e6: 1,198 · >1e6: **21,218**, max 1.1731859e10. `ACC00004BEC`: tin=0.0, tout=19788.29, ptr=1,978,829,000. Consumer `mlModel.ts` Tree-1 threshold 0.85 sits mid-noise. |
| [P2] `account_age_days` absent on ACM mules | CONFIRMED: present 98,500/98,500 ACC rows; **0/7,001** ACM mule rows (XGBoost feature #0 → coerced default). |
| [P2] `txn_velocity_per_day` dual scale | CONFIRMED: ACC 0–1116.34 vs ACM 0–0.1389 under one column. |
| [P3] 40 empty `firstSeen` stubs | CONFIRMED (see E). |
| [P3] `lastActivity` hardcoded | CONFIRMED: 98,500 identical `"2026-08-22"`. |
| [P3] dual flag vocabulary | CONFIRMED but census shifted since snapshot: ACC clean rows now carry `pass_through`(4,176)/`new_account`(1,881); ACM carries `fanin_receiver`(1,853), `fanout_source`(3,532), `fan_in/out`(200/200), `high_velocity`(158), plus new tokens `new_account` (all 7,001), `high_value`(681), `alert_flagged`(40). Mixed vocab persists in one column. |
| [P3] `graph_score` mixed scales | CONFIRMED: ACC 0–5 (int-ish) vs ACM 0–2.5. |
| [P3] ACM pagerank all-zero | CONFIRMED: nonzero pageranks ACC 98,499 (max 0.08733) vs ACM **0** (max 0.0). |
| [P3] AlertsContent severity filter dead options (`low`,`info`) | STILL PRESENT in src (`AlertsContent.tsx` severity options list); artifact census low=0 info=0. |
| [P3] AlertsContent status filter dead option (`dismissed`) | STILL PRESENT in src; artifact census dismissed=0. |
| [P3] route `resolved === true` dead disjunct | FIXED IN SRC: current `route.ts:203-211` counts by `status` string only, no boolean disjunct; field also absent from artifact. |
| [P3] Dashboard fallback diverges from route stat definition | RESOLVED IN SRC: both now severe-only (`route.ts:176-178` ↔ `DashboardContent.tsx:54-63`); latent divergence gone. |
| [P3] useLocalData stale docstring re mock/demo union | Not re-audited line-by-line here (out of artifact scope) — flag for owner. |
| [P3] xgboostPredictor stale "unavailable features" comment | CONFIRMED STALE: comment claims `kyc_status`/`account_type`/`authority_score` unavailable, artifact ships all three on 105,501/105,501 rows (`xgboostPredictor.ts` ~210-213). |

Additional artifact observation: `flags` ↔ `reasons` mirror bijectively on 105,501/105,501 rows (0 length mismatches).

## FIXED

None — verifier line is read-only by assignment; only this report file was written.

## SKIPPED

None — all checks in scope executed.

## HANDOFF

- Owner(AlertsContent.tsx): drop `low`/`info` severity options and `dismissed` status option (or generate matching alerts) — still dead filters at HEAD.
- Owner(xgboostPredictor.ts): reword stale comment at ~210-213 ("defaults apply only when caller records lack these fields").
- Owner(useLocalData.ts): docstring still justifies `ApiTransaction` by a mock/demo union per D4-6; confirm rewrite.
- Owner(data pipeline): the two P2 regeneration fixes (pass_through_ratio `tout/tin else 0`; backfill ACM `account_age_days`) and P3 rescales (velocity/graph_score/pagerank unification, flag-vocab canonicalization, lastActivity/firstSeen backfill) require dataset regeneration — not a verify-line action.
- Orchestrator: note that artifact bytes differ from the D4-6 snapshot's flag census (vocab distribution shifted) while all structural metrics match — dataset appears regenerated between snapshot and now; D4-6.md numbers for flags are stale but its defect verdicts remain valid.

## EXTERNAL

None surfaced by this verification.

## DEFERRED

None.

## NOTES

- Verification ran against Git Bash heredoc python (3.11.15); full-population counts, no sampling error margins.
- `explanation` absent fleet-wide is benign for typing (`MappedAccount.explanation` nullable) but means UI explanation panels rely entirely on client-side derivation.
- The 19 `high`-risk rows being exclusively mules makes the route's disjoint category views stable: `category=mule` → 8,578; `category=high` → 0.
