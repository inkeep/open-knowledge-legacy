# Evidence: D2 — Yjs meshed-provider model (3P)

**Dimension:** How y-indexeddb composes with HocuspocusProvider on a single Y.Doc; merge semantics; ordering; state-vector sync protocol; `origin` filtering; interaction with server-initiated state.
**Date:** 2026-04-24
**Sources:** [Yjs docs — offline editing](https://docs.yjs.dev/getting-started/allowing-offline-editing), [Tiptap — collab + IDB example](https://tiptap.dev/docs/hocuspocus/provider/examples), [Yjs forum — local data lost thread](https://discuss.yjs.dev/t/local-data-lost-with-indexeddb-websocket-providers/1816), y-indexeddb source (cloned), [HocuspocusProvider README](https://tiptap.dev/docs/hocuspocus/provider/install)

---

## Findings

### Finding: "Meshed providers" is the canonical pattern — any number of providers on the same Y.Doc

**Confidence:** CONFIRMED
**Evidence:** Yjs docs — offline editing guide:

> "The persistence provider works similarly to the network providers [...] y-indexeddb works with any other provider [...] providers are meshable."

**Canonical wiring** (from tiptap-docs + multiple OSS examples):

```js
const ydoc = new Y.Doc()

// Local persistence
new IndexeddbPersistence('example-document', ydoc)

// Remote sync (order of instantiation: irrelevant)
const provider = new HocuspocusProvider({
  url: 'ws://127.0.0.1:1234',
  name: 'example-document',
  document: ydoc,
})
```

**Implications:**
- No ordering constraint — both providers attach their `doc.on('update')` listeners and race each other.
- Each provider independently observes all updates to the shared Y.Doc, then filters out its own to avoid feedback loops.
- Both providers eventually converge because Yjs updates are commutative + idempotent (see below).

---

### Finding: Yjs updates are commutative, associative, and idempotent — applyUpdate(A) then applyUpdate(A) is a no-op

**Confidence:** CONFIRMED
**Evidence:** Yjs INTERNALS + observed behavior across ecosystem

Yjs encodes updates as a sequence of `Item`s keyed by `(clientID, clock)`. When `Y.applyUpdate(doc, update)` runs:
1. Items already known to `doc` (same `(clientID, clock)`) are **skipped structurally** — no duplication.
2. Items from unknown `(clientID, clock)` pairs are inserted into the doc's item store.
3. Integration respects the `origin`/`originRight` pointers (these are item-identity references, NOT sync-event metadata; not to be confused with `doc.transact(..., transactionOrigin)`).

**Implications for meshed providers:**
- If IDB hydrates `doc` with updates {A, B, C} (clientID=42), then Hocuspocus connects and server sends the same {A, B, C} back (because the client's state vector said "I have nothing"), applying them a second time is structurally a no-op.
- The `afterAllTransactions` dispatch still fires once per transaction, which matters for downstream observers (e.g., OK's server-authoritative bridge) but NOT for CRDT state.

---

### Finding: The `origin` filter is the key integration primitive — y-indexeddb uses provider-as-origin to skip self-persistence

**Confidence:** CONFIRMED
**Evidence:** `~/.claude/oss-repos/y-indexeddb/src/y-indexeddb.js:107-122`

```js
this._storeUpdate = (update, origin) => {
  if (this.db && origin !== this) {                    // ← CRITICAL FILTER
    const [updatesStore] = idb.transact(this.db, [updatesStoreName])
    idb.addAutoKey(updatesStore, update)
    // ...
  }
}
doc.on('update', this._storeUpdate)
```

**And on hydration:**

```js
Y.transact(idbPersistence.doc, () => {
  updates.forEach(val => Y.applyUpdate(idbPersistence.doc, val))
}, idbPersistence, false)   // ← origin = the provider itself
```

**Implications:**
- When IDB applies its stored updates on startup, the `update` event fires with `origin === this-idb-provider`. The filter skips persisting — prevents an infinite loop where loading persisted state triggers re-persisting it.
- When HocuspocusProvider receives a server update and calls `Y.applyUpdate(doc, msg, this-hocuspocus-provider)`, the `update` event fires with `origin === this-hocuspocus-provider`. Since `origin !== this-idb-provider`, IDB **persists** the server-originated update.
- **This is exactly the design pattern the OK server-side bridge already uses** (`OBSERVER_SYNC_ORIGIN`, `trackedOrigins`). The mechanism is familiar.
- No new conceptual machinery required for adoption — just an additional listener participating in an already-origin-aware system.

---

### Finding: Sync order is IDB-first, then network — with explicit guarantees from the `whenSynced` promise

**Confidence:** CONFIRMED (by code reading + OSS convention)
**Evidence:**
- y-indexeddb: `whenSynced` resolves after `_db.then(db => { ... fetchUpdates(...) })` completes (y-indexeddb.js:80-93).
- HocuspocusProvider: constructor is non-blocking; WebSocket connect happens asynchronously. `provider.on('synced', ...)` and `provider.isSynced` transition true only after full server sync handshake.
- Event-loop microtask semantics: `new IndexeddbPersistence(...)` queues `this._db.then(...)` synchronously; `new HocuspocusProvider(...)` initiates WebSocket connect (involves DNS + TCP + WS handshake — slower).

**Typical observed timing** (community + Tiptap guides):
1. t=0: both providers constructed.
2. t≈5–50ms: IDB resolves `openDB`, runs `fetchUpdates`, `synced` fires. Y.Doc has full local state.
3. t≈100–2000ms: HocuspocusProvider finishes WS handshake, performs state-vector exchange, applies missing updates. `synced` fires.

**Implications:**
- IDB hydration almost always wins the race for offline-capable UX — user can edit immediately.
- Server-side Hocuspocus sync runs SECOND on top of the IDB-hydrated Y.Doc — the client's state vector already includes the IDB-restored updates, so the server only sends what the client hasn't seen.
- **This is the exact mechanism that fixes OK's restart bug**: after server restart, the client's Y.Doc already has the pre-restart items (clientID=X from IDB). When the fresh server's (empty or markdown-rebuilt) state vector arrives, sync is purely additive — no clientID mismatch because the CLIENT's clientID is preserved across reload (it's in the IDB-restored state).

---

### Finding: HocuspocusProvider tolerates a pre-populated Y.Doc — sync protocol is state-vector-based, not snapshot-based

**Confidence:** CONFIRMED
**Evidence:** Yjs sync protocol (Medium article on sync-awareness fundamentals, plus Hocuspocus source):

> "The sync protocol's goal is to ensure that all clients eventually have all the edits relating to a document. It doesn't need to ensure that they are received in any order."

The protocol:
1. Client → Server: "here's my state vector (SV1)."
2. Server → Client: "here are the updates you're missing, given SV1."
3. Client → Server: "here are the updates YOU're missing, given SV2."

**Implications:**
- HocuspocusProvider does not care whether Y.Doc is empty or pre-populated. It computes SV1 from whatever state exists.
- If IDB pre-populated the Y.Doc, SV1 reflects that. Server responds with only the delta.
- No "Hocuspocus overwrites IDB" failure mode on the happy path — the protocol is delta-based.

---

### Finding: Known race hazard — "default init" of Y.Map before providers finish loading

**Confidence:** CONFIRMED (community caveat; Kevin Jahns acknowledged)
**Evidence:** [Yjs forum thread](https://discuss.yjs.dev/t/local-data-lost-with-indexeddb-websocket-providers/1816) (summarized):

> "Any data initialization or setting defaults has the risk of overwriting data that is still loading. Nested Y.Map types are particularly vulnerable if existing keys are re-initialized unintentionally."

**Pattern that breaks:**

```js
// ❌ BAD
const ydoc = new Y.Doc()
new IndexeddbPersistence('x', ydoc)
new HocuspocusProvider({ document: ydoc, ... })

// App code assumes Y.Doc is empty and sets defaults SYNCHRONOUSLY:
ydoc.getMap('settings').set('theme', 'light')   // ← may run BEFORE IDB hydrates, writes "light" on top of IDB-stored "dark"
```

**Pattern that's safe:**

```js
// ✅ GOOD
await persistence.whenSynced   // block until IDB hydrated
// Only NOW is it safe to read/default-init
if (!ydoc.getMap('settings').has('theme')) {
  ydoc.getMap('settings').set('theme', 'light')
}
```

**Implications for OK:**
- OK does not currently default-initialize shared types at client mount. The editor binds via `Collaboration` extension (TipTap), which passes through the Y.Doc — doesn't mutate it.
- The `awareness` CRDT IS mutated on mount (cursor, user info) — but awareness is separate from document state and not persisted by y-indexeddb (awareness state only lives in memory).
- **Low risk for OK adoption** — verify that no client code path writes to the Y.Doc before `provider.whenSynced` resolves. Adding the `await` is a one-line change per editor entry point.

---

### Finding: Multi-tab with y-indexeddb alone has LIVE coordination gap — y-indexeddb does NOT use BroadcastChannel

**Confidence:** CONFIRMED
**Evidence:** `~/.claude/oss-repos/y-indexeddb/src/y-indexeddb.js` — exhaustive grep for `BroadcastChannel`, `SharedWorker`, `localStorage` events → **NOT FOUND** (see D1).

**Multi-tab behavior without a network provider:**
- Tab A writes to IDB.
- Tab B, already open, does NOT see the new updates until a manual refetch or reload (IDB doesn't push notifications cross-tab).
- Opening a new Tab C gets the merged state (because it reads IDB on construct).

**Multi-tab behavior WITH HocuspocusProvider:**
- Tab A writes → local Y.Doc updates → IDB persists + HocuspocusProvider sends to server.
- Server rebroadcasts to all connected tabs (including Tab B's own HocuspocusProvider connection).
- Tab B's HocuspocusProvider receives the update, applies to its Y.Doc → IDB persists on that side too.
- Both tabs converge via the server round-trip, NOT via IDB cross-tab sync.

**Implications:**
- For live multi-tab coordination, the existing HocuspocusProvider + server round-trip handles it correctly. y-indexeddb adoption does NOT improve this; it doesn't need to.
- If server is DOWN (the restart window), two tabs editing on the same origin would diverge locally — each tab writes to its own IDB copy, but neither sees the other's edits until server returns. On reconnect, both send deltas; server merges; both get the union.
- This matches the Jupyter RTC production model — y-indexeddb is a local cache, the server is the live coordination layer.
- **Optional enhancement:** pair y-indexeddb with `y-protocols/broadcast-channel` for live cross-tab sync even while server is down. Not required for the restart fix, but useful if multi-tab-offline is a future concern.

---

### Finding: applyUpdate order across multiple providers doesn't create "double items" — Yjs items are content-addressed by `(clientID, clock)`

**Confidence:** CONFIRMED
**Evidence:** Yjs item-store semantics (yjs/README.md + INTERNALS.md):

Every Yjs item has a globally-unique identifier `(clientID, clock)`. The item store is a keyed structure. Inserting an item with an existing key is a no-op (the existing item is authoritative — structural dedupe, not content dedupe).

**Applied to the restart scenario (with y-indexeddb):**
- Client's pre-restart Y.Doc state contains items under two clientIDs: server's old one `S1` and client's `C1`.
- Server restarts, generates new clientID `S2`.
- Server reloads markdown via `updateYFragment`, producing items under `S2`.
- Client reconnects:
  - IDB-restored Y.Doc: has items `{(S1, 0..N), (C1, 0..M)}`. clientID=C1 (the CLIENT's clientID is preserved in Y.Doc metadata across reload).
  - Server sends state vector: "I have `(S2, 0..K)`, send me what I'm missing."
  - Client sends updates with items `(S1, 0..N), (C1, 0..M)`.
  - Server integrates. Now server has `{(S1, 0..N), (C1, 0..M), (S2, 0..K)}`.
  - Server sends client what client is missing: `(S2, 0..K)`.
  - Client integrates. Now client has `{(S1, 0..N), (C1, 0..M), (S2, 0..K)}`.
- **Content-level outcome:** items from `S1` (pre-restart server state) and `S2` (post-restart server state) are BOTH present in the document. **Content duplicates at the markdown level.**

**This is the exact bug.** y-indexeddb alone does NOT fix it — IDB preserves client state across reload, but it does not prevent `updateYFragment`-as-source-of-truth from generating duplicate-content items under a new clientID.

**Implications:**
- y-indexeddb is NECESSARY but NOT SUFFICIENT for restart recovery.
- Must be PAIRED with a server-side sidecar (or equivalent) that preserves the server's Y.Doc state across restart, so `S2` is never generated (server rehydrates as `S1`).
- OR, must be paired with a mismatch-detection mechanism (like PR #311's server-instance-ID) that forces client recycle so `S1`/`C1` are never sent to the fresh server.

This reframes the y-indexeddb adoption question: it is a *client-side* complement to the server-side fix, not a replacement.

---

## Negative searches

- Searched for "y-indexeddb breaks clientID" in Yjs forum / GitHub issues → **NOT FOUND**. clientID is a per-Y.Doc-instance property stored in memory, not persisted by y-indexeddb. Across page reload, a NEW clientID is generated (new Y.Doc). The IDB-restored items retain their ORIGINAL clientIDs via the `(clientID, clock)` item identity — but any new local edits post-reload use the NEW clientID.
- Searched for "y-indexeddb HocuspocusProvider race" → **NOT FOUND as a bug**; only the benign caveat about default-init documented above.
- Searched for "y-indexeddb Yjs v14 compat" → no breakage reported through Yjs 13.6.x line (the OK pinned version). Library API has been stable since 2021.

---

## Implications for OK

1. **y-indexeddb handles the client-side preservation of pre-restart state across browser reload.** Each tab's Y.Doc persists across Cmd-R. The client recovers its local state without a network round-trip. This is useful on its own as an offline/reload UX improvement but does not directly fix the server-restart duplication bug.

2. **For PR #311's bug class**, y-indexeddb is COMPLEMENTARY, not a REPLACEMENT. Adopting it alongside:
   - The **server-instance-ID defense** (PR #311 Commits 1-4): still needed to force recycle when the server restarts AND changes identity — this is what cuts the duplicate-item path that y-indexeddb alone would not fix.
   - The **server-side sidecar** (PR #311 Commits 5-7): overlaps conceptually with y-indexeddb (both are binary persistence of Y.Doc state for restart recovery), but on different ends (server vs client). If the server-side sidecar is kept, both preserve a Y.Doc across restart on their respective sides. If the server-side sidecar is removed (defer to markdown-only + instance-ID recycle), y-indexeddb has no redundancy with it.

3. **No new conceptual risk** from y-indexeddb adoption. It uses the same origin-filter primitive the OK bridge already relies on. No ordering constraints, no initialization race on the happy path.

4. **`await provider.whenSynced` becomes mandatory before any default-init of shared types** — OK does not currently default-init, but this becomes a new invariant to document.

5. **Tab-session persistence across Cmd-R becomes automatic.** Today, Cmd-R discards Y.Doc + remote sync round-trip re-populates. With y-indexeddb, Cmd-R reads IDB and shows the last state instantly. Reconnect merges on top. This is a user-visible UX improvement independent of the bug fix.

---

## Gaps / follow-ups

- Quota-exceeded behavior (from D1) is a silent failure mode — would need wrapping to log. Also applies to the composition: if IDB fills up, updates are silently dropped, and the tab diverges from the server-authoritative truth on reload. Need a sentinel to detect.
- No tests in OSS (`y-indexeddb` repo) exercising the IDB + WebSocket race explicitly. Would need to add our own in `packages/app/tests/integration/` when adopting.
- `whenSynced` + HocuspocusProvider `isSynced` interaction semantics are not formally documented — both resolve to "ready" but in different orderings depending on network latency. Need empirical test (see D7).
