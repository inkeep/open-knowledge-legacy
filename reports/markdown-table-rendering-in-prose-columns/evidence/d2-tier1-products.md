# Evidence: D2 — Tier 1 prose-column-strict editor products (Obsidian, Outline, AFFiNE/BlockSuite, Docmost)

**Dimension:** How end-user editor products render markdown tables inside prose-constrained layouts
**Date:** 2026-04-14
**Sources:** OSS local clones (`outline`, `blocksuite`), web research (Obsidian community, Docmost)

---

## Key files / pages referenced

- `outline/shared/editor/components/Styles.ts` — Outline's editor styled-components CSS
- `blocksuite/packages/affine/blocks/table/src/table-block-css.ts` — BlockSuite table block CSS (emotion-css)
- `blocksuite/packages/affine/blocks/table/src/table-cell-css.ts` — BlockSuite cell CSS
- Obsidian CSS variables reference: https://docs.obsidian.md/Reference/CSS+variables/Editor/Table (T1)
- Obsidian forum on table-width snippets: https://forum.obsidian.md/t/table-width-css-snipptes/77550 (T3)
- Docmost architecture: https://deepwiki.com/docmost/docmost (T2 — third-party wiki)

---

## Findings

### Finding: Outline uses `border-collapse: separate; width: 100%` with a negative-margin `.tableScrollable` wrapper that bleeds the table outside the prose column
**Confidence:** CONFIRMED
**Evidence:** `outline/shared/editor/components/Styles.ts:1922-1930` and `:2347-2365`

```css
table {
  width: 100%;
  border-collapse: separate;
  margin-top: 1em;
  box-sizing: border-box;
  border: 1px solid ...;
  border-left: 0;
  border-spacing: 0;
}

.tableScrollable {
  position: relative;
  margin: -1em ${-padding}px -0.5em;
  overflow-y: hidden;
  overflow-x: auto;
  scrollbar-width: thin;
}
```

Cells: `vertical-align: top; padding: 4px 8px; text-align: start; min-width: 100px` (Styles.ts:1942-1952). Sticky header support via `.tableStickyHeader` class toggle.

**Implications:** Outline is the only Tier 1 product observed that **combines wrapper-scroll with negative-margin bleed**. The `margin: -1em ${-padding}px -0.5em` pushes the wrapper outside the prose column's horizontal padding, giving the table more room before horizontal scroll kicks in. This is the negative-margin-bleed family.

---

### Finding: AFFiNE/BlockSuite's table block is block-based (not markdown `<table>`), and uses `width: max-content` inside an `overflow-x: auto` container
**Confidence:** CONFIRMED (with scope caveat)
**Evidence:** `blocksuite/packages/affine/blocks/table/src/table-block-css.ts:3-27, 29-36`

```typescript
export const tableContainer = css({
  display: 'block',
  overflowX: 'auto',
  overflowY: 'visible',
});
export const tableWrapper = css({
  display: 'flex',
  width: 'max-content',
  position: 'relative',
});
```

Cell container: `position: relative; vertical-align: top; border: 1px solid; border-collapse: collapse` (`table-cell-css.ts:4-13`). Resize handles: `columnRightIndicatorStyle` with `cursor: ew-resize` (line 117-124).

**Scope caveat:** BlockSuite's table is a **native block**, rendered as nested `<div>`s not `<table>`. It is the product's data-grid primitive, not a markdown renderer. AFFiNE's markdown import/export path converts markdown tables to this block (lossy per AFFiNE docs). For this report's question — markdown-sourced `<table>` rendering — BlockSuite's evidence is **structurally relevant but not directly comparable**.

**Implications:** The `width: max-content` pattern means the table is as wide as its content needs. Combined with `overflow-x: auto` on the container, wide tables become horizontally scrollable inside the container. Unlike `width: 100%`, this avoids catastrophic wrapping when the container is narrow.

---

### Finding: Obsidian's default table CSS does not ship overflow handling; wide tables visually bleed past the note width or overflow the pane
**Confidence:** INFERRED from community evidence (multiple community snippets exist specifically to add overflow handling)
**Evidence:**
- Obsidian docs list table-related CSS variables (borders, colors, padding) at https://docs.obsidian.md/Reference/CSS+variables/Editor/Table but do not document a default overflow behavior
- Community forum thread "Table width css snipptes" https://forum.obsidian.md/t/table-width-css-snipptes/77550 documents multiple user-contributed CSS snippets adding `.wideTable` classes or `overflow-x: auto` wrappers. The existence of widespread community demand for these snippets is evidence that the default does not provide them.

**Scope caveat:** Obsidian is proprietary. Confidence is INFERRED from negative-space evidence (community snippets solving the problem imply the default does not) rather than direct CSS inspection.

**Implications:** Obsidian's default strategy appears to be **"no strategy"** — wide tables render as-is and users compensate via community CSS snippets. This falls into the Author-controlled family.

---

### Finding: Docmost uses TipTap (inferred from its ProseMirror/TipTap dependency); specific CSS not in public-facing documentation
**Confidence:** UNCERTAIN
**Evidence:**
- DeepWiki (third-party Docmost index): https://deepwiki.com/docmost/docmost/3.1-editor-core-and-extensions documents Docmost's editor as Tiptap/ProseMirror-based
- No CSS file was located in public documentation or surface search of the Docmost GitHub repo for table-specific rules

**Implications:** Docmost inherits whatever it copies from TipTap's demo or authors itself. Without direct CSS inspection, we cannot confirm the specific strategy. Classify as UNRESOLVED — inferred to be in the TipTap-reference family by virtue of dependency lineage.

---

## Cross-product summary

| Product | Family (per D1 taxonomy) | Wrapper | `table-layout` | Table width | Notes |
|---|---|---|---|---|---|
| **Outline** | Wrapper-scroll + Negative-margin bleed | `.tableScrollable` | (not set → auto via `border-collapse: separate`) | `100%` | Only Tier 1 to use bleed |
| **AFFiNE/BlockSuite** | Wrapper-scroll, `max-content` | `tableContainer` + `tableWrapper` | N/A (not `<table>`) | `max-content` | Native block, not markdown |
| **Obsidian** | Author-controlled (no default) | — | (browser default) | (unspecified) | Community snippets exist to add wrapper-scroll |
| **Docmost** | UNRESOLVED | — | — | — | Uses TipTap; specific rules not documented publicly |

---

## Gaps / follow-ups

- Docmost's table CSS is unverified. To confirm: clone the Docmost repo and grep the client package for `table-layout`, `.tableWrapper`, or inline styles on the ProseMirror table node.
- Obsidian's behavior is inferred from community snippets — a direct inspection of a live Obsidian note's DOM (via the desktop app's inspector) would upgrade this to CONFIRMED.
- BlockSuite's markdown-import path: how does a markdown `| a | b |` get rendered in AFFiNE? If it gets converted to the native table block, the CSS above applies. If it falls through to a raw `<table>`, different CSS may govern it.
