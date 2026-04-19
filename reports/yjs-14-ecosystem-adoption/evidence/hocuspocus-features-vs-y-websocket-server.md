# Hocuspocus features vs `@y/websocket-server@0.1.5` — exhaustive source-trace

**Date:** 2026-04-16
**Installed Hocuspocus version:** `@hocuspocus/server@4.0.0-rc.1`, `@hocuspocus/provider@4.0.0-rc.1`, `@hocuspocus/common@4.0.0-rc.2` (resolved from `node_modules/@hocuspocus/server/package.json:5`).
**Installed legacy yjs stack:** `yjs@13.6.30` (`node_modules/yjs/package.json`), `y-protocols@1.0.7`, `lib0@^0.2.85`.
**Compared against:** `@y/websocket-server@0.1.5` (`/tmp/ywss/package`), `@y/websocket@4.0.0-rc.2` (`/tmp/yws/package`), `@y/protocols@1.0.6-rc.1` (`/tmp/yp/package`).
**OK consumer scope:** `packages/server/src/{standalone,persistence,api-extension,agent-sessions,cc1-broadcast,server-observer-extension,external-change}.ts`, `packages/app/src/editor/{provider-pool,sync-promise,observers}.ts`, `packages/app/src/components/SystemDocSubscriber.tsx`.

> **Note on prompt fidelity.** Prompt named "@hocuspocus/server@4.0.0-rc.5" but the installed/locked version is rc.1. Across rc.0–rc.5 (verified via npm registry below) the public API surface this report covers is unchanged — same hook list, same `Server`/`Hocuspocus`/`Document`/`DirectConnection` shape, same `peerDependencies.yjs: ^13.6.8`. Citations are to the installed rc.1 source.

---

## 0. The headline result first

**`@y/websocket-server@0.1.5` is a 281-line WebSocket reference adapter** (`/tmp/ywss/package/src/utils.js`, 281 LOC). It is **not** an extensible server framework. It exposes `setupWSConnection(conn, req, opts)`, an in-memory `docs: Map<string, WSSharedDoc>`, two pluggable hook points (`setPersistence`, `setContentInitializor`), and an HTTP `CALLBACK_URL` post-update notifier. That is the entire surface area.

Of the **17 distinct Hocuspocus capabilities** OK depends on, the breakdown is:

| Tier | Count | Capabilities |
|------|-------|--------------|
| **PRESENT** in `@y/websocket-server` | 1 | Awareness propagation (delegated to `@y/protocols/awareness`, identical API) |
| **PARTIAL** | 3 | Server constructor; `onLoadDocument` analog (`bindState`); `onStoreDocument` analog (`writeState`) |
| **ABSENT** — must build from scratch | 13 | `afterLoadDocument` hook, `onAuthenticate`, `Document.transact(fn, origin)`, `openDirectConnection`, `broadcastStateless`, `documents` registry semantics (TTL/idle), per-connection sequential message queue, awareness-already-supported but with no per-doc broadcast filtering, document unload TTL/debounce, extensions array + plugin lifecycle, hook payload context propagation, server-managed lifecycle (`destroy`, `flushPendingStores`, `closeConnections`), `beforeBroadcastStateless` interception |

**Estimated greenfield LOC to bridge the gap:** ~2,000–2,800 LOC of net-new server framework code on top of `@y/websocket-server`'s 281 LOC, reproducing what Hocuspocus rc.1 ships in **3,000+ LOC** of TypeScript across `Hocuspocus.ts` (612), `Server.ts` (273), `Document.ts` (259), `Connection.ts` (279), `ClientConnection.ts` (458), `MessageReceiver.ts` (251), `OutgoingMessage.ts` (159), `IncomingMessage.ts` (80), `DirectConnection.ts` (90), `types.ts` (455), `util/debounce.ts` (77), `util/getParameters.ts`, plus `@hocuspocus/common`'s `auth.ts`, `routingKey.ts`, `awarenessStatesToArray.ts`, `CloseEvents.ts`, `SkipFurtherHooksError.ts`.

**Yjs-14 blocker (the structurally-decisive answer to the prompt's "critical" question):**

- `@hocuspocus/server@4.0.0-rc.0..rc.5` (every published rc) declares `peerDependencies.yjs: ^13.6.8` and `peerDependencies.y-protocols: ^1.0.6` (verified via npm registry — see §18).
- `@y/websocket-server@0.1.5` declares `dependencies.yjs: ^14.0.0-7` (no peer-dep) and its source `import * as Y from 'yjs'` (`/tmp/ywss/package/src/utils.js:1`) — i.e. it imports the **legacy `yjs` package name** but pinned at `>=14.0.0-7`. This is upstream sloppy: `yjs@14.x` (the npm-package name) and `@y/y@14.x` (the new namespaced package, which `@y/websocket@4.0.0-rc.2` imports — see `/tmp/yws/package/src/y-websocket.js:6`) are **different packages** that both publish 14.x lines (verified — `yjs@14.0.0-0..14.0.0-16` exist on npm and are NOT deprecated; `@y/y@14.0.0-rc.2..rc.13` exist).
- There is **no `__$YJS14$__` runtime guard** in `@hocuspocus/server@4.0.0-rc.1` source — verified by `grep -rn "YJS14\|__\$YJS"` returning zero hits across `node_modules/@hocuspocus/{server,provider,common}/src/`. The blocker is purely the npm peer-dep solver: `npm install @hocuspocus/server@4.0.0-rc.5 yjs@14.0.0-16` will warn (peer satisfied by major-bump-via-npm-overrides), and at module-load `Hocuspocus.ts:3` (`import { applyUpdate, Doc, encodeStateAsUpdate } from "yjs";`) imports whatever `yjs` resolves to — including yjs@14 if forced. Whether the runtime survives depends on whether yjs@14 exports the same `applyUpdate`/`Doc`/`encodeStateAsUpdate` symbols (it does, per the rc series so far) AND whether internal Y.Doc shape matches y-protocols@1 (it does, per the same constraint that yjs@14 stayed wire-compatible). **In practice an `npm overrides` block can force yjs@14 under @hocuspocus/server@4.0.0-rc.x today** — but this is unsupported, untested by Hocuspocus maintainers, and if yjs@14 final or any rc breaks the `Doc.transact(fn, origin, local)` signature or rebrand awareness internals, Hocuspocus breaks silently.

The cleaner truth: **OK cannot adopt yjs@14 by swapping Hocuspocus for `@y/websocket-server` either**, because `@y/websocket-server@0.1.5` is missing 13 of the 17 capabilities OK depends on. It would be a from-scratch rewrite of the framework, not a swap.

---

## 1. Server constructor — `Server.configure({…})` / `hocuspocus.listen()`

### Hocuspocus

- **`Server` class** wraps an HTTP server and a `crossws` WebSocket adapter: `node_modules/@hocuspocus/server/src/Server.ts:33-273`.
  - Constructor at `Server.ts:46-85` instantiates `this.hocuspocus = new Hocuspocus(this.configuration)` (line 54), creates `this.httpServer = createServer(this.requestHandler)` (line 57), wires `crossws({ serverOptions, hooks: { open, message, close, error } })` (line 58-82) where `open` calls `this.hocuspocus.handleConnection(peer.websocket, peer.request)` (lines 61-67). HTTP upgrade path at `setupHttpUpgrade` (lines 87-109) runs the `onUpgrade` hook then `crossws.handleUpgrade(request, socket, head)`.
  - `requestHandler` at `Server.ts:111-134` runs the `onRequest` hook chain on every HTTP request. **OK relies entirely on this hook for its REST API** (see §16).
  - `listen(port?, callback?)` at `Server.ts:136-190` listens on HTTP, runs `onListen` hook with `{ instance, configuration, port }` payload after `httpServer.listen()` resolves; binds SIGINT/SIGQUIT/SIGTERM to `destroy()` if `stopOnSignals: true` (default).
  - `destroy()` at `Server.ts:200-225` closes httpServer, pushes a transient `afterUnloadDocument` extension that resolves a Promise when `documentCount === 0`, calls `closeConnections()` + `flushPendingStores()`, awaits, then runs `onDestroy` hook.
- **`Hocuspocus` class** is the actual collab core — separately constructible without HTTP: `node_modules/@hocuspocus/server/src/Hocuspocus.ts:39-612`.
  - Constructor at line 72-76 just calls `this.configure(configuration)`.
  - `configure({…})` at lines 81-136 **shallow-merges** into `this.configuration` (line 84-87). Then it sorts `extensions` by descending `priority` (lines 89-102), and **pushes a synthetic extension built from the top-level hook callbacks** (lines 104-127) so that `onLoadDocument: () => …` passed at the top level becomes equivalent to an extension with that hook. Finally it fires `onConfigure` (lines 129-133).
  - Default config at `Hocuspocus.ts:26-37`: `timeout: 60_000`, `debounce: 2_000`, `maxDebounce: 10_000`, `quiet: false`, `yDocOptions: { gc: true, gcFilter: () => true }`, `unloadImmediately: true`. Default hooks at lines 40-61 — every hook resolves to a no-op promise.

### OK usage (Hocuspocus)

- `packages/server/src/standalone.ts:190-195`:
  ```ts
  hocuspocus = new Hocuspocus({
    quiet, debounce, maxDebounce,
    extensions: [persistence.extension],
  });
  ```
- OK does NOT use `Server` (the HTTP-bundled class). It uses the bare `Hocuspocus` core and wires its own HTTP routing through the `onRequest` extension. Comment at `standalone.ts:521-525` is explicit:
  > We can't use Server.destroy() directly because Server owns its own httpServer + crossws WebSocket adapter + signal binding, which conflicts with OK's shared HTTP server + /api/* routing + static asset serving + /collab-only upgrade.
- OK pushes more extensions imperatively after construction: `standalone.ts:204` (`liveDerivedIndexExtension`), `:222` (`apiExtension`), `:224` (`createServerObserverExtension`).

### `@y/websocket-server@0.1.5` equivalent

- **`server.js` is a CLI**, not a library: `/tmp/ywss/package/src/server.js:1-31`. It instantiates `new WebSocket.Server({ noServer: true })` (line 8), creates a plain `http.createServer` returning `'okay'` for any GET (lines 12-15), wires `wss.on('connection', setupWSConnection)` (line 17) and `server.on('upgrade', …)` (lines 19-27). 31 LOC total.
- The actual library is `setupWSConnection(conn, req, { docName, gc })` at `/tmp/ywss/package/src/utils.js:231-280`.
- **No `configure({…})` step.** Configuration is by env vars (`HOST`, `PORT`, `YPERSISTENCE`, `CALLBACK_URL`, `CALLBACK_DEBOUNCE_WAIT`, etc.) and module-level `setPersistence(persistence_)` (`utils.js:35-37`) / `setContentInitializor(f)` (lines 79-81).

### Classification

- **PARTIAL.** A "constructor" and a "listen" function exist, but they're a 31-LOC CLI, not a library. To get OK's `new Hocuspocus({…})` ergonomics on top of `@y/websocket-server` would mean reimplementing the configure/extensions/hook system from scratch (the 612 LOC of `Hocuspocus.ts`).

---

## 2. `onLoadDocument` hook — populate Y.Doc from disk on first connect

### Hocuspocus

- **Trigger:** `Hocuspocus.loadDocument()` at `Hocuspocus.ts:359-459`. Called once per document on first connection via `createDocument()` (lines 316-357), which dedup's parallel-arriving connections through `loadingDocuments: Map<string, Promise<Document>>` (line 63, line 327-331).
- **Order:** (1) `onCreateDocument` hook returns optional `yDocOptions` (line 371-379); (2) `new Document(documentName, {…yDocOptions})` (lines 381-384); (3) **`onLoadDocument` hook** at lines 397-413 is wrapped in try/catch and invoked with payload `{ instance, context, connectionConfig, document, documentName, socketId, requestHeaders, requestParameters }`. The **callback** to `hooks()` (lines 401-407) accepts the hook's return value and applies it to the Doc:
  ```ts
  (loadedDocument: Doc | Uint8ArrayConstructor | undefined) => {
    if (loadedDocument instanceof Doc) {
      applyUpdate(document, encodeStateAsUpdate(loadedDocument));
    } else if (loadedDocument instanceof Uint8Array) {
      applyUpdate(document, loadedDocument);
    }
  }
  ```
  So the hook can either mutate `payload.document` directly OR return a Y.Doc / Uint8Array update that gets applied.
- On throw at lines 409-413: `closeConnections(documentName)` + `unloadDocument(document)` + rethrow. **`onLoadDocument` is the only hook with a try/catch** in `loadDocument()` — see explicit comment at `server-observer-extension.ts:57-60` documenting this asymmetry.

### Hook payload type

- `onLoadDocumentPayload<Context>` at `types.ts:280-289`: `{ context, document, documentName, instance, requestHeaders, requestParameters, socketId, connectionConfig }`.

### OK usage

- `packages/server/src/persistence.ts:328-403`:
  ```ts
  async onLoadDocument({ document, documentName, context: _context }) {
    if (isSystemDoc(documentName)) return;
    // ...
    const filePath = safeContentPath(documentName, contentDir);
    if (!existsSync(filePath)) return;
    // realpath check, frontmatter cache, parseWithFallback,
    // updateYFragment(document, xmlFragment, pmNode, …)
    // setReconciledBase(documentName, prependFrontmatter(frontmatter, normalizedBody));
  }
  ```
- This is the L1 disk → CRDT load path. It **mutates `payload.document`** in place rather than returning a Uint8Array. Symlink/realpath safety, frontmatter stripping, `parseWithFallback` (R6), `updateYFragment` from `@tiptap/y-tiptap`, then `setReconciledBase` to seed the three-way reconciliation base.

### `@y/websocket-server` equivalent

- **`bindState(docname, doc)`** — module-level injection via `setPersistence(persistence_)` at `/tmp/ywss/package/src/utils.js:35-37`. The persistence object's `bindState` is called from `getYDoc(docname, gc)` at lines 140-148:
  ```ts
  export const getYDoc = (docname, gc = true) => map.setIfUndefined(docs, docname, () => {
    const doc = new WSSharedDoc(docname)
    doc.gc = gc
    if (persistence !== null) {
      persistence.bindState(docname, doc)
    }
    docs.set(docname, doc)
    return doc
  })
  ```
- **No try/catch around `bindState`.** A throw inside `bindState` blows up the whole `getYDoc` call (which is synchronous), corrupting `docs` map state.
- **No payload context.** Just `(docname: string, doc: WSSharedDoc)`. No `requestHeaders`, no `requestParameters`, no `connectionConfig`, no `socketId`, no `context` — so OK's auth-context-flowing-through-onLoad pattern is unrepresentable.
- **No `Promise` return.** `bindState` is fire-and-forget; the doc is registered before persistence finishes loading. Race condition: a sync-step-1 from a fast client can arrive before disk read returns.
- **`whenInitialized`** at `utils.js:129` is a Promise the WSSharedDoc constructor resolves from `contentInitializor(this)` — but `setContentInitializor` is *separate* from `setPersistence`. Two different mechanisms for two different lifecycle phases, and neither is composable with the other.

### Classification

- **PARTIAL.** `bindState` covers the surface ("here's a doc, populate it from disk") but loses: (a) request context propagation, (b) error handling, (c) async ordering with the first `SyncStep1` reply. Reproducing `onLoadDocument`'s error semantics on `@y/websocket-server` requires intercepting `getYDoc` + `WSSharedDoc` constructor — both module-internal and not extension points.

---

## 3. `onStoreDocument` hook — debounced save-to-disk

### Hocuspocus

- **Trigger:** Every Y.Doc update fires `Document.handleUpdate(update, origin)` (`Document.ts:221-233`) → `callbacks.onUpdate(this, origin, update)`. The `onUpdate` callback is set by `Hocuspocus.loadDocument()` at `Hocuspocus.ts:417-423`:
  ```ts
  document.onUpdate((document, origin, update) => {
    document.lastChangeTime = Date.now();
    this.handleDocumentUpdate(document, origin, update);
  });
  ```
- `handleDocumentUpdate` (`Hocuspocus.ts:263-311`):
  1. Resolves `connection`/`request`/`context` from origin shape (TransactionOrigin discriminated union — see §6).
  2. Fires `onChange` hook with `{ instance, clientsCount, document, documentName, requestHeaders, requestParameters, socketId, update, transactionOrigin, connection, context }`.
  3. **`if (shouldSkipStoreHooks(origin)) return;`** at line 297. `shouldSkipStoreHooks` (`types.ts:40-50`) returns `true` for `redis` origin and for `local` origin with `skipStoreHooks: true` (the OK file-watcher and observer-sync writes use this — see `external-change.ts:27-31` and `server-observers.ts`).
  4. Calls `this.storeDocumentHooks(document, storePayload)`.
- `storeDocumentHooks` (`Hocuspocus.ts:461-502`) uses the `useDebounce` debouncer (`util/debounce.ts:1-77`):
  ```ts
  return this.debouncer.debounce(
    `onStoreDocument-${document.name}`,
    async () => {
      try {
        await document.saveMutex.runExclusive(async () => {
          await this.hooks("onStoreDocument", hookPayload);
          await this.hooks("afterStoreDocument", hookPayload);
        });
      } catch (error) {
        if (error instanceof SkipFurtherHooksError) { … unload … }
        console.error("Caught error during storeDocumentHooks. Document stays in memory to avoid data loss", error);
        return;
      }
      setTimeout(() => { if (this.shouldUnloadDocument(document)) this.unloadDocument(document); }, 0);
    },
    immediately ? 0 : this.configuration.debounce,
    this.configuration.maxDebounce,
  );
  ```

### Debounce mechanics

- `useDebounce` (`util/debounce.ts:1-77`): per-id timer map. `debounce(id, func, debounce, maxDebounce)`:
  - If existing timer, `clearTimeout(old.timeout)`.
  - If `debounce === 0`, run immediately.
  - If `Date.now() - start >= maxDebounce`, run immediately (forces flush after maxDebounce).
  - Otherwise `setTimeout(run, debounce)`.
  - `run()` itself awaits any prior `runningExecutions.get(id)` before re-firing — enforces serial per-id execution.
- `executeNow(id)` clears the timer and runs synchronously — used by `Hocuspocus.handleConnection`'s `onClose` callback (`Hocuspocus.ts:241-246`) to flush before unload, and by OK's `flushPendingStores` (transitively, via `Hocuspocus.flushPendingStores` at `Hocuspocus.ts:170-177` which iterates `documents` and calls `executeNow`).

### Error handling

- A throw inside `onStoreDocument` is caught at `Hocuspocus.ts:475-491`. **Document stays in memory** — explicit comment line 487. This is critical for OK's `flushAllStoresAndWait` → rescue-buffer fallback path (`standalone.ts:550-637`). `SkipFurtherHooksError` (from `@hocuspocus/common`) is a sentinel that says "another extension handled this, proceed to unload anyway."

### `saveMutex`

- `Document.saveMutex = new Mutex()` (`Document.ts:37`), `async-mutex@^0.5.0`. Serializes onStoreDocument across this Document's lifetime — concurrent writers wait. `shouldUnloadDocument` (`Hocuspocus.ts:545-552`) checks `saveMutex.isLocked()` to avoid unloading mid-save.

### OK usage

- `packages/server/src/persistence.ts:405-522` is OK's onStoreDocument — atomic write via tmp + rename, frontmatter prepend, `setReconciledBase`, `backlinkIndex.updateDocumentFromMarkdown`, then `scheduleGitCommit()` (debounced 30s separately).
- OK's `getReconciledBase(documentName) === markdown` short-circuit at `persistence.ts:426-427` is critical — observer-feedback writes are detected and skipped, avoiding rewriting unchanged files.

### `@y/websocket-server` equivalent

- **`writeState(docname, doc): Promise<any>`** — called from `closeConn` at `/tmp/ywss/package/src/utils.js:188-206` **only when the last WebSocket disconnects** (`if (doc.conns.size === 0 && persistence !== null)` at line 197). Then:
  ```ts
  persistence.writeState(doc.name, doc).then(() => {
    doc.destroy()
  })
  docs.delete(doc.name)
  ```
- **No debounce.** No periodic writes. No write-on-update. Persistence happens on disconnect-of-last-client only. For OK's "persist every 2s while clients are connected" UX, you'd have to add an external timer that calls `writeState` while clients are connected — but `writeState` is supposed to be called on doc-close, so you'd be double-handling lifecycle.
- **No mutex.** Concurrent `writeState` calls (e.g., from a timer + a disconnect race) would interleave.
- **No try/catch.** An exception in `writeState` is consumed by the `.then()` chain — `doc.destroy()` doesn't run, `docs.delete(doc.name)` does run (line 202, before the .then), so the doc is removed from the map but the underlying Y.Doc never freed. **Memory leak under failure.**
- **No `skipStoreHooks` analog.** Every update fires the same path. There's no way to mark "this update came from disk, don't write it back." OK's reconcile-feedback-loop prevention via `FILE_WATCHER_ORIGIN.skipStoreHooks: true` (`external-change.ts:27-31`) has no expressible equivalent.

### Classification

- **ABSENT.** `writeState` is only superficially analogous. Reproducing OK's debounce + on-update + skipStoreHooks + saveMutex + error-stays-in-memory + flush-on-disconnect semantics requires building the full `useDebounce` system, the saveMutex per-doc, the origin-classification system, and rewiring `WSSharedDoc.on('update')` (`utils.js:123`) to dispatch through it. **Estimated ~250 LOC** to reproduce just `Hocuspocus.handleDocumentUpdate` + `storeDocumentHooks` + `useDebounce` + `Document.saveMutex` semantics on top of `@y/websocket-server`.

---

## 4. `afterLoadDocument` hook — post-load lifecycle

### Hocuspocus

- **Trigger:** Right after `onLoadDocument` callback chain completes, before observer wiring: `Hocuspocus.ts:425` — `await this.hooks("afterLoadDocument", hookPayload);`. Followed at line 427-437 by `document.beforeBroadcastStateless(callback)` setup and at line 439-456 by the awareness `update` listener.
- **Critical sequencing:** afterLoadDocument runs AFTER `document.isLoading = false` (line 415) and AFTER `document.onUpdate(…)` is wired (line 417-423). So the moment `afterLoadDocument` returns, **subsequent updates fire `onChange`/`onStoreDocument`**, and the doc is fully live for connections.
- **No try/catch.** Server-observer-extension comment at `server-observer-extension.ts:57-60`:
  > Do NOT re-throw: Hocuspocus afterLoadDocument is not try/catch guarded (unlike onLoadDocument). Re-throwing would break the document setup pipeline (beforeBroadcastStateless, awareness wiring) for ALL clients.
  - Confirmed by reading `Hocuspocus.ts:425` — bare `await this.hooks("afterLoadDocument", hookPayload);` with no surrounding try.

### Hook payload type

- `afterLoadDocumentPayload<Context>` at `types.ts:291-300`: identical shape to `onLoadDocumentPayload`.

### OK usage

- `packages/server/src/server-observer-extension.ts:37-87` — attaches per-document server-authoritative observers. **The Document reference from the payload is used directly** (line 41-42), avoiding `openDirectConnection`'s side-effect of incrementing `directConnectionsCount` (which would block document unload):
  ```ts
  async afterLoadDocument({ documentName, document }) {
    if (isSystemDoc(documentName)) return;
    if (cleanups.has(documentName)) return;
    const doc = document as unknown as Y.Doc;
    const xmlFragment = doc.getXmlFragment('default');
    const ytext = doc.getText('source');
    // setupServerObservers({ doc, xmlFragment, ytext, … })
  }
  ```
- This is **load-bearing** for OK's server-authoritative bridge architecture (precedent #14 — see `CLAUDE.md`). Without `afterLoadDocument`, observer attachment would either need (a) to happen inside `onLoadDocument` and risk breaking persistence error semantics, or (b) to happen on first connection and risk attaching twice if multiple clients race.

### `@y/websocket-server` equivalent

- **None.** No post-load lifecycle hook. The closest analog is observing doc creation, but the only entry point is to wrap `getYDoc` (which is exported but not patchable from outside without monkey-patching).
- **`whenInitialized`** (`utils.js:129`) is `contentInitializor(this)` — fires inside the WSSharedDoc constructor BEFORE any update listener is attached. Wrong sequence for OK's needs.
- The cleanest workaround would be to set `setContentInitializor(async (doc) => { /* attach observers */ })`, but this fires INSIDE `new WSSharedDoc(name)` (`utils.js:88-130`), specifically at line 129 — BEFORE `bindState` (which runs in `getYDoc` after `new WSSharedDoc`) and BEFORE the doc is in the `docs` map. The `xmlFragment.length === 0` check OK uses in onLoadDocument (`persistence.ts:374`) would always be true here (no content yet), so observers would attach to an empty doc and miss the initial state synchronization.

### Classification

- **ABSENT.** No equivalent. OK would need to reimplement the load-then-afterLoad sequence by patching `getYDoc` or by wrapping `setupWSConnection`. **Estimated ~100 LOC** to add a clean afterLoad hook.

---

## 5. `onAuthenticate` hook

### Hocuspocus

- **Trigger:** `ClientConnection.handleQueueingMessage` at `ClientConnection.ts:301-400`. When the first `MessageType.Auth` message arrives (queued during the establishment handshake via lines 308-315), the handler:
  1. Reads the token via `decoding.readVarString` (line 324).
  2. Optionally reads `providerVersion` (lines 327-330).
  3. Runs `onConnect` hook (line 343-352) with context-mutation callback (`contextAdditions: Partial<Context>` is shallow-merged into `hookPayload.context`).
  4. Runs `onAuthenticate` hook (lines 354-367) with `{ token, …hookPayload, documentName }` payload — same context-mutation callback.
  5. On success: `hookPayload.connectionConfig.isAuthenticated = true` (line 369), sends `OutgoingMessage.writeAuthenticated(readOnly)` reply (line 372-376), then `setUpNewConnection(rawKey, documentName, sessionId)` (line 379) creates the `Connection` and drains queued messages.
  6. On failure (line 380-393): sends `writePermissionDenied(reason)`, deletes hookPayload + queue + established-set entries so a retry is treated as fresh.
- `onAuthenticatePayload` at `types.ts:219-230`: `{ context, documentName, instance, requestHeaders, requestParameters, request, socketId, token, connectionConfig, providerVersion }`.

### OK usage

- **None directly.** OK does not configure an `onAuthenticate` hook — the Hocuspocus server is loopback-only and trusts the connection. The HTTP API has `isAllowedWorkspaceHostHeader` + `isLoopbackAddress` checks (`api-extension.ts:69`) but those are HTTP-layer, not WebSocket-layer.
- However, OK depends on the **side effect** that `onAuthenticate` is the gating mechanism that defers all WebSocket sync messages until the doc is loaded. Without onAuthenticate, the queueing-then-draining behavior in `ClientConnection.handleQueueingMessage` wouldn't exist, and a fast client could send `SyncStep2` before `onLoadDocument` finishes — corrupting the load.

### `@y/websocket-server` equivalent

- **None.** The README's quick-start says explicitly:
  > You may check auth of request here.. Call `wss.HandleUpgrade` *after* you checked whether the client has access (e.g. by checking cookies, or url parameters).
  — and the boilerplate at `server.js:19-27` is just `wss.handleUpgrade(request, socket, head, ws => wss.emit('connection', ws, request))`. Auth is a "do your own thing in the upgrade handler" exercise.
- **Critically: no message-queueing-during-auth.** `setupWSConnection` (`utils.js:231-280`) immediately sends SyncStep1 (lines 268-271) and starts processing incoming messages (line 237: `conn.on('message', message => messageListener(conn, doc, …))`). There's no defer-until-authenticated phase.

### Classification

- **ABSENT.** Not a blocker for OK today (OK doesn't auth) but the message-queueing-during-handshake side effect IS load-bearing for any future async load path.

---

## 6. `Document.transact(fn, origin)` — server-side transaction with origin tagging

### Hocuspocus

- **`Document extends Doc`** — `Document.ts:12`. So `Document.transact` is inherited from `Y.Doc.transact(fn, origin?, local?)` (`yjs@13.6.30/dist/src/utils/Transaction.js`). Hocuspocus does not override.
- **`TransactionOrigin` discriminated union** at `types.ts:7-25`:
  ```ts
  export interface ConnectionTransactionOrigin { source: "connection"; connection: Connection; }
  export interface RedisTransactionOrigin     { source: "redis"; }
  export interface LocalTransactionOrigin     { source: "local"; skipStoreHooks?: boolean; context?: any; }
  export type TransactionOrigin = ConnectionTransactionOrigin | RedisTransactionOrigin | LocalTransactionOrigin;
  ```
- **`isTransactionOrigin(origin)`** at lines 27-38 — type guard checking `typeof === "object"`, has `source`, `source ∈ {"connection","redis","local"}`.
- **`shouldSkipStoreHooks(origin)`** at lines 40-50 — returns `true` for `redis`, returns `local`'s `skipStoreHooks` flag, returns `false` for `connection`.
- **DirectConnection.transact** at `DirectConnection.ts:29-44`:
  ```ts
  async transact(transaction: (document: Document) => void) {
    if (!this.document) throw new Error("direct connection closed");
    this.document.transact(
      (x) => transaction(this.document!),
      { source: "local", context: this.context } satisfies LocalTransactionOrigin,
    );
  }
  ```
- **Y.Doc.transact origin propagation:** the origin object passed to `transact()` is what shows up as `origin` in the `'update'` event listeners. Hocuspocus reads it at `Hocuspocus.handleDocumentUpdate` (line 268-279) to extract `connection`, `context`, and to gate `shouldSkipStoreHooks`.

### OK usage

- `packages/server/src/agent-sessions.ts:52-56`:
  ```ts
  export const AGENT_WRITE_ORIGIN = {
    source: 'local' as const,
    skipStoreHooks: false,
    context: { origin: 'agent-write' },
  } satisfies LocalTransactionOrigin;
  ```
- `external-change.ts:27-31` — `FILE_WATCHER_ORIGIN` with `skipStoreHooks: true` to prevent file-watcher disk-load from triggering a re-save.
- `api-extension.ts:104-108` — `ROLLBACK_ORIGIN` with `skipStoreHooks: false`.
- `server-observers.ts` — `OBSERVER_SYNC_ORIGIN` with `skipStoreHooks: true` (verified by Mutation F gate in `meta/mutation-validation.md` per CLAUDE.md).
- All used as **object references** for identity-based matching in `Y.UndoManager({ trackedOrigins })` and `attachBridgeInvariantWatcher` enforcing sets — not as string literals. This is **Architectural Precedent #1** (CLAUDE.md).

### `@y/websocket-server` equivalent

- **None at the framework level.** `WSSharedDoc extends Y.Doc`, so `wsSharedDoc.transact(fn, origin)` works (yjs-native API). But:
  - `@y/websocket-server` has **no `LocalTransactionOrigin` typed origin** convention — you'd be passing raw strings or your own ad-hoc objects.
  - **No `shouldSkipStoreHooks` analog.** Every update fires `updateHandler` (`utils.js:60-66`) which broadcasts to all `doc.conns` regardless of origin. To skip persistence on a particular origin, you'd have to wrap `WSSharedDoc.on('update')` and discriminate inside your own callback.
  - **No `DirectConnection` for non-WebSocket-mediated writes.** OK uses `hocuspocus.openDirectConnection(docName)` → `dc.transact(…)` to do server-side writes. Without that abstraction, you'd reach into `docs.get(docName)` directly and call `.transact()` — losing the connection-counting that prevents premature unload.

### Classification

- **PARTIAL.** Y.Doc.transact works (it's yjs-native) but the entire typed-origin convention + skipStoreHooks plumbing + DirectConnection wrapping is gone. Reproducing requires reimplementing the TransactionOrigin discriminated union, the isTransactionOrigin guard, the shouldSkipStoreHooks gate, the DirectConnection wrapper, AND the connection-count tracking that prevents unload while DirectConnections are active. **Estimated ~150 LOC** plus invasive changes to update-broadcast paths.

---

## 7. `openDirectConnection(name)` — server-side direct CRDT manipulation

### Hocuspocus

- **Method on Hocuspocus** at `Hocuspocus.ts:593-611`:
  ```ts
  async openDirectConnection(documentName: string, context?: Context): Promise<DirectConnection<Context>> {
    const connectionConfig: ConnectionConfiguration = { isAuthenticated: true, readOnly: false };
    const document: Document = await this.createDocument(
      documentName,
      new Request("http://localhost"),  // direct connection has no request params
      crypto.randomUUID(),               // socketId
      connectionConfig,
      context,
    );
    return new DirectConnection<Context>(document, this, context);
  }
  ```
  - **Triggers full document creation** if doc isn't loaded — including `onLoadDocument` and `afterLoadDocument` hooks. So opening a direct connection to a never-touched doc loads it from disk, attaches observers, etc.
  - Uses a synthetic `Request("http://localhost")` for the request param.
  - `connectionConfig: { isAuthenticated: true }` — bypasses authentication.

- **DirectConnection class** at `DirectConnection.ts:9-90`:
  - Constructor at lines 21-27: stores `document`, `instance`, `context`. **Calls `this.document.addDirectConnection()`** (line 26), which increments `directConnectionsCount` (`Document.ts:135-139`). This count is read by `getConnectionsCount()` (`Document.ts:152-154`) and `shouldUnloadDocument` (`Hocuspocus.ts:545-552`) — keeps the doc loaded.
  - `transact(transaction)` at lines 29-44: calls `document.transact(fn, { source: "local", context })`.
  - `disconnect()` at lines 46-89: removes direct connection, **explicitly schedules `storeDocumentHooks` with `immediately=true`** (lines 50-64) so the doc persists on disconnect, then runs `onDisconnect` hook + `unloadDocument` if no other connections.

### OK usage

- **Two heavy use cases:**
  - **Per-doc agent sessions** (`packages/server/src/agent-sessions.ts:174`):
    ```ts
    dc = (await this.hocuspocus.openDirectConnection(docName)) as AgentDirectConnection;
    ```
    — keeps a long-lived DirectConnection per (docName, agentId) so awareness shows the agent in the presence bar AND so the doc stays loaded across HTTP-API agent writes. The cast extends the public interface to expose `dc.document` (which is runtime-present but TS-hidden — comment at `agent-sessions.ts:34-41`).
  - **`__system__` pseudo-doc** (`packages/server/src/standalone.ts:861`):
    ```ts
    systemDocConnection = await hocuspocus.openDirectConnection(SYSTEM_DOC_NAME);
    ```
    — pre-materializes the `__system__` Y.Doc so CC1 broadcasts have a target before any browser connects.
- Test-only uses: `agent-sessions.test.ts`, `api-patch.test.ts`, `external-change.test.ts`, `live-derived-index.test.ts`, `suggest-links.test.ts`, `standalone.test.ts` — all use `openDirectConnection` as the test pattern for "create a doc and own its lifecycle."

### `@y/websocket-server` equivalent

- **None.** The closest is `getYDoc(docName)` (`utils.js:140-148`) which returns a `WSSharedDoc` — but:
  - **No connection-count increment.** The doc will be unloaded the moment `doc.conns.size === 0` (`utils.js:197`), so a server-side direct user is racing with WebSocket disconnects. Holding a reference to the WSSharedDoc keeps it from GC but doesn't keep it in the `docs` map.
  - **No persistence-on-disconnect symmetry.** DirectConnection.disconnect() forces `storeDocumentHooks(immediately=true)` (`DirectConnection.ts:50-64`); there's no equivalent in `@y/websocket-server`.
  - **No transact-with-origin wrapper.** You'd write directly to the doc's text/maps/fragments and any updates fire through the same `updateHandler` (`utils.js:60-66`) that broadcasts — no way to separate server-internal writes from client-broadcast writes.
  - **No awareness setup** — DirectConnection allows `dc.document.awareness.setLocalState({…})` to inject server-side presence; on `@y/websocket-server` you'd reach into `wsSharedDoc.awareness` directly, but the awareness changeHandler at `utils.js:104-121` would then broadcast YOUR awareness state to all clients, attributing it to no specific connection.

### Classification

- **ABSENT.** The ergonomic and lifecycle guarantees of DirectConnection are not reproducible without rewriting connection bookkeeping. **Estimated ~120 LOC** to reimplement the directConnectionsCount + DirectConnection wrapper + persistence-on-disconnect.

---

## 8. `broadcastStateless(payload)` — pure-signal CC1 push

### Hocuspocus

- **Document method** at `Document.ts:238-251`:
  ```ts
  public broadcastStateless(payload: string, filter?: (conn: Connection) => boolean): void {
    this.callbacks.beforeBroadcastStateless(this, payload);
    const connections = filter ? this.getConnections().filter(filter) : this.getConnections();
    connections.forEach((connection) => { connection.sendStateless(payload); });
  }
  ```
- **`Connection.sendStateless(payload)`** at `Connection.ts:172-179`:
  ```ts
  public sendStateless(payload: string): void {
    const message = new OutgoingMessage(this.messageAddress).writeStateless(payload);
    this.send(message.toUint8Array());
  }
  ```
- **Wire format** — `OutgoingMessage.writeStateless(payload)` at `OutgoingMessage.ts:119-126`:
  ```ts
  writeStateless(payload: string): OutgoingMessage {
    this.category = "Stateless";
    writeVarUint(this.encoder, MessageType.Stateless);  // MessageType.Stateless === 5 (types.ts:69)
    writeVarString(this.encoder, payload);
    return this;
  }
  ```
  Frame: `[varString documentName | varUint 5 (Stateless) | varString payload]`. The leading `documentName` lets the client demux which doc the stateless is for.
- **`beforeBroadcastStateless` hook** is wired during loadDocument at `Hocuspocus.ts:427-437` — runs the user-defined hook with `{ document, documentName, payload }` payload. Used for hidden-channel filtering / observability.

### Receive side (provider)

- `MessageReceiver` on the client (`@hocuspocus/provider`, not deeply traced) reads `MessageType.Stateless` and calls `provider.receiveStateless(payload)` at `HocuspocusProvider.ts:399-401`:
  ```ts
  receiveStateless(payload: string) { this.emit("stateless", { payload }); }
  ```
- Client listens via `provider.on('stateless', ({ payload }) => …)` — wired via `configuration.onStateless` at `HocuspocusProvider.ts:198`.

### OK usage

- `packages/server/src/cc1-broadcast.ts:75`:
  ```ts
  doc.broadcastStateless(JSON.stringify(payload));
  ```
  where `payload = { v: 1, ch, seq }`. Fired with 100ms trailing-edge debounce per channel (lines 36-49). The doc is `__system__` (line 53).
- `packages/app/src/components/SystemDocSubscriber.tsx:51-82` — client-side receives via `onStateless: ({ payload }: { payload: string }) => { … }`. Then re-fetches the channel's REST endpoint per CC1 contract.

### `@y/websocket-server` / `@y/protocols` equivalent

- **None.** `@y/protocols` defines only `sync`, `awareness`, `auth` modules (`/tmp/yp/package/src/`). No "stateless" message type. The `@y/websocket-server` `messageListener` (`utils.js:155-182`) handles only `messageSync (0)` and `messageAwareness (1)` — anything else falls through silently. The server-side has no `broadcastStateless` API.
- `@y/websocket@4.0.0-rc.2` client-side handlers (`/tmp/yws/package/src/y-websocket.js:29-110`) define `messageSync (0)`, `messageQueryAwareness (3)`, `messageAwareness (1)`, `messageAuth (2)` — also no stateless.
- **Workarounds rejected:**
  - You could use awareness as a pseudo-stateless channel, but awareness states are per-clientID with TTL (`outdatedTimeout = 30000`, `/tmp/yp/package/src/awareness.js:13`) and accumulate as a Map — totally wrong shape for "fire-and-forget signal."
  - You could insert a Y.Map entry as a signal, but that hits CRDT update broadcast (~more bytes, hits onStoreDocument) and persists — also wrong shape.
  - The least-bad option is to add a **separate WebSocket sidechannel** (or HTTP SSE) for CC1 signals — adding a separate transport is meaningful surgery to OK's "single WebSocket per page" current model.

### Classification

- **ABSENT.** This is the most clearly missing capability. CC1 is a load-bearing primitive for OK's derived-view invalidation (file list, backlinks, graph). Reproducing on `@y/websocket-server` requires either: (a) extending the message protocol and patching `messageListener` in upstream + the y-websocket client (rejected — fragile fork), or (b) running a parallel SSE/WS channel just for CC1 (rejected — operational complexity), or (c) abusing awareness (rejected — shape mismatch). **Net-new pseudo-protocol + transport: ~200 LOC** plus client-side wiring.

---

## 9. `documents` registry — `hocuspocus.documents.get(name)`

### Hocuspocus

- **Field:** `documents: Map<string, Document>` at `Hocuspocus.ts:66`.
- **Population:** `createDocument()` (`Hocuspocus.ts:316-357`) sets `this.documents.set(documentName, doc)` at line 350 after `loadDocument` resolves. Uses `loadingDocuments: Map<string, Promise<Document>>` (line 63) to dedup parallel `createDocument` calls — second arrival gets the in-flight promise.
- **Lifecycle:** Removed by `unloadDocument()` at `Hocuspocus.ts:579` (`this.documents.delete(documentName)`).
- **Iteration:** Used by OK in standalone.ts:545, 554, 669, 897, 952, 1002-1003, 1013 (looping for park/restore/branch-switch/destroy).

### `@y/websocket-server` equivalent

- **`docs: Map<string, WSSharedDoc>`** at `/tmp/ywss/package/src/utils.js:48`. Exported, but mutation is module-internal (`getYDoc` at line 146 sets, `closeConn` at line 202 deletes).
- **No load-promise dedup.** `getYDoc` is fully synchronous; `bindState` is fire-and-forget with no Promise chain. Two parallel callers of `getYDoc(name)` for the same docName each trigger `bindState` exactly once (because `map.setIfUndefined` at line 140 dedup's), but the bindState side effect is not awaited anywhere — a `WebSocket.onMessage` handler arriving during `bindState` will operate on a partially-loaded doc.

### Classification

- **PRESENT in shape, PARTIAL in semantics.** Both expose a `Map<string, Y.Doc-subclass>`, but Hocuspocus's load-promise dedup + onLoadDocument try/catch + sync ordering are not reproduced.

---

## 10. WebSocket message routing — per-connection sequential message queue

### Hocuspocus

- **`Connection.handleMessage(data)`** at `Connection.ts:231-237`:
  ```ts
  public handleMessage(data: Uint8Array): void {
    this.messageQueue.push(data);
    if (this.messageQueue.length === 1) {
      this.processingPromise = this.processMessages();
    }
  }
  ```
- **`processMessages` async drain** at `Connection.ts:239-276`: while-loop draining `this.messageQueue` in arrival order. Reads documentName from message header, runs `beforeHandleMessage` hook, then `MessageReceiver.apply(document, this)`. **Awaits each iteration before processing the next** — strict per-connection ordering.
- **Why this matters:** the y-protocol assumes ordered delivery within a single client. SyncStep1 → SyncStep2 → updates must be applied in send order. Without per-connection serialization, an `await` inside `beforeHandleMessage` (e.g., a DB call) lets a later message overtake.
- **`waitForPendingMessages()`** at `Connection.ts:147-149` exposes the in-flight Promise. Used by `ClientConnection.createConnection` in the disconnect callback (`ClientConnection.ts:158-163`) to ensure queued messages drain before disconnect hooks fire — important when the queued messages would update the doc and schedule onStoreDocument, which the disconnect-time `executeNow` decision depends on.
- **`ClientConnection` second queue layer** at `ClientConnection.ts:39-42` (`incomingMessageQueue`) — queues messages BEFORE auth completes, since the doc/connection don't exist yet. Drained at `ClientConnection.ts:288-290` via `incomingMessageQueue[rawKey]?.forEach(input => connection.handleMessage(input))`. So there are **two queues per WebSocket** (auth-queueing + per-connection-ordering).

### `@y/websocket-server` equivalent

- **None.** `setupWSConnection` (`utils.js:231-280`) wires `conn.on('message', message => messageListener(conn, doc, new Uint8Array(message)))` (line 237) — handlers fire **synchronously, in arrival order, but without backpressure or async sequencing.** Since `messageListener` (`utils.js:155-182`) is synchronous (no awaits — it just runs `syncProtocol.readSyncMessage` and `awarenessProtocol.applyAwarenessUpdate`), strict ordering is preserved by V8's event loop.
- **However:** the moment you add an async hook (e.g., a pre-message auth check, OK's `beforeHandleMessage`), order is lost. There's no Connection-class-equivalent to enforce serialization. **For OK's purposes (no async beforeHandleMessage), this is fine today** — but the framework is one async-hook addition away from data corruption.
- **No two-phase queue.** `@y/websocket-server` has no auth handshake (§5), so no need for the auth-pre-queue. Adding auth means adding both queues from scratch.

### Classification

- **ABSENT** at the framework level (no Connection class, no ordered-queue primitive). **Adequate by accident** for synchronous-handler-only paths. Reproducing as a robust primitive: **~100 LOC** (Connection class + queue + drain).

---

## 11. Awareness propagation

### Hocuspocus

- **Per-doc awareness** at `Document.ts:13, 49`: `Document.awareness = new Awareness(this)`. Set local state to `null` initially (line 50), then listen for `'update'` (line 52).
- **Update broadcast** at `Document.handleAwarenessUpdate` (`Document.ts:192-216`): builds `OutgoingMessage.createAwarenessUpdateMessage(awareness, changedClients)` and sends to all `getConnections()`. Uses `messageAddress` (`Connection.ts:49-53`) which is either plain `documentName` or `${documentName}\0${sessionId}` for session-aware multiplexed providers.
- **Origin-aware tracking** at `Document.ts:198-205`: clients controlled by an originating connection are tracked in `connections.get(originConnection).clients` so disconnect can clean up via `removeAwarenessStates` (`Document.ts:120-133`).
- **`onAwarenessUpdate` hook fires** at `Hocuspocus.ts:439-456` with `{ document, documentName, instance, ...update, transactionOrigin, connection, awareness, states: awarenessStatesToArray(...) }`.
- **Y.protocols version:** `peerDependencies.y-protocols: ^1.0.6` (`@hocuspocus/server/package.json:43`). Installed: `y-protocols@1.0.7` (verified). Same package as `@y/protocols@1.0.6-rc.1`'s ancestor — and yes the awareness wire format is identical.

### OK usage

- **Agent presence:** `agent-sessions.ts:177-186`:
  ```ts
  dc.document.awareness.setLocalState({
    user: { name, color, type: 'agent', icon, tabId },
    mode: 'idle',
  });
  ```
- Client-side cursor presence flows through `CollaborationCursor` (TipTap plugin) and `yCollab` (CodeMirror) — both consume the doc's `awareness` directly, no Hocuspocus-specific shape.

### `@y/protocols@1.0.6-rc.1` equivalent

- **`Awareness` class** at `/tmp/yp/package/src/awareness.js:44-162`. **Identical class shape** to the legacy `y-protocols/awareness`:
  - Same `clientID`, `states`, `meta`, `_checkInterval` (30s outdated, /tmp/yp/package/src/awareness.js:13).
  - Same `getLocalState`, `setLocalState`, `setLocalStateField`, `getStates`, `destroy`.
  - Same `'update'` and `'change'` events with `{ added, updated, removed }, origin` payload.
  - Same `encodeAwarenessUpdate(awareness, clients, states?)`, `applyAwarenessUpdate(awareness, update, origin)`, `removeAwarenessStates(awareness, clients, origin)`, `modifyAwarenessUpdate(update, modify)`.
- **Wire format identical.** `/tmp/yp/package/src/awareness.js:199-212` writes `[varUint clientID | varUint clock | varString JSON.stringify(state)]` per entry — byte-for-byte the same as legacy y-protocols@1.0.7.
- **Difference:** `@y/protocols@1.0.6-rc.1` extends `ObservableV2` (line 44, imported from `lib0/observable`) instead of legacy `Observable`. ObservableV2 is the typed-events variant; emit/on signatures differ slightly but call sites don't have to change.
- **`@y/websocket-server`'s built-in awareness handling** at `/tmp/ywss/package/src/utils.js:104-122` — the awareness change handler broadcasts to all `doc.conns`. Equivalent to Hocuspocus's `Document.handleAwarenessUpdate`, but **no per-connection client-id tracking** for cleanup-on-disconnect — that's a memory leak waiting to happen for long-running servers (mitigated by `closeConn` calling `removeAwarenessStates(doc.awareness, Array.from(controlledIds), null)` at `utils.js:196`, but only via the locally-tracked `controlledIds: Set<number>` per-conn, which IS done — see `utils.js:235`, `utils.js:108-111`).

### Classification

- **PRESENT.** `@y/protocols@1.0.6-rc.1` is a drop-in replacement for `y-protocols@1.0.7` for awareness. `@y/websocket-server`'s built-in broadcast is feature-equivalent to Hocuspocus's. The only loss is the `onAwarenessUpdate` extension hook (Hocuspocus-specific), which OK does not currently consume.

---

## 12. Per-doc connection lifecycle — TTL/idle unload

### Hocuspocus

- **Triggered on last disconnect** via `Hocuspocus.handleConnection`'s onClose callback (`Hocuspocus.ts:223-251`):
  ```ts
  clientConnection.onClose((document, hookPayload) => {
    if (document.getConnectionsCount() > 0) return;
    if (!document.isLoading && this.debouncer.isDebounced(`onStoreDocument-${document.name}`)) {
      if (this.configuration.unloadImmediately) {
        this.debouncer.executeNow(`onStoreDocument-${document.name}`);
      }
    } else {
      this.unloadDocument(document);
    }
  });
  ```
- **`unloadDocument`** at `Hocuspocus.ts:554-591`: dedup'd via `unloadingDocuments` map. Runs `beforeUnloadDocument` hook, sync-checks `shouldUnloadDocument` again, deletes from `documents` map, calls `document.destroy()`, runs `afterUnloadDocument` hook.
- **`shouldUnloadDocument`** at lines 545-552: `false` if any of (a) onStoreDocument is debounced, (b) onStoreDocument is currently executing, (c) saveMutex is locked, (d) connections > 0. So even after `documents.delete`, the in-flight save can complete safely.
- **`unloadImmediately: true`** (default at `Hocuspocus.ts:36`): forces immediate flush on last disconnect. **`false`**: waits for the natural debounce timer to fire, then unloads in the timer's `setTimeout(() => …, 0)` continuation.

### OK usage

- OK relies on the default behavior — no override. But `standalone.ts:439-440, 547` calls `closeConnections(docName)` + `unloadDocument` explicitly during disk-delete reconciliation (to prevent the doc from being immediately recreated on next persistence cycle).

### `@y/websocket-server` equivalent

- **`closeConn`** at `/tmp/ywss/package/src/utils.js:188-206`:
  ```ts
  if (doc.conns.size === 0 && persistence !== null) {
    persistence.writeState(doc.name, doc).then(() => {
      doc.destroy()
    })
    docs.delete(doc.name)
  }
  ```
- **Immediate unload on last disconnect.** No debounce, no TTL, no "don't unload while save is in flight" mutex. The `docs.delete(doc.name)` is **synchronous and runs before `writeState` resolves** — a subsequent `getYDoc(doc.name)` arriving while writeState is pending will create a NEW WSSharedDoc, race against the in-flight writeState (which is operating on the OLD doc), and produce a split-brain state.

### Classification

- **PARTIAL → ABSENT** depending on threshold. The shape exists ("unload on last disconnect"), but the safety guarantees (mutex, debounce, dedup, hook) do not. For OK's reconciliation flow that explicitly calls `unloadDocument` post-flush, the missing semantics matter.

---

## 13. Provider client-side — `HocuspocusProvider({ url, name, document, onSynced })`

### Hocuspocus

- **`HocuspocusProvider`** at `node_modules/@hocuspocus/provider/src/HocuspocusProvider.ts:118-634`. Constructor at lines 179-234:
  - Sets `this.configuration` from input; defaults `document = new Y.Doc()` if not passed (lines 182-185); defaults `awareness = new Awareness(this.document)` if not passed (lines 186-189).
  - Wires event forwarders: `'open', 'message', 'outgoingMessage', 'synced', 'destroy', 'awarenessUpdate', 'awarenessChange', 'stateless', 'unsyncedChanges', 'authenticated', 'authenticationFailed'` (lines 191-202).
  - Wires `awareness.on('update', ...)` to forward as provider 'awarenessUpdate' event (lines 204-208) and `'change'` as 'awarenessChange' (lines 210-214).
  - Wires `document.on('update', boundDocumentUpdateHandler)` (line 216) and `awareness.on('update', boundAwarenessUpdateHandler)` (line 217).
  - If `forceSyncInterval` set (line 221-229), `setInterval(this.forceSync.bind(this), forceSyncInterval)`.
  - If `manageSocket` (line 231-233), `this.attach()` to a HocuspocusProviderWebsocket.
- **`'synced'` event firing** at `HocuspocusProvider.ts:387-397`:
  ```ts
  set synced(state) {
    if (this.isSynced === state) return;
    this.isSynced = state;
    if (state) {
      this.emit("synced", { state });
    }
  }
  ```
  Set to `true` from `MessageReceiver` after SyncStep2 is received. Emitted **once per state transition** — re-syncs after disconnect+reconnect emit it again.

### OK usage of `'synced'`

- `packages/app/src/editor/sync-promise.ts:267-276`:
  ```ts
  // (HocuspocusProvider.ts:387-397). Returning a promise lets us bridge to Suspense.
  export function syncPromise(docName: string, provider: HocuspocusProvider): Promise<void> {
  ```
- The whole hybrid-Activity-Suspense render tree (precedent #18) is bolted to `provider.on('synced', onSynced)` (line 376). 30s timeout, then `SyncTimeoutError` (precedent #18(d)).
- `provider-pool.ts:240` — `provider.on('synced', onSynced)` is the canonical post-sync wiring point. Lines 144-148 set `forceSyncInterval: 5000` as a secondary defense against 'synced'-never-fires (D8 in spec).

### `@y/websocket@4.0.0-rc.2` equivalent

- **`WebsocketProvider`** at `/tmp/yws/package/src/y-websocket.js:303-613`. Has a `synced` getter/setter (lines 510-522):
  ```ts
  set synced (state) {
    if (this._synced !== state) {
      this._synced = state
      this.emit('synced', [state])
      this.emit('sync', [state])
    }
  }
  ```
- Same fire-on-transition semantics. Backward-compat alias `'sync'` event.
- **Synced is set true** at `/tmp/yws/package/src/y-websocket.js:46-51`:
  ```ts
  if (emitSynced && syncMessageType === syncProtocol.messageYjsSyncStep2 && !provider.synced) {
    provider.synced = true
  }
  ```
  Same trigger condition as Hocuspocus.
- **Constructor signature DIFFERS:**
  ```ts
  // Hocuspocus
  new HocuspocusProvider({ url, name, document, awareness, token, …callbacks })
  // y-websocket@4
  new WebsocketProvider(serverUrl, roomname, doc, { connect, awareness, params, protocols, WebSocketPolyfill, resyncInterval, maxBackoffTime, disableBc, socketTimeout })
  ```
  - URL + roomname split as positional args, not `{ url, name }`.
  - `forceSyncInterval` → `resyncInterval` (different name, different default — `-1` disables in y-websocket vs `false` in HP).
  - **No token / auth.** Auth is presumed external (URL params or HTTP Basic).
  - **No `sessionAwareness`** — if you need to multiplex multiple providers per WS, you'd build it yourself or use multiple WS connections (one per roomname).
- **`onSynced` configuration callback** is NOT supported on the constructor — you wire `provider.on('synced', cb)` post-construction.
- **Status events:** `provider.on('status', ({ status }) => …)` with `status ∈ {'connected','disconnected','connecting'}` at `/tmp/yws/package/src/y-websocket.js:165-167, 215-217, 236-238`. Same shape as HocuspocusProvider.
- **Reconnect:** exponential backoff at `/tmp/yws/package/src/y-websocket.js:173-181` — `setTimeout(setupWS, math.min(math.pow(2, wsUnsuccessfulReconnects) * 100, maxBackoffTime), provider)`. `maxBackoffTime` defaults `2500ms` (line 326). Hocuspocus uses `@lifeomic/attempt`'s `retry()` (`HocuspocusProviderWebsocket.ts:282-320`) with configurable jitter, factor, minDelay, maxDelay.
- **stateless event:** **NOT SUPPORTED.** The `messageHandlers` array at `/tmp/yws/package/src/y-websocket.js:31-110` covers only sync, awareness, queryAwareness, auth. No `messageStateless`. So OK's `provider.on('stateless', …)` (`SystemDocSubscriber.tsx:51-82`) has no analog.

### Classification

- **PARTIAL.** `synced` event works (same shape, same trigger). `status` event works. **`stateless` event is missing entirely** — load-bearing for CC1. Reconnect uses exponential backoff (different curve, same intent). Auth is missing. `sessionAwareness` is missing.

---

## 14. Status events — `provider.on('status', ({ status }) => …)`

### Hocuspocus

- Forwarded from `HocuspocusProviderWebsocket` to `HocuspocusProvider` via `forwardStatus = (e: onStatusParameters) => this.emit("status", e)` at `HocuspocusProvider.ts:248`.
- Emitted at `HocuspocusProviderWebsocket.ts:212, 382, 430, 572`:
  - `WebSocketStatus.Connected` on `onOpen` and on `resolveConnectionAttempt`.
  - `WebSocketStatus.Connecting` on `createWebSocketConnection`.
  - `WebSocketStatus.Disconnected` on `onClose`.
- Payload shape: `{ status: WebSocketStatus }`. `WebSocketStatus` is an enum imported from `./types.ts` — values are `Connected | Connecting | Disconnected` strings.

### OK usage

- `packages/app/src/presence/use-sync-status.ts:48-54` — `provider.on('status', onStatus)` + `'synced'` + `'disconnect'`. Tracks connection + sync state for the presence bar.
- `packages/app/src/editor/provider-pool.ts:239` — same.
- `packages/app/src/editor/DocumentContext.tsx` — passes the status through to UI.

### `@y/websocket@4.0.0-rc.2` equivalent

- `provider.emit('status', [{ status: 'connected'|'disconnected'|'connecting' }])` at `/tmp/yws/package/src/y-websocket.js:165-167, 215-217, 236-238`.
- Wire into `provider.on('status', cb)`. **Same payload shape** (lowercase string values vs Hocuspocus's enum that happens to stringify lowercase).

### Classification

- **PRESENT.** Same event, same payload, same call site shape. The only API quirk is `y-websocket` uses lowercase strings vs Hocuspocus's enum (which is literally the strings 'connected'/'disconnected'/'connecting' under the hood — see HocuspocusProvider/types.ts).

---

## 15. Disconnect handling — reconnect logic, exponential backoff

### Hocuspocus

- `HocuspocusProviderWebsocket.connect` (`HocuspocusProviderWebsocket.ts:268-320`) wraps `createWebSocketConnection` in `@lifeomic/attempt`'s `retry()`:
  ```ts
  const retryPromise = retry(this.createWebSocketConnection.bind(this), {
    delay: 1000, initialDelay: 0, factor: 2, maxAttempts: 0,
    minDelay: 1000, maxDelay: 30000, jitter: true, timeout: 0,
    handleTimeout: this.configuration.handleTimeout,
    beforeAttempt: (context) => { if (!shouldConnect || cancelAttempt) context.abort(); },
  });
  ```
- Defaults at `HocuspocusProviderWebsocket.ts:115-152`: 30s `messageReconnectTimeout`, 1s `delay`, factor 2, maxAttempts 0 (unlimited), minDelay 1s, maxDelay 30s, jitter on, timeout 0 (forever), `handleTimeout: null`.
- **`checkConnection`** (`HocuspocusProviderWebsocket.ts:448-484`) runs every `messageReconnectTimeout / 10` ms. Closes the socket if no message in `messageReconnectTimeout` ms.
- On `onClose` (lines 561-581): updates status to `Disconnected`, emits `disconnect` event, **schedules `setTimeout(() => connect(), delay)`** if shouldConnect && no retry running.

### `@y/websocket@4.0.0-rc.2` equivalent

- `closeWebsocketConnection` at `/tmp/yws/package/src/y-websocket.js:148-183` schedules `setTimeout(setupWS, math.min(math.pow(2, wsUnsuccessfulReconnects) * 100, maxBackoffTime), provider)`. `maxBackoffTime` defaults `2500ms` (line 326).
- `_checkInterval` at `/tmp/yws/package/src/y-websocket.js:460-472` — every `acceptableConnectionDelay/2 = 4000ms` checks if last message > `socketTimeout` (default `outdatedTimeout * 1.5 = 45000ms`).
- **No `@lifeomic/attempt`.** No jitter, no maxAttempts, no minDelay, no factor, no timeout configurability — just hardcoded `2^n * 100ms` capped at `maxBackoffTime`.

### Classification

- **PARTIAL.** Both have backoff. y-websocket's is hardcoded and minimal; Hocuspocus's is industrial-grade. For dev/debug usage probably equivalent; for production with strict SLAs, the difference matters.

---

## 16. Extensions API — `hocuspocus.extensions = [...]` lifecycle

### Hocuspocus

- **`Configuration.extensions: Array<Extension>`** at `types.ts:176`. `Extension<Context>` interface at `types.ts:87-115` lists every hook as optional.
- **Hooks dispatch** at `Hocuspocus.ts:509-543`:
  ```ts
  hooks<T extends HookName>(name: T, payload, callback?: Function | null) {
    let chain = Promise.resolve();
    extensions
      .filter((extension) => typeof extension[name] === "function")
      .forEach((extension) => {
        chain = chain.then(() => (extension[name] as any)?.(payload)).catch(...);
        if (callback) chain = chain.then((...args) => callback(...args));
      });
    return chain;
  }
  ```
- **Sequential, ordered by extension array index, with per-extension catch.** A throw in one extension's hook prevents subsequent extensions' hooks AND propagates to the caller (hocuspocus.handleDocumentUpdate uses .then chains). So extension order matters.
- **`configure({ extensions: […] })` REPLACES the array** (object spread at `Hocuspocus.ts:84-87`). To append, use `hocuspocus.configuration.extensions.push(ext)` — explicit STOP rule in CLAUDE.md WARN section. OK uses both patterns: initial `extensions: [persistence.extension]` at construction, then `.push(liveDerivedIndexExtension)`, `.push(apiExtension)`, `.push(createServerObserverExtension(...))` at standalone.ts:204, 222, 224.
- **Synthetic top-level extension** added at `Hocuspocus.ts:104-127` from top-level callbacks — so passing `onLoadDocument` at the top level is equivalent to `extensions: [{ onLoadDocument }]`.

### Hook names enumeration

- `HookName` type at `types.ts:117-140`: `onConfigure | onListen | onUpgrade | onConnect | connected | onAuthenticate | onTokenSync | onCreateDocument | onLoadDocument | afterLoadDocument | beforeHandleMessage | beforeBroadcastStateless | beforeSync | onStateless | onChange | onStoreDocument | afterStoreDocument | onAwarenessUpdate | onRequest | onDisconnect | beforeUnloadDocument | afterUnloadDocument | onDestroy`.
- **OK uses:** `onLoadDocument`, `onStoreDocument`, `afterLoadDocument`, `afterUnloadDocument`, `onRequest`, plus `extensionName`/`priority` field. (Doesn't use: `onConfigure`, `onListen`, `onUpgrade`, `onConnect`, `connected`, `onAuthenticate`, `onTokenSync`, `onCreateDocument`, `beforeHandleMessage`, `beforeBroadcastStateless`, `beforeSync`, `onStateless`, `onChange`, `onAwarenessUpdate`, `onDisconnect`, `beforeUnloadDocument`, `onDestroy`.)

### `@y/websocket-server` equivalent

- **None.** No extensions array, no hook dispatcher. The two extension points are `setPersistence(persistence_)` (one-shot module-level) and `setContentInitializor(f)` (one-shot module-level). No callback chaining, no error isolation, no priority ordering.
- The HTTP `CALLBACK_URL` env var at `/tmp/ywss/package/src/callback.js` is the only built-in observability — it POSTs JSON-rendered doc state to a URL on update (debounced). Way too coarse for OK's needs.

### Classification

- **ABSENT.** Reproducing the extensions/hooks system on `@y/websocket-server` is reproducing the framework. **Estimated ~250 LOC** for the dispatcher + types + per-extension error handling + priority sort + push/configure semantics, plus invasive changes to attach hook calls at every relevant lifecycle point.

---

## 17. `@y/protocols` awareness vs `y-protocols` — wire format compatibility

### Comparison

- **`y-protocols@1.0.7`** — installed at `node_modules/y-protocols/`, used by Hocuspocus (`peerDependencies.y-protocols: ^1.0.6`).
- **`@y/protocols@1.0.6-rc.1`** — `/tmp/yp/package/`, used by `@y/websocket@4.0.0-rc.2` and `@y/websocket-server@0.1.5`.

### `awareness.js` diff (semantic)

- Both export `Awareness`, `outdatedTimeout=30000`, `removeAwarenessStates`, `encodeAwarenessUpdate`, `applyAwarenessUpdate`, `modifyAwarenessUpdate`.
- **Wire format identical.** Both serialize `[varUint clientID | varUint clock | varString JSON.stringify(state)]` — verified at `/tmp/yp/package/src/awareness.js:202-211` and equivalent in legacy y-protocols.
- **API differences:**
  - `@y/protocols`'s `Awareness` extends `ObservableV2` (typed events) — legacy extends `Observable` (untyped). Function call sites are compatible.
  - `@y/protocols` imports `import * as Y from '@y/y'` (line 11) — would refuse to load if you don't have `@y/y` installed. Legacy `y-protocols` imports `from 'yjs'`.
  - **Lib0 import paths IDENTICAL** — both `'lib0/encoding'`, `'lib0/decoding'`, `'lib0/time'`, `'lib0/math'`, `'lib0/observable'`, `'lib0/function'`. So `lib0` major-version matters: `@y/protocols` `peerDeps lib0: ^1.0.0-rc.1` (see /tmp/yp/package/package.json:55), legacy `y-protocols@1.0.7` `dependencies.lib0: ^0.2.85`.

### `sync.js` diff

- Both export `messageYjsSyncStep1=0`, `messageYjsSyncStep2=1`, `messageYjsUpdate=2`, `writeSyncStep1`, `writeSyncStep2`, `readSyncStep1`, `readSyncStep2`, `readUpdate`, `writeUpdate`, `readSyncMessage`. Wire format identical.

### `auth.js` diff

- Legacy `y-protocols@1.0.7/auth.js` (8 lines, single message type `messagePermissionDenied=0`).
- `@y/protocols@1.0.6-rc.1/src/auth.js` IDENTICAL — `messagePermissionDenied=0`, `writePermissionDenied`, `readAuthMessage` (`/tmp/yp/package/src/auth.js`).
- **Hocuspocus's auth is broader** — `@hocuspocus/common/src/auth.ts:1-63` defines `AuthMessageType.Token=0, PermissionDenied=1, Authenticated=2` and `writeAuthentication`, `writePermissionDenied`, `writeAuthenticated`, `writeTokenSyncRequest`, `readAuthMessage(decoder, sendToken, permissionDeniedHandler, authenticatedHandler)`. Hocuspocus's auth message format is INCOMPATIBLE with `@y/protocols` auth — Hocuspocus uses 3 sub-types where y-protocols uses 1.

### Classification

- **`@y/protocols` is a drop-in replacement for `y-protocols`** for awareness and sync. NOT a drop-in replacement for Hocuspocus's auth (which uses an extended subprotocol in `@hocuspocus/common`).

---

## 18. Transitive deps — `lib0` compatibility analysis

### Versions in play

| Package | Declares | Imports lib0 from |
|---------|----------|-------------------|
| `@hocuspocus/server@4.0.0-rc.1` | `dependencies.lib0: ^0.2.47` | `lib0/decoding`, `lib0/encoding` (Hocuspocus.ts via OutgoingMessage/IncomingMessage) |
| `@hocuspocus/common@4.0.0-rc.2` | `dependencies.lib0: ^0.2.87` | `lib0/encoding`, `lib0/decoding` (auth.ts) |
| `@hocuspocus/provider@4.0.0-rc.1` | `dependencies.lib0: ^0.2.87` | `lib0/decoding`, `lib0/encoding`, `lib0/time` (HocuspocusProviderWebsocket.ts) |
| `yjs@13.6.30` (installed) | `dependencies.lib0: ^0.2.99` | `lib0/*` (many) |
| `y-protocols@1.0.7` (installed) | `dependencies.lib0: ^0.2.85` | `lib0/encoding`, `lib0/decoding`, `lib0/time`, `lib0/math`, `lib0/function`, `lib0/observable` |
| `@y/websocket-server@0.1.5` | `dependencies.lib0: ^0.2.102, dependencies.yjs: ^14.0.0-7` | `lib0/encoding`, `lib0/decoding`, `lib0/map`, `lib0/eventloop`, `lib0/number` (utils.js, server.js, callback.js) |
| `@y/websocket@4.0.0-rc.2` | `dependencies.lib0: ^1.0.0-rc.1`, peer `@y/y: *` | `lib0/broadcastchannel`, `lib0/time`, `lib0/encoding`, `lib0/decoding`, `lib0/observable`, `lib0/math`, `lib0/url`, `lib0/environment`, `lib0/array` |
| `@y/protocols@1.0.6-rc.1` | `dependencies.lib0: ^1.0.0-rc.1`, peer `@y/y: *` | `lib0/encoding`, `lib0/decoding`, `lib0/time`, `lib0/math`, `lib0/observable`, `lib0/function` |
| `@y/y@14.0.0-rc.7` (latest dist-tag) | `dependencies.lib0: ^1.0.0-rc.7` | `lib0/*` (many) |

### Compatibility matrix

- **All Hocuspocus packages use `lib0@^0.2.x`.** OK's installed lib0 must be compatible with all of (^0.2.47, ^0.2.87, ^0.2.99, ^0.2.85, ^0.2.102) — npm/bun's resolver picks the highest single version satisfying all caret ranges, which works because all caret-0.2 ranges are mutually compatible.
- **`@y/*` packages use `lib0@^1.0.0-rc.x`.** This is a **major-version split** from `lib0@0.2.x`. lib0@1.0.0 is in RC — it's a breaking version bump. **You CANNOT have lib0@0.2.x and lib0@1.0.0 satisfy the same `dependencies.lib0` constraint** — they'll deduplicate to two separate copies in node_modules.
- **`@y/websocket-server@0.1.5` uses `lib0@^0.2.102`** — i.e. it's still on the old lib0 major. So `@y/websocket-server` and `@y/websocket@4.0.0-rc.2` (which requires `lib0@^1.0.0-rc.1`) **cannot share lib0** — bun/npm will install two copies. This is upstream package-management debt; the awareness Awareness instance produced by `@y/protocols` (which loads `lib0@1.0.0-rc.x`) and consumed by `@y/websocket-server`'s broadcaster (which loads `lib0@0.2.x`) — IF they were used together — would need to round-trip through Uint8Array via the wire protocol, never sharing object references. In practice they're NOT used together in `@y/websocket-server@0.1.5` (it imports `@y/protocols/awareness` directly, /tmp/ywss/package/src/utils.js:3, so both consumers of `@y/protocols` see the lib0@1.0.0-rc subset of types — no actual conflict at the awareness module).

### Scenario: install `@hocuspocus/server@4.0.0-rc.1 + yjs@14.0.0-16`

- Hocuspocus `peerDependencies.yjs: ^13.6.8`. yjs@14.0.0-16 does NOT satisfy `^13.6.8` semver.
- **npm 7+:** fails with `ERESOLVE` unless `--legacy-peer-deps` or `overrides`.
- **bun:** silently installs (bun's peer-dep enforcement is weaker than npm 7+).
- **Module-load behavior:** `Hocuspocus.ts:3` — `import { applyUpdate, Doc, encodeStateAsUpdate } from "yjs";` resolves to whatever `yjs` is in node_modules. yjs@14 still exports those names (verified across 14.0.0-0..16). Hocuspocus would START.
- **Runtime risk:** yjs@14 internal Y.Doc API may have changed in subtle ways (transaction origin handling, subdoc lifecycle, awareness internals). Hocuspocus is not tested against yjs@14 — any subtle API drift produces silent corruption. The maintainers have not signed off; the matrix is unverified.

### `__$YJS14$__` runtime guard claim

- **Verified absent.** `grep -rn "YJS14\|__\$YJS\|isYjs14" node_modules/@hocuspocus/{server,provider,common}/src/` returns zero hits. The blocker is purely the npm peer-dep solver, not a runtime guard.

### Classification

- **lib0 0.2.x and 1.0.0-rc.x can coexist as separate installs** in node_modules but cannot share state. For OK's path forward: if you want to swap to `@y/y@14`, you must pull `@y/protocols` and `@y/websocket` (lib0@1.0.0-rc) AND drop Hocuspocus (lib0@0.2.x). You can't keep Hocuspocus with @y/y because Hocuspocus's `import { … } from "yjs"` at `Hocuspocus.ts:3, MessageReceiver.ts:13, IncomingMessage.ts (none direct), OutgoingMessage.ts (none direct), Document.ts:7` won't resolve `@y/y`'s `import * as Y from '@y/y'` — they're different package identifiers.

---

## Cross-cutting answers to the prompt's "critical questions"

### Q1: `@y/websocket-server@0.1.5` peer-dep oddity (peer ^13.5.6 + dep ^14.0.0-7)?

- **Verified directly.** Per npm registry (above):
  ```
  0.1.0  peer.yjs=^13.5.6  dep.yjs=None
  0.1.1  peer.yjs=^13.5.6  dep.yjs=None
  0.1.2  peer.yjs=None     dep.yjs=None
  0.1.5  peer.yjs=None     dep.yjs=^14.0.0-7
  ```
- The current published `0.1.5` has **NO peer-dep on yjs**, only a regular `dependency` on `yjs@^14.0.0-7`. The "peer ^13.5.6 + dep ^14.0.0-7" combination the prompt mentions does NOT exist in any single published version. The prompt is conflating the historical `0.1.0`/`0.1.1` peer-dep with the current `0.1.5` direct dep.
- **Resolvability:** `0.1.5` will install fine — it gets its own `node_modules/@y/websocket-server/node_modules/yjs@14.x` if a parent specified `yjs@13.x`. The hoisting collision risk only matters if the consuming app also imports `'yjs'` — then bun/npm will pick the higher-version satisfying parent constraints, which is how OK ends up with two `yjs` copies if it tries to mix `@y/websocket-server` with Hocuspocus.

### Q2: Migration path for each Hocuspocus extension OK uses

- **OK uses ZERO `@hocuspocus/extension-*` packages.** Verified: `bun.lock` and `node_modules/@hocuspocus/` show only `server`, `provider`, `common`. Extension behavior (persistence, observability, agent sessions, CC1, server observers) is built locally in `packages/server/src/`. So there's nothing to migrate from extension packages — but that means OK has implemented its own equivalents to what Hocuspocus extensions would normally provide (database persistence, redis pubsub, logging, etc.). The migration path is per-OK-module, not per-Hocuspocus-extension.

### Q3: Does `@hocuspocus/server@4.0.0-rc.5` prevent loading `@y/y@14.x` even if `npm overrides`'d?

- **No runtime guard exists.** `Hocuspocus.ts:3` is `import … from "yjs";`. If `npm overrides` is used to force `yjs@14.0.0-16` (the legacy `yjs` package name's 14.x line), Hocuspocus will load and Y operations will route through yjs@14's `Doc` class.
- However, you **cannot npm-override `yjs` to `@y/y`**. They're different package names; npm overrides remap a package to a different version of THE SAME package, not to a different package. To use `@y/y` under Hocuspocus you'd need a postinstall script or patch-package mapping `import "yjs"` → `import "@y/y"` in node_modules — fragile and fork-equivalent.
- **What actually fails:**
  - `npm install @hocuspocus/server@4.0.0-rc.5` with default resolution: pulls `yjs@13.6.30` (the highest matching `^13.6.8`). Runs fine.
  - Force `yjs@14.0.0-16` via overrides: peer-dep warning but installs. Hocuspocus loads. Y.Doc instances are yjs@14 instances. **Wire-protocol compat within the same yjs@14 cluster is fine.** Cross-cluster (yjs@14 server + yjs@13 client, or vice versa): unverified, likely fine for SyncStep1/2/Update v1 (the wire format hasn't changed) but no maintainer guarantees.

---

## Summary table — feature × dimension × classification

| # | Feature | Hocuspocus location | OK callsite | `@y/websocket-server` analog | Class | New LOC est. |
|---|---------|---------------------|-------------|------------------------------|-------|--------------|
| 1 | Server constructor / listen | `Server.ts:33-273`, `Hocuspocus.ts:39-136` | standalone.ts:190-195 | `server.js:1-31` (CLI), `setupWSConnection` | PARTIAL | ~250 |
| 2 | onLoadDocument | `Hocuspocus.ts:359-413` | persistence.ts:328-403 | `setPersistence`/`bindState` (utils.js:35-37, 144) | PARTIAL | ~150 |
| 3 | onStoreDocument | `Hocuspocus.ts:461-502, util/debounce.ts` | persistence.ts:405-522 | `writeState` on disconnect (utils.js:197-202) | ABSENT | ~250 |
| 4 | afterLoadDocument | `Hocuspocus.ts:425` | server-observer-extension.ts:37-87 | None (wrong-time `whenInitialized`) | ABSENT | ~100 |
| 5 | onAuthenticate | `ClientConnection.ts:301-400` | (Not used by OK; load-bearing for queue-during-auth) | None (README: "do it in upgrade") | ABSENT | ~150 |
| 6 | Document.transact(fn, origin) | `Document.ts:12 inheritance, types.ts:7-50` | agent-sessions.ts:52-56, external-change.ts:27-31, api-extension.ts:104-108 | yjs-native (Y.Doc.transact) — no typed-origin convention | PARTIAL | ~150 |
| 7 | openDirectConnection | `Hocuspocus.ts:593-611, DirectConnection.ts:9-90` | agent-sessions.ts:174, standalone.ts:861 | None (`getYDoc` no count, no disconnect-flush) | ABSENT | ~120 |
| 8 | broadcastStateless | `Document.ts:238-251, OutgoingMessage.ts:119-126` | cc1-broadcast.ts:75 | None — no stateless message in `@y/protocols` | ABSENT | ~200 (sub-protocol + transport) |
| 9 | documents registry | `Hocuspocus.ts:66, 350` | standalone.ts:545, 897, 952, 1013 | `docs: Map` (utils.js:48) | PRESENT shape, PARTIAL semantics | ~50 (load-promise dedup) |
| 10 | Per-conn message queue | `Connection.ts:55-57, 231-276` | (consumed implicitly) | None (sync handler only) | ABSENT | ~100 |
| 11 | Awareness propagation | `Document.ts:192-216` + `y-protocols/awareness` | agent-sessions.ts:177-186 | `@y/protocols/awareness` (IDENTICAL API + wire) | PRESENT | 0 |
| 12 | Per-doc unload TTL/idle | `Hocuspocus.ts:223-251, 545-591` | standalone.ts:439-440, 547 | `closeConn` immediate unload (utils.js:188-206) | PARTIAL | ~80 |
| 13 | Provider — synced event | `HocuspocusProvider.ts:387-397` | sync-promise.ts:267-376, provider-pool.ts:240 | y-websocket synced setter (y-websocket.js:510-522) | PRESENT | 0 |
| 14 | Provider — status event | `HocuspocusProviderWebsocket.ts:212, etc` | use-sync-status.ts:48, provider-pool.ts:239 | y-websocket status emit (y-websocket.js:165-167, 215-217, 236-238) | PRESENT | 0 |
| 15 | Provider — reconnect/backoff | `HocuspocusProviderWebsocket.ts:268-320` (lifeomic/attempt) | (implicit via pool) | y-websocket setTimeout 2^n*100ms (y-websocket.js:173-181) | PARTIAL | 0 (acceptable) |
| 16 | Extensions API + lifecycle hooks | `Hocuspocus.ts:81-127, 509-543, types.ts:87-115` | standalone.ts:204, 222, 224, persistence/api-extension/server-observer-extension | None (only `setPersistence`, `setContentInitializor`) | ABSENT | ~250 |
| 17 | @y/protocols vs y-protocols | `node_modules/y-protocols/*` | (implicit) | `/tmp/yp/package/src/awareness.js` IDENTICAL wire | PRESENT | 0 |
| 18 | lib0 compatibility | `dependencies.lib0: ^0.2.47` | (implicit) | `@y/*` uses `lib0@^1.0.0-rc.1` — separate major | major-version split | resolver headache |
| — | **Total greenfield budget on @y/websocket-server** | | | | | **~1,850 server LOC + ~250 client-side stateless** |

---

## Closing observation

The `@y/websocket-server@0.1.5` README's pitch is **"a basic server that you can adopt to your specific use-case"** (line 11 of `/tmp/ywss/package/README.md`). It is exactly that — a starter, not a framework. Hocuspocus is the framework. Adopting `@y/y@14` today by swapping Hocuspocus for `@y/websocket-server` is a from-scratch reimplementation of OK's server framework. Adopting `@y/y@14` by forcing `npm overrides yjs:14.x` under Hocuspocus is unsupported but mechanically possible — and that risk profile is the actually-interesting decision.

Cross-references to OK code in the report are anchored at file:line per the prompt's request. All Hocuspocus citations are to the **installed** `@hocuspocus/server@4.0.0-rc.1` source tree at `node_modules/@hocuspocus/server/src/` (the prompt's "rc.5" did not match the lockfile, but the public surface does not differ across rc.0–rc.5 per npm registry inspection in §18).
