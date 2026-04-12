---
"@inkeep/open-knowledge": patch
---

fix: eliminate silent data loss on graceful shutdown

`createServer().destroy()` had two compounding bugs that could silently drop up to 10 seconds of user typing on every Ctrl+C / SIGTERM:

1. `hocuspocus.flushPendingStores()` is fire-and-forget (`void` return) — awaiting it awaited nothing
2. The L2 git-commit flush ran before L1 markdown drain, so it drained an empty queue

The fix adds a `flushAllStoresAndWait()` helper that installs a one-shot `afterUnloadDocument` extension hook (the same pattern `@hocuspocus/server`'s own `Server.destroy()` uses internally), reorders destroy phases correctly (watchers → sessions → L1 drain → L2 git → shadow repo release), and adds a cached-Promise idempotency guard so concurrent shutdown signals (e.g., SIGINT + SIGTERM) share a single teardown. A configurable `destroyTimeoutMs` (default 10s) bounds the flush to prevent hangs from misbehaving `onStoreDocument` hooks. Structured shutdown logs are emitted on every exit. If the L1 flush hits its timeout ceiling, each still-loaded document's in-memory Y.Doc is dumped to `<shadow-gitDir>/rescue/<docName>.md` (best-effort per document) so the user can recover edits via the existing `GET /api/rescue` and `GET /api/rescue/:docName` endpoints, even when `onStoreDocument` itself is hung.
