# Evidence: D4 — Existing codebase touchpoints for client-side IDB adoption (1P observation, 3P pattern)

**Dimension:** Which existing OK files would need to change, and how, to wire y-indexeddb into the client's Y.Doc lifecycle. Surface the integration boundaries and interactions with existing machinery.
**Date:** 2026-04-24
**Sources:** 1P inspection of current worktree at `packages/app/src/` — this section is 1P because the research question is "what does OK's client need to touch." Findings frame the factual boundaries; adoption choice is downstream.

---

## Integration surface map

Adoption requires touching four production files and one test-harness file. All five are already load-bearing; none are new.

### Primary: `packages/app/src/editor/provider-pool.ts`

**Current state (PR #311 at head):**
- `ProviderPool` — LRU pool of `HocuspocusProvider` instances, keyed by `docName`.
- `open(docName)` constructs `new HocuspocusProvider({ url, name: docName, token })` at line 239.
- `recycleDisconnectedEntry(docName)` tears down an entry and re-opens; `recycleAllEntries()` (added in PR #311) iterates and recycles all entries on server-instance-mismatch.
- Entry has: `provider`, `observerCleanup`, `syncState`, lifecycle flags.

**Adoption change:**
- Construct `IndexeddbPersistence(docName, provider.document)` immediately after `new HocuspocusProvider(...)`.
- Store on `PoolEntry` as new field `idbPersistence`.
- On entry teardown (recycle, evict, dispose), call `idbPersistence.destroy()` BEFORE `provider.destroy()`. Destroying IDB provider unhooks its `doc.on('update')` listener but does NOT delete stored data (D1) — this is intentional: the NEXT provider for the same `docName` will rehydrate from IDB.

**Lines of impact:**
- Import addition: `import { IndexeddbPersistence } from 'y-indexeddb'` (1 LOC)
- `PoolEntry` type: `idbPersistence: IndexeddbPersistence | null` (1 LOC)
- In `open()`: post-provider instantiation (1 LOC) — attach y-indexeddb
- In `recycleDisconnectedEntry` + `recycleAllEntries` + `evictLru` + `dispose`: teardown call (3 call sites × 1 LOC = 3 LOC)
- Total: ~6 LOC in provider-pool.ts.

**Key invariants to preserve:**
- `entry.tearingDown` gating (checked in `onStatus`, `onSynced`, `onClose`) — IDB must not resurrect an entry that's being torn down. Since y-indexeddb hooks `doc.on('update')` synchronously in constructor, the teardown order is `idbPersistence.destroy()` first (unhook), THEN `provider.destroy()` (which destroys Y.Doc, which fires `destroy` event that y-indexeddb already listens for — redundant but harmless).
- The `authenticationFailed → recycleAllEntries` path must NOT fall through to IDB rehydration for the SAME provider instance. It destroys the provider + entry, then `open()` reconstructs fresh — rehydration happens on the fresh entry, which is correct.

**Note — `provider.document` is the canonical Y.Doc accessor** (line 297). HocuspocusProvider owns the Y.Doc by default unless one is passed in via `document:` constructor option. For consistency with `SystemDocSubscriber.tsx` (which DOES pass its own Y.Doc), either is fine — IDB just needs the same reference.

### Primary: `packages/app/src/components/SystemDocSubscriber.tsx`

**Current state:**
- Construct `new Y.Doc()` + `new HocuspocusProvider({ url, name: SYSTEM_DOC_NAME, document: doc })` at line 61-92.
- Subscribes to `__system__` stateless broadcasts (CC1 channels: `files`, `backlinks`, `graph`, `server-info`, plus awareness-based agent-presence nav).

**Adoption decision:**
- **DO NOT attach y-indexeddb to `__system__` Y.Doc.** `__system__` is push-only ephemeral channels (derived view invalidation signals, agent presence). No user content. Persisting to IDB wastes space + adds complexity without benefit.
- Zero LOC change here.

**Verification rationale:**
- `SYSTEM_DOC_NAME` is reserved by `ContentFilter` + `isSystemDoc()` at the server (CLAUDE.md STOP rule). The Y.Doc never contains XmlFragment or Y.Text content — only awareness state (agent-presence) and stateless broadcasts (CC1 signals). Agent-presence is ephemeral by design (awareness is memory-only; server deterministic cleanup). CC1 signals are pushed once and never replayed.
- Persisting `__system__` to IDB would give no UX benefit and add schema-migration work across app versions.

### Primary: `packages/app/src/editor/DocumentContext.tsx`

**Current state (PR #311 at head):**
- Owns `ProviderPool` instance per `collabUrl`.
- Fires `fetch('/api/server-info')` at pool attach time for the instance-ID cache seed.

**Adoption change:**
- No direct change. The pool owns y-indexeddb lifecycle; DocumentContext just calls `pool.open(docName)`.
- Total: 0 LOC.

### Secondary: `packages/app/src/editor/observers.ts` + `packages/server/src/server-observers.ts`

**Current state:**
- Server-authoritative bridge: XmlFragment ↔ Y.Text via `OBSERVER_SYNC_ORIGIN` (server-side). Client-side observers are baseline-tracking only (precedent #14).

**Adoption interaction:**
- IDB-restored updates fire `doc.on('update')` with `origin === idbPersistence` (D2). This `origin` is a provider-instance object, NOT the `OBSERVER_SYNC_ORIGIN` sentinel.
- The server-side observer bridge only runs on the SERVER side. Client-side observers today run in "baseline tracking only" mode — which means they read state but don't write back. Safe.
- No change to bridge code needed.

**Subtle interaction to verify:** When IDB hydrates the Y.Doc synchronously during provider construction, do the client's baseline trackers see the hydrated state on their `observe` callback? Yes — `Y.transact` fires `afterAllTransactions` once all updates are applied. Client-side observers attach on `provider.on('synced')`, which (in the IDB case) fires after `whenSynced`. Timing is fine.

**Multi-provider origin filtering:** When HocuspocusProvider later receives a server update, it applies via its own origin. IDB's `_storeUpdate` filter (D2) skips self; persists everything else. No feedback loop. No change to observers needed.

### Secondary: `packages/app/src/editor/editor-cache.ts`

**Current state:**
- `findProvider(docName)` looks up an active provider from the pool for test/diagnostic use.
- `editor-cache` manages Editor/EditorView instances separately from providers.

**Adoption change:**
- 0 LOC. Editor cache is orthogonal to persistence — it manages ProseMirror/CodeMirror views, not Y.Doc state.
- Cache eviction does NOT destroy the Y.Doc (provider stays alive in pool). So IDB persistence is unaffected by editor cache churn.

### Secondary: `packages/app/tests/integration/test-harness.ts`

**Current state:**
- `createTestClient(port, docName?, opts?)` — constructs a `HocuspocusProvider` pointed at a test server.
- Many scenario tests construct providers directly; some use the `ProviderPool` end-to-end.

**Adoption change:**
- Must import and register `fake-indexeddb/auto` at the top of every test file that exercises IDB-participating flows. Or register globally in a `bunfig.toml` `preload` hook. The latter is cleaner — one line of config, zero per-test noise.
- `createTestClient` gets an option `withIdb: boolean` (default false) to control whether a test client participates in IDB persistence. Tests today assume server-authoritative-only; adding IDB would change expected behavior (previous state persists across client recycle).
- Tests that exercise restart (T1, T2, T3, T4, T6, T9, T10, T11) MUST opt in to `withIdb: true` and potentially need assertions adjusted to match the "client brings state" model.
- Net: ~20 LOC of harness additions, plus a `bunfig.toml` entry (1 LOC).

### Tertiary: `packages/app/src/editor/sync-promise.ts`

**Current state:**
- Bridges HocuspocusProvider's `synced` event to React Suspense via `use(promise)`. React `Suspense` waits on `provider.on('synced', ...)`.

**Adoption interaction:**
- No direct change. `provider.on('synced')` is HocuspocusProvider's own event — fires when server-sync handshake completes.
- **UX consideration:** In Scenario A, the user sees IDB state INSTANTLY on page load (before sync-promise resolves). The editor could render from IDB-hydrated Y.Doc before server sync. This is the whole point of y-indexeddb offline support.
- To EXPOSE this as UX: either (a) render from IDB state before `provider.synced = true` (requires rework of the Suspense boundary), or (b) await `idbPersistence.whenSynced` SEPARATELY from `provider.synced`.
- Minimal-change route: keep `provider.synced`-based Suspense; accept that the IDB state doesn't get shown until server-sync completes. The user-visible benefit is still "restart is invisible" because server-sync normally completes <2s.
- To unlock the "instant IDB render" UX benefit: more work (maybe ~50 LOC), but purely additive — punt to a follow-on if desired.

### Out of scope: Shadow repo, attribution, file watcher, persistence

**Verification:**
- `packages/server/src/shadow-repo.ts` — operates on git refs, not Y.Doc state. No interaction with client-side IDB.
- `packages/server/src/file-watcher.ts` — operates on disk markdown files. No interaction with client-side IDB.
- `packages/server/src/persistence.ts` — the server's markdown-write path. Unchanged in Scenario A (simplified); unchanged in Scenario B (stays as PR #311 delivered).

---

## Branch-switch interaction (the load-bearing unsolved piece for Scenario A)

**Current state (with PR #311 + server-side sidecar):**
- On branch switch, server emits `onBatchBegin` → `onBatchEnd`. In `onBatchBegin`, call `deleteSidecarsForBranch(contentDir)` (PR #311 Commit 7). Sidecars regenerate on next L1 debounce.
- Server Y.Doc gets wholesale-replaced from new branch markdown via `updateYFragment`.
- **Test T5 (branch-switch-live-client)** confirms: content settles to new-branch state without bleed-through.

**Scenario A interaction:**
- Server-side sidecar gone → nothing to delete on branch switch.
- **BUT client-side IDB would still contain pre-switch items.** On next IDB hydration (e.g., page reload during a branch switch), the client would load pre-switch state and sync with post-switch server — same content-duplication bug class on the server's single clientID.

**Three options to solve this in Scenario A:**

| Option | Mechanism | Tradeoffs |
|--------|-----------|-----------|
| **A1. CC1 broadcast + client clearData()** | Server emits CC1 `branch-switched` signal; each client calls `idbPersistence.clearData()` for every open doc + recycles provider. | Live clients handle switch instantly. Disconnected clients (closed tabs) hydrate from stale IDB on return and need catch-up. |
| **A2. Branch-scoped IDB name** | IDB `docName` becomes `<branch>@<docName>` (or similar); branch switch naturally rotates to a fresh IDB name. | Clean boundary. Cross-branch state (per-doc `custom` kv store) doesn't ferry. IDB space usage grows linearly with branch count. |
| **A3. IDB metadata check on hydration** | Each IDB doc stores its current branch in the `custom` kv store; on hydration, if branch ≠ server's current branch, call `clearData()` + refetch. | Dynamic, handles disconnected clients. Extra round-trip at each hydration (fetch server's current branch). |

Option A1 is closest to PR #311's existing design pattern (CC1 broadcast, already wired via `server-info` channel). Cleanest fit.

Option A2 is simplest to implement but changes IDB db names across switches — some amount of storage bloat but IDB doesn't count against the markdown-truth primacy.

Option A3 is the most defensive (handles reload-during-disconnect) but requires a small server API to expose "what's my current branch" at hydration time.

Any of the three adds ~100-200 LOC. This is the "cost you pay in Scenario A for removing the server-side sidecar." The server-side sidecar in PR #311 has ~40 LOC of branch-switch handling; the client-side equivalent is LARGER (roughly 2-5×) because of the round-trip + lifecycle complexity. This partially offsets Scenario A's LOC savings.

---

## Managed-rename interaction

**Current state (T8 test):**
- `/api/rename` handler rewrites markdown filenames + `[[WikiLink]]` references in both source and destination docs.
- Server's Y.Doc for renamed doc is unaffected structurally (doc name doesn't change inside Y.Doc).
- Hocuspocus `docName` (the WebSocket path) DOES change — clients reconnect to the new path.

**Scenario A interaction:**
- Client's IDB for old `docName` → stale, never accessed again.
- Client's IDB for new `docName` → may or may not exist; on first open post-rename, IDB db is empty → new provider syncs from server cleanly.
- Stale IDB accumulates. Periodic GC desired but not critical (size bounded by PREFERRED_TRIM_SIZE × avg update size per doc).
- **Low risk.** Optional: add rename-time `clearData` on old name via CC1 `doc-renamed` channel.

---

## Agent-presence / CC1 interaction

**Current state:**
- CC1 (push-over-awareness) runs on `__system__` Y.Doc awareness + stateless broadcasts.
- Channels: `server-info`, `files`, `backlinks`, `graph`.

**Scenario A interaction:**
- 0 LOC change. CC1 is protocol-level; IDB is persistence-level. Orthogonal.
- Agent-presence awareness state is memory-only; no IDB persistence concern.

---

## Summary of integration surface (Scenario A)

| File | LOC change | Complexity |
|------|-----------:|-----------|
| `provider-pool.ts` | ~6 | Low |
| `DocumentContext.tsx` | 0 | — |
| `SystemDocSubscriber.tsx` | 0 | — |
| `observers.ts` / `server-observers.ts` | 0 | — |
| `editor-cache.ts` | 0 | — |
| `sync-promise.ts` | 0 (minimal route) / ~50 (full UX) | Low / Medium |
| `test-harness.ts` | ~20 | Low |
| `bunfig.toml` (fake-indexeddb preload) | 1 | — |
| Branch-switch mechanism (new) | ~100-200 | Medium |
| `package.json` (+y-indexeddb, +fake-indexeddb) | 2 | — |
| **Total (minimal)** | **~130-230 LOC** | |

Compared to D3's estimate (~200 LOC), this is consistent. Branch-switch work dominates.

---

## Negative findings

- **No pre-existing IndexedDB usage in the app.** `grep -rn "indexedDB\|IDBDatabase\|IndexeddbPersistence" packages/app/src/` returns nothing. Greenfield adoption, no migration of existing IDB schemas to coordinate.
- **No pre-existing worker-thread code that would conflict with IDB transactions.** IDB in main thread is the simplest topology.
- **No service workers or PWA manifest** that would claim the IDB space separately. Clean single-claimant model.

---

## Gaps / follow-ups

- Verify y-indexeddb's IDB name space doesn't collide with anything Playwright/Vite internals might use during dev (unlikely, but worth a quick grep).
- Confirm Safari / Firefox / Chrome IDB quota behavior: does quota-exceeded silently fail? (Deferred to D6 risks.)
- Decide between A1/A2/A3 for branch-switch handling — decision for D7.
