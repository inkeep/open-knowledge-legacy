# Evidence: D8-D10 — Responsive behavior, authoring hints, horizontal-scroll UX

**Dimensions:**
- D8: Responsive behavior (mobile / narrow-viewport degradation)
- D9: Markdown-spec authoring hints for full-bleed tables
- D10: Horizontal scroll UX ergonomics

**Date:** 2026-04-14

---

## D8 — Responsive behavior

Summary across surveyed products:

| Product | Responsive table strategy observed |
|---|---|
| TipTap demo | None observed — no media queries in `styles.scss` |
| BlockNote | None observed |
| Milkdown | Striped rows via `:nth-child(odd)`; no media-query resizing |
| Plate | None in plugin; consumer app drives |
| Outline | Sticky header via `.tableStickyHeader`; no cell reflow |
| BlockSuite | Scrollbar hidden-by-default, visible on hover; no cell reflow |
| Docusaurus (Infima) | `display: block; overflow: auto` is inherently responsive — table shrinks to container, scrolls when content exceeds |
| Fumadocs | Wrapper `overflow-auto` — same inherent behavior as Docusaurus |
| Tailwind Typography | None — no media queries for tables in `src/styles.js` |
| Logseq | Database tables: fixed 33px row height, virtual viewport; markdown tables: `overflow-x-auto` |
| Dendron / Foam | Delegates to VS Code markdown preview |
| HedgeDoc | 758px document-width cap (non-responsive — open issues requesting removal) |

**Pattern:** Across the surveyed set, *none* implement a cell-reflow responsive strategy (e.g., converting a wide table into a vertical list at mobile widths). Horizontal scroll is the universal pattern. Some products (Logseq database tables, Outline) add features (sticky header, sticky columns, virtual scroll) that improve the UX of scrolling within wide tables at any viewport.

**Implications:** The ecosystem converges on horizontal scroll as the responsive degradation. The "responsive table" pattern from traditional web design (display: block on mobile, label-per-cell approach à la CSS-Tricks' 2011 Chris Coyier article) has not penetrated markdown-editor products.

---

## D9 — Markdown-spec authoring hints for full-bleed tables

**Question:** Do any renderers support a syntax that lets the markdown author opt a specific table into full-width rendering?

### Findings

- **Markdown itself** provides no syntax for this — the commonmark `| | |` pipe syntax has no width or layout attributes.
- **MDX** supports it by allowing authors to use a `<Table>` JSX component instead of markdown tables, bypassing the markdown renderer. This is exclusively an MDX pattern; plain-markdown authoring cannot express it.
- **Pandoc-extended markdown** supports attribute blocks (`{.full-width}` after a table) via Pandoc's `attributes` extension. Not widely supported outside Pandoc-based pipelines. Zettlr (which exports via Pandoc) could use this.
- **Obsidian** has no native syntax; users apply CSS snippets that auto-match all tables or specific CSS classes applied via HTML comments (`<!-- class: wide -->` conventions in the community).
- **Fumadocs / Docusaurus / Mintlify** consume MDX, so authors can use JSX components. They do not extend markdown table syntax.

**Observation:** No editor in the surveyed set treats table-width as an authoring-level property. Either all tables are treated uniformly (Docusaurus, Fumadocs) or the author escalates to JSX/HTML (MDX editors) or CSS snippets (Obsidian). This aligns with "Family F — Author-controlled" patterns.

**Implications:** A downstream product choosing to support per-table width overrides would need to introduce an extension — either a markdown directive (e.g., the `remark-directive` ecosystem's `::table{.full-bleed}` syntax) or an MDX-style JSX wrapper. Neither is standard markdown.

---

## D10 — Horizontal scroll UX ergonomics

### Scrollbar styling

Products that ship explicit scrollbar styling:

| Product | Scrollbar treatment |
|---|---|
| Outline | `scrollbar-width: thin`; Webkit scrollbar styled, hidden by default, visible on hover (`outline/shared/editor/components/Styles.ts:2347-2365`) |
| BlockSuite | Webkit scrollbar styled with hover reveal (`blocksuite/packages/affine/blocks/table/src/table-block-css.ts:3-27`) |
| Logseq | `.force-visible-scrollbar` class for markdown tables (always visible) |
| Milkdown | No explicit scrollbar styling — relies on browser default |
| TipTap demo / BlockNote / Plate | No explicit scrollbar styling |
| Fumadocs | No explicit scrollbar styling |
| Docusaurus | No explicit scrollbar styling on the table; scrollbar style inherits from Infima's `body` scrollbar rules if present |
| Tailwind Typography | No scrollbar styling |

**Pattern:** Editors that emphasize a polished editing UI (Outline, BlockSuite) invest in scrollbar styling with hover reveal. Docs frameworks (Docusaurus, Fumadocs) and rendering plugins (Tailwind Typography) leave scrollbars to the browser default. The always-visible scrollbar (Logseq) is the rarer choice; it trades aesthetic cleanliness for always-discoverable scroll affordance.

### Scroll affordance (visual cues)

No surveyed product ships **scroll-shadow indicators** (gradient fade at left/right edges of the scroll container indicating more content) by default. This is a well-known CSS pattern (using `background-attachment: local`) but absent from the surveyed editors.

### Touch scrolling

Dendron alone explicitly sets `-webkit-overflow-scrolling: touch` on `.table-responsive`. Other products rely on browser defaults, which have supported momentum touch scrolling on iOS/Android for years.

### Keyboard scrolling

Not observed as a first-class concern in any surveyed product's CSS. Browser default (focused scroll container + arrow keys, Page Up/Down) applies.

---

## Gaps / follow-ups

- Sticky headers / sticky columns in wide tables: Outline (`tableStickyHeader`) and Logseq (`sticky-columns` in database tables) are the only observed examples. Worth exploring how they implement sticky within a scrolling container.
- Scroll-shadow indicators: none observed, but widely documented. Would be a differentiator for a product shipping polished horizontal-scroll UX.
- The CSS-Tricks responsive-table pattern (`display: block` + `::before` label per cell) was popular ~2012–2018 in web design but has effectively died in the editor ecosystem. A systematic web search for its decline and why markdown editors skipped it is an interesting adjacent question.
