# Evidence: OQ-08 — Hocuspocus shutdown / flush source

**Dimension:** Hocuspocus public API for flushing pending onStoreDocument before shutdown
**Date:** 2026-04-11
**Sources:**
- `node_modules/.bun/@hocuspocus+server@4.0.0-rc.1+e2f9819782f4683d/node_modules/@hocuspocus/server/src/Hocuspocus.ts`
- `node_modules/.bun/@hocuspocus+server@4.0.0-rc.1+e2f9819782f4683d/node_modules/@hocuspocus/server/src/Server.ts`
- `node_modules/.bun/@hocuspocus+server@4.0.0-rc.1+e2f9819782f4683d/node_modules/@hocuspocus/server/src/util/debounce.ts`
- `https://github.com/ueberdosis/hocuspocus/blob/main/packages/server/src/Hocuspocus.ts` (verified upstream)
- `packages/server/src/standalone.ts`
- `packages/server/src/persistence.ts`

---

## Key files / pages referenced

- `Hocuspocus.ts:165-177` — `flushPendingStores()` definition
- `Hocuspocus.ts:461-502` — `storeDocumentHooks()` (the debounced wrapper around `onStoreDocument`)
- `Hocuspocus.ts:545-552` — `shouldUnloadDocument()` (checks for pending work)
- `Hocuspocus.ts:554-591` — `unloadDocument()` (calls `Document.destroy()`)
- `util/debounce.ts:1-77` — `useDebounce()` (the debouncer used internally)
- `Server.ts:200-225` — `Server.destroy()` (the only built-in shutdown helper)
- `packages/server/src/standalone.ts:399-424` — OK's `destroy()`
- `packages/server/src/persistence.ts:121-125` — `PersistenceHandle` type
- `packages/server/src/persistence.ts:264-279` — `flushPendingGitCommit()`
- `packages/server/src/persistence.ts:392-394` — `waitForPendingCommits()`

---

## Findings

### Finding: `Hocuspocus` class has NO `destroy()` method
**Confidence:** CONFIRMED
**Evidence:** `node_modules/.bun/@hocuspocus+server@4.0.0-rc.1+e2f9819782f4683d/node_modules/@hocuspocus/server/src/Hocuspocus.ts` (entire file) — no `destroy()` defined.

Verified against upstream `main` via WebFetch on `https://github.com/ueberdosis/hocuspocus/blob/main/packages/server/src/Hocuspocus.ts` — same result.

**Implications:** OK uses `new Hocuspocus(...)` directly (`packages/server/src/standalone.ts:130`) — not the higher-level `Server` class — so there is no built-in shutdown helper to inherit. OK is forced to assemble its own shutdown sequence.

---

### Finding: `Hocuspocus.flushPendingStores()` is fire-and-forget — returns `void`, not `Promise`
**Confidence:** CONFIRMED
**Evidence:** `node_modules/.bun/@hocuspocus+server@4.0.0-rc.1+e2f9819782f4683d/node_modules/@hocuspocus/server/src/Hocuspocus.ts:165-177`

```typescript
/**
 * Immediately execute all pending debounced onStoreDocument calls.
 * Useful during shutdown to ensure documents are persisted and unloaded
 * before the server exits, even when unloadImmediately is false.
 */
flushPendingStores() {
    this.documents.forEach((document: Document) => {
        const debounceId = `onStoreDocument-${document.name}`;
        if (!document.isLoading && this.debouncer.isDebounced(debounceId)) {
            this.debouncer.executeNow(debounceId);
        }
    });
}
```

Note: no return type annotation, no `async`, no `await`, no Promise collection. The method body is a synchronous `forEach`. `executeNow(id)` does return the underlying `run()` Promise (see `util/debounce.ts:60-66`), but `flushPendingStores` discards it.

Verified against upstream `main` (WebFetch) — identical signature.

**Implications:** Calling `hocuspocus.flushPendingStores()` only **schedules** the pending stores for immediate execution. It does NOT block until they finish writing to disk. To actually wait for pending stores to complete, the caller must poll `hocuspocus.documents.size === 0` or hook `afterUnloadDocument`.

---

### Finding: `useDebounce()` exposes `executeNow()` which DOES return a Promise — but `flushPendingStores` discards it
**Confidence:** CONFIRMED
**Evidence:** `node_modules/.bun/@hocuspocus+server@4.0.0-rc.1+e2f9819782f4683d/node_modules/@hocuspocus/server/src/util/debounce.ts:60-66`

```typescript
const executeNow = (id: string) => {
    const old = timers.get(id);
    if (old) {
        clearTimeout(old.timeout);
        return old.func();   // returns Promise from the inner `run()`
    }
};
```

And `run` from lines 24-39:

```typescript
const run = async () => {
    if (runningExecutions.has(id)) {
        await runningExecutions.get(id);
    }
    timers.delete(id);
    const execution = func();
    runningExecutions.set(id, execution);
    const executionResult = await execution;
    runningExecutions.delete(id);
    return executionResult;
};
```

The debouncer also exposes `isCurrentlyExecuting(id)` (line 72) for polling. But the public Hocuspocus API surface intentionally hides the debouncer.

**Implications:** A workaround is feasible — patch `flushPendingStores` (or write a parallel helper) that collects the executeNow promises and `Promise.all`s them. This is the most reliable way to await L1 store completion without polling.

---

### Finding: `Server.destroy()` is the only built-in graceful shutdown — and it uses an `afterUnloadDocument` hook to resolve the promise
**Confidence:** CONFIRMED
**Evidence:** `node_modules/.bun/@hocuspocus+server@4.0.0-rc.1+e2f9819782f4683d/node_modules/@hocuspocus/server/src/Server.ts:200-225`

```typescript
async destroy(): Promise<void> {
    await new Promise<void>((resolve) => {
        this.httpServer.close();

        try {
            this.configuration.extensions.push({
                async afterUnloadDocument({ instance }) {
                    if (instance.getDocumentsCount() === 0) resolve();
                },
            });

            // Close all existing connections - this will trigger the close hook
            if (this.hocuspocus.getDocumentsCount() === 0) resolve();

            this.hocuspocus.closeConnections();

            // Flush any remaining debounced stores so documents unload
            // promptly, even when unloadImmediately is false.
            this.hocuspocus.flushPendingStores();
        } catch (error) {
            console.error(error);
        }
    });

    await this.hocuspocus.hooks("onDestroy", { instance: this.hocuspocus });
}
```

Verified against upstream `main` (WebFetch).

**Implications:** The promise resolves only when `instance.getDocumentsCount() === 0` — i.e., when every document has been unloaded. The unload chain is: `flushPendingStores()` → `executeNow` → `storeDocumentHooks` → `onStoreDocument` callback runs → `afterStoreDocument` runs → `setTimeout(0)` → `unloadDocument()` → `afterUnloadDocument` hook fires → resolve. **This is the only public mechanism by which a Hocuspocus consumer can `await` the completion of pending stores.** OK does NOT use this pattern.

---

### Finding: `storeDocumentHooks()` runs both `onStoreDocument` AND `afterStoreDocument` inside a per-document mutex
**Confidence:** CONFIRMED
**Evidence:** `node_modules/.bun/@hocuspocus+server@4.0.0-rc.1+e2f9819782f4683d/node_modules/@hocuspocus/server/src/Hocuspocus.ts:461-502`

```typescript
storeDocumentHooks(
    document: Document,
    hookPayload: onStoreDocumentPayload,
    immediately?: boolean,
) {
    const debounceId = `onStoreDocument-${document.name}`;
    return this.debouncer.debounce(
        debounceId,
        async () => {
            try {
                await document.saveMutex.runExclusive(async () => {
                    await this.hooks("onStoreDocument", hookPayload);
                    await this.hooks("afterStoreDocument", hookPayload);
                });
            } catch (error: any) {
                if (error instanceof SkipFurtherHooksError) {
                    setTimeout(() => {
                        if (this.shouldUnloadDocument(document)) {
                            this.unloadDocument(document);
                        }
                    }, 0);
                    return;
                }
                console.error(
                    "Caught error during storeDocumentHooks. Document stays in memory to avoid data loss",
                    error,
                );
                return;
            }
            setTimeout(() => {
                if (this.shouldUnloadDocument(document)) {
                    this.unloadDocument(document);
                }
            }, 0);
        },
        immediately ? 0 : this.configuration.debounce,
        this.configuration.maxDebounce,
    );
}
```

**Implications:** Important — `onStoreDocument` and `afterStoreDocument` run **sequentially** inside the same mutex per document. So when L1 (`onStoreDocument`) flushes via `executeNow`, the L2-style work in `afterStoreDocument` (if any extension hooks it) ALSO runs. OK doesn't currently put commit work in `afterStoreDocument` — it uses its own internal timer (`scheduleGitCommit` in `persistence.ts:243`), which is independent.

---

### Finding: `Document.destroy()` is called by `unloadDocument()` — it tears down the Y.Doc
**Confidence:** CONFIRMED
**Evidence:** `node_modules/.bun/@hocuspocus+server@4.0.0-rc.1+e2f9819782f4683d/node_modules/@hocuspocus/server/src/Hocuspocus.ts:578-580`

```typescript
this.documents.delete(documentName);
document.destroy();   // calls super.destroy() on the Y.Doc
await this.hooks("afterUnloadDocument", { instance: this, documentName });
```

And `Document.destroy()` from `Document.ts:253-256`:

```typescript
destroy() {
    super.destroy();
    this.isDestroyed = true;
}
```

`super.destroy()` is `Y.Doc.destroy()` — releases the document's structs.

**Implications:** Once `unloadDocument` runs, the Y.Doc is unusable. So during shutdown, the order matters: flush stores → wait for unload → only then destroy adjacent state (watchers, shadow repo, etc.).

---

### Finding: OK's `destroy()` does NOT await `flushPendingStores` and does NOT use `afterUnloadDocument` — L1 stores can be in-flight when destroy returns
**Confidence:** CONFIRMED
**Evidence:** `packages/server/src/standalone.ts:399-424`

```typescript
async destroy(): Promise<void> {
    // Wait for async init to complete before cleanup
    await ready.catch(() => {});

    // Flush pending git commit before stopping watchers
    await persistence.flushPendingGitCommit();
    await persistence.waitForPendingCommits();

    if (headWatcher) {
        await headWatcher.unsubscribe();
        headWatcher = null;
    }
    if (watcher) {
        await watcher.unsubscribe();
        watcher = null;
    }
    await sessionManager.closeAll();
    hocuspocus.flushPendingStores();          // <-- not awaited
    await persistence.waitForPendingCommits();
    hocuspocus.closeConnections();
    // Release shadow-root writer lock
    if (shadowRef.current) {
        destroyShadowRepo(shadowRef.current);
    }
}
```

Two specific bugs:

1. **`flushPendingStores()` is called fire-and-forget** (line 417). Even if a debounced L1 store is pending, the function returns synchronously, and `await persistence.waitForPendingCommits()` only awaits the L2 git commit promise — which may not even exist yet because the L1 store hasn't run, so `scheduleGitCommit()` hasn't fired.

2. **`flushPendingGitCommit` is called BEFORE `flushPendingStores`** (line 405). At this point there may be no L1 store pending in a way the git commit timer knows about — which means flushing the commit timer is a no-op. The correct order is: L1 first, then L2.

3. **No `closeConnections` BEFORE `flushPendingStores`**. With clients still connected, document Y.Doc state can mutate during the flush window. The L1 store would write the most recent state, which is fine in steady state, but during a teardown the client may be sending updates that arrive after the L1 flush schedules, leaving them in-flight. (See the OK's own `closeConnections` call on line 419, AFTER the flush.)

**Implications:** OK loses up to ~2 seconds of L1 markdown writes per project switch / utility-process exit, plus any in-flight client updates that arrive during the unbounded race window between `flushPendingStores()` and `closeConnections()`. This is the reason this OQ exists.

---

### Finding: OK's persistence module exposes `flushPendingGitCommit()` and `waitForPendingCommits()` — both are L2-only
**Confidence:** CONFIRMED
**Evidence:** `packages/server/src/persistence.ts:121-125, 264-279, 392-394`

Type definition (lines 121-125):

```typescript
export interface PersistenceHandle {
    extension: Extension;
    flushPendingGitCommit: () => Promise<void>;
    waitForPendingCommits: () => Promise<void>;
}
```

`flushPendingGitCommit` (lines 264-279) ONLY drains the git commit timer:

```typescript
async function flushPendingGitCommit(): Promise<void> {
    if (gitCommitTimer) {
        clearTimeout(gitCommitTimer);
        gitCommitTimer = null;
        if (!commitInFlight) {
            commitInFlight = commitToWipRef().finally(() => {
                commitInFlight = null;
                if (pendingAfterCommit) {
                    pendingAfterCommit = false;
                    scheduleGitCommit();
                }
            });
        }
    }
    if (commitInFlight) await commitInFlight;
}
```

`waitForPendingCommits` (lines 392-394):

```typescript
async function waitForPendingCommits(): Promise<void> {
    if (commitInFlight) await commitInFlight;
}
```

**Implications:** Both APIs only know about the L2 (git commit) timer. They are **completely unaware of L1** — the Hocuspocus debouncer that controls when `onStoreDocument` actually fires. There is **no `flushL1Stores()`** in OK's persistence module today. The only L1 hook OK has is `hocuspocus.flushPendingStores()` from the upstream API — which, as documented above, is fire-and-forget.

---

### Finding: `onStoreDocument` schedules `scheduleGitCommit()` only at the END of the L1 store (after `setReconciledBase`)
**Confidence:** CONFIRMED
**Evidence:** `packages/server/src/persistence.ts:342-389`

```typescript
async onStoreDocument({ document, documentName }) {
    if (isBatchInProgress()) return;
    // ...
    try {
        await mkdir(dirname(filePath), { recursive: true });
        await writeFile(tmpPath, markdown, 'utf-8');
        await rename(tmpPath, filePath);
        registerWrite(filePath, contentHash(markdown));
    } catch (e) { /* ... */ throw e; }
    console.log(`[persistence] Wrote ${filePath} (${markdown.length} bytes)`);

    // Update reconciled base after successful store
    setReconciledBase(documentName, markdown);

    scheduleGitCommit();   // <-- L2 git commit timer only starts HERE
}
```

**Implications:** L2 has a strict happens-after relationship to L1. If L1 hasn't run, calling `flushPendingGitCommit()` finds an empty timer and does nothing. The shutdown sequence MUST wait for L1 to fully complete before flushing L2.

---

## Negative searches

- **`hocuspocus.destroy()`** — searched the source — no such method on the `Hocuspocus` class. Only `Server.destroy()` exists.
- **`flushL1Stores()` / `flushDocumentStores()`** — searched OK persistence and Hocuspocus source — does not exist.
- **`afterUnloadDocument` hook in OK code** — `grep -rn afterUnloadDocument packages/server/src/` — only referenced in OK tests; never used in production shutdown.
- **`process.removeListener` for SIGINT/SIGQUIT/SIGTERM in `Server.destroy`** — searched `Server.ts` — not present. Means repeatedly calling `listen()` then `destroy()` leaks signal handlers; this is benign in single-server processes but worth knowing for utilityProcess respawn cycles.

---

## Gaps / follow-ups

- Whether Hocuspocus accepts a fix-up PR adding `flushPendingStores(): Promise<void>` is unknown — recommend filing an issue and offering to send a PR. The change is mechanically trivial.
- The OK persistence module could expose a `flushL1AndL2()` helper that wraps the entire L1 + L2 sequence in one awaitable. This is the cleanest workaround for OK consumers.
