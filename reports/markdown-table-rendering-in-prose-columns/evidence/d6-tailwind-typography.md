# Evidence: D6 — Tailwind Typography (`prose` plugin)

**Dimension:** How the canonical "prose column" CSS implementation handles markdown tables
**Date:** 2026-04-14
**Sources:** tailwindlabs/tailwindcss-typography on GitHub (raw styles.js)

---

## Key files referenced

- https://raw.githubusercontent.com/tailwindlabs/tailwindcss-typography/main/src/styles.js — definitive source of the prose plugin's CSS rules
- Official plugin repo: https://github.com/tailwindlabs/tailwindcss-typography

---

## Findings

### Finding: Tailwind Typography's prose plugin sets `width: 100%; table-layout: auto` on tables and does NOT add any overflow handling or wrapper
**Confidence:** CONFIRMED
**Evidence:** Direct fetch of `src/styles.js`, retrieved 2026-04-14:

```js
table: {
  width: '100%',
  tableLayout: 'auto',
  marginTop: em(32, 16),
  marginBottom: em(32, 16),
},
thead: {
  borderBottomWidth: '1px',
  borderBottomColor: 'var(--tw-prose-th-borders)',
},
'thead th': {
  color: 'var(--tw-prose-headings)',
  fontWeight: '600',
  verticalAlign: 'bottom',
},
'tbody tr': {
  borderBottomWidth: '1px',
  borderBottomColor: 'var(--tw-prose-td-borders)',
},
'tbody tr:last-child': {
  borderBottomWidth: '0',
},
'tbody td': {
  verticalAlign: 'baseline',
},
'th, td': {
  textAlign: 'start',
},
'tbody td, tfoot td': {
  paddingTop: em(8, 12),
  paddingInlineEnd: em(12, 12),
  paddingBottom: em(8, 12),
  paddingInlineStart: em(12, 12),
},
```

Confirmed absent from `styles.js`:
- `overflow-x` on tables or any wrapper
- `display: block` on tables
- Any wrapper component or `:before`/`:after` reset that would create one
- Any `min-width` or `max-width` on cells or the table

**Implications:** Tailwind Typography treats tables as ordinary flow content within the prose column. Columns distribute via `table-layout: auto` (content-driven). When content exceeds the column width, the table simply overflows beyond `.prose`'s `max-width: 65ch` boundary — the plugin does not intervene. This is the **Author-controlled** family: the plugin ships display styling (borders, padding, vertical alignment) but no overflow strategy; the consumer (Astro, Hugo, whatever) is responsible for adding overflow handling if needed.

---

### Finding: The prose plugin does not define grid-column-escape or negative-margin-bleed behavior for tables
**Confidence:** CONFIRMED
**Evidence:** `src/styles.js` does not contain any rules with `margin-left: -`, `grid-column:`, or `max-width: 100%` overrides for tables. The only margin rules on tables are `marginTop`/`marginBottom`.

**Implications:** Prose classes scope styling to the text column. If a downstream consumer wants tables wider than the prose column, they must either (a) remove the table from the `.prose` scope (lift it up the DOM), (b) override via `not-prose` and wrap in a wider container, or (c) add `overflow-x: auto` themselves. Popular pattern observed in consumer documentation: wrap markdown tables in `<div class="not-prose overflow-x-auto">`.

---

### Finding: Prose column max-width is 65ch by default (`prose-base`), configurable per size variant
**Confidence:** CONFIRMED
**Evidence:** `src/styles.js` size variants section — each variant (`sm`, `base`, `lg`, `xl`, `2xl`) sets its own `css: { fontSize, lineHeight, p: {...} }` but the column `max-width` comes from `maxWidth: '65ch'` on the base prose rule.

**Implications:** A `prose` container is by design narrower than most viewports — an explicit reading-ergonomics constraint. Tables that need to exceed this must exit the prose scope (not configurable via the plugin itself).

---

## Cross-reference to consumer patterns

- **Astro + Tailwind docs** (per the Astro recipe linked from the Tailwind Typography README) explicitly recommend wrapping markdown tables in `<div class="overflow-x-auto">` inside a `.prose` container for horizontal scroll.
- **Fumadocs** (see D4 evidence) extends this pattern by using its own typography plugin with an explicit `Table` React wrapper component.
- **Docusaurus** (see D4 evidence) takes the opposite approach: rather than adding a wrapper, it sets `display: block; overflow: auto` on the `<table>` itself via Infima.

---

## Gaps / follow-ups

- The prose plugin's behavior could be shifting — the repo gained `prose-sm`, `prose-lg`, etc., in v0.4+ and it's worth confirming the table rules have not been modified in recent alphas/betas.
- Does the prose plugin surface `prose-table:` utilities for per-element customization? Yes — element modifiers like `prose-td:p-2` are documented in the README. This means a downstream consumer can override any table rule without writing raw CSS.
