# CSS browser support validation

Validates that every CSS feature the source-view polish engine spec uses is supported in Open Knowledge's target browser matrix. Sources cited inline.

## Browser support target

**Result: Vite 8 default — `baseline-widely-available`.**

Verified inputs:
- `/Users/edwingomezcuellar/projects/open-knowledge/package.json` — no `browserslist` key.
- `/Users/edwingomezcuellar/projects/open-knowledge/packages/app/package.json` — no `browserslist` key. Uses `vite ^8.0.0`, `tailwindcss ^4.2.2`.
- No `.browserslistrc` anywhere in the repo (only references in `bun.lock` are transitive deps of `@babel/helper-compilation-targets` and `shadcn`).
- `/Users/edwingomezcuellar/projects/open-knowledge/packages/app/vite.config.ts` — does not set `build.target` or `build.cssTarget`.
- CLAUDE.md does not declare a browser target.

When `build.target` is unset, **Vite 8 defaults to `'baseline-widely-available'`**, which resolves to: `['chrome111', 'edge111', 'firefox114', 'safari16.4']`. `build.cssTarget` defaults to the same. (Source: [Vite Build Options](https://vite.dev/config/build-options.html).)

This is the matrix every CSS feature in the spec must satisfy. Note: the engine project uses Tailwind CSS v4, which itself targets Safari 16.4+/Chrome 111+/Firefox 128+ (Tailwind v4's own baseline) — already aligned.

**Existing usage in repo:** `packages/app/src/globals.css` already uses `oklch()` extensively (~100+ occurrences for theme tokens, e.g. `oklch(0.6321 0.1983 259.59)`), and uses `rgba`-style alpha syntax inside oklch (`oklch(1 0 0 / 10%)`). This confirms the project is already operating at the modern-browser baseline.

## Feature matrix

| Feature | Min Chrome | Min Safari | Min Firefox | Min Edge | Global % | In target? | Fallback |
|---|---|---|---|---|---|---|---|
| `color-mix(in oklab, ...)` | 111 | 16.2 | 113 | 111 | ~94% Baseline 2023-05 | YES | None needed; `@supports` guard if extended later |
| `oklch()` | 111 | 15.4 | 113 | 111 | 93.29% | YES | None — already in production use across `globals.css` |
| `box-decoration-break: clone` (unprefixed) | 130 | n/a (full) | 32 | 130 | 96.72% (incl. partial) | NO for Chrome <130 / Safari any | Always also write `-webkit-box-decoration-break: clone` (Safari + older Chrome) |
| CSS custom properties in inline `style="--x:N"` | 49 | 10 | 31 | 16 | 96.36% | YES | None |
| `calc(var(--x, 0) * 1ch)` | 49 (calc + vars baseline) | 10 | 31 | 16 | 96%+ | YES | None |
| `text-indent` negative + `padding-inline-start` | logical-properties baseline 2018 | 12.1+ | 41 | 79 | ~97% | YES | None |
| `text-decoration-style: dotted` | 57 (full) | 12.1 | 36 | 79 | Baseline since Jan 2020 | YES | None |
| `text-decoration: underline wavy` | 57 | 12.1 | 36 | 79 | Baseline since Jan 2020 | YES | None |
| `border-left` + `color-mix()` (combined) | 111 | 16.2 | 113 | 111 | Bound by `color-mix` | YES | Same as `color-mix` |

Sources: [color-mix MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/color_value/color-mix), [oklch caniuse](https://caniuse.com/mdn-css_types_color_oklch), [box-decoration-break caniuse](https://caniuse.com/css-boxdecorationbreak), [CSS variables caniuse](https://caniuse.com/css-variables), [text-decoration-style MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/text-decoration-style).

## box-decoration-break: clone deep dive

This is the only feature with a real cross-browser caveat. The spec relies on it for Tier 2 cell color bands and any wrapped-`Decoration.mark` background that must repeat cleanly per visual line.

**Default behavior (`slice`):** Per MDN/CSS-Tricks, when an inline element wraps, decorations (background, border, border-radius, box-shadow) are sliced at the wrap point. The first fragment gets the leading edge styling; the last gets the trailing edge; middle fragments get neither. Visually: backgrounds may appear truncated, borders disappear at wraps, radii are absent on inner edges. ([CSS-Tricks Almanac](https://css-tricks.com/almanac/properties/b/box-decoration-break/).)

**`clone` behavior:** Each fragment is treated as a complete box. Backgrounds repeat per visual line, borders close on each fragment, radii apply on every edge.

**Per-browser behavior:**
- **Chrome 130+:** unprefixed works fully. Chrome 111–129 (the bottom of our target!) only supports the `-webkit-` prefixed version with partial coverage. Practical implication: **must ship the prefixed declaration** for Chrome users on the floor of the target matrix. ([caniuse box-decoration-break](https://caniuse.com/css-boxdecorationbreak).)
- **Safari (all versions in target including 16.4 through current):** requires `-webkit-box-decoration-break: clone`. Marked partial-support but the `clone` value paints backgrounds/borders correctly per fragment for inline `<span>` — which is the only use case here. ([WebKit standards-positions #366](https://github.com/WebKit/standards-positions/issues/366) tracks the unprefixed-everywhere ask.)
- **Firefox 32+:** unprefixed `box-decoration-break: clone` works. Firefox does NOT understand `-webkit-` prefix.
- **Edge 130+:** same as Chrome 130+.

**Required CSS pattern (canonical, both prefixes):**

```css
.cm-tier2-cell-band {
  -webkit-box-decoration-break: clone;
          box-decoration-break: clone;
  background-color: color-mix(in oklab, var(--cell-tint) 4%, transparent);
}
```

**Visual outcome on `Decoration.mark` spans in CM6:** Without `clone`, a backgrounded mark spanning a wrapped logical line would paint a single rectangle from start-x of the first visual line to end-x of the last — producing an L-shaped or polygon-shaped tint that ignores intermediate line bounds (the "ugly polygon" failure). With `clone`, each visual line gets its own band of the tint — exactly the intended Tier 2 visual.

CSS-Tricks demo (linked from the Almanac entry) shows this for styled-link backgrounds; the geometry is identical for any inline span.

## Accessibility contrast analysis

**Baseline tokens (from `packages/app/src/globals.css`):**
- Light theme: `--background: oklch(1 0 0)` (pure white), `--foreground: oklch(0.145 0 0)` (near-black, L=14.5%).
- Dark theme: `--background: oklch(0.145 0 0)`, `--foreground: oklch(0.985 0 0)` (near-white, L=98.5%).

**Approximate contrast on the base palette:**
- Light: white (L≈100) vs L≈14.5 ≈ 17:1 contrast.
- Dark: L≈14.5 vs L≈98.5 ≈ 17:1 contrast.

Both far exceed WCAG AA (4.5:1 normal text, 3:1 large text).

**Effect of a 5% tint shifting the background:**

A `color-mix(in oklab, <accent> 5%, transparent)` over the base background shifts background lightness by no more than ~5% × |L(accent) − L(base)|.

- **Light theme worst case:** accent at L≈30 (mid-dark blue) → background shifts from 100 to ~96.5 (ΔL ≈ 3.5). Contrast: 96.5 vs 14.5 ≈ 14:1. **Still well above 4.5:1.**
- **Dark theme worst case:** accent at L≈70 (light azure) → background shifts from 14.5 to ~17.3 (ΔL ≈ 2.8). Contrast: 17.3 vs 98.5 ≈ 14.5:1. **Still well above 4.5:1.**

**Cell band 4% opacity:** even smaller shift; ΔL ≤ 3 points; contrast remains >14:1 in both themes.

**Conclusion:** Tints at 4–5% over Open Knowledge's background tokens cannot drop contrast below WCAG AA. Even stacking a 5% tint + 4% cell band (worst case ~9% total opacity) keeps contrast >12:1 in both themes. Foreground text is unaffected by the bg tint at these opacities.

**Caveat on color-only signaling:** Per the spec §4 ("color-alone never carries unique information"), every Tier 2 cue must also have a non-color complement (border, position, weight). This is a separate WCAG 1.4.1 requirement, satisfied by spec design.

## Fallback strategy recommendation

**Recommendation: rely on the modern features unconditionally; no runtime fallback layer.**

Rationale:
1. Vite 8's `baseline-widely-available` target (Chrome 111+, Edge 111+, Firefox 114+, Safari 16.4+) is the floor. All Tier-1 polish features (`oklch`, `color-mix`, custom properties, calc, text-decoration-style) clear that floor.
2. The repo already ships ~100+ `oklch()` tokens in production. Adding `color-mix()` is the same modernity tier — same baseline dates (early-mid 2023).
3. Tailwind v4 (already installed) emits `color-mix` and `oklch` in compiled CSS as part of its own opacity-modifier syntax (`bg-azure-500/50` → `color-mix(in oklab, ...)`). Adding more is consistent with the existing build.
4. Vite + esbuild does **not** automatically polyfill modern CSS. There is no PostCSS Preset Env in the build chain. A "fallback" strategy would mean adding one — net cost without benefit at this baseline.

**The single exception is `box-decoration-break`.** It needs the dual-write `-webkit-` + unprefixed declaration to support Chrome 111–129 and Safari (entire target range). This is not a "fallback" — it's just the canonical multi-prefix pattern.

**If the target ever lowers** (e.g., adding Chrome <111 for some enterprise constraint):
- `color-mix` and `oklch`: precompute equivalent `rgba()`/`hsl()` values in CSS variables at build time using a PostCSS plugin (`postcss-preset-env` Stage 2+ with `features: { 'color-mix': true, 'oklch-function': true }`). Loses theme-token-mixing dynamism but keeps visual parity.
- `@supports (color: color-mix(in srgb, red, blue))` guards can wrap engine declarations, falling back to flat hex tints from a parallel token set. Not recommended now — pure overhead at the current baseline.

**Action items for implementation:**
1. Always emit both `-webkit-box-decoration-break: clone` and `box-decoration-break: clone` (Biome lint won't flag this; document the convention in a CSS comment or co-located code).
2. Use `color-mix(in oklab, ...)` directly; no `@supports` wrapper needed.
3. Use `oklch()` directly — already established.
4. Inline custom properties (`<div style={{ '--line-indent': depth }}>` in JSX/TSX, or `style="--line-indent: 4"` in raw HTML) are universally supported in target browsers. CodeMirror's decoration spec already supports `attributes` with arbitrary `style` strings.

## Sources

- [Vite Build Options — defaults for build.target and cssTarget](https://vite.dev/config/build-options.html)
- [MDN — color-mix()](https://developer.mozilla.org/en-US/docs/Web/CSS/color_value/color-mix)
- [caniuse — oklch()](https://caniuse.com/mdn-css_types_color_oklch)
- [caniuse — box-decoration-break](https://caniuse.com/css-boxdecorationbreak)
- [WebKit standards-positions #366 — box-decoration-break: clone everywhere](https://github.com/WebKit/standards-positions/issues/366)
- [caniuse — CSS variables](https://caniuse.com/css-variables)
- [MDN — text-decoration-style](https://developer.mozilla.org/en-US/docs/Web/CSS/text-decoration-style)
- [CSS-Tricks Almanac — box-decoration-break](https://css-tricks.com/almanac/properties/b/box-decoration-break/)
- [Existing oklch usage — packages/app/src/globals.css L25-L815](file:///Users/edwingomezcuellar/projects/open-knowledge/packages/app/src/globals.css)
