# CSS State — fumadocs-ui v16.1.0 in Open Knowledge Editor

## Current state: ZERO fumadocs CSS imported

**Checked files:**
- `packages/app/src/globals.css` — no `fumadocs` imports, no `fd-` prefixed variables
- `packages/app/src/main.tsx` — imports `./globals.css` only
- pr23-rebase `packages/app/src/globals.css` — also zero fumadocs imports

**Conclusion:** fumadocs-ui components render with NO styling in our editor. The Tailwind utility classes they use (e.g., `bg-fd-card`, `text-fd-card-foreground`, `rounded-xl`) resolve against our Tailwind config, which does NOT include fumadocs CSS variables.

## What fumadocs-ui ships

### `fumadocs-ui/style.css` (3296 lines)
Pre-compiled Tailwind v4 output. Contains:
- Full `@layer theme` with ALL `--color-fd-*` CSS custom properties (lines 40-95)
- All `--animate-fd-*` keyframes (accordion, collapsible, dialog, popover, fade, sidebar)
- `@layer base` with `border-color: var(--color-fd-border)` on all elements
- Full `@layer utilities` with compiled utility classes

**This is a MONOLITHIC bundle** — importing it sets `body { background-color: var(--color-fd-background); color: var(--color-fd-foreground) }` and resets `border-color` on ALL elements. **Cannot import this into our editor without conflict.**

### `fumadocs-ui/css/preset.css` (312 lines)
Tailwind v4 PRESET — designed for `@import` in a Tailwind v4 project:
- `@source '../dist/**/*.js'` — tells Tailwind to scan fumadocs dist for utility classes
- `@plugin '../dist/theme/typography/index.js'` — typography plugin
- `@theme` block with CSS variables and keyframes
- `@utility fd-steps`, `@utility fd-step` — Steps CSS counter styling
- `@utility prose-no-margin` — margin reset for first/last children
- `@utility fd-scroll-container` — scrollbar styling
- `@variant dark` — dark mode variant

**This is the correct integration point** for Tailwind v4 projects. But it:
1. Sets `body { background-color; color }` in `@layer base`
2. Overrides `border-color` on ALL elements
3. Declares `@variant dark (&:where(.dark, .dark *))` which may conflict with our existing `@custom-variant dark (&:is(.dark *))` in globals.css

### `fumadocs-ui/css/default.css` (34 lines)
Default color theme — declares `--color-fd-*` variables with `transparent` values, plus static callout/diff colors. This is the theme-token-only file.

### Theme color CSS files (black.css, catppuccin.css, dusk.css, ocean.css, etc.)
Alternative color themes.

## Steps component CSS — CRITICAL

The `fd-steps` / `fd-step` utility classes are defined in `preset.css:260-280`:

```css
@utility fd-steps {
  counter-reset: step;
  position: relative;
  @apply pl-6 ml-2 border-l sm:ml-4 sm:pl-7;
}

@utility fd-step {
  &:before {
    background-color: var(--color-fd-secondary);
    color: var(--color-fd-secondary-foreground);
    content: counter(step);
    counter-increment: step;
    /* ... */
    position: absolute;
    @apply size-8 -start-4 rounded-full;
  }
}
```

**Key observation:** `fd-step:before` uses `position: absolute` relative to `fd-steps` (which has `position: relative`). No direct child selectors. NodeViewWrapper divs should NOT break the positioning.

**BUT:** These utilities won't be generated unless our Tailwind config scans fumadocs sources OR we import preset.css.

## What our editor needs to do

### Option 1: Selective CSS variable import
Import only the `--color-fd-*` variables and keyframes, namespaced to avoid conflicts. Don't import the base layer resets.

### Option 2: Import preset.css with conflict resolution
```css
@import "fumadocs-ui/css/preset.css";
```
But this conflicts with our existing `@custom-variant dark` and base border-color reset.

### Option 3: Manual cherry-pick
Copy the specific utilities (`fd-steps`, `fd-step`, `prose-no-margin`, `fd-scroll-container`) into our globals.css, plus the `--color-fd-*` variables.

## Confidence: HIGH

The CSS gap is definitively the #1 issue. Components will render structurally but look completely unstyled without fumadocs CSS variables.
