# Evidence: D1 — Strategy taxonomy (families of CSS/DOM approaches)

**Dimension:** Classify observed strategies into families with CSS patterns and HTML skeletons
**Date:** 2026-04-14
**Sources:** Cross-cutting synthesis of D2–D7 evidence files

---

## Strategy families observed

Six distinct CSS/DOM strategy families were observed across the surveyed products. A single product can combine two (e.g., Outline combines Wrapper-scroll with Negative-margin-bleed). Each family is a different answer to the question: *when a markdown table exceeds the prose column's width, where does the excess go?*

---

### Family A — Wrapper-scroll

**Idea:** Wrap the `<table>` in a container div with `overflow-x: auto`. The table can be sized to its content (`auto` layout) or fill the wrapper (`width: 100%`). When the table exceeds the wrapper width, the wrapper scrolls horizontally; the surrounding prose column is unperturbed.

**HTML skeleton:**
```html
<div class="tableWrapper" style="overflow-x: auto;">
  <table>…</table>
</div>
```

**CSS typical:**
```css
.tableWrapper { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; }
```

**Representative implementations:**
- TipTap demo stylesheet (`.tableWrapper { overflow-x: auto }` + `table { width: 100%; table-layout: fixed }`) — `tiptap/demos/src/Nodes/Table/React/styles.scss:58-61`
- Milkdown Nord theme (`.milkdown-theme-nord .tableWrapper { overflow-x-auto }` + `table { w-full; border-collapse }`) — `milkdown/packages/plugins/theme-nord/src/style.css:93-95`
- Fumadocs Radix MDX component (`<div class="relative overflow-auto ...">`) — `fumadocs/packages/radix-ui/src/mdx.tsx:52-58`
- Logseq markdown tables (`.force-visible-scrollbar { !overflow-x-auto }`) — `logseq/src/main/frontend/components/table.css`

**Notes:**
- Works best when table uses `table-layout: auto` + `width: max-content` (or no `width`), so content drives column size and the wrapper handles overflow naturally.
- When paired with `table-layout: fixed; width: 100%`, the wrapper never fills because the table is pinned to the container width — and content wraps catastrophically instead of overflowing. See D7.

---

### Family B — Block-scroll

**Idea:** Convert the `<table>` itself into a block element with `display: block`, then set `overflow: auto` on it. No wrapper needed — the table element is its own scroll container.

**HTML skeleton:**
```html
<table>…</table>   <!-- no wrapper -->
```

**CSS typical:**
```css
table {
  display: block;
  overflow: auto;
  border-collapse: collapse;
}
```

**Representative implementations:**
- Docusaurus via Infima — https://unpkg.com/infima@0.2.0-alpha.45/dist/css/default/default.css: `table { display: block; overflow: auto; border-collapse: collapse; }`
- AFFiNE/BlockSuite tableContainer (`display: 'block', overflowX: 'auto'`) — but note: this styles the block's container `<div>`, not a raw `<table>`; BlockSuite doesn't emit `<table>` for its native blocks

**Notes:**
- Trade-off: `display: block` removes the `<table>` from CSS table layout, so `table-layout: fixed` becomes inert, column-width rules stop working, and author-controlled column widths (via `<colgroup>`) are harder to implement. See D7 and Docusaurus discussion #11308.
- Cleanest minimal-CSS solution when author-controlled columns aren't required.

---

### Family C — Grid-column-escape

**Idea:** The surrounding layout uses a CSS Grid with named columns (e.g., `content` and `full`). The table is placed in a wider column (`grid-column: full`) than the prose text (`grid-column: content`). The table visually bleeds wider than the text while staying within document structure.

**HTML skeleton:**
```html
<article class="prose-grid">
  <p>…prose content…</p>
  <table class="full-bleed">…</table>
</article>
```

**CSS typical:**
```css
.prose-grid {
  display: grid;
  grid-template-columns:
    [full-start] 1fr
    [content-start] min(65ch, 100%)
    [content-end] 1fr
    [full-end];
}
.prose-grid > * { grid-column: content; }
.prose-grid > .full-bleed { grid-column: full; }
```

**Representative implementations:**
- **Not directly observed in the surveyed OSS competitors.** The pattern is well-established in modern typography blogs and the Every-Layout / CSS-Tricks tradition but is not shipped by default in any of the surveyed editors.
- Open Knowledge's own editor uses this grid template (`.tiptap-editor`) but does NOT opt tables into the wider column — they remain in `content`.

**Notes:**
- Cleanest result visually: tables look wider than the prose without horizontal scroll.
- Requires the editor to expose a way for the renderer to tag tables as full-bleed (CSS class, data attribute, or author markup).
- No observed example of this in the editor ecosystem was found during research — may be a docs-blog pattern more than an editor pattern.

---

### Family D — Negative-margin-bleed

**Idea:** The table's wrapper has negative horizontal margins that push it outside the prose column's horizontal padding. Combined with `overflow-x: auto`, it gives the table extra width AND a scroll fallback.

**HTML skeleton:**
```html
<div class="tableScrollable">
  <table>…</table>
</div>
```

**CSS typical:**
```css
.tableScrollable {
  margin: -1em -24px -0.5em;  /* negative L/R margin bleeds past container padding */
  overflow-x: auto;
}
```

**Representative implementations:**
- Outline (`outline/shared/editor/components/Styles.ts:2347-2365` — `margin: -1em ${-padding}px -0.5em`)

**Notes:**
- Observed in exactly one competitor. Combines two families (wrapper-scroll + bleed) for defense-in-depth.
- Depends on the container having matching positive padding that the negative margin can cancel. Brittle if the padding amount changes.
- No schema/author markup needed — the wrapper div is always present.

---

### Family E — Column-width-cap (document-level constraint)

**Idea:** The document container has a max-width (e.g., 758px for HedgeDoc view-only mode). Tables inside inherit this constraint and overflow the viewport horizontally if wide — the problem is not table-specific; it's document-width-specific.

**HTML skeleton:**
```html
<article style="max-width: 758px;">
  <p>…</p>
  <table>…</table>
</article>
```

**Representative implementations:**
- HedgeDoc view-only mode (observed via open issues #2828, #5568 asking for the constraint to be lifted)

**Notes:**
- Not a table strategy per se — a document strategy that happens to affect tables.
- Users reliably raise this as a bug (open HedgeDoc issues); it's evidence that this family under-serves authors who need wide tables.

---

### Family F — Author-controlled / No-default

**Idea:** The editor/framework ships no overflow handling for tables. Authors (or consuming teams) add their own wrapper, CSS, or snippet.

**Representative implementations:**
- Tailwind Typography `prose` plugin — no overflow, no wrapper, no `display: block` (`src/styles.js` retrieved 2026-04-14)
- Obsidian default — no overflow handling; community CSS snippets (e.g., https://forum.obsidian.md/t/table-width-css-snipptes/77550) are the canonical workaround
- SilverBullet — table CSS is user-customizable via Space Style
- Zettlr — export CSS is user-provided (docs.zettlr.com/en/core/custom-css)
- Foam — inherits entirely from VS Code markdown preview
- Plate plugin source (without its registry UI) — CSS is consumer's responsibility

**Notes:**
- This is the most common family by count of products. It shifts the CSS burden to downstream consumers.
- Works fine for narrow tables or wide viewports; fails (overflows the viewport) for wide tables in constrained layouts.

---

## Orthogonal lever: table sizing

Two additional choices cross all families:

| Lever | Option 1: `width: 100%; table-layout: fixed` | Option 2: `width: auto` / `max-content`; `table-layout: auto` |
|---|---|---|
| Column widths | Equal-divided, `<colgroup>` can override | Content-driven, `min-width` respected |
| Wide content behavior | Wraps within fixed columns → rows get tall | Table grows past container |
| Paired with Wrapper-scroll | Wrapper never fills; content wraps instead of scrolling | Wrapper scrolls horizontally ← common correct combination |
| Paired with Block-scroll | `table-layout: fixed` is inert (`display: block` overrides) | Works normally |
| Author column control | Excellent (colgroup + resize handles) | Weaker (content rules) |

Observed combinations:
- TipTap demo: Fixed + 100% + Wrapper (produces wrapping when container narrow — the Open Knowledge bug)
- BlockNote: Auto + `auto!important` + Wrapper
- Milkdown: Auto + 100% + Wrapper
- Plate (registry): Fixed + `w-fit` (fit-content) + outer overflow wrapper
- Docusaurus: `display: block` + 100% + no wrapper
- Outline: Auto (via `border-collapse: separate`) + 100% + Wrapper with negative margin
- Fumadocs: Auto + 100% + Wrapper
- Tailwind Typography: Auto + 100% + no wrapper (author-controlled)

---

## Gaps / follow-ups

- Family C (Grid-column-escape) was not observed in any surveyed editor. This is itself a finding: the grid-escape idea is a typography/docs-blog pattern but is rarely shipped as the default in editor products. Worth exploring whether emerging editors (Lexical-based products, Y-CRDT products shipping post-2025) have adopted it.
- Several products hybridize families (Outline: A+D; Plate: A + content-sized width). A richer classification might use a matrix (wrapper yes/no × scroll-surface × table-layout × width strategy) instead of six families.
