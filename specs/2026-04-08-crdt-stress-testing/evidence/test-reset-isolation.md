---
topic: /api/test-reset cleanup semantics
sources:
  - init_spike/src/server/hocuspocus-plugin.ts (L119-144, L398-420)
  - ~/.claude/oss-repos/hocuspocus/packages/server/src/Hocuspocus.ts (L545-588 — unloadDocument / shouldUnloadDocument)
verified_at: 2026-04-08
verified_by: code read + audit M2 correction
---

# What `/api/test-reset` actually cleans up

> **⚠️ CORRECTION 2026-04-08 (audit M2):** Earlier version of this file claimed "full state reset — doc is unloaded." That is INCOMPLETE. Hocuspocus's `unloadDocument` early-returns silently if `shouldUnloadDocument()` returns false, which it does whenever there is pending debounced `onStoreDocument` work, any currently-executing persistence task, or a locked `saveMutex`. With our config `debounce: 2000`, any agent write within 2 seconds before `/api/test-reset` leaves pending debounced work → unload is skipped → server's Y.Doc stays loaded with prior state. Next request hits the still-loaded doc and observes pre-reset content. **The stress suite requires D18 (force-flush patch) to fix this.**

## Cleanup sequence

On `POST /api/test-reset`, the server does:

1. **`closeAllAgentSessions()`** — iterates all entries in `agentSessions` Map
   - For each: destroys `UndoManager` (via `um.destroy()`)
   - Removes from `agentUndoManagers` Map
   - Sets awareness `setLocalState(null)` (broadcasts departure)
   - `dc.disconnect()` (closes DirectConnection)
   - Removes from `agentSessions` Map
2. **`hocuspocus.closeConnections('test-doc')`** — closes all WebSocket clients for the doc
3. **`hocuspocus.unloadDocument(doc)`** — if the doc exists, unloads it (releases Y.Doc memory, triggers onStoreDocument once more before unload)
4. **File reset** — writes empty string to `content/test-doc.md`
5. **Responds `{ ok: true }`**

## What this gives us (when unload actually runs)

- Full Y.Doc state reset (because the doc is unloaded; next access re-creates from disk — which is now empty)
- Server-side `UndoManager` stack cleared (destroyed with the session)
- Awareness broadcasts cleared (for any connected clients)
- Browser clients forced to disconnect and re-sync on next request

## ⚠️ The race condition we missed (M2)

`shouldUnloadDocument` at `Hocuspocus.ts:545-552`:

```ts
shouldUnloadDocument(document: Document): boolean {
  const hasPendingWork =
    this.debouncer.isDebounced(`onStoreDocument-${document.name}`) ||
    this.debouncer.isCurrentlyExecuting(`onStoreDocument-${document.name}`) ||
    document.saveMutex.isLocked();
  return hasPendingWork === false && document.getConnectionsCount() === 0;
}
```

`unloadDocument` at `Hocuspocus.ts:557` silently early-returns if `shouldUnloadDocument` is false. Our plugin config uses `debounce: 2000, maxDebounce: 10000` — any agent write triggers a 2-second debounced persistence task. If `/api/test-reset` fires within that 2s window, `hasPendingWork === true` → `shouldUnloadDocument === false` → `unloadDocument` early-returns → the server's Y.Doc stays loaded with prior state. The test-reset handler still writes `''` to the content file, but the **in-memory** state is untouched.

## Required fix (D18)

Patch `/api/test-reset` handler in `hocuspocus-plugin.ts` to force-flush pending debounced work BEFORE calling `unloadDocument`:

```ts
// In /api/test-reset handler, before the existing unloadDocument call:
if (hocuspocus.debouncer.isDebounced(`onStoreDocument-test-doc`)) {
  hocuspocus.debouncer.executeNow(`onStoreDocument-test-doc`);
}
await hocuspocus.unloadDocument(doc);
```

Or poll `hocuspocus.documents.has('test-doc') === false` after calling unload until it actually releases.

## What it does NOT do

- **Doc name is hardcoded to `'test-doc'`** — if the stress suite used different doc names, test-reset wouldn't clean them up.
- **Does not reset `content/` directory beyond `test-doc.md`** — other content files are untouched.
- **Does not close non-agent WebSocket clients from other docs** (only `closeConnections('test-doc')`).

## Implications for stress tests

- **Use `'test-doc'` as the single stress doc name** — test-reset can fully clean it between scenarios.
- **Call test-reset at the START of every scenario** — not just between scenarios. Ensures clean slate even if previous run left detritus (e.g., dev server crashed mid-test).
- **Multi-doc stress is OUT OF SCOPE for this spec** (already deferred per NG3). If we ever need it, test-reset needs a `?doc=...` query param.
- **For the Playwright E2E**, test-reset must be called BEFORE the browser loads the page, otherwise the client will be disconnected mid-session and see stale state.
