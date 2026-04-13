---
title: "destroy() fix — investigation findings"
date: 2026-04-11
sources:
  - packages/server/src/standalone.ts
  - packages/server/src/agent-sessions.ts
  - packages/server/src/shadow-repo.test.ts
  - packages/cli/src/commands/start.ts
  - packages/app/src/server/hocuspocus-plugin.ts
  - node_modules/.bun/@hocuspocus+server@4.0.0-rc.1+e2f9819782f4683d/node_modules/@hocuspocus/server/src/DirectConnection.ts
  - node_modules/.bun/@hocuspocus+server@4.0.0-rc.1+e2f9819782f4683d/node_modules/@hocuspocus/server/src/Document.ts
  - node_modules/.bun/@hocuspocus+server@4.0.0-rc.1+e2f9819782f4683d/node_modules/@hocuspocus/server/src/Hocuspocus.ts
  - node_modules/.bun/@hocuspocus+server@4.0.0-rc.1+e2f9819782f4683d/node_modules/@hocuspocus/server/src/types.ts
---

# Investigation findings — autonomous resolution

All findings from reading first- and third-party source during the iterative loop of this spec.

## Finding 1 — OQ-01: DirectConnection.transact() does trigger the L1 debounce

**Verdict:** ✅ RESOLVED. Local-origin transactions from `DirectConnection.transact()` DO populate the `onStoreDocument` debounce queue. The regression test plan is valid.

**Evidence chain:**

1. `DirectConnection.transact()` in `@hocuspocus/server/src/DirectConnection.ts:29-44` calls:
   ```typescript
   this.document.transact(fn, {
     source: "local",
     context: this.context,
   } satisfies LocalTransactionOrigin);
   ```
   Note: **it does not set `skipStoreHooks: true`** — the default applies.

2. `Document` (subclassing Y.Doc) registers a Y.Doc `"update"` handler in its constructor (`Document.ts:53`):
   ```typescript
   this.on("update", this.handleUpdate.bind(this));
   ```

3. `Document.handleUpdate` at `Document.ts:221-233` (call at line 222) invokes `this.callbacks.onUpdate(this, origin, update)`.

4. Hocuspocus wires that callback in `createDocument` at `Hocuspocus.ts:417-423`:
   ```typescript
   document.onUpdate((doc, origin, update) => {
     this.handleDocumentUpdate(document, origin, update);
   });
   ```

5. `Hocuspocus.handleDocumentUpdate` at `Hocuspocus.ts:263-311` calls `this.storeDocumentHooks(document, storePayload)` at line 310 — **unless** `shouldSkipStoreHooks(origin)` returns true at line 297.

6. `shouldSkipStoreHooks` at `types.ts:40-50`:
   ```typescript
   export function shouldSkipStoreHooks(origin: unknown): boolean {
     if (!isTransactionOrigin(origin)) return false;
     switch (origin.source) {
       case "connection": return false;
       case "redis":      return true;
       case "local":      return origin.skipStoreHooks ?? false;
     }
   }
   ```

7. Since `DirectConnection.transact()` doesn't set `skipStoreHooks`, and `origin.source === "local"`, this returns `false`, and `storeDocumentHooks()` fires → the onStoreDocument debouncer is armed.

**Consequence for the regression test:** A call to `dc.transact(fn)` followed immediately by `server.destroy()` is a valid way to exercise the bug — without the fix, the content written inside the `fn` would be stranded in the L1 debounce queue. With the fix, `flushAllStoresAndWait()` drains it.

---

## Finding 2 — OQ-02: L2 commit assertion pattern

**Verdict:** ✅ RESOLVED. Use the same pattern as `shadow-repo.test.ts`.

**Evidence.** From `packages/server/src/shadow-repo.test.ts:132-134` (corrected 2026-04-11 audit pass):

```typescript
test('creates commit on refs/wip/<branch>/<writer-id>', async () => {
  const sha = await commitWip(shadow, writer, 'content/docs', 'WIP: intro');
  // ...
  // Verify ref exists (default branch = 'main')
  const sg = shadowGit(shadow);
  const refSha = (await sg.raw('rev-parse', `refs/wip/main/${writer.id}`)).trim();
  // refSha should equal sha
});
```

And the `shadowGit` helper at `packages/server/src/shadow-repo.ts:41-49`:

```typescript
export function shadowGit(shadow: ShadowHandle) {
  return simpleGit({
    baseDir: shadow.workTree,
    timeout: { block: GIT_TIMEOUT_MS },
  }).env({
    GIT_DIR: shadow.gitDir,
    GIT_WORK_TREE: shadow.workTree,
  });
}
```

It's exported from `@inkeep/open-knowledge-server` via `packages/server/src/index.ts:69`.

**Pattern for the new test:**

```typescript
import { shadowGit, initShadowRepo } from '@inkeep/open-knowledge-server';
// beforeEach — construct a shadow handle independently since ServerInstance
// doesn't expose one. Pass it to createServer via ServerOptions.shadowRepo.
const shadowHandle = await initShadowRepo(projectDir);
const server = createServer({ contentDir, projectDir, shadowRepo: shadowHandle, /* ... */ });

// ... after destroy() ...
const sg = shadowGit(shadowHandle);
const log = await sg.raw('log', '--oneline', 'refs/wip/main');
expect(log).toContain('commit message from persistence extension');
```

**Caveat for the spec:** The shadow repo's working-tree path depends on whether an existing project `.git/` exists (`.git/openknowledge/`) vs standalone. Tests construct `shadowHandle` via `initShadowRepo(projectDir)` explicitly, which gives deterministic control over the layout without relying on whether the tmpdir was `git init`'d.

Since `ServerOptions.shadowRepo` already accepts a pre-initialized handle (see `standalone.ts:67` — `shadowRepo?: ShadowHandle`), the test path doesn't need `ServerInstance` to expose the handle — it just passes its own in. **No API surface expansion needed.**

---

## Finding 3 — OQ-03: Failing onStoreDocument injection

**Verdict:** ✅ RESOLVED. Push an extension to `server.hocuspocus.configuration.extensions` post-construction. Same pattern used by `standalone.ts:153` for the API extension, and by `§8.1` of the spec's `flushAllStoresAndWait()` helper.

**Test code sketch:**

```typescript
test('destroy() completes within 10s even if onStoreDocument throws', async () => {
  const server = createServer({ /* ... */ });
  await server.ready;

  // Inject a failing onStoreDocument hook
  server.hocuspocus.configuration.extensions.push({
    async onStoreDocument() {
      throw new Error('simulated store failure');
    },
  });

  // Trigger a write that would schedule onStoreDocument
  const conn = await server.hocuspocus.openDirectConnection('test-doc');
  await conn.transact((doc) => {
    doc.getText('content').insert(0, 'hello');
  });

  const startedAt = Date.now();
  await server.destroy();
  const elapsed = Date.now() - startedAt;

  expect(elapsed).toBeLessThan(12_000); // 10s timeout + slack
});
```

**Caveat:** Hocuspocus's extension hooks chain with `saveMutex.runExclusive`, and throwing `SkipFurtherHooksError` vs generic `Error` has different semantics (`Hocuspocus.ts:475-491`). For our test we want a **generic** Error that triggers the "Document stays in memory to avoid data loss" branch at line 486-490, which is what causes `afterUnloadDocument` to never fire — which is what we want to trigger the 10s timeout.

---

## Finding 4 — OQ-05: Phase ordering is correct

**Verdict:** ✅ RESOLVED. Phase 2 (`sessionManager.closeAll()`) before Phase 3 (`flushAllStoresAndWait()`) is correct because `DirectConnection.disconnect()` triggers an **immediate** store via `storeDocumentHooks(doc, payload, immediately=true)`.

**Evidence:**

1. `DirectConnection.disconnect()` at `@hocuspocus/server/src/DirectConnection.ts:46-89` — the specific `storeDocumentHooks(..., true)` call is at lines 50-64:
   ```typescript
   await this.instance.storeDocumentHooks(this.document, { ... }, true);  // immediately = true
   ```

2. `Hocuspocus.storeDocumentHooks()` at `Hocuspocus.ts:461-502` signature:
   ```typescript
   storeDocumentHooks(document, hookPayload, immediately?: boolean)
   ```
   passes `immediately ? 0 : this.configuration.debounce` to the debouncer. When called with `immediately=true`, the debounce interval is 0 → executes synchronously.

3. After the store, `DirectConnection.disconnect()` conditionally calls `this.instance.unloadDocument(this.document)` at line 84 if `getConnectionsCount() === 0 && !saveMutex.isLocked()`. So an agent-only document IS unloaded as part of phase 2.

4. Any documents still in `hocuspocus.documents` after phase 2 (i.e., those with active human WebSocket connections) are handled by phase 3's `flushAllStoresAndWait()`.

**Implication for §8.2:** Phase 2 → Phase 3 ordering is correct. **No change to the spec's proposed order.** The layered drain handles both agent-held and human-held documents without race.

---

## Finding 5 — A7: Callers of `destroy()` + idempotency concern

**Verdict:** ✅ RESOLVED (with a new concern promoted to OQ-04).

**Only production caller:** `packages/cli/src/commands/start.ts:37-57`:

```typescript
const { hocuspocus, destroy } = createServer({ ... });

const shutdown = async () => {
  console.log(dim('\nShutting down...'));
  await destroy();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
```

**Concurrent-call risk:** If SIGINT arrives and then SIGTERM arrives before `destroy()` resolves (e.g., user presses Ctrl+C twice, or OS sends SIGTERM after SIGINT), **the same `shutdown` closure is invoked twice**, each call awaits `destroy()` separately. The two `destroy()` calls race against each other through the same code.

**What breaks without an idempotency guard:**
- Phase 1 tries to `unsubscribe()` a watcher that's already been set to null — no-op thanks to `if (watcher)` guard. OK.
- Phase 3 pushes a **second** `afterUnloadDocument` extension. Now there are two hooks, both waiting on `getDocumentsCount() === 0`, both called on every unload. Not a correctness issue, just clutter.
- Phase 4 calls `persistence.flushPendingGitCommit()` twice. Per `persistence.ts:264-279`, the first call clears the timer and awaits `commitInFlight`; the second call finds no timer and returns immediately. Idempotent. OK.
- Phase 5 calls `destroyShadowRepo()` on a stale `shadowRef.current`. Depending on implementation, may throw. **Risky.**

**Recommendation: add an `isDestroying` guard** — OQ-04 is promoted from "low priority" to "must resolve" since the CLI exposes this race today.

**Test requirement:** add an idempotency case to the regression test that calls `destroy()` twice concurrently and asserts no throw, no duplicate side effects, and a clean shadow repo on disk.

---

## Finding 6 — OQ-NEW-F: Vite dev plugin uses raw Hocuspocus, not createServer()

**Verdict:** ✅ RESOLVED. `packages/app/src/server/hocuspocus-plugin.ts` uses `new Hocuspocus({ ... })` directly (line 88), not `createServer()` from the server package. It does NOT call `destroy()` — on HMR it calls `activeWatcher.unsubscribe()` (lines 176, 191) but nothing else.

**Consequence:**
- The Vite dev plugin is NOT affected by this spec's fix (it doesn't go through `createServer().destroy()`).
- It may have its own version of the same bug, since it uses the same `persistence` extension underneath. But the Vite plugin's "shutdown" only fires on HMR in local dev, so the blast radius is "a dev lost the last keystroke on hot reload." Low stakes; explicitly Future Work.
- **Noted as a Future Work item (OQ-P2-05).**

---

## Finding 7 — OQ-NEW-A: Actual data-loss window is 2s–10s, not just 2s

**Verdict:** Initial spec text understated. The L1 debouncer uses `configuration.debounce` (default 2000ms) for the interval and `configuration.maxDebounce` (default 10000ms) for the hard ceiling when debounce keeps resetting.

**Evidence:** `Hocuspocus.ts:499-500`:
```typescript
immediately ? 0 : this.configuration.debounce,
this.configuration.maxDebounce,
```

OK passes `debounce: 2000`, `maxDebounce: 10000` via `ServerOptions` (`packages/cli/src/config/schema.ts:26-29`).

Scenario: user types continuously for 10s. Each keystroke resets the 2s debounce. After 10s of resets, `maxDebounce` forces the store to execute. If destroy() lands at second 9.9, **up to 10 seconds of writes could be stranded** in the queue — not 2.

**Action:** Update §1 Problem statement to read "up to 2-10 seconds" (or just "up to the `maxDebounce` configured value"). Minor correction, not a decision.
