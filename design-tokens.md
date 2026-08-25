# MuleGuard Design Tokens

Single source of truth: `src/app/globals.css` (`@theme inline`). Tailwind v4 generates the utility classes from these tokens at build time — there is no separate Tailwind config to keep in sync.

## Color Palette
- **Void** (page background): `#000000`
- **Bone** (primary text): `#ffffff`
- **Charcoal / Surface-2**: `#1a1a1a`
- **Frost**: `#e2e2e2`
- **Ash** (muted text): `#888888`
- **Surface-1**: `#111111`
- **Graphite** (scrollbar thumb / selection highlight): `#333333`

### Semantic scales
- **Risk levels** (`--color-risk-*`): critical `#ef4444`, high `#f97316`, medium `#eab308`, low `#22c55e`. Consumed via Tailwind-generated `text-risk-*` / `bg-risk-*` / `border-risk-*` utilities plus the `.risk-badge-*` classes.
- **Chart colors**: intentionally not tokenized in CSS — chart internals (Recharts SVG presentation attributes, canvas) need literal hexes because `var()` strings don't resolve there. Consumers keep their own palettes (`CHART_COLORS` / `PATTERN_LINES` in `src/components/AnalyticsContent.tsx`, the legend map in `src/components/MuleGalaxy.tsx`); consolidating them behind a shared TS token module is a tracked defect.
- **Focus ring**: `--color-focus: #ffffff`

## Spacing System
`--spacing-1` through `--spacing-12`: 4, 8, 12, 16, 20, 24, 32, 40, 48 px (Tailwind defaults, pinned explicitly).

## Typography
Fonts are self-hosted via `next/font/google` in `src/app/layout.tsx`: **Inter** (exposed as `--font-display`) and **JetBrains Mono** (exposed as `--font-mono`), both set on `<html>`. The theme tokens `--font-display`, `--font-sans` and `--font-mono` resolve those runtime variables through the `:root` aliases in `globals.css`. This indirection between identically-named custom properties only works while next/font's variable classes always ship (they do); without them it would form an invalid `var()` cycle. Renaming next/font's `variable:` option to `--app-font-display` / `--app-font-mono` would remove that fragility.

Type scale: caption `11px`, body `13px`, heading-sm `24px`, heading `32px`.

Fluid body copy: `--text-fluid-base` (`clamp(13px, 13px + 0.2vw, 15px)`), applied on `<body>`. `<html>` keeps the UA default root size so rem-based spacing/radii honor the browser's font-size preference. Larger fluid steps were removed as unused; re-add them alongside real consumers.

## Radius
`--radius-sm` 4px, `--radius-md` 8px, `--radius-lg` 12px.

## UI Components
- **Skip nav**: `.skip-nav` keyboard-only link, surfaced on focus
- **Scrollbar / selection**: slim monochrome WebKit scrollbar with a native thin Firefox equivalent (`scrollbar-width` / `scrollbar-color`) and inverse `::selection`, all tinted from `--color-graphite`
- **Motion**: `.transition-default` (150 ms ease-in-out, `cubic-bezier(0.4, 0, 0.2, 1)`) for micro-interactions. The global `prefers-reduced-motion` guard neutralizes CSS animations, transitions and smooth scrolling; JS-driven animation (the galaxy's `requestAnimationFrame` loops) is not covered by it
- **Print**: a `@media print` block in `globals.css` strips dark fills and sidebar chrome for legible black-on-white output; risk badges keep their fills via `print-color-adjust`
