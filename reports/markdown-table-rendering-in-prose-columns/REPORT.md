---
title: "Markdown Table Rendering in Prose-Constrained Columns"
description: "How 17 markdown editors, docs frameworks, and editor libraries handle the mismatch between wide tables and reader-optimized narrow prose columns. Covers six strategy families — wrapper-scroll, block-scroll, grid-column-escape, negative-margin-bleed, document-width-cap, author-controlled — with evidence from each product's shipped CSS or documented behavior."
createdAt: 2026-04-14
updatedAt: 2026-04-14
subjects:
  - TipTap
  - BlockNote
  - Milkdown
  - Plate
  - TinaCMS
  - Outline
  - AFFiNE
  - BlockSuite
  - Obsidian
  - Docmost
  - Logseq
  - SilverBullet
  - HedgeDoc
  - Zettlr
  - Dendron
  - Foam
  - Docusaurus
  - Mintlify
  - Fumadocs
  - Tailwind Typography
  - ProseMirror
  - Infima
topics:
  - table rendering
  - prose column layout
  - overflow strategies
  - CSS table-layout
  - responsive tables
  - MDX components
  - markdown editors
---

# Markdown Table Rendering in Prose-Constrained Columns

**Purpose:** Catalog the CSS and DOM strategies that competitor markdown/rich-text editors and docs frameworks use to render tables when the surrounding prose is constrained to a narrow reader-optimized column. The reader is a product/engineering audience deciding how their own editor should handle wide tables; this report provides the 3P factual landscape.

---

## Executive Summary

The ecosystem has converged on **horizontal scroll** as the answer to "the table is wider than the prose column." None of the 17 surveyed products implement cell-reflow responsive strategies (Chris Coyier's 2012 `display: block` on mobile pattern is effectively extinct in editor products). What varies is **where the scroll lives** (on the table, on a wrapper, on the document, or on the author's CSS) and **how the table is sized** (fill-container, fit-content, fixed-column, content-driven).

The surveyed strategies cluster into **six families**:

| Family | Idea | Representative products |
|---|---|---|
| **A — Wrapper-scroll** | Wrap `<table>` in a `<div>` with `overflow-x: auto` | TipTap demo, Milkdown, Fumadocs, Logseq (markdown path) |
| **B — Block-scroll** | `display: block; overflow: auto` on the `<table>` itself; no wrapper | **Docusaurus** (via Infima) |
| **C — Grid-column-escape** | Let tables occupy a wider grid column than prose text | **Not observed in any surveyed editor** — typography-blog pattern only |
| **D — Negative-margin-bleed** | Wrapper has negative margins, bleeds table past prose padding | **Outline** (unique combination with Wrapper-scroll) |
| **E — Document-width-cap** | Document-level max-width constrains everything, including tables | HedgeDoc (view-only mode) |
| **F — Author-controlled** | Ship no overflow handling; author adds their own | Tailwind Typography `prose`, Obsidian default, SilverBullet, Zettlr, Foam, Plate plugin |

**Key Findings:**

- **The `table-layout: fixed` + `width: 100%` + narrow container combination is a known failure mode** — it produces catastrophic row-height inflation because columns are equal-divided below the natural content width, forcing aggressive wrapping. The bug surfaces reliably when the `<.tableWrapper>` parent is narrower than `cell_count × natural_min_column_width`. TipTap's widely-copied demo CSS uses this combination; downstream consumers who inherit it share the behavior.
- **Wrapper-scroll is the dominant family** by count, but its implementations diverge on the table's sizing policy. Milkdown + TipTap demo + Fumadocs set `width: 100%` on the table; BlockNote sets `width: auto !important`; Plate uses `w-fit` (content-sized). Only the `auto`/`max-content`/`fit-content` variants let wrapper-scroll actually scroll when content exceeds the column.
- **Docusaurus's block-scroll approach** (`display: block; overflow: auto` on the table itself, via Infima) is the minimalist alternative — no wrapper needed, but `table-layout: fixed` becomes inert and author-controlled column widths get harder.
- **Tailwind Typography's `prose` plugin ships no overflow handling** (as of `main` on 2026-04-14) — its `src/styles.js` contains `table: { width: '100%', tableLayout: 'auto', … }` with zero `overflow-x`, `display: block`, or wrapper. Every downstream consumer of `prose` that renders markdown tables must add overflow handling externally.
- **Grid-column-escape (Family C) was not observed in any surveyed editor product.** It's a well-documented typography-blog pattern (Every Layout, CSS-Tricks) but absent from the editor ecosystem as of this survey. Open Knowledge's own layout uses a grid template for prose — but (per its `/debug` finding of 2026-04-14) does not opt tables into a wider column.
- **No product surveyed supports a markdown-level authoring hint** for per-table full-bleed rendering. MDX-based frameworks allow authors to drop to JSX (`<Table>`) to bypass the markdown pipeline entirely; plain-markdown editors treat all tables uniformly or rely on CSS classes injected out-of-band.

---

## Research Rubric

**Primary question:** When a markdown table has more columns or wider cell content than fits the prose column, what CSS/DOM strategies does each editor use, and how do those cluster into families?

**Stance:** Factual 3P survey. No recommendations. The downstream spec that consumes this report will apply the findings.

**Dimensions:**

| # | Dimension | Priority |
|---|---|---|
| D1 | Strategy taxonomy (families) | P0 / Deep |
| D2 | Tier 1 editor products (Obsidian, Outline, AFFiNE/BlockSuite, Docmost) | P0 / Deep |
| D3 | Tier 2 folder-of-markdown editors (Logseq, SilverBullet, HedgeDoc, Zettlr, Dendron, Foam) | P0 / Moderate |
| D4 | Tier 3 docs-as-code (Docusaurus, Mintlify, Fumadocs) | P0 / Deep |
| D5 | Tier 6 editor libraries (TipTap, BlockNote, Milkdown, Plate, TinaCMS) | P0 / Deep |
| D6 | Tailwind Typography `prose` plugin | P0 / Moderate |
| D7 | Column-width mechanics (CSS spec) | P0 / Deep |
| D8 | Responsive behavior | P1 / Moderate |
| D9 | Markdown-spec authoring hints | P1 / Moderate |
| D10 | Horizontal scroll UX ergonomics | P2 / Light |

**Non-goals:** Data-table features (sort/filter/virtual-scroll/sticky); editing ergonomics beyond layout; SSR/hydration; schema-level MDX components that bypass markdown tables; 1P analysis of Open Knowledge; print stylesheets; ARIA semantics.

---

## Detailed Findings

### D1 — Strategy taxonomy

**Finding:** Six strategy families account for every observed implementation. Products can combine families (Outline combines A and D). Two orthogonal levers — wrapper-yes/no and `table-layout` fixed vs. auto — cross-cut the families. See evidence for the full family reference.

**Evidence:** [evidence/d1-strategy-taxonomy.md](evidence/d1-strategy-taxonomy.md)

**Strategy family skeletons (CSS + HTML):**

```text
A (Wrapper-scroll):      <div overflow-x: auto> <table width:100%|auto> </div>
B (Block-scroll):        <table display:block; overflow:auto>
C (Grid-column-escape):  article {grid-template: [full][content][content-end][full]}
                         table { grid-column: full; }
D (Negative-margin):     <div style="margin:-1em -24px; overflow-x:auto"><table></div>
E (Document-width-cap):  <article style="max-width: 758px"> <table> </article>
F (Author-controlled):   <table>  [+ CSS shipped by author/theme]
```

**Implications:** The six-family taxonomy gives consumers a vocabulary for picking between strategies. Families A, B, and D solve the same problem (wide table in narrow column) with different trade-offs on `<colgroup>` compatibility, wrapper DOM cost, and author markup requirements. Family C solves it differently (expand the column instead of scrolling). Family E is a document-wide constraint that happens to affect tables. Family F is a non-decision.

**Decision triggers (when the distinction matters):**
- If the editor needs author-controlled column widths (`<colgroup>` + resize handles), Family B becomes problematic — `display: block` neutralizes `table-layout: fixed`. Prefer A or D.
- If the editor ships zero DOM around content (raw markdown → raw `<table>`), Family B is the lowest-cost default.
- If the layout is already a grid with named tracks, Family C is almost free.

**Remaining uncertainty:** No observed editor ships Family C as a default — whether this is a deliberate design choice or a historical gap in the ecosystem is unresolved.

---

### D2 — Tier 1 editor products

**Finding:** Four products vary widely. Outline is the most sophisticated — wrapper-scroll with negative-margin bleed and sticky header. AFFiNE/BlockSuite renders tables as native blocks (not `<table>`) so the question doesn't directly apply to its markdown-sourced tables. Obsidian default ships no overflow handling; the community-snippet ecosystem fills the gap. Docmost's specific CSS could not be verified.

**Evidence:** [evidence/d2-tier1-products.md](evidence/d2-tier1-products.md)

| Product | Family | Wrapper | `table-layout` | Table width | Confidence |
|---|---|---|---|---|---|
| **Outline** | A + D (Wrapper-scroll + Negative-margin-bleed) | `.tableScrollable` with `margin: -1em -Npx` | (auto, via `border-collapse: separate`) | `100%` | CONFIRMED |
| **AFFiNE/BlockSuite** | A (Wrapper-scroll, `max-content`) | `tableContainer` + inner `max-content` wrapper | N/A (not `<table>`) | `max-content` | CONFIRMED |
| **Obsidian** (default) | F (Author-controlled) | — | — | — | INFERRED (from community CSS-snippet demand) |
| **Docmost** | UNRESOLVED (likely A via TipTap lineage) | — | — | — | UNRESOLVED |

**Implications for the reader:** Outline's approach is the most polished editor pattern in the surveyed set — a model for any TipTap-based editor that wants a nuanced default. AFFiNE/BlockSuite's native-block approach is a separate product direction (block-first, not markdown-first) that effectively sidesteps markdown-table rendering.

---

### D3 — Tier 2 folder-of-markdown editors

**Finding:** Strong split between editors that render markdown themselves (Logseq) and those that delegate to a host (Dendron, Foam → VS Code; Zettlr → Pandoc for export, source-only in editor). Editors in the delegate-to-host group inherit whatever the host ships; editors rendering themselves use Wrapper-scroll with varying rigor. HedgeDoc uniquely caps the *document* width, not the table specifically, and the open issues indicate users find this a pain point.

**Evidence:** [evidence/d3-tier2-editors.md](evidence/d3-tier2-editors.md)

| Editor | Family | Source of CSS |
|---|---|---|
| **Logseq** (markdown tables) | A (Wrapper-scroll via `.force-visible-scrollbar`) | Own CSS |
| **Dendron** | A (opt-in via `.table-responsive` wrapper) | Minimal overlay on VS Code preview |
| **Foam** | (delegates to VS Code) | Zero table rules in own CSS |
| **HedgeDoc** | E (Document-width-cap at 758px) | markdown-it default |
| **SilverBullet** | F (Author-controlled via Space Style) | User CSS |
| **Zettlr** | F (Author-controlled on export) / N/A (source view in editor) | User CSS + Pandoc |

**Implications:** Half of Tier 2 editors effectively externalize the problem — either to a host IDE or to user CSS. Logseq alone among them ships a default overflow strategy. This reveals an ecosystem norm for folder-of-markdown tools: the editing experience is source-text-canonical (or block-outline-canonical), and rendered-table CSS is a secondary concern handled by the rendering host.

---

### D4 — Docs-as-code frameworks

**Finding:** Docusaurus and Fumadocs pick opposite strategies for the same problem. Mintlify remains opaque.

**Evidence:** [evidence/d4-docs-as-code.md](evidence/d4-docs-as-code.md)

- **Docusaurus (via Infima, version 0.2.0-alpha.45 as queried 2026-04-14)** applies `table { display: block; overflow: auto; border-collapse: collapse; }` directly on the `<table>` element. No React wrapper component exists — `docusaurus-theme-classic/src/theme/MDXComponents/` has no `Table` file. This is Family B (Block-scroll) in its cleanest form. Trade-off: `table-layout: fixed` is effectively disabled by `display: block`, so `<colgroup>`-based column sizing gets harder (see community discussion #11308, where users switch to `display: table` to recover column-width control).
- **Fumadocs** (Radix UI variant) ships a React component that wraps every markdown `<table>` in `<div class="relative overflow-auto prose-no-margin my-6">`. The table inside is `width: 100%; table-layout: auto`. This is Family A (Wrapper-scroll). Evidence: `fumadocs/packages/radix-ui/src/mdx.tsx:52-58`.
- **Mintlify** is closed-source and its rendered-page CSS was not publicly accessible via WebFetch. Classification: INACCESSIBLE.

**Implications:** Docs-as-code frameworks are the surveyed group most likely to ship a default overflow strategy (two of three do, the third is opaque). The split between them — component-wrapper vs. CSS-only — reveals that both strategies are battle-tested at scale. Docusaurus's choice favors minimum DOM; Fumadocs's choice favors preserving CSS table semantics.

---

### D5 — Editor libraries

**Finding:** Editor libraries split cleanly between those shipping a demo/reference stylesheet (TipTap, BlockNote, Milkdown) and those delegating entirely to the consumer (Plate plugin, TinaCMS). The shipping ones converge on Wrapper-scroll but differ on table sizing — and this divergence is the mechanism behind the Open Knowledge production bug diagnosed in parallel.

**Evidence:** [evidence/d5-editor-libraries.md](evidence/d5-editor-libraries.md)

| Library | Family | Wrapper | `table-layout` | Table width | Notes |
|---|---|---|---|---|---|
| **TipTap demo** | A | `.tableWrapper` | `fixed` | `100%` | Widely copied; this combo is the narrow-container failure mode (see D7) |
| **BlockNote** | A | `.tableWrapper` | (default) | `auto !important` | Deliberately overrides width to fit content |
| **Milkdown** (Nord) | A | `.tableWrapper` | (default `auto`) | `100%` | Auto layout + full width |
| **Plate** (registry UI) | A | outer `overflow-x-auto` + inner `w-fit` | `fixed` | `w-fit` (content-sized) | Most explicit — `<colgroup>` + resizable |
| **TinaCMS** | (delegates to Plate) | — | — | — | No own table CSS |

**Divergence headline:** TipTap ships `fixed; width: 100%` in its demo, which works fine when the wrapper is ≥ cells' natural widths combined but fails catastrophically in narrow wrappers. BlockNote explicitly overrode this (`width: auto !important`). This split is load-bearing for products downstream of these libraries.

**Implications:** The choice a downstream product makes when copying from TipTap's demo matters. The demo isn't canonical — BlockNote and Milkdown both diverged from it. Products that adopted it verbatim (including Open Knowledge, per parallel debug findings) inherit its failure mode at narrow widths.

---

### D6 — Tailwind Typography (`prose` plugin)

**Finding:** The de-facto "prose column" CSS implementation ships **no overflow handling** for tables. `src/styles.js` sets `table: { width: '100%', tableLayout: 'auto', … }` with zero `overflow-x`, `display: block`, wrapper, or `min-width` — confirmed verbatim 2026-04-14 via direct fetch of the raw source.

**Evidence:** [evidence/d6-tailwind-typography.md](evidence/d6-tailwind-typography.md)

**Implications:** Any product that uses `@tailwindcss/typography` as a baseline (a large portion of the docs/static-site ecosystem — Astro, Next.js starters, many Hugo themes) gets tables-inside-prose with no overflow handling by default. Known consumer patterns to compensate:

- Wrap tables in `<div class="not-prose overflow-x-auto">` explicitly
- Install a markdown plugin (remark-plugin) that auto-wraps tables
- Override via element modifiers (e.g., `prose-table:block prose-table:overflow-auto`)

Fumadocs extends the prose baseline with its own typography plugin + React wrapper — a pattern that could be replicated by anyone using the prose plugin as a foundation rather than a complete solution.

---

### D7 — Column-width mechanics (CSS spec)

**Finding:** The specific combination `table-layout: fixed` + `width: 100%` + narrow container is a known failure mode per the CSS 2.1 specification. Fixed layout divides the table width equally (or per `<colgroup>`) across columns, ignoring cell `min-width`; content that exceeds the column width wraps within the column, inflating row heights. `table-layout: auto` + `overflow-x: auto` on a wrapper is the correct combination for letting wide tables scroll.

**Evidence:** [evidence/d7-column-width-mechanics.md](evidence/d7-column-width-mechanics.md)

**Mechanics matrix:**

| `table-layout` | Table `width` | overflow-x location | Outcome when content exceeds natural column widths |
|---|---|---|---|
| `fixed` | `100%` | (any) | Content wraps within fixed-width columns → rows get tall (**the pathological combination**) |
| `fixed` | `auto`/unset | wrapper | `<colgroup>` governs; table can exceed container; wrapper scrolls |
| `auto` | `100%` | wrapper | Table tries to fit; if content demands more, table exceeds it; wrapper scrolls |
| `auto` | `max-content` | wrapper | Table sized to widest content; wrapper scrolls (BlockSuite, BlockNote) |
| (`display: block`) | `100%` | on table itself | Block element scrolls; `table-layout` is meaningless |

**Decision triggers:**
- Columns under author control (`<colgroup>` + resize handles): use `table-layout: fixed` + `width: auto` + Wrapper-scroll. Avoid `width: 100%`.
- No author control, simplest CSS: `display: block` + `overflow: auto` on the table itself (Docusaurus path).
- Content-driven columns, `min-width` needed: use `table-layout: auto` + Wrapper-scroll. `min-width` on cells is respected.

**`min-width: 80px` on cells is silently ignored under `table-layout: fixed`** — per the CSS 2.1 specification, fixed layout does not consult `min-width`. This is the specific mechanism behind the Open Knowledge production bug diagnosed in parallel.

---

### D8 — Responsive behavior

**Finding:** The surveyed ecosystem has effectively abandoned the "reflow cells into a vertical list at mobile widths" pattern that was popular in web design circa 2012–2018. Every product surveyed relies on horizontal scroll as the responsive degradation. Sticky headers (Outline, Logseq database tables) and hover-to-reveal scrollbars (Outline, BlockSuite) are the observed UX refinements atop the baseline scroll pattern.

**Evidence:** [evidence/d8-responsive-and-misc.md](evidence/d8-responsive-and-misc.md)

**Implications:** Horizontal scroll is the ecosystem's answer to narrow viewports. A downstream product considering cell-reflow responsive design would be a differentiator; no surveyed product ships this.

---

### D9 — Markdown-spec authoring hints

**Finding:** No surveyed product supports a markdown-level syntax for per-table full-width rendering. MDX-based products allow authors to escalate to JSX (`<Table>` custom component) to bypass the markdown pipeline; plain-markdown products treat all tables uniformly. Pandoc-extended markdown supports attribute blocks (`{.full-width}`) but this extension is not adopted by any of the surveyed editor products.

**Evidence:** [evidence/d8-responsive-and-misc.md](evidence/d8-responsive-and-misc.md)

**Implications:** A product that wanted per-table opt-in width control would need to introduce an extension — either a directive syntax (`remark-directive`-based), a Pandoc attribute block, or an MDX JSX wrapper. None is standard markdown. The default path for virtually every product is: "all tables, one width strategy."

---

### D10 — Horizontal scroll UX ergonomics

**Finding:** Two polished-UI products (Outline, BlockSuite) invest in styled scrollbars with hover reveal. Docs frameworks (Docusaurus, Fumadocs) and the prose plugin rely on browser-default scrollbars. **No surveyed product ships scroll-shadow indicators** (gradient fades at scroll-container edges) — a well-documented CSS pattern that's absent from the editor ecosystem. Touch scrolling and keyboard scrolling are browser defaults; only Dendron explicitly sets `-webkit-overflow-scrolling: touch`.

**Evidence:** [evidence/d8-responsive-and-misc.md](evidence/d8-responsive-and-misc.md)

**Implications:** Scroll-shadow indicators are a potential differentiation opportunity — no surveyed product ships them, but the technique (multi-layer backgrounds with `background-attachment: local`) is well-understood. A product adopting them would match modern data-grid UX (Notion, Linear).

---

## Cross-cutting summary

### Strategy adoption matrix

| Strategy family | Products shipping this as default |
|---|---|
| **A (Wrapper-scroll)** | TipTap demo, BlockNote, Milkdown, Plate (registry), Fumadocs, Logseq (markdown), Dendron (opt-in via `.table-responsive`) |
| **B (Block-scroll)** | Docusaurus (Infima) |
| **C (Grid-column-escape)** | **None observed in editor products** |
| **D (Negative-margin-bleed)** | Outline (in combination with A) |
| **E (Document-width-cap)** | HedgeDoc (view-only mode) |
| **F (Author-controlled)** | Tailwind Typography, Obsidian default, SilverBullet, Zettlr, Foam, Plate (plugin-only), TinaCMS |

### Design axes observed across all strategies

Two orthogonal axes describe almost every implementation:

1. **Where does scroll live?** — nowhere (F) / on table (B) / on wrapper (A, D) / on document (E) / on grid column (C, not observed)
2. **How is the table sized?** — `width: 100%` + `table-layout: fixed` (TipTap demo, pathological in narrow containers) / `width: 100%` + `table-layout: auto` (most Wrapper-scroll products) / `width: auto` or `max-content` (BlockNote, BlockSuite) / `w-fit` (Plate)

### Convergences

- Horizontal scroll as the universal responsive degradation — no surveyed product implements cell-reflow.
- `.tableWrapper` as the prevailing wrapper class name in ProseMirror-descended editors (prosemirror-tables convention).
- Tailwind Typography-inspired `max-width: 65ch` for the prose column is ecosystem-wide; the question is where tables opt out of it.
- `border-collapse` is near-universally set, but its value (`collapse` vs `separate`) varies by aesthetic.

### Divergences

- **TipTap demo vs BlockNote:** Same library root, opposite table-sizing policies (`width: 100%; table-layout: fixed` vs `width: auto !important`). Pick-one choice.
- **Docusaurus vs Fumadocs:** Same problem, opposite solutions (Block-scroll CSS-only vs Wrapper-scroll component). Both proven at docs-site scale.
- **Author-controlled as a strategy:** Tailwind Typography and Obsidian default both ship no overflow handling. Fumadocs extends Tailwind's pattern by adding a wrapper; Obsidian users fill the gap with community CSS snippets. Same non-decision produces different ecosystem equilibria.

---

## Limitations & Open Questions

### Dimensions with incomplete coverage

- **Mintlify:** INACCESSIBLE. Closed-source; public docs pages returned markdown source rather than rendered HTML via WebFetch. Resolving this requires either a browser-session DOM inspection or access to Mintlify's internal source.
- **Docmost:** UNRESOLVED. TipTap-based per third-party index; specific CSS not documented publicly. A direct clone + grep would resolve this.
- **Obsidian default:** INFERRED from community-snippet evidence rather than direct source CSS inspection. The app is proprietary; a direct DOM inspection in the desktop app would upgrade confidence.

### Not covered (per Rubric non-goals)

- Data-table features (sort, filter, sticky columns at mobile, virtual scroll)
- Server-side rendering and hydration differences
- Schema-level MDX component alternatives to markdown tables
- Print stylesheets
- ARIA/semantic accessibility of table overflow UI

### Open questions adjacent to this survey

- Why has Grid-column-escape (Family C) not penetrated the editor ecosystem despite being well-documented in typography blogs? Hypothesis: editors using ProseMirror or TipTap inherit a `.tableWrapper` convention from prosemirror-tables that happens to sit inside the content column, and no one has proposed rewiring the DOM. Worth investigating whether Lexical-based products (newer) or Automerge/Yjs-first products post-2025 have adopted grid-escape.
- How does `table-layout: fixed` interact with the `<colgroup>` resize pattern observed in Plate, BlockNote, and TipTap? The spec permits `<col>` widths in fixed layout; the observed implementations rely on this. Worth deeper study for any product implementing resizable columns.
- Is there a newer CSS-level mechanism (subgrid, container queries, `contain: size`) that unlocks cleaner grid-escape behavior? Browser support for subgrid landed 2023; worth probing whether products are adopting it.

---

## References

### Evidence files

- [evidence/d1-strategy-taxonomy.md](evidence/d1-strategy-taxonomy.md) — Six-family taxonomy with CSS patterns and HTML skeletons
- [evidence/d2-tier1-products.md](evidence/d2-tier1-products.md) — Obsidian, Outline, AFFiNE/BlockSuite, Docmost
- [evidence/d3-tier2-editors.md](evidence/d3-tier2-editors.md) — Logseq, Dendron, Foam, HedgeDoc, SilverBullet, Zettlr
- [evidence/d4-docs-as-code.md](evidence/d4-docs-as-code.md) — Docusaurus, Mintlify, Fumadocs
- [evidence/d5-editor-libraries.md](evidence/d5-editor-libraries.md) — TipTap, BlockNote, Milkdown, Plate, TinaCMS
- [evidence/d6-tailwind-typography.md](evidence/d6-tailwind-typography.md) — Tailwind Typography `prose` plugin
- [evidence/d7-column-width-mechanics.md](evidence/d7-column-width-mechanics.md) — CSS spec behavior
- [evidence/d8-responsive-and-misc.md](evidence/d8-responsive-and-misc.md) — Responsive, authoring hints, UX ergonomics

### External sources

- [Tailwind Typography plugin source](https://github.com/tailwindlabs/tailwindcss-typography) — `src/styles.js` was fetched directly for verbatim rules
- [Infima default.css via unpkg](https://unpkg.com/infima@0.2.0-alpha.45/dist/css/default/default.css) — Docusaurus's styling framework, direct CSS source
- [Docusaurus discussion #11308](https://github.com/facebook/docusaurus/discussions/11308) — community context on `display: block` trade-offs
- [HedgeDoc issue #5568](https://github.com/hedgedoc/hedgedoc/issues/5568) — user report of wide-table overflow in view-only mode
- [HedgeDoc issue #2828](https://github.com/hedgedoc/hedgedoc/issues/2828) — request to remove 758px max-width constraint
- [Obsidian CSS variables reference](https://docs.obsidian.md/Reference/CSS+variables/Editor/Table) — official table CSS variable docs
- [Obsidian table-width CSS snippets forum thread](https://forum.obsidian.md/t/table-width-css-snipptes/77550) — community-contributed CSS workarounds
- [W3C CSS 2.1 §17.5](https://www.w3.org/TR/CSS21/tables.html) — Table layout specification
- [MDN `table-layout`](https://developer.mozilla.org/en-US/docs/Web/CSS/table-layout) — developer reference

### Related research

- [reports/full-stack-pm-crdt-markdown-editor-ideal/](../full-stack-pm-crdt-markdown-editor-ideal/) — schema-level table discussion (adjacent, not overlapping)
- [reports/cms-custom-components-landscape/](../cms-custom-components-landscape/) — custom block components in CMS editors (MDX JSX alternative to markdown tables)
- [reports/markdown-roundtrip-fidelity-tiptap/](../markdown-roundtrip-fidelity-tiptap/) — table serialization, adjacent to rendering
