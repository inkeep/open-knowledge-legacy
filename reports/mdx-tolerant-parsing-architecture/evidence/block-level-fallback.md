# Evidence: Block-Level Fallback Feasibility

**Dimension:** Can we parse valid blocks while falling back on broken ones?
**Date:** 2026-04-13
**Sources:** Codebase analysis, ecosystem research

---

## Findings

### Finding: No production system implements block-level MDX fallback
**Confidence:** CONFIRMED
**Evidence:** Surveyed MDXEditor, BlockNote, Milkdown, Tiptap, Docusaurus, Astro, next-mdx-remote, TinaCMS. All use document-level or file-level strategies. micromark maintainer rejected partial mode ([issue #10](https://github.com/micromark/micromark-extension-mdx-jsx/issues/10)).

### Finding: Block-level fallback is architecturally feasible via split-then-rejoin
**Confidence:** INFERRED
**Evidence:** VFileMessage errors include position information (`place.offset`). A split-then-rejoin strategy could:
1. Try full parse
2. On failure, extract error position
3. Find the enclosing block boundary (blank line before/after the error)
4. Parse the document in two halves
5. Replace the failing block with a raw-source fallback node
6. Merge results

Challenges: recursive failures, position-to-block boundary mapping, O(n) re-parses worst case.

### Finding: Agnostic MDX mode makes block-level fallback much simpler
**Confidence:** INFERRED
**Evidence:** With agnostic mode eliminating all `{` crashes, only `<` crashes remain. Our guard handles most `<` cases. Block-level fallback becomes a rare safety net (~5% of cases) rather than the primary error handling strategy. Fewer re-parses, simpler split logic.

### Finding: Tina's `invalid_markdown` is document-level, NOT block-level
**Confidence:** CONFIRMED
**Evidence:** `reports/tinacms-production-architecture-beyond-mdx/evidence/d2-unknown-component-degradation.md` — entire document becomes one `invalid_markdown` node. Our Tina report explicitly flagged this as their "sharpest edge" and noted OK's block-level scoping as a differentiator.
