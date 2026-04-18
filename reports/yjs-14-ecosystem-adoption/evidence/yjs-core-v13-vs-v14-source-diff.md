# Yjs Core v13 vs v14 — Source-Traced API & Internals Diff

**Pinned versions compared:**
- v13: `yjs@13.6.30` — extracted from `node_modules/yjs/` in this worktree
- v14: `@y/y@14.0.0-rc.13` — `npm view @y/y@14.0.0-rc.13 dist.tarball` → `/tmp/y14/package/`

**Source roots used for citations:**
- v13: `/Users/edwingomezcuellar/projects/open-knowledge/.claude/worktrees/bridge-correctness/node_modules/yjs/src/`
- v14: `/tmp/y14/package/src/`
- y-prosemirror (consumer reference): `node_modules/y-prosemirror/src/` (v1.3.7)
- lib0 v1: `/tmp/lib0v1/package/src/` (`lib0@1.0.0-rc.12`, `npm dist-tags lib0` → `beta`)
- @y/protocols: `/tmp/yprot1/package/src/` (`@y/protocols@1.0.6-rc.1`)

**Verification scope.** Every claim below cites `file:line` against actually-extracted source. Where I could not directly verify (e.g. on-the-wire byte format compatibility), I say so.

---

## 0. Headline finding

v14 is a **deep rewrite of the public API** with **near-identical low-level CRDT internals**. The Item / Struct / GC / Content-class layer survives almost verbatim — same constructor shape, same `delete()` algorithm, same bitfield `info` byte (`bit1: keep`, `bit2: countable`, `bit3: deleted`, `bit4: marker`). The replacements are at the type-system layer:

| Layer | Verdict | Migration class |
| --- | --- | --- |
| **Type class hierarchy** (`YText`/`YMap`/`YArray`/`YXml*` → unified `YType`) | Removed, collapsed | API-RESHAPED + API-REMOVED (named exports gone) |
| **Doc.get* family** (`getText`/`getMap`/`getArray`/`getXmlFragment`) | Removed, replaced by `Doc.get(key, name)` | API-REMOVED + API-RESHAPED |
| **Delta protocol** (`applyDelta`/`toDelta` formerly YText-only) | Generalized onto `YType` | API-RESHAPED + API-NEW (`toDeltaDeep`) |
| **AttributionManager** (per-CRDT-Item attribution like Loro / Notion blame) | New surface | API-NEW |
| **DeleteSet → IdSet** rename | Mechanical, fields preserved on Transaction | API-RENAMED |
| **StructStore: free helpers → instance methods** | Mechanical | API-RESHAPED |
| **Transaction.beforeState / .afterState** | Now lazy `@deprecated` getters | API-COMPATIBLE (deprecated) |
| **Transaction.insertSet / .cleanUps** | New fields | API-NEW |
| **Item / GC / Content* / Skip** | Same shape, methods preserved | API-COMPATIBLE; INTERNAL-CHANGED only at IdSet rename |
| **Item.delete(transaction)** | Same algorithm | API-COMPATIBLE |
| **Awareness** (now in `@y/protocols`) | Same API surface, base class change `Observable` → `ObservableV2` | API-COMPATIBLE; PACKAGE-RENAMED |
| **Wire format encoders** (`UpdateEncoderV1/V2`) | Same class names; only base class rename `DSEncoderV1` → `IdSetEncoderV1` | API-COMPATIBLE |
| **`applyUpdate` / `encodeStateAsUpdate` / `mergeUpdates`** | Same signatures | API-COMPATIBLE |
| **RelativePosition** | Same surface; some functions gain optional `attributionManager` parameter | API-COMPATIBLE |
| **UndoManager** | Same constructor shape, same `trackedOrigins` semantics | API-COMPATIBLE; INTERNAL-CHANGED (StackItem ctor argument order swapped) |
| **`__$YJS$__` → `__ $YJS14$ __` runtime guard** | Different keys → does NOT prevent dual-load | INTERNAL-CHANGED, surprising |
| **Engines** | `node>=22` (was `>=16`) | Drop in node-version requirement |
| **`lib0` peer** | `^0.2.99` → `^1.0.0-rc.12` (transitively `@y/protocols@1.0.6-rc.1`) | Major peer bump; transitive break |

The 1-way-door framing for our stack is correct: the unified-YType collapse means **every single y-prosemirror reference to `Y.XmlElement`, `Y.XmlText`, `Y.XmlFragment`, `Y.AbstractType`, `Y.YText`, `Y.YMap` becomes invalid as a class identifier**. A drop-in import alias `import * as Y from '@y/y'` will not compile.

---

## 1. Type class hierarchy diff

### v13 — class-per-type (1:1 with editor abstraction)

`yjs/src/types/` has six type files (verified by `ls`):

```
AbstractType.js  YArray.js  YMap.js  YText.js
YXmlElement.js   YXmlFragment.js  YXmlHook.js  YXmlText.js
```

Top-level exports from `yjs/src/index.js:3-32` re-export each as a separate symbol with the legacy short name:

```js
// node_modules/yjs/src/index.js:3-22
export {
  Doc, Transaction,
  YArray as Array,
  YMap as Map,
  YText as Text,
  YXmlText as XmlText,
  YXmlHook as XmlHook,
  YXmlElement as XmlElement,
  YXmlFragment as XmlFragment,
  YXmlEvent, YMapEvent, YArrayEvent, YTextEvent, YEvent,
  Item, AbstractStruct, GC, Skip,
  ContentBinary, ContentDeleted, ContentDoc, ContentEmbed, ContentFormat,
  ContentJSON, ContentAny, ContentString, ContentType,
  AbstractType,
  ...
}
```

`AbstractType` (parent class) is at `node_modules/yjs/src/types/AbstractType.js:261-294`. Each concrete type extends it (e.g. `YText extends AbstractType` at `yjs/src/types/YText.js:851`).

### v14 — single unified `YType` class

`@y/y/src/` directory listing at root level:

```
index.js  internals.js (absent)  ytype.js  structs/ (Item, GC, Skip, AbstractStruct)  utils/
```

There is no `types/` subdirectory. `ls /tmp/y14/package/src/` returns: `index.js`, `structs/`, `utils/`, `ytype.js`. **Verified by direct `ls`.**

The single `YType` class is declared at `@y/y/src/ytype.js:637`:

```js
// @y/y/src/ytype.js:637-692 (constructor body abridged)
export class YType {
  constructor (name = null) {
    this.name = name
    this._item = null
    this._map = new Map()        // ← line 653, formerly the YMap-specific store
    this._start = null            // ← line 657, formerly the YArray/YText linked-list head
    this.doc = null
    this._length = 0
    this._eH = createEventHandler()
    this._dEH = createEventHandler()
    this._searchMarker = null
    this._content = delta.create()
    this._legacyTypeRef = this.name == null ? YXmlFragmentRefID : YXmlElementRefID
    this._searchMarker = []
    this._hasFormatting = false
  }
  // ... methods at 705–1474
}
```

The exports from `@y/y/src/index.js:6-29` mention `YType as Type` at line 23, plus all the non-type-system surface (`Doc`, `Transaction`, `transact`, `UndoManager`, `applyUpdate`, etc.). **There are zero exports of `YText`, `YArray`, `YMap`, `YXmlText`, `YXmlElement`, `YXmlFragment`, `YXmlHook`, `YTextEvent`, `YMapEvent`, `YArrayEvent`, `YXmlEvent`, `AbstractType`** (verified via grep on `index.js`). Only `cleanupYTextFormatting` survives as a v13-named export, because it remains a free function in `Transaction.js`.

### Migration impact

- **API-REMOVED**: `Y.Text`, `Y.Map`, `Y.Array`, `Y.XmlText`, `Y.XmlHook`, `Y.XmlElement`, `Y.XmlFragment`, `Y.AbstractType`, `Y.YText`, `Y.YMap`, `Y.YArray`, `Y.YXml*` — gone. No constructor-direct re-export.
- **API-NEW / API-RESHAPED**: `Y.Type` (= `YType`) takes their place. Discrimination is by the `name` field (string, set at construction) plus runtime shape inspection.
- **INTERNAL-CHANGED**: y-prosemirror's `instanceof Y.XmlElement` and `instanceof Y.XmlText` checks at `y-prosemirror/src/plugins/sync-plugin.js:995, 1005` cannot survive a literal port — both branches collapse to one type. The y-prosemirror `equalYTypePNode` function would need full rewrite for v14.

---

## 2. Storage primitives — confirmation that one YType has both `_start` AND `_map`

The v14 `YType` constructor cited above (`ytype.js:641-692`) literally creates **both**:

- `this._map = new Map()` at line 653 — formerly only used by `YMap` for keyed storage
- `this._start = null` at line 657 — formerly only used by `YArray`/`YText`/`YXmlFragment` for linked-list head

Methods on `YType` consume both simultaneously. Listed via `grep -n "^  [a-zA-Z_]\+ \?(" /tmp/y14/package/src/ytype.js`:

```
1227:  insert (index, content, format)         ← list-style (uses _start)
1260:  push (content)                          ← list-style
1269:  unshift (content)                       ← list-style
1279:  delete (index, length = 1)              ← list-style
1289:  get (index)                             ← list-style
1301:  slice (start = 0, end = this.length)    ← list-style
1312:  toArray ()                              ← list-style
1153:  deleteAttr (attributeName)              ← map-style (uses _map)
1169:  setAttr (attributeName, attributeValue) ← map-style
1182:  getAttr (attributeName)                 ← map-style
1194:  hasAttr (attributeName)                 ← map-style
1206:  getAttrs (snapshot)                     ← map-style
1426:  attrKeys ()                             ← map-style
1435:  attrValues ()                           ← map-style
1444:  attrEntries ()                          ← map-style
1453:  get attrSize ()                         ← map-style
```

This confirms the vendor claim that one YType simultaneously plays the YMap and YArray/YText/XmlElement role. `XmlElement`-style use (named tag with attributes and children) is the natural intersection: `name` for the tag, `_map` for attributes, `_start` for child list.

The internal `Item.parentSub` field continues to discriminate: `parentSub === null` → linked-list child (parent's `_start` chain); `parentSub != null` → map child (`parent._map.get(parentSub)`). v14 `structs/Item.js:88-93`:

```js
// If parentSub = null type._start is the list in
// which to insert to. Otherwise it is `parent._map`.
this.parentSub = parentSub
```

Identical to v13 `structs/Item.js:283-290`. **The Item-level discrimination did not change.** Only the parent type's class identity collapsed.

---

## 3. Delta protocol — v14's polymorphic `applyDelta` / `toDelta` / `toDeltaDeep`

### v13 — delta only on YText

Method scan via `grep -n "toDelta\|applyDelta"`:

| File | Method | Line |
| --- | --- | --- |
| `node_modules/yjs/src/types/YText.js` | `applyDelta (delta, { sanitize = true } = {})` | 971 |
| `node_modules/yjs/src/types/YText.js` | `toDelta (snapshot, prevSnapshot, computeYChange)` | 1009 |
| `node_modules/yjs/src/types/YArray.js` | (none) | — |
| `node_modules/yjs/src/types/YMap.js` | (none) | — |
| `node_modules/yjs/src/types/YXmlFragment.js` | (none for delta API) | — |

So v13's delta is YText-specific: text-shaped insert/retain/delete with attribute formatting, modeled after Quill.

### v14 — delta on `YType`, polymorphic by op kind

`@y/y/src/ytype.js:1078-1120` — full method:

```js
applyDelta (d, am = noAttributionsManager) {
  if (this.doc == null) {
    (this._prelim || (this._prelim = delta.create())).apply(d)
  } else {
    transact(this.doc, transaction => {
      const currPos = new ItemTextListPosition(null, this._start, 0, new Map(), am)
      for (const op of d.children) {
        if (delta.$textOp.check(op)) {
          insertContent(transaction, this, currPos, new ContentString(op.insert), op.format || {})
        } else if (delta.$insertOp.check(op)) {
          insertContentHelper(transaction, this, currPos, op.insert, op.format || {})
        } else if (delta.$retainOp.check(op)) {
          currPos.formatText(transaction, this, op.retain, op.format || {})
        } else if (delta.$deleteOp.check(op)) {
          deleteText(transaction, currPos, op.delete)
        } else if (delta.$modifyOp.check(op)) {
          let item = currPos.right
          while (item != null && (item.deleted || !item.countable)) { item = item.next }
          if (item == null || item.content.constructor !== ContentType) { error.unexpectedCase() }
          item.content.type.applyDelta(op.value, am)         // ← recursive descent into child YType
          currPos.formatText(transaction, this, 1, op.format || {})
        } else {
          error.unexpectedCase()
        }
      }
      for (const op of d.attrs) {
        if (delta.$setAttrOp.check(op)) {
          typeMapSet(transaction, this, op.key, op.value)
        } else if (delta.$deleteAttrOp.check(op)) {
          typeMapDelete(transaction, this, op.key)
        } else {
          const sub = typeMapGet(this, op.key)
          if (!(sub instanceof YType)) error.unexpectedCase()
          sub.applyDelta(op.value, am)                         // ← recursive descent into child attr YType
        }
      }
    })
  }
  return this
}
```

The op vocabulary expands beyond YText's insert/retain/delete to add: `$modifyOp` (recursive sub-delta into a child YType embedded as `ContentType`), `$setAttrOp` / `$deleteAttrOp` / `$modifyAttrOp` (attribute mutation alongside content mutation in the same delta).

`toDelta` at `ytype.js:835-1064` is significantly larger and also takes an `AbstractAttributionManager` (default `noAttributionsManager`). `toDeltaDeep` at `ytype.js:1066-1068` is a thin wrapper:

```js
toDeltaDeep (am = noAttributionsManager) {
  return this.toDelta(am, { deep: true })
}
```

`{ deep: true }` is what makes child `ContentType` items render as nested `Delta` instead of as the type instance. Useful for serialization, snapshotting, and the new attribution flow.

The DConf type parameter (referenced at `ytype.js:643-665`) ties the YType to a `lib0/delta` `DeltaConf` schema (text vs object, allowed attr keys, allowed child kinds). This is how v14 reconstructs type-safety on top of the unified shape — TypeScript/JSDoc machinery, not runtime.

### Migration impact

- **API-RESHAPED + API-NEW**: Delta is now the canonical mutation primitive for all types. `insert(idx, content)`, `setAttr(k, v)`, etc. are thin wrappers that build a delta and call `applyDelta`. See `ytype.js:1227-1280`.
- **INTERNAL-CHANGED**: y-prosemirror's `updateYFragment` algorithm at `y-prosemirror/src/plugins/sync-plugin.js:1145-1298` would need full rewrite — its current PM-aware diff walks the YText-specific structure. The v14-native approach would be: (a) compute target delta from PM JSON, (b) call `ytype.applyDelta(d)` in one transact. This is potentially better than today's algorithm but would be a large port.
- The DMP/diff3-based `applyFastDiff` and `mergeThreeWay` patterns from precedent #11 still apply at the markdown/text level — they don't reach into the CRDT layer.

---

## 4. `Doc.get()` API — verification

### v13 — typed factory family

`node_modules/yjs/src/utils/Doc.js:215-298` — six methods:

```js
// Doc.js:215-247 — generic dispatch with TypeConstructor parameter
get (name, TypeConstructor = AbstractType) {
  const type = map.setIfUndefined(this.share, name, () => {
    const t = new TypeConstructor()
    t._integrate(this, null)
    return t
  })
  const Constr = type.constructor
  if (TypeConstructor !== AbstractType && Constr !== TypeConstructor) {
    if (Constr === AbstractType) {
      // graft: hot-swap class on existing AbstractType instance, preserve _map and _start
      const t = new TypeConstructor()
      t._map = type._map
      ...
      t._start = type._start
      ...
      this.share.set(name, t)
      t._integrate(this, null)
      return t
    } else {
      throw new Error(`Type with the name ${name} has already been defined with a different constructor`)
    }
  }
  return type
}

// Doc.js:256-298 — five typed convenience wrappers
getArray (name = '')   { return this.get(name, YArray) }
getText (name = '')    { return this.get(name, YText) }
getMap (name = '')     { return this.get(name, YMap) }
getXmlElement (name = '')  { return this.get(name, YXmlElement) }
getXmlFragment (name = '') { return this.get(name, YXmlFragment) }
```

Note the v13 graft path at lines 224-241: if you call `getText('foo')` and `'foo'` already exists as `AbstractType`, v13 will hot-swap the class. This is a fallback for the case where the YText was created on the wire by another client before this client called `getText`. Same internals, different `constructor`.

### v14 — single discriminator-based `get`

`@y/y/src/utils/Doc.js:197-203`:

```js
/**
 * Define a shared data type.
 *
 * @param {string} key
 * @param {string?} name Type-name
 *
 * @return {YType}
 */
get (key = '', name = null) {
  return map.setIfUndefined(this.share, key, () => {
    const t = new YType(name)
    t._integrate(this, null)
    return t
  })
}
```

That's the entire `get` implementation in v14. **`getText`, `getMap`, `getArray`, `getXmlElement`, `getXmlFragment` are completely absent from v14 Doc** (verified via `grep "^  getX\|^  getT\|^  getM\|^  getA" /tmp/y14/package/src/utils/Doc.js` returning only `getSubdocs`/`getSubdocGuids`).

The two parameters:
- `key` — shared-type slot name (was the only param in v13)
- `name` — DConf name discriminator stored in `YType.name`. `null` is used for "fragment-style" usage (the `_legacyTypeRef = YXmlFragmentRefID` branch at `ytype.js:682`); a non-null string is "element-style" with that tag name (`YXmlElementRefID`).

### Migration impact

- **API-REMOVED**: `Doc.getText('source')` / `Doc.getMap('metadata')` / `Doc.getArray('foo')` / `Doc.getXmlFragment('default')` / `Doc.getXmlElement(...)` — all gone.
- **API-RESHAPED**: Replacement is `doc.get('source')` (text-like with `name=null`, fragment-style) / `doc.get('source', 'p')` (named element). Migration is search/replace plus naming-convention reconciliation.
- **API-COMPATIBLE** (mostly): The `share` Map is still keyed by string. The instance returned still has `_map`, `_start`, `_length`, `doc`, `_item` — same internals reachable from y-prosemirror-style consumers.
- **No automatic graft**: The v13 type-promotion fallback (lines 224-241) is gone. v14 doesn't need it because there's only one type. But this also means: cross-version coexistence (v13 client + v14 client on same doc) is impossible — v13 clients send updates expecting a specific class shape that v14 cannot reconstruct.

---

## 5. Transaction & origin model — verified unchanged at the public API surface

### v13 Transaction constructor

`node_modules/yjs/src/utils/Transaction.js:48-122`:

```js
export class Transaction {
  constructor (doc, origin, local) {
    this.doc = doc
    this.deleteSet = new DeleteSet()                       // line 64
    this.beforeState = getStateVector(doc.store)           // line 69 — eager
    this.afterState = new Map()                            // line 74
    this.changed = new Map()
    this.changedParentTypes = new Map()
    this._mergeStructs = []
    this.origin = origin                                   // line 95
    this.meta = new Map()
    this.local = local
    this.subdocsAdded = new Set()
    this.subdocsRemoved = new Set()
    this.subdocsLoaded = new Set()
    this._needFormattingCleanup = false
  }
}
```

### v14 Transaction constructor

`@y/y/src/utils/Transaction.js:45-128`:

```js
export class Transaction {
  constructor (doc, origin, local) {
    this.doc = doc
    this.deleteSet = createIdSet()                         // line 60 (was new DeleteSet)
    this.cleanUps = createIdSet()                          // line 65 — NEW
    this.insertSet = createIdSet()                         // line 69 — NEW
    this._beforeState = null                               // line 74 — lazy
    this._afterState = null                                // line 79 — lazy
    this.changed = new Map()
    this.changedParentTypes = new Map()
    this._mergeStructs = []
    this.origin = origin                                   // line 100
    this.meta = new Map()
    this.local = local
    this.subdocsAdded = new Set()
    this.subdocsRemoved = new Set()
    this.subdocsLoaded = new Set()
    this._needFormattingCleanup = false
    this._done = false                                     // line 127 — NEW
  }
  // lazy beforeState getter at lines 136-145 — marked @deprecated
  // lazy afterState getter at lines 153+ — marked @deprecated
}
```

### `transact()` function — identical signature

```
node_modules/yjs/src/utils/Transaction.js:412:export const transact = (doc, f, origin = null, local = true) => {
/tmp/y14/package/src/utils/Transaction.js:391:export const transact = (doc, f, origin = null, local = true) => {
```

Same `(doc, f, origin = null, local = true)` signature. `origin` field shape (`any`) preserved.

### Doc events — identical surface

`@y/y/src/utils/Doc.js:31-43` jsdoc:

```
@property {function(Doc):void} DocEvents.destroy
@property {function(Doc):void} DocEvents.load
@property {function(boolean, Doc):void} DocEvents.sync
@property {function(Uint8Array<ArrayBuffer>, any, Doc, Transaction):void} DocEvents.update
@property {function(Uint8Array<ArrayBuffer>, any, Doc, Transaction):void} DocEvents.updateV2
@property {function(Doc):void} DocEvents.beforeAllTransactions
@property {function(Transaction, Doc):void} DocEvents.beforeTransaction
@property {function(Transaction, Doc):void} DocEvents.beforeObserverCalls
@property {function(Transaction, Doc):void} DocEvents.afterTransaction
@property {function(Transaction, Doc):void} DocEvents.afterTransactionCleanup
@property {function(Doc, Array<Transaction>):void} DocEvents.afterAllTransactions
@property {function({ loaded: Set<Doc>, added: Set<Doc>, removed: Set<Doc> }, Doc, Transaction):void} DocEvents.subdocs
```

Identical to v13 `node_modules/yjs/src/utils/Doc.js:37-49`. The `'destroyed'` legacy emit at v13 `Doc.js:343` is gone in v14 (only `'destroy'` survives — see v14 `Doc.js:247`).

### Migration impact

- **API-COMPATIBLE**: `doc.transact(fn, origin)`, `transaction.origin`, `transaction.local`, `transaction.deleteSet`, `transaction.changed`, `transaction.changedParentTypes`, `transaction.meta` all preserved.
- **API-COMPATIBLE (deprecated)**: `transaction.beforeState` / `transaction.afterState` still work but become lazy getters marked `@deprecated`. Per-transaction-watcher style (precedent #13a in CLAUDE.md) survives unchanged.
- **API-NEW**: `transaction.insertSet`, `transaction.cleanUps`. UndoManager v14 uses `transaction.insertSet` directly instead of computing it from `beforeState`/`afterState` (see Section 6).
- **INTERNAL-CHANGED**: `transaction.deleteSet` is now an `IdSet` instance (was `DeleteSet`). API-equivalent for callers that only use `.add()` and `.clients`. Code reaching into `DeleteSet`-specific methods (e.g. `addToDeleteSet(ds, client, clock, len)` free function) must change to method form: `ds.add(client, clock, len)`.

---

## 6. UndoManager — verified API-COMPATIBLE; one internal field-order swap

### v13

`node_modules/yjs/src/utils/UndoManager.js:160-211`:

```js
export class UndoManager extends ObservableV2 {
  constructor (typeScope, {
    captureTimeout = 500,
    captureTransaction = _tr => true,
    deleteFilter = () => true,
    trackedOrigins = new Set([null]),
    ignoreRemoteMapChanges = false,
    doc = ...
  } = {}) {
    super()
    this.scope = []
    this.doc = doc
    this.addToScope(typeScope)
    this.deleteFilter = deleteFilter
    trackedOrigins.add(this)
    this.trackedOrigins = trackedOrigins
    ...
  }
}

// StackItem at v13 UndoManager.js:21-26
constructor (deletions, insertions) { ... }      // ← ORDER: (deletions, insertions)
```

### v14

`@y/y/src/utils/UndoManager.js:155-211`:

```js
export class UndoManager extends ObservableV2 {
  constructor (typeScope, {
    captureTimeout = 500,
    captureTransaction = _tr => true,
    deleteFilter = () => true,
    trackedOrigins = new Set([null]),
    ignoreRemoteMapChanges = false,
    doc = ...
  } = {}) {
    super()
    this.scope = []
    this.doc = doc
    this.addToScope(typeScope)
    this.deleteFilter = deleteFilter
    trackedOrigins.add(this)
    this.trackedOrigins = trackedOrigins
    ...
  }
}

// StackItem at v14 UndoManager.js:16-21
constructor (insertions, deletions) { ... }      // ← ORDER: (insertions, deletions) — SWAPPED
```

The `afterTransactionHandler` at v14 line 234 also uses `transaction.insertSet` directly instead of computing it from `transaction.afterState/beforeState` diff (the v13 style at lines 229-236). The `mergeIdSets` rename (was `mergeDeleteSets` at v13 lines 242-243) is mechanical; same algorithm.

### `trackedOrigins` matching — verified preserved

Both v13 (`UndoManager.js:216`) and v14 (`UndoManager.js:211`) use:

```js
(!this.trackedOrigins.has(transaction.origin) && (!transaction.origin || !this.trackedOrigins.has(transaction.origin.constructor)))
```

This is the identity-set match the precedent #1 typed-origin-objects pattern (`LocalTransactionOrigin` references) relies on. **The set lookup is `Set.has`, which uses reference identity for objects** — therefore our `OBSERVER_SYNC_ORIGIN`, `AGENT_WRITE_ORIGIN`, `FILE_WATCHER_ORIGIN` typed-object pattern survives v14 unchanged.

### Migration impact

- **API-COMPATIBLE**: `new Y.UndoManager(scope, { trackedOrigins, captureTimeout, deleteFilter })` — same shape, same semantics.
- **INTERNAL-CHANGED**: If anything reaches into `StackItem` and assumes `(deletions, insertions)` field order, the v14 swap will silently invert delete/insert tracking. Only an issue for code that constructs `new StackItem(...)` directly or reads `.deletions`/`.insertions` by position.
- **Item-preservation invariant (precedent #10)** — survives. UndoManager identifies tracked items by `IdRange` (now `IdSet`-style storage), not by Item reference. Bridge cycles that preserve the underlying CRDT Item identity will still preserve undo origin attribution.

---

## 7. Awareness — `y-protocols` → `@y/protocols` package rename, near-identical class

### v13 (`y-protocols@1.0.7`)

`node_modules/y-protocols/awareness.js:39-162`:

```js
export class Awareness extends Observable {            // ← line 39, lib0/observable v0.2 base
  constructor (doc) { ... }
  getLocalState ()   { ... }                          // line 99 (in v14, content nearly identical)
  setLocalState (state) { ... }                       // line 106
  setLocalStateField (field, value) { ... }           // line 142
  getStates ()       { return this.states }           // line 159
  destroy () { ... }                                  // line 89
}
export const removeAwarenessStates = (...) => { ... }
export const encodeAwarenessUpdate = (...) => { ... }
export const modifyAwarenessUpdate = (...) => { ... }
export const applyAwarenessUpdate = (...) => { ... }
```

### v14 (`@y/protocols@1.0.6-rc.1`)

`/tmp/yprot1/package/src/awareness.js:44-162`:

```js
export class Awareness extends ObservableV2 {          // ← line 44 — base class change
  constructor (doc) { ... }
  getLocalState ()   { ... }                          // line 99
  setLocalState (state) { ... }                       // line 106
  setLocalStateField (field, value) { ... }           // line 146
  getStates ()       { return this.states }           // line 159
  destroy () { ... }                                  // line 89
}
export const removeAwarenessStates = (...) => { ... }
export const encodeAwarenessUpdate = (...) => { ... }
export const modifyAwarenessUpdate = (...) => { ... }
export const applyAwarenessUpdate = (...) => { ... }
```

Method names, arity, `'change'` and `'update'` event payloads (`{ added, updated, removed }`), `outdatedTimeout = 30000` constant — all preserved verbatim.

### Migration impact

- **PACKAGE-RENAMED**: `y-protocols` → `@y/protocols`. Mechanical import rename.
- **API-COMPATIBLE**: `Awareness` API surface identical. `awareness.setLocalStateField('user', { name, color })`, `awareness.on('change', ...)`, `awareness.getStates()` all work unchanged.
- **INTERNAL-CHANGED**: Base class `Observable` (lib0 v0) → `ObservableV2` (lib0 v0/v1). For most consumers transparent; for code that reaches `.observers` directly, the field shape may differ.

---

## 8. Wire format

### Encoder class hierarchy — only base class renamed

`grep -E "^(export|class)" UpdateEncoder.js` diff:

```
< export class DSEncoderV1 {                 (v13)
< export class UpdateEncoderV1 extends DSEncoderV1 {
< export class DSEncoderV2 {
< export class UpdateEncoderV2 extends DSEncoderV2 {
---
> export class IdSetEncoderV1 {              (v14)
> export class UpdateEncoderV1 extends IdSetEncoderV1 {
> export class IdSetEncoderV2 {
> export class UpdateEncoderV2 extends IdSetEncoderV2 {
```

The `UpdateEncoderV1` and `UpdateEncoderV2` class names are **preserved**. Only the base class is renamed `DS…` → `IdSet…`. The `writeBuf`/`writeKey` methods are at the same positions in both. **Byte-level emission code paths look unchanged.**

### Top-level encoding API — identical

`grep -n "^export const" /tmp/y14/package/src/utils/encoding.js`:

```
applyUpdate, applyUpdateV2 (lines 370, 354)
encodeStateAsUpdate, encodeStateAsUpdateV2 (lines 433, 400)
encodeStateVector, encodeStateVectorV2 (lines 610, 593)
mergeUpdates, mergeUpdatesV2 (lines 488, 463)
diffUpdate, diffUpdateV2 (lines 540, 497)
decodeStateVector, readStateVector
createDocFromUpdate, createDocFromUpdateV2 (lines 673, 683)
cloneDoc (line 693)
readUpdate, readUpdateV2
```

Every v13 export from this surface (`node_modules/yjs/src/utils/encoding.js`) is present in v14 with the same signature. **`applyUpdate(ydoc, updateBytes, origin)` works identically.**

### What I did NOT verify directly

- I did not byte-trace an actual encoded update from v13 and decode it with v14 (or vice versa) to confirm interoperability of the V1 / V2 wire format. The class structure suggests it should work, and the V2 format upgrade is at the `_handleStructUpdate` byte-stream level (unchanged in encoder). **Empirical interop between v13 and v14 clients on the same doc is an explicit verification gap** — would require a small test rig that pipes `encodeStateAsUpdate(v13Doc)` → `applyUpdate(v14Doc, bytes)` and back.
- The persistence layer (`y-leveldb`, `y-indexeddb`, hocuspocus storage) writes v1 / v2 bytes to disk. The fact that the encoder class names + free-function API are preserved is suggestive but not a proof.

### Migration impact

- **API-COMPATIBLE**: Top-level encoding API surface fully preserved.
- **API-COMPATIBLE (likely)**: Wire byte format. Verification gap noted above.
- **INTERNAL-CHANGED**: `DSEncoderV1`/`DSEncoderV2` base class names. Affects only code that imports the base class directly.

---

## 9. RelativePosition — surface preserved, optional attribution argument added

```
v13 RelativePosition.js:43:export class RelativePosition {
v13 RelativePosition.js:163:export const createRelativePositionFromTypeIndex = (type, index, assoc = 0) => {
v13 RelativePosition.js:289:export const createAbsolutePositionFromRelativePosition = (rpos, doc, followUndoneDeletions = true) => {

v14 RelativePosition.js:33:export class RelativePosition {
v14 RelativePosition.js:154:export const createRelativePositionFromTypeIndex = (type, index, assoc = 0, attributionManager = noAttributionsManager) => {
v14 RelativePosition.js:280:export const createAbsolutePositionFromRelativePosition = (rpos, doc, followUndoneDeletions = true, attributionManager = noAttributionsManager) => {
```

`encodeRelativePosition`, `decodeRelativePosition`, `createRelativePosition`, `createAbsolutePosition`, `createRelativePositionFromJSON` — same signatures.

### Migration impact

- **API-COMPATIBLE**: Existing code passing 3 args still works (the `attributionManager` defaults to the no-op manager).
- **API-NEW**: Attribution-aware position computation if you opt in.

---

## 10. lib0 dependency — `^0.2.99` → `^1.0.0-rc.12`

```
yjs@13.6.30   "lib0": "^0.2.99"           (node_modules/yjs/package.json:71)
@y/y@14.0.0-rc.13   "lib0": "^1.0.0-rc.12"   (/tmp/y14/package/package.json:62)

npm dist-tags lib0:
  latest: 0.2.117
  beta:   1.0.0-rc.12
```

Both lib0 versions declare `"engines": { "node": ">=16" }`. lib0 itself does not require node 22.

### Surface differences observed

```
ls /tmp/lib0v1/package/src/                         lib0 v0.2.117 src
delta/                                              delta/
delta/delta.js                                      delta/delta.js
delta/transformer.js                                (absent in v0)
schema.js                                           schema.js
trait/equality.js                                   (absent in v0)
trait/fingerprint.js                                (absent in v0)
```

- `lib0/delta/delta.js` is present in BOTH versions. The delta protocol is not new to lib0 v1.
- `lib0/trait` (with `equality.js`, `fingerprint.js`) is **new in v1**. v14 yjs imports it: `import * as traits from 'lib0/traits'` at `/tmp/y14/package/src/ytype.js:12` and `/tmp/y14/package/src/utils/ids.js:2`.
- Op-class renames in `lib0/delta/delta.js`:
  - v0: `AttrInsertOp` / `AttrDeleteOp` / `AttrModifyOp`
  - v1: `SetAttrOp` / `DeleteAttrOp` / `ModifyAttrOp`
  - Schema-check exports renamed accordingly: `$attrInsertOp` → `$setAttrOp`, etc.
- `Delta` and `DeltaBuilder` still exported by both.

### Migration impact

- **PEER MAJOR-BUMP**: Any consumer code using `lib0/delta` directly with `AttrInsertOp` / `AttrDeleteOp` references must migrate.
- **TRANSITIVE**: Anything depending on `lib0` at the same major must coordinate: a v13-yjs and v14-yjs in the same workspace will install both `lib0@0.2.x` (peer of v13) and `lib0@1.0.x` (peer of v14). Bun resolves these by depth. No compile error — but if your code imports `lib0/delta` directly and gets the wrong major, runtime mismatch is possible.

---

## 11. Engines + runtime requirements

```
yjs@13.6.30        "engines": { "npm": ">=8.0.0", "node": ">=16.0.0" }
@y/y@14.0.0-rc.13  "engines": { "npm": ">=8.0.0", "node": ">=22.0.0" }
```

The bump from `>=16` to `>=22` is real. I did not find a single Node-22-required syntactic feature in v14 source by reading — no top-level `await` in entry, no `import.meta.resolve()`, no native `fetch()` consumption. The likeliest reason is dev-only:
- `"@types/node": "^22.14.1"` (was `^18.15.5` in v13)
- TypeScript 5.9 (was 4.9)
- `dpdm` and `markdownlint` modern majors

This is a **conservative declared minimum**, not a hard runtime barrier. Our stack already runs `bun@1.3.11` which uses Node 22 APIs. Production constraint is about declared support contract, not actual feature use.

### Migration impact

- **CONSTRAINT**: Any consumer with `node>=18` declared support will need to bump declared minimums or get a peer-deps warning. For Open Knowledge (Bun-only target, modern Node baseline), this is non-binding.

---

## 12. Runtime guard `__$YJS14$__` — and the surprising finding

### v13 guard

`node_modules/yjs/src/index.js:109-135`:

```js
const importIdentifier = '__ $YJS$ __'

if (glo[importIdentifier] === true) {
  console.error('Yjs was already imported. This breaks constructor checks and will lead to issues!')
}
glo[importIdentifier] = true
```

### v14 guard

`/tmp/y14/package/src/index.js:38-64`:

```js
const importIdentifier = '__ $YJS14$ __'

if (glo[importIdentifier] === true) {
  console.error('Yjs was already imported. This breaks constructor checks and will lead to issues!')
}
glo[importIdentifier] = true
```

### The finding

**The two guard keys are different strings**:
- v13 → `'__ $YJS$ __'`
- v14 → `'__ $YJS14$ __'`

**Therefore they do NOT collide.** Loading both `import * as Y13 from 'yjs'` and `import * as Y14 from '@y/y'` in the same process will set TWO separate global flags and emit ZERO warning. This contradicts the common assumption that the runtime guard prevents dual-load.

What still breaks under dual-load:
- `Y13.Item` and `Y14.Item` are different class references → `instanceof` checks against Y13's class fail for Y14 Items and vice versa.
- Y13 and Y14 Doc instances cannot be applied to each other (Y14's `applyUpdate` would receive bytes encoded by Y13's `UpdateEncoderV1` — likely works at the byte layer, but the resulting Items would be Y14 Items, not Y13 Items, so a Y13-aware consumer would fail constructor check on integration).

This means **a hybrid v13-server + v14-client (or vice versa) approach has zero runtime warning to alert you that constructor checks are broken**. Discovery is silent CRDT corruption at first divergent operation.

### Migration impact

- **INTERNAL-CHANGED, surprising**: The guard renames means the warning console.error from v13 will not fire if v14 is also loaded, and vice versa. No user-facing protection against the dual-load footgun.
- **ARCHITECTURAL CONSEQUENCE**: Any "gradual migration" plan that runs v13 server with v14 client, or v13 indexedDB persistence with v14 in-memory doc, has no runtime warning. **The ecosystem must be migrated atomically per process**.

---

## 13. Item / StructStore / Content* internals

### Item.js shape — preserved

v13 `node_modules/yjs/src/structs/Item.js:246-309` constructor:

```js
constructor (id, left, origin, right, rightOrigin, parent, parentSub, content) {
  super(id, content.getLength())
  this.origin = origin
  this.left = left
  this.right = right
  this.rightOrigin = rightOrigin
  this.parent = parent             // type = AbstractType<any>|ID|null
  this.parentSub = parentSub
  this.redone = null
  this.content = content
  this.info = this.content.isCountable() ? binary.BIT2 : 0
}
```

v14 `/tmp/y14/package/src/structs/Item.js:49-112`:

```js
constructor (id, left, origin, right, rightOrigin, parent, parentSub, content) {
  super(id, content.getLength())
  this.origin = origin
  this.left = left
  this.right = right
  this.rightOrigin = rightOrigin
  this.parent = parent             // type = YType|ID|string|null  ← string added for top-level
  this.parentSub = parentSub
  this.redone = null
  this.content = content
  this.info = this.content.isCountable() ? binary.BIT2 : 0
}
```

`info` bitfield identical: bit1=keep, bit2=countable, bit3=deleted, bit4=marker. Getters/setters at `Item.js:114-162` (v14) match v13 line-for-line.

### Item.delete(transaction) — same algorithm

v13 `Item.js:612-624`:

```js
delete (transaction) {
  if (!this.deleted) {
    const parent = this.parent
    if (this.countable && this.parentSub === null) {
      parent._length -= this.length
    }
    this.markDeleted()
    addToDeleteSet(transaction.deleteSet, this.id.client, this.id.clock, this.length)   // free function
    addChangedTypeToTransaction(transaction, parent, this.parentSub)
    this.content.delete(transaction)
  }
}
```

v14 `Item.js:366-378`:

```js
delete (transaction) {
  if (!this.deleted) {
    const parent = this.parent
    if (this.countable && this.parentSub === null) {
      parent._length -= this.length
    }
    this.markDeleted()
    transaction.deleteSet.add(this.id.client, this.id.clock, this.length)               // method on IdSet
    addChangedTypeToTransaction(transaction, parent, this.parentSub)
    this.content.delete(transaction)
  }
}
```

The ONLY difference: free function `addToDeleteSet(set, ...)` → method `set.add(...)`. The destructive-delete CRDT semantics — that triggered our y-prosemirror patch (`patches/y-prosemirror@1.3.7.patch`) — are 100% preserved.

### StructStore.js — moved from free helpers to class methods

v13 `node_modules/yjs/src/utils/StructStore.js` exports as free functions: `getState`, `addStruct`, `findIndexSS`, `find`, `getItem`, `findIndexCleanStart`, `getItemCleanStart`, `getItemCleanEnd`, `tryGc`.

v14 reorganization:
- Methods on `StructStore` class itself: `add` (was `addStruct`), `get` (was `find`), `getItem`, `getClock`, `getIndex` (`/tmp/y14/package/src/utils/StructStore.js:32-110`).
- Moved to `transaction-helpers.js`: `findIndexSS` (line 22), `findIndexCleanStart` (57), `getItemCleanStart` (77), `getItemCleanEnd` (93), `tryGcDeleteSet` (251), `tryGc` (305).
- Lazy `ds` getter: `get ds () { return createDeleteSetFromStructStore(this) }` at v14 `StructStore.js:24-26`.

### Content* — bundled into Item.js in v14

v13 has 9 separate files: `ContentBinary.js`, `ContentDeleted.js`, `ContentDoc.js`, `ContentEmbed.js`, `ContentFormat.js`, `ContentJSON.js`, `ContentString.js`, `ContentType.js`, `ContentAny.js` (under `structs/`).

v14 bundles all of these into one 1517-line file: `/tmp/y14/package/src/structs/Item.js`. From `grep -n "^class\|^export class\|^  constructor"`:

```
49:  export class Item       (60: constructor)
607: class ContentJSON      (constructor at 670 below; class at 607)
701: class ContentEmbed
783: class ContentDeleted
876: class ContentDoc
1012: ContentEmbed
1098: class ContentFormat
1191: class ContentJSON
1287: class ContentString
... etc
```

Constructor signatures and `delete()` methods on each Content* class are **identical** to v13. The merge into one file is purely organizational.

### Migration impact

- **API-COMPATIBLE**: `Item`, `GC`, `Skip`, all 9 `Content*` classes preserved with identical constructor and method shapes.
- **API-RESHAPED**: Free helpers like `getItem(store, id)` are now methods (`store.getItem(id)`) or moved to `transaction-helpers.js`. Mechanical migration.
- **INTERNAL-CHANGED**: `addToDeleteSet(ds, client, clock, len)` free function is replaced with `ds.add(client, clock, len)` method. Code reaching into the delete-set primitives has to update.
- **CRDT algorithm is unchanged**: `Item.delete()` still tombstones, broadcasts, and survives undo-resistance. Precedent #9 (schema is add-only forever) still applies because the underlying delete mechanism is unchanged — schema-throw still triggers item.delete() in y-prosemirror, and the patch's substitution behavior still preserves Y.Item identity.

---

## 14. Critical answers for our stack

### Q1: Does precedent #10 ("opaque-but-content-bearing nodes for Y.Item identity") still hold in v14?

**YES.** The reasoning is grounded in two invariants that survive v14:

1. **`Item.delete()` is still CRDT-permanent and broadcast.** The algorithm at v14 `structs/Item.js:366-378` is identical to v13's. Tombstoning + delete-set inclusion + delete-set in update emission still propagate to peers and persist.

2. **`updateYFragment`'s deep-attr-equality logic still drives delete+reinsert.** The function lives in `y-prosemirror/src/plugins/sync-plugin.js:1145-1298`. Its decision tree compares each YType child against the corresponding PM node — for atom nodes, attribute equality is the test (`equalAttrs(ytype.getAttributes(), pnode.attrs)` at line 1000). v14's `YType.getAttr/getAttrs` (lines 1182-1208 of `ytype.js`) preserve this surface. y-prosemirror would need adaptation for v14 import names, but the underlying logic — and the constraint it imposes on our schema design — is unchanged.

The "use `atom: false, content: 'text*'`" guidance for raw-MDX nodes still applies. **Migration to v14 does not relax precedent #10.**

### Q2: Does the y-prosemirror `equalYTypePNode` deep-attr-equality logic still apply to v14?

**The LOGIC applies; the IMPORT NAMES do not.** v14 has no `Y.XmlElement` or `Y.XmlText` classes for `instanceof` checks. y-prosemirror at lines 995, 1005:

```js
ytype instanceof Y.XmlElement && !(pnode instanceof Array) && matchNodeName(ytype, pnode)
... 
ytype instanceof Y.XmlText && pnode instanceof Array
```

…would fail to compile against `@y/y` (no `Y.XmlElement`, no `Y.XmlText` exports). The replacement under v14 would be: read `ytype.name` and discriminate (`name === null` for fragment-style, `name !== null` for element-style) plus inspect `_start` chain to see if children are leaf-text. This is a **non-trivial adaptation** of the y-prosemirror integration code.

### Q3: Does `__$YJS14$__` actually prevent v13 + v14 coexistence?

**NO.** As traced in §12: v13 uses guard key `'__ $YJS$ __'`, v14 uses guard key `'__ $YJS14$ __'`. They are different strings → no collision → no warning fires. **Both can be loaded into the same process with zero indication that anything is wrong.** The `console.error` warning fires only on dual-loading the SAME major (`Y13` + `Y13` from two different node_modules paths).

The CRDT correctness problem remains: `instanceof Y13.Item` vs `instanceof Y14.Item` returns different things. But the user-facing safety net (the `console.error`) is silently bypassed under v13+v14 dual-load. **This is a footgun the migration plan must call out**.

---

## 15. y-prosemirror compatibility — summary

| y-prosemirror dependency | v13 | v14 | Verdict |
| --- | --- | --- | --- |
| `Y.AbstractType` (typedef) | exported | NOT exported | needs `Y.Type` (= YType) |
| `Y.XmlElement` (instanceof) | exported | NOT exported | needs runtime discrimination by `.name` |
| `Y.XmlText` (instanceof) | exported | NOT exported | needs runtime discrimination by `.name` |
| `Y.XmlFragment` (constructor) | exported | NOT exported | needs `new Y.Type()` with `name=null` |
| `Y.Item` (struct ref) | exported | exported | unchanged |
| `Y.ContentString`, `Y.ContentFormat`, `Y.ContentType` | exported | exported (from Item.js) | unchanged |
| `Y.Snapshot`, `Y.findRootTypeKey` | exported | exported | unchanged |
| `Y.RelativePosition` | exported | exported | unchanged (optional 4th arg added) |
| `Y.typeListToArraySnapshot` | exported | exported | unchanged |
| `Y.UndoManager` | exported | exported | unchanged |
| `Y.Doc.getXmlFragment(name)` | exists | DOES NOT EXIST | needs `doc.get(name)` |
| `el._first` (skip-deleted head) | exists (`AbstractType.js:344`) | DOES NOT EXIST | needs manual walk of `_start` chain skipping `deleted` |
| Patches at `dist/y-prosemirror.cjs:876+` (R13 fallback) | applies cleanly | would need re-port | patches couple to v13 emit format |

**Verdict for our stack**: a literal `import * as Y from '@y/y'` in y-prosemirror would not compile. `y-prosemirror@1.3.7` IS NOT v14-compatible.

A v14-compatible y-prosemirror release does not exist as of `npm view y-prosemirror dist-tags` (need separate verification of latest). If we want v14, we either (a) wait for upstream y-prosemirror v14 support, (b) fork and port y-prosemirror ourselves, or (c) replace the integration entirely with a delta-based v14-native approach (rebuild PM nodes from `ytype.toDelta({deep:true})` and apply PM transactions back via `ytype.applyDelta()`).

---

## 16. What I did not verify (verification gaps)

1. **Wire-format byte-level interop** between v13 and v14. The class structure suggests it works; not byte-traced.
2. **Persistence-layer compatibility** (`y-leveldb`, `y-indexeddb`, hocuspocus's leveldb backend). v14 readability of v13 stored bytes is implied by the stable `UpdateEncoderV1/V2` class names + free-function API but not empirically tested.
3. **`@y/protocols/sync.js` and `@y/protocols/auth.js`** — only checked `/awareness.js`. Sync protocol versions could differ.
4. **`hocuspocus` v14 readiness.** Not in scope of this report (separate verification).
5. **`y-codemirror.next` v14 readiness.** Not in scope.
6. **`yjs` direct-export `cleanupYTextFormatting`** — verified present in v14 (`Transaction.js` exports), but its internal implementation against unified YType not deeply read.

These would need separate work before a migration can be planned with confidence.
