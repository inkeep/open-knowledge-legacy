---
title: Yjs UndoManager API — capabilities and integration points
type: code-trace
sources:
  - node_modules/yjs/src/utils/UndoManager.js
  - node_modules/@tiptap/y-tiptap/dist/y-tiptap.js
  - node_modules/@tiptap/extension-collaboration/src/collaboration.ts
  - node_modules/y-codemirror.next/src/y-undomanager.js
  - node_modules/y-codemirror.next/src/index.js
date: 2026-04-10
---

# Yjs UndoManager API — capabilities and integration points

## Y.UndoManager constructor

```typescript
new Y.UndoManager(
  typeScope: Doc | AbstractType<any> | Array<AbstractType<any>>,
  {
    captureTimeout?: number,          // default 500ms — merge window
    captureTransaction?: (tr) => boolean,  // filter function
    deleteFilter?: (item) => boolean,      // item-level deletion filter
    trackedOrigins?: Set<any>,        // default Set([null]) — local only
    ignoreRemoteMapChanges?: boolean, // default false
    doc?: Doc                         // inferred from typeScope
  }
)
```

**Key capabilities:**
- `typeScope` accepts **an array of Y.Types** — can track Y.XmlFragment AND Y.Text simultaneously
- `addToScope(ytypes)` extends tracking scope after construction
- `addTrackedOrigin(origin)` / `removeTrackedOrigin(origin)` — dynamic origin management
- `stopCapturing()` — forces next change to create new StackItem (breaks grouping)
- Emits events: `stack-item-added`, `stack-item-popped`, `stack-cleared`, `stack-item-updated`
- StackItem has `meta: Map<any, any>` for storing selection state

**Origin checking logic (line 216):**
Captures a transaction if `transaction.origin` is in trackedOrigins OR `transaction.origin.constructor` is in trackedOrigins. Also auto-adds itself to trackedOrigins (line 181).

**captureTimeout behavior:**
If time between consecutive transactions < captureTimeout, they merge into the same StackItem. `stopCapturing()` resets this.

## TipTap collaboration extension (yUndoPlugin)

**Source:** `@tiptap/y-tiptap` yUndoPlugin

```typescript
yUndoPlugin({
  protectedNodes?: Set<string>,    // nodes to preserve on undo
  trackedOrigins?: any[],          // appended to [ySyncPluginKey]
  undoManager?: Y.UndoManager      // ← ACCEPTS EXTERNAL UNDOMANAGER
})
```

If no `undoManager` provided, creates one scoped to `ystate.type` (the Y.XmlFragment) with `trackedOrigins: new Set([ySyncPluginKey, ...trackedOrigins])`.

**Critical:** TipTap's collaboration extension explicitly rejects `@tiptap/extension-undo-redo`:
```typescript
if (extensionManager.extensions.find(ext => ext.name === 'undoRedo')) {
  console.warn('not compatible with collaboration extension')
}
```

The extension monkey-patches the yUndoPlugin view lifecycle to **suspend/resume** the UndoManager across editor recreations (React StrictMode).

Selection state is stored/restored via StackItem.meta.

## CodeMirror y-codemirror.next (yCollab)

```typescript
yCollab(ytext, awareness, {
  undoManager?: Y.UndoManager | false  // ← ACCEPTS EXTERNAL UNDOMANAGER or false to disable
})
```

If no undoManager provided, creates `new Y.UndoManager(ytext)`. If `false`, disables undo entirely.

Selection state stored/restored via StackItem.meta with relative positions.

## Key finding: shared UndoManager is architecturally supported

Both TipTap and CodeMirror accept an external UndoManager. A shared instance can track both Y.XmlFragment and Y.Text:

```typescript
const sharedUM = new Y.UndoManager(
  [yxmlFragment, ytext],
  { trackedOrigins: new Set([null, ySyncPluginKey]) }
)

// TipTap: yUndoPlugin({ undoManager: sharedUM })
// CodeMirror: yCollab(ytext, awareness, { undoManager: sharedUM })
```

**Caveat:** Observer A/B transactions (origin `sync-from-tree`/`sync-from-text`) must NOT be in trackedOrigins, or undo will capture the sync echo and create double entries.

## Multiple UndoManagers on same Y.Type

Allowed but risky — no built-in coordination. Each independently maintains stacks. Undo from one manager can trigger the other's capture if origins aren't carefully isolated.
