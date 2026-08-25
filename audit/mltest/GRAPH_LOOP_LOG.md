# Graph Perfection Loop Log

Network-graph QA loop across the three `/graph` views:
- **Pairwise**: `src/components/NetworkGraph.tsx` ← `public/network_graph.json`
- **Hierarchical Hypergraph**: `src/components/HierarchicalHypergraph.tsx` ← `public/hierarchical_hypergraph.json`
- **Risk Galaxy**: `src/components/MuleGalaxy.tsx` ← `GET /api/graph/mule-galaxy`

---

## Iteration 1 — deep QA pass (2026-08-25)

### Environment
- `npm run build && npm run start -- -p 4322` run from `mule-detection/`; server verified serving before fixes and rebuilt green after fixes (`next build`: compiled successfully, TS clean, 9/9 pages incl. `/graph`, exit 0).
- `npx eslint src`: **0 errors**, 8 warnings (all `no-unused-vars` inside `src/lib/*` ML files owned by other agents — untouched by this pass).
- No commits made, per constraints.

### What was checked (with evidence)

**Runtime/data surfaces**
- `GET /graph` → 200 (SSR shell OK).
- `/network_graph.json` → 200, ~6.1 MB served; `/hierarchical_hypergraph.json` → 200, ~1.44 MB; `/api/graph/mule-galaxy` → 200, ~2.85 MB.
- Validation script kept at `audit/mltest/validate_graph_data.py` (re-runnable; recomputes galaxy payload from raw datasets and diffs against live API).

**network_graph.json v2 (generatedAt 2026-08-24T19:20Z)**
- `highRisk` mode: 8169 nodes / 1795 core / 8497 edges; `mules` mode: 9890 nodes / 8578 core / 9999 edges.
- 0 dangling refs: every nodeId has an account record; every edge endpoint ∈ nodeIds ∩ accounts; every node has a layout entry.
- Layout coords finite and inside [0,1]² band (x∈[0.0003,0.9997], y∈[0,1]) — canvas view-transform maps these on-screen; Fit-view math bounds-checked.
- 31 duplicated `(from,to)` edge pairs (e.g. ACC00012C47→ACC00010B31 ×2) — verified these are **distinct real transactions** in the source data (different txn ids/timestamps/amounts), i.e. faithful reproduction, not a generator bug.
- Critical-band consistency: `riskLevel==='critical' ⇔ riskScore≥70` holds in one direction with 0 counter-examples (`critical & score<70`: **0** accounts). 1247 accounts have score≥70 with `riskLevel:'high'` (all mules) — this matches the generator ground truth (`scripts/generate_network_graph.py` L244-246: mode-core = mules with `risk_score ≥ 70`) and the component legends ("Critical-risk mule" red vs "Other confirmed mule" orange both key off `riskLevel`, self-consistent). Not a bug; documented for future band-policy decisions.

**hierarchical_hypergraph.json v3 (regenerated post ×100-fix)**
- coverage.levels [12,24,48,96]; per-level layouts present and complete for rendered ids at each level (`layout['96']` covers 97/97 required ids incl. GLOBAL; lower levels cover exactly their rendered subsets; top-level fallback `layout` also has GLOBAL).
- 96 hypernodes, 1765 incidence pairs, 96 aggregation pairs → 0 unknown endpoints either direction; 0 hypernode members without account records; all 3080 incident transactions have known endpoints; all hypernode ids match the `HE…` prefix used by the component's search-hit classification (`id.startsWith("HE")` — account ids never start with HE, verified).
- Critical-band: same one-directional guarantee as above (758 score≥70-but-'high' among its 2783-account subset; 0 critical-below-70).

**Galaxy API payload vs raw datasets**
- Recomputed offline from `accounts_dataset.json` + `transactions_synthetic.json` using the route's own predicate (`is_mule || risk_level ∈ {critical,high}`): flagged-selected = 8578 accounts, 7952 aggregated links — API returned **exactly** that set (0 missing, 0 extra links, 0 self-loops, 0 dangling endpoints).
- meta consistent (`nodes`/`links` match array lengths); `degree` field correct for all 8578 nodes; scores all within [0,100]; tier mapping `critical→#ef4562`, `high→high-risk→#f2a35c`, else `watchlist→#65a9fa` matches the legend swatches in MuleGalaxy.tsx (tier mismatches: 0).

**Static-code hunt (the three components)**
- *Event-listener leaks across view switches*: page.tsx conditionally mounts one view at a time; each component attaches canvas listeners inside `useEffect` with full symmetric `removeEventListener` cleanup (NG L512-524, HHG L769-781). React strict-mode double-mount is safe: cleanup runs between mounts. Galaxy's async build guards with a `disposed` flag checked after each await; teardown disposes geometries/materials, `_destructor()`, ResizeObserver, timers, pointer/wheel stoppers (L504-523). No leak found.
- *Stale-closure races (hover/hit-test vs filter state)*: both canvas components hit-test against `visibleNodes` captured in the same effect closure as the listeners, and the effect re-subscribes whenever `[modeData, visibleNodes]` (NG L525) / `[layout, searchView, snapshot]` (HHG L782) change — no stale set window. Galaxy routes hover through refs (`highlightRef`, `visibleIdsRef` synced by effect at L200-202), immune to stale closures.
- *searchView integration (HHG)*: deferred query feeds one memoized `searchView` that filters accounts/hypernodes/interactions/incidence/aggregation coherently; draw effect and hit-testing both consume `searchView.*` (not raw `visibleNodes`), so the deferred render can never disagree with hit-testing. Degrees fall back to full-interaction degrees when search inactive. Correct.
- *Canvas DPR handling*: both 2D canvases size backing store `floor(size × min(devicePixelRatio,2))` + `setTransform(dpr,…)` each redraw (NG L257-259/L285, HHG L378-380/L404) — crisp on HiDPI, capped for perf. Galaxy caps pixel ratio at 1.5 with adaptive downscale to 1.15 under <42 fps — deliberate perf tradeoff, acceptable.
- *ResizeObserver cleanup*: NG/HHG disconnect in effect cleanup (deps `[loading,error]` remount observer when canvas appears); Galaxy disconnects in teardown. No orphans.
- *MuleGalaxy spiral/constellation math edge cases* (`normalizeConstellation`, L84-123): single node → median-centered to origin → `radius=0` → guarded by `maxRadius<=0` early-return and per-node `source.radius>0 ? … : 0` scale (node stays centered, camera fit still valid); all-same-radius datasets → uniform sqrt-density rescale, no divide-by-zero; NaN inputs coerced via `Number(…) || 0`. `nodeRadius` uses `Math.max(score,0)` and `log2(degree+1)` — safe for degree 0 and negative scores. No bug found.

### What was fixed (19 double-encoded UTF-8 sequences — proven user-visible defects)
The files contained mojibake (UTF-8 read as Latin-1 then re-encoded): `Â·`(U+00B7·), `â€¦`(U+2026…), `âˆ’`(U+2212−), `â†’`(U+2192→), `Ã—`(U+00D7×). Byte-level proof pre-fix, e.g. NetworkGraph.tsx contained `C3 82 C2 B7` instead of `C2 B7`. Rendered as garbage characters in UI text and canvas labels.

- `src/components/NetworkGraph.tsx` (7 lines):
  - L376: `` `${node.id.slice(0, 14)}â€¦` `` → `` `${node.id.slice(0, 14)}…` `` (canvas node label)
  - L601: `Loading exact network topologyâ€¦` → `…`
  - L613: subtitle `topology Â· generated` → `topology · generated`
  - L631: `{item.label} Â· {count}` → `·`
  - L668: zoom-out button label `âˆ’` → `−`
  - L748: `Transactions Â·` → `Transactions ·`
  - L806: `Sync verified Â·` → `Sync verified ·`
- `src/components/HierarchicalHypergraph.tsx` (10 lines):
  - L487/L507 comments: `vertex â†’ hypernode`, `hypernode â†’ GLOBAL` → `→`
  - L614: `` `${account.id.slice(0, 15)}â€¦` `` → `…` (canvas label)
  - L861: `Building hierarchy … graphâ€¦` → `…`
  - L873: subtitle two occurrences `Â·` → `·`
  - L946: zoom button `âˆ’` → `−`
  - L1015: `Rank #N Â· higher-order hyperedge` → `·`
  - L1096: `Pairwise Interactions Â·` → `·`
  - L1145: `HGNN structure Â· … vertices â†’ … hypernodes â†’ 1 global node` → `·`/`→`/`→`
  - L1148: `interactions Â· generated` → `·`
- `src/components/MuleGalaxy.tsx` (2 lines):
  - L686/L695: flow rows `{link.count}Ã—` → `×`

Post-fix byte scan: **0** double-encoded sequences remain; lint 0 errors; full rebuild green (exit 0).

### What remains (candidates for iterations 2–3; none provably broken)
1. **HHG legend color fidelity (cosmetic)**: legend claims "Hypernodes #e879f9" but the dataset palette is {#4ade80 ×32, #e879f9 ×39, #f472b6 ×25} — a legend swatch under-represents the actual mix. Also "Incidence / aggregation #7dd3fc" while incidence/aggregation edges actually draw in per-hypernode colors at low alpha (`${color}45`/`${color}35`). Needs a product call: fix legend copy or constrain palette.
2. **Critical-band policy doc**: 1247 mules score ≥70 yet render orange ('high'), not red — consistent with legends/generator today, but worth an explicit spec note before anyone "fixes" either side.
3. **NG duplicate edges**: faithful-to-source duplicates could optionally be aggregated into weighted edges to cut overdraw (visual-perf nicety, not correctness).
4. **Wheel-zoom UX**: ctrl-gated zoom means trackpad pinch works but plain scroll zooms nothing on canvas — intended per earlier iteration; revisit if users report discoverability issues.
5. Galaxy DPR cap (1.5/adaptive 1.15) trades sharpness for fps on HiDPI displays; acceptable, monitor FPS stat after dataset growth.

### Files touched this iteration
- `mule-detection/src/components/NetworkGraph.tsx` (mojibake fixes only)
- `mule-detection/src/components/HierarchicalHypergraph.tsx` (mojibake fixes only)
- `mule-detection/src/components/MuleGalaxy.tsx` (mojibake fixes only)
- `audit/mltest/validate_graph_data.py` (new, reusable validator)
- `audit/mltest/GRAPH_LOOP_LOG.md` (this file)
- Untouched per constraints: all `src/lib/*`.

---

## Iteration 2b — graph accessibility & legend completeness (2026-08-25)

Parallel pass with the perf/culling/DPR agent (file ownership respected: this pass touched only legends / pointer-gesture input / keyboard-a11y markup; no draw-loop internals, culling, DPR sizing or render scheduling were modified; zero `src/lib/*` ML files touched; nothing committed).

### Verification
- `npx tsc --noEmit`: **clean** (exit 0).
- `npm run lint` (`eslint src`): **0 errors**, 10 warnings — 8 pre-existing unused-vars in non-graph/UI files plus 2 (`drawFrameRef`, `drawRef`) belonging to the perf agent's in-progress work in NetworkGraph.tsx, deliberately left alone.
- No production build run: the perf agent was concurrently editing the same component files mid-pass; building their half-finished state would give a misleading signal. TS+lint gates requested for this iteration both pass.

### What was fixed

**1. Legend completeness (every encoded visual channel now has a row)**

- `NetworkGraph.tsx` — added 4 missing rows reusing the existing swatch markup:
  - "Flagged txn" line row (red `#ff4458` ≈ canvas stroke `rgba(255,68,88,.24)`)
  - "Selected node" ring (white)
  - "Connected node" ring (`rgba(125,211,252,.55)`, matches focus-neighbour stroke)
  - "Search match" ring (`#a3e635` lime, previously flagged at ~L363 as undocumented)
  - (Existing "Selected flow" sky line row retained.)
- `HierarchicalHypergraph.tsx` — added "Search match ring" row (`#a3e635`) rendered as an outlined diamond matching the hit-ring style used on focused vertices/hypernodes.
- `MuleGalaxy.tsx` — added 3 rows for channels that were encoded but never keyed:
  - "Flow direction" arrow (directional particles, blue vs red per flag colour already listed)
  - "High-value flow" thick-line row (`linkWidth > 250k INR`)
  - "Out-of-focus node" dim swatch (`#182130` dim colour from `tierColor`)
- Note (carried from Iteration 1 finding #1, not silently "fixed"): HHG "Hypernodes #e879f9" still under-represents the mixed dataset palette; needs the product call already logged.

**2. Pinch-zoom via Pointer Events (NetworkGraph.tsx + HierarchicalHypergraph.tsx)**

- Track active pointers in a `pointersRef` Map; two active pointers arm a `pinchRef` gesture snapshot (start distance/scale/midpoint/view offset).
- On move: `scale = startScale × (distance/startDistance)` clamped to existing MIN/MAX_SCALE, anchored about the gesture-start midpoint world-point → simultaneous pan-with-midpoint-drift and scale-about-fingers.
- Single-finger drag pan preserved untouched (pointer count 1 keeps old path); ctrl/cmd+wheel zoom handler byte-identical.
- Gesture teardown: lifting one finger re-anchors single-finger pan on the survivor with tap-select suppressed (`moved=true`); `pointercancel` added (was missing entirely) so OS-interrupted gestures can't strand a stale pinch/pan state; symmetric listener cleanup.
- MuleGalaxy (three.js): OrbitControls already implements two-finger pinch-dolly natively; the wrapper div previously had no touch-action guard on the inner mount — added `touch-none` to the mount div so browser scroll/pinch-zoom doesn't steal the gesture before OrbitControls sees it. No custom pointer code added there (would fight OrbitControls).

**3. Keyboard access**

- Both 2D canvases: `tabIndex={0}` + expanded aria-label documenting shortcuts + focus-visible ring; `onKeyDown` handles arrows (pan ±64px, Shift ±180px), `+`/`=`/`−`/`_` (×1.25/×0.8 about viewport centre), `Escape` (clears selection/hover/panel/search).
- MuleGalaxy: keyboard target is the stage wrapper div (`tabIndex=0`, role img, aria-label, focus ring) since the WebGL canvas lives inside 3d-force-graph; arrows orbit camera azimuth/elevation about the origin look-at (Shift = larger step), `+`/`−` reuse `zoomCamera`, Escape clears selection/panel/search. Camera math clamps elevation to ±1.45 rad to avoid pole flip.
- Shortcut hints documented in each panel: NG bottom card hint line ("Keys: Tab to canvas · arrows pan …"), HHG appended to its HGNN footer line, Galaxy new controls line above the stage.

### Issues encountered
- Mid-edit race with the perf agent writing NetworkGraph.tsx concurrently produced one transiently mangled intermediate read (duplicate `useState` fragment); re-read confirmed the file settled into a coherent merged state containing both agents' changes — verified by targeted search + full-file reads of every edited region before finishing.

### Files touched this iteration
- `mule-detection/src/components/NetworkGraph.tsx` (legend rows, pinch, pointercancel, keyboard, hints)
- `mule-detection/src/components/HierarchicalHypergraph.tsx` (legend row, pinch, pointercancel, keyboard, hints)
- `mule-detection/src/components/MuleGalaxy.tsx` (legend rows, touch-action, keyboard orbit/zoom/escape, controls hint)
- `audit/mltest/GRAPH_LOOP_LOG.md` (this entry)
- Not touched per constraints: draw loops/culling/DPR/render scheduling, all `src/lib/*`, git history.

## Iteration 3 (perf completion by orchestrator)

- MuleGalaxy: memoized nodeRadius() per node id (Map cache, 20k-entry clear guard) —
  nodeVal() re-evaluates per simulation tick per node (~8.5k nodes), sqrt+log2 was
  measurable. Hover-link scan left as-is: force-graph's internal hover uses its own
  spatial index; no O(links) app-level loop found to fix (agent's premise was stale).
- NetworkGraph + HierarchicalHypergraph iter-2 fixes (rAF batching, viewport culling,
  DPR state, hoisted memos) verified in-tree; tsc --noEmit exit 0 after all edits.
- ResizeObserver: already present from earlier iteration (confirmed, untouched).

## GRAPH LOOP COMPLETE
Wave-1: mojibake sweep (3 files) + data validator.
Wave-2/3: rAF render batching, viewport culling (both 2D canvases), DPR monitor-move
handling, memoized heavy maps/sorts, Galaxy radius cache, pinch-zoom + keyboard +
Esc + complete legends on all three views.
