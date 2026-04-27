# Evidence: D1 — y-indexeddb primitive surface (3P)

**Dimension:** y-indexeddb API, lifecycle, storage model, synced-state contract, first-load semantics, multi-tab behavior
**Date:** 2026-04-24
**Sources:** [yjs/y-indexeddb source](https://github.com/yjs/y-indexeddb/blob/main/src/y-indexeddb.js) (cloned at `~/.claude/oss-repos/y-indexeddb/`), [Yjs docs — y-indexeddb page](https://docs.yjs.dev/ecosystem/database-provider/y-indexeddb)

---

## Key files referenced

- `src/y-indexeddb.js` (184 LOC total — the entire library)
- `src/y-indexeddb.js:54-184` — `IndexeddbPersistence` class (the only export surface)

---

## Findings

### Finding: The entire library is 184 lines; API surface is a single class

**Confidence:** CONFIRMED
**Evidence:** `wc -l ~/.claude/oss-repos/y-indexeddb/src/y-indexeddb.js` → 184

```js
// From src/y-indexeddb.js:54-126 — the constructor
export class IndexeddbPersistence extends Observable {
  constructor (name, doc) {
    super()
    this.doc = doc
    this.name = name
    this._dbref = 0
    this._dbsize = 0
    this._destroyed = false
    this.db = null
    this.synced = false
    this._db = idb.openDB(name, db =>
      idb.createStores(db, [
        ['updates', { autoIncrement: true }],
        ['custom']
      ])
    )
    this.whenSynced = promise.create(resolve => this.on('synced', () => resolve(this)))
    // ...
  }
```

**Implications:** The library is trivially small. Adoption cost per-se is nearly zero code. Risk surface is correspondingly narrow.

---

### Finding: Two IndexedDB stores per document name — `updates` + `custom`

**Confidence:** CONFIRMED
**Evidence:** `src/y-indexeddb.js:6-7,71-76`

```js
const customStoreName = 'custom'
const updatesStoreName = 'updates'
// ...
this._db = idb.openDB(name, db =>
  idb.createStores(db, [
    ['updates', { autoIncrement: true }],
    ['custom']
  ])
)
```

**Implications:**
- One IDB database per `name` (= Y.Doc name / OK `docName`).
- `updates` holds auto-incremented individual Y.Doc updates (binary blobs).
- `custom` is a k/v store for arbitrary app data (`provider.get(key)` / `provider.set(key, value)` / `provider.del(key)`).
- Multi-doc app → multiple IDB databases (one per active doc).

---

### Finding: First-load does `Y.applyUpdate` inside a single `Y.transact` with origin = provider

**Confidence:** CONFIRMED
**Evidence:** `src/y-indexeddb.js:16-30` — `fetchUpdates`

```js
export const fetchUpdates = (idbPersistence, beforeApplyUpdatesCallback = () => {}, afterApplyUpdatesCallback = () => {}) => {
  const [updatesStore] = idb.transact(/** @type {IDBDatabase} */ (idbPersistence.db), [updatesStoreName])
  return idb.getAll(updatesStore, idb.createIDBKeyRangeLowerBound(idbPersistence._dbref, false)).then(updates => {
    if (!idbPersistence._destroyed) {
      beforeApplyUpdatesCallback(updatesStore)
      Y.transact(idbPersistence.doc, () => {
        updates.forEach(val => Y.applyUpdate(idbPersistence.doc, val))
      }, idbPersistence, false)
      afterApplyUpdatesCallback(updatesStore)
    }
  })
  // ...
}
```

**Implications:**
- Origin is the provider instance — preserves CRDT identity (the clientID generated for THIS Y.Doc at page load is preserved through applyUpdate).
- All persisted updates applied in a single transact → single `afterAllTransactions` dispatch in the server-bridge model. Non-chatty.
- `origin=idbPersistence` means the provider's own write handler filters this out (line 108: `if (this.db && origin !== this)`) — prevents double-persisting the restore.
- `_destroyed` guard protects against race with `destroy()` during hydration.

---

### Finding: `synced` event + `whenSynced` promise signal "local state loaded into Y.Doc"

**Confidence:** CONFIRMED
**Evidence:** `src/y-indexeddb.js:80-93`

```js
this.whenSynced = promise.create(resolve => this.on('synced', () => resolve(this)))
this._db.then(db => {
  this.db = db
  const beforeApplyUpdatesCallback = (updatesStore) => idb.addAutoKey(updatesStore, Y.encodeStateAsUpdate(doc))
  const afterApplyUpdatesCallback = () => {
    if (this._destroyed) return this
    this.synced = true
    this.emit('synced', [this])
  }
  fetchUpdates(this, beforeApplyUpdatesCallback, afterApplyUpdatesCallback)
})
```

**Implications:**
- `synced` here is LOCAL — means "IDB state hydrated into Y.Doc," not "synced with server."
- Separate from `HocuspocusProvider.isSynced` (which means "server sync complete").
- `beforeApplyUpdatesCallback` captures the current Y.Doc state and writes it as a new update BEFORE applying stored updates — merges in-memory state with persisted state.
- Consequence for UX: app can `await provider.whenSynced` to block on IDB hydration before first render; or wire the `synced` event into a loading indicator.

---

### Finding: Write path is `doc.on('update')` listener; filtered by `origin !== this`

**Confidence:** CONFIRMED
**Evidence:** `src/y-indexeddb.js:107-123`

```js
this._storeUpdate = (update, origin) => {
  if (this.db && origin !== this) {
    const [updatesStore] = idb.transact(/** @type {IDBDatabase} */ (this.db), [updatesStoreName])
    idb.addAutoKey(updatesStore, update)
    if (++this._dbsize >= PREFERRED_TRIM_SIZE) {
      if (this._storeTimeoutId !== null) {
        clearTimeout(this._storeTimeoutId)
      }
      this._storeTimeoutId = setTimeout(() => {
        storeState(this, false)
        this._storeTimeoutId = null
      }, this._storeTimeout)
    }
  }
}
doc.on('update', this._storeUpdate)
```

**Implications:**
- EVERY Y.Doc update (local typing, remote sync from server) is persisted to IDB.
- Filter prevents infinite loop: the applyUpdate during hydration (which fires 'update') is skipped because origin === this.
- IDB writes are fire-and-forget async — no await, no error handling visible to the app.
- Trim logic: at ≥500 updates, debounce 1s → compress to a single `encodeStateAsUpdate` snapshot, delete older entries. This is a self-maintaining background GC.

---

### Finding: `destroy()` unhooks listeners + closes DB but does NOT delete data

**Confidence:** CONFIRMED
**Evidence:** `src/y-indexeddb.js:128-149`

```js
destroy () {
  if (this._storeTimeoutId) {
    clearTimeout(this._storeTimeoutId)
  }
  this.doc.off('update', this._storeUpdate)
  this.doc.off('destroy', this.destroy)
  this._destroyed = true
  return this._db.then(db => {
    db.close()
  })
}

clearData () {
  return this.destroy().then(() => {
    idb.deleteDB(this.name)
  })
}
```

**Implications:**
- Next page load / new provider instance with same name → sees prior state.
- Explicit `clearData()` needed to wipe. Useful for "sign out" / "clear cache" / "reset to server truth" flows.
- The `doc.on('destroy', this.destroy)` registration (line 125) means destroying the Y.Doc also destroys the provider — automatic lifecycle coupling.

---

### Finding: PREFERRED_TRIM_SIZE = 500 — exported, not configurable per-instance

**Confidence:** CONFIRMED
**Evidence:** `src/y-indexeddb.js:9`

```js
export const PREFERRED_TRIM_SIZE = 500
```

**Implications:**
- Exported as a module-level constant — tunable by monkeypatching but not via constructor arg.
- For high-edit-velocity docs, this means snapshot happens every ~500 edits (≈ every 10-20 minutes of active typing).
- IDB storage per doc: bounded roughly by PREFERRED_TRIM_SIZE × avg-update-size + 1 snapshot.

---

### Finding: Library depends only on `yjs` and `lib0` — no transitive complexity

**Confidence:** CONFIRMED
**Evidence:** `src/y-indexeddb.js:1-4` — only imports

```js
import * as Y from 'yjs'
import * as idb from 'lib0/indexeddb'
import * as promise from 'lib0/promise'
import { Observable } from 'lib0/observable'
```

**Implications:**
- No new top-level dependency. `lib0` is already an indirect dep via yjs. Open Knowledge already has `yjs` + `lib0` pinned.
- Adding y-indexeddb is a ~184-LOC JS + `lib0/indexeddb` module surface; no bundle-bloat concerns.

---

## Multi-tab behavior (from Yjs community + inferred)

### Finding: Multi-tab on same origin → same IDB; writes interleave without explicit coordination

**Confidence:** INFERRED (from IDB semantics + code absence of tab-coordination logic)
**Evidence:** `src/y-indexeddb.js` (grep for `BroadcastChannel`, `localStorage`, `SharedWorker` → NOT FOUND)

**Implications:**
- Two tabs on same doc name → both write to same IDB `updates` store.
- Both read on their own hydration — each tab ends up with the merged state from the other.
- But they don't see LIVE cross-tab updates through y-indexeddb alone. A common pattern is to pair y-indexeddb with [y-broadcastchannel] for live multi-tab sync.
- OK's current code uses a single BroadcastChannel pattern elsewhere? → needs codebase check (D4).

**Community reference:** [Yjs forum — Local data lost with IndexedDB + Websocket providers](https://discuss.yjs.dev/t/local-data-lost-with-indexeddb-websocket-providers/1816) discusses subtle race scenarios.

---

## Negative searches

- Searched for `BroadcastChannel` in y-indexeddb source → **NOT FOUND**. Multi-tab live coordination is NOT a y-indexeddb concern.
- Searched for `SharedWorker` → **NOT FOUND**.
- Searched for schema migration / version bumping logic → **NOT FOUND**. IDB schema is fixed (`updates` + `custom`), no version field exposed.
- Searched for quota handling / `QuotaExceededError` → **NOT FOUND**. Writes are fire-and-forget; quota exceeded would silently drop. [Confirmed via code inspection: `addAutoKey` returns a Promise, but `_storeUpdate` does not await or `.catch` it.]

---

## Gaps / follow-ups

- Quota-exceeded handling is a silent gap; production app may need to wrap `_storeUpdate` or periodically call `provider.clearData()` / trim manually.
- Schema versioning: if we ever want to change the stores, there's no built-in migration. We'd need to use `provider.clearData()` + let hydration rebuild from network.
