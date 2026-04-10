---
title: "Evidence: Milkdown Yjs/y-prosemirror Collaboration Integration"
date: 2026-04-03
type: evidence
source: packages/plugins/plugin-collab/src/collab-service.ts
---

# Collab/Yjs Integration Evidence

## Package Dependencies

File: `packages/plugins/plugin-collab/package.json`

```json
"peerDependencies": {
  "y-prosemirror": "*",
  "y-protocols": "*",
  "yjs": "*"
},
"devDependencies": {
  "y-prosemirror": "^1.2.15",
  "y-protocols": "^1.0.6",
  "yjs": "^13.6.23"
}
```

## y-prosemirror Imports

File: `packages/plugins/plugin-collab/src/collab-service.ts`, lines 18-28

```typescript
import {
  prosemirrorToYDoc,
  redo,
  undo,
  yCursorPlugin,
  yCursorPluginKey,
  yXmlFragmentToProseMirrorRootNode,
  ySyncPlugin,
  ySyncPluginKey,
  yUndoPlugin,
  yUndoPluginKey,
} from 'y-prosemirror'
import { applyUpdate, encodeStateAsUpdate } from 'yjs'
```

## Document Binding -- Hardcoded Fragment Name

File: `packages/plugins/plugin-collab/src/collab-service.ts`, lines 159-161

```typescript
bindDoc(doc: Doc) {
  this.#xmlFragment = doc.getXmlFragment('prosemirror')
  return this
}
```

The Yjs XmlFragment key is hardcoded to `'prosemirror'`.

## Plugin Creation -- Thin Wrapper

File: `packages/plugins/plugin-collab/src/collab-service.ts`, lines 111-139

```typescript
#createPlugins(): Plugin[] {
  if (!this.#xmlFragment) throw missingYjsDoc()
  const { ySyncOpts, yUndoOpts } = this.#options
  const plugins = [
    ySyncPlugin(this.#xmlFragment, ySyncOpts),
    yUndoPlugin(yUndoOpts),
    new Plugin({
      key: CollabKeymapPluginKey,
      props: {
        handleKeyDown: keydownHandler({
          'Mod-z': undo,
          'Mod-y': redo,
          'Mod-Shift-z': redo,
        }),
      },
    }),
  ]
  if (this.#awareness) {
    const { yCursorOpts, yCursorStateField } = this.#options
    plugins.push(
      yCursorPlugin(this.#awareness, yCursorOpts, yCursorStateField)
    )
  }
  return plugins
}
```

Total additions beyond y-prosemirror: one keymap plugin for undo/redo shortcuts.

## Template Application (Initial Doc Sync)

File: `packages/plugins/plugin-collab/src/collab-service.ts`, lines 190-216

```typescript
applyTemplate(template, condition?) {
  const conditionFn = condition || ((yDocNode) => yDocNode.textContent.length === 0)
  const node = this.#valueToNode(template)  // uses Milkdown's parser
  const schema = this.#ctx.get(schemaCtx)
  const yDocNode = yXmlFragmentToProseMirrorRootNode(this.#xmlFragment, schema)

  if (node && conditionFn(yDocNode, node)) {
    const fragment = this.#xmlFragment
    fragment.delete(0, fragment.length)
    const templateDoc = prosemirrorToYDoc(node)
    const template = encodeStateAsUpdate(templateDoc)
    if (fragment.doc) applyUpdate(fragment.doc, template)
    templateDoc.destroy()
  }
  return this
}
```

This is the only place where Milkdown's parser interacts with Yjs -- converting the initial markdown template into a ProseMirror doc, then into a Yjs update.

## Connect/Disconnect

File: `packages/plugins/plugin-collab/src/collab-service.ts`, lines 219-248

```typescript
connect() {
  const prosePlugins = this.#ctx.get(prosePluginsCtx)
  const collabPlugins = this.#createPlugins()
  const plugins = prosePlugins.concat(collabPlugins)
  this.#flushEditor(plugins)
  this.#connected = true
}

disconnect() {
  const prosePlugins = this.#ctx.get(prosePluginsCtx)
  const plugins = prosePlugins.filter(
    (plugin) => !plugin.spec.key || !collabPluginKeys.includes(plugin.spec.key)
  )
  this.#flushEditor(plugins)
  this.#connected = false
}
```

Connect: appends y-prosemirror plugins and reconfigures editor state.
Disconnect: filters them out and reconfigures.

## Key Finding: No Markdown-Level Sync

The Yjs integration syncs **ProseMirror document state** (node tree), not MDAST or markdown text. The remark pipeline is only used:
1. When loading the initial template
2. When the listener plugin serializes on-demand

There is no mechanism to sync markdown edits across peers. All collaboration happens in ProseMirror's node/mark model, bridged to Yjs XmlFragment by y-prosemirror.
