# Evidence: D5 — Editor libraries (TipTap, BlockNote, Milkdown, Plate, TinaCMS)

**Dimension:** How editor libraries style and lay out markdown-sourced `<table>` elements
**Date:** 2026-04-14
**Sources:** Locally cloned OSS at `~/.claude/oss-repos/{tiptap,blocknote,milkdown,plate,tinacms}`

---

## Key files referenced

- `tiptap/demos/src/Nodes/Table/React/styles.scss` — TipTap's reference stylesheet for the Table extension demo
- `blocknote/packages/core/src/editor/editor.css` — BlockNote's shipped editor CSS (`.bn-editor` scope)
- `milkdown/packages/plugins/theme-nord/src/style.css` — Milkdown's default Nord theme
- `plate/apps/www/src/registry/ui/table-node.tsx` — Plate UI registry table component (Tailwind classes)
- `tinacms/packages/@tinacms/app/src/index.css` — TinaCMS app CSS (no bespoke table rules)

---

## Findings

### Finding: TipTap's reference CSS uses `table-layout: fixed; width: 100%` inside a `.tableWrapper` with `overflow-x: auto`
**Confidence:** CONFIRMED
**Evidence:** `tiptap/demos/src/Nodes/Table/React/styles.scss:8-13, 58-61`

```scss
table {
  border-collapse: collapse;
  margin: 0;
  overflow: hidden;
  table-layout: fixed;
  width: 100%;
}

.tableWrapper {
  margin: 1.5rem 0;
  overflow-x: auto;
}
```

Cells use `min-width: 1em` and `padding: 6px 8px`, `vertical-align: top` (lines 15–22).

**Implications:** This is the upstream pattern that Open Knowledge inherits (same `.tableWrapper` + `overflow-x: auto`, same `table-layout: fixed; width: 100%`). The pattern is demo-CSS — TipTap publishes it as an example, not a prescribed rule, but it has been widely copied by downstream consumers (Docmost, likely others).

---

### Finding: BlockNote explicitly overrides the ProseMirror-tables default with `width: auto !important`
**Confidence:** CONFIRMED
**Evidence:** `blocknote/packages/core/src/editor/editor.css:145-147`

```css
.bn-editor [data-content-type="table"] table {
  width: auto !important;
  word-break: break-word;
}
```

The outer `.tableWrapper` has `overflow-y: hidden` (not `overflow-x`) and `width: 100%` (line 132-142). Cells have `padding: 5px 10px` (line 149-152). Columns are driven by per-cell `[colwidth]` attributes (prosemirror-tables convention).

**Implications:** BlockNote chose the opposite table sizing philosophy from TipTap's reference CSS: instead of forcing table to fill 100% of container (which the debug finding showed causes catastrophic wrapping), it uses `width: auto` so the table sizes to its content and overflows horizontally when content exceeds the container. This is the **auto-layout-with-overflow** pattern.

---

### Finding: Milkdown's Nord theme uses Tailwind `w-full` + wrapper `overflow-x-auto`, no explicit `table-layout`
**Confidence:** CONFIRMED
**Evidence:** `milkdown/packages/plugins/theme-nord/src/style.css:93-95, 182-184`

```css
.milkdown-theme-nord.prose .tableWrapper {
  @apply overflow-x-auto relative;
}
.milkdown-theme-nord table {
  @apply w-full border-collapse border text-sm;
}
```

Cells: `@apply !py-3 !px-6;` (line 101-104). No `table-layout` set → browser default `auto`.

**Implications:** Milkdown ships a hybrid pattern — `width: 100%` (like TipTap's demo) but `table-layout: auto` (unlike TipTap's demo). The wrapper handles overflow. With `auto` layout, columns size to content first and only then is the table stretched to 100%, so a table that exceeds its content column overflows horizontally rather than wrapping aggressively.

---

### Finding: Plate (registry UI) wraps the table in `w-fit` inside an `overflow-x-auto` container, uses `table-layout: fixed` with explicit `<colgroup>`
**Confidence:** CONFIRMED
**Evidence:** `plate/apps/www/src/registry/ui/table-node.tsx:689-690, 704-710`

Outer container: `<div class="... overflow-x-auto py-5">`. Inner wrapper: `<div class="group/table relative w-fit">`. Table: `<table class="... table h-px table-fixed border-collapse ...">`.

Columns: `<colgroup>` with explicit inline `style="width:..."` per `<col>` element, computed from `effectiveColSizes` state (resize handles update this).

**Implications:** Plate encodes the strategy most explicitly: **fit-content width** (table is only as wide as its content demands, via `w-fit`), **fixed layout** (column widths locked to `<colgroup>` values, making resize deterministic), **outer scroll container** (`overflow-x-auto` lets content exceed the prose column). Column widths are author-controllable via resize handles, persisting to the table model. Plate's plugin source is JS-only — CSS lives in the consumer's registry UI.

---

### Finding: TinaCMS ships no bespoke table CSS; rendering delegated to Plate
**Confidence:** CONFIRMED
**Evidence:** Only table-adjacent CSS rule in `tinacms/packages/@tinacms/app/src/index.css:151-159` is for a date picker's HTML `<table>` (`width: 100%; height: 28px;` for RDT). TinaCMS's `package.json` lists `@udecode/plate-table` as a dependency.

**Implications:** TinaCMS is downstream of Plate for rich-text editing; its table strategy is whatever Plate ships (see above).

---

## Cross-library summary table

| Library | `table-layout` | Table width | Wrapper | Wrapper overflow-x | Cell min-width | Source of CSS |
|---|---|---|---|---|---|---|
| **TipTap** (demo) | `fixed` | `100%` | `.tableWrapper` | `auto` | `1em` | demo stylesheet |
| **BlockNote** | (PM default) | `auto !important` | `.tableWrapper` | — (`overflow-y: hidden`) | `auto` (+ `[colwidth]`) | `editor.css` in `@blocknote/core` |
| **Milkdown** (Nord) | (default `auto`) | `100%` | `.tableWrapper` | `auto` | — | `theme-nord/style.css` |
| **Plate** (registry) | `fixed` (Tailwind `table-fixed`) | `w-fit` (content-sized) | outer `overflow-x-auto` + inner `w-fit` | `auto` | per-`<col>` inline `style` | consumer's `table-node.tsx` |
| **TinaCMS** | (Plate) | (Plate) | (Plate) | (Plate) | (Plate) | none (delegates) |

---

## Gaps / follow-ups

- TipTap's published CSS is in `demos/` (example code), not in the `@tiptap/extension-table` package source. The extension itself is pure schema + commands. Verify whether v3 has moved any CSS into a published stylesheet.
- BlockNote's `overflow-y: hidden` on the wrapper is unusual — investigate whether horizontal scroll actually works on wide tables (the CSS suggests yes, via the `width: auto` on the table plus natural document x-scroll).
