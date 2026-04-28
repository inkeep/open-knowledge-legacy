# Evidence: D3 — Feature parity matrix (3P)

**Dimension:** Side-by-side comparison of y-indexeddb, DIY Yjs-on-IDB, DIY Yjs-on-OPFS, and DIY Yjs-on-SQLite-WASM along the feature axes that matter for OK's use case.
**Date:** 2026-04-24
**Sources:** y-indexeddb source (cloned), [MDN OPFS docs](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system), [MDN IDB storage limits](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Browser_storage_limits_and_eviction_criteria), [PowerSync 2025 review](https://www.powersync.com/blog/sqlite-persistence-on-the-web), prior y-indexeddb report D1/D2.

---

## Feature-by-feature matrix

| Feature | y-indexeddb | DIY Yjs-on-IDB | DIY Yjs-on-OPFS | DIY Yjs-on-SQLite-WASM |
|---------|:-----------:|:--------------:|:----------------:|:-----------------------:|
| **Meshed-provider model (attaches to existing Y.Doc)** | ✅ | ✅ (design to fit) | ✅ | ✅ |
| **Origin-based write filter (`origin !== self`)** | ✅ | ✅ | ✅ (must design) | ✅ (must design) |
| **`synced` event contract** | ✅ | ✅ | ✅ | ✅ |
| **`whenSynced` promise contract** | ✅ | ✅ | ✅ | ✅ |
| **`clearData()` to wipe state** | ✅ | ✅ | ✅ | ✅ |
| **`destroy()` closes without deleting** | ✅ | ✅ | ✅ | ✅ |
| **Auto-compaction (trim) on growth threshold** | ✅ (PREFERRED_TRIM_SIZE=500, non-configurable per-instance) | ✅ (make configurable) | ✅ (configurable) | ✅ (via SQL query) |
| **Custom kv metadata store per doc** | ✅ (`get`/`set`/`del` on `custom` store) | ✅ (add if needed) | ✅ (needs schema design) | ✅ (native via tables) |
| **Subdocument-aware** | ❌ (one IDB db per root doc) | ⚠️ (design choice) | ⚠️ (design choice) | ✅ (native via tables) |
| **Multi-tab coordination via BroadcastChannel** | ❌ (external `y-broadcastchannel` needed) | ⚠️ (can add) | ⚠️ (Web Locks + BroadcastChannel per conduit pattern) | ⚠️ (Web Locks + BroadcastChannel) |
| **Multi-tab coordination via Web Locks** | N/A | N/A | ✅ (idiomatic for OPFS sync handles) | ✅ (same) |
| **Quota-exceeded error propagation** | ❌ (fire-and-forget) | ✅ (can instrument) | ✅ | ✅ |
| **Corruption recovery (applyUpdate throw → fallback)** | ❌ (tab hangs per [yjs #479](https://github.com/yjs/yjs/issues/479) on infinite loop) | ⚠️ (same Yjs risk, but we control error flow) | ⚠️ (Worker isolates; tab doesn't hang — just Worker thread) | ⚠️ (same as OPFS; Worker isolates) |
| **Web Worker isolation for hydration** | ❌ (main thread) | ⚠️ (optional redesign) | ✅ (required) | ✅ (required) |
| **Schema migration hooks** | ❌ (fixed schema) | ✅ (design-in) | ✅ (design-in) | ✅ (ALTER TABLE) |
| **Encryption at rest** | ❌ (IDB plaintext) | ❌ (IDB plaintext; DB-level encryption not standard) | ❌ (OPFS plaintext) | ⚠️ (SQLite has SEE extension; not in wasm build) |
| **Observability / OTel hook points** | ❌ | ✅ (design-in) | ✅ (design-in) | ✅ (design-in) |
| **Bundle size delta on web** | ~8 KB min.gz | ~8 KB min.gz | ~10-30 KB + Worker code | +~400-1000 KB (WASM) |
| **Persistence layer performance for typical Yjs writes** | Good for small/medium docs | Same | Better for large (>100MB) docs | Best for large docs; overkill otherwise |
| **Hydration performance on page load** | Single IDB scan; good for <5MB docs, degrades at 100MB+ | Same | Better for very large docs (sync reads) | Best (indexed SQL query) |
| **Incremental disk-write cost** | ~1ms per update (IDB batch) | ~1ms per update | ~100μs per update (sync handle) | ~100μs per update |

---

## Key differentiators

### y-indexeddb wins on: ecosystem gravity, implementation cost

- 184 LOC of upstream code, zero in-house maintenance if it works for us.
- ~80K weekly npm downloads. Pattern is battle-tested across Tiptap, hundreds of collab apps.
- OK's existing `patchedDependencies` infrastructure handles any upstream issue we need to fix.

### DIY Yjs-on-IDB wins on: fix-ability, observability

- Custom TS types (e.g., branded `DocName`, discriminated `HydrationResult`).
- Native OTel spans on every write + read.
- Fix known bugs in-house (issue #31 doc growth fix is ~3 LOC).
- Explicit error callbacks for quota + corruption.
- Narrower API surface — ship only what we need.

### DIY Yjs-on-OPFS wins on: main-thread isolation, large-doc perf

- Hydration runs in Worker; main thread stays responsive even on multi-MB docs.
- Sync access handles are 10-100x faster than IDB for repeated small appends (per RxDB benchmarks).
- `yjs #479` infinite-loop on corrupt bytes becomes recoverable — Worker gets killed, main thread stays alive.

**But:** OK's typical doc size is a markdown file, usually <100KB. We're not in the regime where these wins matter.

### DIY Yjs-on-SQLite-WASM wins on: queryability, indexable state

- Can query "all doc names that have unsynced updates older than X."
- Indexed lookups for bulk operations.
- Transactional semantics via SQL BEGIN/COMMIT.
- Future-proofing for multi-doc queries we might want.

**But:** OK doesn't have multi-doc query use cases in client persistence today. The markdown+shadow-repo on the server handles cross-doc queries. Client persistence is strictly "remember my Y.Doc state." SQL is overkill.

---

## The API contract y-indexeddb establishes

All alternatives effectively replicate this API shape (or should, for meshed-provider compatibility):

```typescript
class IndexeddbPersistence extends Observable<'synced' | ...> {
  constructor(docName: string, doc: Y.Doc);
  whenSynced: Promise<this>;
  synced: boolean;
  destroy(): Promise<void>;
  clearData(): Promise<void>;
  get(key): Promise<unknown>;
  set(key, value): Promise<unknown>;
  del(key): Promise<undefined>;
}
```

Any DIY approach SHOULD target this same API surface to stay swap-able. If we ever decide to later experiment with OPFS, a well-designed DIY IDB implementation should let us swap impl without touching callers.

**Convention suggestion:** implement `ClientPersistenceProvider` interface in OK's codebase with this shape, backed by whichever concrete impl we pick.

---

## Feature parity findings relevant to PR #311's scenarios

For each key scenario in OK's 11-test suite:

### Scenario: Fast server restart (T1)

- y-indexeddb, DIY IDB, DIY OPFS, DIY SQLite-WASM: **all equivalent.** Client's Y.Doc state is preserved regardless of IDB/OPFS/SQLite backend. Fresh provider hydrates from local persistence; server-instance-ID defense forces clean recycle; no duplication.

### Scenario: Multi-client restart (T2)

- All four equivalent. Each client independently hydrates from its own local IDB/OPFS/SQLite.

### Scenario: Unsynced local edits during restart (T4)

- All four equivalent — the question is whether unsynced edits in memory were persisted before the restart. With y-indexeddb default `_storeTimeout = 1000ms` (debounce 1s), edits within the last 1s could be lost. DIY implementations can tune this lower (e.g., immediate write, at perf cost).

### Scenario: Branch switch while tab open (T5)

- All four require BRANCH-AWARE INVALIDATION. D4 of the y-indexeddb report covers three strategies (A1: CC1 broadcast, A2: branch-scoped IDB name, A3: hydration-time metadata check). Strategy choice is orthogonal to storage backend.

### Scenario: Agent write during restart (T6)

- All four equivalent.

### Scenario: Rollback / multi-client (T7)

- All four equivalent.

### Scenario: Managed rename with populated target (T8)

- All four equivalent — `docName` change means accessing a different IDB/OPFS/SQLite database name. Old database becomes stale; can be GC'd by rename-time `clearData` call.

### Scenario: External edit during downtime (T9)

- All four equivalent.

### Scenario: Y.Text source mode restart (T10)

- All four equivalent.

### Scenario: Mid-drain restart (T11)

- All four equivalent.

**Critical finding:** storage backend choice is **almost entirely orthogonal** to PR #311's scenarios. The correctness behavior is determined by (a) instance-ID defense, (b) `clearData()` on recycle, (c) branch-invalidation strategy. Those are all callable on any of the four backends.

Net: picking between the four is a **stack-fit + maintenance + engineering-cost decision**, not a correctness decision.

---

## Observations

### y-indexeddb's "fire-and-forget" is both a feature and a bug

It's a feature: simpler API, no error plumbing needed in the common case.
It's a bug: silent failures on quota-exceeded, silent failures on corruption.

For a production system, we'd want at minimum a telemetry signal for write failures. OK has `console.warn` conventions + `structured log JSON events` for aggregate-counted things (CLAUDE.md "Logging conventions"). A `patchedDependencies` patch adding `.catch(err => console.warn(JSON.stringify({ event: 'ydb-write-failed', err }))` in `_storeUpdate` is ~5 LOC, low-risk.

### `whenSynced` vs `provider.on('synced')` is a sharp API edge

y-indexeddb's `whenSynced` promise resolves on **IDB-synced**, not network-synced. HocuspocusProvider's `provider.on('synced')` fires on **server-synced**. These are different events. Any meshed-provider app needs to disambiguate — OK's editor today uses `sync-promise.ts` bridging `provider.on('synced')` to Suspense. Adding y-indexeddb means we have a SECOND "synced" signal. Decision: show content at IDB-synced (instant) or wait for HocuspocusProvider's network-synced (delayed)?

For PR #311's stated UX: network-synced is the current behavior; IDB-synced would be an ADDITIONAL UX enhancement. Not decided here.

---

## Gaps / follow-ups

- Actual perf numbers for "hydrate 10MB Y.Doc" across IDB vs OPFS vs SQLite-WASM, under Bun `fake-indexeddb` and real Chrome. Not critical for decision; defer to post-merge measurement.
- Quota-exceeded behavior under real browsers: see D5 (durability + performance).
- Bundle-size specifics for each approach under OK's Vite config — defer to impl-time if DIY is chosen.
