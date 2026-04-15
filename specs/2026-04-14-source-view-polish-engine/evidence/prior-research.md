---
sources:
  - reports/codemirror-markdown-source-view-rendering/
  - reports/markdown-source-view-constructs/
  - reports/markdown-table-rendering-in-prose-columns/
---

# Prior research pointers

This spec builds on three reports authored in the same session. They are comprehensive and authoritative for this surface; this file is a redirect, not a restatement.

## Reports

### `reports/codemirror-markdown-source-view-rendering/REPORT.md`
- CM6 primitive inventory (D1): `Decoration.line`, `Decoration.mark`, `Decoration.replace`, `Decoration.widget`, `WidgetType`, `atomicRanges`, `syntaxTree()`, `@lezer/markdown` node types, `Compartment`, `ViewPlugin` vs `StateField`, `MatchDecorator`
- Authoritative guidance (D2): Marijn's rule — block-level decorations must come from StateField, inline from ViewPlugin. No virtualization of soft-wrapped lines. No per-line wrap toggle in core.
- Obsidian Source Mode + Live Preview (D3) — whole-table widget replacement, cursor-reveal pattern, known nested bugs
- codemirror-rich-markdoc deep dive (D4) — ~200 LOC reference implementation, source verified at `/tmp/cm-rich-markdoc/src/`
- SilverBullet (D5) — multi-construct S3 with per-construct files
- S1/S2/S3 taxonomy — Open Knowledge's engine occupies S2 (text-canonical + construct polish), which no surveyed product commits to as default

### `reports/markdown-source-view-constructs/REPORT.md`
- Per-construct evidence (D1-D13) for 17 non-MDX constructs
- Competitor matrix (D12) across 10+ products
- Per-construct primitive stack (D13) — maps each construct to CM6 primitive family + cursor-reveal stance + atomic-range stance
- **Ten unclaimed ecosystem lanes** identified; engine adopts 8 of 10

### `reports/markdown-table-rendering-in-prose-columns/REPORT.md`
- WYSIWYG/rendered-table CSS strategies
- Six strategy families (Wrapper-scroll, Block-scroll, Grid-column-escape, Negative-margin-bleed, Document-width-cap, Author-controlled)
- Cross-reference only; source-view rendering is the other side of the editor

## Key prior decisions already made (not to re-litigate)

- Tables: Tier 1 (row tint + left accent bar + top border + hanging indent) + Tier 2 (per-cell alternating color bands at ≤4% opacity) + Tier 3 (font-size 0.9em, line-height 1.4)
- No horizontal scroll anywhere
- Source always visible (no `Decoration.replace({ block: true })` that hides source)
- Per-construct verdicts (KEEP/TUNE/REVISE/DROP) — documented in `/analyze` output and folded into this spec's Decisions section
