# Evidence: TipTap Integration Path

**Dimension:** D3 — TipTap integration with Automerge
**Date:** 2026-04-07
**Sources:** https://github.com/automerge/automerge-prosemirror, TipTap source code, npm

---

## Findings

### Finding: automerge-prosemirror is a raw ProseMirror plugin, not a TipTap extension
**Confidence:** CONFIRMED
**Evidence:** src/syncPlugin.ts — returns `new Plugin({ key: syncPluginKey, ... })`

The `syncPlugin()` function returns a standard ProseMirror plugin. It is NOT a TipTap extension. Integration with TipTap requires either:

**(a) Create a TipTap extension wrapper** — A thin TipTap extension that wraps the ProseMirror plugin. Approximately 50-80 lines:

```typescript
import { Extension } from '@tiptap/core'
import { init } from '@automerge/prosemirror'

export const AutomergeCollaboration = Extension.create({
  name: 'automergeCollaboration',
  addProseMirrorPlugins() {
    const { plugin } = init(this.options.handle, this.options.path, {
      schemaAdapter: this.options.schemaAdapter,
    })
    return [plugin]
  },
})
```

**(b) Bypass TipTap's collaboration extension and use raw PM plugins** — Pass the plugin directly via `extensions: [/* ... */, { addProseMirrorPlugins: () => [automergePlugin] }]`.

### Finding: TipTap's @tiptap/extension-collaboration depends on @tiptap/y-tiptap (Yjs)
**Confidence:** CONFIRMED
**Evidence:** npm dependency analysis

`@tiptap/extension-collaboration` imports from `@tiptap/y-tiptap` which wraps y-prosemirror. This extension manages: ySyncPlugin, yUndoPlugin, yCursorPlugin. Replacing it with Automerge means replacing ALL three concerns:

1. **Sync:** `syncPlugin` from `@automerge/prosemirror` (direct replacement)
2. **Undo:** Automerge has built-in undo/redo — but no ProseMirror integration exists. Would need a custom undo plugin that uses `A.changeAt()` or tracks Automerge heads.
3. **Cursors:** No automerge-prosemirror cursor plugin exists. Would need custom implementation using automerge-repo Presence API.

### Finding: SchemaAdapter requires a schema designed for Automerge — not arbitrary TipTap schemas
**Confidence:** CONFIRMED
**Evidence:** src/schema.ts — `MappedSchemaSpec` requires `automerge.block` and `automerge.markName` annotations

Every block node in the PM schema needs an `automerge.block` mapping, and every mark needs an `automerge.markName` mapping. TipTap's built-in extensions (StarterKit, etc.) define PM schemas WITHOUT these annotations. Migration requires either:

1. Creating Automerge-aware versions of every TipTap extension used (heading, code_block, list, etc.)
2. Building a schema mapping layer that adds Automerge annotations post-hoc

Option 1 is more reliable but means forking/re-implementing TipTap extensions.

### Finding: Option (a) — TipTap extension wrapper — is more feasible
**Confidence:** INFERRED
**Evidence:** Architecture analysis

The TipTap extension wrapper approach is cleaner because:
- TipTap's `addProseMirrorPlugins()` is the standard way to add PM plugins
- The SchemaAdapter can be configured separately from TipTap's extension registry
- But: the schema must be built by the SchemaAdapter, not by TipTap's schema merging. This creates tension — TipTap builds its schema by merging all extensions' schema specs, but automerge-prosemirror's `init()` returns its own schema from the SchemaAdapter.

**Resolution:** Build the schema via SchemaAdapter with all needed node/mark specs (including Automerge annotations), then pass it to TipTap via the `editorProps.schema` option or by ensuring TipTap extensions produce specs compatible with the SchemaAdapter.

---

## Gaps / follow-ups

- Undo/redo integration is an unsolved problem — no Automerge ProseMirror undo plugin exists
- Cursor/presence needs custom implementation
- Schema ownership conflict between TipTap and SchemaAdapter needs resolution
