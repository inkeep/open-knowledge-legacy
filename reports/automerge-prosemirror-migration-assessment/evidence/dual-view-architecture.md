# Evidence: Dual-View Architecture on Automerge

**Dimension:** D4 — Dual-view architecture (ProseMirror + CodeMirror on same CRDT)
**Date:** 2026-04-07
**Sources:** https://github.com/automerge/automerge-codemirror, https://github.com/automerge/automerge-prosemirror

---

## Key files referenced

- automerge-codemirror `src/plugin.ts` (83 lines) — CM6 ViewPlugin binding
- automerge-codemirror `src/codeMirrorToAm.ts` (38 lines) — CM changes → A.splice
- automerge-codemirror `src/amToCodemirror.ts` (110 lines) — AM patches → CM ChangeSpec
- **Total automerge-codemirror: 242 lines**

---

## Findings

### Finding: automerge-codemirror exists as a first-party binding — 242 lines, v0.2.0, last updated July 2025
**Confidence:** CONFIRMED
**Evidence:** /tmp/automerge-codemirror/package.json, git log

Published as `@automerge/automerge-codemirror`. Requires `@automerge/automerge ^3.0.0`, `@codemirror/state ^6.0.0`, `@codemirror/view ^6.0.0`. Works via ViewPlugin pattern.

### Finding: automerge-codemirror binds to PLAIN TEXT (A.splice), not rich text spans
**Confidence:** CONFIRMED
**Evidence:** src/codeMirrorToAm.ts lines 19-35

```typescript
handle.change((doc: A.Doc<unknown>) => {
  transactionsWithChanges.forEach(tr => {
    tr.changes.iterChanges((fromA, toA, fromB, _toB, inserted) => {
      A.splice(doc, path.slice(), fromB, toA - fromA, inserted.toString())
    })
  })
})
```

The binding uses `A.splice()` to insert/delete plain text characters. It does NOT understand block markers, marks, or any rich text structure.

### Finding: The dual-view problem — ProseMirror sees structured spans, CodeMirror sees raw text
**Confidence:** CONFIRMED
**Evidence:** Source code analysis of both bindings

automerge-prosemirror uses `A.spans(doc, path)` to read rich text (text + marks + block markers). automerge-codemirror uses `A.splice()` on plain text. If both bind to the SAME path in the same Automerge document:

1. ProseMirror would insert block markers and marks (structured objects in the CRDT sequence)
2. CodeMirror would see those block markers as opaque objects — it would NOT render them as markdown

This means **raw simultaneous binding does NOT give you WYSIWYG + source mode**. CodeMirror would see the raw CRDT sequence including block marker objects, not markdown text.

### Finding: A CodeMirror markdown binding would need a translation layer
**Confidence:** INFERRED
**Evidence:** Architecture analysis

To achieve the dual-view (WYSIWYG + markdown source), you would need a binding that:
1. Reads Automerge spans (block markers + text + marks)
2. Converts to markdown text for CodeMirror display
3. On CodeMirror edits, parses markdown and converts back to Automerge operations

This is essentially the same bidirectional conversion problem that exists with Yjs (Options A/B from the source-toggle-architecture report). Automerge's flat model makes step 1 slightly easier (no tree traversal needed to get linear text), but step 3 (markdown → structured operations) remains the fundamental challenge.

### Finding: Both bindings use the same DocHandle — changes propagate via events
**Confidence:** CONFIRMED
**Evidence:** Both bindings listen on `handle.on("change", ...)` and call `handle.change()`

Both automerge-prosemirror and automerge-codemirror use the DocHandle change/event pattern. If they bind to the SAME Automerge path, changes from one would propagate to the other via the `change` event. But as noted above, the CodeMirror binding doesn't understand rich text structure.

### Finding: For separate text fields, dual binding works perfectly
**Confidence:** CONFIRMED
**Evidence:** Architecture analysis

If ProseMirror binds to `doc.content` (with rich text) and CodeMirror binds to `doc.rawMarkdown` (plain text), both can be live simultaneously on the same Automerge document. But this is the dual-key approach — you'd need a sync mechanism between the two fields, which is the same problem as Yjs Option B.

---

## Implications

The Peritext/flat-text advantage of Automerge for dual-view is real but more nuanced than it appears:

1. **Block markers are objects, not text.** The CRDT sequence contains `{ type: "heading", parents: [], attrs: { level: 1 } }` objects interspersed with text characters. This is NOT "flat text that CodeMirror can read."

2. **The translation layer is still needed.** You need to convert between the Automerge span representation and markdown. This conversion is unidirectional for display but bidirectional for editing.

3. **The advantage over Yjs is structural, not architectural.** The advantage is that the Automerge flat model is CLOSER to what a markdown-to-span parser would produce (inline marks as annotations, blocks as markers), making the translation layer simpler. But it's still a translation layer.

---

## Gaps / follow-ups

- No existing automerge-codemirror-markdown binding exists
- Building one would require ~500-800 lines (estimated) for markdown ↔ spans conversion
- The shimmer/round-trip problem from source-toggle-architecture report applies equally here
