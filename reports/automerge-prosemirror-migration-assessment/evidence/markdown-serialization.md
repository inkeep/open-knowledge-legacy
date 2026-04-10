# Evidence: Markdown Serialization Path

**Dimension:** D6 — Markdown serialization on Automerge
**Date:** 2026-04-07
**Sources:** Architecture analysis

---

## Findings

### Finding: The serialization path can use the same PM JSON → markdown pipeline regardless of CRDT backend
**Confidence:** CONFIRMED
**Evidence:** Architecture analysis of the pipeline

Current pipeline: `Y.Doc → Y.XmlFragment → ProseMirror JSON → @tiptap/markdown → markdown`

Automerge pipeline would be: `Automerge doc → A.spans() → pmDocFromSpans() → ProseMirror JSON → @tiptap/markdown → markdown`

The key insight: both pipelines produce a ProseMirror document (Node). Once you have the PM Node, the downstream serialization to markdown is identical. `@tiptap/markdown` (or any PM-to-markdown serializer) operates on the ProseMirror document structure, which is CRDT-backend-agnostic.

### Finding: The PM schema DOES change — nodes need Automerge annotations
**Confidence:** CONFIRMED
**Evidence:** src/schema.ts SchemaAdapter requirements

The PM schema for Automerge includes `isAmgBlock`, `unknownAttrs`, and `unknownBlock` attributes on every non-text node. These are internal to automerge-prosemirror and would NOT affect markdown serialization (serializers look at node type and content, not internal tracking attributes). But the schema specs need the `automerge.block` and `automerge.markName` annotations.

### Finding: Direct Automerge-to-markdown is also possible (bypassing PM)
**Confidence:** INFERRED
**Evidence:** Automerge's flat text + spans model

Since Automerge stores text as flat characters with block markers and inline marks, a direct serializer could:
1. Iterate spans
2. For each block marker, emit the corresponding markdown prefix (e.g., `# ` for heading)
3. For each text span with marks, emit markdown formatting (e.g., `**bold**`)

This would be simpler than going through PM (no tree reconstruction needed). Estimated ~300-500 lines for a basic Automerge-to-markdown serializer. This could replace the PM-mediated pipeline for the persistence layer.

---

## Gaps / follow-ups

- A direct Automerge-to-markdown serializer would need to handle all block types including nested lists
- Custom void nodes (jsxComponent) would need custom serialization rules in either approach
