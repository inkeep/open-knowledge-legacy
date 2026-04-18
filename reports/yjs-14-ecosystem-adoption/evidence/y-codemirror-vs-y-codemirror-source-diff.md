# `y-codemirror.next@0.3.5` vs `@y/codemirror@0.0.0-3` — source-traced diff

Scope: every observable difference in the binding code, plus a deep dive on whether one `YType` instance can drive both `@y/prosemirror` and `@y/codemirror` simultaneously.

## Source corpus

| Package | Version | Source root | Resolution |
| --- | --- | --- | --- |
| `y-codemirror.next` | `0.3.5` | `node_modules/y-codemirror.next/src/` | currently pinned in `packages/app` |
| `@y/codemirror` | `0.0.0-3` | `/tmp/ycm/package/src/` (npm tarball) | latest pre-release |
| `yjs` | `13.6.x` | `node_modules/yjs/` | currently pinned (peerDep of v1) |
| `@y/y` | `14.0.0-rc.13` | `/tmp/yy/package/src/` (npm tarball) | dist-tag `beta` |
| `@y/prosemirror` | `2.0.0-2` | `/tmp/ypm/package/src/` (npm tarball) | dist-tag `beta` |
| `lib0` | `1.0.0-rc.12` | `/tmp/lib0/package/types/delta/` | new delta module the v2 stack consumes |

Files compared (both packages have the same five-file shape — module rename only):

```
src/index.js
src/y-sync.js
src/y-remote-selections.js
src/y-undomanager.js
src/y-range.js
```

## Dim. 1 — Binding entry-point API

| | v1 (`y-codemirror.next@0.3.5`) | v2 (`@y/codemirror@0.0.0-3`) |
| --- | --- | --- |
| Default export | `yCollab(ytext, awareness, { undoManager? })` | `yCollab(ytext, awareness, { undoManager?, attributionManager? })` |
| Defined at | `src/index.js:20` | `src/index.js:20` |
| New constructor arg | — | `attributionManager = Y.noAttributionsManager` (`src/index.js:20`) |
| New plugin in default kit | — | `yAttributionDecorations` (`src/index.js:25`) |
| `YSyncConfig` constructor | `new YSyncConfig(ytext, awareness)` (`src/y-sync.js:8`) | `new YSyncConfig(ytext, awareness, am)` (`src/y-sync.js:85`) |
| `YSyncConfig` field added | — | `this.am = am` (`src/y-sync.js:92`) |
| Re-exports | `YRange, yRemoteSelections, yRemoteSelectionsTheme, ySync, ySyncFacet, YSyncConfig, yUndoManagerKeymap` | adds `ySyncAnnotation` (`src/index.js:10`) |
| Y import | `import * as Y from 'yjs'` (`src/index.js:2`) | `import * as Y from '@y/y'` (`src/index.js:1`) |

**Migration impact: REFACTOR.** Default-arg `attributionManager = Y.noAttributionsManager` lets unaware callers compile. But `Y` is now `@y/y` so every transitive import retargets, and `YSyncConfig` is no longer constructible without an attribution manager. Open Knowledge does not use attribution today, so passing `Y.noAttributionsManager` (or relying on the default) is the no-op path.

Concrete change at the call site (`packages/app/src/editor/SourceEditor.tsx:65`): no functional change required if we accept the default `attributionManager`. We do need to swap the package name and the `import type * as Y from 'yjs'` (`SourceEditor.tsx:28`).

## Dim. 2 — Type acceptance

v1 (`src/y-sync.js:8`):
```js
constructor (ytext, awareness) {
  this.ytext = ytext
  this.awareness = awareness
  this.undoManager = new Y.UndoManager(ytext)
}
```
JSDoc: `@param {Y.Text} ytext` (`src/index.js:14`).

v2 (`src/y-sync.js:79-93`):
```js
export class YSyncConfig {
  /**
   * @param {Y.Type<{ text: true }>} ytext
   * @param {import('@y/protocols/awareness').Awareness} awareness
   * @param {Y.AbstractAttributionManager} am
   */
  constructor (ytext, awareness, am) {
    /**
     * @type {Y.Type<{ text: true }>}
     */
    this.ytext = ytext
    this.awareness = awareness
    this.undoManager = new Y.UndoManager(ytext)
    this.am = am
  }
}
```

Generated type declaration (`/tmp/ycm/package/dist/src/y-sync.d.ts:9-17`):
```ts
constructor(ytext: Y.Type<{ text: true }>, ...);
ytext: Y.Type<{ text: true }>;
```

What `Y.Type<{ text: true }>` means at the TypeScript level — drilled through `lib0`:

`lib0/types/delta/delta.d.ts:953-963`:
```ts
export type DeltaConf = {
    name?: string | undefined;
    children?: fingerprintTrait.Fingerprintable;
    text?: boolean | undefined;
    attrs?: { [K: string]: ...; [K: number]: ...; } | undefined;
    recursiveChildren?: boolean | undefined;
    recursiveAttrs?: boolean | undefined;
};
```

`lib0/types/delta/delta.d.ts:973-975`:
```ts
export type DeltaConfGetText<Conf_1 extends DeltaConf> = 0 extends (1 & Conf_1)
    ? string
    : (Conf_1 extends { text: true; } ? string : never);
```

So `Y.Type<{ text: true }>` is a TypeScript constraint that says the parametrized DConf has `text: true`, which makes `DeltaConfGetText` resolve to `string` (otherwise `never`). It does NOT forbid `recursive: true` or `attrs: …` — DConf fields are orthogonal.

At runtime it's the same JS class regardless. Trace from `@y/y/src/index.js:23`:
```js
export { YType as Type, getTypeChildren, typeMapGetSnapshot, typeMapGetAllSnapshot, $ytype, $ytypeAny } from './ytype.js'
```
There is exactly one class: `YType`. `Y.Text`, `Y.XmlFragment`, `Y.XmlElement`, `Y.Map`, `Y.Array` no longer exist as separate classes — they're all the same polymorphic class. The factory is `ydoc.get(key, name)` (`@y/y/src/utils/Doc.js:197-203`):
```js
get (key = '', name = null) {
  return map.setIfUndefined(this.share, key, () => {
    const t = new YType(name)
    t._integrate(this, null)
    return t
  })
}
```
The `name` argument controls only the `_legacyTypeRef` flag (`ytype.js:682`). What you do to it (`.insert(0, 'foo')` vs `.insert(0, [delta])` vs `.setAttr('k','v')`) determines what content shape it holds; the type-config you assert is purely a TypeScript-side promise about how you'll use it.

YType configurations that satisfy `{ text: true }` from a TS perspective: `{text:true}`, `{text:true, attrs:{…}}`, `{text:true, recursive:true}`, `{text:true, recursive:true, attrs:{…}, name:'foo'}` — anything that has `text:true`.

**Migration impact: MECHANICAL** for the type signature itself; **REFACTOR** for the construction site since `ydoc.getText('source')` becomes `ydoc.get('source')` (no separate text/xmlfragment factories).

## Dim. 3 — The `string` cast at `y-sync.js:209`

Quoted exactly (`@y/codemirror@0.0.0-3/src/y-sync.js:208-211`):
```js
if (op.type === 'insert') {
  changes.push({ from: pos, to: pos, insert: /** @type {string} */ (op.insert) })
} else if (op.type === 'delete' && !skipDeletes) {
```

`op.insert` is iterated from `delta.children` (`y-sync.js:187`). The cast is a JSDoc-only `@type {string}` annotation — there is no runtime guard. The value is then handed to CodeMirror's `view.dispatch({ changes, … })` (`y-sync.js:250`), which routes it through `ChangeSet.of`. CodeMirror's `ChangeSpec` shape (`@codemirror/state/dist/index.d.ts:267`):
```ts
insert?: string | Text;
```

So if `op.insert` is anything other than a `string` (or a CM `Text` instance), CM either coerces via `String(value)` or throws inside `iterChanges`. For an array-shape insert (which is what tree YTypes emit on observe — see `lib0/delta.d.ts:587` where `insert<NewContent extends … | Array<…> | … | DeltaConfGetText<Conf>>`), the result is the literal string `"[object Object]"` getting written into CodeMirror, NOT a runtime crash. Either way the CM document goes out of sync with the YType after the first non-text insert.

The same observer also writes back the other direction (`y-sync.js:280-289`):
```js
update.changes.iterChanges((fromA, toA, fromB, toB, insert) => {
  const insertText = insert.sliceString(0, insert.length, '\n')
  ...
  d.apply(delta.create().retain(fromA + adj).insert(insertText))
  ...
})
ytext.applyDelta(d, this.conf.am)
```
So the binding only ever pushes string-typed delta ops down. It cannot consume tree-shape ops, and it cannot synthesize tree-shape ops. The contract is: the YType this binding sees holds only flat text insertions.

That's the same contract v1 holds (v1's observer at `src/y-sync.js:107-128` likewise treats `d.insert` as a string). v2 added `op.type` discrimination because lib0's new delta module is tagged-union-shaped, but the underlying flat-only assumption is unchanged.

**Migration impact: REWRITE** for any consumer that wanted to use this binding with a tree-shape YType. The cast is structural: the binding's entire algorithm only handles flat string ops. (This is the load-bearing fact for Dim. 8 — see below.)

## Dim. 4 — Sync algorithm

### Observer (Y → CM): structure changed, semantics same

v1 (`src/y-sync.js:107-125`):
```js
this._observer = (event, tr) => {
  if (tr.origin !== this.conf) {
    const delta = event.delta
    const changes = []
    let pos = 0
    for (let i = 0; i < delta.length; i++) {
      const d = delta[i]
      if (d.insert != null) {
        changes.push({ from: pos, to: pos, insert: d.insert })
      } else if (d.delete != null) {
        changes.push({ from: pos, to: pos + d.delete, insert: '' })
        pos += d.delete
      } else {
        pos += d.retain
      }
    }
    view.dispatch({ changes, annotations: [ySyncAnnotation.of(this.conf)] })
  }
}
```
Quill-style delta (`d.insert | d.delete | d.retain` discrimination by truthy field).

v2 (`src/y-sync.js:236-263`):
```js
this._observer = this._ytext.observe((event, tr) => {
  let delta = null
  if (tr.origin === this.conf && this.conf.am !== Y.noAttributionsManager) {
    const changes = Y.mergeIdSets([tr.insertSet, tr.deleteSet])
    delta = this._ytext.toDelta(this.conf.am, { itemsToRender: changes, retainInserts: true })
  } else if (tr.origin !== this.conf) {
    delta = event.getDelta(this.conf.am)
  }
  if (delta != null) {
    const { changes, decorations } = ydeltaToCmChanges(delta, tr.origin === this.conf)
    const dispatch = () => view.dispatch({ changes, annotations: [ySyncAnnotation.of(this.conf), yAttributionAnnotation.of(decorations)] })
    if (tr.origin === this.conf) { setTimeout(dispatch, 0) } else { dispatch() }
  }
})
this._onAttrChange = this.conf.am.on('change', (changes) => {
  ...
})
```

Key changes:
- `event.delta` → `event.getDelta(am)` (`@y/y/src/utils/YEvent.js:95-124`). The new API takes an attribution manager and produces an attribution-aware delta.
- Tagged-union ops (`op.type === 'insert' | 'delete' | 'retain'`) instead of truthy-field discrimination — see the `ydeltaToCmChanges` helper at `src/y-sync.js:177-218`.
- The observer ALSO fires on self-origin transactions when an attribution manager is configured, so it can add attribution decorations for inserts/deletes the user just made (`y-sync.js:241-243`). Self-origin dispatch is wrapped in `setTimeout(…, 0)` (`y-sync.js:251`) to escape the in-progress transaction.
- New `_onAttrChange` listener wires attribution-manager mutations into the editor (`y-sync.js:254-263`).

### Local edit dispatch (CM → Y): structure changed, semantics same

v1 (`src/y-sync.js:138-153`):
```js
ytext.doc.transact(() => {
  let adj = 0
  update.changes.iterChanges((fromA, toA, fromB, toB, insert) => {
    const insertText = insert.sliceString(0, insert.length, '\n')
    if (fromA !== toA) {
      ytext.delete(fromA + adj, toA - fromA)
    }
    if (insertText.length > 0) {
      ytext.insert(fromA + adj, insertText)
    }
    adj += insertText.length - (toA - fromA)
  })
}, this.conf)
```
Direct calls to `ytext.delete` / `ytext.insert`.

v2 (`src/y-sync.js:274-298`):
```js
;/** @type {Y.Doc} */ (ytext.doc).transact(tr => {
  let adj = 0
  const d = delta.create(delta.$delta({ text: true }))
  update.changes.iterChanges((fromA, toA, fromB, toB, insert) => {
    const insertText = insert.sliceString(0, insert.length, '\n')
    if (fromA !== toA) {
      d.apply(delta.create().retain(fromA + adj).delete(toA - fromA))
    }
    if (insertText.length > 0) {
      d.apply(delta.create().retain(fromA + adj).insert(insertText))
    }
    adj += insertText.length - (toA - fromA)
  })
  ytext.applyDelta(d, this.conf.am)
  const attributedDeletes = tr.meta.get('attributedDeletes')
  if (attributedDeletes != null) {
    const updateFix = this._ytext.toDelta(this.conf.am, { itemsToRender: attributedDeletes })
    const { changes, decorations } = ydeltaToCmChanges(updateFix, false)
    const dispatch = () => this.view.dispatch({ changes, annotations: [ySyncAnnotation.of(this.conf), yAttributionAnnotation.of(decorations)] })
    setTimeout(dispatch, 0)
  }
}, this.conf)
```
Builds a single `Delta` and calls `ytext.applyDelta(d, am)` (`@y/y/src/ytype.js:1078-1120`). Single call replacing per-edit `insert`/`delete`. Adds `attributedDeletes` post-pass that re-renders deletes the attribution manager kept as visible "tombstone" decorations.

**Migration impact: REFACTOR semantics, MECHANICAL surface.** Same end-to-end behavior for unattributed flows (which is what we have today). New code path activates when an attribution manager is non-default.

## Dim. 5 — Cursor handling

`y-remote-selections.js` is functionally identical between versions. Diffs:

| Concern | v1 | v2 | Diff |
| --- | --- | --- | --- |
| Y import | `import * as Y from 'yjs'` (`y-remote-selections.js:9`) | `import * as Y from '@y/y'` (`y-remote-selections.js:8`) | mechanical rename |
| Awareness import | implicit (any) | `import('@y/protocols/awareness').Awareness` typedef on `y-sync.js:82` | switches awareness package |
| Selection theme (`yRemoteSelectionsTheme`) | identical | identical | none |
| `YRemoteCaretWidget` class | identical | adds `@param {any} widget` JSDoc on `eq`/`compare` (`y-remote-selections.js:104,111`) | docs only |
| `YRemoteSelectionsPluginValue.constructor` | binds `_listener` then `_awareness.on('change', _listener)` | binds via assignment-from-`.on` (`y-remote-selections.js:134-139`) | minor: returned handle instead of stored function |
| `update()` body (cursor sync + decoration computation) | byte-identical to v2 | byte-identical | none |
| `Y.createRelativePositionFromTypeIndex` etc. | from `yjs` | from `@y/y` | mechanical rename only — same function signatures |

**Migration impact: MECHANICAL.** Pure import rename.

## Dim. 6 — Undo integration

Both files are functionally identical; the only meaningful change is removal of `lib0/mutex` and an idiom shift in event subscription.

v1 (`src/y-undomanager.js:7-77`):
```js
import { createMutex } from 'lib0/mutex'
…
this._mux = createMutex()

this._onStackItemAdded = ({ stackItem, changedParentTypes }) => { … }
this._onStackItemPopped = ({ stackItem }) => { … }
this._undoManager.on('stack-item-added', this._onStackItemAdded)
this._undoManager.on('stack-item-popped', this._onStackItemPopped)
```

v2 (`src/y-undomanager.js:8-97`):
```js
// no createMutex import
…
this._onStackItemAdded = this._undoManager.on('stack-item-added', ({ stackItem, changedParentTypes }) => { … })
this._onStackItemPopped = this._undoManager.on('stack-item-popped', ({ stackItem }) => { … })
```

Differences:
1. `lib0/mutex` import removed (`_mux` field unused in v1 anyway — dead code in v1, cleaned up in v2).
2. `.on('stack-item-added', cb)` now returns the listener handle directly, so `this._onStackItemAdded` IS the inline callback rather than a separately-bound function.
3. `destroy()` (`v2:109-113`) still calls `.off('stack-item-added', this._onStackItemAdded)` — so `lib0/observable.ObservableV2.on` must return the same handle in v2 that `.off` accepts. (`@y/y` re-exports `ObservableV2` from `lib0/observable`; semantics preserved.)
4. `Y.UndoManager` itself moves from `yjs` to `@y/y` — both export the same constructor signature (`new Y.UndoManager(yt, opts?)`), so the `addTrackedOrigin` / `removeTrackedOrigin` / `undo` / `redo` API surface from `YUndoManagerConfig` (`y-undomanager.js:9-43`) is unchanged.
5. `yUndoManagerKeymap` (`y-undomanager.js:145-149`) is byte-identical.

**Migration impact: MECHANICAL.** Pure import rename + dead-mutex cleanup.

## Dim. 7 — Awareness integration

Both versions take `awareness` as a constructor arg and gate the remote-selections plugin set on its truthiness:
- v1 `src/index.js:26-31`
- v2 `src/index.js:27-32`

Identical control flow. The only diff is the type of `awareness`:
- v1: `any` (`src/index.js:15` JSDoc)
- v2: `import('@y/protocols/awareness').Awareness` (`src/y-sync.js:82` typedef)

Runtime contract — `awareness.on('change', cb)`, `awareness.getStates()`, `awareness.setLocalStateField(k, v)`, `awareness.getLocalState()`, `awareness.doc.clientID` — is identical (compare `y-remote-selections.js:128-180` v1 vs `y-remote-selections.js:131-182` v2).

**Migration impact: MECHANICAL.** Awareness package rename (`y-protocols` → `@y/protocols`); same API.

## Dim. 8 — Dual-view feasibility deep-dive

**Question:** Can ONE `Y.Type` instance be passed to BOTH `@y/prosemirror` `syncPlugin` AND `@y/codemirror` `YSyncConfig`?

### Type-system answer (the easy part)

Both bindings accept a generically-parametrized YType:
- `@y/codemirror`: `Y.Type<{ text: true }>` (`y-sync.js:81`)
- `@y/prosemirror` (modern, `index.js:70`): `Y.XmlFragment` (`@param {Y.XmlFragment} ytype`). Tracing — `Y.XmlFragment` is an alias of `YType<{name:string, attrs:Record<string,any>, text:true, recursive:true}>` (the alias is bound by `$prosemirrorDelta` at `index.js:17`).
- `@y/prosemirror` (legacy, `plugins/sync-plugin.js:99`): also `Y.XmlFragment`.

A type that satisfies `{ text:true, recursive:true, attrs:…, name:string }` ALSO satisfies `{ text:true }` — DConf fields are additive (see `lib0/delta.d.ts:973-975` — `DeltaConfGetText` only checks `text:true`, ignores other fields). TypeScript will accept passing the same YType reference into both constructors.

### Runtime answer (the hard part)

The TS contract is purely structural; at runtime there is one `YType` class (`@y/y/src/ytype.js:637`). What matters is: does the SAME YType emit observe events in BOTH a flat-string-shape AND a tree-shape representation, simultaneously?

`YEvent.getDelta(am)` (`@y/y/src/utils/YEvent.js:95-124`) calls `this.target.toDelta(am, …)` (`ytype.js:831` declared, body at `ytype.js:917+`). The shape of the produced delta depends on the YType's actual content:
- If you've called `yt.insert(0, "hello")` (string content, written via `ContentString`), `toDelta` emits `op.insert: string`.
- If you've called `yt.insert(0, [childYType])` (array of YTypes, written via `ContentType`), `toDelta` emits `op.insert: [childDelta]`.
- A YType can hold a MIX — some `ContentString` items, some `ContentType` items — and `toDelta` walks them in order, emitting whichever shape each item carries.

So at any single observe firing, `event.getDelta()` will produce a single delta whose `children` array contains heterogeneous `op.insert` types: some strings, some arrays-of-deltas.

**This is the load-bearing detail.** Now overlay the @y/codemirror observer (`y-sync.js:209`):
```js
if (op.type === 'insert') {
  changes.push({ from: pos, to: pos, insert: /** @type {string} */ (op.insert) })
}
```
There is no branch for `op.insert` being an array. CodeMirror gets handed a non-string and silently coerces to `"[object Object]"`. The CM document drifts permanently from the YType.

And the @y/prosemirror observer (`index.js:101-145`) consumes events via `event.deltaDeep` (`index.js:107`) which returns the recursive form. Its handler walks ProseMirror nodes assuming a tree-shape delta — string `op.insert` values that aren't structured as expected would crash the `deltaToPSteps` walker (`index.js:350`) when it reaches `else if (delta.$textOp.check(op))` and fails the schema mark/text reconstruction.

**Conclusion:** The two bindings are **mutually exclusive on the same YType instance** at runtime, even though TS will let you pass the same reference. A YType used for PM cannot have its observe events safely consumed by CM's binding, and vice versa. The DConf type parameter is a one-way promise — it constrains what YOU put in, but it doesn't constrain what observe events look like (those reflect actual content shape).

### What the translation layer would need to be

**Option A — fork @y/codemirror to consume tree deltas.**

Surgical change at `src/y-sync.js:209`:

```js
if (op.type === 'insert') {
  // accept either string (legacy) or tree-shape ([Delta, …])
  const insertStr = typeof op.insert === 'string'
    ? op.insert
    : flattenTreeInsertToMarkdown(op.insert)  // user-provided projection
  changes.push({ from: pos, to: pos, insert: insertStr })
}
```

But that only fixes the inbound side. The outbound side (`src/y-sync.js:274-298`) builds `ytext.applyDelta(d, am)` where `d` is `delta.$delta({ text: true })` — a flat-only delta config. Applying a flat-text delta to a tree YType would either be rejected by `applyDelta` (`ytype.js:1078-1120`) or would inject `ContentString` items at the root level alongside existing `ContentType` items, producing a malformed tree.

To make the outbound side work, the binding would need to:
1. Receive a CM diff (range fromA→toA, insertText).
2. Project that range into the tree YType's coordinate space (i.e., locate which leaf YType holds offset fromA, recurse down).
3. Apply the edit into that leaf, not into the root.

That's not a fork — that's a reimplementation. Estimated LOC for a surgical "string-only inbound shim" (no outbound support): ~30 lines added, ~10 modified, all inside `src/y-sync.js`. For a full bidirectional tree-aware binding: this is a from-scratch design exercise that subsumes flatten+rehydrate for every edit.

**Option B — fork @y/prosemirror to project tree onto a flat-text projection.**

Same shape of problem, mirrored. PM's `index.js:189` calls `ytype.applyDelta(d, attributionManager)` with a tree-shape delta produced by `trToDelta(tr)` (`index.js:457-466`). To keep the YType flat-string-shaped you'd have to serialize the tree delta to markdown (or HTML, or some flat projection) before applyDelta, and reverse it on observe.

This is exactly what Open Knowledge already does at the application layer with `applyAgentMarkdownWrite` (`packages/server/src/agent-sessions.ts`) — compose at markdown level, apply via `updateYFragment`, mirror via `applyFastDiff`. Pulling that into the @y/prosemirror binding itself would mean inlining a markdown round-trip inside the sync plugin.

Estimated LOC: this is a reimplementation of @y/prosemirror, not a fork.

**Option C — TWO YTypes (one tree, one flat) with a bridge between them.**

This is exactly the architecture in production today: `Y.XmlFragment('default')` for PM, `Y.Text('source')` for CM, with `setupServerObservers()` (`packages/server/src/server-observers.ts`) bridging via Observer A (`XmlFragment → Y.Text`, `OBSERVER_SYNC_ORIGIN`) and Observer B (`Y.Text → XmlFragment`).

Under @y/y this becomes: `ydoc.get('default')` (a YType with `name=null` → XmlFragment-shaped) and `ydoc.get('source')` (a YType with `name=null` but whose contents are written as flat strings). Same two-CRDT shape as today; the bridge code is unchanged in algorithm. The only differences:
- CRDT `transaction.origin` discipline still applies (precedent #1: `LocalTransactionOrigin` objects).
- The `applyFastDiff` / `mergeThreeWay` paths still work because `YType.insert(idx, str)` and `YType.delete(idx, len)` still exist (`ytype.js:1227-1281`) — same names, same shapes.

**Conclusion:** Dual-view binding on a SINGLE YType is **not achievable today with stock @y/* packages**. The CM binding's flat-string assumption is structural (Dim. 3). Forking either side to bridge representations is more work than the two-CRDT bridge that already exists. The current dual-CRDT architecture in Open Knowledge **remains the right shape under @y/y** — Yjs 14 doesn't change the calculus.

## Dim. 9 — Equivalent of `chunkedYTextInsert`

Today (planned per `specs/2026-04-16-clipboard-mdast-canonical/SPEC.md` FR-21; not yet implemented in code per repo grep):
```js
ytext.insert(idx, str)  // looped with progress yielding
```

Under @y/y, the equivalent primitive exists with the same name and signature on the unified YType (`@y/y/src/ytype.js:1227-1229`):
```js
insert (index, content, format) {
  this.applyDelta(delta.create().retain(index).insert(/** @type {any} */ (content), format).done())
}
```

Note the implementation: under the hood, every `insert` call constructs a one-op delta and routes through `applyDelta`, which itself opens a transaction (`ytype.js:1083`). For chunked insertion, batching the chunks into ONE delta and ONE `applyDelta` call would be more CRDT-efficient than v1's repeated `insert()` calls — but the v1-shape repeated-call pattern still works because `applyDelta` enters `transact(this.doc, ...)`, which nests inside an outer `doc.transact()` if one is open.

Idiom under v2:
```js
ydoc.transact(() => {
  for (const chunk of chunks) {
    ytext.insert(idx, chunk)
    idx += chunk.length
  }
}, originObject)
```

**Migration impact: DROP-IN.** Same call name, same signature. Optionally tighten to `applyDelta(builtDelta)` for fewer transaction-nesting roundtrips.

## Dim. 10 — Relative positions

v1 (`yjs`):
```js
Y.createRelativePositionFromTypeIndex(ytext, pos, assoc)
Y.createAbsolutePositionFromRelativePosition(rpos, ydoc)
Y.createRelativePositionFromJSON(json)
Y.relativePositionToJSON(rpos)
Y.compareRelativePositions(a, b)
```
All exported from `yjs`.

v2 (`@y/y`) — exported from `@y/y/src/index.js:14`:
```js
export {
  createRelativePositionFromTypeIndex,
  createRelativePositionFromJSON,
  createAbsolutePositionFromRelativePosition,
  compareRelativePositions,
  AbsolutePosition,
  RelativePosition,
  relativePositionToJSON,
  encodeRelativePosition,
  decodeRelativePosition
} from './utils/RelativePosition.js'
```

Same names, same signatures. Diff is purely the import root. Even the `@y/codemirror` binding uses them unchanged (`y-sync.js:122-130`):
```js
toYPos (pos, assoc = 0) {
  return Y.createRelativePositionFromTypeIndex(this.ytext, pos, assoc)
}
fromYPos (rpos) {
  const pos = Y.createAbsolutePositionFromRelativePosition(
    Y.createRelativePositionFromJSON(rpos),
    /** @type {Y.Doc} */ (this.ytext.doc)
  )
  ...
}
```
Identical to v1's `y-sync.js:41-49`.

**Migration impact: MECHANICAL.** Pure import rename.

## Dim. 11 — peerDeps comparison

| Field | v1 (`y-codemirror.next@0.3.5`) | v2 (`@y/codemirror@0.0.0-3`) |
| --- | --- | --- |
| `name` | `y-codemirror.next` | `@y/codemirror` |
| `version` | `0.3.5` | `0.0.0-3` |
| `peerDependencies.@codemirror/state` | `^6.0.0` | `^6.5.2` |
| `peerDependencies.@codemirror/view` | `^6.0.0` | `^6.38.6` |
| `peerDependencies.yjs` | `^13.5.6` | — (removed) |
| `peerDependencies.@y/y` | — | `^14.0.0-22` |
| `peerDependencies.@y/protocols` | — | `^1.0.6-3` |
| `dependencies.lib0` | `^0.2.42` | `^1.0.0-0` |

Side-by-side `peerDependencies` block:

v1 (`node_modules/y-codemirror.next/package.json:52-56`):
```json
"peerDependencies": {
  "@codemirror/state": "^6.0.0",
  "@codemirror/view": "^6.0.0",
  "yjs": "^13.5.6"
},
"dependencies": {
  "lib0": "^0.2.42"
}
```

v2 (`/tmp/ycm/package/package.json:52-60`):
```json
"peerDependencies": {
  "@codemirror/state": "^6.5.2",
  "@codemirror/view": "^6.38.6",
  "@y/protocols": "^1.0.6-3",
  "@y/y": "^14.0.0-22"
},
"dependencies": {
  "lib0": "^1.0.0-0"
}
```

Notable for adoption planning:
- `lib0` jumps from `0.x` to `1.x` — major across the entire @y/* stack. lib0 1.x is a coordinated breaking change (`delta` module is new, `mutex` is gone, `observable.ObservableV2.on` returns a handle, etc.). Mixing 0.x and 1.x in the same install will produce duplicate-singleton bugs (the `__ $YJS14$ __` guard at `@y/y/src/index.js:46-63` flags this).
- `@y/protocols` is a hard peer — adoption requires also moving awareness, updates, sync to `@y/protocols`. (Today Open Knowledge depends on `y-protocols@^1.0.6` — the `@y/protocols` repackage version.)
- CM6 minimum bumped to `6.5.2` / `6.38.6`. Open Knowledge currently has `@codemirror/view@^6.42.0` per `packages/app/package.json` — well above the floor.

**Migration impact: REFACTOR.** lib0 1.x and the @y/* package family must move as a coordinated unit; partial adoption is not viable.

## Summary impact table

| Dim. | Concern | Classification |
| --- | --- | --- |
| 1 | Entry-point API + `attributionManager` arg | REFACTOR |
| 2 | YType acceptance / construction | REFACTOR |
| 3 | Hard `string` cast at observer | (load-bearing for Dim. 8) |
| 4 | Sync algorithm shape | REFACTOR semantics, MECHANICAL surface |
| 5 | Cursor handling | MECHANICAL |
| 6 | Undo integration | MECHANICAL |
| 7 | Awareness integration | MECHANICAL |
| 8 | Dual-view binding (one YType drives both PM + CM) | NOT-ACHIEVABLE w/ stock packages; needs FORK or two-CRDT bridge (status quo) |
| 9 | Chunked insert primitive | DROP-IN |
| 10 | Relative positions | MECHANICAL |
| 11 | peerDeps | REFACTOR (coordinated lib0 + @y/* family bump) |

## Critical-question answers

**1. Is dual-view binding (PM + CM on same YType) achievable with stock @y/* today?**
No. The `@y/codemirror` binding's observer assumes flat-string `op.insert` (`y-sync.js:209` cast + 4-branch op switch with no array-insert branch). The `@y/prosemirror` binding's observer consumes `event.deltaDeep` and synthesizes tree-shaped deltas via `trToDelta` (`@y/prosemirror/src/index.js:457`). Both bindings WRITE to the YType in their own representation; pointing both at one YType produces interleaved heterogeneous content that neither side's observer can consume safely.

**2. If forking is needed, what's the surgical change?**
There is no single-line surgical fix. The minimum is:
- `@y/codemirror/src/y-sync.js:209` add an array-insert branch that flattens nested `op.insert` to a string (caller-supplied projection function).
- `@y/codemirror/src/y-sync.js:274-298` reroute outbound CM diffs to a tree-aware `applyDelta` that locates the right leaf YType. This is not a flatten — it's a fundamentally different algorithm.

Even with both surgeries, the shared YType ends up with mixed `ContentString` and `ContentType` items, and `toDelta` walks them in order — producing heterogeneous observe deltas that defeat both bindings' incrementality assumptions. **Estimated cost of a real fork: equivalent to writing a new binding from scratch.** The existing two-CRDT bridge (Observer A/B in `server-observers.ts`) is already the smaller change.

**3. Could we use TWO YTypes with a bridge — and how is that different from today?**
Same shape as today. Under @y/y the bridge becomes:
- `ydoc.get('default')` — YType holding tree-shape content for PM (`@y/prosemirror` syncPlugin attaches here).
- `ydoc.get('source')` — YType holding flat-string content for CM (`@y/codemirror` yCollab attaches here).
- Server observers (`server-observers.ts`) bridge them, unchanged in algorithm. Origins still typed (`OBSERVER_SYNC_ORIGIN` per precedent #1).
- `Y.UndoManager`, `Y.RelativePosition`, `applyFastDiff` (DMP), `mergeThreeWay` — all still work because the underlying `YType.insert/delete/applyDelta` API is preserved (`@y/y/src/ytype.js:1227-1281`).

Differences from today:
- `ydoc.getXmlFragment` / `ydoc.getText` factories don't exist; everything is `ydoc.get(key)` (Doc.js:197).
- `Y.UndoManager({ trackedOrigins })` still takes object refs; precedent #1 still applies.
- The `applyFastDiff` (DMP `diff_main`) path Open Knowledge depends on (`packages/server/src/server-observers.ts` Observer A path) is unaffected — it's a string-level algorithm.
- `event.delta` is replaced by `event.getDelta(am)` / `event.deltaDeep` getters — needs callsite refactor wherever client/server observers consume events.

In other words: the dual-CRDT bridge IS the answer under both Yjs 13 and Yjs 14. The Yjs 14 migration doesn't make it cheaper to collapse into a single CRDT; it preserves the same two-CRDT shape with a renamed factory.

## Cross-references

- `packages/app/src/editor/SourceEditor.tsx:27,28,65` — current binding callsite.
- `packages/server/src/server-observers.ts` — dual-CRDT bridge that would be preserved across migration.
- `packages/server/src/agent-sessions.ts:60-113` — `applyAgentMarkdownWrite` (XmlFragment-authoritative pattern, precedent #10/#12) — pattern unchanged under @y/y.
- `specs/2026-04-15-server-authoritative-observer-bridge/` — single-writer bridge architecture; same shape under @y/y.
- `CLAUDE.md` precedent #11 (minimize CRDT mutation in sync bridges), #14 (cross-CRDT sync is single-writer, server-side) — both still binding under @y/y.
- `reports/peritext-on-yjs-feasibility/evidence/refresh-2026-04-16-option-B-loro-blast-radius.md` — references the planned `chunkedYTextInsert` (Dim. 9) which becomes a one-line port.

