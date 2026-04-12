---
title: "Hocuspocus Flush & Reconnect Semantics for OK Desktop App"
date: 2026-04-11
status: final
scope: OQ-08 (graceful shutdown flush), OQ-11 (crash recovery via provider reconnect)
related_spec: specs/2026-04-11-electron-desktop-app/SPEC.md
---

# Hocuspocus 4.0.0-rc Flush & Reconnect Semantics

**Evidence files:**
- [evidence/oq-08-hocuspocus-shutdown-source.md](./evidence/oq-08-hocuspocus-shutdown-source.md)
- [evidence/oq-11-provider-reconnect-source.md](./evidence/oq-11-provider-reconnect-source.md)

## Executive Summary

**OQ-08 — Graceful flush.** Hocuspocus 4.0.0-rc.1 has **no working graceful shutdown for the `Hocuspocus` class** that OK uses directly. The public `flushPendingStores()` method is **fire-and-forget** (returns `void`, not `Promise`): it iterates documents, calls `debouncer.executeNow(id)` for each, and **discards the returned promises**. The only working shutdown helper, `Server.destroy()`, uses an `afterUnloadDocument` hook to await completion via the unload chain — but OK does not use the `Server` wrapper, only the bare `Hocuspocus`.

**⚠️ OK's current `destroy()` in `packages/server/src/standalone.ts:399-424` is therefore broken in two ways:** (1) `flushPendingStores()` is called without awaiting anything, so L1 markdown writes can be in-flight when destroy returns; (2) `flushPendingGitCommit()` is called BEFORE `flushPendingStores()`, which means L2 has nothing to flush because L1 hasn't run. **Up to 2 seconds of L1 markdown writes can be lost on every utilityProcess shutdown / project switch under the current code.**

**OQ-11 — Crash recovery.** The protocol-level CRDT semantics already preserve renderer state across utilityProcess crash → respawn. `HocuspocusProvider.onOpen → startSync` fires on **every** websocket open event (including reconnects) and sends `SyncStepOneMessage` carrying the **client's local Y.Doc state vector**. The server replies with SyncStep2 (server's diff) **immediately followed by its own SyncStep1**, triggering a complete bidirectional CRDT diff exchange. After the round trip, both client and server converge to the union of all updates via Yjs's commutative merge — **a freshly respawned Hocuspocus that loaded markdown from disk will pull in all the client's in-memory edits that hadn't yet been persisted**. Renderer needs zero custom recovery code beyond what `HocuspocusProvider` already does (auto-reconnect with exponential backoff via `@lifeomic/attempt`).

**Key Findings:**

- **`Hocuspocus` class has NO `destroy()` method**, only `Server.destroy()`. OK uses bare `Hocuspocus` and assembles its own teardown manually.
- **`flushPendingStores()` is fire-and-forget**: returns `void`. Calling it without awaiting completion is a data-loss bug in the current OK destroy path.
- **The y-protocols sync handshake is bidirectional and lossless**: a fresh server gains the client's missing updates via SyncStep1/SyncStep2 round trip — no special recovery code needed.
- **The `messageQueue` is cleared on websocket recreation** but this is irrelevant — the Y.Doc state is the source of truth and the next sync round trip re-sends everything.
- **Renderer-side `hasUnsyncedChanges` + `forceSync()`** are public APIs that let the renderer drive a clean drain barrier before the main process tears down the utilityProcess.

---

## OQ-08-A — Hocuspocus public flush API surface

**Verdict:** `Hocuspocus.flushPendingStores()` exists but is fire-and-forget. There is no awaitable public API to drain pending stores. The only working built-in shutdown helper is `Server.destroy()`, which OK does not use.

The smoking gun from `node_modules/.bun/@hocuspocus+server@4.0.0-rc.1+.../src/Hocuspocus.ts:165-177`:

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
            this.debouncer.executeNow(debounceId);   // returns Promise — discarded
        }
    });
}
```

No `async`, no `Promise`, no await. The internal `debouncer.executeNow(id)` does return a Promise from the underlying `run()` (`util/debounce.ts:60-66`), but `flushPendingStores` ignores it.

**`Server.destroy()` is the only working pattern** (`Server.ts:200-225`):

```typescript
async destroy(): Promise<void> {
    await new Promise<void>((resolve) => {
        this.httpServer.close();
        try {
            // Install one-shot afterUnloadDocument hook that resolves the promise
            this.configuration.extensions.push({
                async afterUnloadDocument({ instance }) {
                    if (instance.getDocumentsCount() === 0) resolve();
                },
            });
            if (this.hocuspocus.getDocumentsCount() === 0) resolve();
            this.hocuspocus.closeConnections();
            this.hocuspocus.flushPendingStores();
        } catch (error) { console.error(error); }
    });
    await this.hocuspocus.hooks("onDestroy", { instance: this.hocuspocus });
}
```

The async chain: `flushPendingStores → executeNow → debouncer.run → onStoreDocument hook (awaited inside saveMutex) → afterStoreDocument → setTimeout(0) → unloadDocument → afterUnloadDocument hook fires → resolve`.

The Hocuspocus docs **do not document graceful shutdown semantics at all**. Source code is the only authoritative reference.

---

## OQ-08-B — OK's existing flush APIs are L2-only

**Verdict:** `persistence.flushPendingGitCommit()` and `persistence.waitForPendingCommits()` both exist but **only know about the L2 git commit timer**. They have no awareness of L1 (Hocuspocus's onStoreDocument debouncer). OK's `destroy()` calls them in the wrong order relative to L1.

`packages/server/src/persistence.ts:264-279`:

```typescript
async function flushPendingGitCommit(): Promise<void> {
    if (gitCommitTimer) {
        clearTimeout(gitCommitTimer);
        gitCommitTimer = null;
        if (!commitInFlight) {
            commitInFlight = commitToWipRef().finally(() => {
                commitInFlight = null;
                if (pendingAfterCommit) { pendingAfterCommit = false; scheduleGitCommit(); }
            });
        }
    }
    if (commitInFlight) await commitInFlight;
}
```

The git commit timer is set inside `onStoreDocument` (L1) at `persistence.ts:388`, so **L1 must run before the L2 timer even exists**. Calling `flushPendingGitCommit()` before draining L1 is a no-op.

OK's current `destroy()` in `standalone.ts:399-424` has three bugs:

```typescript
async function destroy(): Promise<void> {
    await ready.catch(() => {});

    // BUG #1: L2 flush before L1 — L1 timer hasn't fired yet, so L2 has nothing to drain
    await persistence.flushPendingGitCommit();
    await persistence.waitForPendingCommits();

    if (headWatcher) { await headWatcher.unsubscribe(); headWatcher = null; }
    if (watcher) { await watcher.unsubscribe(); watcher = null; }
    await sessionManager.closeAll();

    // BUG #2: L1 flush is fire-and-forget — returns void, not Promise
    hocuspocus.flushPendingStores();

    // BUG #3: L2 wait at this point only catches commits scheduled by L1 stores that
    //          managed to complete synchronously before the JS turn yielded
    await persistence.waitForPendingCommits();

    hocuspocus.closeConnections();
    if (shadowRef.current) destroyShadowRepo(shadowRef.current);
}
```

**Result:** Up to 2 seconds of L1 markdown writes can be lost on every utilityProcess shutdown / project switch under the current code.

---

## OQ-08-C — Concrete teardown sequence (the verdict)

**Verdict:** A two-phase teardown with a client-side drain barrier followed by a server-side L1+L2 flush is the only reliable approach. The client-side barrier prevents the loss window where the renderer has Y.Doc updates that haven't even reached the server yet.

### Server-side fix (replace `standalone.ts:399-424`)

```typescript
// New helper inside createServer():
async function flushAllStoresAndWait(): Promise<void> {
    const docNames = Array.from(hocuspocus.documents.keys());
    if (docNames.length === 0) return;

    // Install one-shot afterUnloadDocument hook to resolve when all docs unloaded
    const allDone = new Promise<void>((resolve) => {
        const hook = {
            async afterUnloadDocument({ instance }: { instance: Hocuspocus }) {
                if (instance.getDocumentsCount() === 0) resolve();
            },
        };
        hocuspocus.configuration.extensions.push(hook);
        if (hocuspocus.getDocumentsCount() === 0) resolve();  // race guard
    });

    // Force the L1 stores to fire NOW (close connections so unload can happen)
    hocuspocus.closeConnections();
    hocuspocus.flushPendingStores();

    // Wait for all docs to unload (defensive timeout)
    await Promise.race([
        allDone,
        new Promise<void>((_, reject) =>
            setTimeout(() => reject(new Error('flushAllStoresAndWait timeout')), 10_000),
        ),
    ]).catch((err) => {
        console.error('[shutdown] flush timed out:', err);
    });
}

async function destroy(): Promise<void> {
    await ready.catch(() => {});

    // Phase 1: stop watchers FIRST so disk writes from L1 don't trigger reconcile loops
    if (headWatcher) { await headWatcher.unsubscribe(); headWatcher = null; }
    if (watcher)     { await watcher.unsubscribe();     watcher = null; }

    // Phase 2: drain agent sessions (DirectConnections hold the doc open)
    await sessionManager.closeAll();

    // Phase 3: drain L1 (markdown → disk) — close connections + AWAIT flush
    await flushAllStoresAndWait();

    // Phase 4: drain L2 (disk → git) — only meaningful AFTER L1 has run
    await persistence.flushPendingGitCommit();
    await persistence.waitForPendingCommits();

    // Phase 5: release shadow repo writer lock
    if (shadowRef.current) destroyShadowRepo(shadowRef.current);
}
```

### Electron main process IPC sequence

```
[Main]      User clicks "switch to project B"
            ↓
[Main]      mainWindow.webContents.send('shutdown:begin')
            ↓
[Renderer]  await pool.flushAllProviders()
            // Iterates entries, calls provider.forceSync() and waits for
            // hasUnsyncedChanges === false on every entry. 5s timeout.
            ↓
[Renderer]  ipcRenderer.invoke('shutdown:client-drained')
            ↓
[Main]      utilityProcess.postMessage({ type: 'shutdown' })
            ↓
[Utility]   await server.destroy()  // Phases 1-5 above
[Utility]   process.exit(0)
            ↓
[Main]      utilityProcess.on('exit') → free port → spawn project B's utility
```

**Why the two-phase barrier matters.** Without the renderer-side flush barrier, the renderer can have Y.Doc updates in memory that haven't been transmitted over the websocket yet (e.g., user typed in the last 16ms before shutdown IPC arrived). The server's L1 flush only persists what the **server's** Y.Doc has — it can't pull in updates that are still buffered client-side. The `forceSync` + `hasUnsyncedChanges === false` check ensures the server's Y.Doc has every client update before phase 3 begins.

---

## OQ-11-A — Provider reconnect on websocket open

**Verdict:** `HocuspocusProvider.onOpen` is wired to fire on **every** websocket open event, including reconnects. It calls `sendToken()` then `startSync()`, which sends a fresh `SyncStepOneMessage` carrying the client's state vector. There is no custom replay buffer, no local update log, no special "this is a reconnect" branch — the provider treats reconnect identically to initial connect, and relies on the y-protocols sync handshake for state convergence.

`HocuspocusProvider.ts:424-456`:

```typescript
async onOpen(event: Event) {
    this.isAuthenticated = false;
    this.emit("open", { event });
    await this.sendToken();
    this.startSync();
}

startSync() {
    this.resetUnsyncedChanges();
    this.send(SyncStepOneMessage, {
        document: this.document,
        documentName: this.effectiveName,
    });
    if (this.awareness && this.awareness.getLocalState() !== null) {
        this.send(AwarenessMessage, { ... });
    }
}
```

**Auto-reconnect with exponential backoff** is the default (`HocuspocusProviderWebsocket.ts:561-581`): default `delay=1000`, `factor=2`, `maxDelay=30000`, `maxAttempts=0` (unlimited), `jitter=true`. Renderer retries forever until either the new utilityProcess listens on the same port OR the user explicitly disconnects.

**Implication:** Zero renderer-side intervention is needed for crash recovery. The retry loop handles the wait, the `onOpen` handler runs `startSync` automatically, and the y-protocols handshake handles state merging.

---

## OQ-11-B — y-protocols bidirectional sync (the merge contract)

**Verdict:** The y-protocols sync handshake exchanges a **complete bidirectional CRDT diff** in three messages: client→server SyncStep1, server→client SyncStep2 + SyncStep1, client→server SyncStep2. After the round trip, both sides converge to the union of all updates via Yjs's commutative merge. **A renderer's in-memory Y.Doc state will be merged into a freshly respawned server's Y.Doc as long as the Y.Doc instance survives**.

The canonical y-protocols docstring at `y-protocols/sync.js:14-29`:

> Core Yjs defines two message types:
> - YjsSyncStep1: Includes the State Set of the sending client. When received, the client should reply with YjsSyncStep2.
> - YjsSyncStep2: Includes all missing structs and the complete delete set.
>
> In a client-server model: The client should initiate the connection with SyncStep1. **When the server receives SyncStep1, it should reply with SyncStep2 immediately followed by SyncStep1.** The client replies with SyncStep2 when it receives SyncStep1.

`Y.encodeStateAsUpdate(doc, clientStateVector)` returns all updates the server has that the client doesn't. The mirror operation runs on the client side and produces the SyncStep2 reply containing all updates the **client** has that the **server** doesn't.

### The complete crash-recovery flow

1. utilityProcess A serves documents from `/path/to/project/content/*.md`
2. utilityProcess A crashes (SIGKILL, OOM, native module fault)
3. Main process detects exit via `utilityProcess.on('exit')`, respawns utilityProcess B with the same `contentDir`
4. utilityProcess B's Hocuspocus loads markdown from disk into its Y.Doc (via OK's `persistence.ts:onLoadDocument` at line 287)
5. Renderer's `HocuspocusProviderWebsocket` retries, reconnects to the new server
6. Renderer's `HocuspocusProvider.onOpen` fires → `startSync()` → `SyncStepOneMessage` with client's state vector (still contains all in-memory edits)
7. New server receives SyncStep1 → replies with `SyncStep2 + SyncStep1` → client gets the disk-loaded state, server queues the client's missing updates
8. Client replies with `SyncStep2` containing all updates the server didn't have
9. Server applies them via `readSyncStep2` → triggers `handleDocumentUpdate` → schedules `onStoreDocument` → L1 markdown write debounced → eventually persists to disk

**Critical property:** The merge is commutative and lossless. There is no path by which a Y.Doc update can be silently dropped during the handshake.

---

## OQ-11-C — Concrete crash-recovery flow

**Verdict:** The crash-recovery flow requires **almost zero work** in the renderer. The main process owns crash detection, respawn, and port re-binding. The renderer's existing `ProviderPool` already trusts auto-reconnect, so no code change is strictly required there — but a small UX improvement is recommended.

```typescript
// Electron main process (one per BrowserWindow)
utility.on('exit', (code, signal) => {
    if (intentionalShutdown) return;  // set by the destroy IPC path

    // CRASH path — respawn after a short backoff
    console.warn(`[main] utility crashed (code=${code} signal=${signal}); respawning`);
    mainWindow.webContents.send('utility:crashed', { code, signal });

    setTimeout(() => {
        respawnUtility();  // Re-fork with same contentDir + port
    }, 250);  // Brief delay so the OS releases the port
});

// Renderer (provider-pool.ts — minor enhancement)
ipcRenderer.on('utility:crashed', () => {
    showBanner('Reconnecting to project...');  // dismissed by 'synced' event
});
```

---

## OQ-11-D — Renderer-side flush barrier API

**Verdict:** `HocuspocusProvider.hasUnsyncedChanges` (boolean), the `unsyncedChanges` event, and `forceSync()` are sufficient public APIs to drive a client-side flush barrier. **`hasUnsyncedChanges === false` means every client update has been acknowledged as applied to the server's Y.Doc** — but NOT necessarily flushed to disk (which is why server-side L1 phase 3 is still required).

### Recommended `pool.flushAllProviders()` implementation

```typescript
async flushAllProviders(timeoutMs = 5000): Promise<void> {
    const providers = Array.from(this.entries.values()).map((e) => e.provider);

    // Force a sync round-trip on every provider
    for (const provider of providers) {
        provider.forceSync();
    }

    // Wait for all providers to report no unsynced changes
    const allSettled = providers.map((provider) => new Promise<void>((resolve) => {
        if (!provider.hasUnsyncedChanges) { resolve(); return; }
        const onChange = ({ number }: { number: number }) => {
            if (number === 0) {
                provider.off('unsyncedChanges', onChange);
                resolve();
            }
        };
        provider.on('unsyncedChanges', onChange);
    }));

    await Promise.race([
        Promise.all(allSettled),
        new Promise<void>((_, reject) =>
            setTimeout(() => reject(new Error('flushAllProviders timeout')), timeoutMs),
        ),
    ]).catch((err) => {
        console.warn('[pool] flushAllProviders timed out:', err);
    });
}
```

---

## OQ-11-E — Failure modes summary

| Mode | Scope | Mitigation | Residual risk |
|---|---|---|---|
| **Renderer crash** | All in-memory Y.Doc state | Electron auto-reload only | High — requires y-indexeddb to fully solve |
| **Forced kill** (user "force quit") | Anything since last L1 store | None — kernel SIGKILL | Up to L1 debounce window (2s default) |
| **Schema drift** during hot-update | Y.applyUpdate throws | Keep sharedExtensions stable | Dev-time only |
| **Long restart** (>30s) | Triggers `messageReconnectTimeout` (default 30s) | Increase timeout, or accept retry | Low — provider recovers |
| **Port collision** on respawn | New utility can't bind | Backoff + retry on EADDRINUSE | Low — provider waits |

**Bounded data loss budget under the recommended fix:** the maximum loss window is **whatever was typed in the renderer between (a) the last `provider.forceSync()` ack and (b) the renderer process dying**. For project-switch flows this is zero (because the IPC barrier completes before destroy begins). For utility-crash flows this is also zero (because the renderer's Y.Doc survives and replays via SyncStep1). The only path to actual loss is a renderer crash, which is out of scope for both OQ-08 and OQ-11.

---

## Notable upstream issues

- [#803 — provider.destroy will reopen connection](https://github.com/ueberdosis/hocuspocus/issues/803): closed; fixed in v3.
- [#636 — WebsocketProvider not destroyed](https://github.com/ueberdosis/hocuspocus/issues/636): clarifies that `provider.destroy()` does NOT destroy the externally-provided websocket — by design.
- **No upstream issue or PR** exists for awaitable `flushPendingStores`. Recommend filing one with the patch from OQ-08-C — the fix is mechanically trivial.

---

## Limitations

- **`onStoreDocument` failure recovery during shutdown.** If `onStoreDocument` throws during the destroy-time flush, the document stays in memory per `Hocuspocus.ts:486-490` ("Document stays in memory to avoid data loss"). The destroy() promise would never resolve. The 10-second timeout in `flushAllStoresAndWait()` defends against this, but the user-visible result is "we couldn't save your work — here's the markdown to copy out manually." Worth a UX flow.
- **`utility:crashed` restart heuristics.** The 250ms respawn backoff is a guess. If utility is crashing in a tight loop, aggressive respawn becomes a fork bomb. Should add "max 3 crashes in 60 seconds → escalate" backoff.
- **`unsyncedChanges` counter accuracy across reconnects** — confirmed via source: the counter is reset on every `startSync()`, then decrements on `SyncStatus(true)`. The flush barrier should only fire AFTER the connection is in `synced` state.

Sources:
- [hocuspocus/packages/server/src/Hocuspocus.ts](https://github.com/ueberdosis/hocuspocus/blob/main/packages/server/src/Hocuspocus.ts)
- [hocuspocus/packages/server/src/Server.ts](https://github.com/ueberdosis/hocuspocus/blob/main/packages/server/src/Server.ts)
- [Hocuspocus server hooks documentation](https://tiptap.dev/docs/hocuspocus/server/hooks)
- [Issue #803: provider.destroy will reopen connection](https://github.com/ueberdosis/hocuspocus/issues/803)
- [Issue #636: WebsocketProvider not destroyed](https://github.com/ueberdosis/hocuspocus/issues/636)
- [y-protocols sync.js](https://github.com/yjs/y-protocols/blob/master/sync.js)
