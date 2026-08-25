# VERIFY-D1-6 — Spot-verification of D1-6 [UI/UX-CROSS] against current HEAD

Verifier scope: READ-ONLY. No source files edited; this report is the only artifact written.
Method: every finding re-located in live source (line numbers below are **current HEAD**, they drift from the raw digest); className corpus machine-scanned (343 JSX sites + all string literals) and diffed against `globals.css` token/utility definitions.

## VERDICT SUMMARY

33 findings adjudicated: **32 STILL-PRESENT** · **1 FIXED-BY-ANOTHER** · 0 unverifiable.
Concurrent-fixer activity observed mid-verify: `ui/StatCard.tsx` was rewritten while being read (locale pin); `AnalyticsContent` error state already carries the aligned wrapper.

---

## FINDING-BY-FINDING

### P1
1. **FANOUT bar invisible on default view — STILL PRESENT.** `AnalyticsContent.tsx:171` fills FANOUT with `CHART_COLORS.charcoal` = `var(--color-charcoal)` (#1a1a1a, globals.css:6) on Card `bg-surface-1` (#111111) → ~1.09:1; grid strokes same charcoal (`:230,:286`). Dimming branch also emits charcoal (`:176`). Proposed fix (own visible fill for FANOUT, e.g. `#f6ad55`) still required.

### P2
2. **State toggles lack `aria-pressed` — STILL PRESENT.** Repo-wide grep: exactly one `aria-pressed`, `SankeyChart.tsx:237`. MuleGalaxy has zero across all four groups: view-mode segmented control `:836`, bank-cluster chips `:883-899`, pattern chips `:931-935`, "Follow the money" toggle `:1010-1015`.
3. **Low-contrast `/70` grays in MuleGalaxy — STILL PRESENT.** `placeholder:text-ash/70` on search input `:842`; controls-help paragraph `text-[10px] text-ash/70` `:938`. Cross-check confirms FilterBar's twin WAS fixed: `FilterBar.tsx:89` uses full `placeholder:text-ash`.
4. **Sub-readable type floor persists — STILL PRESENT (recounted).** `text-[10px]`+`text-[9px]` = **44 hits / 7 files** (MuleGalaxy 21, AnalyticsContent 14, SankeyChart 3, Accounts 2, Dashboard 2, Sidebar 1, Transactions 1); Recharts `fontSize: 9` at `AnalyticsContent.tsx:389` and `:441`. Nothing raised to an 11px floor.

### P3
5. **Alerts loading/error parity REGRESSION — STILL PRESENT.** Loading `AlertsContent.tsx:49-55` is bare `<div className="p-8"><LoadingState /></div>`; error `:57-63` likewise — no PageHeader, no `max-w-[1200px] mx-auto`, no Refreshing/refresh-failed banner (Dashboard `:83-99,:108-118` and Transactions `:62-78,:170-180` have all three).
6. **StatCard locale-split engine — FIXED-BY-ANOTHER.** `ui/StatCard.tsx` was rewritten mid-session by another fixer: numeric values now format through a pinned `Intl.NumberFormat("en-IN", {notation:"compact"})` (`StatCard.tsx:5-12,:25`), forwardRef added. Grep confirms `formatNumber`/`getUserLocale` now have **zero component callers** (definitions only in `lib/utils.ts`). The dormant locale engine remains in utils.ts but no live divergence path exists. Residual (cosmetic): utils.ts docstring still says "falls back to en-US".
7. **Hardcoded px duplicating tokens — STILL PRESENT (recounted).** `text-[11px]` ×56 (was 57; delta = StatCard rewrite), `text-[13px]/[12px]/[14px]/[15px]` ×23 total (matches digest's 13+7+1+2). `PageHeader.tsx:18` subtitle is literal `text-[11px]` two lines from StatCard's token use. ui/ primitives correctly use `text-caption`/`text-body`.
8. **Untokened letter-spacing — STILL PRESENT.** `tracking-[-0.02em]` ×82 across 14 files (exact match to digest); `tracking-tight` ×2 (`StatCard.tsx:52`, `PageHeader.tsx:13`), `tracking-wide` ×1 (`StatCard.tsx:51`).
9. **Four off-token Tailwind-palette classes — STILL PRESENT.** Repo-wide grep finds exactly these four: `AlertsContent.tsx:115` `text-amber-400`; `MuleGalaxy.tsx:813` `text-red-300`; `:977` `text-sky-300`; `:981` `bg-slate-300` ("High-value flow" swatch corresponds only to particle color `#93c5fd` at `:412`, not any rendered swatch shape).
10. **Galaxy palette literals vs risk tokens — STILL PRESENT.** `tierColor` `MuleGalaxy.tsx:77-82` uses `#ef4562/#f2a35c/#65a9fa/#182130`; slider `accent-[#ef4562]` `:916`; legend literals `:970,:985`. Semantic tokens are different reds/oranges (`globals.css:13-16`: #ef4444/#f97316).
11. **CIRCULAR rendered two colors on one page — STILL PRESENT.** Line chart + chip dot `#ef6c6c` (`PATTERN_LINES`, AnalyticsContent.tsx:42) vs bar chart `accentCircular #e15759` (`:33`, applied `:170`).
12. **Dead chart-accent tokens + legacy hex — STILL PRESENT.** `--color-chart-accent-*` (globals.css:23-26) and `.chart-accent-*` utilities (:121-124) have zero consumers (grep: definitions only; `.chart-primary…quaternary` :117-120 also unused). `SankeyChart.tsx:259` hardcodes node line `#444345` (legacy Charcoal; real token is #1a1a1a).
13. **Legend-vs-render corridor mismatch — STILL PRESENT (nuance).** Ribbon color `rgba(239,69,98,.26)` `MuleGalaxy.tsx:398` vs legend swatch `#f87171` `:970`. Nuance: `#f87171` IS the flagged-corridor **particle** color (`:412`), so the swatch matches particles but not the ribbon it labels.
14. **Hardcoded JetBrains Mono font stacks — STILL PRESENT.** Recharts ticks `fontFamily: "JetBrains Mono"` (AnalyticsContent `:233,:244,:289,:293`), Plotly layouts/column labels `"JetBrains Mono, monospace"` (SankeyChart `:211,:276`), galaxy node-label HTML (`MuleGalaxy.tsx:393-394`). No shared `MONO_FONT` const exists.
15. **RiskBadge orphaned + dead CSS — STILL PRESENT.** Zero importers (grep: self-references + globals.css only). Alerts hand-rolls severity colors (`AlertsContent.tsx:90-98`; unknown severity falls through to neutral `text-bone`), Dashboard invents CategoryBadge (`DashboardContent.tsx:34-44`). Dead blocks: `.risk-badge-*` globals.css:111-114, plus `.risk-*`/`.chart-*` classes :106-109/:116-124 unused as plain classes (Tailwind `@theme` generates the `text-risk-*` etc. utilities independently).
16. **"Info" severity option — STILL PRESENT.** `AlertsContent.tsx:171`.
17. **EmptyState error role — STILL PRESENT.** `ui/EmptyState.tsx:42` unconditional `role="status"`; `ErrorState.tsx:18-19` comment still acknowledges inheriting it.
18. **Spinner duplicated ×3, fixed size in Button — STILL PRESENT.** `Button.tsx:50` fixed `h-4 w-4`; `LoadingState.tsx:25` (h-5) and `:36` (h-8) are copy-pasted SVGs.
19. **Version chaos — CONFIRMED.** `Sidebar.tsx:111` footer `v2.4` vs `package.json` `"version": "0.1.0"` (verified).
20. **twitter card overclaim — STILL PRESENT.** `layout.tsx:24` `summary_large_image`; repo-wide grep: zero `metadataBase`/og-image hits.
21. **Pre-hydration drawer gap — STILL PRESENT.** `Sidebar.tsx:22` `useState(false)` set only in a `matchMedia` effect (`:24-30`); `aria-hidden`/`inert` derive from it at `:66-67`.
22. **200px magic number duplicated — STILL PRESENT.** `Sidebar.tsx:61` `w-[200px]` + `layout.tsx:38` `lg:ml-[200px]`.
23. **Fabricated-stat fallback — STILL PRESENT.** `DashboardContent.tsx:53` `safeStat(s.totalInDataset, 105501)`; error-path stats emit `totalInDataset: 0` (`api/data-local/route.ts:236`, drifted from :235).
24. **Unqualified "Turnover" label — STILL PRESENT.** `DashboardContent.tsx:122` label `Turnover` vs Analytics `Flagged Turnover` (`AnalyticsContent.tsx:195`).
25. **Nameless empty `<th>` — STILL PRESENT.** `TransactionsContent.tsx:97-103` arrow column `header: ""`.
26. **Timezone mismatch — STILL PRESENT.** Cells format viewer-local (`AlertsContent.tsx:138`, `TransactionsContent.tsx:153`, no `timeZone`) while analytics buckets pin IST (`api/analytics/route.ts:162,:203` — verified).
27. **Graph perf trio — STILL PRESENT.** FPS rAF loop calls `setFps` every ≥500ms re-rendering whole tree (`MuleGalaxy.tsx:563-591`); fit margins ignore the 400px panel (`zoomToFit(…,24)` at `:559,:876` vs panel `w-[400px]` `:991`); hover rescans all links O(n) per event (`hoverChanged` `:604-617`) although an `adjacency` memo already exists (`:263-272`) and is not used there.
28. **Three-way icon strategy — STILL PRESENT.** lucide-react only in `error.tsx`/`not-found.tsx`; hand SVGs `Sidebar.tsx:52,:78`, `FilterBar.tsx:53,:91`; glyphs StatCard ▲▼ `:53`, RiskBadge ●▲■◆ `:4-7`, MuleGalaxy ◉ `:1025` → `:977`, TransactionsContent → `:101`, ✕ Analytics `:220` / Galaxy `:888`.
29. **Decorative ✕ not aria-hidden — STILL PRESENT.** `AnalyticsContent.tsx:220` "Clear filter ✕"; `MuleGalaxy.tsx:888` "Clear: … ✕".
30. **Search suggestions lack combobox semantics — STILL PRESENT.** Input has only `aria-label` (`MuleGalaxy.tsx:840-854`); suggestion list `:855-870` is bare absolutely-positioned buttons — no `role="listbox"`/`aria-expanded`/`aria-activedescendant`, no ArrowUp/Down handling (Enter takes first hit or bank fallback).
31. **Accounts metadata overclaim — STILL PRESENT.** `accounts/page.tsx:10` claims "100k+ … KYC"; page shows flagged subset and contains no KYC column (grep: 0 hits in AccountsContent).
32. **Page-wrapper split — STILL PRESENT.** Analytics main `p-8 space-y-6` (`AnalyticsContent.tsx:192`), Alerts `p-8` (`:151`) vs Dashboard/Accounts/Transactions wrapped everywhere incl. load/error states. Partial progress noted: Analytics *error* state got the wrapper (`:145`).
33. **Redundant box-sizing + hairline scrollbar — STILL PRESENT.** globals.css:74 duplicate `box-sizing` rule; scrollbar 4px thumb `#333` (:143-145); `::selection #333` (:147).

## PHANTOM CLASS/TOKEN SWEEP (extra task)

Machine scan of all 343 `className=` sites (+ all quoted/template strings file-wide) across `src/**/*.tsx`, validated against `@theme` tokens (`--color-*`, `--text-*`, `--font-*`), `@utility transition-default`, manual classes (`.skip-nav`, `.risk-badge-*`, `.chart-*`) and the Tailwind v4 default palette.

**Result: ZERO phantom classes/tokens remain.** Every custom root used in TSX resolves to a definition. Tokens flagged during scanning were all confirmed valid Tailwind v4 core utilities on manual review (`border-t-frost` per-side color, `ring-1`, `outline-2`, `outline-offset-2`, `border-0/2`, `-translate-x-full`, `transition-[transform,visibility]`, `space-y-*`, `shrink-0`). The old phantom family (`transition-default-style` etc.) stays fixed — `transition-default` is a real `@utility` (globals.css:78-82).

## SKIPPED

None skipped — verifier scope is adjudication only; no source edits attempted, so no P3 was dropped.

## HANDOFF

For fixing owners (priority order, current line refs above):
- P1 #1 (AnalyticsContent FANOUT fill) — one-line change, do first.
- P2 #2/#3/#4 (aria-pressed ×4 groups; `/70` contrast pair; type floor + fontSize 9 ticks) — MuleGalaxy-heavy, coordinate with its owner.
- P3 quick wins: #17 EmptyState role ternary, #29 aria-hidden spans, #24 label rename, #16 drop Info option, #12 delete dead accent tokens/utilities + fix `#444345`, #20 downgrade twitter card to `summary` (or add metadataBase+og image — product call), #5 Alerts PageHeader/wrapper/banners.
- Broad churn best batched post-wave (DEFERRED-class): #7/#8 token mass-replace (~79 sites), #28 icon standardization, #10 shared GALAXY_COLORS const, #30 combobox pattern, #27 perf trio.
- Orchestrator note: `ui/StatCard.tsx` was concurrently rewritten (forwardRef + pinned en-IN formatter) and `AnalyticsContent` error state gained the aligned wrapper while I verified — D1-6's #6 is closed by that work; eslint/tsc central pass should include those files.

## EXTERNAL

- #19 canonical app version (v2.4 vs package.json 0.1.0) — product-owner decision required before code can pick a source of truth.

## DEFERRED

- None beyond the batched-churn items listed under HANDOFF; nothing here requires external credentials/IAM/git-history action.

## NOTES

- All verdicts are static code reads at HEAD; no builds/dev servers run (per assignment). Contrast ratios recomputed from hex values in globals.css, not measured in-browser.
- Raw-digest line numbers have drifted up to ~25 lines (e.g., SankeyChart `#444345` 257→259, route.ts 235→236); this report's refs are authoritative at verification time.
- Counts refreshed: `tracking-[-0.02em]` 82 (unchanged), `text-[10px]|[9px]` 44 (unchanged), `text-[11px]` 56 (−1 via StatCard rewrite), `text-[13..15px]+[12px]` 23 (unchanged).
