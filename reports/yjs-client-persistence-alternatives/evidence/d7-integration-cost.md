# Evidence: D7 — Integration cost (1P)

**Dimension:** LOC delta, file touch-points, test-harness changes, patchedDependencies friction for adopting y-indexeddb via Shape 2+ (replace server-side sidecar).
**Date:** 2026-04-24
**Sources:** 1P inspection of current worktree + PR #311 diff; prior y-indexeddb report D4.

---

## LOC delta summary (Shape 2+)

| Category | LOC | Direction |
|----------|-----|-----------|
| **Eliminated** — server-side sidecar | | |
| `packages/server/src/sidecar.ts` | −319 | OUT |
| `packages/server/src/sidecar.test.ts` | −347 | OUT |
| `packages/server/src/persistence.ts` sidecar integration | −100 | OUT |
| `packages/server/src/persistence.test.ts` sidecar tests | −200 | OUT |
| `packages/server/src/standalone.ts` `deleteSidecarsForBranch` call | −5 | OUT |
| `packages/server/src/fs-traced.ts` `tracedUnlink` + `tracedRm` (if unused elsewhere) | −16 | OUT (conditional) |
| `packages/server/src/index.ts` sidecar exports | −5 | OUT |
| `packages/cli/src/content/init.ts` `.open-knowledge/ystate/.gitignore` scaffold | −3 | OUT |
| `packages/server/README.md` sidecar section | −49 | REVISE |
| `CLAUDE.md` sidecar STOP rule + Server README pointer | −10 | REVISE |
| **Subtotal eliminated** | **~−1054 LOC** | |
| **Added** — client-side persistence | | |
| `packages/app/src/editor/client-persistence.ts` (new): y-indexeddb wrapper + buffer-and-replay helpers + TS types | +150 | IN |
| `packages/app/src/editor/client-persistence.test.ts` (new): unit tests for wrapper + buffer | +200 | IN |
| `packages/app/src/editor/provider-pool.ts` (modify): attach persistence per open; wire buffer-and-replay into `recycleAllEntries` | +80 | IN |
| `packages/app/src/editor/provider-pool.test.ts` (modify): persistence-specific unit tests | +80 | IN |
| `packages/app/src/editor/branch-invalidation.ts` (new): CC1 `branch-switched` listener + `clearData` orchestration | +60 | IN |
| `packages/app/src/components/SystemDocSubscriber.tsx` (modify): add `branch-switched` channel listener | +20 | IN |
| `packages/app/src/lib/cc1.ts` (modify): `parseCC1BranchSwitched` + `CC1_CHANNEL_BRANCH_SWITCHED` | +25 | IN |
| `packages/server/src/cc1-broadcast.ts` (modify): `emitBranchSwitched(broadcaster, branch)` helper + emit in `onBatchEnd` | +20 | IN |
| `packages/server/src/standalone.ts` (modify): invoke `emitBranchSwitched` on branch switch | +5 | IN |
| `packages/app/tests/integration/test-harness.ts` (modify): fake-indexeddb seeding + helpers | +30 | IN |
| `packages/app/tests/integration/branch-switch-live-client.test.ts` (revise T5): swap sidecar assertion for IDB assertion | +10 / −5 | REVISE |
| `packages/app/tests/integration/provider-pool-reconnect.test.ts` (augment T4): buffer-and-replay assertion | +20 | IN |
| New tests: `provider-pool-buffer-replay.test.ts` (T12) | +120 | IN |
| New tests: `cold-start-empty-idb.test.ts` (T13) | +80 | IN |
| New tests: `populated-idb-stale-server.test.ts` (T14) | +80 | IN |
| `bunfig.toml` (new or modify): `fake-indexeddb/auto` preload | +1 | IN |
| `packages/app/package.json` (modify): `y-indexeddb` + `fake-indexeddb` deps | +2 | IN |
| `package.json` top-level: `patchedDependencies["y-indexeddb"]` entry | +1 | IN |
| `patches/y-indexeddb@9.0.12.patch` (new): issue #31 fix + issue #44 error callback | +20 | IN |
| `packages/server/README.md` §"CRDT server-restart recovery" rewrite | +30 | REVISE |
| `CLAUDE.md` STOP rule rewrite + new Client Persistence section | +30 | REVISE |
| **Subtotal added** | **~+1064 LOC** | |
| **Net delta** | **~+10 LOC** (approximately flat) | |

**Net story:** Shape 2+ is roughly LOC-neutral but shifts complexity from server-side to client-side. The gains are ARCHITECTURAL (client-persistence is idiomatic per Yjs ecosystem; server-sidecar is a Jupyter-specific port) and UX (instant Cmd-R, offline editing, no sub-L1 loss).

---

## File touch-points (Shape 2+)

### Files DELETED

- `packages/server/src/sidecar.ts`
- `packages/server/src/sidecar.test.ts`

### Files CREATED

- `packages/app/src/editor/client-persistence.ts` — y-indexeddb wrapper, buffer-and-replay primitives
- `packages/app/src/editor/client-persistence.test.ts`
- `packages/app/src/editor/branch-invalidation.ts` — CC1 `branch-switched` handler
- `packages/app/tests/integration/provider-pool-buffer-replay.test.ts` (T12)
- `packages/app/tests/integration/cold-start-empty-idb.test.ts` (T13)
- `packages/app/tests/integration/populated-idb-stale-server.test.ts` (T14)
- `patches/y-indexeddb@9.0.12.patch`
- `bunfig.toml` (may already exist; just add preload)

### Files MODIFIED

- `packages/server/src/persistence.ts` — remove sidecar load/write/divergence logic; restore simpler markdown-only path
- `packages/server/src/persistence.test.ts` — remove sidecar-specific cases
- `packages/server/src/standalone.ts` — remove `deleteSidecarsForBranch` call; add `emitBranchSwitched` invocation
- `packages/server/src/cc1-broadcast.ts` — add `emitBranchSwitched`
- `packages/server/src/index.ts` — remove sidecar re-exports
- `packages/server/README.md` — rewrite §"CRDT server-restart recovery" to describe client-persistence model
- `packages/cli/src/content/init.ts` — remove `.open-knowledge/ystate/.gitignore` scaffold
- `packages/app/src/editor/provider-pool.ts` — attach persistence + wire buffer-and-replay
- `packages/app/src/editor/provider-pool.test.ts`
- `packages/app/src/components/SystemDocSubscriber.tsx` — subscribe to `branch-switched`
- `packages/app/src/lib/cc1.ts` — add `parseCC1BranchSwitched` + channel constant
- `packages/app/tests/integration/test-harness.ts` — fake-indexeddb helpers
- `packages/app/tests/integration/branch-switch-live-client.test.ts` (T5) — swap assertion
- `packages/app/tests/integration/provider-pool-reconnect.test.ts` (T4) — add buffer-replay assertion
- `packages/app/package.json` — `y-indexeddb@9.0.12` + `fake-indexeddb@^6` deps
- `package.json` (root) — `patchedDependencies` entry
- `CLAUDE.md` — rewrite sidecar STOP rule as client-persistence STOP rule

### Files UNCHANGED

- `packages/server/src/auth-token-schema.ts` — kept; instance-ID defense required
- `packages/server/src/api-extension.ts` — `/api/server-info` endpoint stays
- `packages/app/src/editor/DocumentContext.tsx` — boot-time fetch stays
- All Y.Doc observer / bridge files — orthogonal
- Shadow-repo, file-watcher, persistence (markdown I/O path) — unchanged beyond sidecar removal

---

## Test-harness changes

### bunfig.toml

```toml
# At workspace root or in packages/app/
preload = ["./tests/integration/idb-preload.ts"]
```

```ts
// packages/app/tests/integration/idb-preload.ts
import 'fake-indexeddb/auto';
```

One-line global preload. Applies to all `bun test` runs in the `packages/app` workspace.

### Test harness primitives

Add to `test-harness.ts`:
- `resetFakeIndexedDB()` — clears all fake-indexeddb state between tests. (fake-indexeddb resets per file by default; per-test isolation via unique doc names.)
- `seedClientPersistenceState(docName, updates: Uint8Array[])` — pre-populate a given fake-IDB with specific updates, for simulating "client has pre-existing state."
- `readClientPersistenceState(docName): Promise<Y.Doc>` — read fake-IDB for a doc and return the hydrated Y.Doc for assertions.
- `assertIDBEmpty(docName)` — assert that fake-IDB has no persisted updates for this doc.

### Test pattern transition

Today's test pattern (post-PR-311):
```ts
const ystateDir = join(contentDir, '.open-knowledge', 'ystate');
if (existsSync(ystateDir)) { /* assertion */ }
```

New pattern (Shape 2+):
```ts
await assertIDBEmpty(docName);  // or similar
```

Trivial swap; mechanism-agnostic assertions stay identical.

---

## `patchedDependencies` setup

OK's pattern (from CLAUDE.md markdown-pipeline section):

```json
// package.json (root)
{
  "patchedDependencies": {
    "remark-prosemirror@0.1.5": "patches/remark-prosemirror@0.1.5.patch",
    "y-indexeddb@9.0.12": "patches/y-indexeddb@9.0.12.patch"
  }
}
```

### The patch

```diff
--- a/src/y-indexeddb.js
+++ b/src/y-indexeddb.js
@@ -82,8 +82,11 @@ export class IndexeddbPersistence extends Observable {
       /**
        * @param {IDBObjectStore} updatesStore
        */
-      const beforeApplyUpdatesCallback = (updatesStore) => idb.addAutoKey(updatesStore, Y.encodeStateAsUpdate(doc))
+      const beforeApplyUpdatesCallback = async (updatesStore) => {
+        const existing = await idb.count(updatesStore)
+        if (existing > 0) idb.addAutoKey(updatesStore, Y.encodeStateAsUpdate(doc))
+      }
```

This fixes issue #31 (doc growth on passive refresh). Per issue commentary, community-validated as safe.

Add error callback for issue #44 (Mobile Safari):

```diff
+  /**
+   * @param {Uint8Array} update
+   * @param {any} origin
+   */
   this._storeUpdate = (update, origin) => {
     if (this.db && origin !== this) {
       const [updatesStore] = idb.transact(this.db, [updatesStoreName])
-      idb.addAutoKey(updatesStore, update)
+      idb.addAutoKey(updatesStore, update).catch(err => {
+        console.warn(JSON.stringify({ event: 'ok-ydb-write-failed', err: err?.message ?? String(err) }))
+      })
```

Low-risk addition; observability win.

---

## `patchedDependencies` friction

Bun supports `patchedDependencies` natively (same mechanic as pnpm). OK already maintains one patch (`remark-prosemirror`). Pattern is proven and documented in CLAUDE.md.

Friction: when y-indexeddb upstream ever publishes a new version, OK has to re-apply or review. Low-frequency concern; upstream cadence is yearly-at-most.

---

## Cross-package coordination

Changes span:
- `packages/server` — sidecar removal, CC1 `branch-switched` emission
- `packages/app` — client persistence adoption, CC1 subscription, branch-invalidation
- `packages/cli` — trivial cleanup of init scaffold

All three packages are in a Bun workspace. Single `bun run check` at root validates cross-package changes. PR structure: single PR with mechanical review split by package.

## Summary

Shape 2+ is a NET ZERO LOC change (server-side complexity down, client-side up) that:
1. Eliminates ~1100 LOC server-side.
2. Adds ~1100 LOC client-side.
3. Swaps in a more-standard idiomatic Yjs pattern (client-side persistence + buffer-and-replay).
4. Preserves or improves all 11 existing test behaviors.
5. Adds 3 new tests for buffer-and-replay, cold-start, and populated-IDB scenarios.

Integration cost is moderate but well-scoped. Implementation plan in D8.
