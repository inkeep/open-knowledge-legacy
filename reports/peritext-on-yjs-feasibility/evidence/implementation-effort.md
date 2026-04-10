# Evidence: Implementation Effort Estimate

**Dimension:** D7 — Implementation effort estimate
**Date:** 2026-04-07
**Sources:** y-prosemirror v14 source analysis, automerge-prosemirror source analysis, y-quill source analysis

---

## Key references

- y-prosemirror total: 1,356 lines (sync-utils 505, sync-plugin 310, cursor 275, commands 66, positions 170)
- automerge-prosemirror total: 3,272 lines (traversal 1,016, maintainSpans 547, schema 313, amToPm 334, pmToAm 304, syncPlugin 147)
- y-quill total: 363 lines

---

## Findings

### Finding: Three distinct architectures for the binding, with different effort levels
**Confidence:** INFERRED
**Evidence:** Source analysis of all three reference implementations

**Architecture A: Peritext-Style Flat Text + Block Markers (Automerge model)**

This is the full Peritext vision: single flat Y.Text with formatting marks and block markers. ProseMirror tree is reconstructed from spans.

Components needed:
1. **Span-to-PM-tree translator** (~800-1,200 lines) — equivalent to automerge-prosemirror's traversal.ts (1,016 lines). Converts flat text + marks + block markers into ProseMirror's nested Node tree.
2. **PM-tree-to-span translator** (~400-600 lines) — equivalent to pmToAm.ts. Converts ProseMirror transactions back to flat operations.
3. **Block marker convention** (~100-200 lines) — schema defining block types, parent arrays, embed markers.
4. **Sync plugin** (~150-300 lines) — ProseMirror plugin for bidirectional sync, similar to current y-prosemirror sync-plugin.
5. **Incremental span maintenance** (~300-500 lines) — equivalent to maintainSpans.ts. Avoids full re-traversal on every change.
6. **Cursor/selection mapping** (~100-200 lines) — map between flat Y.Text positions and ProseMirror tree positions.
7. **Schema adapter** (~200-300 lines) — map ProseMirror node types to block marker types and mark types to formatting attributes.

**Total estimate: 2,000-3,300 lines. 6-10 weeks for a senior engineer. This is a rewrite, not a modification of y-prosemirror.**

**Architecture B: Hybrid — Y.Text for inline, retain y-prosemirror delta protocol for blocks**

Use Yjs 14's unified YType with the recursive delta format that y-prosemirror already understands. Block structure is stored as named child YTypes (same as current Y.XmlFragment behavior), but inline content uses Y.Text formatting.

Components needed:
1. **Delta format adapter** (~200-400 lines) — ensure the delta produced by the YType includes both named children (blocks) and formatted text (inline content).
2. **Modifications to y-prosemirror** (~100-300 lines) — handle the case where inline content comes as formatted text rather than XmlText children.
3. **Embed handling** (~100-200 lines) — map ContentEmbed/ContentType to ProseMirror atom nodes.

**Total estimate: 400-900 lines of modifications. 2-4 weeks. This is a modification, not a rewrite.**

**Architecture C: Current y-prosemirror v14 as-is (pragmatic path)**

Yjs 14's unified YType and delta protocol may already support the dual-view pattern without ANY Peritext-specific changes:
1. The WYSIWYG view uses y-prosemirror v14 normally (recursive delta with named children)
2. The source view reads the same YType's delta as a flat representation and renders it in CodeMirror
3. Both views operate on the same YType through the same delta protocol

Components needed:
1. **Delta-to-markdown serializer** (~200-400 lines) — convert the YType's recursive delta to markdown text
2. **Markdown-to-delta parser** (~200-400 lines) — convert edited markdown back to the recursive delta format
3. **CodeMirror adapter** (~100-200 lines) — bridge between CodeMirror and the markdown text

**Total estimate: 500-1,000 lines. 2-4 weeks. This is the serialize-on-toggle approach enabled by the new delta protocol.**

### Finding: y-prosemirror v14 reuse is high for Architectures B and C
**Confidence:** INFERRED
**Evidence:** y-prosemirror source analysis

y-prosemirror v14's refactoring to the delta protocol means:
- sync-utils.js (505 lines) — fully reusable for Architecture B/C, partially reusable for A
- sync-plugin.js (310 lines) — fully reusable for B/C (it uses generic YType)
- cursor-plugin.js (275 lines) — fully reusable for all architectures
- commands.js (66 lines) — fully reusable (configureYProsemirror supports type switching)
- positions.js (170 lines) — partially reusable for A, fully reusable for B/C

### Finding: Intermediate milestones for Architecture A
**Confidence:** INFERRED

1. **M1: Inline formatting works** (weeks 1-3) — Bold, italic, code, links in flat Y.Text, rendered in ProseMirror. No block structure.
2. **M2: Block structure works** (weeks 3-6) — Paragraphs, headings, lists, blockquotes via block markers. Nesting via parents array.
3. **M3: Void nodes work** (weeks 6-7) — JSX components as embeds in Y.Text.
4. **M4: Tables work** (weeks 7-9) — Most complex block structure. Likely needs special handling.
5. **M5: Dual-view integration** (weeks 9-10) — CodeMirror source view reading same Y.Text.

---

## Gaps / follow-ups

* Architecture B's feasibility hinges on whether Yjs 14's recursive delta format can coexist with Y.Text-style formatting in the same YType. This needs empirical testing.
* Architecture C is essentially the serialize-on-toggle approach from the source-toggle-architecture report, but potentially cleaner due to the delta protocol.
