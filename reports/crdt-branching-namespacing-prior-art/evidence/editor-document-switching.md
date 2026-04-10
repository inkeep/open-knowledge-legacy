# Evidence: Editor Document Switching Mechanics (y-prosemirror, TipTap)

**Dimension:** How editors switch between CRDT-backed documents
**Date:** 2026-04-02
**Sources:** y-prosemirror GitHub, TipTap docs, Liveblocks docs, Yjs community

---

## Key files / pages referenced

- https://github.com/yjs/y-prosemirror -- y-prosemirror binding
- https://discuss.yjs.dev/t/y-prosemirror-usage/1357 -- Usage patterns
- https://discuss.yjs.dev/t/restoring-tiptap-previous-state/3677 -- State restoration
- https://tiptap.dev/docs/editor/api/editor -- TipTap Editor class
- https://liveblocks.io/docs/guides/yjs-best-practices-and-tips -- Liveblocks Yjs practices
- https://github.com/ueberdosis/tiptap/issues/2551 -- React unmount issues

---

## Findings

### Finding: y-prosemirror has no document-switching API -- switching requires destroy + recreate
**Confidence:** CONFIRMED
**Evidence:** y-prosemirror source, community discussions

y-prosemirror binds to a Y.Doc at construction time via `ySyncPlugin`:

```javascript
import { ySyncPlugin, yCursorPlugin, yUndoPlugin } from 'y-prosemirror';

const plugins = [
  ySyncPlugin(yXmlFragment),    // Bound to specific Y.Doc fragment
  yCursorPlugin(awareness),
  yUndoPlugin(),
];
```

The `ySyncPlugin` takes a `Y.XmlFragment` (from a specific Y.Doc) and cannot be rebound to a different fragment. To switch documents, you must:

1. Destroy the current editor (or its plugins)
2. Create new plugins bound to the new Y.Doc's fragment
3. Recreate the editor with the new plugins

There is no `ySyncPlugin.switchDocument(newFragment)` API.

### Finding: TipTap supports unmount/remount without full destruction
**Confidence:** CONFIRMED
**Evidence:** TipTap docs, GitHub issues

TipTap v2+ provides:
- `editor.destroy()` -- full destruction (unmount + remove listeners)
- `editor.setEditable(false)` -- soft disable
- Newer `editor.unmount()` API that preserves options between instances

For document switching in React:

```typescript
// Pattern: key-based remount
function EditorWrapper({ documentId, branch }) {
  // Changing key forces React to unmount and remount
  return <Editor key={`${documentId}-${branch}`} documentId={documentId} branch={branch} />;
}

// Inside Editor component:
useEffect(() => {
  const ydoc = new Y.Doc();
  const provider = new HocuspocusProvider({
    url: WS_URL,
    name: `${documentId}.${branch}`,  // Branch-namespaced
    document: ydoc,
  });

  const editor = new Editor({
    extensions: [
      StarterKit.configure({ history: false }),
      Collaboration.configure({ document: ydoc }),
      CollaborationCursor.configure({ provider }),
    ],
  });

  return () => {
    editor.destroy();
    provider.destroy();
    ydoc.destroy();
  };
}, [documentId, branch]);
```

### Finding: Liveblocks recommends getYjsProviderForRoom to handle room switching safely
**Confidence:** CONFIRMED
**Evidence:** Liveblocks docs, Yjs best practices guide

Liveblocks discovered that dynamic room switching is error-prone:

> "Liveblocks generally recommends getting your Liveblocks Yjs provider with getYjsProviderForRoom as it overcomes problems caused when dynamically switching between rooms."
> "It's no longer recommended to use LiveblocksYjsProvider directly, as issues may happen when dynamically switching between rooms."

This confirms that room/document switching in Yjs-backed editors is a known challenge that requires careful lifecycle management.

### Finding: Known bug -- switching documents can show stale content from previous document
**Confidence:** CONFIRMED
**Evidence:** discuss.yjs.dev/t/y-prosemirror-usage/1357

A user reported that when switching between YMap entries (each containing a ProseMirror JSON document), the editor "may render content from the previous YMap item that has content" instead of the new empty document.

The root cause: y-prosemirror takes over the ProseMirror editor's content after binding. The initial content set during editor creation is ignored to ensure convergence with other clients. This means the editor state is driven entirely by the Y.Doc -- if the new Y.Doc is empty, ProseMirror may briefly show stale content.

### Finding: setContent() with active collaboration causes transaction mismatch errors
**Confidence:** CONFIRMED
**Evidence:** discuss.yjs.dev/t/restoring-tiptap-previous-state/3677

Attempting to restore a previous state via `editor.commands.setContent(state)` when y-prosemirror is active produces: `RangeError: Applying a mismatched transaction`.

The Y.Doc and ProseMirror's internal state become desynchronized because setContent bypasses the CRDT layer. Content changes MUST go through the Y.Doc (not ProseMirror) when collaboration is active.

---

## Negative searches

- Searched y-prosemirror issues for "switch document", "swap document", "change document" -> no API exists
- Searched TipTap docs for "switch collaboration document" -> only general collaboration setup

---

## Gaps / follow-ups

- Performance of destroy + recreate pattern (how fast is it? any visible flash?)
- Can plugins be hot-swapped without full editor destruction?
- Does the y-prosemirror rewrite address document switching?
