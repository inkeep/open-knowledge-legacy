---
"@inkeep/open-knowledge-app": patch
---

fix(editor-cache): clear undoManager.restore on park/evict to break TipTap+Yjs leak chain

TipTap mount/destroy cycles were leaking ~30 MB per cycle on multi-MB
documents (heap-snapshot probe: 10× PROJECT navigations retained 10 full
editor DOM trees). Two cooperating upstream behaviors caused the chain —
Yjs `UndoManager`'s constructor registers a `doc.on('destroy', …)`
listener with no stable reference (so `UndoManager.destroy()` cannot
deregister it; verified unfixed across `yjs@13.6.30`, `v14.0.0-rc.13`,
and `main`), and `@tiptap/extension-collaboration`'s plugin-view destroy
assigns `undoManager.restore = closure` capturing the entire `EditorView`
+ `ProsemirrorBinding` + `Editor` + PM document tree.

The cache now captures the per-editor UndoManager via `yUndoPluginKey`
before `editor.destroy()` and nulls `undoManager.restore` after destroy
returns at both call sites (`parkTiptapEditor` `__uncached` branch and
`evictTiptapEditor`). The leaked UndoManager itself remains in
`Y.Doc._observers` but its retained payload drops from ~30 MB to a few
hundred bytes per cycle — heap is now flat across PROJECT mount/destroy
cycles (0.14 MB/cycle drift, well below the noise floor).
