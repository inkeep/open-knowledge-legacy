# Evidence: TipTap/Hocuspocus Blast Radius

**Dimension:** D5 — What breaks in TipTap/Hocuspocus
**Date:** 2026-04-07
**Sources:** @tiptap/extension-collaboration source, Hocuspocus architecture, y-prosemirror v14

---

## Key files referenced

- tiptap/packages/extension-collaboration/src/collaboration.ts
- y-prosemirror/src/sync-plugin.js — generic YType interface
- Hocuspocus documentation (tiptap.dev/docs/hocuspocus)

---

## Findings

### Finding: Hocuspocus is type-agnostic — it syncs Y.Doc, not specific types
**Confidence:** CONFIRMED
**Evidence:** Hocuspocus documentation, architecture analysis

Hocuspocus manages Y.Doc instances. It handles:
- WebSocket connection lifecycle
- Y.Doc persistence (to database, file, etc.)
- Authentication, authorization
- Awareness protocol

It does NOT inspect the internal Yjs types within the Y.Doc. Whether the doc contains Y.XmlFragment, Y.Text, Y.Map, or any combination is irrelevant to Hocuspocus. Changing from Y.XmlFragment to Y.Text would require zero changes to Hocuspocus.

**Implications:** The sync stack (Hocuspocus server, @hocuspocus/provider, y-websocket protocol) is completely unaffected.

### Finding: @tiptap/extension-collaboration imports XmlFragment but delegates to y-prosemirror
**Confidence:** CONFIRMED
**Evidence:** tiptap extension-collaboration source code

The collaboration extension:
1. Creates or receives a Y.XmlFragment from the Y.Doc
2. Passes it to y-prosemirror's ySyncPlugin
3. Optionally sets up yCursorPlugin and yUndoPlugin

The type-specific code is minimal — mainly `ydoc.get('prosemirror', Y.XmlFragment)` for type creation. If y-prosemirror accepted Y.Text, the extension would need only the type creation line changed.

### Finding: @hocuspocus/provider is transport-only — type-agnostic
**Confidence:** CONFIRMED
**Evidence:** @hocuspocus/provider source analysis

The provider manages WebSocket connections and Y.Doc sync. It does not inspect or depend on the types within the Y.Doc. No blast radius.

### Finding: yUndoPlugin uses Y.UndoManager which is type-agnostic
**Confidence:** INFERRED
**Evidence:** Yjs UndoManager documentation

Y.UndoManager accepts any Y.Type (it tracks operations on the type, not the type itself). Switching from Y.XmlFragment to Y.Text would not break undo/redo.

### Finding: yCursorPlugin uses Awareness protocol + relative positions
**Confidence:** CONFIRMED
**Evidence:** y-prosemirror/src/cursor-plugin.js, y-quill cursor handling

Cursor positions are stored as `Y.RelativePosition` (anchored to specific CRDT item IDs, not absolute positions). These work identically for Y.Text and Y.XmlFragment. The yCursorPlugin would need no changes.

---

## Summary: Blast radius assessment

| Component | Impact | Changes needed |
|-----------|--------|----------------|
| Hocuspocus server | None | None |
| @hocuspocus/provider | None | None |
| y-websocket/sync protocol | None | None |
| y-prosemirror sync plugin | Low | Already generic (delta protocol) |
| y-prosemirror cursor plugin | None | Uses RelativePosition (type-agnostic) |
| y-prosemirror undo | None | UndoManager is type-agnostic |
| @tiptap/extension-collaboration | Low | Change type creation line |
| @tiptap/y-tiptap | Low | Thin wrapper around y-prosemirror |
| ProseMirror schema | Medium | Needs block-from-flat reconstruction |
| Editor binding layer | High | Core of the new work |

**Total blast radius: Editor binding only.** The entire sync stack, server, provider, undo, and cursor systems are unaffected.

---

## Gaps / follow-ups

* Need to verify empirically that y-prosemirror v14's delta protocol works when the YType produces a flat delta (text + formatting) rather than a nested delta (XML tree). The code paths may have implicit assumptions about recursive children.
