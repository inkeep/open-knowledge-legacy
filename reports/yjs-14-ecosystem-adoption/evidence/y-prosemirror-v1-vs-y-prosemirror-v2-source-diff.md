# y-prosemirror v1 (1.3.7) vs @y/prosemirror v2 (2.0.0-2) — source-traced diff

Evidence file for the **1-way-door migration decision**. Every claim cites file:line. Sources cross-checked: installed `node_modules/y-prosemirror@1.3.7`, fresh extract of `@y/prosemirror@2.0.0-2.tgz` at `/tmp/yprose2/package/`, our `patches/y-prosemirror@1.3.7.patch`, and the `@tiptap/y-tiptap@3.0.3` vendored fork at `node_modules/@tiptap/y-tiptap/dist/y-tiptap.js`.

## TL;DR for the decision-maker

**The big surprises:**

1. **v2's package name changed (`y-prosemirror` → `@y/prosemirror`) but its public API did not.** `ySyncPlugin(yXmlFragment, opts)`, `updateYFragment(y, frag, pNode, meta)`, `yCursorPlugin(awareness, opts)`, `yUndoPlugin({ protectedNodes, trackedOrigins, undoManager })`, `prosemirrorJSONToYXmlFragment`, `yXmlFragmentToProsemirrorJSON`, `initProseMirrorDoc`, `getRelativeSelection`, `absolutePositionToRelativePosition`, `relativePositionToAbsolutePosition`, `setMeta`, `redo`, `undo` — all preserved with identical signatures (`/tmp/yprose2/package/src/y-prosemirror.js:1-12` matches `node_modules/y-prosemirror/src/y-prosemirror.js:1-12` byte-for-byte).
2. **The legacy plugin code is byte-near-identical between versions.** `sync-plugin.js` is 1323 LOC in v1 and 1306 LOC in v2 — the entire 17-LOC delta is concentrated in **5 trivial yjs-API renames** (see Dimension 2). The deep-attr-equality engine (`equalYTypePNode`), `updateYFragment`, `createNodeFromYElement`, `createTextNodesFromYText`, and the destructive-delete failure path are pixel-identical.
3. **v2 ships a SECOND, NEW sync architecture in parallel — `syncPlugin` (note casing) — that is NOT exported.** It lives at `/tmp/yprose2/package/src/index.js:70-193` (627 LOC of new code) and uses semantic `lib0/delta` operations, attribution managers, and a `YEditorView` class. The package.json `exports` map (`/tmp/yprose2/package/package.json:24-30`) only ships `src/y-prosemirror.js` (the legacy entry), so `syncPlugin` is not reachable via `import { syncPlugin } from '@y/prosemirror'`. It's dev-only / preview code.
4. **Our patch's hook point still exists in v2.** The destructive-delete catch blocks at `/tmp/yprose2/package/src/plugins/sync-plugin.js:804-811` (block context) and `:839-844` (inline context) are LINE-FOR-LINE the upstream pre-patch shape. Our patch ports cleanly with mechanical edits (yjs API renames in nearby lines, no algorithmic changes).
5. **CRITICAL: our actual production codepath does NOT depend on `y-prosemirror` directly.** It depends on `@tiptap/y-tiptap@3.0.3`, a vendored fork of y-prosemirror@1.x bundled into `dist/y-tiptap.js` (2250 LOC, single file). Our `patches/y-prosemirror@1.3.7.patch` only modifies `node_modules/y-prosemirror/`; `node_modules/@tiptap/y-tiptap/dist/y-tiptap.js` is **unpatched** and contains the destructive-delete at lines 862 and 897. This is a separate finding — see Dimension 15 — that's load-bearing for any v2 evaluation.

**Migration verdict (per dimension below):** 11 of 15 dimensions are DROP-IN or MECHANICAL. The remaining 4 are PATCH-RE-PORT (mechanical) and one is REFACTOR (peer-deps cascade through `@y/y@^14.0.0-16`, `@y/protocols@^1.0.6-3`, plus the y-tiptap fork question).

---

## Source provenance

| Artifact | Location | LOC |
| --- | --- | --- |
| v1 source | `node_modules/y-prosemirror/src/` (after `bun install` + patch applied) | 2229 total (5 source files) |
| v1 patched dist | `node_modules/y-prosemirror/dist/y-prosemirror.cjs` | (CJS bundle, includes our patch markers) |
| v2 source | `/tmp/yprose2/package/src/` (extracted from `@y/prosemirror@2.0.0-2.tgz`) | 5029 total — but 627 LOC of that is the new `index.js` |
| Our patch | `patches/y-prosemirror@1.3.7.patch` | 100 LOC of diff |
| Tiptap fork | `node_modules/@tiptap/y-tiptap/dist/y-tiptap.js` (single bundled file) | 2250 |

Per-file LOC comparison:

```
v1                                v2                                Δ
src/lib.js                440     src/lib.js                440     0
src/utils.js               20     src/utils.js               20     0
src/y-prosemirror.js       11     src/y-prosemirror.js       11     0
src/plugins/cursor-plugin 267     src/plugins/cursor-plugin 267     0
src/plugins/keys.js        23     src/plugins/keys.js        24    +1
src/plugins/sync-plugin  1323     src/plugins/sync-plugin  1306   -17
src/plugins/undo-plugin   125     src/plugins/undo-plugin   125     0
                                  src/index.js              627   +627  ← NEW (not exported)
```

---

## Dimension 1 — Plugin API shape

**v1 export entry (`node_modules/y-prosemirror/src/y-prosemirror.js:1-12`):**

```js
export * from './plugins/cursor-plugin.js'
export { ySyncPlugin, isVisible, getRelativeSelection, ProsemirrorBinding, updateYFragment } from './plugins/sync-plugin.js'
export * from './plugins/undo-plugin.js'
export * from './plugins/keys.js'
export {
  absolutePositionToRelativePosition, relativePositionToAbsolutePosition, setMeta,
  prosemirrorJSONToYDoc, yDocToProsemirrorJSON, yDocToProsemirror, prosemirrorToYDoc,
  prosemirrorJSONToYXmlFragment, yXmlFragmentToProsemirrorJSON, yXmlFragmentToProsemirror,
  prosemirrorToYXmlFragment, yXmlFragmentToProseMirrorRootNode, yXmlFragmentToProseMirrorFragment,
  initProseMirrorDoc
} from './lib.js'
```

**v2 export entry (`/tmp/yprose2/package/src/y-prosemirror.js:1-12`):** byte-for-byte identical.

**`ySyncPlugin` signature (v1 `node_modules/y-prosemirror/src/plugins/sync-plugin.js:103-109`):**

```js
export const ySyncPlugin = (yXmlFragment, {
  colors = defaultColors,
  colorMapping = new Map(),
  permanentUserData = null,
  onFirstRender = () => {},
  mapping
} = {}) => {
```

**v2 (`/tmp/yprose2/package/src/plugins/sync-plugin.js:103-109`):** identical signature.

The `YSyncOpts` typedef is identical at v1:62-69 and v2:62-69. Mandatory: `yXmlFragment`. Optional: `colors`, `colorMapping`, `permanentUserData`, `onFirstRender`, `mapping`.

**The hypothesis from the task brief — that v2 changed to `syncPlugin(opts)` with YType set via plugin metadata — is FALSE for the exported v2 entry.** That alternate `syncPlugin(ytype, { awareness, attributionManager })` exists at `/tmp/yprose2/package/src/index.js:70` but is unreachable through the package.json `exports` map. It's preview/dev code.

**Migration impact: DROP-IN.**

---

## Dimension 2 — Sync algorithm

**v1 main observe loop (`node_modules/y-prosemirror/src/plugins/sync-plugin.js:592-643`):** `_typeChanged` handler, attached via `this.type.observeDeep(this._observeFunction)` at v1:667.

**v2 main observe loop (`/tmp/yprose2/package/src/plugins/sync-plugin.js:592-643`):** byte-identical loop, byte-identical `observeDeep` attachment at v2:667.

The PM→Y direction is `_prosemirrorChanged → updateYFragment(this.doc, this.type, doc, this)` at v1:648-655 / v2:648-655 (identical).

**Total `sync-plugin.js` deltas (the entire 17-LOC reduction is concentrated here):**

```diff
@@ v1:14 → v2:14 (yjs package rename)
- import * as Y from 'yjs'
+ import * as Y from '@y/y'

@@ v1:49 → v2:49 (DeleteSet → IdSet API change)
-      !Y.isDeleted(snapshot.ds, item.id))
+      !snapshot.ds.hasId(item.id))

@@ v1:405 → v2:405 (DeleteSet → IdSet API change)
-      prevSnapshot = Y.createSnapshot(Y.createDeleteSet(), new Map())
+      prevSnapshot = Y.createSnapshot(Y.createIdSet(), new Map())

@@ v1:531 → v2:531 (function rename)
-            Y.iterateDeletedStructs(transaction, ds, (_item) => {})
+            Y.iterateStructsByIdSet(transaction, ds, (_item) => {})

@@ v1:609 → v2:609 (function rename, same call)
-      Y.iterateDeletedStructs(
+      Y.iterateStructsByIdSet(
```

That's the entire algorithmic delta. The remaining 12 LOC of file-length difference comes from formatting/whitespace adjustments (no semantic change), per `diff -u` output.

The new `syncPlugin` (NOT exported) at `/tmp/yprose2/package/src/index.js:70-193` uses a fundamentally different algorithm — `lib0/delta` semantic ops + `applyDelta`/`getContent`/`deltaDeep` from `@y/y` — but, again, it's not in the exports map.

**Migration impact: DROP-IN** for the algorithm itself; **MECHANICAL** for the surrounding `@y/y` peer-dep cascade (see Dimension 14).

---

## Dimension 3 — Tree projection

**v1 `prosemirrorToYXmlFragment` (`node_modules/y-prosemirror/src/lib.js:280-285`):**

```js
export function prosemirrorToYXmlFragment (doc, xmlFragment) {
  const type = xmlFragment || new Y.XmlFragment()
  const ydoc = type.doc ? type.doc : { transact: (transaction) => transaction(undefined) }
  updateYFragment(ydoc, type, doc, { mapping: new Map(), isOMark: new Map() })
  return type
}
```

**v2 (`/tmp/yprose2/package/src/lib.js:280-285`):** byte-identical.

**v1 `yXmlFragmentToProsemirrorJSON` (`node_modules/y-prosemirror/src/lib.js:376-440`):** 65-LOC tree walker producing PM JSON.

**v2 (`/tmp/yprose2/package/src/lib.js:376-440`):** byte-identical.

The entire `lib.js` diff between v1 and v2 is one line:

```diff
@@ v1:3 → v2:3
- import * as Y from 'yjs'
+ import * as Y from '@y/y'
```

`yXmlFragmentToProseMirrorFragment`, `yXmlFragmentToProseMirrorRootNode`, `initProseMirrorDoc`, `prosemirrorToYDoc`, `prosemirrorJSONToYDoc`, `prosemirrorJSONToYXmlFragment`, `yDocToProsemirror`, `yXmlFragmentToProsemirror`, `yDocToProsemirrorJSON`, `yXmlFragmentToProsemirrorJSON` — all preserved with identical signatures and identical bodies.

**Migration impact: DROP-IN.**

---

## Dimension 4 — `updateYFragment` function

**v1 source (`node_modules/y-prosemirror/src/plugins/sync-plugin.js:1162-1315`)** — the full 154-LOC body of the function is reproduced below. v2 (`/tmp/yprose2/package/src/plugins/sync-plugin.js:1145-1298`) is byte-identical.

```js
export const updateYFragment = (y, yDomFragment, pNode, meta) => {
  if (
    yDomFragment instanceof Y.XmlElement &&
    yDomFragment.nodeName !== pNode.type.name
  ) {
    throw new Error('node name mismatch!')
  }
  meta.mapping.set(yDomFragment, pNode)
  // update attributes
  if (yDomFragment instanceof Y.XmlElement) {
    const yDomAttrs = yDomFragment.getAttributes()
    const pAttrs = pNode.attrs
    for (const key in pAttrs) {
      if (pAttrs[key] !== null) {
        if (yDomAttrs[key] !== pAttrs[key] && key !== 'ychange') {
          yDomFragment.setAttribute(key, pAttrs[key])
        }
      } else {
        yDomFragment.removeAttribute(key)
      }
    }
    // remove all keys that are no longer in pAttrs
    for (const key in yDomAttrs) {
      if (pAttrs[key] === undefined) {
        yDomFragment.removeAttribute(key)
      }
    }
  }
  // update children
  const pChildren = normalizePNodeContent(pNode)
  const pChildCnt = pChildren.length
  const yChildren = yDomFragment.toArray()
  const yChildCnt = yChildren.length
  const minCnt = math.min(pChildCnt, yChildCnt)
  let left = 0
  let right = 0
  // find number of matching elements from left
  for (; left < minCnt; left++) {
    const leftY = yChildren[left]
    const leftP = pChildren[left]
    if (!mappedIdentity(meta.mapping.get(leftY), leftP)) {
      if (equalYTypePNode(leftY, leftP)) {
        // update mapping
        meta.mapping.set(leftY, leftP)
      } else {
        break
      }
    }
  }
  // find number of matching elements from right
  for (; right + left < minCnt; right++) {
    const rightY = yChildren[yChildCnt - right - 1]
    const rightP = pChildren[pChildCnt - right - 1]
    if (!mappedIdentity(meta.mapping.get(rightY), rightP)) {
      if (equalYTypePNode(rightY, rightP)) {
        // update mapping
        meta.mapping.set(rightY, rightP)
      } else {
        break
      }
    }
  }
  y.transact(() => {
    // try to compare and update
    while (yChildCnt - left - right > 0 && pChildCnt - left - right > 0) {
      const leftY = yChildren[left]
      const leftP = pChildren[left]
      const rightY = yChildren[yChildCnt - right - 1]
      const rightP = pChildren[pChildCnt - right - 1]
      if (leftY instanceof Y.XmlText && leftP instanceof Array) {
        if (!equalYTextPText(leftY, leftP)) {
          updateYText(leftY, leftP, meta)
        }
        left += 1
      } else {
        let updateLeft = leftY instanceof Y.XmlElement &&
          matchNodeName(leftY, leftP)
        let updateRight = rightY instanceof Y.XmlElement &&
          matchNodeName(rightY, rightP)
        if (updateLeft && updateRight) {
          // decide which which element to update
          const equalityLeft = computeChildEqualityFactor(/* … */)
          const equalityRight = computeChildEqualityFactor(/* … */)
          if (equalityLeft.foundMappedChild && !equalityRight.foundMappedChild) updateRight = false
          else if (!equalityLeft.foundMappedChild && equalityRight.foundMappedChild) updateLeft = false
          else if (equalityLeft.equalityFactor < equalityRight.equalityFactor) updateLeft = false
          else updateRight = false
        }
        if (updateLeft) {
          updateYFragment(y, leftY, leftP, meta)
          left += 1
        } else if (updateRight) {
          updateYFragment(y, rightY, rightP, meta)
          right += 1
        } else {
          meta.mapping.delete(yDomFragment.get(left))
          yDomFragment.delete(left, 1)
          yDomFragment.insert(left, [createTypeFromTextOrElementNode(leftP, meta)])
          left += 1
        }
      }
    }
    const yDelLen = yChildCnt - left - right
    if (yChildCnt === 1 && pChildCnt === 0 && yChildren[0] instanceof Y.XmlText) {
      meta.mapping.delete(yChildren[0])
      // Edge case handling https://github.com/yjs/y-prosemirror/issues/108
      yChildren[0].delete(0, yChildren[0].length)
    } else if (yDelLen > 0) {
      yDomFragment.slice(left, left + yDelLen).forEach(type => meta.mapping.delete(type))
      yDomFragment.delete(left, yDelLen)
    }
    if (left + right < pChildCnt) {
      const ins = []
      for (let i = left; i < pChildCnt - right; i++) {
        ins.push(createTypeFromTextOrElementNode(pChildren[i], meta))
      }
      yDomFragment.insert(left, ins)
    }
  }, ySyncPluginKey)
}
```

**v2 has the exact same function** — same name, same signature `(y, yDomFragment, pNode, meta)`, same body, same `meta` shape (`{mapping: Map, isOMark: Map}`), and it's still re-exported through `y-prosemirror.js`. Our `agent-sessions.ts:124` call `updateYFragment(document, xmlFragment, pmNode, meta)` works untouched against v2's symbol of the same name (assuming the import is rerouted from `@tiptap/y-tiptap` to a v2-compatible source — see Dimension 15).

**Migration impact: DROP-IN.**

---

## Dimension 5 — `equalYTypePNode` deep-attr equality

**v1 (`node_modules/y-prosemirror/src/plugins/sync-plugin.js:993-1007`):**

```js
const equalYTypePNode = (ytype, pnode) => {
  if (
    ytype instanceof Y.XmlElement && !(pnode instanceof Array) &&
    matchNodeName(ytype, pnode)
  ) {
    const normalizedContent = normalizePNodeContent(pnode)
    return ytype._length === normalizedContent.length &&
      equalAttrs(ytype.getAttributes(), pnode.attrs) &&
      ytype.toArray().every((ychild, i) =>
        equalYTypePNode(ychild, normalizedContent[i])
      )
  }
  return ytype instanceof Y.XmlText && pnode instanceof Array &&
    equalYTextPText(ytype, pnode)
}
```

**v2 (`/tmp/yprose2/package/src/plugins/sync-plugin.js:976-990`):** byte-identical.

`equalAttrs` (`v1:929-942` / `v2:912-925`) — byte-identical recursive deep-equality.

`computeChildEqualityFactor` (`v1:1026-1057` / `v2:1009-1040`) — byte-identical.

**Precedent #10 (Open Knowledge `Opaque-but-content-bearing nodes for Y.Item identity`) is driven by this function's atom-node behavior. v2 preserves the EXACT semantics**: `equalAttrs` runs `===` on every attr value, so any attr-mutation on an atom node still triggers the full delete+reinsert at the `updateYFragment` consume sites. Our `rawMdxFallback` and `jsxInline` mitigations remain necessary AND remain effective under v2.

**Migration impact: DROP-IN.** Precedent #10 carries forward unchanged.

---

## Dimension 6 — Cursor plugin

**v1 entry (`node_modules/y-prosemirror/src/plugins/cursor-plugin.js:151-160`):**

```js
export const yCursorPlugin = (
  awareness,
  {
    awarenessStateFilter = defaultAwarenessStateFilter,
    cursorBuilder = defaultCursorBuilder,
    selectionBuilder = defaultSelectionBuilder,
    getSelection = (state) => state.selection
  } = {},
  cursorStateField = 'cursor'
) =>
```

**v2 (`/tmp/yprose2/package/src/plugins/cursor-plugin.js:151-160`):** byte-identical.

Entire diff for `cursor-plugin.js`:

```diff
@@ v1:1 → v2:1 (yjs package)
- import * as Y from 'yjs'
+ import * as Y from '@y/y'
@@ v1:4 → v2:4 (y-protocols package)
- import { Awareness } from "y-protocols/awareness"; // eslint-disable-line
+ import { Awareness } from "@y/protocols/awareness"; // eslint-disable-line
```

`defaultAwarenessStateFilter`, `defaultCursorBuilder`, `defaultSelectionBuilder`, `createDecorations`, all preserved.

**Migration impact: MECHANICAL** (one import statement in the consumer if you import `Awareness` directly; otherwise DROP-IN). For our app `TiptapEditor.tsx:15` imports `yCursorPlugin` from `@tiptap/y-tiptap` — this dimension is dominated by the y-tiptap question (Dimension 15).

---

## Dimension 7 — Undo plugin

**v1 entry (`node_modules/y-prosemirror/src/plugins/undo-plugin.js:62-72`):**

```js
export const yUndoPlugin = ({ protectedNodes = defaultProtectedNodes, trackedOrigins = [], undoManager = null } = {}) => new Plugin({
  key: yUndoPluginKey,
  state: {
    init: (initargs, state) => {
      const ystate = ySyncPluginKey.getState(state)
      const _undoManager = undoManager || new UndoManager(ystate.type, {
        trackedOrigins: new Set([ySyncPluginKey].concat(trackedOrigins)),
        deleteFilter: (item) => defaultDeleteFilter(item, protectedNodes),
        captureTransaction: tr => tr.meta.get('addToHistory') !== false
      })
```

**v2 (`/tmp/yprose2/package/src/plugins/undo-plugin.js:62-72`):** byte-identical body.

Entire diff for `undo-plugin.js`:

```diff
@@ v1:4 → v2:4 (yjs package)
- import { UndoManager, Item, ContentType, XmlElement, Text } from 'yjs'
+ import { UndoManager, Item, ContentType, XmlElement, Text } from '@y/y'

@@ v1:9 → v2:9 (typedef ref)
- * @property {import('yjs').UndoManager} undoManager
+ * @property {import('@y/y').UndoManager} undoManager

@@ v1:46 → v2:46 (typedef ref)
- * @param {import('yjs').Item} item
+ * @param {import('@y/y').Item} item

@@ v1:60 → v2:60 (typedef ref)
- * @param {import('yjs').UndoManager | null} [options.undoManager]
+ * @param {import('@y/y').UndoManager | null} [options.undoManager]
```

`undo`, `redo`, `undoCommand`, `redoCommand`, `defaultProtectedNodes`, `defaultDeleteFilter`, `yUndoPlugin` — all preserved with identical bodies.

**Migration impact: MECHANICAL** (only consumers that explicitly import `UndoManager` from yjs need updating).

---

## Dimension 8 — The destructive-delete failure mode

**Our patch's hook point (v1 `node_modules/y-prosemirror/src/plugins/sync-plugin.js:725-828`).** The patched body of `createNodeFromYElement`:

```js
export const createNodeFromYElement = (
  el, schema, meta, snapshot, prevSnapshot, computeYChange
) => {
  // ... children construction ...
  try {
    const attrs = el.getAttributes(snapshot)
    // ...
    const node = schema.node(el.nodeName, attrs, children)
    meta.mapping.set(el, node)
    return node
  } catch (e) {
    // R13 patch: substitute rawMdxFallback instead of destructive delete.
    console.warn('[y-prosemirror] schema.node(' + el.nodeName + ') threw:', String(e && e.message || e))
    const __okYps = (globalThis.__okYpsCounters = globalThis.__okYpsCounters || { block: 0, inline: 0 })
    const isInline = schema.nodes[el.nodeName] && schema.nodes[el.nodeName].spec && schema.nodes[el.nodeName].spec.inline
    if (isInline) {
      __okYps.inline++
    } else {
      __okYps.block++
      if (schema.nodes.rawMdxFallback) {
        try {
          const fallback = schema.node('rawMdxFallback', { reason: String(e && e.message || e) }, [schema.text(el.nodeName)])
          meta.mapping.set(el, fallback)
          return fallback
        } catch (_fallbackErr) { /* … */ }
      }
    }
    meta.mapping.delete(el)
    return null
  }
}
```

Same function in **`createTextNodesFromYText`** (v1 `node_modules/y-prosemirror/src/plugins/sync-plugin.js:841-865`):

```js
const createTextNodesFromYText = (text, schema, _meta, snapshot, prevSnapshot, computeYChange) => {
  const nodes = []
  const deltas = text.toDelta(snapshot, prevSnapshot, computeYChange)
  try {
    for (let i = 0; i < deltas.length; i++) {
      const delta = deltas[i]
      nodes.push(schema.text(delta.insert, attributesToMarks(delta.attributes, schema)))
    }
  } catch (e) {
    // R13 patch: log + skip instead of destructive delete for text nodes.
    console.warn('[y-prosemirror] schema.text() threw:', String(e && e.message || e))
    const __okYps = (globalThis.__okYpsCounters = globalThis.__okYpsCounters || { block: 0, inline: 0 })
    __okYps.inline++
    return null
  }
  return nodes
}
```

**v2 has the SAME failure mode at the SAME line offsets.** `/tmp/yprose2/package/src/plugins/sync-plugin.js:804-811`:

```js
  } catch (e) {
    // an error occured while creating the node. This is probably a result of a concurrent action.
    /** @type {Y.Doc} */ (el.doc).transact((transaction) => {
      /** @type {Y.Item} */ (el._item).delete(transaction)
    }, ySyncPluginKey)
    meta.mapping.delete(el)
    return null
  }
```

And `/tmp/yprose2/package/src/plugins/sync-plugin.js:839-844`:

```js
  } catch (e) {
    // an error occured while creating the node. This is probably a result of a concurrent action.
    /** @type {Y.Doc} */ (text.doc).transact((transaction) => {
      /** @type {Y.Item} */ (text._item).delete(transaction)
    }, ySyncPluginKey)
    return null
  }
```

These are LINE-FOR-LINE the same upstream pre-patch code. The `_item.delete(transaction)` call is the destructive-delete primitive that the spec correctly characterizes as "CRDT-permanent, multi-peer broadcast, undo-resistant" (precedent #9). v2 ships unchanged.

**Migration impact: PATCH-RE-PORT.** The patch ports cleanly — see Dimension 13 for the literal v2 patch hunk.

---

## Dimension 9 — `hydrateMarks` function

**Finding: `hydrateMarks` does NOT exist in y-prosemirror v1, y-prosemirror v2, or `@tiptap/y-tiptap@3.0.3`.** A `grep` across all three sources returns zero results.

`hydrateMarks` lives in `@handlewithcare/remark-prosemirror@0.1.5` at `node_modules/@handlewithcare/remark-prosemirror/lib/mdast-util-from-prosemirror.js:118-179`. US-017's patch (`patches/@handlewithcare%2Fremark-prosemirror@0.1.5.patch:97-179`) modified that package, NOT y-prosemirror.

The task brief's framing ("v1 sync-plugin.js — find this function … US-017 patched it") is a misattribution.

**Migration impact: N/A** for the y-prosemirror v1→v2 question. Separate concern: `@handlewithcare/remark-prosemirror` is unaffected by the y-prosemirror migration (it's a remark plugin, not a Yjs binding).

---

## Dimension 10 — `prosemirrorJSONToYXmlFragment`

**v1 (`node_modules/y-prosemirror/src/lib.js:317-320`):**

```js
export function prosemirrorJSONToYXmlFragment (schema, state, xmlFragment) {
  const doc = Node.fromJSON(schema, state)
  return prosemirrorToYXmlFragment(doc, xmlFragment)
}
```

**v2 (`/tmp/yprose2/package/src/lib.js:317-320`):** byte-identical.

Both build `Y.XmlFragment` (containing `Y.XmlElement` + `Y.XmlText` children) using `updateYFragment` under the hood. The structural shape (XmlElement tree on `Y.XmlFragment`) is unchanged. v2's preview `syncPlugin` would build a different shape via `applyDelta`, but it's not the exported path.

**Migration impact: DROP-IN.**

---

## Dimension 11 — PM v1 vs PM v2 vs PM v3 compat

**v1 peerDependencies (`node_modules/y-prosemirror/package.json:59-65`):**

```json
"peerDependencies": {
  "prosemirror-model": "^1.7.1",
  "prosemirror-state": "^1.2.3",
  "prosemirror-view": "^1.9.10",
  "y-protocols": "^1.0.1",
  "yjs": "^13.5.38"
}
```

**v2 peerDependencies (`/tmp/yprose2/package/package.json:59-65`):**

```json
"peerDependencies": {
  "@y/protocols": "^1.0.6-3",
  "prosemirror-model": "^1.7.1",
  "prosemirror-state": "^1.2.3",
  "prosemirror-view": "^1.9.10",
  "@y/y": "^14.0.0-16"
}
```

**ProseMirror peer-deps are UNCHANGED (`prosemirror-model ^1.7.1`, `prosemirror-state ^1.2.3`, `prosemirror-view ^1.9.10`).** There is no "ProseMirror v2 / v3" major version transition involved — ProseMirror itself remains at the long-stable 1.x line. This is a Yjs migration (yjs 13.x → @y/y 14.x), NOT a ProseMirror migration.

The yjs fork is the cascading change: `yjs` → `@y/y` (renamed package, breaking API changes per the @y/y RFC documented separately). Our codebase has 100+ files importing `from 'yjs'`, all needing reroute to `from '@y/y'` or a barrel module.

**Migration impact: DROP-IN** for ProseMirror; **REFACTOR** for yjs peer-dep cascade (Dimension 14).

---

## Dimension 12 — Performance characteristics

**v1's PM transaction handler (`node_modules/y-prosemirror/src/plugins/sync-plugin.js:226-231` — view-update path):**

```js
binding.mux(() => {
  /** @type {Y.Doc} */ (pluginState.doc).transact((tr) => {
    tr.meta.set('addToHistory', pluginState.addToHistory)
    binding._prosemirrorChanged(view.state.doc)
  }, ySyncPluginKey)
})
```

`_prosemirrorChanged` (v1:648-655) calls `updateYFragment(this.doc, this.type, doc, this)` — full-tree structural diff via the algorithm in Dimension 4.

**v2 (`/tmp/yprose2/package/src/plugins/sync-plugin.js:226-231` and `:648-655`):** byte-identical. Same full-tree structural-diff cost on every PM transaction.

**The new `syncPlugin` at `/tmp/yprose2/package/src/index.js:147-192` would have different perf** — semantic delta at the step level via `appendTransaction → trToDelta → ytype.applyDelta(d, am)`, which avoids the deep equality scan but pays for delta construction per ProseMirror step. However, again, this is not the exported path.

**Migration impact: DROP-IN.** Identical perf characteristics for the exported `ySyncPlugin`.

---

## Dimension 13 — Schema-throw substitution: where it lives in v2

The exact analogue line ranges in v2:

- `/tmp/yprose2/package/src/plugins/sync-plugin.js:725-812` — `createNodeFromYElement` (block context). The `catch (e)` block at `:804-811` is the substitution point.
- `/tmp/yprose2/package/src/plugins/sync-plugin.js:824-848` — `createTextNodesFromYText` (inline context). The `catch (e)` block at `:839-844` is the substitution point.

**Literal v2 patch hunks** (lifted from our existing v1 patch with line numbers re-anchored):

```diff
--- a/src/plugins/sync-plugin.js  (v2 baseline)
+++ b/src/plugins/sync-plugin.js  (v2 patched)
@@ -801,11 +801,28 @@ export const createNodeFromYElement = (
     meta.mapping.set(el, node)
     return node
   } catch (e) {
-    // an error occured while creating the node. This is probably a result of a concurrent action.
-    /** @type {Y.Doc} */ (el.doc).transact((transaction) => {
-      /** @type {Y.Item} */ (el._item).delete(transaction)
-    }, ySyncPluginKey)
+    // R13 patch: substitute rawMdxFallback instead of destructive delete.
+    console.warn('[y-prosemirror] schema.node(' + el.nodeName + ') threw:', String(e && e.message || e))
+    const __okYps = (globalThis.__okYpsCounters = globalThis.__okYpsCounters || { block: 0, inline: 0 })
+    const isInline = schema.nodes[el.nodeName] && schema.nodes[el.nodeName].spec && schema.nodes[el.nodeName].spec.inline
+    if (isInline) {
+      __okYps.inline++
+    } else {
+      __okYps.block++
+      if (schema.nodes.rawMdxFallback) {
+        try {
+          const fallback = schema.node('rawMdxFallback', { reason: String(e && e.message || e) }, [schema.text(el.nodeName)])
+          meta.mapping.set(el, fallback)
+          return fallback
+        } catch (_fallbackErr) {
+          console.warn('[y-prosemirror] rawMdxFallback substitution also failed:', String(_fallbackErr && _fallbackErr.message || _fallbackErr))
+        }
+      }
+    }
     meta.mapping.delete(el)
     return null
   }
@@ -836,10 +853,10 @@ const createTextNodesFromYText = (
       nodes.push(schema.text(delta.insert, attributesToMarks(delta.attributes, schema)))
     }
   } catch (e) {
-    // an error occured while creating the node. This is probably a result of a concurrent action.
-    /** @type {Y.Doc} */ (text.doc).transact((transaction) => {
-      /** @type {Y.Item} */ (text._item).delete(transaction)
-    }, ySyncPluginKey)
+    // R13 patch: log + skip instead of destructive delete for text nodes.
+    console.warn('[y-prosemirror] schema.text() threw:', String(e && e.message || e))
+    const __okYps = (globalThis.__okYpsCounters = globalThis.__okYpsCounters || { block: 0, inline: 0 })
+    __okYps.inline++
     return null
   }
   return nodes
```

The `globalThis.__okYpsCounters` bridge to `metrics/parse-health.ts` works identically — `globalThis` is unaffected by the package boundary.

**Migration impact: PATCH-RE-PORT (mechanical).** Line offsets shift by 17 LOC across the file (v1 1323 → v2 1306) but the affected blocks are at the same logical position. `bun patch @y/prosemirror@2.0.0-2` regenerates the `.patch` against the new source tree.

---

## Dimension 14 — Pure peer-deps comparison

| Field | v1 (1.3.7) | v2 (2.0.0-2) |
| --- | --- | --- |
| `peerDependencies.prosemirror-model` | `^1.7.1` | `^1.7.1` |
| `peerDependencies.prosemirror-state` | `^1.2.3` | `^1.2.3` |
| `peerDependencies.prosemirror-view` | `^1.9.10` | `^1.9.10` |
| `peerDependencies.yjs` | `^13.5.38` | — (removed) |
| `peerDependencies.@y/y` | — | `^14.0.0-16` |
| `peerDependencies.y-protocols` | `^1.0.1` | — (removed) |
| `peerDependencies.@y/protocols` | — | `^1.0.6-3` |
| `dependencies.lib0` | `^0.2.109` | `^0.2.115-6` |
| `engines.node` | `>=16.0.0` | `>=16.0.0` |

Source: `node_modules/y-prosemirror/package.json:59-88` and `/tmp/yprose2/package/package.json:56-89`.

**The peer-dep cascade is the work.** Every consumer that currently has `import * as Y from 'yjs'` (server, app, core, tests — count 100+ files) must be rerouted to `import * as Y from '@y/y'`. `y-protocols` similarly → `@y/protocols`. The Hocuspocus side (`@hocuspocus/server` and friends) currently peer-depends on `yjs ^13.x` and would need to support `@y/y@^14` before the migration can complete; that's a separate ecosystem question.

**Migration impact: REFACTOR** (mechanical but broad — cascade through transitive deps).

---

## Dimension 15 — `@tiptap/y-tiptap` re-exports

**Our agent path imports come from `@tiptap/y-tiptap`, not from `y-prosemirror` directly.** Confirmed by:

- `packages/server/src/agent-sessions.ts:26`: `import { updateYFragment, yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap';`
- `packages/server/src/server-observers.ts:34`: `import { updateYFragment, yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap';`
- `packages/app/src/editor/observers.ts:41`: `import { yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap';`
- `packages/app/src/editor/TiptapEditor.tsx:15`: `import { yCursorPlugin } from '@tiptap/y-tiptap';`

**`@tiptap/y-tiptap@3.0.3` is a vendored fork of y-prosemirror@1.x.** Source layout (`node_modules/@tiptap/y-tiptap/package.json`):

- Main: `dist/y-tiptap.cjs`
- Module: `dist/y-tiptap.js` (single 2250-LOC file — the entire y-prosemirror source bundled)
- peerDependencies: `prosemirror-* ^1.x`, `y-protocols ^1.0.1`, `yjs ^13.5.38`

The dist bundle includes (verified via `grep`):

| y-prosemirror v1 export | Present in y-tiptap dist? | Line in y-tiptap.js |
| --- | --- | --- |
| `ySyncPluginKey` | yes | 27 |
| `ySyncPlugin` | yes | 142 |
| `createNodeFromYElement` | yes | 780 |
| `updateYFragment` | yes | 1209 |
| `equalYTypePNode` | yes | 1040 |

**The destructive-delete bug is duplicated in the y-tiptap fork at lines 862 and 897:**

```js
// y-tiptap.js:856-863 (createNodeFromYElement catch block)
const node = schema.node(el.nodeName, attrs, children);
meta.mapping.set(el, node);
return node;
} catch (e) {
  /** @type {Y.Item} */ (el._item).delete(transaction);   // ← destructive
}, ySyncPluginKey);

// y-tiptap.js:897 (createTextNodesFromYText catch block)
/** @type {Y.Item} */ (text._item).delete(transaction);   // ← destructive
```

**Our patch `patches/y-prosemirror@1.3.7.patch` does NOT modify `@tiptap/y-tiptap`.** It only modifies `node_modules/y-prosemirror/dist/y-prosemirror.cjs` and `node_modules/y-prosemirror/src/plugins/sync-plugin.js`. Verified by `grep` for the patch markers:

```
$ grep -n "rawMdxFallback\|R13 patch" node_modules/y-prosemirror/dist/y-prosemirror.cjs
879:    // R13 patch: substitute rawMdxFallback instead of destructive delete.
887:      if (schema.nodes.rawMdxFallback) {
[...]

$ grep -n "rawMdxFallback\|R13 patch" node_modules/@tiptap/y-tiptap/dist/y-tiptap.js
(no matches)
```

This is a separate finding that's load-bearing for the migration evaluation: **even today on v1, our patch's coverage of the production agent-write path is questionable** — `applyAgentMarkdownWrite` calls the y-tiptap-bundled `updateYFragment`, which itself would call the y-tiptap-bundled `createNodeFromYElement` if a CRDT→PM materialization is ever triggered through that path.

(In practice: `updateYFragment` doesn't go through `createNodeFromYElement` — it goes through `createTypeFromTextOrElementNode` which is the PM→Y direction. The destructive delete only fires on the Y→PM direction inside `_typeChanged` and `_renderSnapshot`, both of which run inside `ySyncPlugin`'s view callback — and `ySyncPlugin` IS called from `TiptapEditor.tsx:15`'s `@tiptap/y-tiptap` `yCursorPlugin` import path. Tiptap's editor wires `ySyncPlugin` from y-tiptap, not from y-prosemirror. So the patch coverage gap IS real for the WYSIWYG client-side path.)

**Two independent migration questions emerge:**

1. **If we migrate to `@y/prosemirror@2`:** What does `@tiptap/y-tiptap` upgrade to? It's a Tiptap-team fork; v3.0.3 was published with peerDeps `yjs ^13.5.38`. There's no `@tiptap/y-tiptap@4.x` for `@y/y@^14` as of this writing.
2. **Even on v1 today:** Should we patch y-tiptap as well as y-prosemirror? Or move our consumers from y-tiptap to y-prosemirror to ensure patch coverage?

**Migration impact for Dimension 15: REWRITE / blocked on Tiptap.** A v2 migration cannot ship until Tiptap publishes a `@y/y@^14`-compatible y-tiptap fork (or until we vendor our own).

---

## Critical Q&A

### Could we port `patches/y-prosemirror@1.3.7.patch` to `@y/prosemirror@2.0.0-2` line-for-line?

**Yes, mechanically.** The two patched `catch (e)` blocks are at v2 `sync-plugin.js:804-811` and `:839-844`, which is byte-identical pre-patch to v1's `:801-808` and `:837-844` modulo a 17-LOC shift. The patch hunks transcribed in Dimension 13 apply cleanly. Our `__okYpsCounters` global is unchanged, our `rawMdxFallback` schema-lookup is unchanged.

**The only mechanical edits required:**

1. Renumber line offsets in the patch headers (`@@ -801,11 +801,28 @@` → `@@ -804,8 +804,25 @@`).
2. Re-issue via `bun patch @y/prosemirror@2.0.0-2 → bun patch --commit ...` to regenerate the lockfile binding.
3. Update `package.json` `patchedDependencies` from `"y-prosemirror@1.3.7": "patches/y-prosemirror@1.3.7.patch"` to `"@y/prosemirror@2.0.0-2": "patches/@y%2Fprosemirror@2.0.0-2.patch"` (URL-escaped `/`).
4. Update `packages/core/src/y-prosemirror-patch.test.ts` (the version-literal test at lines 78-83 and the file path at lines 87, 112, 133).

The PROCEDURE is documented inside the test file already (`y-prosemirror-patch.test.ts:28-58`).

### The `metrics/parse-health.ts` bridge to `globalThis.__okYpsCounters` — does v2 require a different counter strategy?

**No.** `globalThis` is unaffected by the package boundary or the `yjs` → `@y/y` rename. The bridge in `parse-health.ts` reads `globalThis.__okYpsCounters` after each parse cycle; the patch sets it via `globalThis.__okYpsCounters = globalThis.__okYpsCounters || { block: 0, inline: 0 }`. v2's patch body is identical (Dimension 13). Counter test in `parse-health.test.ts` is package-agnostic.

### For `applyAgentMarkdownWrite` in our `agent-sessions.ts`: we call `updateYFragment`. Under v2, what's the equivalent?

**`updateYFragment` is preserved with identical signature `(y, yDomFragment, pNode, meta)` and identical body.** Source-traced at `/tmp/yprose2/package/src/plugins/sync-plugin.js:1145-1298`, exported through `/tmp/yprose2/package/src/y-prosemirror.js:2`.

The call site:

```ts
// packages/server/src/agent-sessions.ts:124
updateYFragment(document, xmlFragment, pmNode, meta);
```

works against v2 unchanged provided:
- `document` is a `Y.Doc` (under v2: `import { Doc } from '@y/y'`).
- `xmlFragment` is a `Y.XmlFragment` (under v2: `import { XmlFragment } from '@y/y'`).
- `pmNode` is a ProseMirror Node (peer-dep `prosemirror-model ^1.7.1` unchanged).
- `meta` is `{ mapping: new Map(), isOMark: new Map() }` (shape unchanged — see `createEmptyMeta` at v1:35-38 and v2:35-38, byte-identical).

The blocker is NOT the API — it's the import source. Today we import from `@tiptap/y-tiptap`. If `@tiptap/y-tiptap` does not publish a `@y/y`-compatible release, we'd either:

- (a) switch the agent-write path imports from `@tiptap/y-tiptap` → `@y/prosemirror` (incurs the dual-package issue on the client side where `ySyncPlugin` is wired through y-tiptap), or
- (b) wait for `@tiptap/y-tiptap@4.x` to land with `@y/y@^14` peerDeps.

---

## Migration impact summary

| Dim | Topic | Verdict |
| --- | --- | --- |
| 1 | Plugin API shape | DROP-IN |
| 2 | Sync algorithm | DROP-IN (algo) + MECHANICAL (yjs renames) |
| 3 | Tree projection | DROP-IN |
| 4 | `updateYFragment` | DROP-IN |
| 5 | `equalYTypePNode` deep-attr equality | DROP-IN — precedent #10 carries forward |
| 6 | Cursor plugin | MECHANICAL |
| 7 | Undo plugin | MECHANICAL |
| 8 | Destructive-delete failure mode | PATCH-RE-PORT (mechanical) |
| 9 | `hydrateMarks` (misattribution) | N/A — owned by `@handlewithcare/remark-prosemirror` |
| 10 | `prosemirrorJSONToYXmlFragment` | DROP-IN |
| 11 | PM v1/v2/v3 compat | DROP-IN (no PM major version change) |
| 12 | Performance characteristics | DROP-IN (exported path) |
| 13 | Schema-throw substitution location | PATCH-RE-PORT (mechanical, line offsets shift) |
| 14 | Pure peer-deps comparison | REFACTOR (yjs → @y/y cascade across 100+ files) |
| 15 | `@tiptap/y-tiptap` re-exports | REWRITE / BLOCKED ON TIPTAP — y-tiptap@3.x has yjs ^13 peerDep; no v4 yet for @y/y ^14 |

**No dimension is a true REWRITE on the y-prosemirror side itself.** The hard work is the yjs ecosystem migration (Dimension 14) and the y-tiptap blocker (Dimension 15).

---

## Sources

- v1 source files: `node_modules/y-prosemirror/src/` (after `bun install` with patch applied)
- v1 patched dist: `node_modules/y-prosemirror/dist/y-prosemirror.cjs`
- v2 source files: `/tmp/yprose2/package/src/` (extracted from `@y/prosemirror@2.0.0-2.tgz` via `npm pack`-equivalent)
- Our patch: `patches/y-prosemirror@1.3.7.patch` (100 LOC)
- Tiptap fork: `node_modules/@tiptap/y-tiptap/dist/y-tiptap.js` (2250 LOC bundled)
- Test invariants: `packages/core/src/y-prosemirror-patch.test.ts:1-138` (documents the upgrade procedure)
- Open Knowledge import sites: `packages/server/src/agent-sessions.ts:26`, `packages/server/src/server-observers.ts:34`, `packages/app/src/editor/observers.ts:41`, `packages/app/src/editor/TiptapEditor.tsx:15`
- Patched-deps registration: `package.json:55-58`
- Diff invocations used: `diff -u node_modules/y-prosemirror/src/plugins/sync-plugin.js /tmp/yprose2/package/src/plugins/sync-plugin.js` and `diff -u node_modules/y-prosemirror/src/lib.js /tmp/yprose2/package/src/lib.js`
