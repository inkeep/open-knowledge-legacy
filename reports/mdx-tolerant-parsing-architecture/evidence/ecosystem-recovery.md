# Evidence: Ecosystem Error Recovery

**Dimension:** How editors and frameworks handle MDX parse failures
**Date:** 2026-04-13
**Sources:** micromark issues, MDXEditor docs, Docusaurus docs, remark-mdx source

---

## Findings

### Finding: remark-mdx has zero error recovery — deliberately strict
**Confidence:** CONFIRMED
**Evidence:** [micromark-extension-mdx-jsx issue #10](https://github.com/micromark/micromark-extension-mdx-jsx/issues/10) — maintainer wooorm rejected partial mode: "I don't think speculative healing is a good idea for the parser." [mdx-js/mdx issue #2208](https://github.com/mdx-js/mdx/issues/2208) — lenient options rejected as "not planned."

### Finding: micromark's architecture prevents block-level fallback
**Confidence:** CONFIRMED
**Evidence:** micromark tokenizer throws synchronously via `crash()` in `factory-tag.js`. Once characters are consumed and the parser commits to a construct, there is no backtrack mechanism. mdast tree is all-or-nothing — no partial tree on failure.

### Finding: MDXEditor uses source-mode fallback as escape hatch
**Confidence:** CONFIRMED
**Evidence:** [MDXEditor docs](https://mdxeditor.dev/editor/docs/error-handling) — `onError` callback + diff-source plugin (v2.3.3+) automatically falls back to source editing on parse failure. No partial rendering.

### Finding: Tiptap silently loses content that doesn't match schema
**Confidence:** CONFIRMED
**Evidence:** [TipTap invalid schema docs](https://tiptap.dev/docs/guides/invalid-schema) — `enableContentCheck` strips unknown nodes/marks by default. "Content which does not conform to the schema is silently lost."

### Finding: No production system implements block-level MDX fallback
**Confidence:** CONFIRMED
**Evidence:** Surveyed MDXEditor, BlockNote, Milkdown, Tiptap, Docusaurus, Astro, next-mdx-remote. None parse individual blocks with MDX fallback. All use document-level or file-level strategies.
