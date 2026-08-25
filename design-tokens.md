# MuleGuard Design Tokens

Single source of truth: `src/app/globals.css` (`@theme inline`). Tailwind v4 generates the utility classes from these tokens at build time — there is no separate Tailwind config to keep in sync.

## Color Palette
- **Void** (page background): `#000000`
- **Bone** (primary text): `#ffffff`
- **Charcoal / Surface-2**: `#1a1a1a`
- **Frost**: `#e2e2e2`
- **Ash** (muted text): `#888888`
- **Surface-1**: `#111111`

### Semantic scales
- **Risk levels** (`--color-risk-*`, utilities `.risk-*` / `.risk-badge-*`): critical `#ef4444`, high `#f97316`, medium `#eab308`, low `#22c55e`
- **Chart colors** (`--color-chart-*`, utilities `.chart-*`): primary `#ffffff`, secondary `#e2e2e2`, tertiary `#888888`, quaternary `#444444`; pattern accents — fan-in `#f28e2b`, passthrough `#b07aa1`, circular `#e15759`, fan-out `#edc948`
- **Focus ring**: `--color-focus: #ffffff`

## Spacing System
`--spacing-1` through `--spacing-12`: 4, 8, 12, 16, 20, 24, 32, 40, 48 px (Tailwind defaults, pinned explicitly).

## Typography
Fonts are self-hosted via `next/font/google` in `src/app/layout.tsx`: **Inter** (exposed as `--font-display`) and **JetBrains Mono** (exposed as `--font-mono`), both set on `<html>`. The theme tokens `--font-display`, `--font-sans` and `--font-mono` reference those runtime variables and fall back to system stacks when absent.

Type scale: caption `11px`, body `13px`, label `11px`, heading-sm `24px`, heading `32px`, display `64px`.

Fluid scale (`--text-fluid-sm` … `--text-fluid-4xl`): viewport-responsive clamps spanning 12–13, 13–15, 15–18, 18–24, 24–32, 32–48 and 48–64 px.

## Radius
`--radius-sm` 4px, `--radius-md` 8px, `--radius-lg` 12px.

## UI Components
- **Skip nav**: `.skip-nav` keyboard-only link, surfaced on focus
- **Scrollbar / selection**: custom monochrome scrollbar and inverse `::selection`
- **Motion**: `.transition-default` (150 ms ease-out) for micro-interactions; a global `prefers-reduced-motion` guard neutralizes animations and transitions
