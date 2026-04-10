# Evidence: Yjs Ecosystem Best Practices

**Dimension:** Best Practices Comparison
**Date:** 2026-04-09
**Sources:** BlockSuite blog, Tiptap docs, y-prosemirror GitHub issues, jsdiff GitHub issues, discuss.yjs.dev

---

## Finding: No Yjs editor uses dual CRDT structures
**Confidence:** CONFIRMED
**Evidence:** BlockSuite, Tiptap Collab, Outline, Milkdown all use single Y.XmlFragment as source of truth. None maintain a parallel Y.Text.
**Source:** https://blocksuite.io/blog/crdt-native-data-flow.html, https://tiptap.dev/docs/hocuspocus/guides/collaborative-editing

## Finding: updateYFragment is O(N) full-tree traversal, not incremental
**Confidence:** CONFIRMED
**Evidence:** y-prosemirror #113 documents full-document replacement on remote edits. "Updates the mapping pretty aggressively instead of trying to keep changes small."
**Source:** https://github.com/yjs/y-prosemirror/issues/113, https://discuss.yjs.dev/t/y-prosemirror-updateyfragment-algorithm-accuracy/1273

## Finding: jsdiff diffLines has catastrophic worst-case performance
**Confidence:** CONFIRMED
**Evidence:** jsdiff #239 benchmark: 133s for a pathological case where google/diff-match-patch took 6.8ms — 20,000x difference. Myers O(ND) worst case.
**Source:** https://github.com/kpdecker/jsdiff/issues/239

## Finding: No editor uses markdown-as-canonical for live CRDT collaboration
**Confidence:** CONFIRMED
**Evidence:** All production editors treat Y.XmlFragment as canonical. Markdown is export-only. CommonMark discussion confirms AST↔markdown round-trips are inherently lossy.
**Source:** https://talk.commonmark.org/t/can-ast-markdown-ast-round-trip-always-reproduce-the-original/3959

## Finding: No canonical debounce recommendation exists in Yjs ecosystem
**Confidence:** CONFIRMED
**Evidence:** y-prosemirror applies changes synchronously. Community uses 50-200ms for serialization. Application-specific.
**Source:** https://discuss.yjs.dev/t/y-prosemirror-usage/1357
