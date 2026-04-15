# Evidence: D7 — Column-width mechanics (`table-layout`, `width: 100%`, `min-width`, `display: block`)

**Dimension:** How the CSS specification governs table column widths under the competing strategies observed in D1-D6
**Date:** 2026-04-14
**Sources:** W3C CSS 2.1 §17, MDN references, community discussions surfaced during competitor research

---

## Key references

- W3C CSS 2.1 §17.5 Visual layout of table contents: https://www.w3.org/TR/CSS21/tables.html
- MDN `table-layout`: https://developer.mozilla.org/en-US/docs/Web/CSS/table-layout
- Docusaurus discussion #11308: https://github.com/facebook/docusaurus/discussions/11308 (community evidence of `display: block` + `table-layout` interaction)

---

## Findings

### Finding: `table-layout: fixed` takes column widths from `<colgroup>` / first row, ignoring cell `min-width` and content-driven sizing
**Confidence:** CONFIRMED (CSS spec behavior)
**Evidence:** W3C CSS 2.1 §17.5.2.1 "Fixed table layout":

> In this algorithm, the horizontal layout of the table does not depend on the contents of the cells; it only depends on the table's width, the width of the columns, and borders or cell spacing.

Under fixed layout, the browser:
1. Reads explicit widths from `<col>` elements (if present) or the first row's cells.
2. Distributes any remaining table width equally among unspecified columns.
3. Does NOT expand columns to fit content — content that exceeds the column wraps.
4. Does NOT respect `min-width` on cells — that's an auto-layout signal.

**Implications:** The Open Knowledge debug finding reproduced this exactly: `.ProseMirror th, td { min-width: 80px }` was silently ignored because `table-layout: fixed` doesn't consult `min-width`. With `width: 100%` on the table and 6 columns, each column got `container_width / 6 ≈ 68px`, below the declared 80px floor.

---

### Finding: `table-layout: auto` sizes columns to fit cell content (honoring `min-width`), then may expand the table beyond the container if content requires it
**Confidence:** CONFIRMED (CSS spec behavior)
**Evidence:** W3C CSS 2.1 §17.5.2.2 "Automatic table layout":

> The column width is the maximum of all the column widths declared by the individual cells, and the minimum cell width for that column [...]. If the total column widths plus required spacing is less than the maximum width available, the extra space is distributed among the columns. If it's greater, the table is made wider than its containing block, potentially overflowing it.

`min-width` on cells IS respected here. Content can force columns wider than a `width: 100%` declaration, making the table exceed its container — and overflow becomes visible if the container has `overflow-x: auto` (or similar), or gets clipped if `overflow: hidden`, or extends past the container boundary if `overflow: visible`.

**Implications:** Auto layout is the mechanism that makes Wrapper-scroll and Block-scroll strategies work. The table is free to exceed its container's width, and overflow handling on the container (wrapper) or on the table itself (block-scroll) converts that excess into horizontal scroll.

---

### Finding: `display: block` on `<table>` changes it from a CSS table-formatting context to a block-formatting context, unlocking `overflow: auto` but breaking native table auto-fit behavior
**Confidence:** CONFIRMED
**Evidence:** MDN `display: block`: non-replaced block element creates a block box. W3C CSS 2.1 §17.4: "Default 'display' values for table elements are: table for <table>, table-row for <tr>, ...". Changing `<table>` to `display: block` removes it from the CSS table layout algorithm entirely.

Side effects observed:
- The table no longer participates in automatic column-width distribution across rows — each row renders independently within the block context.
- `overflow: auto` / `overflow-x: auto` now works on the `<table>` itself (it would not on a `display: table` element because table is its own formatting context).
- `table-layout: fixed` becomes meaningless — the block element has a block's width, not a table's.

Community evidence: Docusaurus discussion #11308 documents users switching back to `display: table` (overriding Infima) to recover column-width control, trading block-scroll for the auto-layout behavior.

**Implications:** `display: block` on a `<table>` is a pragmatic choice: it gets horizontal scroll for free but gives up the richness of CSS table layout. Docusaurus made this trade; Fumadocs and Outline did not (they wrap instead, preserving `display: table`).

---

### Finding: `width: 100%` + `table-layout: fixed` is the specific combination that produces catastrophic wrapping when the container is narrow
**Confidence:** CONFIRMED (derivable from the above)
**Evidence:** Combining the fixed-layout rule (columns equal-width within the table width) with `width: 100%` (table width = container width) means:

- Each column = `container_width / N_columns`
- Content exceeding the column's width wraps to the next line
- Row height = max(cell heights) = max number of wrapped lines × line-height

With a narrow container (e.g., a 408px prose column) and a 6-column table, each column gets ~68px. Long text content wraps to many lines (word-wrap is on by default), making rows thousands of pixels tall. This is the failure mode reproduced in the Open Knowledge debug session (Phase 3 of `/debug` run, 2026-04-14 — `PROJECT.md` rendered a 235,320px-tall table inside a 408px container).

**Implications:** This combination is pathological when the container is narrower than the sum of content-driven column widths. The correct mitigation depends on the strategy family:
- Wrapper-scroll: let the table exceed the container (`width: auto` or remove `width: 100%`), wrap in `overflow-x: auto`.
- Block-scroll: `display: block` + `overflow: auto` on the table itself.
- Grid-escape / bleed: give the table a wider grid column or negative horizontal margins.

---

## Mechanics summary: combinations and their outcomes

| `table-layout` | Table `width` | `overflow-x` location | Outcome when content exceeds natural column widths |
|---|---|---|---|
| `fixed` | `100%` | (any) | Content wraps within fixed-width columns → rows get tall |
| `fixed` | `auto` / unset | wrapper | Column widths from `<colgroup>` / first row; table can exceed container; wrapper scrolls |
| `auto` | `100%` | wrapper | Table attempts to fit container but if content demands more, table exceeds it; wrapper scrolls |
| `auto` | `max-content` | wrapper | Table sized to widest content; wrapper scrolls (BlockSuite, BlockNote) |
| (N/A, `display: block`) | `100%` | on table itself | Table element scrolls; `table-layout` is meaningless |

---

## Gaps / follow-ups

- The specific behavior of `min-width` interaction with `table-layout: fixed` when a `<colgroup>` IS present (vs absent, as in the Open Knowledge case) may differ. The spec text is clear, but browser implementations sometimes diverge; a cross-browser test would be worth doing for a production fix.
- How does CSS Grid's subgrid (browser support landed 2023) interact with table rendering inside a grid item? This may offer a newer, cleaner grid-column-escape approach than the `1fr` track template.
