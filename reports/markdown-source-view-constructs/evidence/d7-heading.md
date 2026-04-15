# Evidence: D7 — heading

**Dimension:** D7 — Source-view rendering of ATX and Setext headings
**Date:** 2026-04-14

---

## Key references

- `@lezer/markdown` grammar — `ATXHeading1`–`ATXHeading6`, `HeaderMark`, `SetextHeading1`/`2` (T1)
- `/tmp/cm-rich-markdoc/src/richEdit.ts` — reference decoration for `HeaderMark` (T1)

---

## Nodes

- **ATX:** `ATXHeading1` through `ATXHeading6` (the `#`/`##`/…/`######` form). `HeaderMark` = the `#` characters.
- **Setext:** `SetextHeading1` (underline `===`) and `SetextHeading2` (underline `---`). Less common in modern markdown.
**Confidence:** CONFIRMED (T1)

---

## Treatment options

1. **Plain text with syntax coloring** (baseline) — `#` chars colored, title text in base font
2. **Per-level font-size hierarchy** — h1 larger than h2, etc., applied via `Decoration.line` with `cm-heading-N` classes
3. **`#` marker hiding on cursor-outside** — Obsidian Live Preview pattern; hides the marker when cursor is NOT in the heading line, reveals on cursor entry
4. **Full rendered heading widget** — `Decoration.replace` with a rendered `<h1>` DOM; cursor-reveal for editing

---

## CM6 primitive fit

### Per-level font-size

```ts
// ViewPlugin iterating syntaxTree
if (/^ATXHeading[1-6]$/.test(node.name)) {
  const level = Number(node.name.slice(-1));
  decorations.add(line.from, line.from,
    Decoration.line({ attributes: { class: `cm-heading cm-heading-${level}` } }));
}
```

```css
.cm-heading-1 { font-size: 1.6em; font-weight: 700; }
.cm-heading-2 { font-size: 1.4em; font-weight: 700; }
.cm-heading-3 { font-size: 1.2em; font-weight: 600; }
/* ... */
```

### Marker hiding (cursor-reveal)

Apply `Decoration.mark` to `HeaderMark` tokens when cursor is not inside the heading node:

```ts
if (node.name === 'HeaderMark' && !(cursor.from >= parent.from && cursor.to <= parent.to)) {
  decorations.add(node.from, node.to + 1,  // +1 to include trailing space
    Decoration.mark({ class: 'cm-markdoc-hidden' }));
}
```

CSS for `cm-markdoc-hidden` typically uses `font-size: 1px; letter-spacing: -1ch; color: transparent` rather than `display: none` to avoid cursor-positioning breakage.

**Evidence:** `/tmp/cm-rich-markdoc/src/richEdit.ts:63-64` — reference implementation hides `HeaderMark` via `decorationHidden` decoration.

---

## Per-product findings

### Obsidian

**Source Mode:**
- `#` markers visible
- Per-level font-weight differentiation (some themes apply size too)
- No cursor-reveal on `#` markers
**Confidence:** INFERRED (T2)

**Live Preview:**
- Heading font-size hierarchy applied (h1 larger, etc.)
- `#` markers hidden when cursor outside; shown when editing
- This is the widely-documented "Live Preview" behavior
**Confidence:** CONFIRMED (T2 — forum + community plugin behavior)

### SilverBullet

Prior report noted "horizontal rules, headings, lists: CSS line-wrapping classes" — implies per-level class decoration exists. Specific font-size scheme unverified at this pass.
**Confidence:** UNRESOLVED (T2)

### codemirror-rich-markdoc

Hides `HeaderMark` via `decorationHidden` when cursor is not inside the enclosing heading node. The enclosing-node check is at `richEdit.ts:55-57`:

```ts
if ((node.name.startsWith('ATXHeading') || tokenElement.includes(node.name)) &&
    cursor.from >= node.from && cursor.to <= node.to)
  return false;  // skip decoration when cursor is inside
```

No explicit font-size hierarchy in this reference — decoration focuses on marker-hiding, not size.
**Confidence:** CONFIRMED (T1)

### VS Code

Built-in markdown grammar colors `#` tokens and heading text as distinct tokens. No font-size hierarchy. Community themes/extensions (some install headings-size-hierarchy CSS) are rare.
**Confidence:** CONFIRMED (T1)

### Typora

WYSIWYG: headings render at full size hierarchy like a rendered document. Source Code Mode: plain text with `#` visible.
**Confidence:** CONFIRMED (T2)

### HedgeDoc / MDXEditor / Marktext

Preview pane: full rendered hierarchy. Edit pane (source): plain text with syntax coloring.
**Confidence:** INFERRED (T2)

---

## Setext heading note

Most surveyed products treat Setext headings (underline form) as a lesser-supported variant — parsers handle them but editors rarely apply distinct styling. codemirror-rich-markdoc's check `node.name.startsWith('ATXHeading')` does NOT match Setext variants, so they wouldn't get marker-hiding.
**Confidence:** INFERRED (T2)

---

## Gaps / follow-ups

- **Per-level font-size hierarchy in source view:** technically easy via `Decoration.line` + CSS but not shipped as default by any surveyed product. Obsidian Live Preview comes closest; others skip it
- **Setext headings:** under-documented across the ecosystem
- **Heading anchors / IDs for intra-document links:** mostly a render concern, but source view could show an anchor indicator (unclaimed territory)
- **Outline panel coupling:** headings drive outline sidebars; no surveyed product integrates outline updates with live source-view heading decoration (they're separate systems)
