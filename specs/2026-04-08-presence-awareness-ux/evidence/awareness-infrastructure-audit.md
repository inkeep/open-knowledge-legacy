---
title: Awareness Infrastructure Audit
type: technical-trace
sources:
  - init_spike/src/editor/TiptapEditor.tsx
  - init_spike/src/editor/SourceEditor.tsx
  - init_spike/src/server/hocuspocus-plugin.ts
  - init_spike/src/editor/observers.ts
  - node_modules/@hocuspocus/server/src/DirectConnection.ts
  - node_modules/@hocuspocus/server/src/Document.ts
  - node_modules/@tiptap/y-tiptap/dist/y-tiptap.js
  - node_modules/y-codemirror.next/src/y-sync.js
  - node_modules/yjs/src/utils/UndoManager.js
---

# Awareness Infrastructure Audit

## What's wired

- HocuspocusProvider creates awareness automatically (`provider.awareness`)
- CodeMirror's yCollab receives `provider.awareness` — remote cursors render if state exists
- @tiptap/extension-collaboration-cursor installed but NOT imported
- UndoManager with trackedOrigins isolates per-origin undo
- Transaction origins mapped: 'sync-from-tree', 'sync-from-text', 'agent-write' (to be added), 'file-watcher', 'user-edit'

## What's NOT wired

- CollaborationCursor NOT imported or configured in TiptapEditor
- `awareness.setLocalState()` never called — no client publishes identity
- DirectConnection does NOT set awareness state (agent writes invisible)
- No UI for presence: no sidebar, no user list, no activity indicator
- No Y.Map('activity') side-channel exists

## DirectConnection awareness (verified from source)

- `DirectConnection.document` is public → `document.awareness` is Awareness instance
- `document.awareness.setLocalState(state)` broadcasts to all WebSocket clients
- Uses Y.Doc's auto-generated clientID (separate from browser clients)
- Auto-renews every 15s (awareness protocol internal timer)
- Server-side Document constructor nulls its own state: `this.awareness.setLocalState(null)`
- handleAwarenessUpdate (Document.ts:192-216) iterates all connections and sends update

## Origin propagation (verified from source)

### y-tiptap (_typeChanged, line 690):
```
tr = tr.setMeta(ySyncPluginKey, { isChangeOrigin: true, isUndoRedoOperation: boolean })
```
Custom origin string DISCARDED. Only boolean flags survive.

### y-codemirror.next (y-sync.js, line 250):
```
view.dispatch({ changes, annotations: [ySyncAnnotation.of(this.conf)] })
```
ySyncAnnotation carries YSyncConfig ref, NOT Yjs transaction origin.

### Implication: Editor layer cannot distinguish agent writes from human-in-other-mode writes.

## UndoManager per-origin (verified from source)

- `trackedOrigins: new Set(['agent-write'])` → undo() only reverses matching origins
- Non-matching origins silently skipped (changes persist, just not on stack)
- Multiple UndoManagers on same Y.Type: independently filter, independent stacks, no conflict
- Yjs test `testUndoUntilChangePerformed` explicitly tests two UndoManagers on overlapping types
- Observer sync origins ('sync-from-tree', 'sync-from-text') won't match any UndoManager → correctly invisible

## Agent UndoManager interaction with Observer B

When agent-only UndoManager undoes a Y.Text change:
- Undo transaction origin = the UndoManager instance itself
- Observer B guard: `if (transaction.origin === ORIGIN_TREE_TO_TEXT) return` — UndoManager instance ≠ 'sync-from-tree'
- Therefore Observer B FIRES on undo → propagates text undo to XmlFragment (correct behavior)
