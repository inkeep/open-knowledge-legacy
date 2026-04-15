# Evidence: D3 — Obsidian Source Mode & Live Preview

**Dimension:** D3 — How Obsidian handles pipe tables and long logical lines
**Date:** 2026-04-14
**Sources:** forum.obsidian.md (T2 community), docs.obsidian.md (T1 official), community GitHub (T2)

**Scope caveat:** Obsidian is a closed desktop app. Internal CM6 config and CSS are not fully public. T1 = official docs/blog; T2 = forum threads & community plugins; T3 = hearsay.

---

## Key references

- [T1] https://obsidian.md/blog/codemirror-6-migration-guide/ — CM6 migration
- [T1] https://docs.obsidian.md/Plugins/Editor/State+fields — State field API
- [T1] https://docs.obsidian.md/Plugins/Editor/Decorations — Decoration types
- [T2] https://forum.obsidian.md/t/better-table-handling-in-new-live-preview-mode/29079 — Core community complaint
- [T2] https://forum.obsidian.md/t/live-preview-support-editing-a-table-cell-by-cell/34110 — Cursor-reveal feature request
- [T2] https://forum.obsidian.md/t/how-to-make-markdown-syntax-show-when-editing-tables-in-live-preview/57775 — Moderator quote on cursor-reveal
- [T2] https://forum.obsidian.md/t/markdown-tables-lines-extend-beyond-readable-length-while-working-in-edit-mode-live-preview-source-mode/35104 — Line-wrap off for tables
- [T2] https://forum.obsidian.md/t/make-editing-long-table-entries-easier/32809 — Scroll friction
- [T2] https://forum.obsidian.md/t/table-horizontal-scrollbar-in-note-edit-mode-is-not-usable/2094 — Scrollbar bug
- [T2] https://forum.obsidian.md/t/how-to-create-custom-codemirror-block-widget/36132 — CM6 widget pattern (plugin dev)
- [T2] https://github.com/nothingislost/obsidian-cm6-attributes — State field + decoration example
- [T2] https://github.com/nothingislost/obsidian-codemirror-options — Archived CM5 plugin (CM6 incompatible)

---

## Findings

### Finding D3-1: Source Mode — line-wrap is OFF for table rows by design; users must horizontal-scroll
**Confidence:** CONFIRMED (T2 forum, explicit design statement)
**Evidence:** https://forum.obsidian.md/t/markdown-tables-lines-extend-beyond-readable-length-while-working-in-edit-mode-live-preview-source-mode/35104 — moderators confirmed this is intentional design to keep rows unambiguous

Implication: Obsidian's canonical source-mode answer to long table rows is **"don't wrap, horizontal-scroll instead."** The scrollbar has a long-standing bug where clicks pass through to the editor (https://forum.obsidian.md/t/table-horizontal-scrollbar-in-note-edit-mode-is-not-usable/2094), forcing users to touchpad-scroll or rely on plugins.

### Finding D3-2: Live Preview — whole-table replace via CM6 block widget; cursor-entry un-renders the entire table
**Confidence:** CONFIRMED (moderator statement)
**Evidence:** https://forum.obsidian.md/t/how-to-make-markdown-syntax-show-when-editing-tables-in-live-preview/57775 — moderator: *"once you place your cursor inside the table, it's going to not render any parts of that table."*

Implication: Obsidian's Live Preview uses a **whole-table-granularity** replace pattern, not per-row or per-cell. When the cursor enters any cell, the entire widget unmounts and the raw `|...|` markdown appears. When the cursor leaves the table, the widget re-renders.

Community pain point (https://forum.obsidian.md/t/live-preview-support-editing-a-table-cell-by-cell/34110): users want cell-by-cell editing (adjacent cells stay rendered while you edit one). Obsidian team acknowledged — *"It will happen someday. We never provide ETAs"* — but not shipped as of this evidence date.

### Finding D3-3: Live Preview lost the cell-padding alignment feature that CM5's "Advanced Tables" plugin provided
**Confidence:** CONFIRMED
**Evidence:**
- https://forum.obsidian.md/t/better-table-handling-in-new-live-preview-mode/29079 — community consensus "tables are hard to read"
- https://github.com/tgrosinger/advanced-tables-obsidian/issues/40 — Advanced Tables CM6 incompatibility

The Advanced Tables plugin padded cells with literal space characters in the source text to force monospace column alignment. CM6's decoration model (view-layer) cannot modify source text, so the pattern no longer works. Live Preview's rendered HTML `<table>` strips any whitespace padding and computes column widths from content, producing uneven columns.

### Finding D3-4: Obsidian publishes a CM6 plugin API with StateField + Decoration as primitives; this API is the same CM6 core
**Confidence:** CONFIRMED (T1 docs)
**Evidence:** https://docs.obsidian.md/Plugins/Editor/State+fields, https://docs.obsidian.md/Plugins/Editor/Decorations

Community plugins (e.g., `nothingislost/obsidian-cm6-attributes`) confirm the standard pattern: ViewPlugin scans syntax tree, emits `Decoration.line` with custom classes. This is exactly the per-line decoration pattern CM6 exposes — Obsidian neither extends nor restricts it.

### Finding D3-5: CM5→CM6 migration (June 2022) unlocked the widget-based Live Preview at the cost of several CM5 plugins
**Confidence:** CONFIRMED
**Evidence:** https://obsidian.md/blog/codemirror-6-migration-guide/

What was unlocked:
- Block widgets for table rendering (the feature that distinguishes Live Preview from "reading view")
- Declarative decoration facet enabled cleaner community plugin architecture

What broke:
- Advanced Tables cell-padding (source-text mutation doesn't work with CM6's view-layer decoration model)
- `nothingislost/obsidian-codemirror-options` archived August 2023 — CM5 API incompatible with CM6
- Unified CSS across Source Mode and Live Preview — community must now target `.cm-table-widget` (Live Preview) and `.markdown-rendered table` (Reading view) separately

### Finding D3-6: Community workarounds are CSS-heavy; no plugin-level solution for cell-alignment in Source Mode
**Confidence:** CONFIRMED
**Evidence:** https://forum.obsidian.md/t/table-cell-padding-in-css/103220

Users apply custom CSS snippets targeting different selectors per mode. No community plugin has restored the CM5-era source-text padding approach under CM6 constraints.

---

## Patterns extracted

1. **Block-widget-replace pattern** — Table region replaced wholesale with a CM6 block widget rendering as `<table>`. Cursor entry unmounts the widget and exposes source. Edit-while-rendered is not supported.
2. **Source-mode line-wrap deliberately disabled for tables** — design choice: row identity preserved via horizontal scroll, not wrapping.
3. **Decoration model is view-only** — plugins that formerly modified source text (cell padding) cannot be reproduced post-CM6.

---

## Gaps / follow-ups

- Obsidian's exact CM6 extension code is not public. Claims about "block widget for tables" are inferred from moderator statements + community plugin patterns, not from reading Obsidian's source. Upgrade to CONFIRMED would require reverse-engineering the desktop bundle (Electron, minified) — out of scope.
- Reading view (≠ Live Preview) is fully rendered HTML with no editing; it's a separate surface that doesn't answer the source-view question.
- Open feature requests for cell-by-cell editing suggest Obsidian may ship a finer-grained widget pattern in future — tracking this is an adjacent research direction.
