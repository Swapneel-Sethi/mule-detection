# Audit 03 — Network Graphs & Chart Visualizations (Mule Guard)

Scope: `/graph` page (pairwise canvas, bipartite, hierarchical hypergraph), all recharts usage (Analytics), Plotly Sankey, Python generators (`generate_network_graph.py`, `generate_hierarchical_hypergraph.py`, `generate_bipartite_network.py`), public JSON payloads, lifecycle/leak/mobile concerns. All claims verified against code + runtime inspection of generated JSON (Aug 25, 2026). Stack: Next 16.3.1 / React 19.2.8 / recharts 3.10 / plotly.js 3.7 + react-plotly 4.1 / vis-network 10 (installed, unused — see M13).

## CRITICAL

**C1. Bipartite layout is fully degenerate — every node at x=0 (single vertical line)**
- `scripts/generate_bipartite_network.py:118-135` splits columns with `node.startswith("ACM")`, but every account ID in this dataset starts with `"ACC"` (verified: 0/1073 mules match `ACM`). So `mules_in_component` is always empty, ALL nodes take x=0.70, `span_x==0` at lines 167-176 divides by `1e-9`, and every coordinate normalizes to x=0.0.
- Verified in output: `public/bipartite_network.json` — `distinct x values = [0.0]` for all 2,385 nodes. The "two-column bipartite" view renders as one overlapping vertical column; Set A/Set B shading rectangles (`BipartiteNetwork.tsx:266-277`) and arrow-target radius branch (`BipartiteNetwork.tsx:303-305`, another `"ACM"` test) are dead/wrong too.
- Fix: pass the real mule-id set into `build_layout()` and test membership (`node in mule_set`) instead of the ID-prefix heuristic (also fix `BipartiteNetwork.tsx:303`).

**C2. Pairwise graph color encoding contradicts its own legend**
- `src/components/NetworkGraph.tsx:345` colors core mules red only when `riskScore >= 70`, else orange; legend (lines 680-681) promises red = "High-risk mule". In the audited `public/network_graph.json`: **1,795** accounts have `riskScore>=70` while only **548** carry `riskLevel:"critical"` — i.e. 1,247 non-critical accounts render red, and the red/orange split disagrees with every `risk_level` badge used across the app (Accounts, Dashboard). *(Earlier same-day data had the inverse skew — 5,006 critical vs 273 ≥70 — so either way the two encodings diverge; regenerate both together.)*
- Same wrong threshold repeated in the hypergraph vertex painter (`HierarchicalHypergraph.tsx:412`).
- Fix: color by `riskLevel === "critical"`, or make the generator guarantee `risk_score >= 70 ⇔ critical`.

**C3. Hypergraph snapshot corrupts transaction risk scores (×100)**
- `scripts/generate_hierarchical_hypergraph.py:142`: `"riskScore": round(float(txn.get("riskScore", 0)) * 100, 2)` — source values are already 0–100, so the file stores 6,500–10,000 (verified: max 10000.0), while `network_graph.json` stores the same field unmultiplied (max 100.0). Any consumer rendering `%` or thresholds breaks silently.
- Fix: delete the `* 100`.

## HIGH

**H1. Full plotly.js (~3.5 MB min / 4.65 MB chunk measured) shipped for one Sankey**
- `src/components/SankeyChart.tsx:6` — `dynamic(() => import("react-plotly.js"))` laziness is real (SSR-safe, off main bundle), but the default import pulls **all** ~50 trace types. Measured `.next/static/chunks/3egqegr3mkxkc.js` = 4,647,450 bytes containing plotly.
- Fix: `import PlotFactory from "react-plotly.js/factory"` with `plotly.js/sankey-dist` (+`basic-dist` if more traces come), keeping `ssr:false`.

**H2. Analytics API reads ~120 MB of JSON into server RAM, caches forever**
- `src/app/api/analytics/route.ts:12-14` parses `accounts_dataset.json` (97.6 MB) + `transactions_synthetic.json` (17.9 MB) per cold start; module-level `cachedData` (line 7) never invalidates → regenerated data invisible until redeploy/restart; OOM risk on small serverless instances.
- Fix: precompute analytics to a small JSON via script (like the other views), or TTL/invalidate the cache; move big datasets out of `public/`.

**H3. ~120 MB of datasets deploy as public static assets**
- `public/accounts_dataset.json` = 94.5 MB (regenerated during audit; earlier build 97.6 MB), `transactions_synthetic.json` = 17.9 MB, `transaction_model.json` = 3.98 MB, `network_graph.json` grew to **5.8 MB** (Aug 25 00:52 regen: 9,890 nodes / 9,999 edges in "mules" mode). `.vercelignore` only excludes `synthetic_dataset.json`. These files are downloaded by no client page (API routes read them via `process.cwd()`), yet ship in every deployment.
- Fix: move runtime-read datasets outside `public/` and add them to `.vercelignore`.

**H4. AnalyticsContent fetch: no cancellation, no error state (stale-race class)**
- `src/components/AnalyticsContent.tsx:107-115` — bare promise chain, no `AbortController`, no `cancelled` flag (setState after unmount), and `.catch(() => setLoading(false))` leaves the user on an eternal "Loading analytics..." with no retry on failure. Every other data loader in the repo does this correctly (e.g. `NetworkGraph.tsx:115-144`) — this one predates the pattern.
- Fix: port the AbortController + error-state pattern used by the graph views.

**H5. Bipartite hit-testing ignores filters and thrashes listeners**
- `BipartiteNetwork.tsx:403` iterates **all** `snapshot.layout.positions`, not `visibleNodes`, so after filtering to "Confirmed Illicit" (3 edges!) you can still click/hover/select hundreds of invisible nodes.
- The interaction `useEffect` (line 478) depends on `hoveredId`, so every hover re-tears and re-adds 4 canvas listeners (churn; same pattern in `NetworkGraph.tsx:521` deps `visibleNodes`). Not a leak — cleanup runs — but avoidable garbage per mousemove.
- Fix: hit-test over the filtered node list; read hover state from a ref instead of effect deps.

**H6. Bipartite "Confirmed Illicit" semantics: 3 edges vs 2,011 "suspicious"**
- `generate_bipartite_network.py:229`: `confirmedIllicit = flagged_count > 0` on an *aggregated* edge, while `suspiciousCount = len(txns) - flagged_count` (line 231) counts plain **unflagged** transactions as "suspicious". Result: the UI's default view paints 99.85% of flows yellow ("Suspicious / unverified", `BipartiteNetwork.tsx:587`) — the color encoding carries almost no information.
- Fix: define confirmed/suspicious from transaction-level risk thresholds, not flagged-vs-everything-else.

**H7. Hypergraph pairwise-interaction filter blanks the canvas on any selection**
- `HierarchicalHypergraph.tsx:355`: `if (focus.accountIds.size > 0 && !focused) continue;` — selecting one account hides all non-focused interactions; but `focus.accountIds` is populated by hover (line 224), so merely moving the mouse across the canvas wipes the base layer until the pointer leaves. Flicker-prone and destroys global context.
- Fix: dim rather than skip (`globalAlpha 0.05`) non-focused interactions.

## MEDIUM

**M1. Analytics axis labels claim ₹ but ticks show raw units**
- `AnalyticsContent.tsx:207` Y-axis label "Total Amount in ₹" with formatter `(v/10000000).toFixed(0)}M` (line 204) → ticks read "12M" not "₹12 Cr"; tooltip (line 223) uses "M" for values that are rupee-crores in an INR product. Area chart (265-287) has no tickFormatter at all.
- Fix: `₹${(v/1e7).toFixed(1)}Cr` consistently.

**M2. Money Flow chart YAxis via dataKey function — fragile recharts API**
- `AnalyticsContent.tsx:347-353`: `<YAxis dataKey={(d) => ...}>` relies on recharts accepting a function dataKey; typed as category but undocumented/unstable across recharts majors; also fixed `width={70}` truncates long "critical→medium" labels.
- Fix: precompute the label into row objects (`label: ${from}→${to}`) and use a string dataKey.

**M3. Sankey value scaling silently changes units**
- `SankeyChart.tsx:40`: `Math.round(flow.amount / 1000)` — links are thousands-of-rupees while every other view shows lakhs/crores; hover tooltips show bare numbers with no unit. Also `node.color` (line 45) passes a CSS `var(--color-chart-secondary)` string, which plotly cannot parse (CSS vars are meaningless to its canvas/SVG renderer) → nodes fall back to default colors.
- Fix: keep rupees and set `valueformat`/`valuetoformat`, use resolved hex colors.

**M4. Plotly Sankey config: mode bar always shown**
- `SankeyChart.tsx:90`: `displayModeBar: true` shows the floating toolbar inside a Card (overlaps content on narrow cards); no `locale` set despite en-IN formatting elsewhere. Minor next to H1 but visible.
- Fix: `displayModeBar: false` (or hover-only), `locale: "en-IN"`.

**M5. Canvas DPR resize loop thrash + no ResizeObserver debounce (all three canvases)**
- `NetworkGraph.tsx:242-247`, `BipartiteNetwork.tsx:230-235`, `HierarchicalHypergraph.tsx:272-277`: RO callback setState → draw effect resizes backing store → layout → RO fires again... Each draw effect also unconditionally resets `canvas.width/height` (e.g. `NetworkGraph.tsx:258-259`), clearing the bitmap even when size didn't change. Works, but burns CPU during window drags; mobile orientation change repaints repeatedly.
- Fix: compare last w/h before setState/resizing backing store.

**M6. Hover hit-testing is O(n) per mousemove without spatial index**
- `NetworkGraph.tsx:406-424` scans up to 8,583 nodes per pointermove; `BipartiteNetwork.tsx:397-411` iterates all positions; hypergraph similar. At zoom-out with Context on, hover latency is user-perceptible on low-end hardware.
- Fix: grid-bucket positions once per dataset (O(1) lookup).

**M7. No virtualization/culling of offscreen nodes & edges at far zoom**
- Draw effects iterate every node/edge regardless of viewport (`NetworkGraph.tsx:274-346`). Fine at current sizes (~8k nodes, ~8k edges, single batched stroke pass ~tens of ms), but there is zero headroom for the 10k+ edge growth path; labels capped at 48 (line 280) is good.
- Fix: add viewport AABB culling before the stroke batches when counts grow.

**M8. Hypergraph TOP-N level buttons keyed by count value**
- `HierarchicalHypergraph.tsx:732-734`: `key={count}` over `snapshot.coverage.levels` ([12,24,48,96]) breaks if levels ever repeat; also initial state `useState(24)` (line 112) assumes 24 ∈ levels instead of reading coverage.
- Fix: key by index/value uniqueness and init from `coverage.levels[1]`.

**M9. Bipartite "Force-directed" subtitle is false advertising**
- `BipartiteNetwork.tsx:526`: subtitle says "Force-directed · no same-set edges" — layout is precomputed constrained columns (fine), but per C1 it isn't even two columns today. Copy should match reality after the fix.
- Fix: "Two-column directed flow projection".

**M10. Analytics `data.totalAlerts` rendered as raw number type in StatCard**
- `AnalyticsContent.tsx:141`: `<StatCard value={data.totalAlerts} />` passes a number while sibling cards pass locale-formatted strings; inconsistent formatting (no en-IN grouping) for counts >999.
- Fix: `data.totalAlerts.toLocaleString("en-IN")`.

**M11. Empty-data states missing on graph canvases**
- All three views render an error card or the canvas, but if a snapshot loads with zero nodes/edges (e.g. filters exclude everything), the pairwise view draws an empty gradient with no message (`NetworkGraph.tsx:212` silently returns from fitView). `ui/EmptyState.tsx` exists and is unused here. Bipartite summary panel (670-698) partially covers this.
- Fix: branch to `<EmptyState>` when `visibleNodes.length === 0`.

**M12. Hypergraph label/vertex overlap by construction at TOP 96**
- `generate_hierarchical_hypergraph.py:85-96`: sector capacity formula packs up to 63-member components into rings around each hypernode; adjacent sectors at 96 slices are ~0.065 wide while jitter adds ±6%, so member vertices of neighboring hypernodes interleave visually (verified HE001 has 63 members on a ~3.75° arc). Readable only after heavy zoom-in; no collision pass exists.
- Fix: scale ring radius per component size or cap rendered members per hypernode.

**M13. Dead heavyweight deps: vis-network 10 + vis-data 8 (81 MB in node_modules)**
- No file under `src/` imports vis-network/vis-data (verified by grep); only stale Turbopack SSR chunks reference it. Either remove from `package.json:24-25` or actually use them — today they only inflate installs and confuse audits.
- Fix: `npm uninstall vis-network vis-data` (or wire them in intentionally).

## LOW

**L1. Wheel zoom hijacks page scroll**
- `NetworkGraph.tsx:487-489`, `BipartiteNetwork.tsx:446-447`, `HierarchicalHypergraph.tsx:615-616`: `preventDefault()` on wheel over an 760–880 px-tall canvas traps trackpad scrolling on every graph page visit.
- Fix: require Ctrl/meta+wheel to zoom, let plain wheel scroll past.

**L2. Double-click zoom targets stale rect vs viewportSize**
- `NetworkGraph.tsx:475-482` uses `canvas.getBoundingClientRect()` live, while everything else uses cached `viewportSize` — harmless inconsistency, but on resize-between-events they disagree.
- Fix: use one source (the cached viewport state).

**L3. Search "Locate N+" caps at 100 without saying so**
- `NetworkGraph.tsx:189-204`, bipartite/hypergraph equivalents cap matches at 100 and display `100+`; fine, but no tooltip explains truncation of the match set.

**L4. Mobile: pinch-zoom unsupported; drag works via pointer events**
- Canvases set `touch-none` (e.g. `NetworkGraph.tsx:673`) so single-finger pan + tap-select work through pointer events, but there is no two-finger pinch handler — zoom buttons only. Detail panels are `w-[380px]/[400px] max-w-full` overlays that cover the full canvas width on phones (acceptable but obscures graph).
- Fix: add a simple 2-pointer distance tracker for pinch zoom.

**L5. Legend completeness gaps**
- Pairwise legend omits flagged-edge styling (red translucent lines, `NetworkGraph.tsx:325`) and search-match highlight (lime ring, line 363). Bipartite legend omits arrow meaning/direction. Hypergraph legend lacks "search match" lime ring (line 419).
- Fix: add entries for each encoded visual channel.

**L6. `generatedAt` rendered via `new Date(...).toLocaleString("en-IN")` without timeZone pinning**
- e.g. `NetworkGraph.tsx:806` — server UTC timestamp shown in viewer-local tz; minor reproducibility nit for screenshots/demo consistency.

**L7. Determinism is good — keep it that way**
- All three generators avoid RNG: deterministic MD5-based jitter (`generate_hierarchical_hypergraph.py:31-33`, `generate_network_graph.py:60,80-81`), sorted iteration everywhere, golden-angle packing (`generate_network_graph.py:140`). Only `datetime.now()` varies (by design). No fix needed; noted as verified-correct.

**L8. Self-loops / duplicate edges / dangling refs — none found (verified)**
- Programmatic check across all three JSON outputs: self-loops = 0, duplicate edge IDs = 0, edges referencing absent nodes = 0, layout coverage = 100% of drawn entities, hypergraph incidence/aggregation all resolve to rendered IDs. Weight normalization bounded (bipartite weights ∈ [0.084, 0.833]).

**L9. Payload sizes shipped to client (fetch-on-demand, not bundled)**
- network_graph.json **4.35 MB** (gzip ~1 MB est.) loaded by `/graph` pairwise tab; bipartite_network.json 1.68 MB; hierarchical_hypergraph.json 0.69 MB. Fetched client-side with `cache:"force-cache"` and AbortController — acceptable pattern, but 4.35 MB on mobile data is heavy; consider splitting modes into separate files or serving a lite version.

**L10. Analytics API route marked `force-dynamic` yet serves eternal cache** — see H2; also means two concurrent cold starts double-parse ~120 MB.

### Verified-OK items (no action)
- SSR safety: all three graph views are `"use client"` canvas components fetching JSON in effects; Plotly is `dynamic(..., {ssr:false})` (`SankeyChart.tsx:6`). No top-level `window` access before mount observed in viz code.
- Event-listener cleanup: every addEventListener has matching removal in effect cleanups (`NetworkGraph.tsx:508-520`, `BipartiteNetwork.tsx:468-477`, `HierarchicalHypergraph.tsx:636-648`); RO disconnected; RAF frames cancelled; fetches aborted. No vis-network instances exist → no `destroy()` obligations.
- Click→details panel wiring is correct in all three views (selection sets panel content; mode switches reset selection, `NetworkGraph.tsx:617-622`).
- recharts tooltips consistently styled dark (`CustomTooltip`, `AnalyticsContent.tsx:61-89`); animation left default (fine at these data sizes); no legend overlap found (legends are custom flex rows).
- Z-index: sidebar z-40/z-50 (`Sidebar.tsx:55,70`) sits above detail panels (unpositioned/z-auto) — mobile drawer correctly covers panels; no modal conflicts found.


